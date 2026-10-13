// Vanusekontroll (18+).
// Näidatakse AINULT lehtedel, mille <body> omab atribuuti `data-agegate`, ja
// ainult siis, kui külastaja pole veel kinnitanud (localStorage 'age_agegate_ok').
// Kinnitamisel saadetakse window sündmus 'agegate:passed'.
// window.__ageGateOpen näitab teistele moodulitele (nt soodushüpikule), kas värav on ees.
//
// See moodul ekspordib ka väikesed ühised abilised ülekatetele (CSS-i laadimine,
// lehe lukustamine), mida kasutab promo.js.
import { trapFocus, esc } from './layout.js';
import { PRODUCTS, formatEur, toCents } from './catalog.js';

const OK_KEY = 'age_agegate_ok';
const CSS_HREF = '/assets/css/overlays.css';

/* ---------- Ühised abilised ---------- */

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* privaatne režiim — toimib siis ainult selle lehe piires */
  }
}

let cssPromise = null;
/** Lisab <head>-i overlays.css-i (kui seda pole) ja ootab, kuni see on laetud. */
export function ensureOverlaysCss() {
  if (cssPromise) return cssPromise;
  let link = document.querySelector(`link[rel="stylesheet"][href="${CSS_HREF}"]`);
  if (link && link.sheet) return (cssPromise = Promise.resolve());
  cssPromise = new Promise((resolve) => {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_HREF;
      document.head.appendChild(link);
    }
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    // Kui fail mingil põhjusel ei vasta, ära jää igaveseks ootama.
    setTimeout(resolve, 4000);
  });
  return cssPromise;
}

let lockCount = 0;
/**
 * Lukustab lehe kerimise ja muudab kõik peale `keep` elemendi(te) inert'iks
 * (fookus ja ekraanilugeja ei pääse ülekatte taha). Tagastab avamise funktsiooni.
 */
export function lockPage(...keep) {
  const skip = (el) =>
    keep.some((k) => k && (el === k || el.contains(k))) ||
    el.inert ||
    el.matches('script, link, style, .toast-region, .promo-fx');
  const touched = [...document.body.children].filter((el) => !skip(el));
  touched.forEach((el) => (el.inert = true));
  if (lockCount++ === 0) {
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    document.body.classList.add('ov-locked');
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    touched.forEach((el) => (el.inert = false));
    if (--lockCount === 0) {
      document.body.classList.remove('ov-locked');
      document.body.style.paddingRight = '';
    }
  };
}

/** Kas vanusekontroll on hetkel ees? */
export const isAgeGateOpen = () => window.__ageGateOpen === true;

/* ---------- Vanusekontroll ---------- */

const needsGate = document.body?.hasAttribute('data-agegate') && storageGet(OK_KEY) !== '1';
window.__ageGateOpen = Boolean(needsGate);

function gameCard(id) {
  const p = PRODUCTS[id];
  if (!p) return '';
  return `
    <a class="ag-game ag-game--${p.id}" href="${p.url}">
      <span class="ag-game__img"><img src="${p.image}" alt="" width="200" height="138" loading="lazy" decoding="async"></span>
      <span class="ag-game__txt">
        <strong>${esc(p.name)}</strong>
        <span>${esc(p.tagline)}</span>
        <em>${formatEur(toCents(p.price))} · 12+</em>
      </span>
      <svg class="ag-game__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </a>`;
}

function buildGate() {
  const el = document.createElement('div');
  el.className = 'agegate grain';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'ag-title');
  el.setAttribute('aria-describedby', 'ag-desc');
  el.tabIndex = -1;
  // Kriitiline stiil otse elemendil: värav katab lehe kohe, ka enne kui overlays.css on laetud.
  el.style.cssText = 'position:fixed;inset:0;z-index:200;background:#07030a;';
  el.innerHTML = `
    <div class="bg-blobs agegate__blobs" aria-hidden="true">
      <span style="--x:-18%;--y:-12%;--s:62vmax;--c:rgba(255,20,160,.62);--d:16s;--dx:8vw;--dy:6vh"></span>
      <span style="--x:58%;--y:-20%;--s:54vmax;--c:rgba(205,0,140,.5);--d:21s;--dx:-6vw;--dy:8vh"></span>
      <span style="--x:62%;--y:52%;--s:58vmax;--c:rgba(255,40,170,.48);--d:19s;--dx:-8vw;--dy:-6vh"></span>
      <span style="--x:-22%;--y:58%;--s:50vmax;--c:rgba(150,0,120,.55);--d:24s;--dx:6vw;--dy:-8vh"></span>
    </div>
    <div class="agegate__inner" style="visibility:hidden">
      <img class="agegate__brand" src="/assets/img/brand/age-logo-white.webp" alt="ÄGE" width="70" height="52">

      <section class="agegate__step agegate__step--ask" data-ag-step="ask">
        <div class="agegate__logo-wrap">
          <img class="agegate__logo" src="/assets/img/brand/mida-viiu-logo.webp" alt="MIDA V!!!U" width="460" height="227">
          <span class="agegate__stamp" aria-hidden="true"><span>18+</span></span>
        </div>
        <h2 class="agegate__q" id="ag-title">Oled sa vähemalt <span class="neon">18-aastane?</span></h2>
        <p class="agegate__sub" id="ag-desc">Enne kui pidu algab, pead kinnitama oma vanuse.</p>
        <div class="agegate__actions">
          <button class="btn btn--primary btn--lg agegate__yes" type="button" data-ag-yes>Jah, olen 18+</button>
          <button class="btn btn--ghost btn--lg agegate__no" type="button" data-ag-no>Ei ole</button>
        </div>
        <p class="agegate__fine">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>
          <span>MIDA V!!!U sisaldab täiskasvanutele mõeldud küsimusi ja alkoholiga seotud ülesandeid.</span>
        </p>
      </section>

      <section class="agegate__step agegate__step--no" data-ag-step="no" hidden>
        <div class="agegate__wave" aria-hidden="true">✌️</div>
        <h2 class="agegate__q agegate__q--sm" id="ag-no-title" tabindex="-1">Pole hullu&nbsp;— <span class="neon">sinu pidu on siin!</span></h2>
        <p class="agegate__sub">MIDA V!!!U on mõeldud ainult täiskasvanutele. Aga ära kurvasta: need kaks ÄGE mängu sobivad kõigile alates 12. eluaastast ja naeru jagub kuhjaga.</p>
        <div class="agegate__games">
          ${gameCard('oled-semu')}
          ${gameCard('vigur')}
        </div>
        <button class="agegate__back" type="button" data-ag-back>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
          Vajutasin kogemata, tagasi
        </button>
      </section>
    </div>
    <p class="sr-only" aria-live="polite" data-ag-live></p>`;
  return el;
}

function initGate() {
  const gate = buildGate();
  document.body.appendChild(gate);
  const inner = gate.querySelector('.agegate__inner');
  const ask = gate.querySelector('[data-ag-step="ask"]');
  const no = gate.querySelector('[data-ag-step="no"]');
  const unlock = lockPage(gate);
  let leaving = false;

  // Ilmu alles siis, kui stiilid on olemas (muidu vilksataks stiilita sisu).
  ensureOverlaysCss().then(() => {
    inner.style.visibility = '';
    gate.classList.add('is-ready');
    gate.focus({ preventScroll: true });
  });

  gate.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Vanusekontroll ei sulgu Esc-iga.
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      if (document.activeElement === gate) {
        // Dialoog ise on fookuses: suuna esimesele/viimasele nupule.
        const f = [...gate.querySelectorAll('button, a[href]')].filter((x) => x.offsetParent !== null);
        if (f.length) {
          e.preventDefault();
          (e.shiftKey ? f[f.length - 1] : f[0]).focus();
        }
        return;
      }
      trapFocus(e, gate);
    }
  });

  const showStep = (from, to, focusEl) => {
    if (prefersReducedMotion()) {
      from.hidden = true;
      to.hidden = false;
      focusEl?.focus({ preventScroll: true });
      return;
    }
    from.classList.add('is-leaving');
    setTimeout(() => {
      from.hidden = true;
      from.classList.remove('is-leaving');
      to.hidden = false;
      to.classList.add('is-entering');
      focusEl?.focus({ preventScroll: true });
      setTimeout(() => to.classList.remove('is-entering'), 900);
    }, 260);
  };

  gate.querySelector('[data-ag-no]').addEventListener('click', () => {
    showStep(ask, no, gate.querySelector('#ag-no-title'));
    gate.setAttribute('aria-labelledby', 'ag-no-title');
  });
  gate.querySelector('[data-ag-back]').addEventListener('click', () => {
    showStep(no, ask, gate.querySelector('[data-ag-yes]'));
    gate.setAttribute('aria-labelledby', 'ag-title');
  });

  gate.querySelector('[data-ag-yes]').addEventListener('click', (e) => {
    if (leaving) return;
    leaving = true;
    storageSet(OK_KEY, '1');
    gate.querySelector('[data-ag-live]').textContent = 'Vanus kinnitatud. Head pidu!';
    const r = e.currentTarget.getBoundingClientRect();
    const finish = () => {
      unlock();
      gate.remove();
      window.__ageGateOpen = false;
      window.dispatchEvent(new CustomEvent('agegate:passed'));
    };
    if (prefersReducedMotion()) {
      gate.classList.add('is-fading');
      setTimeout(finish, 260);
      return;
    }
    irisOut(gate, r.left + r.width / 2, r.top + r.height / 2, finish);
  });
}

/**
 * Efektne väljumine: sisu sähvatab ja paisub, seejärel avaneb nupu kohalt
 * kasvav neoonrõngas, mille seest paistab leht.
 */
function irisOut(gate, x, y, done) {
  gate.classList.add('is-leaving');
  const ring = document.createElement('div');
  ring.className = 'agegate__ring';
  ring.setAttribute('aria-hidden', 'true');
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  gate.appendChild(ring);

  const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 40;
  const delay = 280;
  const dur = 900;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let start = 0;
  const frame = (now) => {
    if (!start) start = now;
    const t = Math.min(1, Math.max(0, (now - start - delay) / dur));
    const r = ease(t) * maxR;
    if (t > 0) {
      const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 1.5}px)`;
      gate.style.webkitMaskImage = mask;
      gate.style.maskImage = mask;
      ring.style.width = ring.style.height = `${(r + 4) * 2}px`;
      ring.style.opacity = String(t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15);
    }
    if (t < 1) requestAnimationFrame(frame);
    else done();
  };
  requestAnimationFrame(frame);
}

if (needsGate) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGate, { once: true });
  else initGate();
}
