// Tellimuse number ÄGE-AAAA-NNNN: vorming, aastavahetus Tallinna aja järgi, päris/test loendurid,
// samaaegsed ostud, numbri püsivus (makse kordus, webhooki kordus, kirja kordus) ja vanade
// AGE-1001 numbrite üleminek (ka Neoni lauseteks jagamisega).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { wrapPglite, splitStatements } from '../netlify/functions/_lib/db.mjs';
import { SCHEMA_SQL } from '../netlify/functions/_lib/schema.mjs';
import { validateOrder } from '../netlify/functions/_lib/order.mjs';
import {
  createOrder,
  attachCheckoutSession,
  markPaid,
  markFailed,
  markExpired,
  getOrderById,
  getOrderByNumber,
  releaseOrderFlag,
} from '../netlify/functions/_lib/orders.mjs';
import { ensurePaidSideEffects } from '../netlify/functions/_lib/payments.mjs';
import { createWithdrawal } from '../netlify/functions/_lib/withdrawals.mjs';
import { listWithdrawals } from '../netlify/functions/_lib/admin-withdrawals.mjs';
import { getMovements } from '../netlify/functions/_lib/admin-inventory.mjs';
import { listOrders, parseOrderFilters } from '../netlify/functions/_lib/admin-orders.mjs';
import {
  padSeq,
  formatOrderNumber,
  parseOrderNumber,
  asciiOrderNumber,
  normalizeOrderNumber,
  isCanonicalOrderNumber,
} from '../public/assets/js/order-number.js';
import { validBody, freshDb, captureMailer, silentLogger } from './helpers.mjs';

const orderOf = (overrides) => {
  const r = validateOrder(validBody(overrides));
  assert.equal(r.ok, true, r.error);
  return r.order;
};
const counters = async (db) =>
  Object.fromEntries((await db.query('SELECT scope, year, last_value FROM order_counters ORDER BY scope, year')).map((r) => [`${r.scope}:${r.year}`, r.last_value]));

/* ---------------------------------------------------------------------------
 * Vorming ja sisestuse tuvastamine
 * ------------------------------------------------------------------------- */

test('vorming: 4-kohaline nullidega täidetud järjekorranumber, üle 9999 jätkub 5 kohaga (ei lõigata)', () => {
  assert.equal(padSeq(1), '0001');
  assert.equal(padSeq(42), '0042');
  assert.equal(padSeq(9999), '9999');
  assert.equal(padSeq(10000), '10000');
  assert.equal(padSeq(123456), '123456');
  assert.equal(formatOrderNumber({ year: 2026, seq: 1 }), 'ÄGE-2026-0001');
  assert.equal(formatOrderNumber({ year: 2026, seq: 9999 }), 'ÄGE-2026-9999');
  assert.equal(formatOrderNumber({ year: 2026, seq: 10000 }), 'ÄGE-2026-10000');
  assert.equal(formatOrderNumber({ year: 2027, seq: 7, test: true }), 'TEST-ÄGE-2027-0007');
  assert.equal(asciiOrderNumber('TEST-ÄGE-2026-0001'), 'TEST-AGE-2026-0001');
  assert.ok(isCanonicalOrderNumber('ÄGE-2026-0001'));
  assert.ok(isCanonicalOrderNumber('TEST-ÄGE-2026-10000'));
  assert.ok(!isCanonicalOrderNumber('AGE-2026-0001'));
  assert.ok(!isCanonicalOrderNumber('ÄGE-2026-001'));
});

test('sisestus: ÄGE/AGE, väike- ja suurtähed, tühikud, kriipsud, NFD-täpitäht → õige kuju; vana vorm eraldi', () => {
  const same = ['ÄGE-2026-0001', 'äge-2026-0001', 'AGE-2026-0001', 'age 2026 0001', ' ÄGE – 2026 — 0001 ', 'AGE20260001', '#ÄGE-2026-1', '2026-0001', '2026 1', 'A\u0308GE-2026-0001', 'a\u0308ge-2026-0001'];
  for (const s of same) assert.deepEqual(parseOrderNumber(s), { number: 'ÄGE-2026-0001', test: false, year: 2026, seq: 1, legacy: false }, s);
  assert.equal(normalizeOrderNumber('test age 2026 12'), 'TEST-ÄGE-2026-0012');
  assert.equal(normalizeOrderNumber('TEST-AGE-2026-10000'), 'TEST-ÄGE-2026-10000');
  assert.equal(normalizeOrderNumber('ÄGE-2026-00042'), 'ÄGE-2026-0042', 'liigsed nullid eemaldatakse');
  assert.deepEqual(parseOrderNumber('age-1001'), { number: 'AGE-1001', test: false, year: null, seq: null, legacy: true });
  assert.equal(normalizeOrderNumber('AGE-2026'), 'AGE-2026', 'vana number 2026 (aasta + number puudub) on vana vorm');
  for (const bad of ['', '   ', '0001', '2026', 'ÄGE-1001', 'ÄGE-2026-0000', 'ÄGE-1999-0001', 'ÄGE-2026-', 'x'.repeat(41), 'ÄGE-2026-0001; DROP', null, undefined, {}, []]) {
    assert.equal(parseOrderNumber(bad), null, String(bad));
  }
});

/* ---------------------------------------------------------------------------
 * Numbri andmine andmebaasis
 * ------------------------------------------------------------------------- */

test('createOrder: number antakse salvestamisel, aasta sees järjest, uus aasta algab 0001-st', async () => {
  const db = await freshDb();
  const a = await createOrder(db, orderOf(), { now: '2026-03-01T10:00:00Z' });
  const b = await createOrder(db, orderOf(), { now: '2026-06-01T10:00:00Z' });
  const c = await createOrder(db, orderOf(), { now: '2027-01-15T10:00:00Z' });
  const d = await createOrder(db, orderOf(), { now: '2027-02-15T10:00:00Z' });
  assert.deepEqual([a, b, c, d].map((o) => o.number), ['ÄGE-2026-0001', 'ÄGE-2026-0002', 'ÄGE-2027-0001', 'ÄGE-2027-0002']);
  assert.deepEqual([a, b, c, d].map((o) => [o.number_year, o.number_seq]), [[2026, 1], [2026, 2], [2027, 1], [2027, 2]]);
  assert.deepEqual(await counters(db), { 'live:2026': 2, 'live:2027': 2 });
  // Vanasse aastasse (nt kell valesti) jätkub selle aasta loendur — numbrid ei kordu
  const late = await createOrder(db, orderOf(), { now: '2026-12-01T10:00:00Z' });
  assert.equal(late.number, 'ÄGE-2026-0003');
});

test('createOrder: aasta Tallinna aja järgi — 31.12 kell 23:59 on vana aasta, 2026-12-31T22:30Z on juba 2027', async () => {
  const db = await freshDb();
  // Tallinn talvel UTC+2: 31.12.2026 23:59 Tallinnas = 21:59 UTC
  const lastMinute = await createOrder(db, orderOf(), { now: '2026-12-31T21:59:00Z' });
  const newYear = await createOrder(db, orderOf(), { now: '2026-12-31T22:00:00Z' }); // 01.01.2027 00:00 Tallinnas
  const utcStillOld = await createOrder(db, orderOf(), { now: '2026-12-31T22:30:00Z' }); // UTC-s veel 2026
  assert.equal(lastMinute.number, 'ÄGE-2026-0001');
  assert.equal(newYear.number, 'ÄGE-2027-0001');
  assert.equal(utcStillOld.number, 'ÄGE-2027-0002');
  // Suvel UTC+3: 30.06 kell 23:30 Tallinnas on veel 2026 (aastavahetus ei muutu)
  assert.equal((await createOrder(db, orderOf(), { now: '2026-06-30T20:30:00Z' })).number, 'ÄGE-2026-0002');
  // Ilma süstitud ajata kasutatakse andmebaasi kella (Tallinna aasta)
  const [{ y }] = await db.query("SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Tallinn'))::int AS y");
  const now = await createOrder(db, orderOf());
  assert.equal(now.number_year, y);
});

test('createOrder: päris ja test eraldi loendurite ja eesliidetega', async () => {
  const db = await freshDb();
  const at = { now: '2026-04-01T09:00:00Z' };
  const l1 = await createOrder(db, orderOf(), at);
  const t1 = await createOrder(db, orderOf(), { ...at, isTest: true });
  const t2 = await createOrder(db, orderOf(), { ...at, isTest: true });
  const l2 = await createOrder(db, orderOf(), at);
  assert.deepEqual([l1, t1, t2, l2].map((o) => o.number), ['ÄGE-2026-0001', 'TEST-ÄGE-2026-0001', 'TEST-ÄGE-2026-0002', 'ÄGE-2026-0002']);
  assert.deepEqual([l1, t1, t2, l2].map((o) => o.is_test), [false, true, true, false]);
  assert.deepEqual(await counters(db), { 'live:2026': 2, 'test:2026': 2 });
});

test('createOrder: üle 9999 → 5-kohaline number (ÄGE-2026-10000), mitte lõigatud', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO order_counters (scope, year, last_value) VALUES ('live', 2026, 9998)");
  const a = await createOrder(db, orderOf(), { now: '2026-05-01T10:00:00Z' });
  const b = await createOrder(db, orderOf(), { now: '2026-05-01T10:00:00Z' });
  const c = await createOrder(db, orderOf(), { now: '2026-05-01T10:00:00Z' });
  assert.deepEqual([a, b, c].map((o) => o.number), ['ÄGE-2026-9999', 'ÄGE-2026-10000', 'ÄGE-2026-10001']);
  assert.deepEqual(
    (await db.query('SELECT number FROM orders ORDER BY number_seq')).map((r) => r.number),
    ['ÄGE-2026-9999', 'ÄGE-2026-10000', 'ÄGE-2026-10001'],
  );
});

test('createOrder: 40 samaaegset ostu → kõik erinevad, järjestikused numbrid', async () => {
  const db = await freshDb();
  const all = await Promise.all(Array.from({ length: 40 }, (_, i) => createOrder(db, orderOf(), { now: '2026-08-01T10:00:00Z', isTest: i % 5 === 0 })));
  const live = all.filter((o) => !o.is_test).map((o) => o.number_seq).sort((a, b) => a - b);
  const tests = all.filter((o) => o.is_test).map((o) => o.number_seq).sort((a, b) => a - b);
  assert.deepEqual(live, Array.from({ length: 32 }, (_, i) => i + 1));
  assert.deepEqual(tests, Array.from({ length: 8 }, (_, i) => i + 1));
  assert.equal(new Set(all.map((o) => o.number)).size, 40);
  assert.deepEqual(await counters(db), { 'live:2026': 32, 'test:2026': 8 });
});

test('createOrder: number on unikaalne (andmebaasi piirang); kadunud loendur ei anna kunagi sama numbrit uuesti', async () => {
  const db = await freshDb();
  const a = await createOrder(db, orderOf(), { now: '2026-02-01T10:00:00Z' });
  const b = await createOrder(db, orderOf(), { now: '2026-02-01T10:00:00Z' });
  // Kaks rida sama numbriga või sama (is_test, aasta, järjekorranumber) ei ole võimalik
  await assert.rejects(() => db.query('UPDATE orders SET number = $1 WHERE id = $2', [a.number, b.id]), /unique|duplicate/i);
  await assert.rejects(() => db.query('UPDATE orders SET number_seq = $1 WHERE id = $2', [a.number_seq, b.id]), /unique|duplicate/i);
  // Loenduri rida kustutati (nt käsitsi) → jätkub suurimast olemasolevast numbrist
  await db.query('DELETE FROM order_counters');
  const next = await createOrder(db, orderOf(), { now: '2026-02-01T10:00:00Z' });
  assert.equal(next.number, 'ÄGE-2026-0003');
  // Loendur jäi kogemata maha → ikka suurima olemasoleva järel
  await db.query("UPDATE order_counters SET last_value = 1 WHERE scope = 'live' AND year = 2026");
  assert.equal((await createOrder(db, orderOf(), { now: '2026-02-01T10:00:00Z' })).number, 'ÄGE-2026-0004');
});

test('number on püsiv: makse kordus, aegumine → makse, kinnituskirja kordus ja makselehe jätkamine ei muuda numbrit', async () => {
  const db = await freshDb();
  const o = await createOrder(db, orderOf(), { now: '2026-09-01T10:00:00Z' });
  const before = await counters(db);
  await attachCheckoutSession(db, o.id, { sessionId: 'cs_test_resume1', url: 'https://checkout.stripe.com/x', expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  await attachCheckoutSession(db, o.id, { sessionId: 'cs_test_resume1', url: 'https://checkout.stripe.com/x', expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  await markExpired(db, o.id);
  await markFailed(db, o.id);
  await markPaid(db, o.id, { paymentIntentId: 'pi_retry', amountPaid: o.total_cents });
  await markPaid(db, o.id, { paymentIntentId: 'pi_retry', amountPaid: o.total_cents });
  const mailer = captureMailer();
  const paid = await getOrderById(db, o.id);
  await ensurePaidSideEffects(db, paid, { mailer, env: { ADMIN_EMAIL: '' }, logger: silentLogger() });
  await releaseOrderFlag(db, o.id, 'confirmation_sent_at'); // „saada kinnitus uuesti“
  await ensurePaidSideEffects(db, await getOrderById(db, o.id), { mailer, env: { ADMIN_EMAIL: '' }, logger: silentLogger() });
  assert.equal(mailer.sent.length, 2);
  assert.ok(mailer.sent.every((m) => m.subject === 'Tellimus ÄGE-2026-0001 on makstud — aitäh!'));
  const after = await getOrderById(db, o.id);
  assert.equal(after.number, 'ÄGE-2026-0001');
  assert.equal(after.number_seq, 1);
  assert.deepEqual(await counters(db), before, 'loendur ei liikunud');
  // Uus tellimus saab järgmise numbri; tühistatud/aegunud numbreid ei kasutata uuesti
  const next = await createOrder(db, orderOf(), { now: '2026-09-02T10:00:00Z' });
  assert.equal(next.number, 'ÄGE-2026-0002');
});

/* ---------------------------------------------------------------------------
 * Vanade numbrite üleminek (AGE-1001 → ÄGE-AAAA-NNNN)
 * ------------------------------------------------------------------------- */

const MARKER = '-- ---------------------------------------------------------------------------\n-- Tellimuse number ÄGE-AAAA-NNNN';

/** Vana skeem = praegune skeem ILMA uue numeratsiooni osata (nagu enne seda muudatust). */
function oldSchema() {
  const i = SCHEMA_SQL.indexOf(MARKER);
  assert.ok(i > 0, 'skeemis on uue numeratsiooni osa marker');
  return SCHEMA_SQL.slice(0, i);
}

async function legacyDb({ neon = false } = {}) {
  const pg = new PGlite();
  await pg.waitReady;
  const db = wrapPglite(pg);
  // Neoni HTTP-draiver: skeem jagatakse lauseteks ja iga lause on eraldi päring.
  const apply = async (sql) => {
    if (neon) for (const stmt of splitStatements(sql)) await pg.query(stmt);
    else await db.exec(sql);
  };
  await apply(oldSchema());
  const ins = (number, createdAt, sessionId) =>
    db.query(
      `INSERT INTO orders (id, number, public_token, created_at, customer_name, customer_email, customer_phone, items,
         subtotal_cents, shipping_cents, total_cents, carrier, carrier_name, locker_name, payment_status, stripe_session_id)
       VALUES ($1, $2, $3, $4, 'Vana Klient', 'vana@example.ee', '+37250000000', '[]'::jsonb, 1750, 299, 2049, 'omniva', 'Omniva pakiautomaat', 'Automaat', 'paid', $5)
       RETURNING id`,
      [randomUUID(), number, randomBytes(32).toString('base64url'), createdAt, sessionId],
    ).then((r) => r[0].id);
  const ids = {
    // Tallinnas 31.12.2025 23:30 → 2025; testvõtmega
    a: await ins('AGE-1001', '2025-12-31T21:30:00Z', 'cs_test_a'),
    // Tallinnas 01.01.2026 00:30 → 2026; päris makse
    b: await ins('AGE-1002', '2025-12-31T22:30:00Z', 'cs_live_b'),
    c: await ins('AGE-1003', '2026-03-01T10:00:00Z', 'cs_live_c'),
    // Test 2026: loodud HILJEM kui e, aga väiksema vana numbriga → järjekord loomise aja järgi
    d: await ins('AGE-1004', '2026-02-01T10:00:00Z', null),
    e: await ins('AGE-1005', '2026-01-15T10:00:00Z', 'cs_test_e'),
  };
  await db.query("INSERT INTO stripe_events (id, type, order_id, processed_at) VALUES ('evt_old_1', 'checkout.session.completed', $1, now())", [ids.c]);
  await db.query("INSERT INTO inventory_movements (game_id, delta, reason, order_id, note) VALUES ('vigur', -1, 'sale', $1, 'Tellimus AGE-1002')", [ids.b]);
  await db.query(
    `INSERT INTO withdrawals (id, reference, customer_name, customer_email, order_number) VALUES ($1, 'TAG-AAAAAA', 'Vana Klient', 'vana@example.ee', 'AGE-1003')`,
    [randomUUID()],
  );
  return { db, pg, ids, apply };
}

async function assertMigrated(db, ids) {
  const rows = Object.fromEntries(
    (await db.query('SELECT id, number, legacy_number, is_test, number_year, number_seq FROM orders')).map((r) => [r.id, r]),
  );
  const pick = (k) => {
    const r = rows[ids[k]];
    return [r.number, r.legacy_number, r.is_test, r.number_year, r.number_seq];
  };
  assert.deepEqual(pick('a'), ['TEST-ÄGE-2025-0001', 'AGE-1001', true, 2025, 1]);
  assert.deepEqual(pick('b'), ['ÄGE-2026-0001', 'AGE-1002', false, 2026, 1]);
  assert.deepEqual(pick('c'), ['ÄGE-2026-0002', 'AGE-1003', false, 2026, 2]);
  assert.deepEqual(pick('e'), ['TEST-ÄGE-2026-0001', 'AGE-1005', true, 2026, 1]);
  assert.deepEqual(pick('d'), ['TEST-ÄGE-2026-0002', 'AGE-1004', true, 2026, 2]);
  assert.deepEqual(await counters(db), { 'live:2026': 2, 'test:2025': 1, 'test:2026': 2 });
  // Seosed säilisid (id järgi) ja tekstina salvestatud number uuendati
  assert.equal((await db.query("SELECT order_id FROM stripe_events WHERE id = 'evt_old_1'"))[0].order_id, ids.c);
  const [mv] = await db.query('SELECT order_id, note FROM inventory_movements');
  assert.deepEqual([mv.order_id, mv.note], [ids.b, 'Tellimus ÄGE-2026-0001']);
  assert.equal((await db.query("SELECT order_number FROM withdrawals WHERE reference = 'TAG-AAAAAA'"))[0].order_number, 'ÄGE-2026-0002');
}

for (const neon of [false, true]) {
  test(`üleminek${neon ? ' (Neoni lauseteks jagamisega)' : ''}: vanad numbrid → loomise aja järjekorras, päris/test ja Tallinna aasta kaupa; seosed säilivad; teine käivitus ei muuda midagi`, async () => {
    const { db, pg, ids, apply } = await legacyDb({ neon });
    await apply(SCHEMA_SQL);
    await assertMigrated(db, ids);

    // Idempotentne: iga külmkäivitus käivitab skeemi uuesti
    const snapshot = await db.query('SELECT id, number, legacy_number, number_seq FROM orders ORDER BY id');
    await apply(SCHEMA_SQL);
    await apply(SCHEMA_SQL);
    assert.deepEqual(await db.query('SELECT id, number, legacy_number, number_seq FROM orders ORDER BY id'), snapshot);
    await assertMigrated(db, ids);

    // Uued tellimused jätkavad pärast vanu (numbrid ei kordu)
    assert.equal((await createOrder(db, orderOf(), { now: '2026-05-01T10:00:00Z' })).number, 'ÄGE-2026-0003');
    assert.equal((await createOrder(db, orderOf(), { now: '2026-05-01T10:00:00Z', isTest: true })).number, 'TEST-ÄGE-2026-0003');

    // Vana number on endiselt otsitav ja leitav
    assert.equal((await getOrderByNumber(db, 'age-1003')).id, ids.c);
    const f = parseOrderFilters(new URLSearchParams('q=AGE-1003'));
    assert.deepEqual((await listOrders(db, f.value)).orders.map((o) => [o.number, o.legacyNumber]), [['ÄGE-2026-0002', 'AGE-1003']]);
    const ft = parseOrderFilters(new URLSearchParams('q=1005&test=1'));
    assert.deepEqual((await listOrders(db, ft.value)).orders.map((o) => o.number), ['TEST-ÄGE-2026-0001']);

    // Taganemisavaldused: vana numbriga avaldus on seotud tellimusega; uus vana numbriga avaldus saab uue numbri
    const wd = await listWithdrawals(db, {});
    assert.equal(wd.withdrawals[0].orderFound, true);
    assert.equal(wd.withdrawals[0].orderNumber, 'ÄGE-2026-0002');
    const created = await createWithdrawal(db, { name: 'Vana Klient', email: 'vana@example.ee', orderNumber: 'AGE-1002', receivedDate: null, items: '', message: '' });
    assert.equal(created.order_number, 'ÄGE-2026-0001');

    // Laoliikumiste ajalugu näitab uut numbrit
    const moves = await getMovements(db, {});
    assert.equal(moves[0].orderNumber, 'ÄGE-2026-0001');
    await pg.close();
  });
}

test('üleminek: vana rida, mille kõrval on juba uue numbriga ridu, saab järgmise vaba numbri (mitte duplikaadi)', async () => {
  const db = await freshDb();
  await createOrder(db, orderOf(), { now: '2026-04-01T10:00:00Z' }); // ÄGE-2026-0001 (päris)
  // Vana rida ilma uue numbrita (nt tagantjärele imporditud): cs_live_ → päris
  await db.query(
    `INSERT INTO orders (id, number, public_token, created_at, customer_name, customer_email, customer_phone, items,
       subtotal_cents, shipping_cents, total_cents, carrier, carrier_name, locker_name, stripe_session_id)
     VALUES ($1, 'AGE-1500', $2, '2026-01-01T10:00:00Z', 'X', 'x@example.ee', '+37250000000', '[]'::jsonb, 1, 0, 1, 'omniva', 'Omniva', 'A', 'cs_live_zz')`,
    [randomUUID(), randomBytes(32).toString('base64url')],
  );
  await db.exec(SCHEMA_SQL);
  const [row] = await db.query("SELECT number, legacy_number FROM orders WHERE legacy_number = 'AGE-1500'");
  assert.equal(row.number, 'ÄGE-2026-0002');
  assert.equal((await createOrder(db, orderOf(), { now: '2026-04-02T10:00:00Z' })).number, 'ÄGE-2026-0003');
});
