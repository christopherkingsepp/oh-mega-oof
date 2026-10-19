// GET /api/pakiautomaadid?carrier=omniva|smartpost|dpd|all
// → 200 {
//     carrier,                                    // päritud vedaja või 'all'
//     carriers: [{ id, name, label, priceCents, eta, enabled, lockerCount, updatedAt, stale?, manual? }],
//     lockers:  [{ id, carrier, name, city, address, postalCode? }],
//     updatedAt,                                  // nimekirja (vanima osa) laadimise aeg, ISO
//     stale?: true,                               // allikas ei vastanud — näidatakse viimast toimivat nimekirja
//     manual?: true,                              // nimekirja pole üldse → kassa lubab automaadi käsitsi sisestada
//     errors?: [{ carrier, message }], error?: 'eestikeelne teade'
//   }
//
// Nimekiri tuuakse serveris vedajate avalikest allikatest (brauser ei pea teiste domeenidega
// suhtlema ja CSP jääb rangeks) ning hoitakse andmebaasis (locker_cache, värskus 12 h).
// `carrier=all` tagastab ainult nende vedajate automaadid, kuhu saab päriselt tellida
// (ENABLED_CARRIERS); üksiku vedaja päring tagastab alati selle vedaja nimekirja + `enabled` lipu.
import { SHIPPING } from '../../public/assets/js/catalog.js';
import { json } from './_lib/http.mjs';
import { getCarrierLockers, CACHE_TTL_MS } from './_lib/lockers.mjs';
import { carrierMeta, enabledCarriers } from './_lib/config.mjs';
import { getDb } from './_lib/db.mjs';

const CACHE_OK = {
  'Cache-Control': 'public, max-age=900',
  // Netlify CDN: hoia tund, seejärel serveeri vana kuni ööpäev, kuni taustal uuendatakse.
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=3600, stale-while-revalidate=86400',
  'Netlify-Vary': 'query=carrier',
};
const CACHE_FAIL = {
  'Cache-Control': 'public, max-age=60',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=300',
  'Netlify-Vary': 'query=carrier',
};

export const MSG_MANUAL = 'Pakiautomaatide nimekirja ei õnnestunud laadida. Kirjuta automaadi nimi käsitsi.';

/**
 * Loob käsitleja. Testides saab süstida fetch'i, env-i, andmebaasi ja ajalimiidi.
 * @param {{fetchImpl?:typeof fetch, env?:object, timeoutMs?:number, ttlMs?:number, memoryTtlMs?:number,
 *          logger?:Console, getDb?:()=>Promise<object>, now?:()=>number}} deps
 */
export function createHandler({
  fetchImpl = (...a) => globalThis.fetch(...a),
  env = process.env,
  timeoutMs = 8000,
  ttlMs = CACHE_TTL_MS,
  memoryTtlMs = 5 * 60 * 1000,
  logger = console,
  getDb: getDbImpl = () => getDb(env),
  now = Date.now,
} = {}) {
  // Soojas funktsioonis hoitav lühike mälupuhver (säästab andmebaasi päringu).
  const memory = new Map();

  async function dbOrNull() {
    try {
      return await getDbImpl();
    } catch (err) {
      logger.warn?.(`[pakiautomaadid] andmebaas pole kättesaadav (${err?.code || err?.message || err}) — laen otse allikast.`);
      return null;
    }
  }

  async function carrierResult(carrier, db) {
    const hit = memory.get(carrier);
    if (hit && hit.expires > now()) return hit.result;
    const result = await getCarrierLockers(carrier, { db, env, fetchImpl, timeoutMs, ttlMs, now, logger });
    // Ebaõnnestumist (manual/stale) ei jäeta mällu — järgmine päring proovib allikat uuesti.
    if (!result.manual && !result.stale) memory.set(carrier, { result, expires: now() + memoryTtlMs });
    return result;
  }

  return async function lockersHandler(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(405, { error: 'Lubatud on ainult GET-päring.' }, { Allow: 'GET, HEAD' });
    }

    const carrier = (new URL(req.url).searchParams.get('carrier') || '').trim().toLowerCase();
    const known = Object.prototype.hasOwnProperty.call(SHIPPING.carriers, carrier);
    if (!known && carrier !== 'all') {
      return json(400, { error: 'Tundmatu vedaja. Vali Omniva, SmartPosti või DPD.', field: 'carrier' });
    }

    const wanted = carrier === 'all' ? enabledCarriers(env, logger) : [carrier];
    const db = await dbOrNull();
    const results = await Promise.all(wanted.map((c) => carrierResult(c, db)));
    const byId = Object.fromEntries(results.map((r) => [r.carrier, r]));

    const carriers = carrierMeta(env).map((c) => {
      const r = byId[c.id];
      if (!r) return c;
      return {
        ...c,
        lockerCount: r.lockers.length,
        updatedAt: r.updatedAt,
        ...(r.stale ? { stale: true } : {}),
        ...(r.manual ? { manual: true } : {}),
      };
    });

    const lockers = [];
    for (const r of results) for (const l of r.lockers) lockers.push({ id: l.id, carrier: r.carrier, name: l.name, city: l.city, address: l.address, ...(l.postalCode ? { postalCode: l.postalCode } : {}) });

    const times = results.map((r) => r.updatedAt).filter(Boolean).sort();
    const stale = results.some((r) => r.stale);
    const manual = lockers.length === 0;
    // DPD ilma DPD_LOCKERS_URL-ita ei ole viga (seadistamata), seega seda errors alla ei panda.
    const errors = results.filter((r) => r.error && (r.manual || r.stale)).map((r) => ({ carrier: r.carrier, message: r.manual ? MSG_MANUAL : 'Näitame viimati salvestatud nimekirja.' }));
    const failed = results.some((r) => r.manual && r.error);

    const payload = {
      carrier,
      carriers,
      lockers,
      updatedAt: times[0] || null,
      ...(stale ? { stale: true } : {}),
      ...(manual ? { manual: true } : {}),
      ...(errors.length ? { errors } : {}),
      ...(manual && failed ? { error: MSG_MANUAL } : {}),
    };
    return json(200, payload, stale || failed ? CACHE_FAIL : CACHE_OK);
  };
}

export default createHandler();

export const config = { path: '/api/pakiautomaadid' };
