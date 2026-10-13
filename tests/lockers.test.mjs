// Pakiautomaatide normaliseerijad (fixtuuridega) ja allalaadimine (võlts-fetch'iga).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOmniva,
  normalizeSmartpost,
  normalizePosti,
  normalizeDpd,
  omnivaCity,
  settlementName,
  finalizeLockers,
  fetchJson,
  loadLockers,
  SOURCES,
} from '../netlify/functions/_lib/lockers.mjs';
import { fixture } from './helpers.mjs';

const shape = (l) => assert.deepEqual(Object.keys(l).sort(), ['address', 'city', 'id', 'name']);

test('Omniva: ainult Eesti pakiautomaadid (TYPE 0), postkontorid ja LV/LT välja', () => {
  const list = normalizeOmniva(fixture('omniva-locations.json'));
  list.forEach(shape);
  const ids = list.map((l) => l.id);
  assert.ok(!ids.includes('10101'), 'postkontor (TYPE 1) ei tohi olla nimekirjas');
  assert.ok(!ids.includes('9401'), 'Läti automaat ei tohi olla nimekirjas');
  assert.ok(!ids.includes('02101'), 'Leedu automaat ei tohi olla nimekirjas');
  assert.equal(ids.filter((id) => id === '96331').length, 1, 'duplikaat eemaldatakse');
  assert.ok(!list.some((l) => l.name === 'Ilma indeksita automaat'), 'ilma id-ta kirje jäetakse välja');
  assert.equal(list.length, 7);
});

test('Omniva: linn ja aadress', () => {
  const byId = Object.fromEntries(normalizeOmniva(fixture('omniva-locations.json')).map((l) => [l.id, l]));
  assert.deepEqual(byId['96331'], { id: '96331', name: 'Tallinna Kristiine keskuse pakiautomaat', city: 'Tallinn', address: 'Endla tn 45' });
  assert.equal(byId['96051'].city, 'Tartu');
  assert.equal(byId['96195'].city, 'Jüri'); // Rae vald → asula
  assert.equal(byId['96310'].city, 'Kuressaare'); // Saaremaa vald → Kuressaare linn
  assert.equal(byId['96412'].city, 'Haabneeme');
  assert.equal(byId['96412'].address, '', '"NULL" väljad ei jõua aadressi');
  assert.equal(byId['96231'].city, 'Pärnu'); // TYPE numbrina 0
  assert.equal(byId['96231'].address, 'Papiniidu tn 8');
});

test('Omniva: sorteeritud linna ja nime järgi (eesti tähestik)', () => {
  const list = normalizeOmniva(fixture('omniva-locations.json'));
  assert.deepEqual(
    list.map((l) => l.city),
    ['Haabneeme', 'Jüri', 'Kuressaare', 'Pärnu', 'Tallinn', 'Tallinn', 'Tartu'],
  );
  const tallinn = list.filter((l) => l.city === 'Tallinn').map((l) => l.name);
  assert.deepEqual(tallinn, ['Tallinna Kristiine keskuse pakiautomaat', 'Tallinna Ülemiste keskuse pakiautomaat']);
});

test('Omniva: vigane sisend ei kuku', () => {
  assert.deepEqual(normalizeOmniva(null), []);
  assert.deepEqual(normalizeOmniva({}), []);
  assert.deepEqual(normalizeOmniva('tekst'), []);
  assert.deepEqual(normalizeOmniva([1, 'a', null, {}]), []);
});

test('omnivaCity ja settlementName', () => {
  assert.equal(omnivaCity({ A2_NAME: 'Tallinn', A3_NAME: 'Lasnamäe linnaosa' }), 'Tallinn');
  assert.equal(omnivaCity({ A2_NAME: 'Narva-Jõesuu linn', A3_NAME: 'NULL' }), 'Narva-Jõesuu');
  assert.equal(omnivaCity({ A2_NAME: 'Kohtla-Järve linn', A3_NAME: 'Järve linnaosa' }), 'Kohtla-Järve');
  assert.equal(omnivaCity({ A2_NAME: 'Rae vald', A3_NAME: 'NULL' }), 'Rae vald');
  assert.equal(omnivaCity({ A1_NAME: 'Harju maakond' }), 'Harju maakond');
  assert.equal(settlementName('Peetri küla'), 'Peetri');
  assert.equal(settlementName('Tamsalu linn'), 'Tamsalu');
  assert.equal(settlementName('Kose alevik'), 'Kose');
});

test('SmartPost places.json: ainult aktiivsed Eesti automaadid', () => {
  const list = normalizeSmartpost(fixture('smartpost-places.json'));
  list.forEach(shape);
  assert.deepEqual(
    list.map((l) => `${l.city}|${l.name}|${l.address}|${l.id}`),
    [
      'Tallinn|Tallinn Mustika Prisma|Tammsaare tee 116|102',
      'Tallinn|Tallinn Rocca al Mare Prisma|Paldiski mnt 102|101',
      'Tartu|Tartu Annelinna Prisma|Nõlvaku 2|245',
      'Viljandi|Viljandi Uku keskus|Tallinna 41|310',
    ],
  );
});

test('Posti asukohateenus (SmartPosti varuallikas): EE + SMARTPOST tüüp, mitmekeelsed väljad', () => {
  const list = normalizePosti(fixture('posti-locations.json'));
  list.forEach(shape);
  assert.deepEqual(list, [
    { id: '3101', name: 'Tallinn Rocca al Mare Prisma', city: 'Tallinn', address: 'Paldiski mnt 102' },
    { id: '3245', name: 'Tartu Annelinna Prisma', city: 'Tartu', address: 'Nõlvaku 2' },
  ]);
});

test('DPD: kaitsev väljade kaardistus, pakipoed ja välisriigid välja', () => {
  const list = normalizeDpd(fixture('dpd-lockers.json'));
  assert.deepEqual(list, [
    { id: 'EE90002', name: 'DPD Pickup Pärnu Port Artur 2', city: 'Pärnu', address: 'Lai 11' },
    { id: 'EE90001', name: 'DPD Pickup Tallinn Lõunakeskus', city: 'Tallinn', address: 'Pärnu mnt 238' },
  ]);
  // Ka lihtne massiiv töötab
  assert.equal(normalizeDpd([{ id: 1, name: 'Automaat', city: 'Tartu', address: 'Riia 1' }]).length, 1);
});

test('finalizeLockers: linnata kirjed lõppu', () => {
  const list = finalizeLockers([
    { id: '1', name: 'B', city: '' },
    { id: '2', name: 'A', city: 'Võru' },
    { id: '3', name: 'C', city: 'Viljandi' },
  ]);
  assert.deepEqual(
    list.map((l) => l.id),
    ['3', '2', '1'],
  );
});

/* ---------------- Allalaadimine ---------------- */

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('fetchJson: ajalimiit katkestab päringu', async () => {
  const hanging = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason || new Error('aborted'))));
  const started = Date.now();
  await assert.rejects(() => fetchJson('https://x.test', { fetchImpl: hanging, timeoutMs: 50 }), /Ajalimiit/);
  assert.ok(Date.now() - started < 1000);
});

test('fetchJson: HTTP viga ja vigane JSON visatakse; BOM eemaldatakse', async () => {
  await assert.rejects(() => fetchJson('https://x.test', { fetchImpl: async () => jsonResponse({}, 503) }), /HTTP 503/);
  await assert.rejects(() => fetchJson('https://x.test', { fetchImpl: async () => new Response('<html>') }));
  const data = await fetchJson('https://x.test', { fetchImpl: async () => new Response('﻿[1]') });
  assert.deepEqual(data, [1]);
});

test('loadLockers: Omniva õigest allikast', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return jsonResponse(fixture('omniva-locations.json'));
  };
  const r = await loadLockers('omniva', { fetchImpl, timeoutMs: 1000 });
  assert.deepEqual(urls, [SOURCES.omniva]);
  assert.equal(r.lockers.length, 7);
});

test('loadLockers: SmartPost kasutab varuallikat, kui põhiallikas ei vasta', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url === SOURCES.smartpost) return new Response('Not found', { status: 404 });
    return jsonResponse(fixture('posti-locations.json'));
  };
  const r = await loadLockers('smartpost', { fetchImpl, timeoutMs: 1000 });
  assert.deepEqual(urls, [SOURCES.smartpost, SOURCES.smartpostFallback]);
  assert.equal(r.source, 'posti');
  assert.equal(r.lockers.length, 2);
});

test('loadLockers: SmartPost — mõlemad allikad maas → viga', async () => {
  await assert.rejects(
    () => loadLockers('smartpost', { fetchImpl: async () => { throw new Error('ENOTFOUND'); }, timeoutMs: 1000 }),
    /SmartPost/,
  );
});

test('loadLockers: tühi nimekiri loetakse veaks (→ käsitsi sisestus)', async () => {
  await assert.rejects(() => loadLockers('omniva', { fetchImpl: async () => jsonResponse([]), timeoutMs: 1000 }), /tühi/);
});

test('loadLockers: DPD ilma DPD_LOCKERS_URL-ita → manual, ilma võrgupäringuta', async () => {
  let called = false;
  const r = await loadLockers('dpd', { fetchImpl: async () => { called = true; }, env: {} });
  assert.deepEqual(r.lockers, []);
  assert.equal(r.manual, true);
  assert.equal(called, false);
});

test('loadLockers: DPD DPD_LOCKERS_URL-iga', async () => {
  const urls = [];
  const r = await loadLockers('dpd', {
    fetchImpl: async (url) => {
      urls.push(url);
      return jsonResponse(fixture('dpd-lockers.json'));
    },
    env: { DPD_LOCKERS_URL: 'https://dpd.example/lockers.json' },
    timeoutMs: 1000,
  });
  assert.deepEqual(urls, ['https://dpd.example/lockers.json']);
  assert.equal(r.lockers.length, 2);
});
