// Tellimuse number: ÄGE-AAAA-NNNN (nt ÄGE-2026-0001), testmaksetel TEST-ÄGE-AAAA-NNNN.
// Ühine moodul brauserile (taganemisvorm, halduspaneel) ja serverile (netlify/functions).
//
//  • AAAA = tellimuse loomise aasta Eesti aja järgi (Europe/Tallinn), NNNN = järjekorranumber
//    selle aasta sees (iga aasta algab 0001-st). Üle 9999 jätkub number lihtsalt 5 kohaga
//    (ÄGE-2026-10000) — numbrit ei lõigata kunagi lühemaks.
//  • Numbri annab ANDMEBAAS tellimuse salvestamisel (orders.mjs → createOrder), mitte see fail.
//    Siin on ainult vormindamine ja kasutaja sisestatud numbri tuvastamine.
//  • Klient või omanik võib numbri kirjutada ka ilma Ä-ta (AGE-2026-0001), väiketähtedega,
//    tühikutega või ilma eesliiteta (2026-0001) — parseOrderNumber() teeb sellest õige kuju.
//  • Vana vorm (AGE-1001, enne aastapõhist numeratsiooni) jääb tuvastatavaks (legacy).

export const ORDER_PREFIX = 'ÄGE';
export const TEST_PREFIX = 'TEST-';
/** Sisestuse maksimumpikkus (koos tühikute ja kriipsudega). */
export const ORDER_INPUT_MAX = 40;

/** 1 → '0001', 9999 → '9999', 10000 → '10000' (pikemat numbrit ei lõigata). */
export function padSeq(seq) {
  const s = String(Math.trunc(Number(seq)));
  return s.length >= 4 ? s : s.padStart(4, '0');
}

/** { year: 2026, seq: 1, test: false } → 'ÄGE-2026-0001' */
export function formatOrderNumber({ year, seq, test = false }) {
  return `${test ? TEST_PREFIX : ''}${ORDER_PREFIX}-${year}-${padSeq(seq)}`;
}

/** 'ÄGE-2026-0001' → 'AGE-2026-0001' (Stripe'i ja muude ainult-ASCII väljade jaoks). */
export function asciiOrderNumber(number) {
  return String(number ?? '')
    .normalize('NFC')
    .replace(/Ä/g, 'A')
    .replace(/ä/g, 'a');
}

/** Kas number on uues (õiges) kujus? */
export const CANONICAL_RE = /^(TEST-)?ÄGE-(\d{4})-(\d{4,})$/;
export const isCanonicalOrderNumber = (value) => CANONICAL_RE.test(String(value ?? ''));

// Pärast puhastamist (suurtähed, Ä → A, tühikud/kriipsud → üks '-'):
//   [TEST-][AGE-]AAAA-N…  või  [TEST-][AGE-]AAAANNNN (vähemalt 4 numbrit järjekorranumbris).
const NEW_RE = /^(TEST-?)?(?:AGE-?)?(20[2-9]\d)(?:-(\d{1,7})|(\d{4,7}))$/;
const LEGACY_RE = /^AGE-?([A-Z0-9]{3,12})$/;

/**
 * Sisestatud tellimuse number → õige kuju.
 *   'äge-2026-0001', 'AGE 2026 0001', '2026-1', '#ÄGE20260001' → { number: 'ÄGE-2026-0001', test: false, year: 2026, seq: 1, legacy: false }
 *   'test-age-2026-0001'                                       → { number: 'TEST-ÄGE-2026-0001', test: true, … }
 *   'age1001', 'AGE-7K3M9Q' (vana vorm)                        → { number: 'AGE-1001', legacy: true }
 * Tundmatu sisend → null.
 */
export function parseOrderNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let s = String(value).normalize('NFC').trim();
  if (!s || s.length > ORDER_INPUT_MAX) return null;
  s = s
    .toUpperCase()
    .replace(/^#/, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-') // ‐ – — − → -
    .replace(/[\s\u00A0_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Vanas vormis (AGE-1001) Ä-d polnud — Ä-ga sisestus saab olla ainult uus number.
  const withUmlaut = s.includes('Ä');
  s = s.replace(/Ä/g, 'A');
  let m = NEW_RE.exec(s);
  if (m) {
    const seq = Number(m[3] ?? m[4]);
    if (!Number.isSafeInteger(seq) || seq < 1) return null;
    const year = Number(m[2]);
    const test = Boolean(m[1]);
    return { number: formatOrderNumber({ year, seq, test }), test, year, seq, legacy: false };
  }
  m = withUmlaut ? null : LEGACY_RE.exec(s);
  return m ? { number: `AGE-${m[1]}`, test: false, year: null, seq: null, legacy: true } : null;
}

/** Sisestus → õige kujuga number (või null). */
export function normalizeOrderNumber(value) {
  return parseOrderNumber(value)?.number || null;
}
