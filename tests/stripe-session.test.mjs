// buildSessionParams(), ensureCoupon(), resolveOrigin(), toMetadata().
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder } from '../netlify/functions/_lib/order.mjs';
import {
  buildSessionParams,
  ensureCoupon,
  couponIdFor,
  resolveOrigin,
  toMetadata,
  createOrderId,
} from '../netlify/functions/_lib/stripe-session.mjs';
import { validBody, mockStripe, stripeError } from './helpers.mjs';

const ORIGIN = 'https://age.example';
const orderOf = (overrides) => {
  const r = validateOrder(validBody(overrides));
  assert.equal(r.ok, true, r.error);
  return r.order;
};

/** Mida Stripe kliendilt võtaks: read − kupong + tarne. */
function stripeTotal(params, couponAmount = 0) {
  const lines = params.line_items.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
  const ship = params.shipping_options[0].shipping_rate_data.fixed_amount.amount;
  return lines - couponAmount + ship;
}

test('põhiväljad: makserežiim, eesti keel, e-post, tagasisuunamised', () => {
  const p = buildSessionParams(orderOf(), { origin: ORIGIN, orderId: 'AGE-TEST01' });
  assert.equal(p.mode, 'payment');
  assert.equal(p.locale, 'et');
  assert.equal(p.customer_email, 'mari@example.ee');
  assert.equal(p.client_reference_id, 'AGE-TEST01');
  assert.equal(p.success_url, 'https://age.example/aitah?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(p.cancel_url, 'https://age.example/ostukorv?katkestatud=1');
  assert.equal('payment_method_types' in p, false, 'dünaamilised makseviisid — ära sea payment_method_types');
  assert.equal('allow_promotion_codes' in p, false, 'ei tohi koos discounts-iga');
});

test('read: hinnad sentides kataloogist, absoluutsed pildi-URL-id', () => {
  const p = buildSessionParams(
    orderOf({
      items: [
        { id: 'mida-viiu', qty: 2 },
        { id: 'komplekt-semu-vigur', qty: 1 },
      ],
    }),
    { origin: ORIGIN },
  );
  assert.equal(p.line_items.length, 2);
  const [a, b] = p.line_items;
  assert.equal(a.quantity, 2);
  assert.equal(a.price_data.currency, 'eur');
  assert.equal(a.price_data.unit_amount, 1750);
  assert.equal(a.price_data.product_data.name, 'MIDA V!!!U');
  assert.deepEqual(a.price_data.product_data.images, ['https://age.example/assets/img/games/mida-viiu-box-front.webp']);
  assert.equal(a.price_data.product_data.metadata.product_id, 'mida-viiu');
  assert.equal(b.price_data.unit_amount, 2000);
  assert.ok(Number.isInteger(a.price_data.unit_amount));
});

test('summa Stripe\'is = ostukorvi summa (ilma koodita, tarnega)', () => {
  const order = orderOf({ items: [{ id: 'mida-viiu', qty: 1 }] });
  const p = buildSessionParams(order, { origin: ORIGIN });
  assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount, 299);
  assert.equal(stripeTotal(p), order.totals.totalCents);
  assert.equal(p.discounts, undefined);
});

test('summa Stripe\'is = ostukorvi summa (AGE15, kupong täpse summaga)', () => {
  for (const items of [
    [{ id: 'mida-viiu', qty: 1 }],
    [{ id: 'vigur', qty: 3 }],
    [
      { id: 'mida-viiu', qty: 1 },
      { id: 'oled-semu', qty: 1 },
    ],
    [{ id: 'komplekt-koik', qty: 2 }],
  ]) {
    const order = orderOf({ items, code: 'AGE15' });
    const couponId = couponIdFor('AGE15', order.totals.discountCents);
    const p = buildSessionParams(order, { origin: ORIGIN, couponId });
    assert.deepEqual(p.discounts, [{ coupon: couponId }]);
    assert.equal(stripeTotal(p, order.totals.discountCents), order.totals.totalCents, JSON.stringify(items));
  }
});

test('tasuta tarne (≥ 30 €): tarne summa 0', () => {
  const order = orderOf({ items: [{ id: 'komplekt-koik', qty: 1 }] });
  const p = buildSessionParams(order, { origin: ORIGIN });
  const rate = p.shipping_options[0].shipping_rate_data;
  assert.equal(rate.type, 'fixed_amount');
  assert.equal(rate.fixed_amount.amount, 0);
  assert.equal(rate.fixed_amount.currency, 'eur');
  assert.deepEqual(rate.delivery_estimate, {
    minimum: { unit: 'business_day', value: 2 },
    maximum: { unit: 'business_day', value: 5 },
  });
});

test('tarne nimi: vedaja + automaat, max 100 märki; makselehe sõnum ≤ 1200', () => {
  const short = buildSessionParams(orderOf(), { origin: ORIGIN });
  assert.equal(short.shipping_options[0].shipping_rate_data.display_name, 'Omniva pakiautomaat — Tallinna Kristiine keskuse pakiautomaat');
  assert.match(short.custom_text.submit.message, /Pakk saadetakse pakiautomaati: .*Tallinna Kristiine keskuse pakiautomaat/);

  const long = buildSessionParams(orderOf({ shipping: { lockerName: 'Ö'.repeat(200), lockerAddress: 'a'.repeat(200) } }), { origin: ORIGIN });
  assert.ok(long.shipping_options[0].shipping_rate_data.display_name.length <= 100);
  assert.ok(long.custom_text.submit.message.length <= 1200);
  assert.ok(long.payment_intent_data.shipping.address.line1.length <= 100);
});

test('metadata: ainult stringid, ≤ 500 märki, ≤ 50 võtit, võtmed ≤ 40', () => {
  const order = orderOf({
    code: 'AGE15',
    newsletter: true,
    items: [
      { id: 'mida-viiu', qty: 2 },
      { id: 'vigur', qty: 1 },
    ],
    shipping: { lockerName: 'L'.repeat(200), lockerAddress: 'A'.repeat(200) },
    customer: { name: 'N'.repeat(100) },
  });
  const p = buildSessionParams(order, { origin: ORIGIN, couponId: 'AGE15-656', orderId: 'AGE-ABC234' });
  for (const md of [p.metadata, p.payment_intent_data.metadata]) {
    const keys = Object.keys(md);
    assert.ok(keys.length <= 50);
    for (const k of keys) {
      assert.ok(k.length <= 40, k);
      assert.equal(typeof md[k], 'string', k);
      assert.ok(md[k].length > 0 && md[k].length <= 500, k);
    }
  }
  const md = p.metadata;
  assert.equal(md.order_id, 'AGE-ABC234');
  assert.equal(md.items, 'mida-viiu x2, vigur x1');
  assert.equal(md.carrier, 'omniva');
  assert.equal(md.locker_id, '96331');
  assert.equal(md.phone, '+37251234567');
  assert.equal(md.discount_code, 'AGE15');
  assert.equal(md.newsletter, 'jah');
  assert.equal(md.age_confirmed, 'jah');
  assert.equal(md.total_cents, String(order.totals.totalCents));
  assert.match(p.payment_intent_data.description, /^ÄGE tellimus AGE-ABC234: MIDA V!!!U ×2, Vigur ×1$/);
  assert.equal(p.payment_intent_data.receipt_email, 'mari@example.ee');
  assert.deepEqual(p.payment_intent_data.shipping.address.country, 'EE');
});

test('metadata: ilma koodita discount_code puudub', () => {
  const p = buildSessionParams(orderOf({ newsletter: false }), { origin: ORIGIN });
  assert.equal('discount_code' in p.metadata, false);
  assert.equal(p.metadata.newsletter, 'ei');
});

test('toMetadata lõikab pikad väärtused ja jätab tühjad välja', () => {
  const md = toMetadata({ a: 'x'.repeat(800), b: '', c: null, d: 5, e: true, f: false });
  assert.equal(md.a.length, 500);
  assert.ok(md.a.endsWith('…'));
  assert.equal('b' in md, false);
  assert.equal('c' in md, false);
  assert.deepEqual([md.d, md.e, md.f], ['5', 'jah', 'ei']);
  const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, 'v']));
  assert.equal(Object.keys(toMetadata(many)).length, 50);
});

test('createOrderId: AGE-XXXXXX ilma segadust tekitavate tähtedeta', () => {
  const ids = new Set(Array.from({ length: 200 }, createOrderId));
  for (const id of ids) assert.match(id, /^AGE-[A-HJ-NP-Z2-9]{6}$/);
  assert.ok(ids.size > 190);
});

/* ---------------- ensureCoupon ---------------- */

test('ensureCoupon: olemasolev sobiv kupong → kasutatakse, uut ei looda', async () => {
  const stripe = mockStripe({ coupons: { 'AGE15-263': { id: 'AGE15-263', valid: true, amount_off: 263, currency: 'eur', percent_off: null } } });
  const id = await ensureCoupon(stripe, { code: 'AGE15', percent: 15, amountOffCents: 263 }, new Set());
  assert.equal(id, 'AGE15-263');
  assert.deepEqual(stripe.calls.retrieve, ['AGE15-263']);
  assert.equal(stripe.calls.createCoupon.length, 0);
});

test('ensureCoupon: puudub (404 resource_missing) → luuakse täpse summaga', async () => {
  const stripe = mockStripe();
  const id = await ensureCoupon(stripe, { code: 'AGE15', percent: 15, amountOffCents: 263 }, new Set());
  assert.equal(id, 'AGE15-263');
  assert.equal(stripe.calls.createCoupon.length, 1);
  const created = stripe.calls.createCoupon[0];
  assert.equal(created.id, 'AGE15-263');
  assert.equal(created.amount_off, 263);
  assert.equal(created.currency, 'eur');
  assert.equal(created.duration, 'once');
  assert.ok(created.name.length <= 40);
  assert.match(created.name, /AGE15.*15%/);
});

test('ensureCoupon: paralleelne loomine (resource_already_exists) → kasutatakse sama id-d', async () => {
  const stripe = mockStripe({ createCouponError: stripeError('resource_already_exists', 400, 'Coupon already exists.') });
  const id = await ensureCoupon(stripe, { code: 'AGE15', percent: 15, amountOffCents: 194 }, new Set());
  assert.equal(id, 'AGE15-194');
});

test('ensureCoupon: sama id-ga kupong ei sobi → luuakse uus genereeritud id-ga', async () => {
  const stripe = mockStripe({ coupons: { 'AGE15-263': { id: 'AGE15-263', valid: false, amount_off: 263, currency: 'eur' } } });
  const id = await ensureCoupon(stripe, { code: 'AGE15', percent: 15, amountOffCents: 263 }, new Set());
  assert.equal(id, 'gen_1');
  assert.equal(stripe.calls.createCoupon[0].id, undefined);
  assert.equal(stripe.calls.createCoupon[0].amount_off, 263);
});

test('ensureCoupon: muu Stripe viga visatakse edasi', async () => {
  const stripe = mockStripe({ retrieveError: stripeError('api_key_expired', 401) });
  await assert.rejects(() => ensureCoupon(stripe, { code: 'AGE15', percent: 15, amountOffCents: 263 }, new Set()), /api_key_expired/);
  const stripe2 = mockStripe({ createCouponError: stripeError('rate_limit', 429) });
  await assert.rejects(() => ensureCoupon(stripe2, { code: 'AGE15', percent: 15, amountOffCents: 263 }, new Set()));
});

test('ensureCoupon: mälupuhver säästab API päringu', async () => {
  const cache = new Set();
  const stripe = mockStripe();
  await ensureCoupon(stripe, { code: 'AGE15', percent: 15, amountOffCents: 263 }, cache);
  await ensureCoupon(stripe, { code: 'AGE15', percent: 15, amountOffCents: 263 }, cache);
  assert.equal(stripe.calls.retrieve.length, 1);
  assert.equal(stripe.calls.createCoupon.length, 1);
});

test('ensureCoupon: summa peab olema positiivne täisarv', async () => {
  await assert.rejects(() => ensureCoupon(mockStripe(), { code: 'AGE15', percent: 15, amountOffCents: 0 }, new Set()));
  await assert.rejects(() => ensureCoupon(mockStripe(), { code: 'AGE15', percent: 15, amountOffCents: 2.5 }, new Set()));
});

/* ---------------- resolveOrigin ---------------- */

test('resolveOrigin: tootmises Netlify URL, eelvaates päringu aadress, muidu päring', () => {
  const req = new Request('https://deploy-preview-7--age.netlify.app/api/checkout', { method: 'POST' });
  assert.equal(resolveOrigin(req, { URL: 'https://age.ee', CONTEXT: 'production' }), 'https://age.ee');
  assert.equal(resolveOrigin(req, { URL: 'https://age.ee/', CONTEXT: 'deploy-preview' }), 'https://deploy-preview-7--age.netlify.app');
  assert.equal(resolveOrigin(req, {}, { site: { url: 'http://localhost:8104' } }), 'http://localhost:8104');
  assert.equal(resolveOrigin(req, {}), 'https://deploy-preview-7--age.netlify.app');
  assert.equal(resolveOrigin(req, { URL: 'javascript:alert(1)' }), 'https://deploy-preview-7--age.netlify.app');
});

test('tunnusega tellimus: tagasisuunamised /aitah?t=… ja /ostukorv?katkestatud=1&t=…, aegumine ja tellimuse number', () => {
  const token = 'A'.repeat(43);
  const p = buildSessionParams(orderOf(), {
    origin: ORIGIN,
    orderId: '3f2b0c1e-0000-4000-8000-000000000001',
    orderNumber: 'AGE-1001',
    token,
    expiresAt: 1790000000,
  });
  assert.equal(p.success_url, `https://age.example/aitah?t=${token}&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(p.cancel_url, `https://age.example/ostukorv?katkestatud=1&t=${token}`);
  assert.equal(p.expires_at, 1790000000);
  assert.equal(p.client_reference_id, '3f2b0c1e-0000-4000-8000-000000000001');
  assert.equal(p.metadata.order_id, '3f2b0c1e-0000-4000-8000-000000000001');
  assert.equal(p.metadata.order_number, 'AGE-1001');
  assert.match(p.payment_intent_data.description, /^ÄGE tellimus AGE-1001: /);
  assert.equal(p.payment_intent_data.metadata.order_number, 'AGE-1001');
});
