// Staatilised tootepildid: box3d.js karbid renderdatakse Playwrightiga läbipaistval taustal
// 3/4 nurgast (esikülg + parem külg + natuke ülaklappi).
//
// Kasutus (repo juurkaustast):
//   node scripts/assets/render-boxes.mjs [--out public/assets/img/games] [--work /tmp/kaust] [--only <stseeni nimi>]
//   (stseenid: mida-viiu-box, oled-semu-box, vigur-box, komplekt-semu-vigur, komplekt-koik, <id>-cover)
//
// Väljund (ruudukujulised, läbipaistva taustaga WebP-d — ühtsed pildid kataloogi, ostukorvi,
// sahtli, kassa kokkuvõtte, toasti ja tootekaartide jaoks):
//   <id>-box.webp (900x900) ja <id>-box-sm.webp (240x240) — mida-viiu, oled-semu, vigur
//   komplekt-semu-vigur.webp / -sm.webp (2 karpi), komplekt-koik.webp / -sm.webp (3 karpi)
//   + iga eelneva .png (480x480, alfaga) — Stripe Checkouti ja e-kirjade jaoks (WebP-d kõik ei toeta)
//   <id>-cover.webp (1600x900) — 16:9 kaanepilt (karp eest + tagant brändi taustal), og:image jaoks
//
// Nõuded: playwright (devDependency) ja python3 + Pillow (PNG -> WebP koos alfaga).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(ROOT, 'public');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = path.resolve(opt('--out', path.join(PUBLIC, 'assets/img/games')));
const WORK = path.resolve(opt('--work', fs.mkdtempSync(path.join(os.tmpdir(), 'age-render-'))));
fs.mkdirSync(WORK, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };

// Lehekülg, mis paneb karbid „lavale“ ja sobitab need etteantud kaadrisse.
const STAGE_HTML = `<!doctype html><html lang="et"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/box3d.css">
<style>
  html,body{margin:0;background:transparent}
  #stage{position:relative;overflow:hidden}
  #stage.bg-semu{background:radial-gradient(90% 120% at 30% 20%,#b9a4ff 0%,#5a48c9 55%,#1b1452 100%)}
  #stage.bg-vigur{background:radial-gradient(90% 120% at 30% 20%,#ff6fa6 0%,#d1124f 55%,#4a0620 100%)}
  #stage.bg-mida{background:radial-gradient(70% 90% at 22% 25%,rgba(255,47,168,.55),transparent 60%),radial-gradient(60% 80% at 85% 85%,rgba(255,47,168,.45),transparent 60%),#070006}
  #fit{position:absolute;left:0;top:0;transform-origin:0 0}
  #row{display:flex;align-items:flex-end}
  .slot{position:relative;flex:none}
  /* box3d enda vari jääb hõljuva karbi alla liiga kaugele -> peidame selle ja joonistame
     igale karbile kontaktvarju tema projitseeritud põhja järgi (vt renderScene) */
  .box3d__shadow{display:none}
  .cshadow{position:absolute;pointer-events:none;border-radius:50%;
    background:radial-gradient(closest-side,rgba(0,0,0,.5),rgba(0,0,0,.22) 55%,rgba(0,0,0,0));filter:blur(6px)}
</style></head><body><div id="stage"><div id="fit"><div id="row"></div></div></div>
<script type="module">
  import { mountBox, BOX_FACES, BOX_DIMS } from '/assets/js/box3d.js';
  window.renderScene = async ({ w, h, boxes, pad = 0.06, bg = '' }) => {
    const stage = document.getElementById('stage');
    stage.className = bg;
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    const row = document.getElementById('row');
    row.innerHTML = '';
    for (const b of boxes) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.style.marginLeft = (b.ml || 0) + 'px';
      slot.style.zIndex = b.z || 1;
      // dy < 0 tõstab karbi ülespoole (tagumine rida), scale vähendab (kaugemal)
      slot.style.transform = 'translateY(' + (b.dy || 0) + 'px) scale(' + (b.scale || 1) + ')';
      slot.style.transformOrigin = '50% 100%';
      const el = document.createElement('div');
      slot.appendChild(el);
      row.appendChild(slot);
      mountBox(el, { faces: BOX_FACES[b.id], dims: BOX_DIMS, theme: b.theme, width: 300, interactive: false,
        angle: b.angle ?? -32, tilt: b.tilt ?? -13, shadow: true, label: b.id });
    }
    // oota, kuni kõik tahupildid on laaditud JA dekodeeritud (muidu võib mõni tahk jääda tühjaks)
    await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    await Promise.all([...document.images].map((im) => im.decode().catch(() => {})));
    const bad = [...document.images].filter((im) => !im.naturalWidth).map((im) => im.getAttribute('src'));
    if (bad.length) throw new Error('Pilt puudub: ' + bad.join(', '));
    // sobita kõigi tahkude (projitseeritud) ümbris kaadrisse
    const fit = document.getElementById('fit');
    fit.style.transform = 'none';
    const rects = [...document.querySelectorAll('.box3d__face')].map((f) => f.getBoundingClientRect());
    const x0 = Math.min(...rects.map((r) => r.left)), x1 = Math.max(...rects.map((r) => r.right));
    const y0 = Math.min(...rects.map((r) => r.top)), y1 = Math.max(...rects.map((r) => r.bottom));
    const s = Math.min((w * (1 - 2 * pad)) / (x1 - x0), (h * (1 - 2 * pad)) / (y1 - y0));
    const tx = (w - (x1 - x0) * s) / 2 - x0 * s;
    const ty = (h - (y1 - y0) * s) / 2 - y0 * s;
    fit.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    // kontaktvarjud: iga karbi põhja (nähtamatu tahk) projektsioon = jalajälg põrandal
    stage.querySelectorAll('.cshadow').forEach((n) => n.remove());
    const st = stage.getBoundingClientRect();
    document.querySelectorAll('.box3d').forEach((bx, i) => {
      const r = bx.querySelector('.box3d__face--bottom').getBoundingClientRect();
      const sh = document.createElement('div');
      sh.className = 'cshadow';
      const sw = r.width * 1.08, shh = Math.max(r.height * 0.9, r.width * 0.12);
      sh.style.cssText = 'left:' + (r.left - st.left + (r.width - sw) / 2) + 'px;top:' + (r.top - st.top + r.height * 0.55 - shh / 2) +
        'px;width:' + sw + 'px;height:' + shh + 'px;z-index:0';
      stage.insertBefore(sh, stage.firstChild);
    });
    fit.style.zIndex = 1;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { s };
  };
</script></body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__stage.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(STAGE_HTML);
    }
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// PNG -> WebP (alfaga) + väike versioon; Pillow teeb kvaliteetse vähendamise (Lanczos).
function toWebp(png, outs) {
  const py = `
import sys, json
from PIL import Image
src, outs = sys.argv[1], json.loads(sys.argv[2])
im = Image.open(src).convert('RGBA')
for o in outs:
    w, h = o['size']
    r = im if im.size == (w, h) else im.resize((w, h), Image.LANCZOS)
    if not o.get('alpha', True):
        r = r.convert('RGB')
    if o['path'].endswith('.png'):
        # PNG (Stripe Checkout, e-kirjad — kõik kliendid ei näita WebP-d); täisvärv + alfa
        # (256 värvi paletiga tekkisid gradientidesse triibud)
        r.save(o['path'], 'PNG', optimize=True)
    else:
        r.save(o['path'], 'WEBP', quality=o.get('q', 86), method=6, alpha_quality=90)
    print(o['path'], w, h)
`;
  process.stdout.write(execFileSync('python3', ['-I', '-c', py, png, JSON.stringify(outs)]).toString());
}

const THEME = { 'mida-viiu': 'mida', 'oled-semu': 'semu', vigur: 'vigur' };

const SCENES = [
  ...['mida-viiu', 'oled-semu', 'vigur'].map((id) => ({
    name: `${id}-box`,
    w: 450,
    h: 450,
    boxes: [{ id, theme: THEME[id] }],
    outs: [
      { path: `${id}-box.webp`, size: [900, 900] },
      { path: `${id}-box-sm.webp`, size: [240, 240] },
      { path: `${id}-box.png`, size: [480, 480] },
    ],
  })),
  {
    name: 'komplekt-semu-vigur',
    w: 450,
    h: 450,
    pad: 0.05,
    // lehvik: vasak karp näitab vasakut külge, parem paremat; mõlema esikülg jääb täiesti nähtavaks
    boxes: [
      { id: 'oled-semu', theme: 'semu', angle: 24, z: 1 },
      { id: 'vigur', theme: 'vigur', angle: -24, ml: 56, z: 2 },
    ],
    outs: [
      { path: 'komplekt-semu-vigur.webp', size: [900, 900] },
      { path: 'komplekt-semu-vigur-sm.webp', size: [240, 240] },
      { path: 'komplekt-semu-vigur.png', size: [480, 480] },
    ],
  },
  {
    name: 'komplekt-koik',
    w: 450,
    h: 450,
    pad: 0.04,
    // lehvik: MIDA V!!!U keskel ees, Oled Semu? ja Vigur veidi väiksemana selle taga külgedel
    boxes: [
      { id: 'oled-semu', theme: 'semu', angle: 22, scale: 0.86, dy: -26, z: 1 },
      { id: 'mida-viiu', theme: 'mida', angle: -8, ml: -64, z: 3 },
      { id: 'vigur', theme: 'vigur', angle: -22, ml: -64, scale: 0.86, dy: -26, z: 2 },
    ],
    outs: [
      { path: 'komplekt-koik.webp', size: [900, 900] },
      { path: 'komplekt-koik-sm.webp', size: [240, 240] },
      { path: 'komplekt-koik.png', size: [480, 480] },
    ],
  },
  // 16:9 kaanepildid (galerii „Kaanepilt“, og:image) — läbipaistmatu brändi taust
  ...[
    ['mida-viiu', 'bg-mida'],
    ['oled-semu', 'bg-semu'],
    ['vigur', 'bg-vigur'],
  ].map(([id, bg]) => ({
    name: `${id}-cover`,
    w: 800,
    h: 450,
    pad: 0.1,
    bg,
    boxes: [
      { id, theme: THEME[id], angle: -32, z: 2 },
      { id, theme: THEME[id], angle: 152, ml: 70, z: 1, scale: 0.92 },
    ],
    outs: [{ path: `${id}-cover.webp`, size: [1600, 900], alpha: false, q: 84 }],
  })),
];

const only = opt('--only', null);
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, reducedMotion: 'reduce', viewport: { width: 900, height: 600 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('[konsool]', m.text()));
  page.on('pageerror', (e) => console.error('[lehe viga]', e.message));
  await page.goto(`${base}/__stage.html`);
  await page.waitForFunction(() => typeof window.renderScene === 'function');
  for (const sc of SCENES) {
    if (only && sc.name !== only) continue;
    await page.setViewportSize({ width: sc.w, height: sc.h });
    await page.evaluate((s) => window.renderScene(s), { w: sc.w, h: sc.h, boxes: sc.boxes, pad: sc.pad, bg: sc.bg || '' });
    const png = path.join(WORK, `${sc.name}.png`);
    await page.locator('#stage').screenshot({ path: png, omitBackground: !sc.bg });
    toWebp(png, sc.outs.map((o) => ({ ...o, path: path.join(OUT, o.path) })));
  }
} finally {
  await browser.close();
  server.close();
}
