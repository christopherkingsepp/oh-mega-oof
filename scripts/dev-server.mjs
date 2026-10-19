#!/usr/bin/env node
// Kohalik arendusserver (ilma Netlify CLI-ta). Serveerib kausta public/ nagu Netlify
// ("ilusad" URL-id) ja käivitab serverifunktsioonid kaustast netlify/functions.
//
//   npm run dev        -> http://localhost:8080  (päris Stripe/Resend, kui võtmed on .env-is)
//   npm run dev:mock   -> sama, aga Stripe, e-post ja pakiautomaatide allikad on näidisrežiimis:
//                         makse käib kohaliku "test-Stripe'i" lehe kaudu ja webhook tuleb päriselt
//                         allkirjastatuna /api/stripe-webhook'i. Andmebaas on alati päris (PGlite,
//                         kaust .data/pglite), seega tellimused ja halduspaneel töötavad päriselt.
//
// Funktsioonide aadressid loetakse iga funktsiooni `export const config = { path }` väljast
// (string või massiiv; toetab ka mustreid nagu '/api/admin/orders/:number' ja '/admin/*').
import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = join(ROOT, 'public'); // veebilehe failid (sama mis netlify.toml publish)
const FUNCTIONS = join(ROOT, 'netlify/functions');
const PORT = Number(process.env.PORT || 8080);
const MOCK = process.env.MOCK_API === '1' || process.argv.includes('--mock');

// .env fail (kui on) -> process.env (olemasolevaid muutujaid ei kirjutata üle)
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.env.NETLIFY_DEV = 'true';
process.env.SITE_URL ||= `http://localhost:${PORT}`;
process.env.PGLITE_DIR ||= join(ROOT, '.data/pglite');
if (MOCK) {
  process.env.MOCK_STRIPE ||= '1';
  process.env.MOCK_MAIL ||= '1';
  process.env.MOCK_LOCKERS ||= '1';
  process.env.ADMIN_DEV_PASSWORD ||= 'demo-admin';
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.csv': 'text/csv; charset=utf-8',
};

/* ---------- Funktsioonide marsruudid ---------- */
let routes = null; // [{ re, keys, path, file, name }]

/** Netlify path-muster -> RegExp: '/api/x/:id' ja '/admin/*' (URLPattern'i lihtne alamhulk). */
function compilePath(p) {
  const keys = [];
  const re = p
    .split('/')
    .map((seg) => {
      if (seg === '*') return '(?:/.*)?';
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '/([^/]+)';
      }
      return seg ? '/' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&') : '';
    })
    .join('');
  return { re: new RegExp(`^${re || '/'}/?$`), keys };
}

async function loadRoutes() {
  const list = [];
  for (const name of await readdir(FUNCTIONS)) {
    if (!/\.m?js$/.test(name)) continue;
    const file = join(FUNCTIONS, name);
    const mod = await import(pathToFileURL(file).href);
    const paths = [].concat(mod.config?.path || []);
    for (const p of paths) list.push({ ...compilePath(p), path: p, file, name });
  }
  // täpsemad (ilma metamärkideta) enne mustreid
  list.sort((a, b) => Number(/[:*]/.test(a.path)) - Number(/[:*]/.test(b.path)));
  return list;
}

function matchRoute(url) {
  for (const r of routes) {
    const m = r.re.exec(url.pathname);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function send(res, status, body, headers = {}) {
  const h = { 'cache-control': 'no-store' };
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  res.writeHead(status, h);
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function handleFunction(req, res, url, { route, params }) {
  const mod = await import(pathToFileURL(route.file).href);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers, body });
  const context = {
    params,
    site: { url: `http://localhost:${PORT}` },
    ip: req.socket.remoteAddress,
    cookies: undefined,
  };
  try {
    const response = await mod.default(request, context);
    const out = {};
    response.headers.forEach((v, k) => {
      if (k === 'set-cookie') return;
      out[k] = v;
    });
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length) out['set-cookie'] = cookies;
    const h = { 'cache-control': 'no-store', ...out };
    res.writeHead(response.status, h);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(`[${route.name}]`, err);
    send(res, 500, JSON.stringify({ error: String(err?.message || err) }), { 'Content-Type': 'application/json' });
  }
}

/* ---------- Staatilised failid ---------- */
async function tryFile(p) {
  try {
    const s = await stat(p);
    return s.isFile() ? p : null;
  } catch {
    return null;
  }
}

async function handleStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);
  const safe = normalize(join(PUBLIC, pathname));
  if (!safe.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  // "Ilusad" URL-id nagu Netlifys: /mida-viiu -> mida-viiu.html, / -> index.html
  const candidates = pathname.endsWith('/') ? [join(safe, 'index.html')] : [safe, `${safe}.html`, join(safe, 'index.html')];
  let file = null;
  for (const c of candidates) if ((file = await tryFile(c))) break;
  if (!file) {
    const nf = await tryFile(join(PUBLIC, '404.html'));
    return send(res, 404, nf ? await readFile(nf) : 'Not found', { 'Content-Type': 'text/html; charset=utf-8' });
  }
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  send(res, 200, await readFile(file), { 'Content-Type': type });
}

routes = await loadRoutes();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      // Netlify Forms'i AJAX-postitus: kohalikult lihtsalt kinnitame.
      if (req.method === 'POST' && url.pathname === '/') {
        const body = (await readBody(req)).toString();
        console.log('[form]', body);
        return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
      }
      const hit = matchRoute(url);
      if (hit) return await handleFunction(req, res, url, hit);
      if (url.pathname.startsWith('/api/')) return send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json' });
      return await handleStatic(req, res, url);
    } catch (err) {
      console.error(err);
      send(res, 500, 'Server error');
    }
  })
  .listen(PORT, () => {
    console.log(`ÄGE dev server: http://localhost:${PORT}${MOCK ? '  (näidisrežiim: Stripe, e-post ja pakiautomaadid on mock)' : ''}`);
    for (const r of routes) console.log(`  ${r.path.padEnd(34)} → netlify/functions/${r.name}`);
  });
