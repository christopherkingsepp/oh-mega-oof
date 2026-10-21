// POST /api/taganemine: valideerimine, salvestamine, viide ja kirjad.
import test from 'node:test';
import assert from 'node:assert/strict';
import withdrawalDefault, { createHandler as createWithdrawalHandler, config as withdrawalConfig } from '../netlify/functions/withdrawal.mjs';
import { validateWithdrawal, normalizeOrderNumber, createWithdrawalReference, REFERENCE_RE, cleanMultiline, tallinnToday } from '../netlify/functions/_lib/withdrawals.mjs';
import { freshDb, testDb, captureMailer, silentLogger, postJson, call } from './helpers.mjs';

const ENV = { ADMIN_EMAIL: 'omanik@example.ee', SITE_URL: 'https://age.example' };
const NOW = new Date('2026-10-19T09:00:00Z');

const body = (overrides = {}) => ({
  name: 'Mari Maasikas',
  email: 'mari@example.ee',
  orderNumber: 'ÄGE-2026-0001',
  receivedDate: '2026-10-15',
  items: 'MIDA V!!!U × 1',
  message: 'Kingiks ostetud, aga sõbral juba on.\nAitäh!',
  confirm: true,
  ...overrides,
});

function setup({ env = ENV, getDb = () => testDb() } = {}) {
  const mailer = captureMailer();
  const logger = silentLogger();
  const handler = createWithdrawalHandler({ env, logger, getDb, mailer, now: () => NOW });
  return { handler, mailer, logger };
}

const req = (b) => postJson(b, { url: 'https://age.example/api/taganemine' });

test('taganemine: tee, kiiruspiirang ja vaikimisi eksport', () => {
  assert.equal(withdrawalConfig.path, '/api/taganemine');
  assert.ok(withdrawalConfig.rateLimit.windowLimit <= 10);
  assert.equal(typeof withdrawalDefault, 'function');
});

test('taganemine: viide TAG-XXXXXX ilma segadust tekitavate märkideta', () => {
  for (let i = 0; i < 300; i++) {
    const ref = createWithdrawalReference();
    assert.match(ref, REFERENCE_RE);
    assert.doesNotMatch(ref.slice(4), /[01OIL]/);
  }
});

test('taganemine: tellimuse numbri normaliseerimine (ÄGE/AGE, väiketähed, tühikud → õige kuju)', () => {
  for (const input of ['ÄGE-2026-0001', 'AGE-2026-0001', 'äge-2026-0001', 'age 2026 0001', '  ÄGE – 2026 – 0001  ', 'AGE20260001', '#äge-2026-1', '2026-0001', 'A\u0308GE-2026-0001']) {
    assert.equal(normalizeOrderNumber(input), 'ÄGE-2026-0001', input);
  }
  assert.equal(normalizeOrderNumber('test-age-2026-0042'), 'TEST-ÄGE-2026-0042');
  assert.equal(normalizeOrderNumber('ÄGE-2027-10000'), 'ÄGE-2027-10000', 'üle 9999 → 5 kohta');
  // Vana vorm jääb tuvastatavaks (vanad tellimused)
  assert.equal(normalizeOrderNumber('AGE-1001'), 'AGE-1001');
  assert.equal(normalizeOrderNumber(' age 1001 '), 'AGE-1001');
  assert.equal(normalizeOrderNumber('#AGE1001'), 'AGE-1001');
  assert.equal(normalizeOrderNumber('AGE-7K3M9Q'), 'AGE-7K3M9Q', 'vana vormi tellimused');
  for (const bad of ['', 'x', '12', '0001', '1001', 'AGE-', 'ÄGE-2026-0000', 'AGE-1001-1001-1001', 'DROP TABLE', 'x'.repeat(60), null, 5, {}]) {
    assert.equal(normalizeOrderNumber(bad), null, String(bad));
  }
});

test('taganemine: valideerimise vead väljade kaupa', () => {
  const cases = [
    [{ name: '' }, 'name'],
    [{ name: '12' }, 'name'],
    [{ name: 'A'.repeat(101) }, 'name'],
    [{ email: 'mari@' }, 'email'],
    [{ orderNumber: '' }, 'orderNumber'],
    [{ receivedDate: '2026-02-30' }, 'receivedDate'],
    [{ receivedDate: '15.10.2026' }, 'receivedDate'],
    [{ receivedDate: '2026-10-20' }, 'receivedDate'], // tulevikus (Tallinnas on 19.10)
    [{ items: 'x'.repeat(501) }, 'items'],
    [{ message: 'x'.repeat(2001) }, 'message'],
    [{ confirm: false }, 'confirm'],
    [{ confirm: 'true' }, 'confirm'],
  ];
  for (const [o, field] of cases) {
    const r = validateWithdrawal(body(o), { now: NOW });
    assert.equal(r.ok, false, JSON.stringify(o));
    assert.equal(r.field, field, JSON.stringify(o));
    assert.ok(r.error.length > 10);
  }
  assert.equal(validateWithdrawal(null).ok, false);
  const minimal = validateWithdrawal({ name: 'Mari Maasikas', email: 'mari@example.ee', orderNumber: 'age 2026 1', confirm: true }, { now: NOW });
  assert.equal(minimal.ok, true);
  assert.deepEqual(minimal.value, { name: 'Mari Maasikas', email: 'mari@example.ee', orderNumber: 'ÄGE-2026-0001', receivedDate: null, items: '', message: '' });
  const arr = validateWithdrawal(body({ items: ['MIDA V!!!U', ' Vigur '] }), { now: NOW });
  assert.equal(arr.value.items, 'MIDA V!!!U, Vigur');
  assert.equal(tallinnToday(new Date('2026-10-19T22:30:00Z')), '2026-10-20', 'Tallinna kuupäev, mitte UTC');
  assert.equal(cleanMultiline('a\r\n\r\n\r\n\r\nb\u0000c  d'), 'a\n\nb c d');
});

test('taganemine: õnnestub → 201 { reference, receivedAt }, rida salvestatud, kinnitus kliendile + teavitus omanikule', async () => {
  const db = await freshDb();
  const { handler, mailer } = setup();
  const { res, data } = await call(handler, req(body()));
  assert.equal(res.status, 201);
  assert.match(data.reference, REFERENCE_RE);
  assert.ok(Date.parse(data.receivedAt) > Date.now() - 60000);
  assert.equal(data.emailSent, true);

  const [row] = await db.query('SELECT * FROM withdrawals WHERE reference = $1', [data.reference]);
  assert.equal(row.customer_name, 'Mari Maasikas');
  assert.equal(row.order_number, 'ÄGE-2026-0001');
  assert.equal(row.message, 'Kingiks ostetud, aga sõbral juba on.\nAitäh!');
  assert.equal(row.status, 'received');
  assert.ok(row.ack_sent_at && row.admin_notified_at);

  assert.equal(mailer.sent.length, 2);
  const [ack, admin] = mailer.sent;
  assert.equal(ack.to, 'mari@example.ee');
  assert.equal(ack.subject, `Oleme sinu taganemisavalduse kätte saanud (${data.reference})`);
  assert.match(ack.html, /Oleme sinu taganemisavalduse kätte saanud/);
  assert.match(ack.html, /15\.10\.2026/);
  assert.match(ack.text, /Tagasta kaup 14 päeva jooksul/);
  assert.match(ack.text, /Raha tagastame 14 päeva jooksul/);
  assert.equal(admin.to, 'omanik@example.ee');
  assert.equal(admin.replyTo, 'mari@example.ee');
  assert.match(admin.subject, /Taganemisavaldus TAG-.* — tellimus ÄGE-2026-0001/);
  assert.match(admin.text, /hiljemalt \d{2}\.\d{2}\.\d{4}/);
});

test('taganemine: kasutaja tekst on kirjades HTML-ist puhastatud', async () => {
  await freshDb();
  const { handler, mailer } = setup();
  await call(handler, req(body({ name: 'Mari <script>alert(1)</script>', message: '<img src=x onerror=alert(1)>' })));
  for (const m of mailer.sent) {
    assert.ok(!m.html.includes('<script>alert'), m.subject);
    assert.ok(!m.html.includes('<img src=x'), m.subject);
    assert.match(m.html, /&lt;img src=x/);
  }
});

test('taganemine: meili viga ei tühista avaldust (201, emailSent:false)', async () => {
  const db = await freshDb();
  const { handler, mailer, logger } = setup();
  mailer.fail = true;
  const { res, data } = await call(handler, req(body()));
  assert.equal(res.status, 201);
  assert.equal(data.emailSent, false);
  const [row] = await db.query('SELECT ack_sent_at FROM withdrawals WHERE reference = $1', [data.reference]);
  assert.equal(row.ack_sent_at, null);
  assert.ok(logger.lines.some((l) => /jäi saatmata/.test(l)));
});

test('taganemine: vead — 400 { error, field }, 415, 413, 405, andmebaas maas → 503 koos e-posti aadressiga', async () => {
  await freshDb();
  const { handler } = setup();
  const bad = await call(handler, req(body({ email: 'vale' })));
  assert.equal(bad.res.status, 400);
  assert.equal(bad.data.field, 'email');
  assert.equal((await call(handler, req('{"name":'))).res.status, 400);
  assert.equal((await call(handler, new Request('https://age.example/api/taganemine', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } }))).res.status, 415);
  assert.equal((await call(handler, req(body({ message: 'x'.repeat(20000) })))).res.status, 413);
  assert.equal((await call(handler, new Request('https://age.example/api/taganemine'))).res.status, 405);

  const { handler: down } = setup({ getDb: async () => { throw Object.assign(new Error('x'), { code: 'DB_NOT_CONFIGURED' }); } });
  const r = await call(down, req(body()));
  assert.equal(r.res.status, 503);
  assert.match(r.data.error, /aarmiselt@gmail\.com/);
});
