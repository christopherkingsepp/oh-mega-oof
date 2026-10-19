// POST /api/stripe-webhook: allkiri, idempotentsus, olekuüleminekud, laoseis ja kirjad.
import test from 'node:test';
import assert from 'node:assert/strict';
import webhookDefault, { createHandler as createWebhookHandler, config as webhookConfig } from '../netlify/functions/stripe-webhook.mjs';
import { validateOrder } from '../netlify/functions/_lib/order.mjs';
import { createOrder, attachCheckoutSession, getOrderById } from '../netlify/functions/_lib/orders.mjs';
import { validBody, freshDb, testDb, captureMailer, silentLogger, signedWebhook, stripeEvent, call, WEBHOOK_SECRET } from './helpers.mjs';

const ENV = { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, ADMIN_EMAIL: 'omanik@example.ee', SITE_URL: 'https://age.example' };

function setup({ env = ENV, getDb = () => testDb() } = {}) {
  const mailer = captureMailer();
  const logger = silentLogger();
  const handler = createWebhookHandler({ env, logger, getDb, mailer });
  return { handler, mailer, logger };
}

/** Ootel tellimus koos Stripe'i sessiooniga + sellele vastav sessiooniobjekt. */
async function pendingOrder(db, overrides = {}) {
  const r = validateOrder(validBody(overrides));
  const order = await createOrder(db, r.order);
  const sessionId = `cs_test_${order.id.replace(/-/g, '')}`;
  await attachCheckoutSession(db, order.id, { sessionId, url: 'https://checkout.stripe.com/c/pay/x', expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  const session = (extra = {}) => ({
    id: sessionId,
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    amount_total: order.total_cents,
    currency: 'eur',
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_number: order.number },
    payment_intent: `pi_${order.number.replace('-', '')}`,
    ...extra,
  });
  return { order: await getOrderById(db, order.id), session };
}

const stock = async (db, id) => (await db.query('SELECT stock FROM inventory WHERE game_id = $1', [id]))[0]?.stock;
const eventsCount = async (db) => (await db.query('SELECT count(*)::int AS n FROM stripe_events'))[0].n;

test('webhook: tee ja vaikimisi eksport', () => {
  assert.equal(webhookConfig.path, '/api/stripe-webhook');
  assert.equal(typeof webhookDefault, 'function');
});

test('webhook: allkiri — õige → 200, vale/puuduv/muudetud keha → 400, saladus puudub → 500', async () => {
  await freshDb();
  const { handler } = setup();
  const evt = stripeEvent('customer.created', { id: 'cus_1' });

  const ok = await call(handler, signedWebhook(evt));
  assert.equal(ok.res.status, 200);
  assert.equal(ok.data.ignored, true, 'tundmatu sündmus → 200, aga ei töödelda');

  const wrong = await call(handler, signedWebhook(evt, { secret: 'whsec_vale' }));
  assert.equal(wrong.res.status, 400);
  assert.equal(wrong.data.error, 'Vigane allkiri.');

  const missing = await call(handler, signedWebhook(evt, { signature: null }));
  assert.equal(missing.res.status, 400);

  const garbage = await call(handler, signedWebhook(evt, { signature: 't=1,v1=abc' }));
  assert.equal(garbage.res.status, 400);

  // allkiri on õige, aga keha muudeti pärast allkirjastamist
  const payload = JSON.stringify(evt);
  const good = signedWebhook(evt);
  const sig = good.headers.get('stripe-signature');
  const tampered = await call(handler, new Request('https://age.example/api/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig }, body: payload.replace('cus_1', 'cus_2') }));
  assert.equal(tampered.res.status, 400);

  const { handler: noSecret, logger } = setup({ env: {} });
  const r = await call(noSecret, signedWebhook(evt));
  assert.equal(r.res.status, 500);
  assert.ok(logger.lines.some((l) => /STRIPE_WEBHOOK_SECRET/.test(l)));

  const get = await call(handler, new Request('https://age.example/api/stripe-webhook'));
  assert.equal(get.res.status, 405);
  assert.equal(await eventsCount(await testDb()), 0, 'tundmatuid/vigaseid sündmusi ei salvestata');
});

test('webhook: vana ajatempliga allkiri (kordusesitus) → 400', async () => {
  await freshDb();
  const { handler } = setup();
  const evt = stripeEvent('checkout.session.completed', { id: 'cs_test_old' });
  const payload = JSON.stringify(evt);
  const { webhooks } = await import('../netlify/functions/_lib/stripe-client.mjs');
  const header = webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  const { res } = await call(handler, signedWebhook(payload, { signature: header }));
  assert.equal(res.status, 400);
});

test('webhook: completed (paid) → makstud, laoseis väheneb, kinnitus kliendile + teavitus omanikule', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('mida-viiu', 10), ('oled-semu', 10), ('vigur', 10)");
  const { order, session } = await pendingOrder(db, { items: [{ id: 'komplekt-koik', qty: 1 }, { id: 'vigur', qty: 1 }] });
  const { handler, mailer } = setup();

  const evt = stripeEvent('checkout.session.completed', session());
  const { res, data } = await call(handler, signedWebhook(evt));
  assert.equal(res.status, 200);
  assert.deepEqual(data, { received: true, order: order.number, status: 'paid' });

  const row = await getOrderById(db, order.id);
  assert.equal(row.payment_status, 'paid');
  assert.equal(row.amount_paid_cents, order.total_cents);
  assert.equal(row.stripe_payment_intent_id, session().payment_intent);
  assert.ok(row.paid_at && row.inventory_applied_at && row.confirmation_sent_at && row.admin_notified_at);
  assert.equal(await stock(db, 'mida-viiu'), 9);
  assert.equal(await stock(db, 'oled-semu'), 9);
  assert.equal(await stock(db, 'vigur'), 8);

  assert.equal(mailer.sent.length, 2);
  const [customer, admin] = mailer.sent;
  assert.equal(customer.to, 'mari@example.ee');
  assert.match(customer.subject, new RegExp(`Tellimus ${order.number} on makstud`));
  assert.match(customer.html, /Kõik 3 mängu/);
  assert.match(customer.html, /Komplektis: MIDA V!!!U \+ Oled Semu\? \+ Vigur/);
  assert.match(customer.html, /https:\/\/age\.example\/taganemine/);
  assert.equal(customer.idempotencyKey, `tellimus-kinnitus-${order.id}`);
  assert.equal(admin.to, 'omanik@example.ee');
  assert.equal(admin.replyTo, 'mari@example.ee');
  assert.match(admin.subject, new RegExp(`Uus tellimus ${order.number}`));
  assert.match(admin.html, /https:\/\/age\.example\/admin/);

  const [ev] = await db.query('SELECT * FROM stripe_events WHERE id = $1', [evt.id]);
  assert.equal(ev.order_id, order.id);
  assert.ok(ev.processed_at);
});

test('webhook: sama sündmus uuesti → duplicate, EI topelt laomuutust ega teist kirja', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('mida-viiu', 5)");
  const { order, session } = await pendingOrder(db);
  const { handler, mailer } = setup();
  const evt = stripeEvent('checkout.session.completed', session());

  assert.equal((await call(handler, signedWebhook(evt))).res.status, 200);
  const again = await call(handler, signedWebhook(evt));
  assert.equal(again.res.status, 200);
  assert.equal(again.data.duplicate, true);

  // Ka TEINE sündmus samale makstud tellimusele (nt async_payment_succeeded) ei tee midagi topelt.
  const other = await call(handler, signedWebhook(stripeEvent('checkout.session.async_payment_succeeded', session())));
  assert.equal(other.res.status, 200);
  // ...ja paralleelsed kordused samuti mitte.
  await Promise.all([1, 2, 3].map(() => call(handler, signedWebhook(stripeEvent('checkout.session.completed', session())))));

  assert.equal(await stock(db, 'mida-viiu'), 4);
  assert.equal(mailer.sent.length, 2, 'kirjad läksid välja täpselt üks kord');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders'))[0].n, 1, 'uut tellimust ei teki');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_movements WHERE order_id = $1', [order.id]))[0].n, 1);
});

test('webhook: completed (unpaid) → processing → async_payment_succeeded → paid', async () => {
  const db = await freshDb();
  const { order, session } = await pendingOrder(db);
  const { handler, mailer } = setup();

  await call(handler, signedWebhook(stripeEvent('checkout.session.completed', session({ payment_status: 'unpaid' }))));
  let row = await getOrderById(db, order.id);
  assert.equal(row.payment_status, 'processing');
  assert.equal(row.stripe_payment_intent_id, session().payment_intent);
  assert.equal(mailer.sent.length, 0, 'enne raha laekumist kirju ei saadeta');
  assert.equal(row.inventory_applied_at, null);

  await call(handler, signedWebhook(stripeEvent('checkout.session.async_payment_succeeded', session())));
  row = await getOrderById(db, order.id);
  assert.equal(row.payment_status, 'paid');
  assert.ok(row.inventory_applied_at);
  assert.equal(mailer.sent.length, 2);
});

test('webhook: async_payment_failed → failed (kirju ega laomuutust pole)', async () => {
  const db = await freshDb();
  const { order, session } = await pendingOrder(db);
  const { handler, mailer } = setup();
  await call(handler, signedWebhook(stripeEvent('checkout.session.completed', session({ payment_status: 'unpaid' }))));
  await call(handler, signedWebhook(stripeEvent('checkout.session.async_payment_failed', session({ payment_status: 'unpaid' }))));
  const row = await getOrderById(db, order.id);
  assert.equal(row.payment_status, 'failed');
  assert.equal(row.inventory_applied_at, null);
  assert.equal(mailer.sent.length, 0);
});

test('webhook: expired → expired; makstud tellimust aegumine ei muuda', async () => {
  const db = await freshDb();
  const a = await pendingOrder(db);
  const b = await pendingOrder(db);
  const { handler } = setup();

  await call(handler, signedWebhook(stripeEvent('checkout.session.expired', a.session({ status: 'expired', payment_status: 'unpaid', payment_intent: null }))));
  assert.equal((await getOrderById(db, a.order.id)).payment_status, 'expired');

  await call(handler, signedWebhook(stripeEvent('checkout.session.completed', b.session())));
  await call(handler, signedWebhook(stripeEvent('checkout.session.expired', b.session({ status: 'expired' }))));
  assert.equal((await getOrderById(db, b.order.id)).payment_status, 'paid');
});

test('webhook: charge.refunded (payment_intent järgi) → osaliselt / täielikult tagastatud', async () => {
  const db = await freshDb();
  const { order, session } = await pendingOrder(db);
  const { handler } = setup();
  await call(handler, signedWebhook(stripeEvent('checkout.session.completed', session())));

  const charge = (amount_refunded) => ({ id: 'ch_1', object: 'charge', amount: order.total_cents, amount_refunded, payment_intent: session().payment_intent });
  let r = await call(handler, signedWebhook(stripeEvent('charge.refunded', charge(500))));
  assert.equal(r.res.status, 200);
  let row = await getOrderById(db, order.id);
  assert.equal(row.payment_status, 'partially_refunded');
  assert.equal(row.refunded_cents, 500);

  r = await call(handler, signedWebhook(stripeEvent('charge.refunded', charge(order.total_cents))));
  row = await getOrderById(db, order.id);
  assert.equal(row.payment_status, 'refunded');
  assert.equal(row.refunded_cents, order.total_cents);

  // tundmatu makse → 200, midagi ei muutu
  const unknown = await call(handler, signedWebhook(stripeEvent('charge.refunded', { ...charge(100), payment_intent: 'pi_tundmatu' })));
  assert.equal(unknown.res.status, 200);
});

test('webhook: meili viga ei tee webhooki 500-ks; järgmine sündmus proovib kirja uuesti', async () => {
  const db = await freshDb();
  const { order, session } = await pendingOrder(db);
  const { handler, mailer, logger } = setup();
  mailer.fail = true;
  const r = await call(handler, signedWebhook(stripeEvent('checkout.session.completed', session())));
  assert.equal(r.res.status, 200);
  let row = await getOrderById(db, order.id);
  assert.equal(row.payment_status, 'paid');
  assert.equal(row.confirmation_sent_at, null, 'valvur vabastati');
  assert.ok(logger.lines.some((l) => /jäi saatmata/.test(l)));

  mailer.fail = false;
  await call(handler, signedWebhook(stripeEvent('checkout.session.async_payment_succeeded', session())));
  row = await getOrderById(db, order.id);
  assert.ok(row.confirmation_sent_at);
  assert.equal(mailer.sent.length, 2);
});

test('webhook: ilma ADMIN_EMAIL-ita saadetakse ainult kliendi kinnitus', async () => {
  const db = await freshDb();
  const { session } = await pendingOrder(db);
  const { handler, mailer } = setup({ env: { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } });
  await call(handler, signedWebhook(stripeEvent('checkout.session.completed', session())));
  assert.equal(mailer.sent.length, 1);
  assert.equal(mailer.sent[0].to, 'mari@example.ee');
});

test('webhook: andmebaasi viga → 503/500 (Stripe kordab) ja sündmus jääb töötlemata', async () => {
  const db = await freshDb();
  const { order, session } = await pendingOrder(db);
  const down = setup({ getDb: async () => { throw Object.assign(new Error('ühendus katkes'), { code: 'ECONNRESET' }); } });
  const evt = stripeEvent('checkout.session.completed', session());
  assert.equal((await call(down.handler, signedWebhook(evt))).res.status, 503);

  // töötlemise ajal katkev andmebaas
  let failNext = false;
  const flaky = {
    query: (sql, params) => {
      if (failNext && /UPDATE orders SET payment_status/.test(sql)) {
        failNext = false;
        return Promise.reject(new Error('ajutine viga'));
      }
      return db.query(sql, params);
    },
    exec: (sql) => db.exec(sql),
  };
  failNext = true;
  const { handler } = setup({ getDb: async () => flaky });
  assert.equal((await call(handler, signedWebhook(evt))).res.status, 500);
  assert.equal((await db.query('SELECT processed_at FROM stripe_events WHERE id = $1', [evt.id]))[0].processed_at, null);
  assert.equal((await getOrderById(db, order.id)).payment_status, 'pending');

  // Stripe kordab sama sündmust → nüüd õnnestub
  const retry = await call(handler, signedWebhook(evt));
  assert.equal(retry.res.status, 200);
  assert.equal(retry.data.duplicate, undefined);
  assert.equal((await getOrderById(db, order.id)).payment_status, 'paid');
});

test('webhook: teise sessiooni sündmus ei muuda tellimust; tundmatu tellimus → 200', async () => {
  const db = await freshDb();
  const { order, session } = await pendingOrder(db);
  const { handler } = setup();
  const r = await call(handler, signedWebhook(stripeEvent('checkout.session.completed', session({ id: 'cs_test_keegiteine' }))));
  assert.equal(r.res.status, 200);
  assert.equal((await getOrderById(db, order.id)).payment_status, 'pending');

  const unknown = await call(handler, signedWebhook(stripeEvent('checkout.session.completed', session({ id: 'cs_test_tundmatu', metadata: {}, client_reference_id: null }))));
  assert.equal(unknown.res.status, 200);
  assert.equal(unknown.data.order, undefined);
});
