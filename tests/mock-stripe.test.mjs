// Kohalik test-Stripe (/__mock-stripe/*): välja lülitatud tootmises; kogu voog kassast webhookini.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as createMockPageHandler, config as mockConfig } from '../netlify/functions/dev-mock-stripe.mjs';
import { createHandler as createCheckoutHandler } from '../netlify/functions/create-checkout.mjs';
import { createHandler as createWebhookHandler } from '../netlify/functions/stripe-webhook.mjs';
import { createHandler as createStatusHandler } from '../netlify/functions/order-status.mjs';
import { getOrderByToken } from '../netlify/functions/_lib/orders.mjs';
import { resetMockStripe } from '../netlify/functions/_lib/stripe-mock.mjs';
import { validBody, postJson, freshDb, testDb, captureMailer, silentLogger, call } from './helpers.mjs';

const ORIGIN = 'http://localhost:8502';
const ENV = { MOCK_STRIPE: '1', URL: ORIGIN, SITE_URL: ORIGIN, ADMIN_EMAIL: 'omanik@example.ee' };

/** Kogu süsteem mälus: kassa → test-Stripe'i leht → (allkirjastatud) webhook → kinnitusleht. */
function system(env = ENV) {
  const mailer = captureMailer();
  const logger = silentLogger();
  const getDb = () => testDb();
  const webhook = createWebhookHandler({ env, logger, getDb, mailer });
  const deliveries = [];
  const fetchImpl = async (url, init) => {
    deliveries.push({ url, type: JSON.parse(init.body).type, signature: init.headers['Stripe-Signature'] });
    return webhook(new Request(url, init));
  };
  return {
    mailer,
    deliveries,
    checkout: createCheckoutHandler({ env, logger, getDb }),
    page: createMockPageHandler({ env, logger, fetchImpl, delayMs: 30 }),
    status: createStatusHandler({ env, logger, getDb, mailer }),
  };
}

async function startCheckout(sys, overrides = {}) {
  const { res, data } = await call(sys.checkout, postJson(validBody(overrides), { url: `${ORIGIN}/api/checkout` }));
  assert.equal(res.status, 200, JSON.stringify(data));
  const session = new URL(data.url).searchParams.get('session');
  return { ...data, session };
}

const act = (sys, session, action) =>
  sys.page(new Request(`${ORIGIN}/__mock-stripe/action`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ session, action }).toString() }));

test('mock-Stripe: tootmises täiesti välja lülitatud (404)', async () => {
  assert.equal(mockConfig.path, '/__mock-stripe/*');
  for (const env of [{}, { MOCK_STRIPE: '0' }, { MOCK_STRIPE: 'true' }, { MOCK_STRIPE: '1', AWS_LAMBDA_FUNCTION_NAME: 'dev-mock-stripe' }]) {
    const handler = createMockPageHandler({ env, logger: silentLogger(), fetchImpl: async () => assert.fail('ei tohi midagi saata') });
    const get = await handler(new Request(`${ORIGIN}/__mock-stripe/checkout?session=cs_test_mockabc`));
    assert.equal(get.status, 404, JSON.stringify(env));
    const post = await handler(new Request(`${ORIGIN}/__mock-stripe/action`, { method: 'POST', body: 'session=x&action=pay' }));
    assert.equal(post.status, 404);
  }
});

test('mock-Stripe: makseleht — TESTMAKSE märge, summa ja kõik valikud', async () => {
  resetMockStripe();
  await freshDb();
  const sys = system();
  const c = await startCheckout(sys, { code: 'AGE15' });
  const res = await sys.page(new Request(`${ORIGIN}/__mock-stripe/checkout?session=${c.session}`));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /TESTMAKSE — päris raha ei liigu/);
  assert.match(html, new RegExp(`Tellimus ${c.orderNumber}`));
  assert.match(html, /17,86/); // 17,50 − 2,63 + 2,99
  for (const label of ['Maksa edukalt', 'Makse ebaõnnestub', 'Viivitusega makse (õnnestub hiljem)', 'Katkesta', 'Lase aeguda']) assert.ok(html.includes(label), label);
  assert.ok(!/<script/i.test(html), 'CSP: lehel pole skripte');
  const missing = await sys.page(new Request(`${ORIGIN}/__mock-stripe/checkout?session=cs_test_mockdeadbeef`));
  assert.equal(missing.status, 404);
});

test('mock-Stripe: „Maksa edukalt“ → allkirjastatud webhook → makstud + kirjad → kinnitusleht; testtellimus laoseisu ei muuda', async () => {
  resetMockStripe();
  const db = await freshDb();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('mida-viiu', 4)");
  const sys = system();
  const c = await startCheckout(sys);
  assert.match(c.orderNumber, /^TEST-ÄGE-\d{4}-0001$/, 'näidisrežiim → testtellimus');
  const res = await act(sys, c.session, 'pay');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), `${ORIGIN}/aitah?t=${c.token}&session_id=${c.session}`);
  assert.deepEqual(sys.deliveries.map((d) => d.type), ['checkout.session.completed']);
  assert.match(sys.deliveries[0].url, /\/api\/stripe-webhook$/);
  assert.match(sys.deliveries[0].signature, /^t=\d+,v1=[0-9a-f]{64}$/);

  const row = await getOrderByToken(db, c.token);
  assert.equal(row.payment_status, 'paid');
  assert.match(row.stripe_payment_intent_id, /^pi_mock_/);
  assert.equal(row.is_test, true);
  assert.equal((await db.query("SELECT stock FROM inventory WHERE game_id = 'mida-viiu'"))[0].stock, 4, 'testtellimus laoseisu ei vähenda');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_movements'))[0].n, 0);
  assert.equal(sys.mailer.sent.length, 2);
  assert.match(sys.mailer.sent[0].subject, new RegExp(`Tellimus ${c.orderNumber} on makstud`));

  const st = await call(sys.status, new Request(`${ORIGIN}/api/tellimus?t=${c.token}&session_id=${c.session}`));
  assert.equal(st.data.paymentStatus, 'paid');
  assert.equal(st.data.number, c.orderNumber, 'kinnitusleht näitab sama numbrit');
  assert.equal(st.data.test, true);
  // Kinnituslehe korduv laadimine ei saada kirju uuesti ega muuda numbrit
  const again = await call(sys.status, new Request(`${ORIGIN}/api/tellimus?t=${c.token}&session_id=${c.session}`));
  assert.equal(again.data.number, c.orderNumber);
  assert.equal(sys.mailer.sent.length, 2);

  // Teist korda maksta ei saa
  assert.equal((await act(sys, c.session, 'pay')).status, 409);

  // Tagasimakse (osaline → täielik)
  await act(sys, c.session, 'refund_partial');
  assert.equal((await getOrderByToken(db, c.token)).payment_status, 'partially_refunded');
  await act(sys, c.session, 'refund');
  const refunded = await getOrderByToken(db, c.token);
  assert.equal(refunded.payment_status, 'refunded');
  assert.equal(refunded.refunded_cents, refunded.total_cents);
  assert.equal(refunded.number, c.orderNumber);
  assert.equal((await db.query("SELECT stock FROM inventory WHERE game_id = 'mida-viiu'"))[0].stock, 4);
  assert.equal(sys.mailer.sent.length, 2, 'tagasimakse ei saada uuesti tellimuse kinnitust');
});

test('mock-Stripe: viivitusega makse → processing → (hiljem) paid', async () => {
  resetMockStripe();
  const db = await freshDb();
  const sys = system();
  const c = await startCheckout(sys);
  const res = await act(sys, c.session, 'delay');
  assert.equal(res.status, 303);
  assert.equal((await getOrderByToken(db, c.token)).payment_status, 'processing');
  // kinnitusleht sünkroonib Stripe'ist: ikka töötlemisel
  const st = await call(sys.status, new Request(`${ORIGIN}/api/tellimus?t=${c.token}&session_id=${c.session}`));
  assert.equal(st.data.paymentStatus, 'processing');
  assert.equal(sys.mailer.sent.length, 0);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(sys.deliveries.map((d) => d.type), ['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
  assert.equal((await getOrderByToken(db, c.token)).payment_status, 'paid');
  assert.equal(sys.mailer.sent.length, 2);
});

test('mock-Stripe: ebaõnnestunud, katkestatud ja aegunud makse', async () => {
  resetMockStripe();
  const db = await freshDb();
  const sys = system();

  const failed = await startCheckout(sys);
  assert.equal((await act(sys, failed.session, 'fail')).status, 303);
  assert.equal((await getOrderByToken(db, failed.token)).payment_status, 'failed');

  const cancelled = await startCheckout(sys);
  const cRes = await act(sys, cancelled.session, 'cancel');
  assert.equal(cRes.headers.get('location'), `${ORIGIN}/ostukorv?katkestatud=1&t=${cancelled.token}`);
  const cRow = await getOrderByToken(db, cancelled.token);
  assert.equal(cRow.payment_status, 'pending', 'katkestamine ei saada sündmust — makseleht jääb aeguma');
  const resume = await call(sys.status, new Request(`${ORIGIN}/api/tellimus?t=${cancelled.token}`));
  assert.equal(resume.data.resumeUrl, cRow.stripe_session_url, 'pooleli makset saab jätkata');

  const expired = await startCheckout(sys);
  const eRes = await act(sys, expired.session, 'expire');
  assert.equal(eRes.headers.get('location'), `${ORIGIN}/ostukorv?katkestatud=1&t=${expired.token}`);
  assert.equal((await getOrderByToken(db, expired.token)).payment_status, 'expired');
  const st = await call(sys.status, new Request(`${ORIGIN}/api/tellimus?t=${expired.token}`));
  assert.equal(st.data.resumeUrl, undefined);
  assert.equal(sys.mailer.sent.length, 0);
});
