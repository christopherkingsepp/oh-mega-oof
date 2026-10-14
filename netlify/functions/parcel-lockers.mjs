// GET /api/pakiautomaadid?carrier=omniva|smartpost|dpd
// → 200 { carrier, lockers:[{id,name,city,address}], manual?:true, error? }
//
// Nimekiri tuuakse serveris vedajate avalikest JSON-allikatest (brauser ei pea
// teiste domeenidega suhtlema ja CSP jääb rangeks). Kui allikas ei vasta, tuleb
// ikkagi 200 vastus `manual:true`-ga — siis lubab kassa automaadi nime käsitsi
// sisestada. Õnnestunud vastus puhverdatakse Netlify CDN-is ööpäevaks.
import { SHIPPING } from '../../public/assets/js/catalog.js';
import { json } from './_lib/http.mjs';
import { loadLockers } from './_lib/lockers.mjs';

const CACHE_OK = {
  'Cache-Control': 'public, max-age=3600',
  // Netlify CDN: hoia ööpäev, seejärel serveeri vana kuni nädal, kuni taustal uuendatakse.
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400, stale-while-revalidate=604800',
  'Netlify-Vary': 'query=carrier',
};
const CACHE_FAIL = {
  'Cache-Control': 'public, max-age=60',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=300',
  'Netlify-Vary': 'query=carrier',
};

const MSG_MANUAL = 'Pakiautomaatide nimekirja ei õnnestunud laadida. Kirjuta automaadi nimi käsitsi.';

/**
 * Loob käsitleja. Testides saab süstida fetch'i, env-i ja ajalimiidi.
 * @param {{fetchImpl?:typeof fetch, env?:object, timeoutMs?:number, ttlMs?:number, logger?:Console}} deps
 */
export function createHandler({ fetchImpl = (...a) => globalThis.fetch(...a), env = process.env, timeoutMs = 8000, ttlMs = 60 * 60 * 1000, logger = console } = {}) {
  // Soojas funktsioonis hoitav mälupuhver (CDN puhver on peamine, see on lisaks).
  const memory = new Map();

  return async function lockersHandler(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(405, { error: 'Lubatud on ainult GET-päring.' }, { Allow: 'GET, HEAD' });
    }

    const carrier = (new URL(req.url).searchParams.get('carrier') || '').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SHIPPING.carriers, carrier)) {
      return json(400, { error: 'Tundmatu vedaja. Vali Omniva, SmartPost või DPD.', field: 'carrier' });
    }

    const cached = memory.get(carrier);
    if (cached && cached.expires > Date.now()) return json(200, cached.payload, CACHE_OK);

    try {
      const { lockers, manual } = await loadLockers(carrier, { fetchImpl, timeoutMs, env });
      const payload = manual ? { carrier, lockers: [], manual: true } : { carrier, lockers };
      memory.set(carrier, { payload, expires: Date.now() + ttlMs });
      return json(200, payload, CACHE_OK);
    } catch (err) {
      logger.error(`[pakiautomaadid] ${carrier}: nimekirja laadimine ebaõnnestus — ${err?.message || err}`);
      return json(200, { carrier, lockers: [], manual: true, error: MSG_MANUAL }, CACHE_FAIL);
    }
  };
}

export default createHandler();

export const config = { path: '/api/pakiautomaadid' };
