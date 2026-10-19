// Pakiautomaatide puhver andmebaasis (locker_cache): värske / aegunud / allika viga → stale / manual,
// carrier=all, ENABLED_CARRIERS, näidisandmed ja ajastatud värskendus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCarrierLockers, readLockerCache, writeLockerCache, findCachedLocker, loadLockers, CACHE_TTL_MS, SOURCES } from '../netlify/functions/_lib/lockers.mjs';
import { createHandler as createLockersHandler } from '../netlify/functions/parcel-lockers.mjs';
import { refreshAllLockers, config as refreshConfig } from '../netlify/functions/lockers-refresh.mjs';
import { freshDb, testDb, fixture, silentLogger, call } from './helpers.mjs';

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const HOUR = 60 * 60 * 1000;

function source(map) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const v = map[url];
    if (v instanceof Error) throw v;
    if (typeof v === 'function') return v();
    if (v === undefined) return new Response('Not found', { status: 404 });
    return jsonResponse(v);
  };
  return { urls, fetchImpl };
}

test('puhver: esimene päring laeb allikast ja salvestab; värske puhver → allikat ei küsita', async () => {
  const db = await freshDb();
  const { urls, fetchImpl } = source({ [SOURCES.omniva]: fixture('omniva-locations.json') });
  const r1 = await getCarrierLockers('omniva', { db, fetchImpl, logger: silentLogger() });
  assert.equal(r1.lockers.length, 7);
  assert.equal(r1.stale, undefined);
  assert.equal(urls.length, 1);
  const cached = await readLockerCache(db, 'omniva');
  assert.equal(cached.lockers.length, 7);

  const r2 = await getCarrierLockers('omniva', { db, fetchImpl, now: () => Date.now() + 11 * HOUR });
  assert.equal(r2.source, 'cache');
  assert.equal(r2.updatedAt, r1.updatedAt);
  assert.equal(urls.length, 1, 'alla 12 h vana puhver → allikat ei küsita');
});

test('puhver: vanem kui 12 h → värskendatakse', async () => {
  const db = await freshDb();
  await writeLockerCache(db, 'smartpost', [{ id: '1', name: 'Vana automaat', city: 'Tartu', address: 'Riia 1' }]);
  await db.query("UPDATE locker_cache SET fetched_at = now() - interval '13 hours' WHERE carrier = 'smartpost'");
  const { urls, fetchImpl } = source({ [SOURCES.smartpost]: fixture('smartpost-places.json') });
  const r = await getCarrierLockers('smartpost', { db, fetchImpl });
  assert.equal(urls.length, 1);
  assert.equal(r.lockers.length, 4);
  assert.ok(Date.parse(r.updatedAt) > Date.now() - 60000);
  assert.equal((await readLockerCache(db, 'smartpost')).lockers.length, 4);
});

test('puhver: allikas maas → viimane toimiv nimekiri (stale:true); puhvrit ei kirjutata üle', async () => {
  const db = await freshDb();
  await writeLockerCache(db, 'omniva', [{ id: '96331', name: 'Kristiine', city: 'Tallinn', address: 'Endla 45' }]);
  await db.query("UPDATE locker_cache SET fetched_at = now() - interval '2 days' WHERE carrier = 'omniva'");
  const logger = silentLogger();
  const { fetchImpl } = source({ [SOURCES.omniva]: new TypeError('fetch failed') });
  const r = await getCarrierLockers('omniva', { db, fetchImpl, logger });
  assert.equal(r.stale, true);
  assert.equal(r.lockers.length, 1);
  assert.match(r.error, /fetch failed/);
  assert.ok(Date.parse(r.updatedAt) < Date.now() - 24 * HOUR);
  assert.ok(logger.lines.some((l) => /viimast toimivat/.test(l)));

  // tühi vastus ei ole "toimiv nimekiri"
  const empty = source({ [SOURCES.omniva]: [] });
  const r2 = await getCarrierLockers('omniva', { db, fetchImpl: empty.fetchImpl, logger });
  assert.equal(r2.stale, true);
  assert.equal((await readLockerCache(db, 'omniva')).lockers.length, 1);
});

test('puhver: allikas maas ja puhvrit pole → manual:true', async () => {
  const db = await freshDb();
  const { fetchImpl } = source({});
  const r = await getCarrierLockers('omniva', { db, fetchImpl, logger: silentLogger() });
  assert.equal(r.manual, true);
  assert.deepEqual(r.lockers, []);
  assert.equal(r.updatedAt, null);
});

test('findCachedLocker: automaat id järgi puhvrist', async () => {
  const db = await freshDb();
  await writeLockerCache(db, 'omniva', [
    { id: '96331', name: 'Kristiine', city: 'Tallinn', address: 'Endla 45' },
    { id: '96051', name: 'Lõunakeskus', city: 'Tartu', address: 'Ringtee 75' },
  ]);
  assert.equal((await findCachedLocker(db, 'omniva', '96051')).name, 'Lõunakeskus');
  assert.equal(await findCachedLocker(db, 'smartpost', '96051'), null);
  assert.equal(await findCachedLocker(db, 'omniva', 'x'), null);
  assert.equal(await findCachedLocker(db, 'omniva', ''), null);
});

test('/api/pakiautomaadid?carrier=all → ainult lubatud vedajad; vedaja info + stale/errors', async () => {
  const db = await freshDb();
  await writeLockerCache(db, 'smartpost', [{ id: '101', name: 'Tallinn Rocca al Mare Prisma', city: 'Tallinn', address: 'Paldiski mnt 102' }]);
  await db.query("UPDATE locker_cache SET fetched_at = now() - interval '20 hours' WHERE carrier = 'smartpost'");
  const { urls, fetchImpl } = source({ [SOURCES.omniva]: fixture('omniva-locations.json') }); // SmartPost maas
  const handler = createLockersHandler({ env: {}, fetchImpl, logger: silentLogger(), getDb: () => testDb(), timeoutMs: 500 });
  const { res, data } = await call(handler, new Request('https://age.example/api/pakiautomaadid?carrier=all'));
  assert.equal(res.status, 200);
  assert.equal(data.carrier, 'all');
  assert.ok(!urls.some((u) => /dpd/.test(u)), 'DPD on vaikimisi keelatud → seda ei laeta');
  assert.equal(data.lockers.filter((l) => l.carrier === 'omniva').length, 7);
  assert.deepEqual(data.lockers.filter((l) => l.carrier === 'smartpost').map((l) => l.id), ['101']);
  assert.equal(data.stale, true);
  assert.equal(data.manual, undefined);
  assert.deepEqual(data.errors, [{ carrier: 'smartpost', message: 'Näitame viimati salvestatud nimekirja.' }]);
  const sp = data.carriers.find((c) => c.id === 'smartpost');
  assert.equal(sp.stale, true);
  assert.equal(sp.lockerCount, 1);
  assert.equal(data.carriers.find((c) => c.id === 'dpd').enabled, false);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60', 'vana nimekiri → lühike puhver');
  assert.ok(Date.parse(data.updatedAt) < Date.now() - 19 * HOUR, 'updatedAt = vanim osa');
});

test('/api/pakiautomaadid: ENABLED_CARRIERS lisab DPD; DPD ilma URL-ita → selle vedaja manual', async () => {
  await freshDb();
  const { fetchImpl } = source({ [SOURCES.omniva]: fixture('omniva-locations.json'), [SOURCES.smartpost]: fixture('smartpost-places.json') });
  const handler = createLockersHandler({ env: { ENABLED_CARRIERS: 'omniva,smartpost,dpd' }, fetchImpl, logger: silentLogger(), getDb: () => testDb() });
  const { data } = await call(handler, new Request('https://age.example/api/pakiautomaadid?carrier=all'));
  assert.equal(data.carriers.find((c) => c.id === 'dpd').enabled, true);
  assert.equal(data.carriers.find((c) => c.id === 'dpd').manual, true);
  assert.equal(data.lockers.length, 11);
  assert.equal(data.manual, undefined);
  assert.equal(data.errors, undefined);
});

test('MOCK_LOCKERS=1 → realistlikud NÄIDISandmed (Omniva ≥ 40, SmartPosti ≥ 25, mitu linna); Lambdas välja lülitatud', async () => {
  const om = await loadLockers('omniva', { env: { MOCK_LOCKERS: '1' } });
  const sp = await loadLockers('smartpost', { env: { MOCK_LOCKERS: '1' } });
  const dpd = await loadLockers('dpd', { env: { MOCK_LOCKERS: '1' } });
  assert.equal(om.source, 'mock');
  assert.ok(om.lockers.length >= 40, `Omniva: ${om.lockers.length}`);
  assert.ok(sp.lockers.length >= 25, `SmartPosti: ${sp.lockers.length}`);
  assert.ok(dpd.lockers.length >= 10);
  assert.ok(new Set(om.lockers.map((l) => l.city)).size >= 15, 'eri linnad');
  assert.ok(om.lockers.every((l) => l.id && l.name && l.city && l.address));
  assert.ok(!om.lockers.some((l) => /postkontor|Rīga/.test(l.name)), 'normaliseerija filtreerib ka näidisandmeid');
  assert.ok(!sp.lockers.some((l) => /Suletud|Helsinki/.test(l.name)));
  for (const f of ['mock-lockers-omniva.json', 'mock-lockers-smartpost.json', 'mock-lockers-dpd.json']) {
    assert.match(fixture(f)._hoiatus, /NÄIDISANDMED/, `${f} peab olema selgelt märgitud`);
  }

  // Lambdas (tootmises) mock ei kehti → päris allikas
  const urls = [];
  await loadLockers('omniva', {
    env: { MOCK_LOCKERS: '1', AWS_LAMBDA_FUNCTION_NAME: 'parcel-lockers' },
    fetchImpl: async (u) => (urls.push(u), jsonResponse(fixture('omniva-locations.json'))),
  });
  assert.deepEqual(urls, [SOURCES.omniva]);
});

test('lockers-refresh: ajastus @daily; värskendab lubatud vedajad ka värske puhvri korral', async () => {
  assert.equal(refreshConfig.schedule, '@daily');
  assert.equal(refreshConfig.path, undefined, 'ajastatud funktsioonil pole HTTP aadressi');
  const db = await freshDb();
  await writeLockerCache(db, 'omniva', [{ id: '1', name: 'Vana', city: 'Tartu', address: 'Riia 1' }]);
  const { urls, fetchImpl } = source({ [SOURCES.omniva]: fixture('omniva-locations.json'), [SOURCES.smartpost]: fixture('smartpost-places.json') });
  const summary = await refreshAllLockers({ env: {}, getDb: () => testDb(), fetchImpl, logger: silentLogger() });
  assert.deepEqual(summary, [
    { carrier: 'omniva', count: 7, ok: true },
    { carrier: 'smartpost', count: 4, ok: true },
  ]);
  assert.equal(urls.length, 2);
  assert.equal((await readLockerCache(db, 'omniva')).lockers.length, 7);
  assert.ok(CACHE_TTL_MS === 12 * HOUR);
});
