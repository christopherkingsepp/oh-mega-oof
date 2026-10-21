// POST /api/checkout — salvestab tellimuse ja loob Stripe Checkout'i makselehe.
//
// Brauser saadab: { items:[{id,qty}], code, customer:{name,email,phone},
//   shipping:{carrier, lockerId, lockerName, lockerAddress, lockerCity?, manual?}, ageConfirmed, termsAccepted, newsletter }
// Vastus: 200 { url, orderNumber, token, expiresAt, warnings? }
//         4xx/5xx { error, field?, shortages? }
//
// Voog:
//   1) valideerimine (_lib/order.mjs) + lubatud vedaja (ENABLED_CARRIERS)
//   2) laoseisu kontroll (komplektid lahti võetuna; ainult mängud, millel on laoseis seatud) → 409
//   3) tellimus andmebaasi (payment_status 'pending'; read, summad ja tarne hetktõmmisena) — number
//      ÄGE-AAAA-NNNN antakse siin ja jääb püsivaks. Stripe'i testvõtme (sk_test_/rk_test_) või
//      näidisrežiimi korral on see testtellimus TEST-ÄGE-AAAA-NNNN (ei muuda laoseisu ega statistikat).
//   4) Stripe Checkout Session (metadata.order_id, client_reference_id, aegub 60 min pärast)
//   5) sessiooni id/url/aegumine tellimuse juurde → kliendile makselehe URL
// Makse tulemus jõuab tellimusse webhooki kaudu (stripe-webhook.mjs), mitte brauserist.
//
// Turvalisus: hinnad, soodustus ja tarne arvutatakse AINULT serveris ühisest kataloogist
// (public/assets/js/catalog.js). Kliendi saadetud summasid ei loeta.
// Vajalikud keskkonnamuutujad: STRIPE_SECRET_KEY, NETLIFY_DATABASE_URL (vt .env.example).
import { json, readTextLimited } from './_lib/http.mjs';
import { validateOrder } from './_lib/order.mjs';
import { buildSessionParams, ensureCoupon, forgetCoupon, resolveOrigin } from './_lib/stripe-session.mjs';
import { resolveStripe, defaultStripeFactory } from './_lib/stripe-client.mjs';
import { getDb } from './_lib/db.mjs';
import { checkAvailability, shortageMessage, createOrder, attachCheckoutSession, markFailed, toIso } from './_lib/orders.mjs';
import { findCachedLocker, readLockerCache } from './_lib/lockers.mjs';
import { SHIPPING } from '../../public/assets/js/catalog.js';
import { enabledCarriers, enabledCarrierNames } from './_lib/config.mjs';

export const MAX_BODY_BYTES = 20 * 1024;
/** Makselehe kehtivus. Stripe lubab 30 minutit kuni 24 tundi. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

const MSG_NOT_CONFIGURED = 'Makse pole veel seadistatud. Võta meiega ühendust.';
const MSG_STRIPE_FAILED = 'Makset ei õnnestunud alustada. Proovi uuesti.';
const MSG_BAD_JSON = 'Vigane päring. Värskenda lehte ja proovi uuesti.';
const MSG_TOO_LARGE = 'Päring on liiga suur. Värskenda lehte ja proovi uuesti.';
const MSG_BAD_TYPE = 'Vigane päring (oodati JSON-i). Värskenda lehte ja proovi uuesti.';
const MSG_DB_MISSING = 'Tellimuste vastuvõtt on hetkel ajutiselt peatatud. Proovi hiljem uuesti või kirjuta meile.';
const MSG_DB_FAILED = 'Tellimust ei õnnestunud salvestada. Proovi mõne hetke pärast uuesti.';

/** Logime ainult vea tehnilised andmed — mitte kliendi isikuandmeid. */
function logStripeError(logger, stage, err) {
  logger.error(`[checkout] Stripe viga (${stage}):`, {
    type: err?.type,
    code: err?.code,
    statusCode: err?.statusCode,
    message: err?.message,
    requestId: err?.requestId,
  });
}

function logDbError(logger, stage, err) {
  logger.error(`[checkout] andmebaasi viga (${stage}):`, { code: err?.code, message: err?.message });
}

/**
 * Loob käsitleja. Testides saab süstida võlts-Stripe'i (stripeFactory), env-i ja andmebaasi.
 * @param {{stripeFactory?:(key:string)=>any, env?:object, logger?:Console, couponCache?:Set<string>,
 *          getDb?:()=>Promise<object>, now?:()=>number}} deps
 */
export function createHandler({
  stripeFactory = defaultStripeFactory,
  env = process.env,
  logger = console,
  couponCache,
  getDb: getDbImpl = () => getDb(env),
  now = Date.now,
} = {}) {
  return async function checkoutHandler(req, context = {}) {
    if (req.method !== 'POST') {
      return json(405, { error: 'Lubatud on ainult POST-päring.' }, { Allow: 'POST' });
    }

    if (!/application\/json/i.test(req.headers.get('content-type') || '')) {
      return json(415, { error: MSG_BAD_TYPE });
    }

    // 1) Loe ja parsi keha (max ~20 KB; suuremat ei loeta isegi mällu).
    let body;
    try {
      const { text, tooLarge } = await readTextLimited(req, MAX_BODY_BYTES);
      if (tooLarge) return json(413, { error: MSG_TOO_LARGE });
      body = JSON.parse(text);
    } catch {
      return json(400, { error: MSG_BAD_JSON });
    }

    // 2) Valideeri kõik serveris.
    const result = validateOrder(body);
    if (!result.ok) return json(400, { error: result.error, ...(result.field ? { field: result.field } : {}) });
    const { order } = result;

    if (!enabledCarriers(env, logger).includes(order.shipping.carrier)) {
      return json(400, {
        error: `Selle vedajaga praegu tellida ei saa. Vali ${enabledCarrierNames(env)} pakiautomaat.`,
        field: 'shipping.carrier',
      });
    }

    // 3) Stripe'i võti (enne andmebaasi, et seadistamata poes ei tekiks pooleli tellimusi).
    const resolved = resolveStripe(env, { stripeFactory });
    if (resolved.error) {
      if (resolved.error === 'init') logStripeError(logger, 'init', { message: resolved.detail });
      else logger.error(`[checkout] ${resolved.detail}`);
      return json(500, { error: MSG_NOT_CONFIGURED });
    }
    const { stripe } = resolved;

    // 4) Andmebaas.
    let db;
    try {
      db = await getDbImpl();
    } catch (err) {
      if (err?.code === 'DB_NOT_CONFIGURED') {
        logger.error('[checkout] Andmebaas pole seadistatud — lisa Netlify DB (NETLIFY_DATABASE_URL), vt JUHEND.md.');
        return json(503, { error: MSG_DB_MISSING });
      }
      logDbError(logger, 'connect', err);
      return json(503, { error: MSG_DB_FAILED });
    }

    // 5) Laoseis (komplektid lahti võetuna).
    try {
      const availability = await checkAvailability(db, order.items);
      if (!availability.ok) {
        return json(409, {
          error: shortageMessage(availability.shortages),
          field: 'items',
          shortages: availability.shortages.map(({ id, name, available }) => ({ id, name, available })),
        });
      }
    } catch (err) {
      logDbError(logger, 'inventory', err);
      return json(503, { error: MSG_DB_FAILED });
    }

    // 6) Tellimus andmebaasi. Kui automaat on vedaja nimekirjas, kasutame sealt ametlikke andmeid.
    //    Kui vedaja nimekiri ON olemas, aga valitud ID-d seal pole (automaat suleti, brauseri vana
    //    nimekiri või võltsitud päring), siis tellimust ei looda: muidu jõuaks haldusesse
    //    „ametliku“ ID-ga automaat, mida tegelikult pole (käsitsi sisestuse hoiatust ei näidataks).
    let row;
    try {
      let locker = null;
      if (!order.shipping.manual && order.shipping.lockerId) {
        locker = await findCachedLocker(db, order.shipping.carrier, order.shipping.lockerId).catch(() => null);
        if (!locker) {
          const cache = await readLockerCache(db, order.shipping.carrier).catch(() => null);
          if (cache?.lockers?.length) {
            logger.warn?.(`[checkout] ${order.shipping.carrier}: automaati ${order.shipping.lockerId} pole nimekirjas — palun kliendil uuesti valida.`);
            return json(400, {
              error: `Valitud pakiautomaati ei leitud ${SHIPPING.carriers[order.shipping.carrier].name} automaatide nimekirjast (võib-olla on see suletud). Vali automaat uuesti.`,
              field: 'shipping.lockerId',
            });
          }
        }
      }
      row = await createOrder(db, order, { locker, isTest: resolved.test === true });
    } catch (err) {
      logDbError(logger, 'insert', err);
      return json(503, { error: MSG_DB_FAILED });
    }

    // 7) Sooduskupong (kui kood kehtib) + makseleht.
    //    Makselehel ja Stripe'i andmetes on sama automaat, mis tellimusel (vedaja nimekirjast, mitte brauserist).
    const origin = resolveOrigin(req, env, context);
    const expiresAt = Math.floor((now() + SESSION_TTL_MS) / 1000);
    const stripeOrder = {
      ...order,
      shipping: {
        ...order.shipping,
        lockerId: row.locker_id || '',
        lockerName: row.locker_name,
        lockerAddress: [row.locker_address, row.locker_city].filter(Boolean).join(', '),
      },
    };
    const params = (couponId) =>
      buildSessionParams(stripeOrder, { origin, couponId, orderId: row.id, orderNumber: row.number, token: row.public_token, expiresAt });
    const coupon = { code: order.totals.code, percent: order.totals.percent, amountOffCents: order.totals.discountCents };
    let stage = 'coupon';
    let session;
    try {
      let couponId = null;
      if (order.totals.code && order.totals.discountCents > 0) couponId = await ensureCoupon(stripe, coupon, couponCache);
      stage = 'session';
      try {
        session = await stripe.checkout.sessions.create(params(couponId), { idempotencyKey: `checkout-${row.id}` });
      } catch (err) {
        // Kupong kustutati vahepeal Stripe'i töölaual, aga soe funktsioon mäletab seda:
        // unusta, loo uuesti ja proovi ühe korra veel.
        const couponGone = couponId && (err?.code === 'resource_missing' || err?.raw?.code === 'resource_missing') && /coupon|discount/i.test(`${err?.param || ''} ${err?.message || ''}`);
        if (!couponGone) throw err;
        forgetCoupon(couponId, couponCache);
        stage = 'coupon-retry';
        couponId = await ensureCoupon(stripe, coupon, couponCache);
        stage = 'session-retry';
        session = await stripe.checkout.sessions.create(params(couponId), { idempotencyKey: `checkout-${row.id}-uuesti` });
      }
      if (!session?.url || !session?.id) throw new Error('Stripe ei tagastanud makselehe URL-i');
    } catch (err) {
      logStripeError(logger, stage, err);
      // Makselehte ei tekkinud — tellimus märgitakse ebaõnnestunuks (klient saab uuesti proovida).
      await markFailed(db, row.id).catch((e) => logDbError(logger, 'mark-failed', e));
      return json(502, { error: MSG_STRIPE_FAILED });
    }

    // 8) Sessiooni andmed tellimuse juurde. Kui see ebaõnnestub, leiab webhook tellimuse siiski
    //    metadata.order_id järgi — seega klient võib maksma minna.
    const sessionExpires = Number.isInteger(session.expires_at) ? session.expires_at : expiresAt;
    try {
      await attachCheckoutSession(db, row.id, { sessionId: session.id, url: session.url, expiresAt: sessionExpires });
    } catch (err) {
      logDbError(logger, 'attach-session', err);
    }

    logger.log?.(`[checkout] ${row.number}: makseleht loodud (${row.total_cents} senti, ${order.items.length} rida, ${order.shipping.carrier}${row.is_test ? ', testtellimus' : ''})`);
    return json(200, {
      url: session.url,
      orderNumber: row.number,
      token: row.public_token,
      expiresAt: toIso(sessionExpires),
      ...(order.warnings.length ? { warnings: order.warnings } : {}),
    });
  };
}

export default createHandler();

// Netlify kiiruspiirang: ühelt IP-lt kuni 10 makselehe loomist minutis (kaitseb Stripe'i konto rämpsu eest).
export const config = {
  path: '/api/checkout',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
