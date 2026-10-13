// Väikesed abifunktsioonid HTTP-vastuste ja tekstide jaoks.
// NB! Selles kaustas (_lib) EI tohi olla faili nimega index.mjs ega _lib.mjs —
// muidu peaks Netlify seda kausta eraldi funktsiooniks.

/**
 * JSON-vastus. Vaikimisi ei tohi vastust kuskil puhverdada (no-store);
 * päiseid saab `headers` kaudu üle kirjutada.
 */
export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

/**
 * Puhastab kasutaja/allika teksti: eemaldab juhtmärgid, liidab tühikud kokku
 * ja lõikab servad. `null`, `undefined` ja Omniva "NULL" → tühi string.
 */
export function cleanText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const s = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F​-‍  ﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^null$/i.test(s) ? '' : s;
}

/**
 * Lühendab teksti kuni `max` märgini (Unicode-turvaliselt, ei lõika emojit pooleks).
 * Kui midagi lõigati ära, lõpeb tulemus "…"-ga.
 */
export function truncate(value, max) {
  const s = String(value ?? '');
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
}
