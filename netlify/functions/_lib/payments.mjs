// Stripe'i makseoleku rakendamine tellimusele — ÜKS koht, mida kasutavad nii webhook
// (/api/stripe-webhook), kinnitusleht (/api/tellimus?session_id=…) kui ka kohalik test-Stripe.
//
// Kõik sammud on idempotentsed:
//   1) olekuüleminek (orders.mjs: markPaid/markProcessing/markFailed/markExpired) muudab rida
//      ainult lubatud lähteolekust;
//   2) makstud tellimuse kõrvalmõjud (laoseis + kaks e-kirja) on kaitstud eraldi valvuritega
//      (inventory_movements unikaalsus, confirmation_sent_at / admin_notified_at).
// Seega võib sama sündmust töödelda mitu korda (Stripe kordab, webhook ja kinnitusleht
// jõuavad samaaegselt) — tulemus on alati sama ja kiri läheb välja ainult üks kord.
import {
  getOrderById,
  getOrderBySessionId,
  markPaid,
  markProcessing,
  markFailed,
  markExpired,
  applyRefund,
  applyInventoryForOrder,
  claimOrderFlag,
  releaseOrderFlag,
} from './orders.mjs';
import { orderConfirmationEmail, adminNewOrderEmail } from './mail-templates.mjs';
import { adminEmail, contactEmail, siteUrl } from './config.mjs';

export const PAID_STATES = ['paid', 'partially_refunded', 'refunded'];

const idOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? v.id || null : null);

/** Kas sessioon on päriselt makstud (Stripe'i serveri andmete järgi)? */
export function sessionIsPaid(session) {
  return session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required';
}

/**
 * Milline üleminek sessiooni/sündmuse järgi tehakse: 'paid' | 'processing' | 'failed' | 'expired' | null.
 * `eventType` puudub → sessioon on loetud otse Stripe'ist (checkout.sessions.retrieve).
 */
export function targetState(session, eventType = null) {
  switch (eventType) {
    case 'checkout.session.completed':
      return sessionIsPaid(session) ? 'paid' : 'processing';
    case 'checkout.session.async_payment_succeeded':
      return 'paid';
    case 'checkout.session.async_payment_failed':
      return 'failed';
    case 'checkout.session.expired':
      return 'expired';
    case null:
    case undefined: {
      if (session?.status === 'complete') {
        if (sessionIsPaid(session)) return 'paid';
        // Viivitusega makse, mis lükati tagasi (kui payment_intent on laiendatud).
        const piStatus = session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent.status : null;
        if (piStatus === 'canceled' || (piStatus === 'requires_payment_method' && session.payment_intent.last_payment_error)) return 'failed';
        return 'processing';
      }
      if (session?.status === 'expired') return 'expired';
      return null; // 'open' — klient on veel makselehel
    }
    default:
      return null;
  }
}

/** Leiab sessioonile vastava tellimuse (metadata.order_id → client_reference_id → sessiooni id). */
export async function findOrderForSession(db, session) {
  const candidates = [session?.metadata?.order_id, session?.client_reference_id].filter((v) => typeof v === 'string' && v);
  for (const id of candidates) {
    const order = await getOrderById(db, id);
    if (order) return order;
  }
  return session?.id ? getOrderBySessionId(db, session.id) : null;
}

/**
 * Rakendab Stripe'i sessiooni oleku tellimusele.
 * @param {object} db
 * @param {object} session Stripe Checkout Session (webhooki sündmusest või retrieve'ist — MITTE brauserist)
 * @param {{eventType?:string|null, mailer:{send:Function}, env?:object, logger?:Console, order?:object}} deps
 * @returns {Promise<{order:object|null, state:string|null, transitioned:boolean, reason?:string}>}
 */
export async function applySessionState(db, session, { eventType = null, mailer, env = process.env, logger = console, order = null } = {}) {
  const found = order || (await findOrderForSession(db, session));
  if (!found) return { order: null, state: null, transitioned: false, reason: 'tellimust ei leitud' };

  // Igal tellimusel on üks makseleht. Teise sessiooni sündmus (nt keegi kopeeris metadata) ei
  // tohi seda tellimust muuta.
  if (found.stripe_session_id && session?.id && found.stripe_session_id !== session.id) {
    logger.warn?.(`[makse] ${found.number}: sessioon ${session.id} ei kuulu sellele tellimusele — jätan vahele.`);
    return { order: found, state: null, transitioned: false, reason: 'vale sessioon' };
  }

  const state = targetState(session, eventType);
  if (!state) return { order: found, state: null, transitioned: false };

  const paymentIntentId = idOf(session.payment_intent);
  let result;
  if (state === 'paid') {
    const amount = Number.isInteger(session.amount_total) ? session.amount_total : null;
    if (amount !== null && amount !== Number(found.total_cents)) {
      logger.error?.(`[makse] ${found.number}: makstud summa ${amount} ≠ tellimuse summa ${found.total_cents} senti — kontrolli Stripe'is!`);
    }
    if (session.currency && String(session.currency).toLowerCase() !== String(found.currency || 'eur').toLowerCase()) {
      logger.error?.(`[makse] ${found.number}: valuuta ${session.currency} ≠ ${found.currency}`);
    }
    result = await markPaid(db, found.id, { paymentIntentId, amountPaid: amount, at: new Date(), sessionId: session.id || null });
  } else if (state === 'processing') {
    result = await markProcessing(db, found.id, { paymentIntentId, sessionId: session.id || null });
  } else if (state === 'failed') {
    result = await markFailed(db, found.id);
  } else {
    result = await markExpired(db, found.id);
  }

  let current = result.order || found;
  if (result.transitioned) logger.log?.(`[makse] ${current.number}: ${found.payment_status} → ${current.payment_status}`);
  // Üleminekut ei toimunud: paralleelne töötlus võis rea just muuta, aga lause tagastas oma
  // algushetke (vana) seisu → loe värske olek uuesti, et kõrvalmõjude otsus põhineks tegelikul olekul.
  else current = (await getOrderById(db, found.id)) || current;

  // Makstud → laoseis ja kirjad (ka siis, kui see väljakutse ise üleminekut ei teinud —
  // eelmine katse võis pooleli jääda; valvurid hoolitsevad, et midagi topelt ei juhtuks).
  if (PAID_STATES.includes(current.payment_status)) {
    current = await ensurePaidSideEffects(db, current, { mailer, env, logger });
  }
  return { order: current, state, transitioned: result.transitioned };
}

/**
 * Makstud tellimuse ühekordsed kõrvalmõjud. Andmebaasi vead visatakse edasi (webhook
 * vastab siis 500 ja Stripe kordab); e-posti vead ainult logitakse.
 */
export async function ensurePaidSideEffects(db, order, { mailer, env = process.env, logger = console } = {}) {
  if (!order.inventory_applied_at) {
    const inv = await applyInventoryForOrder(db, order);
    if (inv.movements) logger.log?.(`[ladu] ${order.number}: ${inv.movements} laoliikumist`);
    for (const s of inv.stock) if (s.stock < 0) logger.warn?.(`[ladu] ${s.gameId}: laoseis on negatiivne (${s.stock}) — kontrolli halduses!`);
  }
  const ctx = { siteUrl: siteUrl(env) };

  if (mailer && !order.confirmation_sent_at && (await claimOrderFlag(db, order.id, 'confirmation_sent_at'))) {
    await sendGuarded(db, order, 'confirmation_sent_at', mailer, logger, {
      to: order.customer_email,
      replyTo: contactEmail(),
      idempotencyKey: `tellimus-kinnitus-${order.id}`,
      tag: 'tellimus',
      ...orderConfirmationEmail(order, ctx),
    });
  }

  const admin = adminEmail(env);
  if (mailer && admin && !order.admin_notified_at && (await claimOrderFlag(db, order.id, 'admin_notified_at'))) {
    await sendGuarded(db, order, 'admin_notified_at', mailer, logger, {
      to: admin,
      replyTo: order.customer_email,
      idempotencyKey: `tellimus-omanik-${order.id}`,
      tag: 'omanik-tellimus',
      ...adminNewOrderEmail(order, ctx),
    });
  }
  return (await getOrderById(db, order.id)) || order;
}

/** Saadab kirja; kui saatmine ebaõnnestus (mitte "seadistamata"), vabastab valvuri järgmiseks katseks. */
async function sendGuarded(db, order, column, mailer, logger, message) {
  let res;
  try {
    res = await mailer.send(message);
  } catch (err) {
    res = { sent: false, error: String(err?.message || err) };
  }
  if (res?.sent || res?.skipped) return res;
  logger.error?.(`[meil] ${order.number}: ${column === 'confirmation_sent_at' ? 'kliendi kinnitus' : 'omaniku teavitus'} jäi saatmata (${res?.error || 'tundmatu viga'}) — proovitakse järgmisel korral uuesti.`);
  try {
    await releaseOrderFlag(db, order.id, column);
  } catch (err) {
    logger.error?.(`[meil] ${order.number}: valvuri vabastamine ebaõnnestus: ${err?.message || err}`);
  }
  return res;
}

/**
 * charge.refunded → tellimus 'refunded' või 'partially_refunded'.
 * Laoseisu tagasimakse automaatselt EI suurenda (kaup võib olla teel/kahjustatud) — omanik
 * lisab tagastatud mängud halduses käsitsi.
 */
export async function applyChargeRefunded(db, charge, { logger = console } = {}) {
  const pi = idOf(charge?.payment_intent);
  const refunded = Number.isInteger(charge?.amount_refunded) ? charge.amount_refunded : null;
  if (!pi || refunded === null) return { order: null, transitioned: false, reason: 'payment_intent või summa puudub' };
  const result = await applyRefund(db, pi, refunded);
  if (!result.order) logger.warn?.(`[makse] tagasimakse: makset ${pi} ei leitud ühegi tellimuse juurest.`);
  else if (result.transitioned) logger.log?.(`[makse] ${result.order.number}: tagastatud ${refunded} senti → ${result.order.payment_status}`);
  return result;
}
