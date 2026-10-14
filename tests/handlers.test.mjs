// Netlify funktsioonide käsitlejad tervikuna: HTTP-staatused, päised ja
// Stripe'i väljakutsed (võlts-Stripe'iga — võrku ei kasutata).
import test from 'node:test';
import assert from 'node:assert/strict';
import checkoutDefault, { createHandler as createCheckoutHandler, config as checkoutConfig, MAX_BODY_BYTES } from '../netlify/functions/create-checkout.mjs';
import lockersDefault, { createHandler as createLockersHandler, config as lockersConfig } from '../netlify/functions/parcel-lockers.mjs';
import { validBody, mockStripe, stripeError, silentLogger, postJson, fixture } from './helpers.mjs';

const KEY = 'sk_test_51AbCdEfGhIjKlMnOp';
const ENV = { STRIPE_SECRET_KEY: KEY, URL: 'https://age.example' };

/** Käsitleja võlts-Stripe'iga; tagastab ka logija ja Stripe'i väljakutsed. */
function checkoutSetup({ env = ENV, stripe = mockStripe() } = {}) {
  const logger = silentLogger();
  const keys = [];
  const handler = createCheckoutHandler({
    env,
    logger,
    couponCache: new Set(),
    stripeFactory: (key) => {
      keys.push(key);
      return stripe;
    },
  });
  return { handler, logger, stripe, keys };
}

async function call(handler, req, context) {
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

const assertJsonNoStore = (res) => {
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
};

/* =========================================================================
   POST /api/checkout
   ========================================================================= */

test('checkout: tee ja vaikimisi eksport', () => {
  assert.equal(checkoutConfig.path, '/api/checkout');
  assert.equal(typeof checkoutDefault, 'function');
});

test('checkout: GET → 405 koos Allow päisega', async () => {
  const { handler, keys } = checkoutSetup();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { res, data } = await call(handler, new Request('https://age.example/api/checkout', { method }));
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'POST');
    assertJsonNoStore(res);
    assert.equal(typeof data.error, 'string');
  }
  assert.equal(keys.length, 0, 'Stripe\'i ei tohi kutsuda');
});

test('checkout: vigane JSON → 400', async () => {
  const { handler, stripe } = checkoutSetup();
  for (const body of ['{"items": [', '', 'tere', '<html>']) {
    const { res, data } = await call(handler, postJson(body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assertJsonNoStore(res);
    assert.match(data.error, /Vigane päring/);
  }
  assert.equal(stripe.calls.sessions.length, 0);
});

test('checkout: liiga suur keha → 413 (ka ilma Content-Length päiseta)', async () => {
  const { handler } = checkoutSetup();
  const big = JSON.stringify({ ...validBody(), padding: 'x'.repeat(MAX_BODY_BYTES) });
  const declared = await call(handler, postJson(big));
  assert.equal(declared.res.status, 413);

  // "chunked" voog ilma Content-Length'ita: lugemine katkestatakse piiri ületamisel
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled++;
      if (pulled > 100) return controller.close();
      controller.enqueue(new TextEncoder().encode('x'.repeat(4096)));
    },
  });
  const req = new Request('https://age.example/api/checkout', { method: 'POST', body: stream, duplex: 'half', headers: { 'Content-Type': 'application/json' } });
  const chunked = await call(handler, req);
  assert.equal(chunked.res.status, 413);
  assert.ok(pulled < 20, `lugemine pidi katkema varakult (loeti ${pulled} tükki)`);
});

test('checkout: vale Content-Type → 415 ja Stripe\'i ei kutsuta', async () => {
  const { handler, stripe } = checkoutSetup();
  const req = new Request('https://age.example/api/checkout', { method: 'POST', body: JSON.stringify(validBody()), headers: { 'Content-Type': 'text/plain' } });
  const { res } = await call(handler, req);
  assert.equal(res.status, 415);
  assert.equal(stripe.calls.sessions.length, 0);
});

test('checkout: valideerimisviga → 400 { error, field } ja Stripe\'i ei kutsuta', async () => {
  const { handler, keys } = checkoutSetup();
  const cases = [
    [validBody({ items: [] }), 'items'],
    [validBody({ items: [{ id: 'mida-viiu', qty: 21 }] }), 'items'],
    [validBody({ customer: { email: 'mari@' } }), 'customer.email'],
    [validBody({ customer: { phone: '123' } }), 'customer.phone'],
    [validBody({ shipping: { carrier: 'posti' } }), 'shipping.carrier'],
    [validBody({ shipping: { lockerName: '' } }), 'shipping.lockerName'],
    [validBody({ termsAccepted: false }), 'termsAccepted'],
    [validBody({ ageConfirmed: false }), 'ageConfirmed'],
  ];
  for (const [body, field] of cases) {
    const { res, data } = await call(handler, postJson(body));
    assert.equal(res.status, 400, field);
    assertJsonNoStore(res);
    assert.equal(data.field, field);
    assert.ok(data.error.length > 10);
  }
  assert.equal(keys.length, 0);
});

test('checkout: STRIPE_SECRET_KEY puudub → 500 sõbraliku teatega ja console.error', async () => {
  for (const env of [{}, { STRIPE_SECRET_KEY: '' }, { STRIPE_SECRET_KEY: '   ' }]) {
    const { handler, logger, keys } = checkoutSetup({ env });
    const { res, data } = await call(handler, postJson(validBody()));
    assert.equal(res.status, 500);
    assertJsonNoStore(res);
    assert.equal(data.error, 'Makse pole veel seadistatud. Võta meiega ühendust.');
    assert.equal(keys.length, 0);
    assert.ok(logger.lines.some((l) => /STRIPE_SECRET_KEY/.test(l)));
  }
});

test('checkout: avalik võti (pk_) Stripe\'i salajase võtme asemel → 500', async () => {
  const { handler, logger, keys } = checkoutSetup({ env: { STRIPE_SECRET_KEY: 'pk_test_123' } });
  const { res, data } = await call(handler, postJson(validBody()));
  assert.equal(res.status, 500);
  assert.equal(data.error, 'Makse pole veel seadistatud. Võta meiega ühendust.');
  assert.equal(keys.length, 0);
  assert.ok(logger.lines.some((l) => /pk_/.test(l)));
});

test('checkout: õnnestub → 200 { url }, summad serverist, tagasisuunamine saidile', async () => {
  const { handler, stripe, keys } = checkoutSetup();
  const body = validBody({ items: [{ id: 'mida-viiu', qty: 2, price: 0.01 }], totalCents: 1 });
  const { res, data } = await call(handler, postJson(body));
  assert.equal(res.status, 200);
  assertJsonNoStore(res);
  assert.equal(data.url, 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3');
  assert.match(data.orderId, /^AGE-[A-Z2-9]{6}$/);
  assert.equal(data.warnings, undefined);
  assert.deepEqual(keys, [KEY]);

  assert.equal(stripe.calls.sessions.length, 1);
  const p = stripe.calls.sessions[0];
  assert.equal(p.line_items[0].price_data.unit_amount, 1750, 'kliendi hind 0,01 € jäetakse tähelepanuta');
  assert.equal(p.line_items[0].quantity, 2);
  assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0, '35 € → tasuta tarne');
  assert.equal(p.success_url, 'https://age.example/aitah?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(p.cancel_url, 'https://age.example/ostukorv?katkestatud=1');
  assert.equal(p.client_reference_id, data.orderId);
  assert.equal(p.discounts, undefined);
  assert.equal(stripe.calls.retrieve.length + stripe.calls.createCoupon.length, 0, 'ilma koodita kupongi ei puudutata');
});

test('checkout: AGE15 → kupong luuakse ja lisatakse makselehele', async () => {
  const { handler, stripe } = checkoutSetup();
  const { res } = await call(handler, postJson(validBody({ code: 'age15' })));
  assert.equal(res.status, 200);
  assert.deepEqual(stripe.calls.retrieve, ['AGE15-263']);
  assert.equal(stripe.calls.createCoupon[0].amount_off, 263);
  assert.deepEqual(stripe.calls.sessions[0].discounts, [{ coupon: 'AGE15-263' }]);
  assert.equal(stripe.calls.sessions[0].metadata.discount_code, 'AGE15');
});

test('checkout: vale sooduskood ei lõhu makset — 200 + hoiatus, soodustuseta', async () => {
  const { handler, stripe } = checkoutSetup();
  const { res, data } = await call(handler, postJson(validBody({ code: 'KÕIKTASUTA' })));
  assert.equal(res.status, 200);
  assert.ok(data.url);
  assert.equal(data.warnings.length, 1);
  assert.equal(stripe.calls.sessions[0].discounts, undefined);
  assert.equal(stripe.calls.createCoupon.length, 0);
});

test('checkout: origin — ilma URL-ita kasutatakse Netlify konteksti saidi aadressi', async () => {
  const { handler, stripe } = checkoutSetup({ env: { STRIPE_SECRET_KEY: KEY } });
  const { res } = await call(handler, postJson(validBody(), { url: 'http://localhost:8104/api/checkout' }), {
    site: { url: 'http://localhost:8104' },
  });
  assert.equal(res.status, 200);
  assert.equal(stripe.calls.sessions[0].success_url, 'http://localhost:8104/aitah?session_id={CHECKOUT_SESSION_ID}');
});

test('checkout: Stripe\'i viga → 502, logis pole kliendi isikuandmeid', async () => {
  const err = stripeError('parameter_invalid_empty', 400, 'Invalid request');
  err.requestId = 'req_123';
  const { handler, logger } = checkoutSetup({ stripe: mockStripe({ sessionError: err }) });
  const body = validBody({ customer: { name: 'Salajane Sass', email: 'sass@example.ee', phone: '5555 1234' } });
  const { res, data } = await call(handler, postJson(body));
  assert.equal(res.status, 502);
  assertJsonNoStore(res);
  assert.equal(data.error, 'Makset ei õnnestunud alustada. Proovi uuesti.');
  const log = logger.lines.join('\n');
  assert.match(log, /req_123/);
  for (const secret of ['Salajane', 'sass@example.ee', '55551234', KEY]) assert.ok(!log.includes(secret), `logis on "${secret}"`);
});

test('checkout: kupongi loomise viga → 502', async () => {
  const { handler, stripe } = checkoutSetup({ stripe: mockStripe({ createCouponError: stripeError('rate_limit', 429) }) });
  const { res, data } = await call(handler, postJson(validBody({ code: 'AGE15' })));
  assert.equal(res.status, 502);
  assert.equal(data.error, 'Makset ei õnnestunud alustada. Proovi uuesti.');
  assert.equal(stripe.calls.sessions.length, 0);
});

test('checkout: Stripe vastas ilma URL-ita → 502', async () => {
  const stripe = mockStripe();
  stripe.checkout.sessions.create = async () => ({ id: 'cs_test_x', url: null });
  const { handler } = checkoutSetup({ stripe });
  const { res } = await call(handler, postJson(validBody()));
  assert.equal(res.status, 502);
});

test('checkout: Stripe kliendi loomine ebaõnnestub → 500', async () => {
  const logger = silentLogger();
  const handler = createCheckoutHandler({
    env: ENV,
    logger,
    stripeFactory: () => {
      throw new Error('init failed');
    },
  });
  const { res, data } = await call(handler, postJson(validBody()));
  assert.equal(res.status, 500);
  assert.equal(data.error, 'Makse pole veel seadistatud. Võta meiega ühendust.');
});

/* =========================================================================
   GET /api/pakiautomaadid
   ========================================================================= */

const lockersReq = (query = '', method = 'GET') => new Request(`https://age.example/api/pakiautomaadid${query}`, { method });
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function lockersSetup(fetchImpl, env = {}) {
  const logger = silentLogger();
  const urls = [];
  const handler = createLockersHandler({
    env,
    logger,
    timeoutMs: 500,
    fetchImpl: async (url, init) => {
      urls.push(url);
      return fetchImpl(url, init);
    },
  });
  return { handler, logger, urls };
}

test('pakiautomaadid: tee ja vaikimisi eksport', () => {
  assert.equal(lockersConfig.path, '/api/pakiautomaadid');
  assert.equal(typeof lockersDefault, 'function');
});

test('pakiautomaadid: tundmatu või puuduv vedaja → 400', async () => {
  const { handler, urls } = lockersSetup(async () => jsonResponse([]));
  for (const q of ['', '?carrier=', '?carrier=posti', '?carrier=toString', '?carrier=__proto__']) {
    const { res, data } = await call(handler, lockersReq(q));
    assert.equal(res.status, 400, q);
    assertJsonNoStore(res);
    assert.equal(data.field, 'carrier');
  }
  assert.equal(urls.length, 0);
});

test('pakiautomaadid: POST → 405', async () => {
  const { handler } = lockersSetup(async () => jsonResponse([]));
  const { res } = await call(handler, lockersReq('?carrier=omniva', 'POST'));
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD');
});

test('pakiautomaadid: Omniva → normaliseeritud nimekiri ja pikk CDN puhver', async () => {
  const { handler, urls } = lockersSetup(async () => jsonResponse(fixture('omniva-locations.json')));
  const { res, data } = await call(handler, lockersReq('?carrier=OMNIVA'));
  assert.equal(res.status, 200);
  assert.deepEqual(urls, ['https://www.omniva.ee/locations.json']);
  assert.equal(data.carrier, 'omniva');
  assert.equal(data.manual, undefined);
  assert.equal(data.lockers.length, 7);
  for (const l of data.lockers) assert.deepEqual(Object.keys(l).sort(), ['address', 'city', 'id', 'name']);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
  assert.match(res.headers.get('netlify-cdn-cache-control'), /s-maxage=86400/);
  assert.match(res.headers.get('netlify-cdn-cache-control'), /stale-while-revalidate=604800/);
  assert.match(res.headers.get('content-type'), /^application\/json/);
});

test('pakiautomaadid: soe funktsioon kasutab mälupuhvrit (teist päringut allikale ei tehta)', async () => {
  const { handler, urls } = lockersSetup(async () => jsonResponse(fixture('smartpost-places.json')));
  const first = await call(handler, lockersReq('?carrier=smartpost'));
  const second = await call(handler, lockersReq('?carrier=smartpost'));
  assert.equal(first.data.lockers.length, 4);
  assert.deepEqual(second.data, first.data);
  assert.equal(urls.length, 1);
});

test('pakiautomaadid: allikas maas → 200 manual:true, lühike puhver, viga logitakse', async () => {
  const { handler, logger } = lockersSetup(async () => {
    throw new TypeError('fetch failed');
  });
  const { res, data } = await call(handler, lockersReq('?carrier=omniva'));
  assert.equal(res.status, 200);
  assert.equal(data.carrier, 'omniva');
  assert.equal(data.manual, true);
  assert.deepEqual(data.lockers, []);
  assert.match(data.error, /käsitsi/);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
  assert.doesNotMatch(res.headers.get('netlify-cdn-cache-control'), /86400/);
  assert.ok(logger.lines.some((l) => /fetch failed/.test(l)));
});

test('pakiautomaadid: ebaõnnestumist ei jäeta mällu — järgmine päring proovib uuesti', async () => {
  let fail = true;
  const { handler, urls } = lockersSetup(async () => {
    if (fail) return new Response('Service Unavailable', { status: 503 });
    return jsonResponse(fixture('omniva-locations.json'));
  });
  const first = await call(handler, lockersReq('?carrier=omniva'));
  assert.equal(first.data.manual, true);
  fail = false;
  const second = await call(handler, lockersReq('?carrier=omniva'));
  assert.equal(second.data.manual, undefined);
  assert.equal(second.data.lockers.length, 7);
  assert.equal(urls.length, 2);
});

test('pakiautomaadid: aeglane allikas → ajalimiit → manual:true', async () => {
  const { handler } = lockersSetup(
    (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
  );
  const started = Date.now();
  const { res, data } = await call(handler, lockersReq('?carrier=omniva'));
  assert.equal(res.status, 200);
  assert.equal(data.manual, true);
  assert.ok(Date.now() - started < 2000);
});

test('pakiautomaadid: DPD ilma DPD_LOCKERS_URL-ita → manual:true ilma veata', async () => {
  const { handler, urls } = lockersSetup(async () => jsonResponse([]));
  const { res, data } = await call(handler, lockersReq('?carrier=dpd'));
  assert.equal(res.status, 200);
  assert.deepEqual(data, { carrier: 'dpd', lockers: [], manual: true });
  assert.equal(urls.length, 0);
});

test('pakiautomaadid: DPD koos DPD_LOCKERS_URL-iga', async () => {
  const { handler, urls } = lockersSetup(async () => jsonResponse(fixture('dpd-lockers.json')), {
    DPD_LOCKERS_URL: 'https://dpd.example/lockers.json',
  });
  const { res, data } = await call(handler, lockersReq('?carrier=dpd'));
  assert.equal(res.status, 200);
  assert.deepEqual(urls, ['https://dpd.example/lockers.json']);
  assert.equal(data.lockers.length, 2);
});

test('checkout: töölaual kustutatud kupong → unustatakse, luuakse uuesti ja makse õnnestub', async () => {
  const store = {};
  const stripe = mockStripe({ coupons: store });
  let failOnce = true;
  const origCreate = stripe.checkout.sessions.create;
  stripe.checkout.sessions.create = async (params) => {
    if (failOnce && params.discounts) {
      failOnce = false;
      stripe.calls.sessions.push(params);
      delete store[params.discounts[0].coupon]; // keegi kustutas kupongi töölaual
      const err = stripeError('resource_missing', 400, `No such coupon: '${params.discounts[0].coupon}'`);
      err.param = 'discounts[0][coupon]';
      throw err;
    }
    return origCreate(params);
  };
  const { handler } = checkoutSetup({ stripe });
  const { res, data } = await call(handler, postJson(JSON.stringify(validBody({ code: 'AGE15' }))));
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(stripe.calls.sessions.length, 2);
  assert.ok(stripe.calls.createCoupon.length >= 2, 'kupong loodi uuesti');
});
