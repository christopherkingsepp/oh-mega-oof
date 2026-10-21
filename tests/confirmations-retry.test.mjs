// Ajastatud kinnituskirjade kordus ja eelvaate "Sega" garantii.
import test from 'node:test';
import assert from 'node:assert/strict';
import { retryPendingConfirmations, config } from '../netlify/functions/confirmations-retry.mjs';
import { validateOrder } from '../netlify/functions/_lib/order.mjs';
import { createOrder, markPaid, getOrderById } from '../netlify/functions/_lib/orders.mjs';
import { PREVIEW_CARDS, drawRound } from '../public/assets/js/preview-cards.js';
import { validBody, freshDb, captureMailer, silentLogger } from './helpers.mjs';

async function paidOrder(db, paidAt = new Date()) {
  const r = validateOrder(validBody());
  assert.ok(r.ok, JSON.stringify(r));
  const o = await createOrder(db, r.order);
  await markPaid(db, o.id, { paymentIntentId: `pi_${o.id.slice(0, 8)}`, amountPaid: o.total_cents, at: paidAt, sessionId: `cs_${o.id.slice(0, 8)}` });
  return getOrderById(db, o.id);
}

test('kinnituste kordus: saadab puuduva kirja täpselt ühe korra ja ei vähenda laoseisu uuesti', async () => {
  const db = await freshDb();
  const env = { ADMIN_EMAIL: 'omanik@example.ee' };
  const o = await paidOrder(db);
  const mailer = captureMailer();
  const r1 = await retryPendingConfirmations({ env, getDb: async () => db, mailer, logger: silentLogger() });
  assert.equal(r1.checked, 1);
  assert.equal(mailer.sent.length, 2, 'klient + omanik');
  const r2 = await retryPendingConfirmations({ env, getDb: async () => db, mailer, logger: silentLogger() });
  assert.equal(r2.checked, 0);
  assert.equal(mailer.sent.length, 2);
  const after = await getOrderById(db, o.id);
  assert.ok(after.confirmation_sent_at && after.admin_notified_at && after.inventory_applied_at);
  const [{ c }] = await db.query("SELECT count(*)::int c FROM inventory_movements WHERE order_id = $1 AND reason = 'sale'", [o.id]);
  assert.ok(c >= 1);
  await retryPendingConfirmations({ env, getDb: async () => db, mailer, logger: silentLogger() });
  const [{ c: c2 }] = await db.query("SELECT count(*)::int c FROM inventory_movements WHERE order_id = $1 AND reason = 'sale'", [o.id]);
  assert.equal(c2, c);
});

test('kinnituste kordus: üle 7 päeva vanu ja maksmata tellimusi ei puudutata; ajastus tunnis', async () => {
  const db = await freshDb();
  await paidOrder(db, new Date(Date.now() - 8 * 24 * 3600 * 1000));
  const r = validateOrder(validBody());
  await createOrder(db, r.order); // maksmata
  const mailer = captureMailer();
  const res = await retryPendingConfirmations({ env: {}, getDb: async () => db, mailer, logger: silentLogger() });
  assert.equal(res.checked, 0);
  assert.equal(mailer.sent.length, 0);
  assert.equal(config.schedule, '@daily');
});

test('eelvaade: „Sega“ ei anna kunagi täpselt sama 10-st hulka, ka rikutud juhuarvugeneraatoriga', () => {
  const prev = drawRound(10, null, () => 0).map((c) => c.id);
  const next = drawRound(10, prev, () => 0).map((c) => c.id);
  assert.equal(new Set(next).size, 10);
  assert.ok(next.some((id) => !prev.includes(id)));
  assert.ok(next.every((id) => PREVIEW_CARDS.some((c) => c.id === id)));
  assert.equal(PREVIEW_CARDS.length, 19);
});
