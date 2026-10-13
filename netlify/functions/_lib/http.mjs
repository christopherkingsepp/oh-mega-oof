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
 * Loeb päringu keha tekstina, aga mitte üle `maxBytes` baidi. Keha loetakse
 * voona ja katkestatakse kohe, kui piir ületatakse — nii ei saa keegi
 * hiiglasliku (või Content-Length'ita "chunked") päringuga mälu täita.
 * Tagastab { text } või { tooLarge: true }.
 */
export async function readTextLimited(req, maxBytes) {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true };
  if (!req.body) return { text: '' };

  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return { text: new TextDecoder('utf-8').decode(bytes) };
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
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2028\u2029\uFEFF]/g, ' ')
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
