// Tänuleht (/aitah): neoonkonfetti, tellimuse kokkuvõte ja ostukorvi tühjendamine
// pärast edukat makset (Stripe suunab siia ?session_id=…).
import { Cart } from './cart.js';
import { PRODUCTS, formatEur } from './catalog.js';
import { esc } from './layout.js';
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);
const ICON_PIN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const ICON_MAIL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>';
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const LAST_ORDER_KEY = 'age_last_order_v1';

function readLastOrder() {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* =========================================================================
   Tellimus
   ========================================================================= */
const params = new URLSearchParams(location.search);
const sessionId = params.get('session_id');
let order = null;

// Ilma session_id-ta (järjehoidja, jagatud link, ajalugu) pole see maksekinnitus: näitame
// neutraalset vaadet ega puutu ostukorvi (see võib olla pooleli tellimus).
if (sessionId) {
  order = readLastOrder();
  // Kui kassa kokkuvõtet pole (nt teine seade), võta vähemalt ostukorvi sisu.
  if (!order && Cart.count()) {
    const t = Cart.totals();
    order = {
      items: Cart.items(),
      totals: { totalCents: t.totalCents },
    };
  }
  Cart.clear();
  Cart.removeCode();
}

const ARROW =
  '<svg class="icon arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/** Ilma session_id-ta: ei väida, et midagi on makstud, ega korralda pidu. */
function renderNoSession() {
  const lead = $('[data-ty-lead]');
  const hasCart = Cart.count() > 0;
  document.title = 'Tellimuse infot ei leitud | ÄGE';
  document.body.classList.add('is-nosession');
  $('#ty-title').innerHTML = 'Tellimuse infot <span class="neon">ei leitud</span>';
  lead.textContent = hasCart
    ? 'Sellelt lingilt me tellimust ei leidnud. Sinu ostukorv on alles — tellimuse saad lõpule viia kassas. Kui maksid just praegu, saadab Stripe makse kviitungi sinu e-postile.'
    : 'Sellelt lingilt me tellimust ei leidnud. Kui maksid just praegu, saadab Stripe makse kviitungi sinu e-postile.';
  lead.hidden = false;
  // Põhitegevus kohe nähtavale (alumised nupud muutuksid üleliigseks).
  const cta = $('.ty-cta');
  if (cta) {
    cta.classList.add('ty-cta--hero');
    cta.innerHTML = hasCart
      ? `<a class="btn btn--primary btn--lg" href="/ostukorv">Tagasi ostukorvi ${ARROW}</a><a class="btn btn--ghost btn--lg" href="/">Avalehele</a>`
      : `<a class="btn btn--primary btn--lg" href="/">Avalehele ${ARROW}</a><a class="btn btn--ghost btn--lg" href="/#mangud">Vaata mänge</a>`;
    lead.after(cta);
  }
}

function renderOrder() {
  const box = $('[data-ty-order]');
  const lead = $('[data-ty-lead]');
  if (!sessionId) return renderNoSession();
  $('[data-ty-eyebrow]').textContent = 'Makse õnnestus';
  $('[data-ty-paid]').hidden = false;
  $('[data-burst]').hidden = false;
  $('[data-ty-next]').hidden = false;
  lead.hidden = false;
  if (!order) return;
  const first = order.firstName ? esc(order.firstName) : '';
  if (first) {
    lead.innerHTML = `${first}, hea valik! Saadame paki teele 1–3 tööpäeva jooksul. Valmistu õhtuks, millest räägitakse veel järgmisel päeval.`;
  }
  const items = (order.items || [])
    .map((i) => ({ p: Object.prototype.hasOwnProperty.call(PRODUCTS, i?.id) ? PRODUCTS[i.id] : null, qty: Math.max(1, Math.min(99, Math.floor(Number(i?.qty)) || 1)) }))
    .filter((i) => i.p);
  if (!items.length) return;
  const locker = order.locker?.name
    ? `<div><dt aria-label="Pakiautomaat">${ICON_PIN}</dt><dd><strong>${esc(order.carrierLabel || 'Pakiautomaat')}</strong> · ${esc(order.locker.name)}${order.locker.address ? `, ${esc(order.locker.address)}` : ''}</dd></div>`
    : '';
  const mail = order.email ? `<div><dt aria-label="E-post">${ICON_MAIL}</dt><dd>Kviitung läheb aadressile <strong>${esc(order.email)}</strong></dd></div>` : '';
  box.innerHTML = `
    <ul class="ty-order__items" role="list" aria-label="Tellitud tooted">
      ${items
        .map(
          ({ p, qty }) => `<li class="ty-order__item">
            ${
              p.includes?.length
                ? `<span class="co-sum-stack ty-order__stack" aria-hidden="true">${p.includes
                    .map((id) => PRODUCTS[id])
                    .filter(Boolean)
                    .map((x) => `<img src="${esc(x.image)}" alt="" width="54" height="37" loading="lazy">`)
                    .join('')}</span>`
                : `<img src="${esc(p.image)}" alt="" width="54" height="37" loading="lazy">`
            }
            <strong>${esc(p.name)}</strong>
            <span>${esc(String(qty))} tk</span>
          </li>`,
        )
        .join('')}
    </ul>
    ${locker || mail ? `<dl class="ty-order__meta">${locker}${mail}</dl>` : ''}
    ${order.totals?.totalCents != null ? `<div class="ty-order__total"><span>Makstud</span><strong>${formatEur(order.totals.totalCents)}</strong></div>` : ''}`;
  box.hidden = false;
}

/* =========================================================================
   Neoonkonfetti (canvas)
   ========================================================================= */
const canvas = $('[data-confetti]');
const ctx = canvas?.getContext('2d');
const COLORS = ['#ff2fa8', '#ff4fbf', '#ff8fd6', '#8b2cff', '#12b5ff', '#ff8a1c', '#2bff9a', '#ffffff', '#ffe14d'];
let W = 0;
let H = 0;
let parts = [];
let raf = 0;
let last = 0;

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function particle(x, y, vx, vy) {
  const r = Math.random();
  return {
    x,
    y,
    vx,
    vy,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.35,
    tilt: Math.random() * Math.PI * 2,
    vt: 0.06 + Math.random() * 0.12,
    w: 6 + Math.random() * 7,
    h: 9 + Math.random() * 9,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    shape: r < 0.55 ? 'rect' : r < 0.78 ? 'dot' : r < 0.93 ? 'spark' : 'bang',
    life: 0,
    ttl: 200 + Math.random() * 140,
  };
}

function burst(cx, cy, n = 120, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (3 + Math.random() * 10) * power;
    parts.push(particle(cx, cy, Math.cos(a) * v, Math.sin(a) * v - 4 * power));
  }
  start();
}

function cannon(side, n = 80) {
  const x = side < 0 ? -12 : W + 12;
  const y = H * 0.82;
  for (let i = 0; i < n; i++) {
    const deg = (side < 0 ? -62 : -118) + (Math.random() - 0.5) * 34;
    const a = (deg * Math.PI) / 180;
    const v = 13 + Math.random() * 11;
    parts.push(particle(x, y, Math.cos(a) * v, Math.sin(a) * v));
  }
  start();
}

function draw(p, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.fillStyle = p.color;
  switch (p.shape) {
    case 'rect':
      ctx.scale(1, Math.cos(p.tilt));
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      break;
    case 'dot':
      ctx.beginPath();
      ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'spark': {
      // neoonsäde: 4-haruline täht kumaga
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      const s = p.w * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(0, 0, s, 0);
      ctx.quadraticCurveTo(0, 0, 0, s);
      ctx.quadraticCurveTo(0, 0, -s, 0);
      ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.fill();
      break;
    }
    default: {
      // „!“ — nagu MIDA V!!!U logos
      ctx.shadowColor = '#ff2fa8';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff4fbf';
      const s = p.h * 0.9;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-s * 0.16, -s * 0.7, s * 0.32, s * 0.95, s * 0.16) : ctx.rect(-s * 0.16, -s * 0.7, s * 0.32, s * 0.95);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, s * 0.55, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function tick(now) {
  const dt = Math.min(2.5, last ? (now - last) / 16.67 : 1);
  last = now;
  ctx.clearRect(0, 0, W, H);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const drag = Math.pow(0.982, dt);
    p.vx *= drag;
    p.vy = Math.min(p.vy * drag + 0.26 * dt, 5.5);
    p.x += (p.vx + Math.sin(p.tilt) * 0.7) * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.tilt += p.vt * dt;
    p.life += dt;
    const fade = p.life > p.ttl * 0.7 ? 1 - (p.life - p.ttl * 0.7) / (p.ttl * 0.3) : 1;
    if (p.y > H + 40 || fade <= 0) {
      parts.splice(i, 1);
      continue;
    }
    draw(p, Math.max(0, fade));
  }
  if (parts.length) raf = requestAnimationFrame(tick);
  else {
    raf = 0;
    last = 0;
    ctx.clearRect(0, 0, W, H);
  }
}

function start() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function centerOf(node) {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function celebrate() {
  if (!canvas || !ctx || REDUCED.matches) return;
  resize();
  const b = $('[data-burst]');
  const c = b ? centerOf(b) : { x: W / 2, y: H * 0.3 };
  const small = W < 600;
  setTimeout(() => burst(c.x, c.y, small ? 90 : 140, small ? 0.85 : 1), 250);
  setTimeout(() => {
    cannon(-1, small ? 50 : 90);
    cannon(1, small ? 50 : 90);
  }, 650);
  setTimeout(() => burst(c.x, c.y, small ? 40 : 70, 0.7), 1500);
}

window.addEventListener('resize', () => {
  if (canvas && ctx) resize();
});

$('[data-party]')?.addEventListener('click', (e) => {
  if (!canvas || !ctx || REDUCED.matches) return;
  if (!W) resize();
  const c = centerOf(e.currentTarget);
  burst(c.x, c.y, 90, 0.9);
});

/* =========================================================================
   Jagamine
   ========================================================================= */
const shareBtn = $('[data-share]');
if (shareBtn && navigator.share) {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', () => {
    navigator
      .share({
        title: 'ÄGE seltskonnamängud',
        text: 'Leidsin mängu, mis teeb igast õhtust loo — MIDA V!!!U ja teised ÄGE mängud:',
        url: `${location.origin}/`,
      })
      .catch(() => {});
  });
}
const mail = $('[data-mail]');
if (mail && SITE.email) {
  mail.href = `mailto:${SITE.email}`;
  mail.textContent = SITE.email;
}
const tt = $('[data-tiktok]');
if (tt && SITE.tiktok) tt.href = SITE.tiktok;
const ig = $('[data-instagram]');
if (ig && SITE.instagram) ig.href = SITE.instagram;

renderOrder();
// Konfetti ainult päris tellimuse järel.
if (sessionId) {
  if (document.readyState === 'complete') celebrate();
  else window.addEventListener('load', celebrate, { once: true });
}
