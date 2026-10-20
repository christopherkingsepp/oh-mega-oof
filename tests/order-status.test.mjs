// GET /api/tellimus?t=…[&session_id=…]: tunnusega ligipääs, maskeerimine, resumeUrl ja Stripe'i sünk.
import test from 'node:test';
import assert from 'node:assert/strict';
import statusDefault, { createHandler as createStatusHandler, config as statusConfig } from '../netlify/functions/order-status.mjs';
import { validateOrder } from '../netlify/functions/_lib/order.mjs';
import { createOrder, attachCheckoutSession, getOrderById, markPaid } from '../netlify/functions/_lib/orders.mjs';
import { validBody, freshDb, testDb, captureMailer, silentLogger, mockStripe, stripeError, call } from './helpers.mjs';

const KEY = 'sk_test_51AbCdEfGhIjKlMnOp';
const ENV = { STRIPE_SECRET_KEY: KEY, ADMIN_EMAIL: 'omanik@example.ee', SITE_URL: 'https://age.example' };

function setup({ stripe = mockStripe(), env = ENV, getDb = () => testDb() } = {}) {
  const mailer = captureMailer();
  const logger = silentLogger();
  const handler = createStatusHandler({ env, logger, getDb, mailer, stripeFactory: () => stripe });
  return { handler, mailer, logger, stripe };
}

async function order(db, { expiresInS = 3600 } = {}) {
  const r = validateOrder(validBody({ items: [{ id: 'komplekt-semu-vigur', qty: 1 }], ageConfirmed: false }));
  const o = await createOrder(db, r.order);
  const sessionId = `cs_test_${o.id.replace(/-/g, '')}`;
  await attachCheckoutSession(db, o.id, { sessionId, url: 'https://checkout.stripe.com/c/pay/resume', expiresAt: Math.floor(Date.now() / 1000) + expiresInS });
  return { ...(await getOrderById(db, o.id)), sessionId };
}

const req = (q) => new Request(`https://age.example/api/tellimus${q}`);

test('tellimus: tee, kiiruspiirang ja vaikimisi eksport', () => {
  assert.equal(statusConfig.path, '/api/tellimus');
  assert.ok(statusConfig.rateLimit.windowLimit >= 60);
  assert.equal(typeof statusDefault, 'function');
});

test('tellimus: vigane või tundmatu tunnus → 400 / 404; POST → 405', async () => {
  await freshDb();
  const { handler } = setup();
  for (const q of ['', '?t=', '?t=lühike', '?t=' + 'x'.repeat(42) + '!']) {
    const { res, data } = await call(handler, req(q));
    assert.equal(res.status, 400, q);
    assert.match(data.error, /link/i);
  }
  const nf = await call(handler, req('?t=' + 'A'.repeat(43)));
  assert.equal(nf.res.status, 404);
  assert.equal(nf.res.headers.get('cache-control'), 'no-store');
  const post = await call(handler, new Request('https://age.example/api/tellimus?t=x', { method: 'POST' }));
  assert.equal(post.res.status, 405);
});

test('tellimus: õige tunnus → kinnituslehe andmed ilma isikuandmeteta + resumeUrl', async () => {
  const db = await freshDb();
  const o = await order(db);
  const { handler, stripe } = setup();
  const { res, data, text } = await call(handler, req(`?t=${o.public_token}`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.equal(data.number, o.number);
  assert.equal(data.paymentStatus, 'pending');
  assert.equal(data.resumeUrl, 'https://checkout.stripe.com/c/pay/resume');
  assert.equal(data.items[0].name, 'Oled Semu? + Vigur');
  assert.deepEqual(data.items[0].includes.map((c) => c.id), ['oled-semu', 'vigur']);
  assert.equal(data.totals.totalCents, 2299);
  assert.equal(data.shipping.lockerName, 'Tallinna Kristiine keskuse pakiautomaat');
  assert.equal(data.customer.emailMasked, 'm***i@e***.ee');
  for (const secret of ['mari@example.ee', 'Maasikas', '+37251234567', o.id, o.sessionId]) assert.ok(!text.includes(secret), `vastuses on "${secret}"`);
  assert.equal(stripe.calls.sessionRetrieve.length, 0, 'ilma session_id-ta Stripe\'i ei küsita');
});

test('tellimus: aegunud sessioon → resumeUrl puudub', async () => {
  const db = await freshDb();
  const o = await order(db, { expiresInS: -10 });
  const { handler } = setup();
  const { data } = await call(handler, req(`?t=${o.public_token}`));
  assert.equal(data.resumeUrl, undefined);
});

test('tellimus: session_id + Stripe ütleb "paid" → makstud (sama idempotentne üleminek kui webhook)', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('vigur', 3)");
  const o = await order(db);
  const stripe = mockStripe({
    sessionRetrieve: (id) => ({
      id,
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      amount_total: o.total_cents,
      currency: 'eur',
      client_reference_id: o.id,
      metadata: { order_id: o.id },
      payment_intent: { id: 'pi_sync_1', status: 'succeeded' },
    }),
  });
  const { handler, mailer } = setup({ stripe });
  const { res, data } = await call(handler, req(`?t=${o.public_token}&session_id=${o.sessionId}`));
  assert.equal(res.status, 200);
  assert.equal(data.paymentStatus, 'paid');
  assert.equal(data.paid, true);
  assert.equal(data.synced, true);
  assert.equal(data.resumeUrl, undefined);
  assert.equal(stripe.calls.sessionRetrieve[0].id, o.sessionId);
  assert.deepEqual(stripe.calls.sessionRetrieve[0].options, { expand: ['payment_intent'] });
  const row = await getOrderById(db, o.id);
  assert.equal(row.stripe_payment_intent_id, 'pi_sync_1');
  assert.equal((await db.query("SELECT stock FROM inventory WHERE game_id = 'vigur'"))[0].stock, 2);
  assert.equal(mailer.sent.length, 2);

  // Uuesti laadimine: juba makstud → Stripe'i ei küsita, kirju ei saadeta uuesti.
  const again = await call(handler, req(`?t=${o.public_token}&session_id=${o.sessionId}`));
  assert.equal(again.data.paymentStatus, 'paid');
  assert.equal(stripe.calls.sessionRetrieve.length, 1);
  assert.equal(mailer.sent.length, 2);
});

test('tellimus: session_id — avatud sessioon jääb ootele; viivitusega makse → processing; tagasilükatud → failed', async () => {
  const db = await freshDb();
  const states = { status: 'open', payment_status: 'unpaid', payment_intent: null };
  const o = await order(db);
  const stripe = mockStripe({ sessionRetrieve: (id) => ({ id, client_reference_id: o.id, metadata: { order_id: o.id }, ...states }) });
  const { handler, mailer } = setup({ stripe });

  let { data } = await call(handler, req(`?t=${o.public_token}&session_id=${o.sessionId}`));
  assert.equal(data.paymentStatus, 'pending');

  Object.assign(states, { status: 'complete', payment_intent: { id: 'pi_delay', status: 'processing' } });
  ({ data } = await call(handler, req(`?t=${o.public_token}&session_id=${o.sessionId}`)));
  assert.equal(data.paymentStatus, 'processing');

  Object.assign(states, { payment_intent: { id: 'pi_delay', status: 'requires_payment_method', last_payment_error: { code: 'payment_failed' } } });
  ({ data } = await call(handler, req(`?t=${o.public_token}&session_id=${o.sessionId}`)));
  assert.equal(data.paymentStatus, 'failed');
  assert.equal(mailer.sent.length, 0);
});

test('tellimus: võõras session_id → Stripe\'i ei küsita; Stripe\'i viga → viimane teadaolev olek', async () => {
  const db = await freshDb();
  const o = await order(db);
  const stripe = mockStripe({ sessionRetrieve: () => { throw stripeError('api_connection_error', 500, 'Stripe maas'); } });
  const { handler, logger } = setup({ stripe });

  const foreign = await call(handler, req(`?t=${o.public_token}&session_id=cs_test_keegiteinesessioon`));
  assert.equal(foreign.data.paymentStatus, 'pending');
  assert.equal(stripe.calls.sessionRetrieve.length, 0);

  const down = await call(handler, req(`?t=${o.public_token}&session_id=${o.sessionId}`));
  assert.equal(down.res.status, 200);
  assert.equal(down.data.paymentStatus, 'pending');
  assert.ok(logger.lines.some((l) => /Stripe maas/.test(l)));
});

test('tellimus: sessioon on teise tellimuse oma (metadata ei klapi) → ei sünkrooni', async () => {
  const db = await freshDb();
  const o = await order(db);
  // Tellimuse juures pole sessiooni (salvestamine ebaõnnestus) → kasutatakse URL-i session_id-d, aga see peab kuuluma tellimusele.
  await db.query('UPDATE orders SET stripe_session_id = NULL WHERE id = $1', [o.id]);
  const stripe = mockStripe({ sessionRetrieve: (id) => ({ id, status: 'complete', payment_status: 'paid', metadata: { order_id: 'muu' }, client_reference_id: 'muu' }) });
  const { handler } = setup({ stripe });
  const { data } = await call(handler, req(`?t=${o.public_token}&session_id=cs_test_voorasessioon1`));
  assert.equal(data.paymentStatus, 'pending');
  assert.equal(stripe.calls.sessionRetrieve.length, 1);
});

test('tellimus: andmebaas maas → 503', async () => {
  const { handler } = setup({ getDb: async () => { throw Object.assign(new Error('x'), { code: 'DB_NOT_CONFIGURED' }); } });
  const { res, data } = await call(handler, req('?t=' + 'A'.repeat(43)));
  assert.equal(res.status, 503);
  assert.match(data.error, /Proovi/);
});

test('tellimus: makstud tellimus näitab täitmise olekut', async () => {
  const db = await freshDb();
  const o = await order(db);
  await markPaid(db, o.id, {});
  await db.query("UPDATE orders SET fulfillment_status = 'shipped', tracking_code = 'CC123456789EE' WHERE id = $1", [o.id]);
  const { handler } = setup();
  const { data } = await call(handler, req(`?t=${o.public_token}`));
  assert.equal(data.paymentStatusLabel, 'Makstud');
  assert.equal(data.fulfillmentStatus, 'shipped');
  assert.equal(data.fulfillmentStatusLabel, 'Teel pakiautomaati');
  assert.equal(data.trackingCode, 'CC123456789EE');
});

test('tellimus: makstud, aga webhooki kinnituskiri ebaõnnestus → kinnitusleht proovib kirja uuesti (üks kord)', async () => {
  const db = await freshDb();
  const o = await order(db);
  await markPaid(db, o.id, { paymentIntentId: 'pi_kordus', amountPaid: o.total_cents, at: new Date(), sessionId: o.sessionId });
  // Webhook: laoseis tehtud, kirjad jäid saatmata (valvurid vabastatud).
  await db.query('UPDATE orders SET inventory_applied_at = now(), confirmation_sent_at = NULL, admin_notified_at = NULL WHERE id = $1', [o.id]);
  const { handler, mailer } = setup();
  mailer.fail = true;
  const r1 = await call(handler, req(`?t=${o.public_token}`));
  assert.equal(r1.res.status, 200);
  assert.equal(r1.data.paymentStatus, 'paid');
  assert.equal((await getOrderById(db, o.id)).confirmation_sent_at, null, 'ebaõnnestunud katse vabastab valvuri');
  mailer.fail = false;
  await call(handler, req(`?t=${o.public_token}`));
  await call(handler, req(`?t=${o.public_token}`));
  const row = await getOrderById(db, o.id);
  assert.ok(row.confirmation_sent_at && row.admin_notified_at);
  assert.deepEqual(mailer.sent.map((m) => m.to), ['mari@example.ee', 'omanik@example.ee'], 'täpselt üks kliendi kiri ja üks teavitus');
  // laoseisu ei vähendata uuesti
  assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_movements WHERE order_id = $1', [o.id]))[0].n, 0);
});

test('tellimus: vana makse (üle 24 h) või tagastatud tellimus → kirju tagantjärele ei saadeta', async () => {
  const db = await freshDb();
  const o = await order(db);
  await markPaid(db, o.id, { paymentIntentId: 'pi_vana', amountPaid: o.total_cents, at: new Date(Date.now() - 2 * 24 * 3600 * 1000), sessionId: o.sessionId });
  await db.query('UPDATE orders SET inventory_applied_at = now(), confirmation_sent_at = now(), admin_notified_at = NULL WHERE id = $1', [o.id]);
  const { handler, mailer } = setup();
  await call(handler, req(`?t=${o.public_token}`));
  assert.equal(mailer.sent.length, 0);
  const o2 = await order(db);
  await markPaid(db, o2.id, { paymentIntentId: 'pi_tagast', amountPaid: o2.total_cents, at: new Date(), sessionId: o2.sessionId });
  await db.query("UPDATE orders SET payment_status = 'refunded', refunded_cents = total_cents, inventory_applied_at = now() WHERE id = $1", [o2.id]);
  await call(handler, req(`?t=${o2.public_token}`));
  assert.equal(mailer.sent.length, 0);
});
