#!/usr/bin/env node
// Lihtne kohalik arendusserver (ilma Netlify CLI-ta).
//   node scripts/dev-server.mjs            -> http://localhost:8080
//   node scripts/dev-server.mjs --mock    -> /api/* vastused on näidisandmed (ei vaja Stripe'i ega internetti)
//
// Ilma MOCK_API-ta kutsub server päris funktsioone kaustast netlify/functions
// (selleks peab STRIPE_SECRET_KEY olema keskkonnas seatud).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = join(ROOT, 'public'); // veebilehe failid (sama mis netlify.toml publish)
const PORT = Number(process.env.PORT || 8080);
const MOCK = process.env.MOCK_API === '1' || process.argv.includes('--mock');

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
};

// /api/<nimi> -> netlify/functions/<fail>.mjs (vt netlify.toml redirectid)
const API_ROUTES = {
  '/api/checkout': 'create-checkout.mjs',
  '/api/pakiautomaadid': 'parcel-lockers.mjs',
};

const MOCK_LOCKERS = {
  omniva: [
    { id: '96331', name: 'Tallinna Kristiine keskuse pakiautomaat', city: 'Tallinn', address: 'Endla 45' },
    { id: '96085', name: 'Tallinna Ülemiste keskuse pakiautomaat', city: 'Tallinn', address: 'Suur-Sõjamäe 4' },
    { id: '96051', name: 'Tartu Lõunakeskuse pakiautomaat', city: 'Tartu', address: 'Ringtee 75' },
    { id: '96231', name: 'Pärnu Kaubamajaka pakiautomaat', city: 'Pärnu', address: 'Papiniidu 8' },
    { id: '96301', name: 'Mustamäe Magistrali keskuse pakiautomaat', city: 'Tallinn', address: 'Sõpruse pst 201' },
  ],
  smartpost: [
    { id: '101', name: 'Tallinn Rocca al Mare Prisma', city: 'Tallinn', address: 'Paldiski mnt 102' },
    { id: '102', name: 'Tallinn Mustika Prisma', city: 'Tallinn', address: 'Tammsaare tee 116' },
    { id: '103', name: 'Tartu Annelinna Prisma', city: 'Tartu', address: 'Nõlvaku 2' },
  ],
  dpd: [],
};

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

async function handleApi(req, res, url) {
  const route = API_ROUTES[url.pathname];
  if (!route) return send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json' });

  if (MOCK) {
    if (url.pathname === '/api/pakiautomaadid') {
      const carrier = url.searchParams.get('carrier') || 'omniva';
      const list = MOCK_LOCKERS[carrier];
      if (!list) return send(res, 400, JSON.stringify({ error: 'Tundmatu vedaja' }), { 'Content-Type': 'application/json' });
      const payload = list.length ? { carrier, lockers: list } : { carrier, lockers: [], manual: true };
      return send(res, 200, JSON.stringify(payload), { 'Content-Type': 'application/json' });
    }
    if (url.pathname === '/api/checkout') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      console.log('[MOCK checkout]', JSON.stringify(body));
      return send(res, 200, JSON.stringify({ url: '/aitah?session_id=cs_test_MOCK' }), { 'Content-Type': 'application/json' });
    }
  }

  // Päris funktsioon: ehita Web Request ja kutsu default export'i.
  const mod = await import(pathToFileURL(join(ROOT, 'netlify/functions', route)).href);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body });
  try {
    const response = await mod.default(request, { site: { url: `http://localhost:${PORT}` } });
    const headers = Object.fromEntries(response.headers.entries());
    send(res, response.status, Buffer.from(await response.arrayBuffer()), headers);
  } catch (err) {
    console.error(err);
    send(res, 500, JSON.stringify({ error: String(err?.message || err) }), { 'Content-Type': 'application/json' });
  }
}

async function tryFile(p) {
  try {
    const s = await stat(p);
    return s.isFile() ? p : null;
  } catch {
    return null;
  }
}

async function handleStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
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
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return await handleStatic(req, res, url);
    } catch (err) {
      console.error(err);
      send(res, 500, 'Server error');
    }
  })
  .listen(PORT, () => {
    console.log(`ÄGE dev server: http://localhost:${PORT}${MOCK ? '  (MOCK_API=1)' : ''}`);
  });
