// Statistika ja kalender: ainult TASUTUD tellimused (paid_at järgi, Tallinna päevad),
// komplektid ei topelda müügisummat, tagasimaksed ja tarne eraldi, keskmine ostukorv,
// populaarsemad tooted, mängude ühikud, saatmist ootavad ja kalendri päevad.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createMemoryDb } from '../netlify/functions/_lib/db.mjs';
import { createAdminApi } from '../netlify/functions/_lib/admin-api.mjs';
import { authConfig, createSessionToken, hashPassword } from '../netlify/functions/_lib/admin-auth.mjs';
import { computeStats, allocateDiscount, METRIC_INFO, PAID_STATUSES } from '../netlify/functions/_lib/stats.mjs';
import { computeTotals, SHIPPING, PRODUCTS, toCents } from '../public/assets/js/catalog.js';
import { itemsSnapshot } from '../netlify/functions/_lib/orders.mjs';
import { formatOrderNumber } from '../public/assets/js/order-number.js';
import { tallinnRange } from '../netlify/functions/_lib/time.mjs';

const ORIGIN = 'https://age.example';
const ENV = { ADMIN_PASSWORD_HASH: hashPassword('stat parool 12345', { N: 1024 }), ADMIN_SESSION_SECRET: 'q'.repeat(48) };
const NOW = new Date('2026-05-02T09:00:00Z');
const COOKIE = `age_admin=${createSessionToken(authConfig(ENV), { now: NOW })}`;
const silent = { log() {}, warn() {}, error() {} };

let db;
let api;
const orders = {};

async function get(path) {
  const res = await api(new Request(`${ORIGIN}/api/admin/${path}`, { headers: { cookie: COOKIE } }), {});
  return { status: res.status, data: await res.json() };
}

let n = 0;
async function insert(key, { items, code = '', carrier = 'omniva', payment = 'paid', paidAt = null, createdAt = null, refunded = 0, fulfillment = 'new', amountPaid = undefined, test = false }) {
  const t = computeTotals(items, code, carrier);
  const paid = PAID_STATUSES.includes(payment);
  const created = createdAt || paidAt || '2026-04-15T10:00:00Z';
  const seq = ++n;
  const [row] = await db.query(
    `INSERT INTO orders (id, number, public_token, created_at, customer_name, customer_email, customer_phone, items,
       subtotal_cents, discount_code, discount_cents, shipping_cents, total_cents, carrier, carrier_name, locker_name,
       payment_status, paid_at, amount_paid_cents, refunded_cents, fulfillment_status, is_test, number_year, number_seq)
     VALUES ($1,$2,$3,$4,'Klient ' || $2,'k@example.ee','+37250000000',$5::jsonb,$6,$7,$8,$9,$10,$11,$12,'Automaat',$13,$14,$15,$16,$17,$18,2026,$19) RETURNING *`,
    [
      randomUUID(),
      formatOrderNumber({ year: 2026, seq, test }),
      randomBytes(32).toString('base64url'),
      created,
      JSON.stringify(itemsSnapshot(t)),
      t.subtotalCents,
      t.code,
      t.discountCents,
      t.shippingCents,
      t.totalCents,
      carrier,
      SHIPPING.carriers[carrier].label,
      payment,
      paid ? paidAt : null,
      paid ? (amountPaid ?? t.totalCents) : null,
      payment === 'refunded' && !refunded ? t.totalCents : refunded,
      fulfillment,
      test,
      seq,
    ],
  );
  orders[key] = row;
  return row;
}

before(async () => {
  db = await createMemoryDb();
  api = createAdminApi({ env: ENV, now: () => NOW, logger: silent, getDb: async () => db });

  // Aprill 2026 (Tallinnas UTC+3): tasutud
  await insert('A', { items: [{ id: 'komplekt-koik', qty: 1 }], paidAt: '2026-04-05T10:00:00Z', fulfillment: 'shipped' }); // 33 €, tasuta tarne
  await insert('B', { items: [{ id: 'mida-viiu', qty: 2 }], code: 'AGE15', paidAt: '2026-04-05T12:00:00Z' }); // soodustusega, tarne 2,99
  await insert('C', { items: [{ id: 'oled-semu', qty: 1 }], payment: 'partially_refunded', refunded: 500, paidAt: '2026-04-10T10:00:00Z', fulfillment: 'packed' });
  await insert('D', { items: [{ id: 'vigur', qty: 1 }], payment: 'refunded', paidAt: '2026-04-12T10:00:00Z', fulfillment: 'cancelled' });
  // Tallinnas 01.04 kell 02:30 → kuulub APRILLI
  await insert('H', { items: [{ id: 'mida-viiu', qty: 1 }], paidAt: '2026-03-31T23:30:00Z', createdAt: '2026-03-31T23:28:00Z' });
  // Loodud märtsis, makse laekus aprillis → aprilli müük (paid_at järgi)
  await insert('K', { items: [{ id: 'komplekt-semu-vigur', qty: 2 }], paidAt: '2026-04-20T08:00:00Z', createdAt: '2026-03-20T08:00:00Z', fulfillment: 'delivered' });
  // EI ole tasutud → ei loeta
  await insert('E', { items: [{ id: 'komplekt-koik', qty: 3 }], payment: 'pending', createdAt: '2026-04-06T10:00:00Z' });
  await insert('F', { items: [{ id: 'mida-viiu', qty: 1 }], payment: 'expired', createdAt: '2026-04-07T10:00:00Z' });
  await insert('G', { items: [{ id: 'vigur', qty: 2 }], payment: 'failed', createdAt: '2026-04-08T10:00:00Z' });
  await insert('P', { items: [{ id: 'vigur', qty: 1 }], payment: 'processing', createdAt: '2026-04-09T10:00:00Z' });
  // Väljaspool aprilli (Tallinna aja järgi)
  await insert('I', { items: [{ id: 'oled-semu', qty: 1 }], paidAt: '2026-03-31T20:30:00Z' }); // 31.03 23:30 Tallinnas
  await insert('J', { items: [{ id: 'vigur', qty: 1 }], paidAt: '2026-04-30T21:30:00Z' }); // 01.05 00:30 Tallinnas
  // Testtellimused (Stripe'i testrežiim) — ei lähe ühtegi numbrisse, ka saatmist ootavatesse mitte
  await insert('T', { items: [{ id: 'komplekt-koik', qty: 5 }], paidAt: '2026-04-05T11:00:00Z', test: true });
  await insert('U', { items: [{ id: 'vigur', qty: 1 }], paidAt: '2026-04-01T10:00:00Z', fulfillment: 'packed', test: true });
});

const PAID_APRIL = ['A', 'B', 'C', 'D', 'H', 'K'];
const sum = (keys, col) => keys.reduce((s, k) => s + Number(orders[k][col]), 0);

test('statistika: ainult tasutud tellimused, brutomüük/tarne/tagasimaksed eraldi, netokäive', async () => {
  const { status, data } = await get('stats?from=2026-04-01&to=2026-04-30');
  assert.equal(status, 200);
  const t = data.totals;
  assert.equal(t.orders, PAID_APRIL.length);
  const gross = PAID_APRIL.reduce((s, k) => s + orders[k].subtotal_cents - orders[k].discount_cents, 0);
  assert.equal(t.grossSalesCents, gross, 'toodete müük pärast soodustust, ilma tarneta');
  assert.equal(t.shippingCents, sum(PAID_APRIL, 'shipping_cents'));
  assert.ok(t.shippingCents > 0 && t.shippingCents < 6 * 299, 'osadel tasuta tarne');
  assert.equal(t.refundsCents, 500 + orders.D.total_cents, 'osaline + täielik tagasimakse');
  assert.equal(t.netRevenueCents, gross + t.shippingCents - t.refundsCents);
  assert.equal(t.avgOrderCents, Math.round(sum(PAID_APRIL, 'total_cents') / PAID_APRIL.length));
  assert.equal(t.discountCents, orders.B.discount_cents);
  assert.equal(orders.B.discount_cents, Math.round(toCents(PRODUCTS['mida-viiu'].price) * 2 * 0.15));

  // Mitte-tasutud (pending/expired/failed/processing) ja teise kuu tellimused EI ole sees
  const counted = new Set(data.orders.map((o) => o.number));
  for (const k of ['E', 'F', 'G', 'P', 'I', 'J', 'T', 'U']) assert.ok(!counted.has(orders[k].number), `${k} ei tohi olla arvestatud`);
  assert.match(orders.T.number, /^TEST-ÄGE-2026-/);
  for (const k of PAID_APRIL) assert.ok(counted.has(orders[k].number), `${k} peab olema arvestatud`);
});

test('statistika: komplektid ei topelda müügisummat; mängude ühikud eraldi', async () => {
  const { data } = await get('stats?from=2026-04-01&to=2026-04-30');
  // Toodete tulu kokku == toodete müük (soodustus jagatud ridade vahel, komplekt omaette tootena)
  const productRevenue = data.products.reduce((s, p) => s + p.revenueCents, 0);
  assert.equal(productRevenue, data.totals.grossSalesCents);
  const p = Object.fromEntries(data.products.map((x) => [x.id, x]));
  assert.equal(p['komplekt-koik'].revenueCents, 3300);
  assert.equal(p['komplekt-koik'].bundle, true);
  assert.equal(p['komplekt-semu-vigur'].qty, 2);
  assert.equal(p['komplekt-semu-vigur'].revenueCents, 4000);
  assert.equal(p['mida-viiu'].qty, 3); // B: 2 + H: 1
  assert.equal(p['mida-viiu'].revenueCents, orders.B.subtotal_cents - orders.B.discount_cents + orders.H.subtotal_cents);
  assert.equal(data.products[0].id, 'mida-viiu', 'populaarseim koguse järgi');

  // Mängude ühikud: komplektid lahti võetuna, rahasummat pole
  const g = Object.fromEntries(data.games.map((x) => [x.id, x]));
  assert.deepEqual([g['mida-viiu'].units, g['mida-viiu'].single, g['mida-viiu'].inBundles], [4, 3, 1]);
  assert.deepEqual([g['oled-semu'].units, g['oled-semu'].single, g['oled-semu'].inBundles], [4, 1, 3]);
  assert.deepEqual([g.vigur.units, g.vigur.single, g.vigur.inBundles], [4, 1, 3]);
  assert.equal(data.totals.unitsSold, 12);
  assert.ok(data.games.every((x) => !('revenueCents' in x)), 'mängude tabelis pole rahasummasid');
});

test('statistika: paid_at ja Tallinna päevapiirid (23:30 UTC 31.03 = 01.04)', async () => {
  const april1 = await get('stats?period=day&date=2026-04-01');
  assert.equal(april1.data.totals.orders, 1);
  assert.deepEqual(april1.data.orders.map((o) => o.number), [orders.H.number]);
  assert.equal(april1.data.orders[0].paidAtText, '01.04.2026 02:30');

  const march31 = await get('stats?period=day&date=2026-03-31');
  assert.deepEqual(march31.data.orders.map((o) => o.number), [orders.I.number]);

  const march = await get('stats?period=month&date=2026-03-10');
  assert.equal(march.data.totals.orders, 1, 'märtsis ainult I (K loodi märtsis, aga maksti aprillis)');

  const may1 = await get('stats?period=day&date=2026-05-01');
  assert.deepEqual(may1.data.orders.map((o) => o.number), [orders.J.number]);

  // Päevaread graafikuks: 30 päeva, 01.04 on esimene ja sisaldab H-d
  const { data } = await get('stats?from=2026-04-01&to=2026-04-30');
  assert.equal(data.daily.length, 30);
  assert.equal(data.daily[0].date, '2026-04-01');
  assert.equal(data.daily[0].orders, 1);
  assert.equal(data.daily.find((d) => d.date === '2026-04-05').orders, 2);
  assert.equal(data.daily.reduce((s, d) => s + d.grossCents, 0), data.totals.grossSalesCents);
  assert.deepEqual(data.monthly.map((m) => m.month), ['2026-04']);

  const year = await get('stats?period=year&date=2026-04-01');
  assert.equal(year.data.monthly.length, 12);
  assert.equal(year.data.monthly.find((m) => m.month === '2026-03').orders, 1);
  assert.equal(year.data.monthly.find((m) => m.month === '2026-04').orders, 6);
  assert.equal(year.data.monthly.find((m) => m.month === '2026-05').orders, 1);
  assert.equal(year.data.orders, null, 'pikal vahemikul tellimuste nimekirja ei saadeta');
});

test('statistika: saatmist ootavad = makstud (sh osaliselt tagastatud) ja uus/pakitud, vanimad ees', async () => {
  const { data } = await get('stats?period=month&date=2026-04-01');
  const pend = data.pending;
  // B, H, I, J (paid/new), C (partially_refunded/packed); A shipped, D refunded/cancelled, K delivered; T, U testid
  assert.equal(pend.count, 5);
  assert.equal(pend.packed, 1);
  assert.equal(pend.new, 4);
  assert.deepEqual(
    pend.orders.map((o) => o.number),
    ['I', 'H', 'B', 'C', 'J'].map((k) => orders[k].number),
  );
  assert.ok(pend.description.length > 20);
});

test('statistika: iga näitaja juures on selgitus', async () => {
  const { data } = await get('stats?period=month&date=2026-04-01');
  assert.ok(data.metrics.length >= 8);
  for (const m of data.metrics) {
    assert.ok(m.label && m.description && m.description.length > 20, m.key);
    assert.equal(m.description, METRIC_INFO[m.key].description);
  }
  for (const key of ['products', 'games', 'daily', 'monthly']) assert.ok(data.info[key], key);
  assert.equal(data.range.label, 'aprill 2026');
});

test('kalender: kuu iga päev, tasutud tellimuste arv ja summa Tallinna päevade järgi', async () => {
  const { status, data } = await get('calendar?month=2026-04');
  assert.equal(status, 200);
  assert.equal(data.days.length, 30);
  assert.equal(data.label, 'aprill 2026');
  assert.equal(data.firstWeekday, 3, '01.04.2026 on kolmapäev');
  assert.equal(data.prevMonth, '2026-03');
  assert.equal(data.nextMonth, '2026-05');
  const day = Object.fromEntries(data.days.map((d) => [d.date, d]));
  assert.equal(day['2026-04-01'].orders, 1);
  assert.equal(day['2026-04-01'].paidCents, orders.H.total_cents);
  assert.equal(day['2026-04-05'].orders, 2);
  assert.equal(day['2026-04-05'].paidCents, orders.A.total_cents + orders.B.total_cents);
  assert.equal(day['2026-04-06'].orders, 0, 'ootel tellimus ei ole müük');
  assert.equal(day['2026-04-30'].orders, 0, 'J kuulub 01.05');
  assert.equal(data.totals.orders, 6);
  assert.equal(data.totals.paidCents, sum(PAID_APRIL, 'total_cents'));
  assert.equal(data.maxPaidCents, Math.max(...data.days.map((d) => d.paidCents)));

  const march = await get('calendar?month=2026-03');
  assert.equal(march.data.days.find((d) => d.date === '2026-03-31').orders, 1);
  assert.equal(march.data.totals.orders, 1);

  const def = await get('calendar');
  assert.equal(def.data.month, '2026-05', 'vaikimisi jooksev kuu (Tallinna aeg)');
  for (const bad of ['calendar?month=2026-13', 'calendar?month=aprill', 'stats?from=2026-04-31']) assert.equal((await get(bad)).status, 400, bad);
});

test('computeStats: arvestab ainult tasutud ja vahemikku jäävaid ridu ka valimata andmetel', () => {
  const rows = Object.values(orders);
  const r = tallinnRange('2026-04-01', '2026-04-30');
  const s = computeStats(rows, r);
  assert.equal(s.totals.orders, 6);
  const empty = computeStats([], tallinnRange('2026-04-01', '2026-04-03'));
  assert.equal(empty.totals.orders, 0);
  assert.equal(empty.totals.avgOrderCents, 0);
  assert.equal(empty.daily.length, 3);
  assert.equal(empty.games.length, 3, 'kõik mängud on tabelis ka 0 müügiga');
});

test('allocateDiscount: soodustus jagatakse täpselt (sendi pealt) ridade vahel', () => {
  assert.deepEqual(allocateDiscount([3300, 1750], 758), [2805, 1487]);
  assert.equal(allocateDiscount([3300, 1750], 758).reduce((a, b) => a + b, 0), 3300 + 1750 - 758);
  // 100 senti soodustust 3 võrdse rea vahel: 34 + 33 + 33 (jääksent esimesele reale)
  assert.deepEqual(allocateDiscount([100, 100, 100], 100), [66, 67, 67]);
  assert.deepEqual(allocateDiscount([1000], 0), [1000]);
  assert.deepEqual(allocateDiscount([0, 0], 50), [0, 0]);
});
