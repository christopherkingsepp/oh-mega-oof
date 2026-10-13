// Pakiautomaatide nimekirjad: allikad, allalaadimine ja normaliseerimine.
// Kõik normaliseerijad tagastavad ühtse kuju: { id, name, city, address }
// ainult Eesti (EE) pakiautomaatidest, sorteerituna linna ja nime järgi.
import { cleanText } from './http.mjs';

export const SOURCES = {
  omniva: 'https://www.omniva.ee/locations.json',
  smartpost: 'https://www.smartpost.ee/places.json',
  // Varuallikas, kui vana smartpost.ee aadress enam ei vasta. Posti API
  // dokumentatsioonis esineb nii `type` kui ka `types` — saadame mõlemad
  // (tundmatut parameetrit API ignoreerib ja normalizePosti filtreerib tüübi niikuinii).
  smartpostFallback: 'https://locationservice.posti.com/api/2/location?countryCode=EE&type=SMARTPOST&types=SMARTPOST',
};

export const MAX_LOCKERS = 3000;

const collator = new Intl.Collator('et', { sensitivity: 'base', numeric: true });

/** Sorteerib (linn → nimi, Eesti tähestiku järgi), eemaldab duplikaadid ja tühjad. */
export function finalizeLockers(list) {
  const seen = new Set();
  const out = [];
  for (const l of list) {
    if (!l || !l.name) continue;
    const key = l.id ? `id:${l.id}` : `name:${l.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: String(l.id || ''), name: l.name, city: l.city || '', address: l.address || '' });
  }
  out.sort((a, b) => {
    // Linnata kirjed lähevad lõppu.
    if (!a.city !== !b.city) return a.city ? -1 : 1;
    return collator.compare(a.city, b.city) || collator.compare(a.name, b.name);
  });
  return out.slice(0, MAX_LOCKERS);
}

/** "Tartu linn" → "Tartu", "Jüri alevik" → "Jüri", "Peetri küla" → "Peetri". */
export function settlementName(s) {
  return cleanText(s).replace(/\s+(linn|alev|alevik|küla)$/i, '');
}

const rowsOf = (data, ...keys) => {
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
  return [];
};

/* ---------------------------------------------------------------------------
 * Omniva — https://www.omniva.ee/locations.json
 * Väljad: ZIP (id), NAME, TYPE ("0" = pakiautomaat, "1" = postkontor),
 * A0_NAME riik, A1_NAME maakond, A2_NAME linn/vald, A3_NAME asula/linnaosa,
 * A5_NAME tänav, A7_NAME maja nr. Tühjad väljad on tihti string "NULL".
 * ------------------------------------------------------------------------- */

export function omnivaCity(r) {
  const a1 = cleanText(r.A1_NAME);
  const a2 = cleanText(r.A2_NAME);
  const a3 = cleanText(r.A3_NAME);
  if (/^tallinn(\s+linn)?$/i.test(a2)) return 'Tallinn'; // A3 on siis linnaosa
  // Vallas asuva automaadi puhul on asula (A3) kliendile tuttavam kui vald.
  if (/\svald$/i.test(a2) && a3 && !/linnaosa$/i.test(a3)) return settlementName(a3);
  if (a2) return settlementName(a2);
  if (a3) return settlementName(a3);
  return a1;
}

export function omnivaAddress(r) {
  const street = cleanText(r.A5_NAME) || cleanText(r.A4_NAME);
  const house = cleanText(r.A7_NAME);
  return [street, house].filter(Boolean).join(' ');
}

export function normalizeOmniva(data) {
  const out = [];
  for (const r of rowsOf(data, 'locations')) {
    if (!r || typeof r !== 'object') continue;
    if (cleanText(r.A0_NAME).toUpperCase() !== 'EE') continue;
    if (cleanText(r.TYPE) !== '0') continue; // ainult pakiautomaadid
    const id = cleanText(r.ZIP);
    const name = cleanText(r.NAME);
    if (!id || !name) continue;
    out.push({ id, name, city: omnivaCity(r), address: omnivaAddress(r) });
  }
  return finalizeLockers(out);
}

/* ---------------------------------------------------------------------------
 * SmartPost (Itella) — https://www.smartpost.ee/places.json
 * Väljad: place_id, name, city, address, country, postalcode, active, ...
 * ------------------------------------------------------------------------- */

const isInactive = (v) => v === 0 || v === '0' || v === false || v === 'false';

export function normalizeSmartpost(data) {
  const out = [];
  for (const r of rowsOf(data, 'places', 'items')) {
    if (!r || typeof r !== 'object') continue;
    const country = cleanText(r.country ?? r.country_code ?? r.countryCode).toUpperCase();
    if (country && country !== 'EE') continue;
    if (isInactive(r.active)) continue;
    const id = cleanText(r.place_id ?? r.id ?? r.routingcode);
    const name = cleanText(r.name);
    if (!name) continue;
    out.push({ id, name, city: settlementName(r.city), address: cleanText(r.address) });
  }
  return finalizeLockers(out);
}

/* ---------------------------------------------------------------------------
 * Posti asukohateenus (SmartPosti varuallikas)
 * { locations:[{ id|pupCode, type, countryCode, publicName:{et|en|fi},
 *   address:{et|en|fi:{address|streetName+streetNumber, postalCode, municipality|postalCodeName}} }] }
 * ------------------------------------------------------------------------- */

/** Valib mitmekeelsest väljast eestikeelse (või ingliskeelse, soome…) väärtuse. */
export function pickLang(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'object') return v;
  for (const lang of ['et', 'ee', 'en', 'fi', 'sv']) if (v[lang] !== undefined && v[lang] !== null) return v[lang];
  return Object.values(v).find((x) => x !== null && x !== undefined);
}

export function normalizePosti(data) {
  const out = [];
  for (const r of rowsOf(data, 'locations', 'items', 'results')) {
    if (!r || typeof r !== 'object') continue;
    const country = cleanText(r.countryCode ?? r.country).toUpperCase();
    if (country && country !== 'EE') continue;
    const types = [].concat(r.type ?? [], r.types ?? []).map((t) => String(t));
    if (types.length && !types.some((t) => /smartpost|parcel.?locker|locker|apt/i.test(t))) continue;
    if (isInactive(r.active)) continue;
    const id = cleanText(r.pupCode ?? r.id ?? r.routingServiceCode);
    const name = cleanText(pickLang(r.publicName) ?? pickLang(r.labelName) ?? r.name);
    if (!name) continue;
    const addr = pickLang(r.address);
    let address = '';
    let city = '';
    if (addr && typeof addr === 'object') {
      address = cleanText(addr.address) || [cleanText(addr.streetName), cleanText(addr.streetNumber)].filter(Boolean).join(' ');
      city = settlementName(addr.municipality || addr.postalCodeName || addr.city || addr.postOffice);
    } else {
      address = cleanText(addr);
    }
    out.push({ id, name, city, address });
  }
  return finalizeLockers(out);
}

/* ---------------------------------------------------------------------------
 * DPD — avalikku võtmeta API-t pole. Kui DPD_LOCKERS_URL on seatud, eeldame
 * JSON-massiivi (või { lockers|parcelshops|data|items: [...] }) ja kaardistame
 * väljad kaitsvalt.
 * ------------------------------------------------------------------------- */

export function normalizeDpd(data) {
  const out = [];
  for (const r of rowsOf(data, 'lockers', 'parcelshops', 'parcelShops', 'pudos', 'data', 'items', 'results')) {
    if (!r || typeof r !== 'object') continue;
    const addrObj = r.address && typeof r.address === 'object' ? r.address : null;
    const country = cleanText(r.country ?? r.countryCode ?? r.country_code ?? addrObj?.country ?? addrObj?.countryCode).toUpperCase();
    if (country && !['EE', 'EST', 'EESTI', 'ESTONIA'].includes(country)) continue;
    const type = cleanText(r.type ?? r.pudoType ?? r.parcelShopType ?? r.kind);
    if (type && /shop|store|pood|office|kontor/i.test(type) && !/locker|automa/i.test(type)) continue;
    if (isInactive(r.active)) continue;
    const id = cleanText(r.id ?? r.parcelshop_id ?? r.parcelShopId ?? r.lockerId ?? r.pudoId ?? r.code);
    const name = cleanText(r.name ?? r.lockerName ?? r.company ?? r.title);
    if (!name) continue;
    const city = settlementName(r.city ?? r.town ?? addrObj?.city);
    const address =
      typeof r.address === 'string'
        ? cleanText(r.address)
        : [cleanText(r.street ?? addrObj?.street), cleanText(r.houseNo ?? r.house ?? addrObj?.houseNo ?? addrObj?.house)]
            .filter(Boolean)
            .join(' ');
    out.push({ id, name, city, address });
  }
  return finalizeLockers(out);
}

/* ---------------------------------------------------------------------------
 * Allalaadimine.
 * ------------------------------------------------------------------------- */

/** Toob JSON-i ajalimiidiga (AbortController). Viskab vea, kui midagi läheb valesti. */
export async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Ajalimiit ${timeoutMs} ms ületatud`)), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'AGE-veebipood/1.0 (pakiautomaatide nimekiri)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Laeb vedaja pakiautomaadid.
 * @returns {Promise<{lockers:object[], manual?:boolean, source?:string}>}
 * Viskab vea, kui allikas ei vasta või vastus on tühi (käsitleja teeb sellest manual:true).
 */
export async function loadLockers(carrier, { fetchImpl, timeoutMs, env = {} } = {}) {
  const opts = { fetchImpl, timeoutMs };
  const nonEmpty = (lockers, source) => {
    if (!lockers.length) throw new Error(`${source}: nimekiri on tühi`);
    return { lockers, source };
  };

  if (carrier === 'omniva') {
    return nonEmpty(normalizeOmniva(await fetchJson(SOURCES.omniva, opts)), 'omniva');
  }

  if (carrier === 'smartpost') {
    try {
      return nonEmpty(normalizeSmartpost(await fetchJson(SOURCES.smartpost, opts)), 'smartpost');
    } catch (primaryErr) {
      try {
        return nonEmpty(normalizePosti(await fetchJson(SOURCES.smartpostFallback, opts)), 'posti');
      } catch (fallbackErr) {
        throw new Error(`SmartPost: ${primaryErr.message}; varuallikas: ${fallbackErr.message}`);
      }
    }
  }

  if (carrier === 'dpd') {
    const url = cleanText(env.DPD_LOCKERS_URL);
    if (!url) return { lockers: [], manual: true, source: 'none' }; // pole seadistatud → käsitsi sisestus
    return nonEmpty(normalizeDpd(await fetchJson(url, opts)), 'dpd');
  }

  throw new Error(`Tundmatu vedaja: ${carrier}`);
}
