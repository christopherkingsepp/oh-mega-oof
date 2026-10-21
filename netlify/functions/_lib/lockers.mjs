// Pakiautomaatide nimekirjad: allikad, allalaadimine, normaliseerimine ja puhver andmebaasis.
// Kõik normaliseerijad tagastavad ühtse kuju: { id, name, city, address, postalCode? }
// ainult Eesti (EE) pakiautomaatidest, sorteerituna linna ja nime järgi.
//
// ALLIKAD (vt ka JUHEND.md):
//  • Omniva — avalik võtmeta JSON https://www.omniva.ee/locations.json (kogu Baltikum; filtreerime EE + TYPE 0).
//  • SmartPosti (Posti Grupp, endine Itella SmartPOST) — avalik https://www.smartpost.ee/places.json;
//    varuallikas Posti avalik asukohateenus locationservice.posti.com (võtmeta).
//  • DPD Pickup — avalikku võtmeta nimekirja pole kindlalt teada (DPD Baltics API vajab kliendilepingut
//    ja kasutajatunnuseid). Seepärast ainult DPD_LOCKERS_URL kaudu (JSON, mille omanik saab DPD-lt või
//    vahendajalt); muidu sisestab klient automaadi käsitsi.
//
// PUHVER: viimane õnnestunud nimekiri salvestatakse tabelisse locker_cache. Kui see on vanem kui
// 12 h, laetakse uus; kui allikas ei vasta, kasutatakse viimast toimivat (stale: true); kui ka seda
// pole, lubab kassa automaadi käsitsi sisestada (manual: true). Ajastatud funktsioon
// lockers-refresh.mjs värskendab nimekirja kord ööpäevas ette.
//
// MOCK_LOCKERS=1 (ainult kohalikult, mitte Lambdas) → NÄIDISANDMED failidest tests/fixtures/mock-lockers-*.json.
// Need on välja mõeldud arendamiseks — mitte päris automaatide nimekiri!
import { readFile } from 'node:fs/promises';
import { cleanText } from './http.mjs';
import { isMockLockers } from './config.mjs';

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
    const row = { id: String(l.id || ''), name: l.name, city: l.city || '', address: l.address || '' };
    const postalCode = cleanText(l.postalCode);
    if (/^\d{5}$/.test(postalCode)) row.postalCode = postalCode; // Eesti sihtnumber
    out.push(row);
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
    // Omniva automaadi ZIP on ühtlasi tema sihtnumber.
    out.push({ id, name, city: omnivaCity(r), address: omnivaAddress(r), postalCode: id });
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
    out.push({ id, name, city: settlementName(r.city), address: cleanText(r.address), postalCode: cleanText(r.postalcode ?? r.postal_code ?? r.zip) });
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
    let postalCode = '';
    if (addr && typeof addr === 'object') {
      address = cleanText(addr.address) || [cleanText(addr.streetName), cleanText(addr.streetNumber)].filter(Boolean).join(' ');
      city = settlementName(addr.municipality || addr.postalCodeName || addr.city || addr.postOffice);
      postalCode = cleanText(addr.postalCode);
    } else {
      address = cleanText(addr);
    }
    out.push({ id, name, city, address, postalCode });
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
    const postalCode = cleanText(r.postalCode ?? r.postal_code ?? r.zip ?? r.pcode ?? addrObj?.postalCode ?? addrObj?.zip);
    out.push({ id, name, city, address, postalCode });
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
  if (isMockLockers(env)) return loadMockLockers(carrier);
  const opts = { fetchImpl, timeoutMs };
  const nonEmpty = (lockers, source) => {
    if (!lockers.length) throw new Error(`${source}: nimekiri on tühi`);
    return { lockers, source };
  };

  // Allika aadressi saab keskkonnamuutujaga üle kirjutada (kui vedaja muudab aadressi, pole koodi muutmist vaja).
  const src = (name, key) => cleanText(env[name]) || SOURCES[key];

  if (carrier === 'omniva') {
    return nonEmpty(normalizeOmniva(await fetchJson(src('OMNIVA_LOCKERS_URL', 'omniva'), opts)), 'omniva');
  }

  if (carrier === 'smartpost') {
    try {
      return nonEmpty(normalizeSmartpost(await fetchJson(src('SMARTPOST_LOCKERS_URL', 'smartpost'), opts)), 'smartpost');
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

/* ---------------------------------------------------------------------------
 * Näidisandmed (MOCK_LOCKERS=1, ainult kohalik arendus)
 * ------------------------------------------------------------------------- */

const MOCK_FILES = {
  omniva: ['mock-lockers-omniva.json', normalizeOmniva],
  smartpost: ['mock-lockers-smartpost.json', normalizeSmartpost],
  dpd: ['mock-lockers-dpd.json', normalizeDpd],
};

/** Laeb NÄIDISNIMEKIRJA (välja mõeldud automaadid) kaustast tests/fixtures. */
export async function loadMockLockers(carrier) {
  const entry = MOCK_FILES[carrier];
  if (!entry) throw new Error(`Tundmatu vedaja: ${carrier}`);
  const [file, normalize] = entry;
  const text = await readFile(new URL(`../../../tests/fixtures/${file}`, import.meta.url), 'utf8');
  const lockers = normalize(JSON.parse(text));
  if (!lockers.length) throw new Error(`${carrier}: näidisnimekiri on tühi`);
  return { lockers, source: 'mock' };
}

/* ---------------------------------------------------------------------------
 * Puhver andmebaasis (locker_cache)
 * ------------------------------------------------------------------------- */

export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

/** Viimane salvestatud nimekiri: { lockers, fetchedAt } või null. */
export async function readLockerCache(db, carrier) {
  const rows = await db.query('SELECT lockers, fetched_at FROM locker_cache WHERE carrier = $1', [carrier]);
  if (!rows[0]) return null;
  const lockers = Array.isArray(rows[0].lockers) ? rows[0].lockers : [];
  return { lockers, fetchedAt: new Date(rows[0].fetched_at) };
}

/** Salvestab õnnestunud nimekirja (tühja nimekirja ei salvestata kunagi). */
export async function writeLockerCache(db, carrier, lockers) {
  if (!Array.isArray(lockers) || !lockers.length) return null;
  const rows = await db.query(
    `INSERT INTO locker_cache (carrier, lockers, fetched_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (carrier) DO UPDATE SET lockers = EXCLUDED.lockers, fetched_at = EXCLUDED.fetched_at
     RETURNING fetched_at`,
    [carrier, JSON.stringify(lockers)],
  );
  return rows[0] ? new Date(rows[0].fetched_at) : null;
}

/** Ühe automaadi andmed puhvrist (kassa jaoks: ametlik nimi/aadress/linn id järgi) või null. */
export async function findCachedLocker(db, carrier, lockerId) {
  if (!lockerId) return null;
  const rows = await db.query(
    `SELECT elem FROM locker_cache c, jsonb_array_elements(c.lockers) AS elem
     WHERE c.carrier = $1 AND elem->>'id' = $2 LIMIT 1`,
    [carrier, String(lockerId)],
  );
  return rows[0]?.elem || null;
}

/**
 * Vedaja automaadid koos puhvri loogikaga.
 * @param {string} carrier
 * @param {{db?:object|null, env?:object, fetchImpl?:Function, timeoutMs?:number, ttlMs?:number,
 *          now?:()=>number, logger?:Console, force?:boolean}} opts  force → ignoreeri värsket puhvrit (ajastatud värskendus)
 * @returns {Promise<{carrier:string, lockers:object[], updatedAt:string|null, stale?:true, manual?:true, error?:string, source?:string}>}
 */
export async function getCarrierLockers(carrier, { db = null, env = {}, fetchImpl, timeoutMs, ttlMs = CACHE_TTL_MS, now = Date.now, logger = console, force = false } = {}) {
  let cached = null;
  if (db) {
    try {
      cached = await readLockerCache(db, carrier);
    } catch (err) {
      logger.error?.(`[pakiautomaadid] ${carrier}: puhvri lugemine ebaõnnestus — ${err?.message || err}`);
    }
  }
  if (cached && !force && now() - cached.fetchedAt.getTime() < ttlMs) {
    return { carrier, lockers: cached.lockers, updatedAt: cached.fetchedAt.toISOString(), source: 'cache' };
  }

  try {
    const loaded = await loadLockers(carrier, { fetchImpl, timeoutMs, env });
    if (loaded.manual) return { carrier, lockers: [], updatedAt: null, manual: true, source: loaded.source };
    let updatedAt = new Date(now());
    if (db) {
      try {
        updatedAt = (await writeLockerCache(db, carrier, loaded.lockers)) || updatedAt;
      } catch (err) {
        logger.error?.(`[pakiautomaadid] ${carrier}: puhvrisse salvestamine ebaõnnestus — ${err?.message || err}`);
      }
    }
    return { carrier, lockers: loaded.lockers, updatedAt: updatedAt.toISOString(), source: loaded.source };
  } catch (err) {
    const message = String(err?.message || err);
    if (cached?.lockers.length) {
      logger.warn?.(`[pakiautomaadid] ${carrier}: allikas ei vasta (${message}) — kasutan viimast toimivat nimekirja (${cached.fetchedAt.toISOString()}).`);
      return { carrier, lockers: cached.lockers, updatedAt: cached.fetchedAt.toISOString(), stale: true, error: message, source: 'cache' };
    }
    logger.error?.(`[pakiautomaadid] ${carrier}: nimekirja laadimine ebaõnnestus — ${message}`);
    return { carrier, lockers: [], updatedAt: null, manual: true, error: message };
  }
}
