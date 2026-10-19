// E-posti saatmine (Resend REST API) ühe liidesega: `await sendMail({ to, subject, html, text })`.
//
//  • Tootmine: RESEND_API_KEY + MAIL_FROM (nt "ÄGE <tellimused@sinudomeen.ee>"; domeen peab
//    olema Resendis kinnitatud). Päring: POST https://api.resend.com/emails.
//  • Kohalik arendus (MOCK_MAIL=1, mitte Lambdas): kiri salvestatakse failidena
//    .data/mail/<aeg>-<saaja>.json ja .html (MAIL_DIR muudab kausta) ning logitakse konsooli.
//  • Seadistamata: tagastab { skipped: true } ja logib hoiatuse — tellimus EI ebaõnnestu.
//
// sendMail EI viska kunagi erindit: tulemus on alati objekt
//   { sent: true, id } | { sent: true, mock: true, file } | { sent: false, skipped: true } | { sent: false, error }.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isMockMail } from './config.mjs';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8000;

/** Kas e-posti saatmine on seadistatud (või näidisrežiimis)? */
export function mailConfigured(env = process.env) {
  return isMockMail(env) || Boolean(String(env.RESEND_API_KEY || '').trim() && String(env.MAIL_FROM || '').trim());
}

/** Turvaline failinime osa e-posti aadressist. */
function fileSafe(s) {
  return String(s || 'kiri')
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, '_')
    .slice(0, 80);
}

/** Logides ei näita täielikku aadressi. */
function maskForLog(to) {
  return String(to || '').replace(/^(.).*?(@.*)$/, '$1***$2');
}

/**
 * Loob saatja. Testides saab süstida env-i, fetch'i ja logija.
 * @param {{env?:object, fetchImpl?:typeof fetch, logger?:Console, now?:()=>Date}} deps
 */
export function createMailer({ env = process.env, fetchImpl = (...a) => globalThis.fetch(...a), logger = console, now = () => new Date() } = {}) {
  let warned = false;

  async function send({ to, subject, html, text, replyTo = null, idempotencyKey = null, tag = null }) {
    const recipients = [].concat(to || []).map((x) => String(x).trim()).filter(Boolean);
    if (!recipients.length) return { sent: false, error: 'saaja puudub' };
    const from = String(env.MAIL_FROM || '').trim() || 'ÄGE <no-reply@localhost>';

    // --- Näidisrežiim: failid kettale -------------------------------------------------
    if (isMockMail(env)) {
      try {
        const dir = resolve(env.MAIL_DIR || join(process.cwd(), '.data/mail'));
        await mkdir(dir, { recursive: true });
        const stamp = now().toISOString().replace(/[:.]/g, '-');
        const base = join(dir, `${stamp}-${fileSafe(recipients[0])}${tag ? `-${fileSafe(tag)}` : ''}`);
        const record = { from, to: recipients, replyTo, subject, text, idempotencyKey, tag, createdAt: now().toISOString() };
        await writeFile(`${base}.json`, JSON.stringify(record, null, 2));
        await writeFile(`${base}.html`, html || '');
        logger.log?.(`[meil:mock] → ${recipients.join(', ')} | ${subject} | ${base}.html`);
        return { sent: true, mock: true, file: `${base}.json` };
      } catch (err) {
        logger.error?.('[meil:mock] faili salvestamine ebaõnnestus:', err?.message || err);
        return { sent: false, error: String(err?.message || err) };
      }
    }

    // --- Seadistamata ------------------------------------------------------------------
    const key = String(env.RESEND_API_KEY || '').trim();
    if (!key || !String(env.MAIL_FROM || '').trim()) {
      if (!warned) {
        logger.warn?.('[meil] RESEND_API_KEY või MAIL_FROM puudub — e-kirju ei saadeta (vt .env.example). Tellimused töötavad edasi.');
        warned = true;
      }
      return { sent: false, skipped: true };
    }

    // --- Resend ------------------------------------------------------------------------
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Ajalimiit ${TIMEOUT_MS} ms ületatud`)), TIMEOUT_MS);
    try {
      const body = { from, to: recipients, subject, html, text };
      if (replyTo) body.reply_to = replyTo;
      if (tag) body.tags = [{ name: 'tyyp', value: String(tag).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) }];
      const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'AGE-veebipood/1.0' };
      // Resend jätab sama võtmega korduva päringu 24 h jooksul vahele (topeltkirja kaitse).
      if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 256);
      const res = await fetchImpl(RESEND_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = `HTTP ${res.status}${data?.name ? ` ${data.name}` : ''}${data?.message ? `: ${data.message}` : ''}`;
        logger.error?.(`[meil] Resend keeldus (${maskForLog(recipients[0])}, „${subject}“): ${msg}`);
        return { sent: false, error: msg };
      }
      return { sent: true, id: data?.id || null };
    } catch (err) {
      logger.error?.(`[meil] saatmine ebaõnnestus (${maskForLog(recipients[0])}, „${subject}“): ${err?.message || err}`);
      return { sent: false, error: String(err?.message || err) };
    } finally {
      clearTimeout(timer);
    }
  }

  return { send };
}

let defaultMailer = null;
/** Vaikimisi saatja (protsessi env). */
export function sendMail(message) {
  defaultMailer ||= createMailer();
  return defaultMailer.send(message);
}
