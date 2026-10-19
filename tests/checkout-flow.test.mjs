// POST /api/checkout uus voog: laoseis (409), ENABLED_CARRIERS, andmebaasi puudumine (503),
// automaadi andmed nimekirjast, vedaja tarnehind ja kohalik test-Stripe (MOCK_STRIPE=1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler as createCheckoutHandler } from '../netlify/functions/create-checkout.mjs';
import { getOrderByToken } from '../netlify/functions/_lib/orders.mjs';
import { writeLockerCache } from '../netlify/functions/_lib/lockers.mjs';
import { enabledCarriers, carrierMeta, enabledCarrierNames, isMockStripe } from '../netlify/functions/_lib/config.mjs';
import { resetMockStripe } from '../netlify/functions/_lib/stripe-mock.mjs';
import { validBody, mockStripe, silentLogger, postJson, freshDb, testDb, call } from './helpers.mjs';

const KEY = 'sk_test_51AbCdEfGhIjKlMnOp';
const ENV = { STRIPE_SECRET_KEY: KEY, URL: 'https://age.example' };

function setup({ env = ENV, stripe = mockStripe(), getDb = () => testDb() } = {}) {
  const logger = silentLogger();
  const handler = createCheckoutHandler({ env, logger, couponCache: new Set(), getDb, stripeFactory: () => stripe });
  return { handler, logger, stripe };
}

test('ENABLED_CARRIERS: vaikimisi omniva+smartpost; tundmatud välja; tühi/vigane → vaikimisi', () => {
  assert.deepEqual(enabledCarriers({}), ['omniva', 'smartpost']);
  assert.deepEqual(enabledCarriers({ ENABLED_CARRIERS: ' DPD, omniva ,posti,dpd' }), ['dpd', 'omniva']);
  const logger = silentLogger();
  assert.deepEqual(enabledCarriers({ ENABLED_CARRIERS: 'posti' }, logger), ['omniva', 'smartpost']);
  assert.ok(logger.lines.some((l) => /ENABLED_CARRIERS/.test(l)));
  assert.equal(enabledCarrierNames({}), 'Omniva või SmartPosti');
  assert.equal(enabledCarrierNames({ ENABLED_CARRIERS: 'omniva,smartpost,dpd' }), 'Omniva, SmartPosti või DPD');
  assert.deepEqual(carrierMeta({ ENABLED_CARRIERS: 'smartpost' }).map((c) => [c.id, c.enabled]), [['omniva', false], ['smartpost', true], ['dpd', false]]);
});

test('checkout: keelatud vedaja (DPD vaikimisi) → 400 shipping.carrier, tellimust ei teki', async () => {
  const db = await freshDb();
  const { handler, stripe } = setup();
  const { res, data } = await call(handler, postJson(validBody({ shipping: { carrier: 'dpd' } })));
  assert.equal(res.status, 400);
  assert.equal(data.field, 'shipping.carrier');
  assert.match(data.error, /Omniva või SmartPosti/);
  assert.equal(stripe.calls.sessions.length, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders'))[0].n, 0);

  const enabled = setup({ env: { ...ENV, ENABLED_CARRIERS: 'omniva,smartpost,dpd' } });
  const ok = await call(enabled.handler, postJson(validBody({ shipping: { carrier: 'dpd', lockerId: '', lockerName: 'DPD Pickup Rakvere', manual: true } })));
  assert.equal(ok.res.status, 200);
  const row = await getOrderByToken(db, ok.data.token);
  assert.equal(row.carrier, 'dpd');
  assert.equal(row.locker_id, null);
});

test('checkout: laoseisust ei piisa (komplektid lahti võetuna) → 409, Stripe\'i ei kutsuta', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO inventory (game_id, stock) VALUES ('mida-viiu', 1), ('vigur', 0)");
  const { handler, stripe } = setup();
  const { res, data } = await call(handler, postJson(validBody({ items: [{ id: 'komplekt-koik', qty: 1 }, { id: 'mida-viiu', qty: 1 }] })));
  assert.equal(res.status, 409);
  assert.equal(data.field, 'items');
  assert.match(data.error, /„MIDA V!!!U“ on laos ainult 1 tk/);
  assert.match(data.error, /„Vigur“ on hetkel otsas/);
  assert.deepEqual(data.shortages, [
    { id: 'mida-viiu', name: 'MIDA V!!!U', available: 1 },
    { id: 'vigur', name: 'Vigur', available: 0 },
  ]);
  assert.equal(stripe.calls.sessions.length, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders'))[0].n, 0);

  // Oled Semu? reale pole laoseisu seatud → piiramatu
  const ok = await call(handler, postJson(validBody({ items: [{ id: 'oled-semu', qty: 20 }], ageConfirmed: false })));
  assert.equal(ok.res.status, 200);
});

test('checkout: andmebaas seadistamata → 503 selge teatega; ühenduse viga → 503', async () => {
  const missing = setup({ getDb: async () => { throw Object.assign(new Error('x'), { code: 'DB_NOT_CONFIGURED' }); } });
  const r1 = await call(missing.handler, postJson(validBody()));
  assert.equal(r1.res.status, 503);
  assert.match(r1.data.error, /ajutiselt peatatud/);
  assert.ok(missing.logger.lines.some((l) => /NETLIFY_DATABASE_URL/.test(l)));
  assert.equal(missing.stripe.calls.sessions.length, 0);

  const broken = setup({ getDb: async () => { throw new Error('ECONNREFUSED'); } });
  const r2 = await call(broken.handler, postJson(validBody()));
  assert.equal(r2.res.status, 503);
  assert.match(r2.data.error, /salvestada/);
});

test('checkout: automaadi ametlikud andmed võetakse nimekirjast (kliendi saadetud nimi ei loe)', async () => {
  const db = await freshDb();
  await writeLockerCache(db, 'omniva', [{ id: '96331', name: 'Tallinna Kristiine keskuse pakiautomaat', city: 'Tallinn', address: 'Endla tn 45', postalCode: '96331' }]);
  const { handler, stripe } = setup();
  const { data } = await call(handler, postJson(validBody({ shipping: { lockerName: '<b>Võltsnimi</b>', lockerAddress: 'kuskil' } })));
  const row = await getOrderByToken(db, data.token);
  assert.equal(row.locker_name, 'Tallinna Kristiine keskuse pakiautomaat');
  assert.equal(row.locker_address, 'Endla tn 45');
  assert.equal(row.locker_city, 'Tallinn');
  // Ka Stripe'i makselehel ja makse andmetes on sama (ametlik) automaat.
  const params = stripe.calls.sessions.at(-1);
  assert.equal(params.metadata.locker_name, 'Tallinna Kristiine keskuse pakiautomaat');
  assert.equal(params.metadata.locker_address, 'Endla tn 45, Tallinn');
  assert.match(params.shipping_options[0].shipping_rate_data.display_name, /Kristiine/);
  assert.doesNotMatch(JSON.stringify(params), /Võltsnimi|kuskil/);
});

test('checkout: tarnehind tuleb valitud vedaja hinnast; alla 30 € lisandub tarne', async () => {
  await freshDb();
  const { handler, stripe } = setup();
  const { data } = await call(handler, postJson(validBody({ shipping: { carrier: 'smartpost' } })));
  assert.ok(data.token);
  const p = stripe.calls.sessions[0];
  assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount, 299);
  assert.match(p.shipping_options[0].shipping_rate_data.display_name, /^SmartPosti pakiautomaat — /);
  const row = await getOrderByToken(await testDb(), data.token);
  assert.equal(row.shipping_cents, 299);
  assert.equal(row.total_cents, 2049);
});

test('checkout: MOCK_STRIPE=1 (kohalikult) → test-Stripe\'i makseleht; Lambdas mock välja lülitatud', async () => {
  resetMockStripe();
  await freshDb();
  const env = { MOCK_STRIPE: '1', URL: 'http://localhost:8502' };
  assert.equal(isMockStripe(env), true);
  const handler = createCheckoutHandler({ env, logger: silentLogger(), getDb: () => testDb() });
  const { res, data } = await call(handler, postJson(validBody({ code: 'AGE15' })));
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.match(data.url, /^http:\/\/localhost:8502\/__mock-stripe\/checkout\?session=cs_test_mock[0-9a-f]+$/);
  const row = await getOrderByToken(await testDb(), data.token);
  assert.equal(row.stripe_session_url, data.url);

  // Tootmises (AWS Lambda) MOCK_STRIPE ei kehti → nõutakse päris võtit.
  const lambdaEnv = { MOCK_STRIPE: '1', AWS_LAMBDA_FUNCTION_NAME: 'create-checkout' };
  assert.equal(isMockStripe(lambdaEnv), false);
  const prod = createCheckoutHandler({ env: lambdaEnv, logger: silentLogger(), getDb: () => testDb() });
  const r = await call(prod, postJson(validBody()));
  assert.equal(r.res.status, 500);
  assert.equal(r.data.error, 'Makse pole veel seadistatud. Võta meiega ühendust.');
});
