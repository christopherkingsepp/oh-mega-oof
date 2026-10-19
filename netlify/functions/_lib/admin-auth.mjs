// Halduspaneeli autentimine: parool (scrypt), allkirjastatud seansiküpsis ja CSRF-kaitse.
//
// PAROOL: üks omaniku parool. Keskkonnamuutujas ADMIN_PASSWORD_HASH on ainult räsi kujul
//   scrypt$N$r$p$saltBase64$hashBase64   (loo: npm run admin:hash)
// Kontroll: scrypt(sisestatud parool, sool) ja timingSafeEqual — konstantse ajaga võrdlus.
//
// SEANSS: küpsis `age_admin` = base64url(JSON {v, iat, exp, sid}) + "." + base64url(HMAC-SHA256).
//   • HttpOnly (JS ei näe), SameSite=Strict (teiselt saidilt ei saadeta), Path=/, Max-Age 12 h,
//     Secure alati, v.a kohalik http://localhost.
//   • Allkirja võti tuletatakse ADMIN_SESSION_SECRET-ist JA parooli räsist — kui omanik vahetab
//     parooli (uus räsi) või saladuse, kaotavad kõik vanad seansid kehtivuse.
//   • Seanss on olekuta (andmebaasi pole vaja). Väljalogimine kustutab küpsise brauserist.
//
// KOHALIK ARENDUS: kui NETLIFY_DEV=true ja kood EI jookse AWS Lambdas, on lubatud ka
// ADMIN_DEV_PASSWORD (npm run dev:mock seab 'demo-admin'). Tootmises (Lambda) ainult räsiga.
//
// CSRF: muutvad päringud (POST/PATCH/PUT/DELETE) peavad tulema samalt aadressilt — Origin
// (või selle puudumisel Referer) peab vastama päringu hostile. Lisaks SameSite=Strict küpsis.
import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { json } from './http.mjs';

export const COOKIE_NAME = 'age_admin';
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 tundi
export const MIN_SECRET_LENGTH = 32;
export const MAX_PASSWORD_LENGTH = 256;

// Uue räsi vaikeparameetrid: N = 2^15, r = 8, p = 1 (~32 MiB mälu, ~0,1 s) — piisavalt aeglane
// arvamise vastu, aga mahub serverifunktsiooni mällu.
export const SCRYPT_DEFAULTS = { N: 32768, r: 8, p: 1, keyLength: 32, saltLength: 16 };

const isLocalHost = (host) => /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(String(host || ''));

/* ---------------------------------------------------------------------------
 * Parooli räsi (scrypt)
 * ------------------------------------------------------------------------- */

function scryptMaxmem(N, r) {
  return 128 * N * r * 2 + 1024 * 1024;
}

/** Loob uue räsi kujul scrypt$N$r$p$salt$hash (base64). */
export function hashPassword(password, { N = SCRYPT_DEFAULTS.N, r = SCRYPT_DEFAULTS.r, p = SCRYPT_DEFAULTS.p, salt = null } = {}) {
  if (typeof password !== 'string' || !password) throw new TypeError('Parool puudub');
  const s = salt || randomBytes(SCRYPT_DEFAULTS.saltLength);
  const hash = scryptSync(password.normalize('NFC'), s, SCRYPT_DEFAULTS.keyLength, { N, r, p, maxmem: scryptMaxmem(N, r) });
  return `scrypt$${N}$${r}$${p}$${s.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Loeb räsi lahti. Tagastab { N, r, p, salt, hash } või null, kui vorming on vale või
 * parameetrid ebamõistlikud (kaitse kogemata valesti kopeeritud väärtuse vastu).
 */
export function parsePasswordHash(value) {
  const parts = String(value || '').trim().split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map((x) => (/^\d{1,8}$/.test(x) ? Number(x) : NaN));
  if (!Number.isInteger(N) || N < 1024 || N > 2 ** 20 || (N & (N - 1)) !== 0) return null; // 2 aste
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return null;
  if (128 * N * r > 512 * 1024 * 1024) return null;
  const b64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
  if (!b64.test(parts[4]) || !b64.test(parts[5])) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || hash.length < 16 || hash.length > 128) return null;
  return { N, r, p, salt, hash };
}

/** Kas parool vastab räsile? (konstantse ajaga võrdlus) */
export function verifyPassword(password, storedHash) {
  const parsed = typeof storedHash === 'string' ? parsePasswordHash(storedHash) : storedHash;
  if (!parsed || typeof password !== 'string' || !password || password.length > MAX_PASSWORD_LENGTH) return false;
  let candidate;
  try {
    candidate = scryptSync(password.normalize('NFC'), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: scryptMaxmem(parsed.N, parsed.r),
    });
  } catch {
    return false;
  }
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

/** Lihtparooli (arendus) konstantse ajaga võrdlus: võrdleme SHA-256 räsisid (sama pikkus). */
function equalsConstantTime(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/* ---------------------------------------------------------------------------
 * Seadistus
 * ------------------------------------------------------------------------- */

/** Kohalik arendus = NETLIFY_DEV=true ja MITTE AWS Lambda. */
export function isLocalDev(env = process.env) {
  return String(env.NETLIFY_DEV || '').toLowerCase() === 'true' && !env.AWS_LAMBDA_FUNCTION_NAME;
}

// Arenduses ilma ADMIN_SESSION_SECRET-ita: juhuslik saladus protsessi eluajaks
// (serveri taaskäivitus logib välja — see on arenduses okei).
let devSecret = null;
const getDevSecret = () => (devSecret ||= randomBytes(32).toString('base64url'));

/**
 * Halduse sisselogimise seadistus keskkonnamuutujatest.
 * @returns {{enabled:boolean, reason:string, hash:object|null, devPassword:string, secret:string, dev:boolean}}
 */
export function authConfig(env = process.env) {
  const dev = isLocalDev(env);
  const rawHash = String(env.ADMIN_PASSWORD_HASH || '').trim();
  const hash = rawHash ? parsePasswordHash(rawHash) : null;
  const devPassword = dev ? String(env.ADMIN_DEV_PASSWORD || '') : '';
  let secret = String(env.ADMIN_SESSION_SECRET || '').trim();
  const out = { enabled: false, reason: '', hash, hashRaw: hash ? rawHash : '', devPassword, secret: '', dev };

  if (rawHash && !hash) {
    out.reason = 'ADMIN_PASSWORD_HASH on vales vormingus. Loo uus räsi käsuga „npm run admin:hash“ ja kopeeri see täpselt (kujul scrypt$…).';
    if (!devPassword) return out;
  }
  if (!hash && !devPassword) {
    out.reason = 'Halduspaneeli parool on seadistamata (ADMIN_PASSWORD_HASH puudub). Loo räsi käsuga „npm run admin:hash“ ja lisa see Netlify keskkonnamuutujatesse.';
    return out;
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    if (dev) secret = getDevSecret();
    else {
      out.reason = `ADMIN_SESSION_SECRET puudub või on lühem kui ${MIN_SECRET_LENGTH} märki. Lisa Netlify keskkonnamuutujatesse pikk juhuslik saladus (vt „npm run admin:hash“ väljundit).`;
      return out;
    }
  }
  out.secret = secret;
  out.enabled = true;
  out.reason = '';
  return out;
}

/** Kontrollib parooli seadistuse vastu (räsi ja arenduses ka ADMIN_DEV_PASSWORD). */
export function checkPassword(password, cfg) {
  if (!cfg?.enabled || typeof password !== 'string' || !password || password.length > MAX_PASSWORD_LENGTH) return false;
  // Arvutame mõlemad kontrollid alati (kui seadistatud), et vastuse aeg ei sõltuks sellest, kumb sobis.
  const byHash = cfg.hash ? verifyPassword(password, cfg.hash) : false;
  const byDev = cfg.devPassword ? equalsConstantTime(password, cfg.devPassword) : false;
  return byHash || byDev;
}

/* ---------------------------------------------------------------------------
 * Seansi märk (token)
 * ------------------------------------------------------------------------- */

/** Allkirja võti: saladus + parooli räsi sõrmejälg (parooli vahetus tühistab vanad seansid). */
function signingKey(cfg) {
  const material = `${cfg.hashRaw || ''}|${cfg.devPassword ? createHash('sha256').update(cfg.devPassword).digest('base64') : ''}`;
  return createHmac('sha256', cfg.secret).update(`age_admin:v1:${material}`).digest();
}

const sign = (key, payload) => createHmac('sha256', key).update(payload).digest('base64url');

/** Uus seansi märk. */
export function createSessionToken(cfg, { now = new Date(), ttlSeconds = SESSION_TTL_SECONDS } = {}) {
  if (!cfg?.enabled) throw new Error('Halduse sisselogimine pole seadistatud');
  const iat = Math.floor(now.getTime() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, iat, exp: iat + ttlSeconds, sid: randomBytes(12).toString('base64url') })).toString('base64url');
  return `${payload}.${sign(signingKey(cfg), payload)}`;
}

/**
 * Kontrollib märki: allkiri (konstantse ajaga), vorming ja aegumine.
 * @returns {{v:number, iat:number, exp:number, sid:string}|null}
 */
export function verifySessionToken(token, cfg, { now = new Date() } = {}) {
  if (!cfg?.enabled || typeof token !== 'string' || token.length > 1024) return null;
  const dot = token.indexOf('.');
  if (dot < 1 || dot !== token.lastIndexOf('.')) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
  const expected = Buffer.from(sign(signingKey(cfg), payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const t = Math.floor(now.getTime() / 1000);
  if (!data || data.v !== 1 || !Number.isInteger(data.exp) || !Number.isInteger(data.iat)) return null;
  if (data.exp <= t || data.iat > t + 60 || data.exp - data.iat > SESSION_TTL_SECONDS) return null;
  return data;
}

/* ---------------------------------------------------------------------------
 * Küpsised
 * ------------------------------------------------------------------------- */

/** Loeb Cookie-päisest ühe küpsise väärtuse. */
export function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** Kas ühendus on HTTPS (Secure-küpsis)? Kohalik http://localhost on erand. */
export function isSecureRequest(req) {
  const url = new URL(req.url);
  const proto = (req.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (url.protocol === 'https:' || proto === 'https') return true;
  const host = req.headers.get('host') || url.host;
  return !(isLocalHost(host) || isLocalHost(url.host));
}

function cookieAttrs(req, maxAge) {
  return ['HttpOnly', isSecureRequest(req) ? 'Secure' : null, 'SameSite=Strict', 'Path=/', `Max-Age=${maxAge}`].filter(Boolean).join('; ');
}

export function sessionCookie(req, token) {
  return `${COOKIE_NAME}=${token}; ${cookieAttrs(req, SESSION_TTL_SECONDS)}`;
}

export function clearSessionCookie(req) {
  return `${COOKIE_NAME}=; ${cookieAttrs(req, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Kehtiv seanss päringust või null. */
export function getSession(req, { env = process.env, now = new Date(), cfg = authConfig(env) } = {}) {
  const token = readCookie(req);
  return token ? verifySessionToken(token, cfg, { now }) : null;
}

/* ---------------------------------------------------------------------------
 * CSRF (Origin/Host) ja ligipääsukontroll
 * ------------------------------------------------------------------------- */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Päringu enda hostid (URL ja Host-päis), väikeste tähtedega. */
function requestHosts(req) {
  const hosts = new Set();
  try {
    hosts.add(new URL(req.url).host.toLowerCase());
  } catch {
    /* ignore */
  }
  for (const h of [req.headers.get('host'), req.headers.get('x-forwarded-host')]) {
    for (const part of String(h || '').split(',')) if (part.trim()) hosts.add(part.trim().toLowerCase());
  }
  return hosts;
}

/**
 * Kas muutev päring tuleb samalt saidilt? Origin peab vastama päringu hostile; kui Origin puudub
 * (vanemad brauserid), siis Referer. Kui mõlemad puuduvad, keelame (halduse JS saadab alati Origin'i).
 */
export function isSameOrigin(req) {
  const hosts = requestHosts(req);
  const origin = req.headers.get('origin');
  const source = origin && origin !== 'null' ? origin : req.headers.get('referer');
  if (!source) return false;
  try {
    const u = new URL(source);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return hosts.has(u.host.toLowerCase());
  } catch {
    return false;
  }
}

export const MSG_UNAUTHORIZED = 'Sisselogimine on vajalik. Logi halduspaneeli uuesti sisse.';
export const MSG_CSRF = 'Päring keelati turvakaalutlustel (vale päritolu). Ava halduspaneel otse ja proovi uuesti.';

/** Halduse vastuste turvapäised (JSON). */
export const ADMIN_API_HEADERS = {
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

export function unauthorized(req) {
  return json(401, { error: MSG_UNAUTHORIZED, code: 'UNAUTHORIZED' }, { ...ADMIN_API_HEADERS, 'Set-Cookie': clearSessionCookie(req) });
}

/**
 * Halduse API valvur. Kontrollib serveris seanssi (401) ja muutvatel päringutel päritolu (403).
 * @returns {{ok:true, session:object, cfg:object} | {ok:false, response:Response}}
 */
export function requireAdmin(req, { env = process.env, now = new Date(), cfg = authConfig(env) } = {}) {
  const session = getSession(req, { env, now, cfg });
  if (!session) return { ok: false, response: unauthorized(req) };
  if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return { ok: false, response: json(403, { error: MSG_CSRF, code: 'CSRF' }, ADMIN_API_HEADERS) };
  }
  return { ok: true, session, cfg };
}

/* ---------------------------------------------------------------------------
 * Sisselogimise piiraja (lisaks Netlify rateLimit'ile): ebaõnnestunud katsed IP kaupa
 * selle serveri eksemplari mälus. Kaitseb ka kohalikus arenduses ja kui Netlify piirang
 * mingil põhjusel ei rakendu.
 * ------------------------------------------------------------------------- */

export function createLoginLimiter({ maxFailures = 10, windowMs = 15 * 60 * 1000, maxKeys = 5000 } = {}) {
  const failures = new Map(); // ip -> [ajatemplid]
  const prune = (list, now) => list.filter((t) => now - t < windowMs);
  return {
    /** Kas sellelt IP-lt on praegu lubatud proovida? Tagastab { allowed, retryAfterSeconds }. */
    check(ip, now = Date.now()) {
      const list = prune(failures.get(ip) || [], now);
      if (list.length) failures.set(ip, list);
      else failures.delete(ip);
      if (list.length < maxFailures) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) };
    },
    fail(ip, now = Date.now()) {
      if (!failures.has(ip) && failures.size >= maxKeys) failures.delete(failures.keys().next().value);
      failures.set(ip, [...prune(failures.get(ip) || [], now), now]);
    },
    reset(ip) {
      failures.delete(ip);
    },
  };
}

/** Kliendi IP (Netlify context.ip või päis). */
export function clientIp(req, context) {
  return (
    context?.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'tundmatu'
  );
}
