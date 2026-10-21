// GET /api/tellimus?t=TOKEN[&session_id=cs_…] — kinnituslehe (/aitah) andmed.
//
// Avalik, aga ainult tellimuse salajase tunnusega (t = 32 juhuslikku baiti, base64url).
// Vastus sisaldab AINULT selle tellimuse andmeid, ilma täieliku e-posti, telefoni ja nimeta:
//   200 { number, test, createdAt, paymentStatus, paymentStatusLabel, paid, paidAt,
//         fulfillmentStatus, fulfillmentStatusLabel, shippedAt, trackingCode,
//         items:[{ id, name, qty, unitCents, totalCents, bundle, includes:[{id,name,qty}] }],
//         totals:{ subtotalCents, discountCode, discountPercent, discountCents, shippingCents, totalCents, refundedCents, currency },
//         shipping:{ carrier, carrierName, lockerId, lockerName, lockerAddress, lockerCity },
//         customer:{ firstName, emailMasked },
//         resumeUrl?, resumeExpiresAt?, synced? }
//   400 vigane link | 404 tellimust ei leitud | 503 andmebaas pole kättesaadav
//
// session_id: Stripe suunab pärast makset /aitah?t=…&session_id=… — kui makse on meie andmetes
// veel ootel (webhook võib hilineda), küsime oleku SERVERIST Stripe'ilt (checkout.sessions.retrieve)
// ja rakendame sama idempotentse ülemineku nagu webhook. Brauseri väidet makse kohta ei usaldata.
import { json } from './_lib/http.mjs';
import { getDb } from './_lib/db.mjs';
import { getOrderByToken, publicOrderView, TOKEN_RE } from './_lib/orders.mjs';
import { applySessionState, ensurePaidSideEffects } from './_lib/payments.mjs';
import { adminEmail } from './_lib/config.mjs';
import { resolveStripe, defaultStripeFactory } from './_lib/stripe-client.mjs';
import { createMailer } from './_lib/mail.mjs';

const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
/** Olekud, mille korral pooleli jäänud kinnituskirja/laoseisu muutust korratakse (tagastatud tellimusel mitte). */
const RETRY_STATES = ['paid', 'partially_refunded'];
/** Kordame ainult värskete maksete puhul (nt hiljem lisatud ADMIN_EMAIL ei saada vanade tellimuste teavitusi). */
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
// Testtellimus laoseisu ei muuda, seega selle puuduvat laomuutust ei oodata.
const sideEffectsPending = (o, env, nowMs) =>
  Boolean(o.paid_at) &&
  nowMs - new Date(o.paid_at).getTime() < RETRY_WINDOW_MS &&
  ((!o.inventory_applied_at && !o.is_test) || !o.confirmation_sent_at || Boolean(adminEmail(env) && !o.admin_notified_at));
const PRIVATE = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

/**
 * @param {{env?:object, logger?:Console, getDb?:()=>Promise<object>, stripeFactory?:Function, mailer?:{send:Function}, now?:()=>number}} deps
 */
export function createHandler({ env = process.env, logger = console, getDb: getDbImpl = () => getDb(env), stripeFactory = defaultStripeFactory, mailer = null, now = Date.now } = {}) {
  const mail = mailer || createMailer({ env, logger });

  return async function orderStatusHandler(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Lubatud on ainult GET-päring.' }, { Allow: 'GET, HEAD', ...PRIVATE });

    const url = new URL(req.url);
    const token = (url.searchParams.get('t') || '').trim();
    const sessionId = (url.searchParams.get('session_id') || '').trim();
    if (!TOKEN_RE.test(token)) return json(400, { error: 'Vigane tellimuse link. Kontrolli, et kopeerisid lingi tervikuna.' }, PRIVATE);

    let db;
    try {
      db = await getDbImpl();
    } catch (err) {
      logger.error(`[tellimus] andmebaas pole kättesaadav (${err?.code || err?.message})`);
      return json(503, { error: 'Tellimuse infot ei õnnestunud praegu laadida. Proovi mõne hetke pärast uuesti.' }, PRIVATE);
    }

    let order;
    try {
      order = await getOrderByToken(db, token);
    } catch (err) {
      logger.error(`[tellimus] päring ebaõnnestus: ${err?.message || err}`);
      return json(503, { error: 'Tellimuse infot ei õnnestunud praegu laadida. Proovi mõne hetke pärast uuesti.' }, PRIVATE);
    }
    if (!order) return json(404, { error: 'Tellimust ei leitud. Kontrolli linki või kirjuta meile.' }, PRIVATE);

    // Webhook võib hilineda → kontrolli makset otse Stripe'ist (ainult selle tellimuse sessioon).
    let synced = false;
    if (sessionId && SESSION_RE.test(sessionId) && ['pending', 'processing'].includes(order.payment_status)) {
      const own = !order.stripe_session_id || order.stripe_session_id === sessionId;
      const resolved = own ? resolveStripe(env, { stripeFactory }) : { error: 'other' };
      if (!resolved.error) {
        try {
          const session = await resolved.stripe.checkout.sessions.retrieve(order.stripe_session_id || sessionId, { expand: ['payment_intent'] });
          const belongs = session?.metadata?.order_id === order.id || session?.client_reference_id === order.id || session?.id === order.stripe_session_id;
          if (belongs) {
            const r = await applySessionState(db, session, { eventType: null, mailer: mail, env, logger, order });
            if (r.order) order = r.order;
            synced = true;
          } else {
            logger.warn(`[tellimus] ${order.number}: sessioon ei kuulu sellele tellimusele — ei sünkrooni.`);
          }
        } catch (err) {
          // Stripe ei vasta → näitame viimast teadaolevat olekut (webhook parandab hiljem).
          logger.warn(`[tellimus] ${order.number}: Stripe'i oleku kontroll ebaõnnestus: ${err?.message || err}`);
        }
      }
    }

    // Makstud, aga webhookis jäi kõrvalmõju pooleli (nt e-posti teenus vastas korraks veaga ja
    // valvur vabastati). Kaardimakse puhul Stripe sama tellimuse kohta rohkem sündmusi ei saada,
    // seega proovime siin (kinnitusleht laeb seda kohe pärast makset) uuesti. Valvurid
    // (claimOrderFlag, laoliikumiste unikaalsus) tagavad, et midagi ei tehta topelt.
    if (!synced && RETRY_STATES.includes(order.payment_status) && sideEffectsPending(order, env, now())) {
      try {
        order = await ensurePaidSideEffects(db, order, { mailer: mail, env, logger });
      } catch (err) {
        logger.warn(`[tellimus] ${order.number}: kõrvalmõjude kordus ebaõnnestus: ${err?.message || err}`);
      }
    }

    return json(200, { ...publicOrderView(order, { now: now() }), ...(synced ? { synced: true } : {}) }, PRIVATE);
  };
}

export default createHandler();

// Kinnitusleht küsib olekut mõne sekundi tagant (kuni makse kinnitub) — piir on helde, aga mitte lõputu.
export const config = {
  path: '/api/tellimus',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
