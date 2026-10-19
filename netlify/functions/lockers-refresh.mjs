// Ajastatud funktsioon: värskendab kord ööpäevas pakiautomaatide nimekirjad andmebaasis
// (locker_cache), et kassa ei peaks kliendi ajal vedaja allikat ootama.
// Netlify käivitab selle ise (config.schedule); HTTP kaudu seda tootmises kutsuda ei saa.
// Kui allikas ei vasta, jääb alles viimane toimiv nimekiri (vt _lib/lockers.mjs).
import { getDb } from './_lib/db.mjs';
import { getCarrierLockers } from './_lib/lockers.mjs';
import { enabledCarriers } from './_lib/config.mjs';

/**
 * @param {{env?:object, getDb?:()=>Promise<object>, fetchImpl?:Function, logger?:Console, timeoutMs?:number}} deps
 * @returns {Promise<{carrier:string, count:number, ok:boolean, stale?:boolean, manual?:boolean}[]>}
 */
export async function refreshAllLockers({ env = process.env, getDb: getDbImpl = () => getDb(env), fetchImpl, logger = console, timeoutMs = 20000 } = {}) {
  const db = await getDbImpl();
  const summary = [];
  for (const carrier of enabledCarriers(env, logger)) {
    const r = await getCarrierLockers(carrier, { db, env, fetchImpl, timeoutMs, logger, force: true });
    summary.push({
      carrier,
      count: r.lockers.length,
      ok: !r.stale && !r.manual,
      ...(r.stale ? { stale: true } : {}),
      ...(r.manual ? { manual: true } : {}),
    });
  }
  logger.log?.(`[pakiautomaadid] ajastatud värskendus: ${summary.map((s) => `${s.carrier}=${s.count}${s.ok ? '' : s.stale ? ' (vana)' : ' (puudub)'}`).join(', ')}`);
  return summary;
}

export default async function lockersRefresh() {
  try {
    const summary = await refreshAllLockers();
    return new Response(JSON.stringify({ ok: true, summary }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[pakiautomaadid] ajastatud värskendus ebaõnnestus:', err?.message || err);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// Kord ööpäevas (UTC südaöö). Netlify ajastatud funktsiooni ajalimiit on 30 s.
export const config = { schedule: '@daily' };
