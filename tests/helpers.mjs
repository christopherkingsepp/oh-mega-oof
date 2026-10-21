// Testide ühised abivahendid: korrektne tellimus, võlts-Stripe, vaikne logija,
// mälus andmebaas (PGlite), meili püüdja ja allkirjastatud webhooki päringud.
import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import { PGlite } from '@electric-sql/pglite';
import { wrapPglite } from '../netlify/functions/_lib/db.mjs';
import { SCHEMA_SQL } from '../netlify/functions/_lib/schema.mjs';

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
export function mockStripe({ coupons = {}, sessionError = null, retrieveError = null, createCouponError = null, sessionUrl = 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3', sessionRetrieve = null } = {}) {
  const calls = { retrieve: [], createCoupon: [], sessions: [], sessionOptions: [], sessionRetrieve: [] };
  let generated = 0;
  let sessionCounter = 0;
  const sessions = new Map();
  return {
    calls,
    sessions,
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
        async create(params, options) {
          calls.sessions.push(params);
          calls.sessionOptions.push(options);
          if (sessionError) throw sessionError;
          const id = `cs_test_a1b2c3d${++sessionCounter}${Math.random().toString(36).slice(2, 8)}`;
          const session = { id, url: sessionUrl, expires_at: params.expires_at, metadata: params.metadata, client_reference_id: params.client_reference_id };
          sessions.set(id, session);
          return session;
        },
        async retrieve(id, options) {
          calls.sessionRetrieve.push({ id, options });
          if (sessionRetrieve) return sessionRetrieve(id, sessions.get(id));
          const s = sessions.get(id);
          if (!s) throw stripeError('resource_missing', 404, `No such checkout.session: '${id}'`);
          return s;
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

/* ---------------------------------------------------------------------------
 * Andmebaas: üks mälus PGlite kõigile testifailidele (käivitus võtab mõne sekundi).
 * Sama mis createMemoryDb(), aga EI muuda db.mjs globaalset ühendust (teiste testide oma) —
 * käsitlejatele antakse andmebaas alati `getDb` sõltuvusena.
 * ------------------------------------------------------------------------- */
let sharedDb = null;
export function testDb() {
  sharedDb ||= (async () => {
    const pg = new PGlite();
    await pg.waitReady;
    const db = wrapPglite(pg);
    await db.exec(SCHEMA_SQL);
    return db;
  })();
  return sharedDb;
}

/** Tühjendab kõik tabelid; tellimuse numbrid algavad uuesti 0001-st (loendurid tühjaks). */
export async function freshDb() {
  const db = await testDb();
  await db.exec(`
    TRUNCATE orders, order_counters, stripe_events, inventory, inventory_movements, withdrawals, locker_cache RESTART IDENTITY;
  `);
  return db;
}

/** Meili püüdja: salvestab kirjad `sent` alla; `fail = true` → saatmine ebaõnnestub. */
export function captureMailer() {
  const mailer = {
    sent: [],
    fail: false,
    async send(msg) {
      if (mailer.fail) return { sent: false, error: 'test: saatmine ebaõnnestus' };
      mailer.sent.push(msg);
      return { sent: true, id: `mail_${mailer.sent.length}` };
    },
  };
  return mailer;
}

export const WEBHOOK_SECRET = 'whsec_test_secret_for_unit_tests';

let evtCounter = 0;
/**
 * Stripe'i sündmus (data.object = antud objekt). Vaikimisi livemode: true — sobib päris
 * tellimusega (createOrder ilma isTest-ita). Testtellimuse jaoks anna { livemode: false }.
 */
export function stripeEvent(type, object, { id = `evt_test_${++evtCounter}_${Date.now()}`, livemode = true } = {}) {
  return { id, object: 'event', type, created: Math.floor(Date.now() / 1000), livemode, data: { object } };
}

/** Allkirjastatud webhooki päring (nagu Stripe saadab). */
export function signedWebhook(evt, { secret = WEBHOOK_SECRET, signature = undefined, url = 'https://age.example/api/stripe-webhook' } = {}) {
  const payload = typeof evt === 'string' ? evt : JSON.stringify(evt);
  const header = signature === undefined ? Stripe.webhooks.generateTestHeaderString({ payload, secret }) : signature;
  const headers = { 'Content-Type': 'application/json' };
  if (header !== null) headers['Stripe-Signature'] = header;
  return new Request(url, { method: 'POST', headers, body: payload });
}

/** Vastus → { res, data, text }. */
export async function call(handler, req, context) {
  const res = await handler(req, context);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* mitte-JSON vastus */
  }
  return { res, data, text };
}
