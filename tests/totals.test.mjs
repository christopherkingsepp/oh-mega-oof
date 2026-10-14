// computeTotals() — sama funktsioon arvutab summad brauseris JA makse-funktsioonis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, toCents, normalizeCode, PRODUCTS, SHIPPING, MAX_QTY_PER_ITEM } from '../public/assets/js/catalog.js';

test('tühi ostukorv: kõik nullid, tarne 0', () => {
  const t = computeTotals([], null);
  assert.equal(t.lines.length, 0);
  assert.equal(t.subtotalCents, 0);
  assert.equal(t.shippingCents, 0);
  assert.equal(t.totalCents, 0);
});

test('üks MIDA V!!!U: 17,50 € + tarne 2,99 €', () => {
  const t = computeTotals([{ id: 'mida-viiu', qty: 1 }], null);
  assert.equal(t.subtotalCents, 1750);
  assert.equal(t.discountCents, 0);
  assert.equal(t.shippingCents, 299);
  assert.equal(t.totalCents, 2049);
  assert.equal(t.freeShippingRemainingCents, 1250);
  assert.equal(t.code, null);
});

test('AGE15: 15% soodustus ümardatakse sendini (2,625 → 2,63)', () => {
  const t = computeTotals([{ id: 'mida-viiu', qty: 1 }], 'AGE15');
  assert.equal(t.code, 'AGE15');
  assert.equal(t.percent, 15);
  assert.equal(t.discountCents, 263);
  assert.equal(t.shippingCents, 299);
  assert.equal(t.totalCents, 1750 - 263 + 299);
});

test('sooduskood normaliseeritakse (tühikud, väiketähed); vale kood ei anna soodustust', () => {
  assert.equal(normalizeCode('  age15 '), 'AGE15');
  assert.equal(normalizeCode('AGE16'), null);
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(null), null);
  const bad = computeTotals([{ id: 'vigur', qty: 1 }], 'TASUTA100');
  assert.equal(bad.code, null);
  assert.equal(bad.discountCents, 0);
});

test('ümardamine: 12,95 × 3 ja 15% (582,75 → 583); ujukomavead puuduvad', () => {
  assert.equal(toCents(12.95), 1295);
  assert.equal(toCents(0.1 + 0.2), 30);
  const t = computeTotals([{ id: 'vigur', qty: 3 }], 'AGE15');
  assert.equal(t.subtotalCents, 3885);
  assert.equal(t.discountCents, 583);
  assert.equal(t.shippingCents, 0); // 33,02 € ≥ 30 €
  assert.equal(t.totalCents, 3302);
});

test('tasuta tarne piir: täpselt 30,00 € on tasuta, 29,99 € ei ole', () => {
  // Kataloogi hindadega täpselt 30,00 € ei saa, seega lisame ajutised testtooted.
  PRODUCTS['__test-30'] = { id: '__test-30', name: 'Test 30', price: 30.0, adult: false, image: '/x.webp' };
  PRODUCTS['__test-2999'] = { id: '__test-2999', name: 'Test 29.99', price: 29.99, adult: false, image: '/x.webp' };
  try {
    const exact = computeTotals([{ id: '__test-30', qty: 1 }], null);
    assert.equal(exact.subtotalCents, toCents(SHIPPING.freeFrom));
    assert.equal(exact.shippingCents, 0);
    assert.equal(exact.freeShippingRemainingCents, 0);
    assert.equal(exact.totalCents, 3000);

    const below = computeTotals([{ id: '__test-2999', qty: 1 }], null);
    assert.equal(below.shippingCents, 299);
    assert.equal(below.freeShippingRemainingCents, 1);
    assert.equal(below.totalCents, 2999 + 299);
  } finally {
    delete PRODUCTS['__test-30'];
    delete PRODUCTS['__test-2999'];
  }
});

test('tasuta tarne arvestatakse PÄRAST soodustust', () => {
  const items = [
    { id: 'mida-viiu', qty: 1 },
    { id: 'oled-semu', qty: 1 },
  ]; // 30,45 €
  assert.equal(computeTotals(items, null).shippingCents, 0);
  const withCode = computeTotals(items, 'AGE15'); // 30,45 − 4,57 = 25,88 €
  assert.equal(withCode.discountCents, 457);
  assert.equal(withCode.shippingCents, 299);
  assert.equal(withCode.totalCents, 3045 - 457 + 299);
});

test('komplekt "Kõik 3 mängu" (33 €): tasuta tarne', () => {
  const t = computeTotals([{ id: 'komplekt-koik', qty: 1 }], null);
  assert.equal(t.subtotalCents, 3300);
  assert.equal(t.shippingCents, 0);
  assert.equal(t.totalCents, 3300);
});

test('vale id jäetakse vahele', () => {
  const t = computeTotals(
    [
      { id: 'olematu', qty: 2 },
      { id: 'vigur', qty: 1 },
    ],
    null,
  );
  assert.equal(t.lines.length, 1);
  assert.equal(t.subtotalCents, 1295);
});

test('kogused: 0 ja −1 jäetakse välja, 21 piiratakse 20-ga, 1.5 → 1', () => {
  const zero = computeTotals([{ id: 'vigur', qty: 0 }], null);
  assert.equal(zero.lines.length, 0);
  assert.equal(zero.totalCents, 0);

  const negative = computeTotals([{ id: 'vigur', qty: -1 }], null);
  assert.equal(negative.lines.length, 0);

  const tooMany = computeTotals([{ id: 'vigur', qty: 21 }], null);
  assert.equal(tooMany.lines[0].qty, MAX_QTY_PER_ITEM);
  assert.equal(tooMany.subtotalCents, 1295 * MAX_QTY_PER_ITEM);

  const fraction = computeTotals([{ id: 'vigur', qty: 1.5 }], null);
  assert.equal(fraction.lines[0].qty, 1);

  const text = computeTotals([{ id: 'vigur', qty: 'kaks' }], null);
  assert.equal(text.lines.length, 0);
});
