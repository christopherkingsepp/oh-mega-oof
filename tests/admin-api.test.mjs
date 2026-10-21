// Halduse API (/api/admin/*) mälus andmebaasiga: ligipääsukontroll kõigil marsruutidel,
// CSRF, tellimuste filtrid, detailvaade, PATCH-i piirangud, CSV, pakkimine, laoseis,
// taganemised, väljalogimine. Testandmed sisestatakse otse SQL-iga.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createMemoryDb } from '../netlify/functions/_lib/db.mjs';
import { createAdminApi } from '../netlify/functions/_lib/admin-api.mjs';
import { authConfig, createSessionToken, hashPassword } from '../netlify/functions/_lib/admin-auth.mjs';
import { computeTotals, SHIPPING } from '../public/assets/js/catalog.js';
import { itemsSnapshot, createOrder, markPaid, applyInventoryForOrder, applyRefund, getOrderById } from '../netlify/functions/_lib/orders.mjs';
import { validateOrder } from '../netlify/functions/_lib/order.mjs';
import { validBody } from './helpers.mjs';
import { asciiOrderNumber, formatOrderNumber, parseOrderNumber } from '../public/assets/js/order-number.js';
import adminApiDefault, { config as adminApiConfig } from '../netlify/functions/admin-api.mjs';
import { config as adminLoginConfig } from '../netlify/functions/admin-login.mjs';
import { config as adminPageConfig } from '../netlify/functions/admin-page.mjs';

const ORIGIN = 'https://age.example';
const ENV = { ADMIN_PASSWORD_HASH: hashPassword('test parool 12345', { N: 1024 }), ADMIN_SESSION_SECRET: 's'.repeat(48) };
const NOW = new Date('2026-10-20T10:00:00Z');
const COOKIE = `age_admin=${createSessionToken(authConfig(ENV), { now: NOW })}`;
const silent = { log() {}, warn() {}, error() {} };

let db;
let dbCalls = 0;
let api;

before(async () => {
  db = await createMemoryDb();
  api = createAdminApi({
    env: ENV,
    now: () => NOW,
    logger: silent,
    getDb: async () => {
      dbCalls++;
      return db;
    },
  });
});

/** Päring halduse API-sse. */
async function call(method, path, { body, cookie = COOKIE, origin = ORIGIN, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (origin && method !== 'GET') h.Origin = origin;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await api(new Request(`${ORIGIN}/api/admin/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), { ip: '127.0.0.1' });
  // NB! Response.text() eemaldaks BOM-i — loeme baidid ja dekodeerime BOM-i alles jättes.
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* CSV */
  }
  return { res, status: res.status, data, text };
}

async function reset() {
  await db.exec('TRUNCATE orders, order_counters, inventory, inventory_movements, withdrawals RESTART IDENTITY;');
}

let seq = 0;
/** Tellimuse rida otse SQL-iga (summad kataloogist nagu päris tellimusel). */
async function insertOrder(o = {}) {
  const items = o.items || [{ id: 'mida-viiu', qty: 1 }];
  const carrier = o.carrier || 'omniva';
  const t = computeTotals(items, o.code || '', carrier);
  const payment = o.payment || 'paid';
  const paid = ['paid', 'partially_refunded', 'refunded'].includes(payment);
  const createdAt = o.createdAt || '2026-10-10T10:00:00Z';
  const number = o.number || formatOrderNumber({ year: 2026, seq: 2000 + ++seq, test: Boolean(o.test) });
  const parsed = parseOrderNumber(number);
  const [row] = await db.query(
    `INSERT INTO orders (id, number, public_token, created_at, updated_at, customer_name, customer_email, customer_phone, items,
       subtotal_cents, discount_code, discount_cents, shipping_cents, total_cents, carrier, carrier_name, locker_id, locker_name, locker_address, locker_city,
       payment_status, stripe_session_id, stripe_payment_intent_id, paid_at, amount_paid_cents, refunded_cents, fulfillment_status, notes, tracking_code,
       is_test, number_year, number_seq, legacy_number, inventory_applied_at)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33) RETURNING *`,
    [
      randomUUID(),
      number,
      randomBytes(32).toString('base64url'),
      createdAt,
      o.name || 'Mari Maasikas',
      o.email || 'mari@example.ee',
      o.phone || `+3725000${String(seq).padStart(4, '0')}`,
      JSON.stringify(itemsSnapshot(t)),
      t.subtotalCents,
      t.code,
      t.discountCents,
      t.shippingCents,
      t.totalCents,
      carrier,
      SHIPPING.carriers[carrier].label,
      o.lockerId ?? '96331',
      o.lockerName || 'Tallinna Kristiine keskuse pakiautomaat',
      'Endla tn 45',
      'Tallinn',
      payment,
      `cs_test_${asciiOrderNumber(number)}`,
      paid ? `pi_test_${asciiOrderNumber(number).replace(/-/g, '')}` : null,
      paid ? o.paidAt || createdAt : null,
      paid ? t.totalCents : null,
      o.refunded || 0,
      o.fulfillment || 'new',
      o.notes || '',
      o.tracking || null,
      Boolean(o.test ?? parsed?.test),
      parsed?.legacy ? null : parsed?.year ?? null,
      parsed?.legacy ? null : parsed?.seq ?? null,
      o.legacy || null,
      o.inventoryApplied ? o.inventoryApplied : null,
    ],
  );
  return row;
}

/* ---------------------------------------------------------------------------
 * Funktsioonide seadistus
 * ------------------------------------------------------------------------- */

test('funktsioonide aadressid: /admin, /api/admin/*, sisselogimisel kiiruspiirang', () => {
  assert.deepEqual(adminPageConfig.path, ['/admin', '/admin/*']);
  assert.equal(adminApiConfig.path, '/api/admin/*');
  assert.equal(adminApiConfig.excludedPath, '/api/admin/login');
  assert.equal(adminLoginConfig.path, '/api/admin/login');
  assert.ok(adminLoginConfig.rateLimit.windowLimit <= 10);
  assert.equal(typeof adminApiDefault, 'function');
});

/* ---------------------------------------------------------------------------
 * Ligipääsukontroll
 * ------------------------------------------------------------------------- */

const ALL_ROUTES = [
  ['GET', 'me'],
  ['POST', 'logout'],
  ['GET', 'orders'],
  ['GET', 'orders?q=Mari&payment=paid_any'],
  ['GET', 'orders.csv'],
  ['GET', 'orders.csv?payment=paid'],
  ['GET', 'orders/ÄGE-2026-2001'],
  ['PATCH', 'orders/ÄGE-2026-2001'],
  ['GET', 'packing'],
  ['GET', 'inventory'],
  ['POST', 'inventory'],
  ['GET', 'withdrawals'],
  ['PATCH', 'withdrawals/TAG-ABCDEF'],
  ['GET', 'stats'],
  ['GET', 'stats?period=day&date=2026-10-10'],
  ['GET', 'calendar?month=2026-10'],
  ['GET', 'tundmatu'],
  ['DELETE', 'orders/ÄGE-2026-2001'],
  ['HEAD', 'orders'],
];

test('ligipääs: ilma küpsiseta annab KÕIK admin-API-d 401 (ka CSV) ega puutu andmebaasi', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-2001' });
  const before = dbCalls;
  for (const [method, path] of ALL_ROUTES) {
    const body = ['POST', 'PATCH'].includes(method) ? { fulfillmentStatus: 'packed' } : undefined;
    const r = await call(method, path, { cookie: null, body });
    assert.equal(r.status, 401, `${method} ${path}`);
    assert.match(r.res.headers.get('content-type'), /application\/json/, `${method} ${path}: mitte CSV`);
    if (method !== 'HEAD') {
      assert.equal(r.data.code, 'UNAUTHORIZED');
      assert.ok(!r.text.includes('ÄGE-2026-2001') && !r.text.includes('Maasikas'), `${method} ${path}: andmed lekkisid`);
    }
    assert.match(r.res.headers.get('cache-control'), /no-store/);
  }
  assert.equal(dbCalls, before, 'sisselogimata päring ei tohi andmebaasi lugeda');
  const [row] = await db.query(`SELECT fulfillment_status FROM orders WHERE number = 'ÄGE-2026-2001'`);
  assert.equal(row.fulfillment_status, 'new');
});

test('ligipääs: võltsitud, aegunud või teise saladusega küpsis → 401', async () => {
  const cfg = authConfig(ENV);
  const expired = `age_admin=${createSessionToken(cfg, { now: new Date(NOW.getTime() - 12 * 3600e3 - 1000) })}`;
  const other = `age_admin=${createSessionToken(authConfig({ ...ENV, ADMIN_SESSION_SECRET: 't'.repeat(48) }), { now: NOW })}`;
  const [p, s] = COOKIE.slice('age_admin='.length).split('.');
  const tampered = `age_admin=${Buffer.from(JSON.stringify({ v: 1, iat: 1, exp: 9999999999, sid: 'x' })).toString('base64url')}.${s}`;
  for (const cookie of [expired, other, tampered, `age_admin=${p}`, 'age_admin=', 'muu=1']) {
    for (const path of ['orders', 'orders.csv', 'stats']) assert.equal((await call('GET', path, { cookie })).status, 401, `${cookie.slice(0, 30)} ${path}`);
  }
  assert.equal((await call('GET', 'orders')).status, 200, 'kehtiv küpsis töötab');
});

test('CSRF: muutev päring võõralt päritolult või päritoluta → 403, andmed muutmata', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-2001' });
  for (const origin of ['https://evil.example', null]) {
    const r = await call('PATCH', 'orders/ÄGE-2026-2001', { origin, body: { fulfillmentStatus: 'packed' } });
    assert.equal(r.status, 403, String(origin));
    assert.equal(r.data.code, 'CSRF');
    assert.equal((await call('POST', 'inventory', { origin, body: { gameId: 'vigur', mode: 'set', value: 5, reason: 'adjust', note: 'inventuur' } })).status, 403);
    assert.equal((await call('POST', 'logout', { origin })).status, 403);
  }
  const [row] = await db.query(`SELECT fulfillment_status FROM orders WHERE number = 'ÄGE-2026-2001'`);
  assert.equal(row.fulfillment_status, 'new');
  assert.equal((await db.query('SELECT count(*)::int AS c FROM inventory'))[0].c, 0);
  // Lugemine (GET) ei vaja Origin-päist
  assert.equal((await call('GET', 'orders/ÄGE-2026-2001', { origin: null })).status, 200);
});

test('sisseloginult: /me, tundmatu aadress 404, vale meetod 405 (Allow)', async () => {
  const me = await call('GET', 'me');
  assert.equal(me.status, 200);
  assert.equal(me.data.authenticated, true);
  assert.equal(me.data.today, '2026-10-20');
  assert.equal(me.data.labels.fulfillment.packed, 'Pakitud');
  assert.equal((await call('GET', 'tundmatu')).status, 404);
  const del = await call('DELETE', 'orders/ÄGE-2026-2001');
  assert.equal(del.status, 405);
  assert.match(del.res.headers.get('allow'), /PATCH/);
  assert.equal(me.res.headers.get('x-frame-options'), 'DENY');
  assert.match(me.res.headers.get('x-robots-tag'), /noindex/);
});

/* ---------------------------------------------------------------------------
 * Tellimused: nimekiri ja filtrid
 * ------------------------------------------------------------------------- */

test('tellimused: otsing nr/nimi/e-post/telefon/automaat, filtrid, sortimine ja lehed', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-0001', name: 'Mari Maasikas', email: 'mari@example.ee', phone: '+37251234567', createdAt: '2026-10-01T08:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0002', name: 'Jüri Õunapuu', email: 'jyri@example.com', phone: '+37255551234', lockerName: 'Tartu Lõunakeskuse pakiautomaat', items: [{ id: 'komplekt-koik', qty: 1 }], createdAt: '2026-10-02T08:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0003', name: '100% Tõeline', payment: 'pending', createdAt: '2026-10-03T08:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0004', name: 'Kätlin Šmidt', payment: 'expired', createdAt: '2026-03-31T23:30:00Z' }); // Tallinnas 01.04
  await insertOrder({ number: 'ÄGE-2026-0005', name: 'Anna Allik', payment: 'refunded', refunded: 2049, fulfillment: 'cancelled', createdAt: '2026-10-04T08:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0006', name: 'Karl Kivi', fulfillment: 'shipped', createdAt: '2026-10-05T08:00:00Z' });

  const nums = async (q) => {
    const r = await call('GET', `orders${q}`);
    assert.equal(r.status, 200, q);
    return r.data.orders.map((o) => o.number);
  };
  assert.deepEqual(await nums(''), ['ÄGE-2026-0006', 'ÄGE-2026-0005', 'ÄGE-2026-0003', 'ÄGE-2026-0002', 'ÄGE-2026-0001', 'ÄGE-2026-0004']);
  assert.deepEqual(await nums('?q=ÄGE-2026-0002'), ['ÄGE-2026-0002']);
  // Number: õige kuju, ASCII-kuju (ilma Ä-ta), väiketähed, tühikud ja osaline number
  assert.deepEqual(await nums('?q=AGE-2026-0002'), ['ÄGE-2026-0002'], 'ASCII-kuju');
  assert.deepEqual(await nums('?q=age-2026-0002'), ['ÄGE-2026-0002'], 'väiketähed');
  assert.deepEqual(await nums('?q=%C3%A4ge%202026%202'), ['ÄGE-2026-0002'], 'tühikutega, lühendatud');
  assert.deepEqual(await nums('?q=2026-0002'), ['ÄGE-2026-0002'], 'ilma eesliiteta');
  assert.deepEqual(await nums('?q=0002'), ['ÄGE-2026-0002'], 'ainult järjekorranumber');
  assert.deepEqual(await nums('?q=õunapuu'), ['ÄGE-2026-0002'], 'tõstutundetu, täpitähed');
  assert.deepEqual(await nums('?q=JYRI%40EXAMPLE'), ['ÄGE-2026-0002'], 'e-post');
  assert.deepEqual(await nums('?q=5123%204567'), ['ÄGE-2026-0001'], 'telefon tühikutega');
  assert.deepEqual(await nums('?q=L%C3%B5unakeskuse'), ['ÄGE-2026-0002'], 'automaat');
  assert.deepEqual(await nums('?q=100%25'), ['ÄGE-2026-0003'], '% on sõnasõnaline, mitte metamärk');
  assert.deepEqual(await nums('?q=%25'), ['ÄGE-2026-0003']);
  assert.deepEqual(await nums('?payment=paid_any'), ['ÄGE-2026-0006', 'ÄGE-2026-0005', 'ÄGE-2026-0002', 'ÄGE-2026-0001']);
  assert.deepEqual(await nums('?payment=unpaid'), ['ÄGE-2026-0003', 'ÄGE-2026-0004']);
  assert.deepEqual(await nums('?payment=paid&fulfillment=open'), ['ÄGE-2026-0002', 'ÄGE-2026-0001']);
  assert.deepEqual(await nums('?fulfillment=cancelled,shipped'), ['ÄGE-2026-0006', 'ÄGE-2026-0005']);
  // Tallinna kuupäevad: 23:30 UTC 31.03 on Tallinnas 01.04
  assert.deepEqual(await nums('?from=2026-04-01&to=2026-04-01'), ['ÄGE-2026-0004']);
  assert.deepEqual(await nums('?from=2026-03-31&to=2026-03-31'), []);
  assert.deepEqual(await nums('?from=2026-10-02&to=2026-10-04'), ['ÄGE-2026-0005', 'ÄGE-2026-0003', 'ÄGE-2026-0002']);
  assert.deepEqual(await nums('?sort=total_desc&payment=paid'), ['ÄGE-2026-0002', 'ÄGE-2026-0006', 'ÄGE-2026-0001']);
  assert.deepEqual(await nums('?sort=number_asc&payment=paid'), ['ÄGE-2026-0001', 'ÄGE-2026-0002', 'ÄGE-2026-0006']);

  const page2 = await call('GET', 'orders?pageSize=5&page=2');
  assert.equal(page2.data.total, 6);
  assert.equal(page2.data.pages, 2);
  assert.deepEqual(page2.data.orders.map((o) => o.number), ['ÄGE-2026-0004']);

  for (const bad of ['?from=2026-02-30', '?to=eile', '?from=2026-10-05&to=2026-10-01', '?payment=kõik', '?fulfillment=lost', '?sort=DROP TABLE']) {
    const r = await call('GET', `orders${bad}`);
    assert.equal(r.status, 400, bad);
    assert.ok(r.data.error);
  }
  const row = (await call('GET', 'orders?q=ÄGE-2026-0002')).data.orders[0];
  assert.equal(row.itemsText, 'Kõik 3 mängu × 1 (MIDA V!!!U + Oled Semu? + Vigur)');
  assert.equal(row.paymentLabel, 'Makstud');
  assert.equal(row.createdAtText, '02.10.2026 11:00');
});

test('tellimuse detail: kõik väljad Tallinna ajas, ilma kliendi salajase tunnuseta', async () => {
  await reset();
  const order = await insertOrder({ number: 'ÄGE-2026-0010', items: [{ id: 'komplekt-koik', qty: 1 }, { id: 'mida-viiu', qty: 1 }], code: 'AGE15', createdAt: '2026-07-01T09:05:00Z' });
  const r = await call('GET', 'orders/age-2026-0010');
  assert.equal(r.status, 200);
  const o = r.data.order;
  assert.equal(o.number, 'ÄGE-2026-0010');
  assert.equal(o.createdAtText, '01.07.2026 12:05');
  assert.equal(o.totals.discountCode, 'AGE15');
  assert.equal(o.totals.discountPercent, 15);
  assert.equal(o.totals.totalCents, order.total_cents);
  assert.equal(o.items[0].bundle, true);
  assert.deepEqual(o.items[0].includes.map((c) => c.id), ['mida-viiu', 'oled-semu', 'vigur']);
  assert.deepEqual(o.games, [
    { id: 'mida-viiu', name: 'MIDA V!!!U', qty: 2 },
    { id: 'oled-semu', name: 'Oled Semu?', qty: 1 },
    { id: 'vigur', name: 'Vigur', qty: 1 },
  ]);
  assert.equal(o.shipping.lockerId, '96331');
  assert.equal(o.shipping.carrierName, 'Omniva');
  assert.equal(o.payment.stripePaymentIntentId, 'pi_test_AGE20260010');
  assert.ok(!r.text.includes(order.public_token), 'public_token ei tohi lekkida');
  assert.ok(!('publicToken' in o));
  assert.equal((await call('GET', 'orders/ÄGE-2026-9999')).status, 404);
  assert.equal((await call('GET', 'orders/..%2F..%2Fetc')).status, 404);
});

/* ---------------------------------------------------------------------------
 * PATCH
 * ------------------------------------------------------------------------- */

test('PATCH: täitmise olek + ajatemplid, jälgimiskood ja märkmed', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-0020' });
  let r = await call('PATCH', 'orders/ÄGE-2026-0020', { body: { fulfillmentStatus: 'packed', notes: '  Kiire!\r\nTeine rida  ' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.order.fulfillment.status, 'packed');
  assert.equal(r.data.order.fulfillment.packedAt, NOW.toISOString());
  assert.equal(r.data.order.fulfillment.shippedAt, null);
  assert.equal(r.data.order.notes, 'Kiire!\nTeine rida');

  r = await call('PATCH', 'orders/ÄGE-2026-0020', { body: { fulfillmentStatus: 'shipped', trackingCode: ' CC123456789EE ' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.order.fulfillment.trackingCode, 'CC123456789EE');
  assert.equal(r.data.order.fulfillment.shippedAt, NOW.toISOString());
  assert.equal(r.data.order.fulfillment.packedAt, NOW.toISOString(), 'pakkimise aeg säilib');

  r = await call('PATCH', 'orders/ÄGE-2026-0020', { body: { fulfillmentStatus: 'delivered' } });
  assert.equal(r.data.order.fulfillment.status, 'delivered');
  // delivered → new pole lubatud
  r = await call('PATCH', 'orders/ÄGE-2026-0020', { body: { fulfillmentStatus: 'new' } });
  assert.equal(r.status, 409);
  // Tagasi samm parandamiseks: delivered → shipped
  assert.equal((await call('PATCH', 'orders/ÄGE-2026-0020', { body: { fulfillmentStatus: 'shipped' } })).status, 200);
  // Tühistamine
  r = await call('PATCH', 'orders/ÄGE-2026-0020', { body: { fulfillmentStatus: 'cancelled' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.order.fulfillment.status, 'cancelled');
});

test('PATCH: makse staatust, summasid ega tarne/automaadi välju EI saa muuta', async () => {
  await reset();
  const before = await insertOrder({ number: 'ÄGE-2026-0030', payment: 'pending' });
  const forbidden = [
    { paymentStatus: 'paid' },
    { payment_status: 'paid' },
    { lockerId: '1' },
    { lockerName: 'Muu automaat' },
    { carrier: 'dpd' },
    { shipping: { lockerId: '1' } },
    { totalCents: 1 },
    { customerEmail: 'x@y.z' },
    { fulfillmentStatus: 'packed', paymentStatus: 'paid' },
    { packedAt: '2020-01-01T00:00:00Z' },
  ];
  for (const body of forbidden) {
    const r = await call('PATCH', 'orders/ÄGE-2026-0030', { body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.data.error, /ei saa halduses muuta/);
  }
  // Maksmata tellimust ei saa pakkida
  const r = await call('PATCH', 'orders/ÄGE-2026-0030', { body: { fulfillmentStatus: 'packed' } });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /pole makstud/);
  const [after] = await db.query(`SELECT * FROM orders WHERE number = 'ÄGE-2026-0030'`);
  for (const col of ['payment_status', 'locker_id', 'locker_name', 'carrier', 'total_cents', 'customer_email', 'fulfillment_status', 'packed_at']) {
    assert.deepEqual(after[col], before[col], col);
  }
  // Vigased väärtused
  assert.equal((await call('PATCH', 'orders/ÄGE-2026-0030', { body: { fulfillmentStatus: 'lost' } })).status, 400);
  assert.equal((await call('PATCH', 'orders/ÄGE-2026-0030', { body: { trackingCode: 'x'.repeat(101) } })).status, 400);
  assert.equal((await call('PATCH', 'orders/ÄGE-2026-0030', { body: {} })).status, 400);
  assert.equal((await call('PATCH', 'orders/ÄGE-2026-0030', { body: [] })).status, 400);
  // Maksmata tellimusel võib märkmeid lisada
  assert.equal((await call('PATCH', 'orders/ÄGE-2026-0030', { body: { notes: 'Helistasin kliendile' } })).status, 200);
  assert.equal((await call('PATCH', 'orders/ÄGE-2026-9999', { body: { notes: 'x' } })).status, 404);
  const nonJson = await api(new Request(`${ORIGIN}/api/admin/orders/ÄGE-2026-0030`, { method: 'PATCH', headers: { cookie: COOKIE, Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: 'notes=x' }));
  assert.equal(nonJson.status, 415);
});

/* ---------------------------------------------------------------------------
 * CSV
 * ------------------------------------------------------------------------- */

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ';') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

test('CSV: UTF-8 BOM, semikoolon, CRLF, Tallinna aeg, komplekti sisu ja süstimiskaitse', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-0040', name: '=HYPERLINK("http://evil.example";"Vajuta")', email: '@evil.example', phone: '+37251234567', items: [{ id: 'komplekt-koik', qty: 1 }, { id: 'mida-viiu', qty: 2 }], code: 'AGE15', createdAt: '2026-03-31T23:30:00Z', notes: '-2+3\nteine rida', tracking: '+CC1' });
  await insertOrder({ number: 'ÄGE-2026-0041', name: 'Jüri; Õunapuu "Juku"', payment: 'pending', createdAt: '2026-10-02T08:00:00Z' });

  const r = await call('GET', 'orders.csv');
  assert.equal(r.status, 200);
  assert.equal(r.res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(r.res.headers.get('content-disposition'), /^attachment; filename="age-tellimused-2026-10-20\.csv"$/);
  assert.match(r.res.headers.get('cache-control'), /no-store/);
  assert.equal(r.text.charCodeAt(0), 0xfeff, 'BOM');
  const lines = r.text.slice(1).split('\r\n');
  assert.equal(lines.at(-1), '', 'lõpeb CRLF-iga');
  const header = parseCsvLine(lines[0]);
  for (const col of ['Nr', 'Kuupäev', 'Kellaaeg (Tallinn)', 'Klient', 'E-post', 'Telefon', 'Tooted', 'Kogused (mängud)', 'Vahesumma', 'Soodustus', 'Tarne', 'Kokku', 'Makse staatus', 'Stripe PaymentIntent', 'Operaator', 'Automaat', 'Automaadi ID', 'Aadress', 'Täitmise staatus', 'Jälgimiskood', 'Märkmed']) {
    assert.ok(header.includes(col), col);
  }
  const rows = lines.slice(1, -1).map(parseCsvLine);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((cells) => cells.length === header.length), 'iga rida sama arv veerge');
  const get = (cells, col) => cells[header.indexOf(col)];
  const evil = rows.find((cells) => get(cells, 'Nr') === 'ÄGE-2026-0040');
  assert.equal(get(evil, 'Kuupäev'), '01.04.2026');
  assert.equal(get(evil, 'Kellaaeg (Tallinn)'), '02:30');
  assert.equal(get(evil, 'Klient'), `'=HYPERLINK("http://evil.example";"Vajuta")`);
  assert.equal(get(evil, 'E-post'), `'@evil.example`);
  assert.equal(get(evil, 'Telefon'), `'+37251234567`);
  assert.equal(get(evil, 'Märkmed'), `'-2+3 / teine rida`);
  assert.equal(get(evil, 'Jälgimiskood'), `'+CC1`);
  assert.equal(get(evil, 'Tooted'), 'Kõik 3 mängu × 1 (MIDA V!!!U + Oled Semu? + Vigur) | MIDA V!!!U × 2');
  assert.equal(get(evil, 'Kogused (mängud)'), 'MIDA V!!!U: 3, Oled Semu?: 1, Vigur: 1');
  assert.equal(get(evil, 'Vahesumma'), '68,00');
  assert.equal(get(evil, 'Soodustus'), '10,20');
  assert.equal(get(evil, 'Tarne'), '0,00');
  assert.equal(get(evil, 'Kokku'), '57,80');
  assert.equal(get(evil, 'Makse staatus'), 'Makstud');
  assert.equal(get(evil, 'Stripe PaymentIntent'), 'pi_test_AGE20260040');
  assert.equal(get(evil, 'Operaator'), 'Omniva');
  assert.equal(get(evil, 'Automaadi ID'), '96331');
  // Ükski lahter ei alga (ka jutumärkide sees) valemimärgiga
  for (const cells of rows) for (const c of cells) assert.ok(!/^[=+\-@]/.test(c), `valem lahtris: ${c}`);
  // Semikoolon ja jutumärgid nimes on korrektselt jutumärkides
  const juku = rows.find((cells) => get(cells, 'Nr') === 'ÄGE-2026-0041');
  assert.equal(get(juku, 'Klient'), 'Jüri; Õunapuu "Juku"');
  assert.ok(r.text.includes('"Jüri; Õunapuu ""Juku"""'));

  // Filtrid kehtivad ka CSV-le
  const paid = await call('GET', 'orders.csv?payment=paid_any');
  assert.equal(paid.text.slice(1).split('\r\n').length - 2, 1);
  assert.ok(!paid.text.includes('ÄGE-2026-0041'));
  assert.equal((await call('GET', 'orders.csv?from=2026-13-01')).status, 400);
});

/* ---------------------------------------------------------------------------
 * Pakkimine
 * ------------------------------------------------------------------------- */

test('pakkimine: ainult makstud ja saatmata (vanimad ees) + mängude kokkuvõte', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-0050', items: [{ id: 'komplekt-koik', qty: 1 }], paidAt: '2026-10-11T10:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0051', items: [{ id: 'mida-viiu', qty: 2 }], fulfillment: 'packed', paidAt: '2026-10-10T10:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0052', payment: 'partially_refunded', refunded: 500, paidAt: '2026-10-12T10:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0053', fulfillment: 'shipped' });
  await insertOrder({ number: 'ÄGE-2026-0054', payment: 'pending' });
  await insertOrder({ number: 'ÄGE-2026-0055', payment: 'refunded', refunded: 2049 });
  await insertOrder({ number: 'ÄGE-2026-0056', fulfillment: 'cancelled' });
  const r = await call('GET', 'packing');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.orders.map((o) => o.number), ['ÄGE-2026-0051', 'ÄGE-2026-0050', 'ÄGE-2026-0052']);
  assert.equal(r.data.count, 3);
  assert.deepEqual(r.data.games, [
    { id: 'mida-viiu', name: 'MIDA V!!!U', qty: 4 },
    { id: 'oled-semu', name: 'Oled Semu?', qty: 1 },
    { id: 'vigur', name: 'Vigur', qty: 1 },
  ]);
  const o = r.data.orders.find((x) => x.number === 'ÄGE-2026-0050');
  assert.equal(o.shipping.lockerName, 'Tallinna Kristiine keskuse pakiautomaat');
  assert.equal(o.shipping.lockerId, '96331');
  assert.equal(o.items[0].includes.length, 3);
});

/* ---------------------------------------------------------------------------
 * Laoseis
 * ------------------------------------------------------------------------- */

test('laoseis: jälgimata → seadmine, lisamine, vähendamine, ajalugu ja vead', async () => {
  await reset();
  let r = await call('GET', 'inventory');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.games.map((g) => [g.id, g.tracked, g.stock]), [
    ['mida-viiu', false, null],
    ['oled-semu', false, null],
    ['vigur', false, null],
  ]);

  r = await call('POST', 'inventory', { body: { gameId: 'vigur', mode: 'set', value: 10, reason: 'adjust', note: 'Inventuur' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.stock, 10);
  assert.equal(r.data.delta, 10);
  r = await call('POST', 'inventory', { body: { gameId: 'vigur', mode: 'delta', value: '+5', reason: 'restock', note: 'Uus partii trükikojast' } });
  assert.equal(r.data.stock, 15);
  r = await call('POST', 'inventory', { body: { gameId: 'vigur', mode: 'delta', value: -3, reason: 'adjust', note: 'Kahjustatud karbid' } });
  assert.equal(r.data.stock, 12);
  r = await call('POST', 'inventory', { body: { gameId: 'vigur', mode: 'set', value: 8, reason: 'adjust', note: 'Inventuur 2' } });
  assert.equal(r.data.stock, 8);
  assert.equal(r.data.delta, -4, 'set-režiimis salvestatakse tegelik erinevus');

  // Müük (webhooki laoliikumine) näitab ajaloos tellimuse numbrit
  const order = await insertOrder({ number: 'ÄGE-2026-0060', items: [{ id: 'vigur', qty: 1 }] });
  await db.query(`INSERT INTO inventory_movements (game_id, delta, reason, order_id, note) VALUES ('vigur', -1, 'sale', $1, 'Tellimus ÄGE-2026-0060')`, [order.id]);

  r = await call('GET', 'inventory?game=vigur');
  const vigur = r.data.games.find((g) => g.id === 'vigur');
  assert.equal(vigur.tracked, true);
  assert.equal(vigur.stock, 8);
  assert.deepEqual(r.data.movements.map((m) => [m.delta, m.reason]), [
    [-1, 'sale'],
    [-4, 'adjust'],
    [-3, 'adjust'],
    [5, 'restock'],
    [10, 'adjust'],
  ]);
  assert.equal(r.data.movements[0].orderNumber, 'ÄGE-2026-0060');
  assert.equal(r.data.movements[0].reasonLabel, 'Müük');
  assert.equal(r.data.movements[1].note, 'Inventuur 2');
  assert.equal(vigur.sold30d, 1, 'viimase 30 päeva müük');

  const bad = [
    [{ gameId: 'komplekt-koik', mode: 'set', value: 1, reason: 'adjust', note: 'xxx' }, 'gameId'],
    [{ gameId: 'vigur', mode: 'delta', value: -100, reason: 'adjust', note: 'liiga palju' }, 'value'],
    [{ gameId: 'vigur', mode: 'delta', value: 1.5, reason: 'adjust', note: 'murdarv' }, 'value'],
    [{ gameId: 'vigur', mode: 'delta', value: 0, reason: 'adjust', note: 'null' }, 'value'],
    [{ gameId: 'vigur', mode: 'set', value: -1, reason: 'adjust', note: 'miinus' }, 'value'],
    [{ gameId: 'vigur', mode: 'delta', value: -1, reason: 'restock', note: 'vale põhjus' }, 'reason'],
    [{ gameId: 'vigur', mode: 'delta', value: 1, reason: 'sale', note: 'müük käsitsi' }, 'reason'],
    [{ gameId: 'vigur', mode: 'delta', value: 1, reason: 'adjust', note: '' }, 'note'],
    [{ gameId: 'vigur', mode: 'set', value: 8, reason: 'adjust', note: 'sama väärtus' }, 'value'],
    [{ gameId: 'vigur', mode: 'kaval', value: 1, reason: 'adjust', note: 'režiim' }, 'mode'],
  ];
  for (const [body, field] of bad) {
    const res = await call('POST', 'inventory', { body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.data.field, field, JSON.stringify(body));
  }
  const [{ stock }] = await db.query(`SELECT stock FROM inventory WHERE game_id = 'vigur'`);
  assert.equal(stock, 8, 'vead ei muutnud laoseisu');
  assert.equal((await call('GET', 'inventory?game=komplekt')).status, 400);
});

/* ---------------------------------------------------------------------------
 * Taganemised
 * ------------------------------------------------------------------------- */

test('taganemised: nimekiri (avatud/kõik), seos tellimusega ja staatuse muutmine', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-0070' });
  const ins = (ref, order, status = 'received', created = '2026-10-15T10:00:00Z') =>
    db.query(
      `INSERT INTO withdrawals (id, reference, created_at, customer_name, customer_email, order_number, received_date, items, message, status)
       VALUES ($1, $2, $3, 'Mari Maasikas', 'mari@example.ee', $4, '2026-10-14', 'MIDA V!!!U', 'Soovin taganeda', $5)`,
      [randomUUID(), ref, created, order, status],
    );
  await ins('TAG-AAAAAA', 'ÄGE-2026-0070');
  await ins('TAG-BBBBBB', 'ÄGE-2026-9999', 'refunded', '2026-10-01T10:00:00Z');

  let r = await call('GET', 'withdrawals');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.withdrawals.map((w) => w.reference), ['TAG-AAAAAA', 'TAG-BBBBBB']);
  r = await call('GET', 'withdrawals?status=open');
  assert.deepEqual(r.data.withdrawals.map((w) => w.reference), ['TAG-AAAAAA']);
  assert.equal(r.data.open, 1);
  assert.equal(r.data.total, 2);
  const w = r.data.withdrawals[0];
  assert.equal(w.orderFound, true);
  assert.equal(w.orderPaymentLabel, 'Makstud');
  assert.equal(w.receivedDate, '2026-10-14');
  assert.equal(w.receivedDateText, '14.10.2026');
  assert.equal(w.createdAtText, '15.10.2026 13:00');
  const other = (await call('GET', 'withdrawals?status=refunded')).data.withdrawals[0];
  assert.equal(other.orderFound, false);

  r = await call('PATCH', `withdrawals/${w.id}`, { body: { status: 'in_progress', adminNotes: 'Ootan kauba tagasi.' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.withdrawal.status, 'in_progress');
  assert.equal(r.data.withdrawal.adminNotes, 'Ootan kauba tagasi.');
  assert.equal(r.data.withdrawal.receivedDate, '2026-10-14');
  r = await call('PATCH', 'withdrawals/tag-aaaaaa', { body: { status: 'refunded' } });
  assert.equal(r.data.withdrawal.status, 'refunded');

  assert.equal((await call('PATCH', `withdrawals/${w.id}`, { body: { status: 'kadunud' } })).status, 400);
  assert.equal((await call('PATCH', `withdrawals/${w.id}`, { body: { customerEmail: 'x@y.z' } })).status, 400);
  assert.equal((await call('PATCH', 'withdrawals/TAG-ZZZZZZ', { body: { status: 'refunded' } })).status, 404);
  assert.equal((await call('PATCH', 'withdrawals/prügi', { body: { status: 'refunded' } })).status, 404);
  assert.equal((await call('GET', 'withdrawals?status=kõik')).status, 400);
});

/* ---------------------------------------------------------------------------
 * Tellimuse number URL-is, otsing, päris/test lüliti
 * ------------------------------------------------------------------------- */

test('tellimuse number URL-is: Ä URL-kodeeritult, ASCII-kuju, väiketähed, NFD ja topeltkodeering → sama tellimus, vastuses õige number', async () => {
  await reset();
  const o = await insertOrder({ number: 'ÄGE-2026-0042' });
  await insertOrder({ number: 'TEST-ÄGE-2026-0042', test: true });
  await insertOrder({ number: 'ÄGE-2026-0007', legacy: 'AGE-1007' });
  const paths = [
    'orders/%C3%84GE-2026-0042',
    'orders/%c3%a4ge-2026-0042',
    'orders/AGE-2026-0042',
    'orders/age-2026-0042',
    'orders/A%CC%88GE-2026-0042',
    'orders/%25C3%2584GE-2026-0042',
    'orders/ÄGE-2026-0042',
  ];
  for (const path of paths) {
    const r = await call('GET', path);
    assert.equal(r.status, 200, path);
    assert.equal(r.data.order.number, 'ÄGE-2026-0042', path);
    assert.equal(r.data.order.id, o.id, path);
    assert.equal(r.data.order.isTest, false);
  }
  const t = await call('GET', 'orders/test-age-2026-0042');
  assert.equal(t.data.order.number, 'TEST-ÄGE-2026-0042');
  assert.equal(t.data.order.isTest, true);
  // Vana number (legacy_number) viib uuele numbrile
  const legacy = await call('GET', 'orders/AGE-1007');
  assert.equal(legacy.status, 200);
  assert.equal(legacy.data.order.number, 'ÄGE-2026-0007');
  assert.equal(legacy.data.order.legacyNumber, 'AGE-1007');
  // PATCH ASCII-kujuga muudab õiget tellimust
  const p = await call('PATCH', 'orders/age-2026-0042', { body: { notes: 'ASCII' } });
  assert.equal(p.status, 200);
  assert.equal(p.data.order.number, 'ÄGE-2026-0042');
  for (const bad of ['orders/%E0%A4%A', 'orders/ÄGE-2026-0000', 'orders/%C3%84GE-1999-0001x', 'orders/ÄGE-2026-9999']) {
    assert.equal((await call('GET', bad)).status, 404, bad);
  }
});

test('tellimused: päris/test lüliti — vaikimisi ainult päris tellimused, test=1 ainult testid; loendurid, CSV ja pakkimine järgivad', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2026-0001', name: 'Päris Mari', createdAt: '2026-10-01T08:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0002', name: 'Päris Jüri', createdAt: '2026-10-02T08:00:00Z' });
  await insertOrder({ number: 'TEST-ÄGE-2026-0001', name: 'Test Mari', createdAt: '2026-10-03T08:00:00Z' });

  const live = await call('GET', 'orders');
  assert.deepEqual(live.data.orders.map((o) => o.number), ['ÄGE-2026-0002', 'ÄGE-2026-0001'], 'uuemad ees, testid peidus');
  assert.equal(live.data.total, 2);
  assert.equal(live.data.test, false);
  assert.deepEqual(live.data.counts, { live: 2, test: 1 });

  const test = await call('GET', 'orders?test=1');
  assert.deepEqual(test.data.orders.map((o) => [o.number, o.isTest]), [['TEST-ÄGE-2026-0001', true]]);
  assert.equal(test.data.total, 1);
  assert.equal(test.data.filters.test, true);

  // Otsing ASCII-kujuga leiab testtellimuse testivaates; päris vaates ainult loenduris
  const q = await call('GET', 'orders?q=AGE-2026-0001');
  assert.deepEqual(q.data.orders.map((o) => o.number), ['ÄGE-2026-0001']);
  assert.deepEqual(q.data.counts, { live: 1, test: 1 });
  const qt = await call('GET', 'orders?q=AGE-2026-0001&test=1');
  assert.deepEqual(qt.data.orders.map((o) => o.number), ['TEST-ÄGE-2026-0001']);
  assert.equal((await call('GET', 'orders?test=kõik')).status, 400);

  // CSV järgib lülitit (ja failinimi ütleb, et need on testid)
  const csv = await call('GET', 'orders.csv');
  assert.ok(csv.text.includes('ÄGE-2026-0001') && !csv.text.includes('TEST-ÄGE'));
  const csvTest = await call('GET', 'orders.csv?test=1');
  assert.ok(csvTest.text.includes('TEST-ÄGE-2026-0001') && !csvTest.text.includes('Päris Mari'));
  assert.match(csvTest.res.headers.get('content-disposition'), /age-testtellimused-2026-10-20\.csv/);

  // Pakkimine: vaikimisi päris, test=1 → testid
  const pack = await call('GET', 'packing');
  assert.deepEqual(pack.data.orders.map((o) => o.number), ['ÄGE-2026-0001', 'ÄGE-2026-0002']);
  assert.equal(pack.data.test, false);
  const packTest = await call('GET', 'packing?test=1');
  assert.deepEqual(packTest.data.orders.map((o) => o.number), ['TEST-ÄGE-2026-0001']);
  assert.equal(packTest.data.orders[0].isTest, true);
  assert.equal((await call('GET', 'packing?test=x')).status, 400);
});

test('tellimused: otsing vana numbri, nime ja e-posti järgi; number_desc sorteerib aasta ja järjekorranumbri järgi', async () => {
  await reset();
  await insertOrder({ number: 'ÄGE-2025-0099', name: 'Vana Aasta', email: 'vana@example.ee', legacy: 'AGE-1099', createdAt: '2025-12-31T21:59:00Z' });
  await insertOrder({ number: 'ÄGE-2026-0001', name: 'Uus Aasta', email: 'uus@example.ee', createdAt: '2025-12-31T22:00:00Z' });
  await insertOrder({ number: 'ÄGE-2026-10000', name: 'Suur Number', email: 'suur@example.ee', createdAt: '2026-06-01T10:00:00Z' });
  const nums = async (q) => (await call('GET', `orders${q}`)).data.orders.map((o) => o.number);
  assert.deepEqual(await nums('?q=AGE-1099'), ['ÄGE-2025-0099'], 'vana number');
  assert.deepEqual(await nums('?q=age1099'), ['ÄGE-2025-0099'], 'vana number ilma kriipsuta');
  assert.deepEqual(await nums('?q=uus%20aasta'), ['ÄGE-2026-0001'], 'nimi');
  assert.deepEqual(await nums('?q=SUUR%40example'), ['ÄGE-2026-10000'], 'e-post');
  assert.deepEqual(await nums('?q=2026-10000'), ['ÄGE-2026-10000']);
  assert.deepEqual(await nums('?q=2025'), ['ÄGE-2025-0099']);
  assert.deepEqual(await nums('?sort=number_desc'), ['ÄGE-2026-10000', 'ÄGE-2026-0001', 'ÄGE-2025-0099']);
  assert.deepEqual(await nums('?sort=number_asc'), ['ÄGE-2025-0099', 'ÄGE-2026-0001', 'ÄGE-2026-10000']);
  // Tallinna aja järgi: 31.12.2025 22:00 UTC on juba 2026 → loomise kuupäev 01.01.2026
  assert.deepEqual(await nums('?from=2026-01-01&to=2026-01-01'), ['ÄGE-2026-0001']);
});

/* ---------------------------------------------------------------------------
 * Mängud lattu tagasi (omaniku otsus)
 * ------------------------------------------------------------------------- */

/** Päris voog: tellimus → makstud → laoseis vähendatud (komplektid lahti võetuna). */
async function soldOrder(items, { isTest = false } = {}) {
  const r = validateOrder(validBody({ items }));
  assert.equal(r.ok, true, r.error);
  const created = await createOrder(db, r.order, { isTest });
  const { order } = await markPaid(db, created.id, { paymentIntentId: `pi_${created.id.replace(/-/g, '')}`, amountPaid: created.total_cents });
  await applyInventoryForOrder(db, order);
  return getOrderById(db, created.id);
}
const stockOf = async () => Object.fromEntries((await db.query('SELECT game_id, stock FROM inventory ORDER BY game_id')).map((x) => [x.game_id, x.stock]));
const restock = (number, body = { confirm: true }, opts = {}) => call('POST', `orders/${encodeURIComponent(number)}/restock`, { body, ...opts });

test('lattu tagasi: tagastatud tellimus → mängud (komplekt lahti võetuna) lattu täpselt üks kord; ajalugu ja aeg', async () => {
  await reset();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('mida-viiu', 10), ('oled-semu', 10), ('vigur', 10)");
  const o = await soldOrder([{ id: 'komplekt-koik', qty: 1 }, { id: 'vigur', qty: 1 }]);
  assert.deepEqual(await stockOf(), { 'mida-viiu': 9, 'oled-semu': 9, vigur: 8 });

  // Makstud (raha tagastamata) → ei pakuta ega lubata
  let d = (await call('GET', `orders/${encodeURIComponent(o.number)}`)).data.order;
  assert.equal(d.restock.allowed, false);
  assert.match(d.restock.reason, /raha on tagastatud/);
  let r = await restock(o.number);
  assert.equal(r.status, 409);
  assert.deepEqual(await stockOf(), { 'mida-viiu': 9, 'oled-semu': 9, vigur: 8 });

  // Tagasimakse ise laoseisu EI muuda
  await applyRefund(db, o.stripe_payment_intent_id, o.total_cents);
  assert.deepEqual(await stockOf(), { 'mida-viiu': 9, 'oled-semu': 9, vigur: 8 });
  d = (await call('GET', `orders/${encodeURIComponent(o.number)}`)).data.order;
  assert.equal(d.restock.allowed, true);
  assert.equal(d.restock.restockedAt, null);

  // Kinnituseta → 400
  assert.equal((await restock(o.number, {})).status, 400);
  assert.equal((await restock(o.number, { confirm: 'jah' })).status, 400);

  r = await restock(o.number);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.restock.added, true);
  assert.equal(r.data.restock.movements, 3);
  assert.equal(r.data.order.restock.allowed, false);
  assert.equal(r.data.order.restock.restockedAt, NOW.toISOString());
  assert.equal(r.data.order.restock.restockedAtText, '20.10.2026 13:00');
  assert.equal(r.data.order.events.restockedAt, NOW.toISOString());
  assert.deepEqual(await stockOf(), { 'mida-viiu': 10, 'oled-semu': 10, vigur: 10 });

  // Topeltklõps (ka samaaegselt) ei lisa midagi juurde
  const again = await restock(o.number);
  assert.equal(again.status, 200);
  assert.equal(again.data.restock.added, false);
  await Promise.all([restock(o.number), restock(o.number)]);
  assert.deepEqual(await stockOf(), { 'mida-viiu': 10, 'oled-semu': 10, vigur: 10 });

  // Laoliikumiste ajalugu: 'return' tellimuse numbriga
  const inv = await call('GET', 'inventory');
  const returns = inv.data.movements.filter((m) => m.reason === 'return');
  assert.deepEqual(returns.map((m) => [m.gameId, m.delta]).sort(), [['mida-viiu', 1], ['oled-semu', 1], ['vigur', 2]]);
  assert.ok(returns.every((m) => m.orderNumber === o.number && m.reasonLabel === 'Tellimus lattu tagasi'));
  assert.equal(inv.data.reasons.return, 'Tellimus lattu tagasi');
});

test('lattu tagasi: tühistatud tellimus lubatud; osaliselt tagastatud lubatud; testtellimus ja maksmata keelatud; jälgimata mäng jääb piiramatuks', async () => {
  await reset();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('mida-viiu', 5)");
  const cancelled = await soldOrder([{ id: 'mida-viiu', qty: 2 }, { id: 'vigur', qty: 1 }]);
  // Tühistamine ise laoseisu ei muuda
  assert.equal((await call('PATCH', `orders/${encodeURIComponent(cancelled.number)}`, { body: { fulfillmentStatus: 'cancelled' } })).status, 200);
  assert.deepEqual(await stockOf(), { 'mida-viiu': 3 });
  const r = await restock(cancelled.number);
  assert.equal(r.status, 200);
  assert.equal(r.data.restock.added, true);
  assert.deepEqual(await stockOf(), { 'mida-viiu': 5 }, 'vigur pole jälgitud → rida ei teki');

  const partial = await soldOrder([{ id: 'mida-viiu', qty: 1 }]);
  await applyRefund(db, partial.stripe_payment_intent_id, 500);
  assert.equal((await restock(partial.number)).status, 200);
  assert.deepEqual(await stockOf(), { 'mida-viiu': 5 });

  // Testtellimus: laoseisu ei vähendatud → midagi pole tagasi panna
  const test = await soldOrder([{ id: 'mida-viiu', qty: 1 }], { isTest: true });
  await applyRefund(db, test.stripe_payment_intent_id, test.total_cents);
  const td = (await call('GET', `orders/${encodeURIComponent(test.number)}`)).data.order;
  assert.equal(td.isTest, true);
  assert.equal(td.restock.allowed, false);
  assert.match(td.restock.reason, /Testtellimus/);
  const tr = await restock(test.number);
  assert.equal(tr.status, 409);
  assert.equal(tr.data.code, 'test');
  assert.deepEqual(await stockOf(), { 'mida-viiu': 5 });

  // Maksmata tellimus (laoseisu pole vähendatud)
  const unpaid = await insertOrder({ payment: 'pending', fulfillment: 'cancelled' });
  const ur = await restock(unpaid.number);
  assert.equal(ur.status, 409);
  assert.equal(ur.data.code, 'not_applied');
  assert.equal((await restock('ÄGE-2026-9998')).status, 404);
});

test('lattu tagasi: ilma seansita 401, võõralt päritolult 403, GET 405 — laoseis muutmata', async () => {
  await reset();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('vigur', 3)");
  const o = await soldOrder([{ id: 'vigur', qty: 1 }]);
  await applyRefund(db, o.stripe_payment_intent_id, o.total_cents);
  assert.equal((await restock(o.number, { confirm: true }, { cookie: null })).status, 401);
  assert.equal((await restock(o.number, { confirm: true }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await restock(o.number, { confirm: true }, { origin: null })).status, 403);
  assert.equal((await call('GET', `orders/${encodeURIComponent(o.number)}/restock`)).status, 405);
  assert.deepEqual(await stockOf(), { vigur: 2 });
  assert.equal((await db.query("SELECT count(*)::int AS n FROM inventory_movements WHERE reason = 'return'"))[0].n, 0);
});

/* ---------------------------------------------------------------------------
 * Väljalogimine
 * ------------------------------------------------------------------------- */

test('väljalogimine tühistab küpsise', async () => {
  const r = await call('POST', 'logout');
  assert.equal(r.status, 200);
  const sc = r.res.headers.get('set-cookie');
  assert.match(sc, /^age_admin=;/);
  assert.match(sc, /Max-Age=0/);
  assert.match(sc, /HttpOnly/);
});

test('sisselogimise aadress marsruuteris suunatakse sisselogimise käsitlejasse (mitte 401)', async () => {
  const res = await api(new Request(`${ORIGIN}/api/admin/login`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test parool 12345' }) }), { ip: '10.0.0.1' });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /^age_admin=/);
});
