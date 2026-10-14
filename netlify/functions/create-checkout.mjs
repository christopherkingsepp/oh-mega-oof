// POST /api/checkout — loob Stripe Checkout'i makselehe ja tagastab selle URL-i.
//
// Brauser saadab: { items:[{id,qty}], code, customer:{name,email,phone},
//   shipping:{carrier, lockerId, lockerName, lockerAddress}, ageConfirmed, termsAccepted, newsletter }
// Vastus: 200 { url } | 4xx/5xx { error, field? }
//
// Turvalisus: hinnad, soodustus ja tarne arvutatakse AINULT siin serveris
// ühisest kataloogist (assets/js/catalog.js). Kliendi saadetud summasid ei loeta.
// Vajalik keskkonnamuutuja: STRIPE_SECRET_KEY (vt .env.example).
import Stripe from 'stripe';
import { json, readTextLimited } from './_lib/http.mjs';
import { validateOrder } from './_lib/order.mjs';
import { buildSessionParams, ensureCoupon, forgetCoupon, resolveOrigin, createOrderId } from './_lib/stripe-session.mjs';

export const MAX_BODY_BYTES = 20 * 1024;

const MSG_NOT_CONFIGURED = 'Makse pole veel seadistatud. Võta meiega ühendust.';
const MSG_STRIPE_FAILED = 'Makset ei õnnestunud alustada. Proovi uuesti.';
const MSG_BAD_JSON = 'Vigane päring. Värskenda lehte ja proovi uuesti.';
const MSG_TOO_LARGE = 'Päring on liiga suur. Värskenda lehte ja proovi uuesti.';
const MSG_BAD_TYPE = 'Vigane päring (oodati JSON-i). Värskenda lehte ja proovi uuesti.';

// Stripe klient luuakse üks kord soojas funktsioonis ja taaskasutatakse.
const clients = new Map();
function defaultStripeFactory(key) {
  if (!clients.has(key)) {
    clients.set(
      key,
      new Stripe(key, {
        maxNetworkRetries: 1, // Stripe lisab korduspäringule ise idempotency-võtme
        timeout: 8000, // Netlify funktsiooni ajalimiit on 10 s
        appInfo: { name: 'AGE veebipood' },
      }),
    );
  }
  return clients.get(key);
}

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

/**
 * Loob käsitleja. Testides saab süstida võlts-Stripe'i (stripeFactory) ja env-i.
 * @param {{stripeFactory?:(key:string)=>any, env?:object, logger?:Console, couponCache?:Set<string>}} deps
 */
export function createHandler({ stripeFactory = defaultStripeFactory, env = process.env, logger = console, couponCache } = {}) {
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

    // 3) Stripe'i võti.
    const key = (env.STRIPE_SECRET_KEY || '').trim();
    if (!key) {
      logger.error('[checkout] STRIPE_SECRET_KEY puudub — lisa see Netlify keskkonnamuutujatesse (vt .env.example).');
      return json(500, { error: MSG_NOT_CONFIGURED });
    }
    if (!/^(sk|rk)_(test|live)_/.test(key)) {
      logger.error('[checkout] STRIPE_SECRET_KEY on vales vormingus — see peab algama "sk_live_" või "sk_test_" (mitte "pk_").');
      return json(500, { error: MSG_NOT_CONFIGURED });
    }

    let stripe;
    try {
      stripe = stripeFactory(key);
    } catch (err) {
      logStripeError(logger, 'init', err);
      return json(500, { error: MSG_NOT_CONFIGURED });
    }

    // 4) Sooduskupong (kui kood kehtib) + makseleht.
    const origin = resolveOrigin(req, env, context);
    const orderId = createOrderId();
    let stage = 'coupon';
    try {
      let couponId = null;
      if (order.totals.code && order.totals.discountCents > 0) {
        couponId = await ensureCoupon(
          stripe,
          { code: order.totals.code, percent: order.totals.percent, amountOffCents: order.totals.discountCents },
          couponCache,
        );
      }
      stage = 'session';
      let session;
      try {
        session = await stripe.checkout.sessions.create(buildSessionParams(order, { origin, couponId, orderId }));
      } catch (err) {
        // Kupong kustutati vahepeal Stripe'i töölaual, aga soe funktsioon mäletab seda:
        // unusta, loo uuesti ja proovi ühe korra veel.
        const couponGone = couponId && (err?.code === 'resource_missing' || err?.raw?.code === 'resource_missing') && /coupon|discount/i.test(`${err?.param || ''} ${err?.message || ''}`);
        if (!couponGone) throw err;
        forgetCoupon(couponId, couponCache);
        stage = 'coupon-retry';
        couponId = await ensureCoupon(
          stripe,
          { code: order.totals.code, percent: order.totals.percent, amountOffCents: order.totals.discountCents },
          couponCache,
        );
        stage = 'session-retry';
        session = await stripe.checkout.sessions.create(buildSessionParams(order, { origin, couponId, orderId }));
      }
      if (!session?.url) throw new Error('Stripe ei tagastanud makselehe URL-i');
      logger.log?.(`[checkout] ${orderId}: makseleht loodud (${order.totals.totalCents} senti, ${order.items.length} rida)`);
      return json(200, { url: session.url, orderId, ...(order.warnings.length ? { warnings: order.warnings } : {}) });
    } catch (err) {
      logStripeError(logger, stage, err);
      return json(502, { error: MSG_STRIPE_FAILED });
    }
  };
}

export default createHandler();

// Netlify kiiruspiirang: ühelt IP-lt kuni 10 makselehe loomist minutis (kaitseb Stripe'i konto rämpsu eest).
export const config = {
  path: '/api/checkout',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
