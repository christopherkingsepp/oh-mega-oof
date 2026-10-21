// _lib/orders.mjs: tellimuse loomine, summad, laoseis, olekuüleminekud ja avalik vaade (mälus PGlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder } from '../netlify/functions/_lib/order.mjs';
import {
  createOrder,
  attachCheckoutSession,
  checkAvailability,
  shortageMessage,
  applyInventoryForOrder,
  orderGameQuantities,
  markPaid,
  markProcessing,
  markFailed,
  markExpired,
  applyRefund,
  claimOrderFlag,
  releaseOrderFlag,
  getOrderById,
  getOrderByNumber,
  publicOrderView,
  maskEmail,
  TOKEN_RE,
} from '../netlify/functions/_lib/orders.mjs';
import { validBody, freshDb } from './helpers.mjs';

const orderOf = (overrides) => {
  const r = validateOrder(validBody(overrides));
  assert.equal(r.ok, true, r.error);
  return r.order;
};

async function setStock(db, stock) {
  for (const [id, n] of Object.entries(stock)) {
    await db.query('INSERT INTO inventory (game_id, stock) VALUES ($1, $2) ON CONFLICT (game_id) DO UPDATE SET stock = EXCLUDED.stock', [id, n]);
  }
}
const stockOf = async (db) => Object.fromEntries((await db.query('SELECT game_id, stock FROM inventory')).map((r) => [r.game_id, r.stock]));

test('createOrder: number ÄGE-2026-0001…, salajane tunnus, read koos komplekti sisuga, summad serverist', async () => {
  const db = await freshDb();
  const at = '2026-05-04T09:00:00Z';
  const o = await createOrder(
    db,
    orderOf({ items: [{ id: 'komplekt-koik', qty: 1 }, { id: 'mida-viiu', qty: 2 }], code: 'AGE15', shipping: { carrier: 'smartpost' } }),
    { now: at },
  );
  assert.equal(o.number, 'ÄGE-2026-0001');
  assert.equal(o.number_year, 2026);
  assert.equal(o.number_seq, 1);
  assert.equal(o.is_test, false);
  assert.equal(o.legacy_number, null);
  assert.equal(new Date(o.created_at).toISOString(), '2026-05-04T09:00:00.000Z');
  assert.match(o.id, /^[0-9a-f-]{36}$/);
  assert.match(o.public_token, TOKEN_RE);
  assert.equal(o.payment_status, 'pending');
  assert.equal(o.fulfillment_status, 'new');

  // 33,00 + 2 × 17,50 = 68,00 €; −15% = 10,20 €; ≥ 30 € → tasuta tarne
  assert.equal(o.subtotal_cents, 6800);
  assert.equal(o.discount_code, 'AGE15');
  assert.equal(o.discount_cents, 1020);
  assert.equal(o.shipping_cents, 0);
  assert.equal(o.total_cents, 5780);

  assert.deepEqual(o.items[0], {
    id: 'komplekt-koik',
    name: 'Kõik 3 mängu',
    qty: 1,
    unitCents: 3300,
    totalCents: 3300,
    bundle: true,
    includes: [
      { id: 'mida-viiu', name: 'MIDA V!!!U', qty: 1 },
      { id: 'oled-semu', name: 'Oled Semu?', qty: 1 },
      { id: 'vigur', name: 'Vigur', qty: 1 },
    ],
  });
  assert.deepEqual(o.items[1].includes, [{ id: 'mida-viiu', name: 'MIDA V!!!U', qty: 1 }]);
  assert.equal(o.items[1].bundle, false);

  // tarne (muutumatu hetktõmmis)
  assert.equal(o.carrier, 'smartpost');
  assert.equal(o.carrier_name, 'SmartPosti pakiautomaat');
  assert.equal(o.locker_id, '96331');
  assert.equal(o.locker_name, 'Tallinna Kristiine keskuse pakiautomaat');
  assert.equal(o.locker_address, 'Endla tn 45, Tallinn');

  const second = await createOrder(db, orderOf(), { now: at });
  assert.equal(second.number, 'ÄGE-2026-0002');
  assert.notEqual(second.public_token, o.public_token);
});

test('createOrder: komplekt + soodus + tarne (alla 30 € pärast soodustust)', async () => {
  const db = await freshDb();
  // 20,00 + 12,95 = 32,95 €; −15% = 4,94 € (494,25 → 494); 28,01 € < 30 € → tarne 2,99 €
  const o = await createOrder(db, orderOf({ items: [{ id: 'komplekt-semu-vigur', qty: 1 }, { id: 'vigur', qty: 1 }], code: 'age15', ageConfirmed: false }));
  assert.equal(o.subtotal_cents, 3295);
  assert.equal(o.discount_cents, 494);
  assert.equal(o.shipping_cents, 299);
  assert.equal(o.total_cents, 3100);
  assert.deepEqual(orderGameQuantities(o.items), { 'oled-semu': 1, vigur: 2 });
});

test('createOrder: automaadi ametlikud andmed nimekirjast on ülimuslikud; tühi id → NULL', async () => {
  const db = await freshDb();
  const o = await createOrder(db, orderOf(), { locker: { id: '96331', name: 'Ametlik nimi', address: 'Endla tn 45', city: 'Tallinn' } });
  assert.equal(o.locker_name, 'Ametlik nimi');
  assert.equal(o.locker_address, 'Endla tn 45');
  assert.equal(o.locker_city, 'Tallinn');
  const manual = await createOrder(db, orderOf({ shipping: { carrier: 'dpd', lockerId: '', lockerName: 'Rakvere Põhjakeskus', lockerAddress: '', manual: true } }));
  assert.equal(manual.locker_id, null);
  assert.equal(manual.locker_address, null);
  assert.equal(manual.carrier_name, 'DPD Pickup pakiautomaat');
});

test('attachCheckoutSession salvestab sessiooni id, URL-i ja aegumise', async () => {
  const db = await freshDb();
  const o = await createOrder(db, orderOf());
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const row = await attachCheckoutSession(db, o.id, { sessionId: 'cs_test_abc12345', url: 'https://checkout.stripe.com/x', expiresAt: exp });
  assert.equal(row.stripe_session_id, 'cs_test_abc12345');
  assert.equal(row.stripe_session_url, 'https://checkout.stripe.com/x');
  assert.equal(new Date(row.stripe_session_expires_at).getTime(), exp * 1000);
});

test('laoseis: rida puudub → piiramatu; komplektid võetakse lahti', async () => {
  const db = await freshDb();
  assert.deepEqual(await checkAvailability(db, [{ id: 'komplekt-koik', qty: 20 }]), { ok: true, shortages: [] });

  await setStock(db, { 'mida-viiu': 2, 'oled-semu': 5 }); // vigur: rida puudub → ei kontrollita
  const r = await checkAvailability(db, [{ id: 'komplekt-koik', qty: 2 }, { id: 'mida-viiu', qty: 1 }, { id: 'vigur', qty: 15 }]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.shortages, [{ id: 'mida-viiu', name: 'MIDA V!!!U', requested: 3, available: 2 }]);
  assert.match(shortageMessage(r.shortages), /„MIDA V!!!U“ on laos ainult 2 tk/);

  await setStock(db, { 'mida-viiu': 0 });
  const out = await checkAvailability(db, [{ id: 'mida-viiu', qty: 1 }]);
  assert.match(shortageMessage(out.shortages), /„MIDA V!!!U“ on hetkel otsas/);

  await setStock(db, { 'mida-viiu': 3 });
  assert.equal((await checkAvailability(db, [{ id: 'komplekt-koik', qty: 2 }, { id: 'mida-viiu', qty: 1 }])).ok, true, 'täpselt piisav kogus');
});

test('applyInventoryForOrder: testtellimus laoseisu EI muuda (laoliikumisi ei teki)', async () => {
  const db = await freshDb();
  await setStock(db, { 'mida-viiu': 3 });
  const o = await createOrder(db, orderOf({ items: [{ id: 'komplekt-koik', qty: 1 }] }), { isTest: true });
  assert.match(o.number, /^TEST-ÄGE-\d{4}-0001$/);
  const { order: paid } = await markPaid(db, o.id, { paymentIntentId: 'pi_test_1', amountPaid: o.total_cents });
  assert.equal((await applyInventoryForOrder(db, paid)).movements, 0);
  assert.deepEqual(await stockOf(db), { 'mida-viiu': 3 });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_movements'))[0].n, 0);
  assert.equal((await getOrderById(db, o.id)).inventory_applied_at, null);
  assert.equal(publicOrderView(paid).test, true);
});

test('applyInventoryForOrder: vähendab laoseisu täpselt üks kord (komplektid lahti võetuna)', async () => {
  const db = await freshDb();
  await setStock(db, { 'mida-viiu': 10, 'oled-semu': 10 }); // vigur: rida puudub
  const o = await createOrder(db, orderOf({ items: [{ id: 'komplekt-koik', qty: 2 }, { id: 'oled-semu', qty: 1 }] }));

  // Maksmata tellimus ei muuda laoseisu.
  assert.equal((await applyInventoryForOrder(db, o)).movements, 0);
  assert.deepEqual(await stockOf(db), { 'mida-viiu': 10, 'oled-semu': 10 });

  const { order: paid } = await markPaid(db, o.id, { paymentIntentId: 'pi_1', amountPaid: o.total_cents });
  const first = await applyInventoryForOrder(db, paid);
  assert.equal(first.movements, 3);
  assert.deepEqual(await stockOf(db), { 'mida-viiu': 8, 'oled-semu': 7 });

  const again = await applyInventoryForOrder(db, paid);
  assert.equal(again.movements, 0, 'korduv väljakutse ei muuda midagi');
  assert.deepEqual(await stockOf(db), { 'mida-viiu': 8, 'oled-semu': 7 });

  // Ka paralleelsed väljakutsed ei vähenda topelt.
  await Promise.all([applyInventoryForOrder(db, paid), applyInventoryForOrder(db, paid)]);
  assert.deepEqual(await stockOf(db), { 'mida-viiu': 8, 'oled-semu': 7 });

  const moves = await db.query('SELECT game_id, delta, reason, note FROM inventory_movements WHERE order_id = $1 ORDER BY game_id', [o.id]);
  assert.deepEqual(
    moves.map((m) => [m.game_id, m.delta, m.reason]),
    [['mida-viiu', -2, 'sale'], ['oled-semu', -3, 'sale'], ['vigur', -2, 'sale']],
  );
  assert.equal(moves[0].note, `Tellimus ${o.number}`);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM inventory WHERE game_id = 'vigur'"))[0].n, 0, 'puuduvat rida ei looda');
  assert.ok((await getOrderById(db, o.id)).inventory_applied_at);
});

test('olekuüleminekud on idempotentsed ja lubatud ainult õigest olekust', async () => {
  const db = await freshDb();
  const o = await createOrder(db, orderOf());

  let r = await markProcessing(db, o.id, { paymentIntentId: 'pi_x' });
  assert.equal(r.transitioned, true);
  assert.equal(r.order.payment_status, 'processing');
  assert.equal(r.order.stripe_payment_intent_id, 'pi_x');
  assert.equal((await markProcessing(db, o.id)).transitioned, false);

  r = await markPaid(db, o.id, { paymentIntentId: 'pi_x', amountPaid: 2049, at: '2026-10-19T10:00:00Z' });
  assert.equal(r.transitioned, true);
  assert.equal(r.order.payment_status, 'paid');
  assert.equal(r.order.amount_paid_cents, 2049);
  assert.equal(new Date(r.order.paid_at).toISOString(), '2026-10-19T10:00:00.000Z');

  const again = await markPaid(db, o.id, { amountPaid: 1 });
  assert.equal(again.transitioned, false);
  assert.equal(again.order.payment_status, 'paid');
  assert.equal(again.order.amount_paid_cents, 2049, 'korduv sündmus ei muuda andmeid');
  for (const fn of [markFailed, markExpired, markProcessing]) assert.equal((await fn(db, o.id)).transitioned, false, fn.name);

  // failed/expired → paid on lubatud (raha laekus siiski), pending → expired → paid
  const o2 = await createOrder(db, orderOf());
  assert.equal((await markExpired(db, o2.id)).order.payment_status, 'expired');
  assert.equal((await markExpired(db, o2.id)).transitioned, false);
  assert.equal((await markPaid(db, o2.id, {})).order.payment_status, 'paid');

  const o3 = await createOrder(db, orderOf());
  await markProcessing(db, o3.id);
  assert.equal((await markFailed(db, o3.id)).order.payment_status, 'failed');

  assert.deepEqual(await markPaid(db, '00000000-0000-0000-0000-000000000000', {}), { transitioned: false, order: null });
});

test('applyRefund: osaline → täielik; korduv või väiksem summa ei muuda midagi', async () => {
  const db = await freshDb();
  const o = await createOrder(db, orderOf());
  assert.deepEqual(await applyRefund(db, 'pi_refund', 500), { transitioned: false, order: null }, 'makset pole veel seotud');
  await markPaid(db, o.id, { paymentIntentId: 'pi_refund', amountPaid: o.total_cents });

  let r = await applyRefund(db, 'pi_refund', 500);
  assert.equal(r.transitioned, true);
  assert.equal(r.order.payment_status, 'partially_refunded');
  assert.equal(r.order.refunded_cents, 500);
  assert.equal((await applyRefund(db, 'pi_refund', 500)).transitioned, false);
  assert.equal((await applyRefund(db, 'pi_refund', 300)).transitioned, false);

  r = await applyRefund(db, 'pi_refund', o.total_cents);
  assert.equal(r.order.payment_status, 'refunded');
  assert.equal(r.order.refunded_cents, o.total_cents);
  assert.equal((await applyRefund(db, 'pi_refund', o.total_cents)).transitioned, false);
});

test('claimOrderFlag: ainult üks broneering õnnestub; vabastamine lubab uuesti', async () => {
  const db = await freshDb();
  const o = await createOrder(db, orderOf());
  const results = await Promise.all([1, 2, 3].map(() => claimOrderFlag(db, o.id, 'confirmation_sent_at')));
  assert.equal(results.filter(Boolean).length, 1);
  await releaseOrderFlag(db, o.id, 'confirmation_sent_at');
  assert.equal(await claimOrderFlag(db, o.id, 'confirmation_sent_at'), true);
  await assert.rejects(() => claimOrderFlag(db, o.id, 'customer_email'), /Tundmatu veerg/);
});

test('maskEmail', () => {
  assert.equal(maskEmail('mari.maasikas@gmail.com'), 'm***s@g***.com');
  assert.equal(maskEmail('jo@example.ee'), 'j***@e***.ee');
  assert.equal(maskEmail('a@b.ee'), 'a***@b***.ee');
  assert.equal(maskEmail('õie@õunad.ee'), 'õ***e@õ***.ee');
  assert.equal(maskEmail(''), '***');
});

test('publicOrderView: ainult avalikud väljad, maskeeritud e-post, resumeUrl ainult kehtiva maksmata sessiooniga', async () => {
  const db = await freshDb();
  const o = await createOrder(db, orderOf({ items: [{ id: 'komplekt-koik', qty: 1 }], code: 'AGE15' }));
  const exp = Math.floor(Date.now() / 1000) + 1800;
  const row = await attachCheckoutSession(db, o.id, { sessionId: 'cs_test_view1234', url: 'https://checkout.stripe.com/c/pay/x', expiresAt: exp });

  const v = publicOrderView(row);
  assert.equal(v.number, o.number);
  assert.equal(v.paymentStatus, 'pending');
  assert.equal(v.paymentStatusLabel, 'Ootab makset');
  assert.equal(v.paid, false);
  assert.equal(v.resumeUrl, 'https://checkout.stripe.com/c/pay/x');
  assert.equal(v.totals.discountPercent, 15);
  assert.equal(v.items[0].includes.length, 3);
  assert.deepEqual(v.customer, { firstName: 'Mari', emailMasked: 'm***i@e***.ee' });
  const text = JSON.stringify(v);
  for (const secret of ['mari@example.ee', 'Maasikas', '+37251234567', o.id, o.public_token, 'cs_test_view1234']) {
    assert.ok(!text.includes(secret), `vastuses on "${secret}"`);
  }

  // aegunud või kohe aeguv sessioon → resumeUrl puudub
  assert.equal(publicOrderView(row, { now: exp * 1000 - 30 * 1000 }).resumeUrl, undefined);
  // makstud → resumeUrl puudub
  const { order: paid } = await markPaid(db, o.id, {});
  assert.equal(publicOrderView(paid).resumeUrl, undefined);
  assert.equal(publicOrderView(paid).paid, true);
  assert.equal(publicOrderView(paid).test, false);
  assert.equal((await getOrderByNumber(db, o.number.toLowerCase())).id, o.id);
  assert.equal((await getOrderByNumber(db, o.number.replace('Ä', 'A'))).id, o.id, 'ASCII-kuju AGE-…');
  assert.equal(await getOrderByNumber(db, 'prügi'), null);
});
