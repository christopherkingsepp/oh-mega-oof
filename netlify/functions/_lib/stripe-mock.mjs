// KOHALIK TEST-STRIPE (ainult arenduseks: MOCK_STRIPE=1 ja mitte AWS Lambdas).
//
// Jäljendab neid Stripe'i API osi, mida pood kasutab:
//   coupons.retrieve/create, checkout.sessions.create/retrieve.
// Makseleht on /__mock-stripe/checkout?session=cs_test_… (netlify/functions/dev-mock-stripe.mjs),
// kus saab valida tulemuse. Valiku järel saadetakse PÄRIS allkirjastatud webhook
// (Stripe.webhooks.generateTestHeaderString + sama STRIPE_WEBHOOK_SECRET) aadressile
// /api/stripe-webhook — seega töötab kogu tellimuse voog täpselt nagu päris Stripe'iga.
//
// Sessioonid hoitakse protsessi mälus. Kui dev-server taaskäivitub, taastatakse sessiooni
// olek andmebaasi tellimuse realt (retrieve).
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { getDb } from './db.mjs';
import { getOrderBySessionId } from './orders.mjs';

const sessions = new Map(); // id → { session, lineItems, discountCents, shippingName }
const coupons = new Map();

const rid = (prefix, bytes = 12) => `${prefix}${randomBytes(bytes).toString('hex')}`;
const nowSec = () => Math.floor(Date.now() / 1000);

function mockError(code, statusCode, message) {
  const err = new Error(message);
  err.type = 'StripeInvalidRequestError';
  err.code = code;
  err.statusCode = statusCode;
  err.raw = { code, message };
  return err;
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return 'http://localhost:8080';
  }
}

/** Taastab sessiooni andmebaasist (nt pärast dev-serveri taaskäivitust). */
async function sessionFromDb(id) {
  let order = null;
  try {
    order = await getOrderBySessionId(await getDb(), id);
  } catch {
    return null;
  }
  if (!order) return null;
  const st = order.payment_status;
  const expired = st === 'expired' || (st === 'pending' && order.stripe_session_expires_at && new Date(order.stripe_session_expires_at) < new Date());
  const session = {
    id,
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    url: order.stripe_session_url,
    status: expired ? 'expired' : st === 'pending' ? 'open' : 'complete',
    payment_status: ['paid', 'partially_refunded', 'refunded'].includes(st) ? 'paid' : 'unpaid',
    amount_total: Number(order.total_cents),
    amount_subtotal: Number(order.subtotal_cents),
    currency: 'eur',
    customer_email: order.customer_email,
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_number: order.number },
    payment_intent: order.stripe_payment_intent_id || null,
    expires_at: order.stripe_session_expires_at ? Math.floor(new Date(order.stripe_session_expires_at).getTime() / 1000) : nowSec(),
    created: Math.floor(new Date(order.created_at).getTime() / 1000),
    success_url: null,
    cancel_url: null,
    total_details: { amount_discount: Number(order.discount_cents), amount_shipping: Number(order.shipping_cents), amount_tax: 0 },
  };
  const lineItems = (order.items || []).map((i) => ({ name: i.name, quantity: i.qty, unit_amount: i.unitCents }));
  const entry = { session, lineItems, discountCents: Number(order.discount_cents), shippingName: `${order.carrier_name} — ${order.locker_name}`, refunded: Number(order.refunded_cents) || 0 };
  sessions.set(id, entry);
  return entry;
}

export function createMockStripe() {
  return {
    _mock: true,
    coupons: {
      async retrieve(id) {
        if (coupons.has(id)) return coupons.get(id);
        throw mockError('resource_missing', 404, `No such coupon: '${id}'`);
      },
      async create(params) {
        const id = params.id || rid('mock_coupon_', 6);
        if (coupons.has(id)) throw mockError('resource_already_exists', 400, 'Coupon already exists.');
        const c = { id, object: 'coupon', valid: true, ...params };
        coupons.set(id, c);
        return c;
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          const lineItems = (params.line_items || []).map((li) => ({
            name: li.price_data?.product_data?.name || 'Toode',
            quantity: li.quantity,
            unit_amount: li.price_data?.unit_amount || 0,
          }));
          const subtotal = lineItems.reduce((s, l) => s + l.unit_amount * l.quantity, 0);
          const couponId = params.discounts?.[0]?.coupon;
          const coupon = couponId ? coupons.get(couponId) : null;
          if (couponId && !coupon) throw mockError('resource_missing', 400, `No such coupon: '${couponId}'`);
          const discountCents = coupon?.amount_off || 0;
          const rate = params.shipping_options?.[0]?.shipping_rate_data;
          const shipping = rate?.fixed_amount?.amount || 0;
          const id = rid('cs_test_mock', 16);
          const origin = originOf(params.success_url);
          const session = {
            id,
            object: 'checkout.session',
            livemode: false,
            mode: params.mode || 'payment',
            url: `${origin}/__mock-stripe/checkout?session=${id}`,
            status: 'open',
            payment_status: 'unpaid',
            amount_subtotal: subtotal,
            amount_total: subtotal - discountCents + shipping,
            currency: 'eur',
            customer_email: params.customer_email || null,
            client_reference_id: params.client_reference_id || null,
            metadata: { ...(params.metadata || {}) },
            payment_intent: null,
            expires_at: params.expires_at || nowSec() + 24 * 3600,
            created: nowSec(),
            success_url: params.success_url,
            cancel_url: params.cancel_url,
            total_details: { amount_discount: discountCents, amount_shipping: shipping, amount_tax: 0 },
          };
          sessions.set(id, { session, lineItems, discountCents, shippingName: rate?.display_name || 'Tarne', refunded: 0 });
          return structuredClone(session);
        },
        async retrieve(id) {
          const entry = sessions.get(id) || (await sessionFromDb(id));
          if (!entry) throw mockError('resource_missing', 404, `No such checkout.session: '${id}'`);
          return structuredClone(entry.session);
        },
      },
    },
  };
}

let singleton = null;
export function getMockStripe() {
  singleton ||= createMockStripe();
  return singleton;
}

/** Makselehe jaoks: sessioon koos ridadega (või null). */
export async function getMockSession(id) {
  if (typeof id !== 'string' || !/^cs_test_mock[0-9a-f]+$/.test(id)) return null;
  return sessions.get(id) || (await sessionFromDb(id));
}

/* ---------------------------------------------------------------------------
 * Tegevused makselehel → sündmused
 * ------------------------------------------------------------------------- */

function event(type, object) {
  return {
    id: rid('evt_mock_', 12),
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: nowSec(),
    livemode: false,
    pending_webhooks: 1,
    type,
    data: { object: structuredClone(object) },
  };
}

/**
 * Muudab sessiooni olekut ja tagastab sündmused, mis tuleb webhookina saata.
 * Tegevused: pay | fail | delay | delay_succeed | cancel | expire | refund | refund_partial
 * @returns {{events:object[], redirect:'success'|'cancel'|'page', later?:object[], error?:string}}
 */
export function applyMockAction(entry, action) {
  const s = entry.session;
  const out = { events: [], redirect: 'page' };
  const open = s.status === 'open';
  switch (action) {
    case 'pay':
      if (!open) return { ...out, error: 'Makseleht pole enam avatud.' };
      s.status = 'complete';
      s.payment_status = 'paid';
      s.payment_intent = rid('pi_mock_', 12);
      out.events.push(event('checkout.session.completed', s));
      out.redirect = 'success';
      return out;
    case 'fail':
      // Viivitusega makseviis (nt pangaülekanne), mis hiljem tagasi lükatakse.
      if (!open) return { ...out, error: 'Makseleht pole enam avatud.' };
      s.status = 'complete';
      s.payment_status = 'unpaid';
      s.payment_intent = rid('pi_mock_', 12);
      out.events.push(event('checkout.session.completed', s));
      out.events.push(event('checkout.session.async_payment_failed', s));
      out.redirect = 'success';
      return out;
    case 'delay':
      if (!open) return { ...out, error: 'Makseleht pole enam avatud.' };
      s.status = 'complete';
      s.payment_status = 'unpaid';
      s.payment_intent = rid('pi_mock_', 12);
      entry.delayed = true;
      out.events.push(event('checkout.session.completed', s));
      out.redirect = 'success';
      out.later = ['delay_succeed'];
      return out;
    case 'delay_succeed':
      if (!(s.status === 'complete' && s.payment_status === 'unpaid' && entry.delayed)) return { ...out, error: 'Viivitusega makset pole ootel.' };
      s.payment_status = 'paid';
      entry.delayed = false;
      out.events.push(event('checkout.session.async_payment_succeeded', s));
      return out;
    case 'cancel':
      // Päris Stripe ei saada katkestamisel sündmust — sessioon jääb avatuks kuni aegumiseni.
      out.redirect = 'cancel';
      return out;
    case 'expire':
      if (!open) return { ...out, error: 'Makseleht pole enam avatud.' };
      s.status = 'expired';
      out.events.push(event('checkout.session.expired', s));
      out.redirect = 'cancel';
      return out;
    case 'refund':
    case 'refund_partial': {
      if (s.payment_status !== 'paid' || !s.payment_intent) return { ...out, error: 'Tagastada saab ainult makstud makset.' };
      const left = s.amount_total - (entry.refunded || 0);
      if (left <= 0) return { ...out, error: 'Kogu summa on juba tagastatud.' };
      const amount = action === 'refund' ? left : Math.min(500, left);
      entry.refunded = (entry.refunded || 0) + amount;
      const charge = {
        id: entry.chargeId || (entry.chargeId = rid('ch_mock_', 12)),
        object: 'charge',
        amount: s.amount_total,
        amount_captured: s.amount_total,
        amount_refunded: entry.refunded,
        currency: 'eur',
        payment_intent: s.payment_intent,
        refunded: entry.refunded >= s.amount_total,
        livemode: false,
      };
      out.events.push(event('charge.refunded', charge));
      return out;
    }
    default:
      return { ...out, error: 'Tundmatu tegevus.' };
  }
}

/**
 * Saadab sündmuse allkirjastatult webhooki aadressile (nagu Stripe).
 * @returns {Promise<{status:number, body:string}>}
 */
export async function deliverMockEvent(evt, { url, secret, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  const payload = JSON.stringify(evt);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header, 'User-Agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks) mock' },
    body: payload,
  });
  return { status: res.status, body: await res.text().catch(() => '') };
}

/** Testide jaoks: tühjenda mälu. */
export function resetMockStripe() {
  sessions.clear();
  coupons.clear();
}

