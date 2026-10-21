// Taganemisavaldused: valideerimine, salvestamine ja kinnitusviide.
// Seadusjärgne 14-päevane taganemisõigus: avaldus tuleb vastu võtta ka siis, kui tellimuse
// numbrit meie andmebaasis ei leidu (nt vana tellimus) — kontrollib omanik halduses.
import { randomInt, randomUUID } from 'node:crypto';
import { cleanText } from './http.mjs';
import { isValidEmail } from '../../../public/assets/js/validate.js';
import { normalizeOrderNumber as normalizeNumber, ORDER_INPUT_MAX } from '../../../public/assets/js/order-number.js';

export const LIMITS = { name: 100, email: 254, orderNumber: ORDER_INPUT_MAX, items: 500, message: 2000 };

// Viide ilma segadust tekitavate märkideta (0/O, 1/I/L).
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function createWithdrawalReference() {
  let s = '';
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `TAG-${s}`;
}
export const REFERENCE_RE = /^TAG-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

/** Mitmerealine tekst: reavahetused jäävad alles, muud juhtmärgid ja liigsed tühikud kaovad. */
export function cleanMultiline(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200D\u2028\u2029\uFEFF]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tänane kuupäev Tallinnas kujul YYYY-MM-DD. */
export function tallinnToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * "äge 2026 0001", "AGE-2026-1", "2026-0001" → "ÄGE-2026-0001"; "test-age-2026-0001" → "TEST-ÄGE-2026-0001";
 * vana vorm "age1001" → "AGE-1001". Tagastab null, kui ei sobi (vt public/assets/js/order-number.js).
 */
export function normalizeOrderNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return normalizeNumber(cleanText(value));
}

const fail = (error, field) => ({ ok: false, error, field });
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const length = (s) => Array.from(s).length;

/**
 * Valideerib /api/taganemine keha.
 * Ootab: { name, email, orderNumber, receivedDate?: 'YYYY-MM-DD', items?: string|string[], message?, confirm: true }
 * @returns {{ok:true, value:object} | {ok:false, error:string, field:string|null}}
 */
export function validateWithdrawal(body, { now = new Date() } = {}) {
  if (!isObject(body)) return fail('Vigane päring. Värskenda lehte ja proovi uuesti.', null);

  const name = cleanText(body.name);
  if (length(name) < 2 || !/\p{L}/u.test(name)) return fail('Sisesta oma ees- ja perekonnanimi.', 'name');
  if (length(name) > LIMITS.name) return fail(`Nimi on liiga pikk (kuni ${LIMITS.name} märki).`, 'name');

  const email = cleanText(body.email);
  if (!isValidEmail(email)) return fail('Kontrolli e-posti aadressi — sinna saadame avalduse kinnituse.', 'email');

  const orderNumber = normalizeOrderNumber(body.orderNumber);
  if (!orderNumber) return fail('Sisesta tellimuse number (nt ÄGE-2026-0001). Selle leiad tellimuse kinnituskirjast.', 'orderNumber');

  let receivedDate = null;
  const rawDate = cleanText(body.receivedDate);
  if (rawDate) {
    if (!validDate(rawDate)) return fail('Kontrolli kauba kättesaamise kuupäeva.', 'receivedDate');
    if (rawDate > tallinnToday(now)) return fail('Kauba kättesaamise kuupäev ei saa olla tulevikus.', 'receivedDate');
    if (rawDate < '2024-01-01') return fail('Kontrolli kauba kättesaamise kuupäeva.', 'receivedDate');
    receivedDate = rawDate;
  }

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 20).map(cleanText).filter(Boolean).join(', ') : cleanMultiline(body.items);
  if (length(rawItems) > LIMITS.items) return fail(`Toodete loetelu on liiga pikk (kuni ${LIMITS.items} märki).`, 'items');

  const message = cleanMultiline(body.message);
  if (length(message) > LIMITS.message) return fail(`Sõnum on liiga pikk (kuni ${LIMITS.message} märki).`, 'message');

  if (body.confirm !== true) return fail('Kinnita, et soovid lepingust taganeda.', 'confirm');

  return { ok: true, value: { name, email, orderNumber, receivedDate, items: rawItems, message } };
}

/**
 * Salvestab avalduse ja tagastab rea (koos unikaalse viitega). Viite kokkupõrke korral proovib uuesti.
 * Kui klient sisestas tellimuse VANA numbri (AGE-1001), salvestatakse tellimuse praegune number.
 */
export async function createWithdrawal(db, value) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await db.query(
        `INSERT INTO withdrawals (id, reference, customer_name, customer_email, order_number, received_date, items, message)
         VALUES ($1, $2, $3, $4, COALESCE((SELECT number FROM orders WHERE legacy_number = $5::text LIMIT 1), $5::text), $6::date, $7, $8)
         RETURNING *, to_char(received_date, 'YYYY-MM-DD') AS received_date_text`,
        [randomUUID(), createWithdrawalReference(), value.name, value.email, value.orderNumber, value.receivedDate, value.items, value.message],
      );
      const row = rows[0];
      return { ...row, received_date: row.received_date_text || null };
    } catch (err) {
      const duplicate = err?.code === '23505' && /reference/.test(`${err?.constraint || ''} ${err?.message || ''} ${err?.detail || ''}`);
      if (!duplicate) throw err;
    }
  }
  throw new Error('Viite loomine ebaõnnestus');
}

/** Märgib ühekordse teavituse tehtuks ('ack_sent_at' | 'admin_notified_at'). */
export async function markWithdrawalFlag(db, id, column) {
  if (!['ack_sent_at', 'admin_notified_at'].includes(column)) throw new Error(`Tundmatu veerg: ${column}`);
  await db.query(`UPDATE withdrawals SET ${column} = now() WHERE id = $1 AND ${column} IS NULL`, [id]);
}
