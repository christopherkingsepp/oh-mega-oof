// POST /api/taganemine — taganemisavaldus veebivormist (seadusjärgne 14-päevane taganemisõigus).
//
// Keha: { name, email, orderNumber, receivedDate?: 'YYYY-MM-DD', items?: string|string[], message?, confirm: true }
// Vastus: 201 { reference: 'TAG-XXXXXX', receivedAt: ISO, emailSent: boolean }
//         400 { error, field } | 405 | 413 | 415 | 503 { error }
//
// Avaldus salvestatakse tabelisse withdrawals; kliendile läheb kinnituskiri (avalduse
// kättesaamise kinnitus + edasised sammud) ja omanikule teavitus (ADMIN_EMAIL).
// Meili viga avaldust ei tühista — avaldus on salvestatud ja klient näeb viidet ekraanil.
import { json, readTextLimited } from './_lib/http.mjs';
import { getDb } from './_lib/db.mjs';
import { createMailer } from './_lib/mail.mjs';
import { validateWithdrawal, createWithdrawal, markWithdrawalFlag } from './_lib/withdrawals.mjs';
import { withdrawalAckEmail, adminWithdrawalEmail } from './_lib/mail-templates.mjs';
import { adminEmail, contactEmail, siteUrl } from './_lib/config.mjs';
import { toIso } from './_lib/orders.mjs';

export const MAX_BODY_BYTES = 16 * 1024;

const MSG_BAD_JSON = 'Vigane päring. Värskenda lehte ja proovi uuesti.';
const msgUnavailable = () =>
  `Avaldust ei õnnestunud praegu salvestada. Proovi mõne hetke pärast uuesti või saada taganemisavaldus e-kirjaga aadressile ${contactEmail()} — see kehtib samamoodi.`;

/**
 * @param {{env?:object, logger?:Console, getDb?:()=>Promise<object>, mailer?:{send:Function}, now?:()=>Date}} deps
 */
export function createHandler({ env = process.env, logger = console, getDb: getDbImpl = () => getDb(env), mailer = null, now = () => new Date() } = {}) {
  const mail = mailer || createMailer({ env, logger });

  return async function withdrawalHandler(req) {
    if (req.method !== 'POST') return json(405, { error: 'Lubatud on ainult POST-päring.' }, { Allow: 'POST' });
    if (!/application\/json/i.test(req.headers.get('content-type') || '')) {
      return json(415, { error: 'Vigane päring (oodati JSON-i). Värskenda lehte ja proovi uuesti.' });
    }

    let body;
    try {
      const { text, tooLarge } = await readTextLimited(req, MAX_BODY_BYTES);
      if (tooLarge) return json(413, { error: 'Avaldus on liiga pikk. Lühenda sõnumit ja proovi uuesti.' });
      body = JSON.parse(text);
    } catch {
      return json(400, { error: MSG_BAD_JSON });
    }

    const result = validateWithdrawal(body, { now: now() });
    if (!result.ok) return json(400, { error: result.error, ...(result.field ? { field: result.field } : {}) });

    let db;
    let row;
    try {
      db = await getDbImpl();
      row = await createWithdrawal(db, result.value);
    } catch (err) {
      logger.error(`[taganemine] salvestamine ebaõnnestus (${err?.code || ''}): ${err?.message || err}`);
      return json(503, { error: msgUnavailable() });
    }
    logger.log?.(`[taganemine] ${row.reference}: avaldus tellimusele ${row.order_number}`);

    const ctx = { siteUrl: siteUrl(env, req.url) };

    // Kinnitus kliendile.
    let emailSent = false;
    const ack = await mail
      .send({ to: row.customer_email, replyTo: contactEmail(), idempotencyKey: `taganemine-${row.id}`, tag: 'taganemine', ...withdrawalAckEmail(row, ctx) })
      .catch((err) => ({ sent: false, error: String(err?.message || err) }));
    if (ack?.sent) {
      emailSent = true;
      await markWithdrawalFlag(db, row.id, 'ack_sent_at').catch((err) => logger.error(`[taganemine] ${row.reference}: ack_sent_at — ${err?.message}`));
    } else if (!ack?.skipped) {
      logger.error(`[taganemine] ${row.reference}: kliendi kinnitus jäi saatmata (${ack?.error || 'tundmatu viga'}).`);
    }

    // Teavitus omanikule.
    const admin = adminEmail(env);
    if (admin) {
      const note = await mail
        .send({ to: admin, replyTo: row.customer_email, idempotencyKey: `taganemine-omanik-${row.id}`, tag: 'omanik-taganemine', ...adminWithdrawalEmail(row, ctx) })
        .catch((err) => ({ sent: false, error: String(err?.message || err) }));
      if (note?.sent) await markWithdrawalFlag(db, row.id, 'admin_notified_at').catch(() => {});
      else if (!note?.skipped) logger.error(`[taganemine] ${row.reference}: omaniku teavitus jäi saatmata (${note?.error || 'tundmatu viga'}).`);
    } else {
      logger.warn(`[taganemine] ${row.reference}: ADMIN_EMAIL puudub — omanikku ei teavitatud (avaldus on halduses näha).`);
    }

    return json(201, { reference: row.reference, receivedAt: toIso(row.created_at), emailSent });
  };
}

export default createHandler();

// Kiiruspiirang: ühelt IP-lt kuni 5 avaldust minutis (rämpsu vastu; päris kliendile piisav).
export const config = {
  path: '/api/taganemine',
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
