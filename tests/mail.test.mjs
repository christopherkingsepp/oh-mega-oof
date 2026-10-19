// _lib/mail.mjs (Resend / näidisrežiim / seadistamata) ja _lib/mail-templates.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMailer, mailConfigured, RESEND_ENDPOINT } from '../netlify/functions/_lib/mail.mjs';
import { orderConfirmationEmail, adminNewOrderEmail, withdrawalAckEmail, adminWithdrawalEmail, esc, tallinnDateTime } from '../netlify/functions/_lib/mail-templates.mjs';
import { silentLogger } from './helpers.mjs';

const MSG = { to: 'mari@example.ee', subject: 'Tere', html: '<p>Tere</p>', text: 'Tere' };

test('mail: seadistamata → { skipped:true } ja üks hoiatus (tellimus ei ebaõnnestu)', async () => {
  const logger = silentLogger();
  let called = false;
  const mailer = createMailer({ env: {}, logger, fetchImpl: async () => { called = true; } });
  assert.deepEqual(await mailer.send(MSG), { sent: false, skipped: true });
  assert.deepEqual(await mailer.send(MSG), { sent: false, skipped: true });
  assert.equal(called, false);
  assert.equal(logger.lines.filter((l) => /RESEND_API_KEY/.test(l)).length, 1);
  assert.equal(mailConfigured({}), false);
  assert.equal(mailConfigured({ RESEND_API_KEY: 're_x', MAIL_FROM: 'ÄGE <a@b.ee>' }), true);
});

test('mail: Resend REST API — õige päring (Bearer, from, Idempotency-Key)', async () => {
  const calls = [];
  const env = { RESEND_API_KEY: 're_test_123', MAIL_FROM: 'ÄGE <tellimused@age.example>' };
  const mailer = createMailer({
    env,
    logger: silentLogger(),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    },
  });
  const r = await mailer.send({ ...MSG, replyTo: 'aarmiselt@gmail.com', idempotencyKey: 'tellimus-1', tag: 'tellimus' });
  assert.deepEqual(r, { sent: true, id: 'email_1' });
  assert.equal(calls[0].url, RESEND_ENDPOINT);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test_123');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'tellimus-1');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['mari@example.ee']);
  assert.equal(body.from, 'ÄGE <tellimused@age.example>');
  assert.equal(body.reply_to, 'aarmiselt@gmail.com');
  assert.equal(body.subject, 'Tere');
  assert.equal(body.text, 'Tere');
  assert.equal(body.html, '<p>Tere</p>');
});

test('mail: Resendi viga või võrguviga → { sent:false, error } (ei viska), logis pole täit aadressi', async () => {
  const env = { RESEND_API_KEY: 're_test_123', MAIL_FROM: 'a@b.ee' };
  const logger = silentLogger();
  const http = createMailer({ env, logger, fetchImpl: async () => new Response(JSON.stringify({ name: 'validation_error', message: 'Domain not verified' }), { status: 403 }) });
  const r1 = await http.send(MSG);
  assert.equal(r1.sent, false);
  assert.match(r1.error, /403.*Domain not verified/);
  const net = createMailer({ env, logger, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  const r2 = await net.send(MSG);
  assert.equal(r2.sent, false);
  assert.match(r2.error, /fetch failed/);
  assert.ok(!logger.lines.join('\n').includes('mari@example.ee'));
  assert.deepEqual(await net.send({ ...MSG, to: '' }), { sent: false, error: 'saaja puudub' });
});

test('mail: MOCK_MAIL=1 → .json + .html failid; Lambdas mock välja lülitatud', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'age-mail-'));
  try {
    const logger = silentLogger();
    const mailer = createMailer({ env: { MOCK_MAIL: '1', MAIL_DIR: dir }, logger, now: () => new Date('2026-10-19T12:00:00Z') });
    const r = await mailer.send({ ...MSG, tag: 'tellimus' });
    assert.equal(r.sent, true);
    assert.equal(r.mock, true);
    const files = (await readdir(dir)).sort();
    assert.deepEqual(files, ['2026-10-19T12-00-00-000Z-mari@example.ee-tellimus.html', '2026-10-19T12-00-00-000Z-mari@example.ee-tellimus.json']);
    const rec = JSON.parse(await readFile(join(dir, files[1]), 'utf8'));
    assert.deepEqual(rec.to, ['mari@example.ee']);
    assert.equal(rec.subject, 'Tere');
    assert.equal(await readFile(join(dir, files[0]), 'utf8'), '<p>Tere</p>');
    assert.ok(logger.lines.some((l) => /meil:mock/.test(l)));

    const prod = createMailer({ env: { MOCK_MAIL: '1', MAIL_DIR: dir, AWS_LAMBDA_FUNCTION_NAME: 'x' }, logger });
    assert.deepEqual(await prod.send(MSG), { sent: false, skipped: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/* ---------------- Mallid ---------------- */

const ORDER = {
  id: 'o1',
  number: 'AGE-1001',
  public_token: 'tok_abc',
  created_at: '2026-10-19T09:05:00Z',
  paid_at: '2026-10-19T09:06:00Z',
  customer_name: 'Mari <Maasikas>',
  customer_email: 'mari@example.ee',
  customer_phone: '+37251234567',
  items: [
    { id: 'komplekt-koik', name: 'Kõik 3 mängu', qty: 1, unitCents: 3300, totalCents: 3300, bundle: true, includes: [{ id: 'mida-viiu', name: 'MIDA V!!!U', qty: 1 }, { id: 'oled-semu', name: 'Oled Semu?', qty: 1 }, { id: 'vigur', name: 'Vigur', qty: 1 }] },
    { id: 'vigur', name: 'Vigur', qty: 2, unitCents: 1295, totalCents: 2590, bundle: false, includes: [{ id: 'vigur', name: 'Vigur', qty: 1 }] },
  ],
  subtotal_cents: 5890,
  discount_code: 'AGE15',
  discount_cents: 884,
  shipping_cents: 0,
  total_cents: 5006,
  carrier: 'omniva',
  carrier_name: 'Omniva pakiautomaat',
  locker_id: '96331',
  locker_name: 'Tallinna Kristiine keskuse pakiautomaat',
  locker_address: 'Endla tn 45',
  locker_city: 'Tallinn',
};
const CTX = { siteUrl: 'https://age.example' };

test('mall: tellimuse kinnitus kliendile — nr, read + komplekti sisu, summad, soodustus, tarne, mis edasi, taganemine, kontakt', () => {
  const m = orderConfirmationEmail(ORDER, CTX);
  assert.equal(m.subject, 'Tellimus AGE-1001 on makstud — aitäh!');
  for (const part of [
    'AGE-1001',
    'Kõik 3 mängu',
    'Komplektis: MIDA V!!!U + Oled Semu? + Vigur',
    'Vigur',
    'Soodustus (AGE15)',
    '−8,84',
    'Tasuta',
    '50,06',
    'Omniva pakiautomaat',
    'Tallinna Kristiine keskuse pakiautomaat',
    'Endla tn 45, Tallinn',
    'Mis edasi?',
    '1–3 tööpäeva',
    '14 päeva',
    'https://age.example/taganemine',
    'https://age.example/tingimused',
    'https://age.example/aitah?t=tok_abc',
    'aarmiselt@gmail.com',
    '18+',
  ]) {
    assert.ok(m.html.includes(part), `HTML-is puudub "${part}"`);
  }
  assert.match(m.html, /Aitäh, Mari &lt;Maasikas&gt;|Aitäh, Mari!/);
  assert.ok(!m.html.includes('<Maasikas>'), 'nimi on HTML-ist puhastatud');
  assert.match(m.text, /Komplektis: MIDA V!!!U \+ Oled Semu\? \+ Vigur/);
  assert.match(m.text, /Makstud kokku: 50,06/);
  assert.match(m.text, /https:\/\/age\.example\/taganemine/);
  assert.ok(!/style=|<td/.test(m.text), 'tekstiversioonis pole HTML-i');
});

test('mall: omaniku teavitus — klient, automaat (ID) ja link halduspaneelile; käsitsi automaadi hoiatus', () => {
  const m = adminNewOrderEmail(ORDER, CTX);
  assert.match(m.subject, /^Uus tellimus AGE-1001 — 50,06/);
  assert.ok(m.html.includes('https://age.example/admin'));
  assert.ok(m.html.includes('+37251234567'));
  assert.ok(m.html.includes('Automaadi ID: 96331'));
  assert.ok(m.html.includes(tallinnDateTime(ORDER.paid_at)));
  assert.equal(tallinnDateTime('2026-10-19T09:06:00Z'), '19.10.2026 kell 12:06');
  const manual = adminNewOrderEmail({ ...ORDER, locker_id: null }, CTX);
  assert.match(manual.text, /sisestatud käsitsi/);
});

const W = {
  id: 'w1',
  reference: 'TAG-7K3M9Q',
  created_at: '2026-10-19T09:00:00Z',
  customer_name: 'Mari Maasikas',
  customer_email: 'mari@example.ee',
  order_number: 'AGE-1001',
  received_date: '2026-10-15',
  items: 'MIDA V!!!U',
  message: 'Tere',
};

test('mall: taganemisavalduse kinnitus kliendile ja teavitus omanikule (tähtaeg)', () => {
  const ack = withdrawalAckEmail(W, CTX);
  assert.equal(ack.subject, 'Oleme sinu taganemisavalduse kätte saanud (TAG-7K3M9Q)');
  for (const part of ['Oleme sinu taganemisavalduse kätte saanud', 'TAG-7K3M9Q', 'AGE-1001', '15.10.2026', 'MIDA V!!!U', 'Tagasta kaup 14 päeva jooksul', 'Raha tagastame 14 päeva jooksul']) {
    assert.ok(ack.html.includes(part), `HTML-is puudub "${part}"`);
  }
  const admin = adminWithdrawalEmail(W, CTX);
  assert.match(admin.subject, /Taganemisavaldus TAG-7K3M9Q — tellimus AGE-1001/);
  assert.match(admin.text, /hiljemalt 02\.11\.2026/);
  assert.ok(admin.html.includes('mailto:mari@example.ee'));
});

test('esc puhastab HTML-i', () => {
  assert.equal(esc(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
});
