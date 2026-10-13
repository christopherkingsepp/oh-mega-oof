// Testide ühised abivahendid: korrektne tellimus, võlts-Stripe ja vaikne logija.
import { readFileSync } from 'node:fs';

export const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/** Korrektne /api/checkout keha; `overrides` liidetakse sügavalt peale. */
export function validBody(overrides = {}) {
  const base = {
    items: [{ id: 'mida-viiu', qty: 1 }],
    code: '',
    customer: { name: 'Mari Maasikas', email: 'mari@example.ee', phone: '5123 4567' },
    shipping: {
      carrier: 'omniva',
      lockerId: '96331',
      lockerName: 'Tallinna Kristiine keskuse pakiautomaat',
      lockerAddress: 'Endla tn 45, Tallinn',
    },
    ageConfirmed: true,
    termsAccepted: true,
    newsletter: false,
  };
  return merge(base, overrides);
}

function merge(a, b) {
  if (b === undefined) return a;
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = a && typeof a[k] === 'object' && !Array.isArray(a[k]) && a[k] !== null ? merge(a[k], v) : v;
  return out;
}

export function stripeError(code, statusCode, message = code) {
  const err = new Error(message);
  err.type = 'StripeInvalidRequestError';
  err.code = code;
  err.statusCode = statusCode;
  err.raw = { code, message };
  return err;
}

/** Võlts Stripe klient — salvestab kõik väljakutsed `calls` alla. */
export function mockStripe({ coupons = {}, sessionError = null, retrieveError = null, createCouponError = null, sessionUrl = 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3' } = {}) {
  const calls = { retrieve: [], createCoupon: [], sessions: [] };
  let generated = 0;
  return {
    calls,
    coupons: {
      async retrieve(id) {
        calls.retrieve.push(id);
        if (retrieveError) throw retrieveError;
        if (coupons[id]) return coupons[id];
        throw stripeError('resource_missing', 404, `No such coupon: '${id}'`);
      },
      async create(params) {
        calls.createCoupon.push(params);
        if (createCouponError) throw createCouponError;
        const id = params.id || `gen_${++generated}`;
        coupons[id] = { id, valid: true, ...params };
        return coupons[id];
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          calls.sessions.push(params);
          if (sessionError) throw sessionError;
          return { id: 'cs_test_a1b2c3', url: sessionUrl };
        },
      },
    },
  };
}

/** Logija, mis ei prindi midagi, aga jätab sõnumid meelde. */
export function silentLogger() {
  const lines = [];
  const rec = (...args) => lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  return { lines, error: rec, warn: rec, log: rec, info: rec };
}

export function postJson(body, { url = 'https://age.example/api/checkout', headers = {} } = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
