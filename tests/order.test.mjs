// validateOrder() ja normalizePhone() — kõik veaharud.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, normalizePhone, isValidEmail } from '../netlify/functions/_lib/order.mjs';
import { validBody } from './helpers.mjs';

const expectError = (body, field) => {
  const r = validateOrder(body);
  assert.equal(r.ok, false, `ootasin viga väljal ${field}`);
  assert.equal(r.field, field);
  assert.equal(typeof r.error, 'string');
  assert.ok(r.error.length > 10, 'veateade peab olema inimloetav');
  return r;
};

test('korrektne tellimus normaliseeritakse', () => {
  const r = validateOrder(
    validBody({
      code: ' age15 ',
      customer: { name: '  Mari   Maasikas ', email: ' mari@example.ee ', phone: '+372 5123 4567' },
      shipping: { carrier: ' Omniva ' },
      newsletter: true,
    }),
  );
  assert.equal(r.ok, true);
  const o = r.order;
  assert.deepEqual(o.items, [{ id: 'mida-viiu', qty: 1 }]);
  assert.equal(o.customer.name, 'Mari Maasikas');
  assert.equal(o.customer.email, 'mari@example.ee');
  assert.equal(o.customer.phone, '+37251234567');
  assert.equal(o.shipping.carrier, 'omniva');
  assert.equal(o.shipping.carrierName, 'Omniva pakiautomaat');
  assert.equal(o.shipping.lockerId, '96331');
  assert.equal(o.code, 'AGE15');
  assert.equal(o.totals.discountCents, 263);
  assert.equal(o.totals.totalCents, 1786);
  assert.equal(o.adult, true);
  assert.equal(o.ageConfirmed, true);
  assert.equal(o.newsletter, true);
  assert.deepEqual(o.warnings, []);
});

test('kliendi saadetud hinnad ja summad jäetakse tähelepanuta', () => {
  const r = validateOrder(
    validBody({ items: [{ id: 'mida-viiu', qty: 2, price: 0.01, unitCents: 1 }], totalCents: 1, totals: { totalCents: 1 } }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.order.totals.subtotalCents, 3500);
  assert.equal(r.order.totals.totalCents, 3500); // ≥ 30 € → tasuta tarne
});

test('sama toode mitmel real liidetakse kokku', () => {
  const r = validateOrder(
    validBody({
      items: [
        { id: 'vigur', qty: 2 },
        { id: 'vigur', qty: 3 },
      ],
      ageConfirmed: false,
    }),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.order.items, [{ id: 'vigur', qty: 5 }]);
});

test('vale sooduskood ei takista ostu, vaid annab hoiatuse', () => {
  const r = validateOrder(validBody({ code: 'TASUTA' }));
  assert.equal(r.ok, true);
  assert.equal(r.order.code, null);
  assert.equal(r.order.totals.discountCents, 0);
  assert.equal(r.order.warnings.length, 1);
});

test('keha peab olema objekt', () => {
  for (const body of [null, 'tekst', 42, [], undefined]) {
    const r = validateOrder(body);
    assert.equal(r.ok, false);
  }
});

test('ostukorvi vead', () => {
  expectError(validBody({ items: [] }), 'items');
  expectError(validBody({ items: 'mida-viiu' }), 'items');
  expectError(validBody({ items: null }), 'items');
  expectError(validBody({ items: Array.from({ length: 21 }, () => ({ id: 'vigur', qty: 1 })) }), 'items');
  expectError(validBody({ items: [{ id: 'olematu', qty: 1 }] }), 'items');
  expectError(validBody({ items: [{ id: '__proto__', qty: 1 }] }), 'items');
  expectError(validBody({ items: [{ id: 'toString', qty: 1 }] }), 'items');
  expectError(validBody({ items: [null] }), 'items');
  expectError(validBody({ items: [{ qty: 1 }] }), 'items');
});

test('kogus peab olema täisarv 1..20 (0, 21, −1, 1.5, "1" on vead)', () => {
  for (const qty of [0, 21, -1, 1.5, '1', null, NaN, Infinity]) {
    const r = expectError(validBody({ items: [{ id: 'mida-viiu', qty }] }), 'items');
    assert.match(r.error, /MIDA V!!!U/);
  }
  // Duplikaatridade summa üle 20
  expectError(
    validBody({
      items: [
        { id: 'vigur', qty: 15 },
        { id: 'vigur', qty: 6 },
      ],
    }),
    'items',
  );
  assert.equal(validateOrder(validBody({ items: [{ id: 'mida-viiu', qty: 20 }] })).ok, true);
});

test('nimi: 2..100 märki ja peab sisaldama tähti', () => {
  expectError(validBody({ customer: { name: '' } }), 'customer.name');
  expectError(validBody({ customer: { name: 'M' } }), 'customer.name');
  expectError(validBody({ customer: { name: '   ' } }), 'customer.name');
  expectError(validBody({ customer: { name: '12345' } }), 'customer.name');
  expectError(validBody({ customer: { name: 'A'.repeat(101) } }), 'customer.name');
  expectError(validBody({ customer: { name: { first: 'Mari' } } }), 'customer.name');
  expectError(validBody({ customer: null }), 'customer.name');
  assert.equal(validateOrder(validBody({ customer: { name: 'Õie Ülle-Šõkk' } })).ok, true);
  assert.equal(validateOrder(validBody({ customer: { name: 'Jo' } })).ok, true);
});

test('e-post', () => {
  for (const email of ['', 'mari', 'mari@', '@example.ee', 'mari@example', 'mari@@example.ee', 'mari @example.ee x', 'a..b@example.ee', 'mari@example.e']) {
    expectError(validBody({ customer: { email } }), 'customer.email');
  }
  for (const email of ['mari@example.ee', 'mari.maasikas+pood@gmail.com', 'M@sub.domain.co.uk', 'info@jõgeva.ee']) {
    assert.equal(isValidEmail(email), true, email);
  }
  assert.equal(isValidEmail(`${'a'.repeat(250)}@x.ee`), false);
});

test('telefon: Eesti mobiil normaliseeritakse +372 kujule', () => {
  assert.deepEqual(normalizePhone('5123 4567'), { phone: '+37251234567' });
  assert.deepEqual(normalizePhone('512 3456'), { phone: '+3725123456' }); // 7-kohaline mobiil
  assert.deepEqual(normalizePhone('+372 5123 4567'), { phone: '+37251234567' });
  assert.deepEqual(normalizePhone('372 5123 4567'), { phone: '+37251234567' });
  assert.deepEqual(normalizePhone('00372-5123-4567'), { phone: '+37251234567' });
  assert.deepEqual(normalizePhone('(+372) 8123 4567'), { phone: '+37281234567' });
  assert.deepEqual(normalizePhone(51234567), { phone: '+37251234567' });
});

test('telefon: muu riik +XXX (7..15 numbrit)', () => {
  assert.deepEqual(normalizePhone('+358 40 123 4567'), { phone: '+358401234567' });
  assert.deepEqual(normalizePhone('+1 (415) 555-2671'), { phone: '+14155552671' });
  assert.deepEqual(normalizePhone('0037120000000'), { phone: '+37120000000' });
  assert.ok(normalizePhone('+12345').error);
  assert.ok(normalizePhone('+1234567890123456').error);
});

test('telefon: vead', () => {
  for (const phone of ['', '   ', 'abc', '123', '6123456', '+372 612 3456', '+372 512', '5123456789', '7123 4567', '+372 9123 4567', null, undefined, {}]) {
    const r = expectError(validBody({ customer: { phone } }), 'customer.phone');
    assert.ok(r.error);
  }
  // Lauatelefon → selgitav teade SMS-i kohta
  assert.match(normalizePhone('6123456').error, /mobiil/i);
});

test('tarne: vedaja peab olema omniva | smartpost | dpd', () => {
  expectError(validBody({ shipping: { carrier: '' } }), 'shipping.carrier');
  expectError(validBody({ shipping: { carrier: 'itella' } }), 'shipping.carrier');
  expectError(validBody({ shipping: { carrier: 'toString' } }), 'shipping.carrier');
  expectError(validBody({ shipping: null }), 'shipping.carrier');
  for (const carrier of ['omniva', 'smartpost', 'dpd', 'DPD']) {
    assert.equal(validateOrder(validBody({ shipping: { carrier } })).ok, true, carrier);
  }
});

test('tarne: pakiautomaadi nimi on kohustuslik (2..200), id ja aadress valikulised', () => {
  expectError(validBody({ shipping: { lockerName: '' } }), 'shipping.lockerName');
  expectError(validBody({ shipping: { lockerName: 'X' } }), 'shipping.lockerName');
  expectError(validBody({ shipping: { lockerName: 'A'.repeat(201) } }), 'shipping.lockerName');
  const r = validateOrder(validBody({ shipping: { lockerId: undefined, lockerAddress: undefined, lockerName: 'Käsitsi: Rakvere Põhjakeskus' } }));
  assert.equal(r.ok, true);
  assert.equal(r.order.shipping.lockerId, '');
  assert.equal(r.order.shipping.lockerAddress, '');
  const numericId = validateOrder(validBody({ shipping: { lockerId: 96331 } }));
  assert.equal(numericId.order.shipping.lockerId, '96331');
  const longId = validateOrder(validBody({ shipping: { lockerId: 'x'.repeat(500), lockerAddress: 'y'.repeat(500) } }));
  assert.equal(longId.order.shipping.lockerId.length, 64);
  assert.equal(longId.order.shipping.lockerAddress.length, 200);
});

test('müügitingimustega nõustumine peab olema täpselt true', () => {
  for (const termsAccepted of [false, 'true', 1, undefined, null]) {
    expectError(validBody({ termsAccepted }), 'termsAccepted');
  }
});

test('18+ toode (ka komplektis) nõuab ageConfirmed === true', () => {
  for (const ageConfirmed of [false, 'true', 1, undefined]) {
    expectError(validBody({ ageConfirmed }), 'ageConfirmed');
    expectError(validBody({ items: [{ id: 'komplekt-koik', qty: 1 }], ageConfirmed }), 'ageConfirmed');
  }
  // Ilma 18+ tooteta pole vanusekinnitust vaja
  const r = validateOrder(validBody({ items: [{ id: 'oled-semu', qty: 1 }, { id: 'komplekt-semu-vigur', qty: 1 }], ageConfirmed: false }));
  assert.equal(r.ok, true);
  assert.equal(r.order.adult, false);
  assert.equal(r.order.ageConfirmed, false);
});

test('juhtmärgid eemaldatakse tekstiväljadest', () => {
  const r = validateOrder(validBody({ customer: { name: 'Mari\u0000\n Maasikas​' }, shipping: { lockerName: 'Automaat\r\n<script>' } }));
  assert.equal(r.ok, true);
  assert.equal(r.order.customer.name, 'Mari Maasikas');
  assert.equal(r.order.shipping.lockerName, 'Automaat <script>');
});
