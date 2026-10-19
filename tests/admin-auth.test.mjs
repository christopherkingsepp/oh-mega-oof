// Halduspaneeli autentimine: parooliräsi, seansi allkiri/aegumine/võltsing, küpsis, CSRF,
// sisselogimise käsitleja (vale parool, kiiruspiirang, seadistamata) ja /admin leht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  parsePasswordHash,
  authConfig,
  checkPassword,
  createSessionToken,
  verifySessionToken,
  sessionCookie,
  clearSessionCookie,
  isSameOrigin,
  requireAdmin,
  createLoginLimiter,
  SESSION_TTL_SECONDS,
} from '../netlify/functions/_lib/admin-auth.mjs';
import { createLoginHandler } from '../netlify/functions/_lib/admin-api.mjs';
import { createPageHandler, renderLoginPage } from '../netlify/functions/_lib/admin-html.mjs';

// Kiire räsi testideks (N = 1024); tootmises loob `npm run admin:hash` N = 32768.
const PASSWORD = 'õige parool ÄGE 2026';
const HASH = hashPassword(PASSWORD, { N: 1024 });
const SECRET = 'x'.repeat(40);
const PROD_ENV = { ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: SECRET };
const ORIGIN = 'https://age.example';

const silent = { log() {}, warn() {}, error() {} };

function req(path, { method = 'GET', headers = {}, body } = {}) {
  return new Request(`${ORIGIN}${path}`, { method, headers, body });
}

function loginReq(password, { origin = ORIGIN, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (origin) h.Origin = origin;
  return req('/api/admin/login', { method: 'POST', headers: h, body: JSON.stringify({ password }) });
}

/* ---------------------------------------------------------------------------
 * Parool
 * ------------------------------------------------------------------------- */

test('parool: scrypt-räsi vorming scrypt$N$r$p$sool$räsi ja kontroll', () => {
  assert.match(HASH, /^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(verifyPassword(PASSWORD, HASH), true);
  assert.equal(verifyPassword('vale parool', HASH), false);
  assert.equal(verifyPassword(PASSWORD.toUpperCase(), HASH), false);
  assert.equal(verifyPassword('', HASH), false);
  assert.equal(verifyPassword('x'.repeat(300), HASH), false, 'liiga pikk parool');
  // Unicode normaliseerimine: "Ä" kahe koodipunktina = sama parool
  assert.equal(verifyPassword(PASSWORD.normalize('NFD'), HASH), true);
});

test('parool: vigased või muudetud räsid lükatakse tagasi', () => {
  assert.equal(parsePasswordHash(''), null);
  assert.equal(parsePasswordHash('bcrypt$10$abc'), null);
  assert.equal(parsePasswordHash('scrypt$1000$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(44)), null, 'N peab olema 2 aste');
  assert.equal(parsePasswordHash('scrypt$1048576000$8$1$AAAA$AAAA'), null);
  const parts = HASH.split('$');
  const otherHash = Buffer.alloc(32, 7).toString('base64');
  assert.equal(verifyPassword(PASSWORD, [...parts.slice(0, 5), otherHash].join('$')), false);
  assert.equal(verifyPassword(PASSWORD, 'prügi'), false);
});

/* ---------------------------------------------------------------------------
 * Seadistus
 * ------------------------------------------------------------------------- */

test('seadistus: tootmises ainult räsiga; ADMIN_DEV_PASSWORD ainult kohalikus arenduses', () => {
  const none = authConfig({});
  assert.equal(none.enabled, false);
  assert.match(none.reason, /ADMIN_PASSWORD_HASH/);

  const noSecret = authConfig({ ADMIN_PASSWORD_HASH: HASH, ADMIN_SESSION_SECRET: 'lühike' });
  assert.equal(noSecret.enabled, false);
  assert.match(noSecret.reason, /ADMIN_SESSION_SECRET/);

  const bad = authConfig({ ADMIN_PASSWORD_HASH: 'scrypt$vale', ADMIN_SESSION_SECRET: SECRET });
  assert.equal(bad.enabled, false);
  assert.match(bad.reason, /vales vormingus/);

  assert.equal(authConfig(PROD_ENV).enabled, true);

  // Tootmises (pole NETLIFY_DEV) arendusparooli EI arvestata
  assert.equal(authConfig({ ADMIN_DEV_PASSWORD: 'demo-admin', ADMIN_SESSION_SECRET: SECRET }).enabled, false);
  // AWS Lambdas EI arvestata ka siis, kui NETLIFY_DEV kogemata seatud
  const lambda = authConfig({ NETLIFY_DEV: 'true', AWS_LAMBDA_FUNCTION_NAME: 'admin-login', ADMIN_DEV_PASSWORD: 'demo-admin' });
  assert.equal(lambda.enabled, false);
  assert.equal(checkPassword('demo-admin', lambda), false);

  // Kohalik arendus: lubatud ka ilma saladuseta (juhuslik protsessi saladus)
  const dev = authConfig({ NETLIFY_DEV: 'true', ADMIN_DEV_PASSWORD: 'demo-admin' });
  assert.equal(dev.enabled, true);
  assert.equal(dev.dev, true);
  assert.equal(checkPassword('demo-admin', dev), true);
  assert.equal(checkPassword('demo-admiN', dev), false);
});

/* ---------------------------------------------------------------------------
 * Seanss
 * ------------------------------------------------------------------------- */

test('seanss: allkirjastatud märk kehtib 12 h ja aegub', () => {
  const cfg = authConfig(PROD_ENV);
  const t0 = new Date('2026-10-19T10:00:00Z');
  const token = createSessionToken(cfg, { now: t0 });
  const data = verifySessionToken(token, cfg, { now: t0 });
  assert.ok(data);
  assert.equal(data.exp - data.iat, SESSION_TTL_SECONDS);
  assert.equal(SESSION_TTL_SECONDS, 12 * 3600);
  assert.ok(verifySessionToken(token, cfg, { now: new Date(t0.getTime() + 12 * 3600e3 - 1000) }));
  assert.equal(verifySessionToken(token, cfg, { now: new Date(t0.getTime() + 12 * 3600e3) }), null, 'aegunud');
  assert.equal(verifySessionToken(token, cfg, { now: new Date(t0.getTime() - 3600e3) }), null, 'iat tulevikus');
});

test('seanss: võltsitud sisu, allkiri või teine saladus → kehtetu', () => {
  const cfg = authConfig(PROD_ENV);
  const now = new Date('2026-10-19T10:00:00Z');
  const token = createSessionToken(cfg, { now });
  const [payload, sig] = token.split('.');

  // Pikendatud aegumine ilma uue allkirjata
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const forged = Buffer.from(JSON.stringify({ ...data, exp: data.exp + 86400 })).toString('base64url');
  assert.equal(verifySessionToken(`${forged}.${sig}`, cfg, { now }), null);

  // Muudetud allkiri
  const flipped = sig.slice(0, -2) + (sig.at(-2) === 'A' ? 'B' : 'A') + sig.at(-1);
  assert.equal(verifySessionToken(`${payload}.${flipped}`, cfg, { now }), null);

  // Prügi
  for (const t of ['', '.', 'abc', `${payload}.`, `.${sig}`, `${payload}.${sig}.x`, 'a'.repeat(2000)]) assert.equal(verifySessionToken(t, cfg, { now }), null, t);

  // Teise saladusega allkirjastatud märk ei kehti
  const other = authConfig({ ...PROD_ENV, ADMIN_SESSION_SECRET: 'y'.repeat(40) });
  assert.equal(verifySessionToken(createSessionToken(other, { now }), cfg, { now }), null);

  // Parooli vahetus (uus räsi) tühistab vanad seansid
  const newPw = authConfig({ ...PROD_ENV, ADMIN_PASSWORD_HASH: hashPassword('uus parool 12345', { N: 1024 }) });
  assert.equal(verifySessionToken(token, newPw, { now }), null);

  // Õige allkirjaga, aga liiga pikk kehtivus (nt vana vorming) — keeldutakse
  const long = createSessionToken(cfg, { now, ttlSeconds: SESSION_TTL_SECONDS * 2 });
  assert.equal(verifySessionToken(long, cfg, { now }), null);
});

test('küpsis: HttpOnly, SameSite=Strict, Path=/, Max-Age 12 h; Secure https-il, mitte localhostis', () => {
  const https = sessionCookie(req('/'), 'abc.def');
  assert.match(https, /^age_admin=abc\.def; /);
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) assert.ok(https.includes(part), part);
  const local = sessionCookie(new Request('http://localhost:8080/admin', { headers: { host: 'localhost:8080' } }), 'abc.def');
  assert.ok(!local.includes('Secure'));
  assert.ok(local.includes('HttpOnly') && local.includes('SameSite=Strict'));
  const cleared = clearSessionCookie(req('/'));
  assert.match(cleared, /^age_admin=; /);
  assert.ok(cleared.includes('Max-Age=0'));
});

/* ---------------------------------------------------------------------------
 * CSRF ja valvur
 * ------------------------------------------------------------------------- */

test('CSRF: Origin peab vastama hostile (Referer varuna)', () => {
  const r = (headers) => req('/api/admin/orders/AGE-1001', { method: 'PATCH', headers });
  assert.equal(isSameOrigin(r({ Origin: ORIGIN })), true);
  assert.equal(isSameOrigin(r({ Origin: 'https://evil.example' })), false);
  assert.equal(isSameOrigin(r({ Origin: 'https://age.example.evil.example' })), false);
  assert.equal(isSameOrigin(r({ Origin: 'null' })), false);
  assert.equal(isSameOrigin(r({})), false, 'päritoluta muutev päring keelatakse');
  assert.equal(isSameOrigin(r({ Referer: `${ORIGIN}/admin/tellimused` })), true);
  assert.equal(isSameOrigin(r({ Referer: 'https://evil.example/age.example' })), false);
  assert.equal(isSameOrigin(r({ Origin: 'javascript:alert(1)' })), false);
});

test('requireAdmin: 401 ilma seansita, 403 võõra päritoluga muutval päringul', async () => {
  const cfg = authConfig(PROD_ENV);
  const cookie = `age_admin=${createSessionToken(cfg)}`;
  const none = requireAdmin(req('/api/admin/orders'), { env: PROD_ENV });
  assert.equal(none.ok, false);
  assert.equal(none.response.status, 401);
  assert.match(none.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(requireAdmin(req('/api/admin/orders', { headers: { cookie } }), { env: PROD_ENV }).ok, true);
  const csrf = requireAdmin(req('/api/admin/orders/AGE-1', { method: 'PATCH', headers: { cookie, Origin: 'https://evil.example' } }), { env: PROD_ENV });
  assert.equal(csrf.response.status, 403);
  assert.equal(requireAdmin(req('/api/admin/orders/AGE-1', { method: 'PATCH', headers: { cookie, Origin: ORIGIN } }), { env: PROD_ENV }).ok, true);
});

/* ---------------------------------------------------------------------------
 * Sisselogimine
 * ------------------------------------------------------------------------- */

function loginHandler(env = PROD_ENV, extra = {}) {
  const delays = [];
  const handler = createLoginHandler({ env, logger: silent, delay: async (ms) => delays.push(ms), ...extra });
  return { handler, delays };
}

test('sisselogimine: õige parool → küpsis; vale → 401 + viivitus', async () => {
  const { handler, delays } = loginHandler();
  const bad = await handler(loginReq('vale parool'), { ip: '1.1.1.1' });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).error, 'Vale parool.');
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.equal(delays.length, 1);
  assert.ok(delays[0] >= 400, 'vale parooli korral on viivitus');

  const ok = await handler(loginReq(PASSWORD), { ip: '1.1.1.1' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  const setCookie = ok.headers.get('set-cookie');
  assert.match(setCookie, /^age_admin=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=43200$/);
  const token = setCookie.split(';')[0].split('=')[1];
  assert.ok(verifySessionToken(token, authConfig(PROD_ENV)));
  assert.equal(ok.headers.get('cache-control'), 'no-store, private');
});

test('sisselogimine: päritolu, JSON ja meetod kontrollitakse', async () => {
  const { handler } = loginHandler();
  assert.equal((await handler(loginReq(PASSWORD, { origin: null }), {})).status, 403);
  assert.equal((await handler(loginReq(PASSWORD, { origin: 'https://evil.example' }), {})).status, 403);
  assert.equal((await handler(req('/api/admin/login'), {})).status, 405);
  const form = req('/api/admin/login', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=x' });
  assert.equal((await handler(form, {})).status, 415);
  assert.equal((await handler(loginReq(''), {})).status, 400);
  assert.equal((await handler(loginReq('x'.repeat(300)), {})).status, 400);
});

test('sisselogimine: liiga palju valesid katseid → 429 (ka õige parooliga), teine IP ei kannata', async () => {
  const { handler } = loginHandler(PROD_ENV, { limiter: createLoginLimiter({ maxFailures: 3, windowMs: 60_000 }) });
  for (let i = 0; i < 3; i++) assert.equal((await handler(loginReq('vale'), { ip: '9.9.9.9' })).status, 401);
  const blocked = await handler(loginReq(PASSWORD), { ip: '9.9.9.9' });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await handler(loginReq(PASSWORD), { ip: '8.8.8.8' })).status, 200);
});

test('sisselogimine: seadistamata → 503 selge põhjusega; arenduses ADMIN_DEV_PASSWORD töötab', async () => {
  const { handler } = loginHandler({});
  const res = await handler(loginReq('demo-admin'), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /ADMIN_PASSWORD_HASH/);

  const dev = loginHandler({ NETLIFY_DEV: 'true', ADMIN_DEV_PASSWORD: 'demo-admin' }).handler;
  const local = new Request('http://localhost:8888/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8888', host: 'localhost:8888' },
    body: JSON.stringify({ password: 'demo-admin' }),
  });
  const ok = await dev(local, {});
  assert.equal(ok.status, 200);
  assert.ok(!ok.headers.get('set-cookie').includes('Secure'), 'localhost http → ilma Secure-ta');
});

/* ---------------------------------------------------------------------------
 * /admin leht
 * ------------------------------------------------------------------------- */

test('/admin: sisselogimata näeb ainult sisselogimisvormi (rakendust ega andmeid mitte)', async () => {
  const page = createPageHandler({ env: PROD_ENV });
  for (const path of ['/admin', '/admin/tellimused', '/admin/tellimused/AGE-1001']) {
    const res = await page(req(path));
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('id="login-form"'), path);
    assert.ok(html.includes('/assets/admin/login.js'));
    assert.ok(!html.includes('/assets/admin/admin.js'), 'rakenduse JS-i ei laeta');
    assert.ok(!html.includes('data-nav'), 'navigatsiooni pole');
    assert.ok(!/AGE-\d/.test(html.replace(path, '')), 'andmeid pole');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('x-robots-tag'), /noindex/);
    assert.match(res.headers.get('cache-control'), /no-store/);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.ok(!csp.includes('unsafe-inline') || !/script-src[^;]*unsafe-inline/.test(csp));
  }
});

test('/admin: kehtiva seansiga rakenduse kest; aegunud/võltsitud küpsisega sisselogimisleht', async () => {
  const cfg = authConfig(PROD_ENV);
  const page = createPageHandler({ env: PROD_ENV });
  const cookie = `age_admin=${createSessionToken(cfg)}`;
  const html = await (await page(req('/admin/pakkimine', { headers: { cookie } }))).text();
  assert.ok(html.includes('/assets/admin/admin.js'));
  assert.ok(html.includes('data-logout'));
  assert.ok(!html.includes('login-form'));

  const expired = `age_admin=${createSessionToken(cfg, { now: new Date(Date.now() - 13 * 3600e3) })}`;
  assert.ok((await (await page(req('/admin', { headers: { cookie: expired } }))).text()).includes('login-form'));
  assert.ok((await (await page(req('/admin', { headers: { cookie: 'age_admin=võlts.küpsis' } }))).text()).includes('login-form'));
  assert.equal((await page(req('/admin', { method: 'POST' }))).status, 405);
});

test('/admin: seadistamata — vorm lukus ja põhjus paotatud', async () => {
  const html = await (await createPageHandler({ env: {} })(req('/admin'))).text();
  assert.match(html, /Sisselogimine on välja lülitatud/);
  assert.match(html, /type="password"[^>]*disabled/);
  const escaped = renderLoginPage({ reason: '<img src=x onerror=alert(1)>' });
  assert.ok(!escaped.includes('<img src=x'));
  assert.ok(escaped.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
