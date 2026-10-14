// Soodushüpik (−15%).
//
// 1) TEASER: ~4 s pärast lehe laadimist (või 30% kerimise järel) libiseb ekraani
//    nurka väike kaart MIDA V!!!U pildiga. X minimeerib selle „−15%“ pill'iks.
// 2) Klikk pildil → pilt lendab (FLIP) ekraani keskele ja kasvab modaaliks,
//    neoonsähvatus + konfetiplahvatus, sisu ilmub järjest.
// 3) E-post → Netlify Forms (form-name=soodus) → kraapekaart koodiga AGE15 →
//    „Kopeeri kood“ / „Kasuta kohe“ (Cart.applyCode).
//
// Avalik liides teistele lehtedele:
//   <button data-open-promo>…</button>         — avab soodusmodaali
//   window.dispatchEvent(new CustomEvent('promo:open'))
// Pärast liitumist saadetakse window sündmus 'promo:joined' ({ detail: { email } }).
import { trapFocus, toast, ICONS } from './layout.js';
import { Cart } from './cart.js';
import { WELCOME_CODE, DISCOUNT_CODES } from './catalog.js';
import { ensureOverlaysCss, lockPage, isAgeGateOpen, prefersReducedMotion, storageGet, storageSet } from './agegate.js';
import { isValidEmail } from './validate.js'; // sama reegel mis serveris

const SEEN_KEY = 'age_promo_seen';
const EMAIL_KEY = 'age_promo_email';
const IMG = '/assets/img/games/mida-viiu-promo.webp';
const CODE = WELCOME_CODE;
const PCT = DISCOUNT_CODES[CODE] || 15;
const PCT_TXT = `−${PCT}%`;
const TEASER_DELAY = 4000; // ms
const SCROLL_TRIGGER = 0.3; // 30% lehest
const REMIND_AFTER = 3 * 24 * 60 * 60 * 1000; // pärast 3 päeva näita teaserit uuesti
const AUTO_TUCK_SCREENS = 1.5; /**
 * Lehe võtmeelemendid, mida nurgakaart ei tohi katta: avalehe hind ja tellimisnupud,
 * tootelehe nimi, hind, ostuplokk, galerii noolenupud ja pisipildid.
 * Teised lehed saavad lisada [data-promo-avoid].
 */
const AVOID = [
  '[data-hero-cta]',
  '.hero__price',
  '.hero__ctas',
  '.pdp-title',
  '.pdp-price',
  '[data-main-cta]',
  '[data-buy-now]',
  '.pdp-qty',
  '.pdp-thumbs',
  '.pdp-stage__nav',
  '[data-promo-avoid]',
].join(',');

const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
const NO_TEASER = /^\/(ostukorv|aitah|__forms)$/.test(path);

const joined = () => Boolean(storageGet(EMAIL_KEY));
const seenRecently = () => {
  const t = Number(storageGet(SEEN_KEY));
  return Boolean(t) && Date.now() - t < REMIND_AFTER;
};
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const SMALL_SCREEN = window.matchMedia('(max-width: 900px), (max-height: 500px)');
const pageBusy = () => isAgeGateOpen() || document.body.classList.contains('is-locked') || document.body.classList.contains('ov-locked');

const GIFT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>';
const COPY_ICON =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="3"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
// „Vajuta mind“ — puudutav sõrm (brändi joonikoon, mitte emoji)
const TAP_ICON =
  '<svg class="promo-tap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v5.5"/><path d="M12 10V8.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.3 15.6a1.6 1.6 0 0 1 2.4-2.1L9 15.5"/><path d="M5.5 4.5 4 3M14.5 3.5 16 2"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0c.8 6.4 5.6 11.2 12 12-6.4.8-11.2 5.6-12 12-.8-6.4-5.6-11.2-12-12C6.4 11.2 11.2 6.4 12 0z"/></svg>';

/* =========================================================================
   Konfetti / osakesed (üks täisekraani canvas)
   ========================================================================= */
const FX_COLORS = ['#ff2fa8', '#ff4fbf', '#ff8fd6', '#ffffff', '#12b5ff', '#8b2cff', '#ff8a1c', '#2bff9a', '#ff2fa8'];
let fx = null;
let fxCtx = null;
let particles = [];
let fxRaf = 0;
let fxLast = 0;

function ensureFx() {
  if (fx) return;
  fx = document.createElement('canvas');
  fx.className = 'promo-fx';
  fx.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fx);
  fxCtx = fx.getContext('2d');
  sizeFx();
  window.addEventListener('resize', sizeFx, { passive: true });
}

function sizeFx() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.width = Math.round(window.innerWidth * dpr);
  fx.height = Math.round(window.innerHeight * dpr);
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Konfetiplahvatus punktist (x, y) ekraani koordinaatides. */
function burst(x, y, { count = 120, power = 1, spread = Math.PI * 2, angle = -Math.PI / 2 } = {}) {
  if (prefersReducedMotion()) return;
  ensureFx();
  const n = window.innerWidth < 600 ? Math.round(count * 0.7) : count;
  for (let i = 0; i < n; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = (3 + Math.random() * 10) * power;
    const r = Math.random();
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 2.5 * power,
      g: 0.16 + Math.random() * 0.12,
      drag: 0.965 + Math.random() * 0.02,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      tilt: Math.random() * Math.PI * 2,
      vt: 0.06 + Math.random() * 0.12,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
      color: FX_COLORS[(Math.random() * FX_COLORS.length) | 0],
      shape: r < 0.16 ? 'spark' : r < 0.3 ? 'dot' : 'rect',
      life: 0,
      ttl: 90 + Math.random() * 80,
    });
  }
  if (!fxRaf) {
    fxLast = performance.now();
    fxRaf = requestAnimationFrame(fxTick);
  }
}

function drawSpark(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.fill();
}

function fxTick(now) {
  const dt = Math.min(2.5, (now - fxLast) / 16.67);
  fxLast = now;
  const W = window.innerWidth;
  const H = window.innerHeight;
  fxCtx.clearRect(0, 0, W, H);
  particles = particles.filter((p) => p.life < p.ttl && p.y < H + 60);
  for (const p of particles) {
    p.vx *= Math.pow(p.drag, dt);
    p.vy = p.vy * Math.pow(p.drag, dt) + p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.tilt += p.vt * dt;
    p.life += dt;
    const alpha = p.life > p.ttl - 30 ? Math.max(0, (p.ttl - p.life) / 30) : 1;
    fxCtx.save();
    fxCtx.globalAlpha = alpha;
    fxCtx.translate(p.x, p.y);
    fxCtx.rotate(p.rot);
    fxCtx.fillStyle = p.color;
    if (p.shape === 'rect') {
      fxCtx.scale(1, Math.cos(p.tilt));
      fxCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else if (p.shape === 'dot') {
      fxCtx.beginPath();
      fxCtx.arc(0, 0, p.h * 0.55, 0, Math.PI * 2);
      fxCtx.fill();
    } else {
      drawSpark(fxCtx, p.w * 0.75);
    }
    fxCtx.restore();
  }
  if (particles.length) fxRaf = requestAnimationFrame(fxTick);
  else {
    fxRaf = 0;
    fxCtx.clearRect(0, 0, W, H);
  }
}

/* =========================================================================
   Teaser ja pill (ekraani nurgas)
   ========================================================================= */
let dock = null;
let teaser = null;
let pill = null;
let teaserScheduled = false;
let teaserDone = false;

function buildDock() {
  if (dock) return;
  dock = document.createElement('aside');
  dock.className = 'promo-dock';
  dock.setAttribute('aria-label', `${PCT_TXT} soodustus`);
  dock.dataset.state = 'none';
  dock.innerHTML = `
    <div class="promo-teaser" data-promo-teaser>
      <button class="promo-teaser__card" type="button" aria-haspopup="dialog" data-promo-teaser-open>
        <span class="promo-teaser__media" data-promo-src>
          <img src="${IMG}" alt="" width="1600" height="900" decoding="async">
          <span class="promo-teaser__shine" aria-hidden="true"></span>
        </span>
        <span class="promo-teaser__txt">
          <strong>Tahad <em>${PCT_TXT}</em>?</strong>
          <span>Vajuta mind ${TAP_ICON}</span>
        </span>
        <span class="sr-only"> Ava soodustuse pakkumine.</span>
      </button>
      <span class="promo-sticker promo-sticker--teaser" aria-hidden="true"><b>${PCT_TXT}</b></span>
      <button class="promo-teaser__close" type="button" data-promo-minimize aria-label="Peida pakkumine">${ICONS.close}</button>
    </div>
    <button class="promo-pill" type="button" aria-haspopup="dialog" data-promo-pill hidden>
      <span class="promo-pill__gift">${GIFT_ICON}</span>
      <span class="promo-pill__txt">${PCT_TXT}</span>
      <span class="sr-only"> soodustus — ava pakkumine</span>
    </button>`;
  document.body.appendChild(dock);
  teaser = dock.querySelector('[data-promo-teaser]');
  pill = dock.querySelector('[data-promo-pill]');

  dock.querySelector('[data-promo-teaser-open]').addEventListener('click', () => {
    openModal(dock.querySelector('[data-promo-src]'));
  });
  dock.querySelector('[data-promo-minimize]').addEventListener('click', () => {
    storageSet(SEEN_KEY, String(Date.now()));
    minimizeTeaser(true);
  });
  pill.addEventListener('click', () => openModal(pill));
  watchToasts();
  watchDock();
}

/* ---------- Nurgakaart ei tohi katta lehe põhinuppe ---------- */
let scrollTucked = false;
let teaserShownY = null;

/**
 * Nurgakaardi „kodukoht“ ekraanil (koos kleepsu ja sulgemisnupuga). offset* ei arvesta
 * transform'e, nii et peitmine/sissetulek ei mõjuta mõõtmist (pole tagasisidetsüklit).
 */
function dockHomeRect() {
  const x = dock.offsetLeft;
  const y = dock.offsetTop;
  return { left: x - 14, top: y - 20, right: x + dock.offsetWidth + 16, bottom: y + dock.offsetHeight + 4 };
}

/** Kas nurgakaart kataks praegu mõnda lehe põhielementi (hind, tellimisnupp, kogus …)? */
function coversKeyUi() {
  const d = dockHomeRect();
  if (d.right - d.left < 30) return false;
  for (const el of document.querySelectorAll(AVOID)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.left < d.right && r.right > d.left && r.top < d.bottom && r.bottom > d.top) return true;
  }
  return false;
}

/** Uuenda nurgakaardi nähtavust: oota vaba kohta, peida põhinuppude peal ja mobiilis allakerimisel. */
function syncDock() {
  if (!dock) return;
  const blocked = coversKeyUi();
  if (dock.classList.contains('is-waiting')) {
    if (!blocked && !pageBusy()) revealTeaser();
    return;
  }
  dock.classList.toggle('is-tucked', blocked || scrollTucked);
}

function watchDock() {
  let lastY = window.scrollY;
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!dock) return;
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) >= 8) {
        // Mobiilis peida pill allakerimisel (et see sisu ei kataks), näita üleskerimisel.
        scrollTucked = SMALL_SCREEN.matches && dock.dataset.state === 'pill' && dy > 0 && y > 120;
        lastY = y;
      }
      // Telefonis ei jää suur teaser kerimise ajal sisu peale: ~1,5 ekraani järel saab sellest pill.
      if (
        SMALL_SCREEN.matches &&
        dock.dataset.state === 'teaser' &&
        teaserShownY !== null &&
        !isOpen &&
        Math.abs(y - teaserShownY) > window.innerHeight * AUTO_TUCK_SCREENS
      ) {
        teaserShownY = null;
        storageSet(SEEN_KEY, String(Date.now()));
        minimizeTeaser(false);
        return;
      }
      syncDock();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // Tootelehe/avalehe kleepuv osturiba tõstab nurgakaarti (body.has-buybar) — kontrolli uuesti.
  if ('MutationObserver' in window) {
    new MutationObserver(() => setTimeout(syncDock, 480)).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}

function showTeaser() {
  if (teaserDone || joined()) return;
  teaserDone = true;
  buildDock();
  dock.dataset.state = 'teaser';
  pill.hidden = true;
  teaser.hidden = false;
  // Kaart ilmub alles siis, kui nurgas on vaba ruum (mitte hinna või tellimisnupu peale).
  dock.classList.add('is-waiting');
  syncDock();
}

function revealTeaser() {
  if (!dock) return;
  dock.classList.remove('is-waiting', 'is-tucked');
  teaserShownY = window.scrollY;
  requestAnimationFrame(() => requestAnimationFrame(() => teaser?.classList.add('is-in')));
}

function showPill({ pop = true } = {}) {
  if (joined()) return hideDock();
  buildDock();
  dock.dataset.state = 'pill';
  dock.classList.remove('is-waiting');
  teaserShownY = null;
  teaser.hidden = true;
  teaser.classList.remove('is-in', 'is-out', 'is-launched');
  pill.hidden = false;
  syncDock();
  if (pop && !prefersReducedMotion() && !dock.classList.contains('is-tucked')) {
    pill.classList.remove('is-pop');
    void pill.offsetWidth;
    pill.classList.add('is-pop');
  }
  syncToastLift();
}

function minimizeTeaser(focusPill) {
  if (!dock) return;
  if (prefersReducedMotion() || dock.dataset.state !== 'teaser') {
    showPill();
    if (focusPill) pill.focus({ preventScroll: true });
    return;
  }
  teaser.classList.add('is-out');
  setTimeout(() => {
    showPill();
    if (focusPill) pill.focus({ preventScroll: true });
  }, 380);
}

function hideDock() {
  if (!dock) return;
  dock.remove();
  dock = teaser = pill = null;
}

/** Tõsta nurgakaart üles, kui teavitus (toast) ilmub selle peale. */
function watchToasts() {
  const region = document.querySelector('.toast-region');
  if (!region || !('MutationObserver' in window)) return;
  new MutationObserver(syncToastLift).observe(region, { childList: true });
}

function syncToastLift() {
  const region = document.querySelector('.toast-region');
  if (!dock || !region) return;
  const visible = dock.dataset.state === 'pill' ? pill : teaser;
  let lift = 0;
  if (region.children.length && visible && !visible.hidden) {
    const current = parseFloat(dock.style.getPropertyValue('--toast-lift')) || 0;
    const d = visible.getBoundingClientRect();
    const r = region.getBoundingClientRect();
    const overlapX = r.left < d.right && r.right > d.left;
    const bottom = d.bottom + current; // ilma praeguse tõsteta
    if (overlapX && bottom > r.top - 12) lift = Math.ceil(bottom - r.top + 14);
  }
  dock.style.setProperty('--toast-lift', `${lift}px`);
}

/* Teaseri ajastus: 4 s või 30% kerimist, aga mitte vanusekontrolli ajal. */
function scheduleTeaser() {
  if (teaserScheduled || NO_TEASER || joined()) return;
  teaserScheduled = true;
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
    whenFree(() => (seenRecently() ? showPill() : showTeaser()));
  };
  const timer = setTimeout(fire, seenRecently() ? 1500 : TEASER_DELAY);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY / max >= SCROLL_TRIGGER) fire();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

/** Käivita `fn`, kui vanusekontroll, ostukorv ja menüü pole ees. */
function whenFree(fn) {
  if (isAgeGateOpen()) {
    window.addEventListener('agegate:passed', () => setTimeout(() => whenFree(fn), 1400), { once: true });
    return;
  }
  if (pageBusy()) {
    setTimeout(() => whenFree(fn), 1500);
    return;
  }
  ensureOverlaysCss().then(fn);
}

/* =========================================================================
   Modaal
   ========================================================================= */
let modal = null;
let panel = null;
let backdrop = null;
let unlock = null;
let lastFocus = null;
let isOpen = false;
let landTimer = 0;
let openId = 0;
let scratch = null;

const STEP_JOIN = 'join';
const STEP_SCRATCH = 'scratch';
const STEP_CODE = 'code';

function buildModal() {
  if (modal) return;
  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop promo-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  modal = document.createElement('div');
  modal.className = 'modal promo-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'promo-title');
  modal.setAttribute('aria-describedby', 'promo-desc');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal__panel promo-panel" tabindex="-1">
      <button class="icon-btn modal__close promo-close" type="button" data-promo-close aria-label="Sulge">${ICONS.close}</button>
      <div class="promo-scroll">
        <div class="promo-top">
          <div class="promo-hero">
            <img class="promo-hero__img" src="${IMG}" alt="MIDA V!!!U — ÄGE uus pidumäng" width="1600" height="900" decoding="async">
            <span class="promo-hero__flash" aria-hidden="true"></span>
            <span class="promo-hero__tag" aria-hidden="true"><i></i>Uus mäng · 18+</span>
          </div>
          <span class="promo-sticker promo-sticker--hero" aria-hidden="true">
            <svg class="promo-sticker__ring" viewBox="0 0 120 120">
              <defs><path id="promo-ring-path" d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0"/></defs>
              <text><textPath href="#promo-ring-path" textLength="290" lengthAdjust="spacing">LIITUJATE ERIPAKKUMINE ✦ KOGU OSTUKORVILE ✦</textPath></text>
            </svg>
            <b>${PCT_TXT}</b>
          </span>
        </div>

        <div class="promo-body">
          <!-- 1. samm: liitumine -->
          <section class="promo-step" data-step="${STEP_JOIN}">
            <p class="promo-kicker" data-stagger><span class="promo-kicker__dot" aria-hidden="true"></span>Liitujate eripakkumine</p>
            <h2 class="promo-title" id="promo-title" data-stagger>Võta <span class="promo-title__pct">${PCT_TXT}</span> kogu ostukorvilt</h2>
            <p class="promo-lead" id="promo-desc" data-stagger>Liitu ÄGE seltskonnaga ja sooduskood on kohe sinu — kasuta seda kas või kohe MIDA V!!!U tellimisel.</p>
            <ul class="promo-perks" role="list" data-stagger>
              <li>${ICONS.check}<span>${PCT_TXT} kohe kätte</span></li>
              <li>${ICONS.check}<span>Uued mängud enne teisi</span></li>
              <li>${ICONS.check}<span>Salapakkumised liitujatele</span></li>
            </ul>
            <form class="promo-form" name="soodus" method="post" action="/" novalidate data-stagger>
              <input type="hidden" name="form-name" value="soodus">
              <input type="hidden" name="page" value="">
              <p class="promo-hp" aria-hidden="true"><label>Ära seda täida: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
              <label class="sr-only" for="promo-email">Sinu e-posti aadress</label>
              <div class="promo-form__row">
                <span class="promo-form__icon" aria-hidden="true">${ICONS.mail}</span>
                <input class="input promo-form__input" id="promo-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="sinu@email.ee" required aria-describedby="promo-email-err promo-consent">
                <button class="btn btn--primary promo-form__btn" type="submit"><span class="promo-form__btn-txt">Saan ${PCT_TXT}</span><span class="promo-spinner" aria-hidden="true"></span></button>
              </div>
              <p class="field-error promo-form__err" id="promo-email-err" aria-live="assertive"></p>
            </form>
            <p class="promo-consent" id="promo-consent" data-stagger>Liitudes nõustud saama ÄGE uudiseid ja pakkumisi. Loobuda saad igal ajal. Loe lähemalt: <a href="/privaatsus">privaatsuspoliitika</a>.</p>
            <button class="promo-later" type="button" data-promo-later data-stagger>Mitte praegu</button>
          </section>

          <!-- 2. samm: kraapekaart / kood -->
          <section class="promo-step promo-step--code" data-step="${STEP_SCRATCH}" hidden>
            <p class="promo-kicker" data-stagger data-code-kicker><span class="promo-kicker__dot" aria-hidden="true"></span>Oled sees!</p>
            <h2 class="promo-title" id="promo-title-code" tabindex="-1" data-stagger data-code-title>Kraabi ja võta oma kood</h2>
            <p class="promo-lead" id="promo-desc-code" data-stagger data-code-lead>Hõõru kaarti sõrme või hiirega — selle all on peidus sinu ${PCT_TXT}.</p>
            <div class="scratch" data-stagger>
              <div class="scratch__ticket">
                <span class="scratch__label">Sinu sooduskood</span>
                <strong class="scratch__code" data-code>${[...CODE].map((c, i) => `<span style="--k:${i}">${c}</span>`).join('')}</strong>
                <span class="scratch__meta">${PCT_TXT} kogu ostult</span>
              </div>
              <canvas class="scratch__canvas" aria-hidden="true"></canvas>
            </div>
            <button class="promo-reveal" type="button" data-reveal-code data-stagger>
              <span class="promo-reveal__spark">${SPARK}</span>Ei viitsi kraapida? Näita koodi
            </button>
            <div class="promo-actions" data-actions hidden>
              <button class="btn btn--ghost promo-actions__copy" type="button" data-copy>${COPY_ICON}<span>Kopeeri kood</span></button>
              <button class="btn btn--primary promo-actions__use" type="button" data-use><span>Kasuta kohe</span>${ICONS.arrow}</button>
            </div>
            <p class="promo-small" data-stagger>Kood kehtib kõigile mängudele ja komplektidele ostukorvis (v.a tarne). Sooduskoode ei saa omavahel kombineerida.</p>
          </section>
        </div>
      </div>
      <p class="sr-only" aria-live="polite" data-promo-live></p>
    </div>`;
  document.body.append(backdrop, modal);
  panel = modal.querySelector('.promo-panel');
  panel.querySelectorAll('.promo-step').forEach((step) => {
    step.querySelectorAll('[data-stagger]').forEach((el, i) => el.style.setProperty('--i', i));
  });

  // Sulgemine: X, „Mitte praegu“, Esc, klikk taustal.
  modal.querySelector('[data-promo-close]').addEventListener('click', () => closeModal());
  modal.querySelector('[data-promo-later]').addEventListener('click', () => closeModal());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  // Esc kuulatakse dokumendil: see töötab ka siis, kui fookus pole (veel) dialoogi sees.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen || e.defaultPrevented) return;
    e.preventDefault();
    closeModal();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (document.activeElement === panel) {
        const first = panel.querySelector('button:not([hidden]), input:not([type="hidden"])');
        if (first && !e.shiftKey) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      trapFocus(e, panel);
    }
  });

  const form = modal.querySelector('.promo-form');
  const input = form.querySelector('#promo-email');
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true' && isValidEmail(input.value.trim())) setError('');
  });
  form.addEventListener('submit', onSubmit);

  modal.querySelector('[data-reveal-code]').addEventListener('click', () => revealCode({ viaButton: true }));
  modal.querySelector('[data-copy]').addEventListener('click', onCopy);
  modal.querySelector('[data-use]').addEventListener('click', onUse);
}

function stepEl(name) {
  return modal.querySelector(`[data-step="${name === STEP_CODE ? STEP_SCRATCH : name}"]`);
}

function setStep(name) {
  const join = stepEl(STEP_JOIN);
  const code = stepEl(STEP_SCRATCH);
  join.hidden = name !== STEP_JOIN;
  code.hidden = name === STEP_JOIN;
  join.classList.remove('is-in');
  code.classList.remove('is-in');
  modal.dataset.step = name;
  if (name === STEP_JOIN) {
    modal.setAttribute('aria-labelledby', 'promo-title');
    modal.setAttribute('aria-describedby', 'promo-desc');
    setError('');
    setLoading(false);
    return;
  }
  modal.setAttribute('aria-labelledby', 'promo-title-code');
  modal.setAttribute('aria-describedby', 'promo-desc-code');
  const wrap = code.querySelector('.scratch');
  wrap.classList.toggle('is-cleared', name === STEP_CODE);
  wrap.classList.remove('is-scratching');
  wrap.querySelector('canvas').hidden = name === STEP_CODE;
  const kicker = code.querySelector('[data-code-kicker]');
  const title = code.querySelector('[data-code-title]');
  const lead = code.querySelector('[data-code-lead]');
  const dot = '<span class="promo-kicker__dot" aria-hidden="true"></span>';
  if (name === STEP_SCRATCH) {
    kicker.innerHTML = `${dot}Oled sees!`;
    title.textContent = 'Kraabi ja võta oma kood';
    lead.textContent = `Hõõru kaarti sõrme või hiirega — selle all on peidus sinu ${PCT_TXT}.`;
    code.classList.remove('is-revealed');
    code.querySelector('[data-actions]').hidden = true;
    code.querySelector('[data-reveal-code]').hidden = false;
  } else {
    kicker.innerHTML = `${dot}Tere tagasi!`;
    title.textContent = `Sinu ${PCT_TXT} kood on alles`;
    lead.textContent = 'Kasuta seda kassas või lase meil soodustus kohe ostukorvi lisada.';
    code.classList.add('is-revealed');
    code.querySelector('[data-actions]').hidden = false;
    code.querySelector('[data-reveal-code]').hidden = true;
  }
}

function playStep(name) {
  const el = stepEl(name);
  el.classList.remove('is-in');
  void el.offsetWidth;
  el.classList.add('is-in');
}

function live(msg) {
  const el = modal?.querySelector('[data-promo-live]');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => (el.textContent = msg), 60);
}

function openModal(source) {
  if (isOpen || isAgeGateOpen()) return;
  ensureOverlaysCss().then(() => {
    if (isOpen) return;
    buildModal();
    doOpen(source && source.isConnected ? source : null);
  });
}

function doOpen(source) {
  isOpen = true;
  teaserDone = true;
  clearTimeout(landTimer);
  const id = ++openId;
  lastFocus = document.activeElement;
  const step = joined() ? STEP_CODE : STEP_JOIN;
  setStep(step);
  destroyScratch();

  const srcRect = source ? source.getBoundingClientRect() : null;
  const usable = srcRect && srcRect.width > 4 && srcRect.height > 4;
  const fromTeaser = usable && source.matches('[data-promo-src]');

  // Lähte-element peidetakse — nüüd „lendab“ see modaalis edasi.
  if (dock && dock.dataset.state === 'teaser') teaser.classList.add('is-launched');
  if (dock && dock.dataset.state === 'pill') pill.classList.add('is-launched');

  panel.getAnimations().forEach((a) => a.cancel());
  modal.classList.remove('is-closing', 'is-flying', 'is-landed');
  modal.removeAttribute('aria-hidden');
  modal.classList.add('is-open');
  backdrop.classList.add('is-open');
  modal.querySelector('.promo-scroll').scrollTop = 0;
  modal.querySelector('input[name="page"]').value = location.pathname;
  unlock = lockPage(modal, backdrop);

  const focusFirst = () => {
    if (!isOpen || id !== openId) return;
    const input = modal.querySelector('#promo-email');
    if (step === STEP_JOIN && finePointer()) input.focus({ preventScroll: true });
    // Varuvariant: kui sisend polnud veel fokusseeritav, vii fookus vähemalt dialoogi.
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  };

  if (prefersReducedMotion()) {
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    modal.classList.add('is-landed');
    playStep(step);
    // Modaal muutub nähtavaks (visibility) alles järgmises kaadris — enne seda fookus ei püsi.
    focusFirst();
    setTimeout(focusFirst, 60);
    if (step === STEP_CODE) live(`Sinu sooduskood on ${CODE}.`);
    return;
  }

  // Ekraanilugeja jaoks liigu kohe dialoogi; nähtav fookus tuleb pärast animatsiooni.
  panel.focus({ preventScroll: true });
  // Lõpliku asukoha mõõtmine enne animatsiooni (konfeti lähtepunkt).
  const heroRect = panel.querySelector('.promo-hero').getBoundingClientRect();
  const { anim, at } = fromTeaser ? flipFromTeaser(srcRect) : popIn(usable ? srcRect : null);
  // Maandumine seotakse animatsiooni enda kellaga (mitte setTimeout'iga), et sähvatus
  // ja konfetti tuleksid täpselt õigel hetkel ka siis, kui brauser on hõivatud.
  let landed = false;
  const doLand = () => {
    if (landed || id !== openId || !isOpen) return;
    landed = true;
    clearTimeout(landTimer);
    land(heroRect);
    playStep(step);
    setTimeout(focusFirst, 380);
    if (step === STEP_CODE) live(`Sinu sooduskood on ${CODE}.`);
  };
  const watch = () => {
    if (landed || id !== openId) return;
    const t = anim.currentTime ?? 0;
    if (t >= at || anim.playState === 'finished' || anim.playState === 'idle') doLand();
    else requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  landTimer = setTimeout(doLand, at + 1200); // varuvariant (nt peidetud vaheleht)
}

/** FLIP: teaseri pilt lendab keskele ja modaal „rullub“ selle alt lahti. Tagastab maandumise aja (ms). */
function flipFromTeaser(src) {
  const hero = panel.querySelector('.promo-hero');
  const heroImg = hero.querySelector('img');
  const p = panel.getBoundingClientRect();
  const h = hero.getBoundingClientRect();
  const s = src.width / h.width;
  const ox = h.left - p.left;
  const oy = h.top - p.top;
  const right = Math.max(0, p.width - ox - h.width);
  const below = Math.max(0, p.height - oy - h.height);
  const dx = src.left - h.left;
  const dy = src.top - h.top;
  panel.style.transformOrigin = `${ox}px ${oy}px`;
  modal.classList.add('is-flying');

  const dur = 1180;
  const split = 0.55;
  const r = getComputedStyle(panel).borderTopLeftRadius || '28px';
  const anim = panel.animate(
    [
      {
        offset: 0,
        transform: `translate(${dx}px, ${dy}px) scale(${s})`,
        clipPath: `inset(${oy}px ${right}px ${below}px ${ox}px round ${14 / s}px)`,
        easing: 'cubic-bezier(.3, 1.22, .45, 1)',
      },
      {
        offset: split,
        transform: 'translate(0px, 0px) scale(1)',
        clipPath: `inset(${oy}px ${right}px ${below}px ${ox}px round ${r} ${r} 0px 0px)`,
        easing: 'cubic-bezier(.16, 1, .3, 1)',
      },
      { offset: 1, transform: 'translate(0px, 0px) scale(1)', clipPath: `inset(0px 0px 0px 0px round ${r})` },
    ],
    { duration: dur, fill: 'both' },
  );
  anim.finished.then(cleanupPanelAnim, () => {});
  // Teaseris on pilt suumitud; suum taandub lennu ajal.
  heroImg.animate([{ transform: 'scale(1.7)' }, { transform: 'scale(1.3)' }], {
    duration: dur * split,
    easing: 'cubic-bezier(.3, .8, .3, 1)',
  });
  return { anim, at: Math.round(dur * split) - 30 };
}

/** Tavaline avanemine (nupust, pill'ist või sündmusest). */
function popIn(src) {
  let from = 'translateY(36px) scale(.82)';
  if (src) {
    const p = panel.getBoundingClientRect();
    const cx = src.left + src.width / 2 - (p.left + p.width / 2);
    const cy = src.top + src.height / 2 - (p.top + p.height / 2);
    const s = Math.max(0.08, Math.min(0.5, src.width / p.width));
    from = `translate(${cx}px, ${cy}px) scale(${s})`;
  }
  panel.style.transformOrigin = '50% 50%';
  const anim = panel.animate(
    [
      { transform: from, opacity: 0 },
      { offset: 0.3, opacity: 1 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    ],
    { duration: 760, easing: 'cubic-bezier(.22, 1.25, .4, 1)', fill: 'both' },
  );
  anim.finished.then(cleanupPanelAnim, () => {});
  return { anim, at: 330 };
}

function cleanupPanelAnim() {
  if (!panel || !isOpen) return;
  panel.getAnimations().forEach((a) => a.cancel());
  panel.style.transformOrigin = '';
}

/** Neoonsähvatus + konfetti, kui pilt „maandub“. */
function land(heroRect) {
  if (!isOpen) return;
  modal.classList.remove('is-flying');
  modal.classList.add('is-landed');
  const hero = panel.querySelector('.promo-hero');
  hero.classList.remove('is-flash');
  void hero.offsetWidth;
  hero.classList.add('is-flash');
  backdrop.classList.remove('is-flash');
  void backdrop.offsetWidth;
  backdrop.classList.add('is-flash');
  const r = heroRect || hero.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height * 0.55, { count: 150, power: 1.05 });
}

function closeModal() {
  if (!isOpen) return;
  isOpen = false;
  clearTimeout(landTimer);
  const isMember = joined();
  if (!isMember) storageSet(SEEN_KEY, String(Date.now()));
  const reduce = prefersReducedMotion();
  backdrop.classList.remove('is-open', 'is-flash');
  modal.classList.add('is-closing');

  const finish = () => {
    if (isOpen) return; // vahepeal avati uuesti
    modal.classList.remove('is-open', 'is-closing');
    modal.setAttribute('aria-hidden', 'true');
    panel.getAnimations().forEach((a) => a.cancel());
    panel.style.transformOrigin = '';
    stepEl(STEP_JOIN).classList.remove('is-in');
    stepEl(STEP_SCRATCH).classList.remove('is-in');
    destroyScratch();
    unlock?.();
    unlock = null;
    if (pill && !pill.hidden) {
      pill.classList.remove('is-launched');
      pill.classList.remove('is-pop');
      void pill.offsetWidth;
      if (!reduce) pill.classList.add('is-pop');
    }
    const back = lastFocus && lastFocus.isConnected && !lastFocus.closest('[hidden], .is-launched') ? lastFocus : pill && !pill.hidden ? pill : null;
    back?.focus?.({ preventScroll: true });
  };

  panel.getAnimations().forEach((a) => a.cancel());
  if (isMember || NO_TEASER) hideDock();
  else showPill({ pop: false });

  if (reduce) {
    panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished.then(finish, finish);
    return;
  }
  if (pill && !pill.hidden) {
    // Modaal tõmbub kokku pill'i sisse.
    pill.classList.add('is-launched');
    const p = panel.getBoundingClientRect();
    const t = pill.getBoundingClientRect();
    const cx = t.left + t.width / 2 - (p.left + p.width / 2);
    const cy = t.top + t.height / 2 - (p.top + p.height / 2);
    const s = Math.max(0.06, t.width / p.width);
    panel.style.transformOrigin = '50% 50%';
    panel
      .animate(
        [
          { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
          { offset: 0.75, opacity: 1 },
          { transform: `translate(${cx}px, ${cy}px) scale(${s})`, opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(.55, 0, .75, .1)', fill: 'forwards' },
      )
      .finished.then(finish, finish);
    return;
  }
  panel
    .animate(
      [
        { transform: 'translateY(0px) scale(1)', opacity: 1 },
        { transform: 'translateY(18px) scale(.94)', opacity: 0 },
      ],
      { duration: 280, easing: 'cubic-bezier(.5, 0, .75, 0)', fill: 'forwards' },
    )
    .finished.then(finish, finish);
}

/* ---------- Vorm ---------- */
/** Konkreetne vihje, miks aadress ei sobi (sama loogika mis kassas). */
function emailProblem(email) {
  if (email.length > 254) return 'E-posti aadress on liiga pikk. Kontrolli üle.';
  if (/\s/.test(email)) return 'E-posti aadressis ei saa olla tühikuid.';
  const at = email.indexOf('@');
  if (at < 1 || at === email.length - 1) return 'Aadress tundub poolik — see peaks olema kujul nimi@domeen.ee.';
  if (email.indexOf('@', at + 1) !== -1) return 'E-posti aadressis saab olla ainult üks @-märk.';
  return 'Kontrolli aadressi lõppu — see peaks olema kujul nimi@domeen.ee.';
}

function setError(msg) {
  const input = modal.querySelector('#promo-email');
  const err = modal.querySelector('#promo-email-err');
  err.textContent = msg;
  if (msg) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function setLoading(on) {
  const btn = modal.querySelector('.promo-form__btn');
  btn.classList.toggle('is-loading', on);
  btn.disabled = on;
  btn.setAttribute('aria-busy', String(on));
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const input = form.querySelector('#promo-email');
  const email = input.value.trim();
  if (!email) {
    setError('Sisesta oma e-posti aadress, et kood kätte saada.');
    shake(form);
    input.focus();
    return;
  }
  if (!isValidEmail(email)) {
    setError(emailProblem(email));
    shake(form);
    input.focus();
    return;
  }
  setError('');
  setLoading(true);
  const honey = form.querySelector('[name="bot-field"]').value;
  if (!honey) await submitEmail(email);
  storageSet(EMAIL_KEY, email);
  window.dispatchEvent(new CustomEvent('promo:joined', { detail: { email } }));
  setLoading(false);
  if (!isOpen) return;
  showScratchStep();
}

/** Netlify Forms AJAX-postitus. Võrguvea korral näitame koodi siiski. */
async function submitEmail(email) {
  const body = new URLSearchParams({ 'form-name': 'soodus', email, 'bot-field': '', page: location.pathname });
  const ctrl = 'AbortController' in window ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 8000);
  try {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: ctrl?.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.warn('[promo] E-posti salvestamine ebaõnnestus, näitame koodi siiski.', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function shake(el) {
  if (prefersReducedMotion()) return;
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
    { duration: 380, easing: 'ease-out' },
  );
}

function showScratchStep() {
  const join = stepEl(STEP_JOIN);
  const go = () => {
    setStep(STEP_SCRATCH);
    playStep(STEP_SCRATCH);
    modal.querySelector('.promo-scroll').scrollTop = 0;
    const r = panel.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + Math.min(r.height * 0.4, 260), { count: 90, power: 0.9 });
    modal.querySelector('[data-code-title]').focus({ preventScroll: true });
    live(`Oled sees! Kraabi kaarti või vajuta „Näita koodi“, et näha oma ${PCT_TXT} sooduskoodi.`);
    initScratch();
  };
  if (prefersReducedMotion()) return go();
  join.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(.98)' }], {
    duration: 240,
    easing: 'ease-in',
  }).finished.then(go, go);
}

/* ---------- Kraapekaart ---------- */
function initScratch() {
  destroyScratch();
  const wrap = modal.querySelector('.scratch');
  const canvas = wrap.querySelector('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const state = { wrap, canvas, ctx, done: false, down: false, last: null, moves: 0, w: 0, h: 0, dpr: 1, ro: null };
  scratch = state;
  wrap.classList.remove('is-cleared', 'is-scratching');
  canvas.hidden = false;

  const paint = () => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    state.w = rect.width;
    state.h = rect.height;
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.w * state.dpr);
    canvas.height = Math.round(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    paintFoil(ctx, state.w, state.h);
  };
  const fontsReady = document.fonts?.load
    ? Promise.race([Promise.all([document.fonts.load('800 16px Unbounded'), document.fonts.load('700 12px Manrope')]), new Promise((r) => setTimeout(r, 900))])
    : Promise.resolve();
  paint();
  fontsReady.then(() => scratch === state && !state.done && paint());

  if ('ResizeObserver' in window) {
    let lastW = 0;
    state.ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (lastW && Math.abs(w - lastW) > 2 && !state.done) paint();
      lastW = w;
    });
    state.ro.observe(wrap);
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * state.w, y: ((e.clientY - r.top) / r.height) * state.h };
  };
  const brush = () => (state.w < 340 ? 20 : 23);
  const scratchAt = ({ x, y }) => {
    if (state.done) return;
    wrap.classList.add('is-scratching');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush() * 2;
    if (state.last) {
      ctx.beginPath();
      ctx.moveTo(state.last.x, state.last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, brush(), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    state.last = { x, y };
    if (++state.moves % 5 === 0) checkProgress();
  };
  const checkProgress = () => {
    const { width: W, height: H } = canvas;
    if (!W || !H) return;
    const data = ctx.getImageData(0, 0, W, H).data;
    const step = Math.max(4, Math.round(8 * state.dpr));
    let total = 0;
    let clear = 0;
    for (let y = step >> 1; y < H; y += step) {
      for (let x = step >> 1; x < W; x += step) {
        total++;
        if (data[(y * W + x) * 4 + 3] < 128) clear++;
      }
    }
    if (total && clear / total >= 0.45) revealCode({ viaButton: false });
  };

  const onDown = (e) => {
    state.down = true;
    state.last = null;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pole oluline */
    }
    scratchAt(pos(e));
    e.preventDefault();
  };
  const onMove = (e) => {
    // Hiirega kraabib ka lihtsalt üle libistades; puutega ainult vajutades.
    if (!state.down && e.pointerType !== 'mouse') return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (events.length ? events : [e]).forEach((ev) => scratchAt(pos(ev)));
  };
  const onUp = () => {
    state.down = false;
    state.last = null;
    if (!state.done) checkProgress();
  };
  const onLeave = () => {
    if (!state.down) state.last = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  state.cleanup = () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    state.ro?.disconnect();
  };
}

function destroyScratch() {
  if (!scratch) return;
  scratch.cleanup?.();
  scratch = null;
}

/** Joonistab kraabitava „foolium“-kihi. */
function paintFoil(ctx, w, h) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ff5cc4');
  g.addColorStop(0.42, '#d1007f');
  g.addColorStop(0.75, '#8a1cff');
  g.addColorStop(1, '#5a10c8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // läikiv diagonaaltriip
  const sh = ctx.createLinearGradient(0, 0, w, h * 0.6);
  sh.addColorStop(0.25, 'rgba(255,255,255,0)');
  sh.addColorStop(0.45, 'rgba(255,255,255,.28)');
  sh.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, w, h);

  // peen „ÄGE“ muster
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.28);
  ctx.font = '800 11px Unbounded, "Arial Black", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = -h; y <= h; y += 22) {
    const off = (Math.round(y / 22) % 2) * 26;
    for (let x = -w; x <= w; x += 52) ctx.fillText('ÄGE', x + off, y);
  }
  ctx.restore();

  // sädemed
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < Math.round((w * h) / 900); i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.globalAlpha = 0.2 + Math.random() * 0.6;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;

  // keskmine silt
  const lw = Math.min(w - 32, 250);
  const lh = 50;
  const lx = (w - lw) / 2;
  const ly = (h - lh) / 2;
  ctx.fillStyle = 'rgba(20, 0, 22, .42)';
  roundRect(ctx, lx, ly, lw, lh, lh / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 15px Unbounded, "Arial Black", sans-serif';
  ctx.fillText('✦ KRAABI SIIT ✦', w / 2, h / 2 + 1);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function revealCode({ viaButton }) {
  const step = stepEl(STEP_SCRATCH);
  if (step.classList.contains('is-revealed')) return;
  if (scratch) scratch.done = true;
  step.classList.add('is-revealed');
  const wrap = step.querySelector('.scratch');
  wrap.classList.add('is-cleared');
  const revealBtn = step.querySelector('[data-reveal-code]');
  const hadFocus = document.activeElement === revealBtn;
  revealBtn.hidden = true;
  const actions = step.querySelector('[data-actions]');
  actions.hidden = false;
  step.querySelector('[data-code-lead]').textContent = 'Kood on sinu! Kasuta seda kassas või vajuta „Kasuta kohe“ ja soodustus lisatakse ostukorvi automaatselt.';
  const r = wrap.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { count: 170, power: 1.15 });
  live(`Sinu sooduskood on ${CODE}. ${PCT_TXT} kogu ostult.`);
  if (viaButton || hadFocus) actions.querySelector('[data-use]').focus({ preventScroll: true });
  setTimeout(() => {
    const c = scratch?.canvas;
    if (c && step.classList.contains('is-revealed')) c.hidden = true;
    destroyScratch();
  }, 700);
}

/* ---------- Koodi nupud ---------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* proovime vana meetodit */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    panel.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function onCopy(e) {
  const btn = e.currentTarget;
  const ok = await copyText(CODE);
  const label = btn.querySelector('span');
  if (ok) {
    toast(`Kopeeritud! <strong>${CODE}</strong> on lõikelaual.`, { duration: 2600 });
    btn.classList.add('is-done');
    label.textContent = 'Kopeeritud!';
    setTimeout(() => {
      btn.classList.remove('is-done');
      label.textContent = 'Kopeeri kood';
    }, 2200);
  } else {
    toast(`Kopeerimine ei õnnestunud — sinu kood on <strong>${CODE}</strong>`, { duration: 4200 });
  }
}

function onUse() {
  Cart.applyCode(CODE);
  const empty = Cart.count() === 0;
  const onProduct = document.body.hasAttribute('data-product');
  if (empty && !onProduct) {
    toast(`<strong>${PCT_TXT}</strong> on ostukorvis! Vali nüüd oma mäng.`, { duration: 2200 });
    closeModal();
    setTimeout(() => {
      location.href = '/mida-viiu';
    }, 650);
    return;
  }
  toast(empty ? `<strong>${PCT_TXT}</strong> ootab ostukorvis — lisa mäng korvi!` : `<strong>${PCT_TXT}</strong> on ostukorvis!`, {
    link: empty ? null : { href: '/ostukorv', label: 'Vaata', cart: true },
  });
  closeModal();
}

/* =========================================================================
   Käivitus
   ========================================================================= */
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-open-promo]');
  if (!trigger) return;
  e.preventDefault();
  openModal(trigger);
});
window.addEventListener('promo:open', (e) => {
  const src = e.detail?.source;
  openModal(src instanceof Element ? src : null);
});
window.addEventListener('storage', (e) => {
  if (e.key === EMAIL_KEY && e.newValue && !isOpen) hideDock();
});

scheduleTeaser();
