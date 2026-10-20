// MIDA V!!!U eelvaade („Piilu pakki“): ühine komponent avalehele ja /mida-viiu lehele.
//
// Andmed tulevad AINULT preview-cards.js-ist (19 avalikku kaarti). Voor = 10 erinevat kaarti
// segatud järjekorras (drawRound); sirvitakse üks kaart korraga: swipe, nooled, klaviatuur.
// Kaart tuleb pakist tagakülg üleval (tüüp on seljalt näha) ja pöördub puudutusega esiküljele.
// Kui kasutaja on ühe kaardi ise ümber pööranud, pöörduvad järgmised kaardid ise.
//
//   import { mountPreviewDeck, legendHTML } from './preview-deck.js';
//   mountPreviewDeck(document.querySelector('[data-preview-deck]'), { cta: 'mida-viiu' });
import { PREVIEW_CARDS, CATEGORY_INFO, BONUS_INFO, CARD_SIZE, SHOT_RULE, drawRound } from './preview-cards.js';
import { PRODUCTS, formatEur, toCents } from './catalog.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const ROUND = 10;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SVG = {
  prev: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  next: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  shuffle:
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h3.2c2 0 3.2 1 4.3 2.6l2.9 4.8c1.1 1.6 2.3 2.6 4.3 2.6H21"/><path d="M3 17h3.2c1.3 0 2.3-.4 3.1-1.2"/><path d="M14.6 8.2c.8-.8 1.8-1.2 3.1-1.2H21"/><path d="m18 4 3 3-3 3M18 14l3 3-3 3"/></svg>',
  flip: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/></svg>',
  cart: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h15l-1.5 9h-12z"/><path d="M6 7 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
};

const imgTag = (src, cls, alt = '') =>
  `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" width="${CARD_SIZE.width}" height="${CARD_SIZE.height}" decoding="async" draggable="false">`;

/** Kaarditüüpide legend (päris reeglite järgi, CATEGORY_INFO). */
export function legendHTML({ tag = 'h3' } = {}) {
  return Object.values(CATEGORY_INFO)
    .map(
      (c) => `<li class="pvd-legend__item" style="--pvd-c:${esc(c.color)};--pvd-g:${esc(c.gradient)}">
        <img class="pvd-legend__back" src="${esc(c.back)}" alt="" width="${CARD_SIZE.width}" height="${CARD_SIZE.height}" loading="lazy" decoding="async">
        <div class="pvd-legend__body">
          <p class="pvd-legend__meta"><span class="pvd-code">${esc(c.code)}</span><span>${c.count} kaarti</span></p>
          <${tag} class="pvd-legend__name">${esc(c.name)}</${tag}>
          <p class="pvd-legend__text">${esc(c.description)}</p>
        </div>
      </li>`,
    )
    .join('');
}

export { SHOT_RULE };

/**
 * Paigaldab eelvaate elemendi sisse.
 * @param {HTMLElement} root
 * @param {{ cta?: string|null, label?: string }} [opts] cta = toote id, mille ostukorvi lisamise nupp
 *   ilmub vooru lõpus (nt 'mida-viiu').
 */
export function mountPreviewDeck(root, opts = {}) {
  if (!root || root.dataset.pvdReady) return null;
  root.dataset.pvdReady = '1';
  const ctaId = opts.cta ?? root.dataset.cta ?? null;
  const cta = ctaId && PRODUCTS[ctaId] ? PRODUCTS[ctaId] : null;
  const uid = `pvd-${Math.random().toString(36).slice(2, 8)}`;

  root.classList.add('pvd');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'kaardipakk');
  root.setAttribute('aria-label', opts.label || 'MIDA V!!!U eelvaade: 10 kaarti korraga');
  root.innerHTML = `
    <div class="pvd__head">
      <p class="pvd__cat" data-cat><span class="pvd-code" data-code></span><span class="pvd__name" data-name></span><span class="pvd__bonus" data-bonus hidden></span></p>
      <p class="pvd__count" aria-hidden="true"><b data-pos>1</b><span> / </span><span data-total>${ROUND}</span></p>
    </div>
    <div class="pvd__progress" aria-hidden="true" data-progress></div>
    <div class="pvd__stage" data-stage>
      <div class="pvd__pile" aria-hidden="true" data-pile></div>
      <div class="pvd__shadow" aria-hidden="true"></div>
      <button class="pvd__card" type="button" data-card aria-describedby="${uid}-desc">
        <span class="pvd__inner">
          <span class="pvd__face pvd__face--back" data-back></span>
          <span class="pvd__face pvd__face--front" data-front></span>
        </span>
        <span class="pvd__tap" aria-hidden="true">${SVG.flip}<span>Pööra</span></span>
      </button>
      <div class="pvd__end" data-end hidden tabindex="-1">
        <p class="pvd__end-kicker">Voor läbi</p>
        <p class="pvd__end-title">10 kaarti nähtud.<br><span>75 ootavad karbis.</span></p>
        <p class="pvd__end-text">Need on avalikud näidiskaardid. Ülejäänud kaardid näed alles mängulauas.</p>
        <div class="pvd__end-btns">
          <button class="btn btn--ghost btn--sm" type="button" data-again>${SVG.shuffle}<span>Uus voor</span></button>
          ${
            cta
              ? `<button class="btn btn--primary btn--sm" type="button" data-add-to-cart="${esc(cta.id)}" aria-label="Lisa ostukorvi: ${esc(cta.name)}, ${esc(formatEur(toCents(cta.price)))}">${SVG.cart}<span>Lisa ostukorvi · ${esc(formatEur(toCents(cta.price)))}</span></button>`
              : ''
          }
        </div>
      </div>
    </div>
    <p class="pvd__desc" id="${uid}-desc" data-desc></p>
    <div class="pvd__bar">
      <button class="pvd__nav" type="button" data-prev aria-label="Eelmine kaart">${SVG.prev}</button>
      <button class="btn btn--ghost pvd__shuffle" type="button" data-shuffle>${SVG.shuffle}<span>Sega</span></button>
      <button class="pvd__nav pvd__nav--next" type="button" data-next aria-label="Järgmine kaart">${SVG.next}</button>
    </div>
    <p class="sr-only" aria-live="polite" aria-atomic="true" data-live></p>`;

  const $ = (s) => root.querySelector(s);
  const stage = $('[data-stage]');
  const card = $('[data-card]');
  const backEl = $('[data-back]');
  const frontEl = $('[data-front]');
  const endEl = $('[data-end]');
  const pile = $('[data-pile]');
  const progress = $('[data-progress]');
  const codeEl = $('[data-code]');
  const nameEl = $('[data-name]');
  const bonusEl = $('[data-bonus]');
  const posEl = $('[data-pos]');
  const totalEl = $('[data-total]');
  const descEl = $('[data-desc]');
  const live = $('[data-live]');
  const prevBtn = $('[data-prev]');
  const nextBtn = $('[data-next]');

  let round = drawRound(ROUND);
  let index = 0; // 0..round.length (round.length = lõpuvaade)
  let flipped = false;
  let autoReveal = false; // pärast esimest käsitsi pööramist pöörduvad kaardid ise
  let busy = false;
  let revealTimer = 0;

  const preload = (src) => {
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
  };

  function setFlip(on, { announce = true } = {}) {
    flipped = on;
    card.classList.toggle('is-flipped', on);
    card.setAttribute('aria-pressed', String(on));
    const c = round[index];
    if (!c) return;
    const info = CATEGORY_INFO[c.type];
    card.setAttribute(
      'aria-label',
      on
        ? `Kaart ${index + 1} / ${round.length}, ${info.code}-kaart: ${c.text}. Vajuta, et pöörata tagasi.`
        : `Kaart ${index + 1} / ${round.length}, ${info.code}-kaardi tagakülg (${info.name}). Vajuta, et kaart ümber pöörata.`,
    );
    if (announce && on) live.textContent = `${info.name}: ${c.text}`;
  }

  function renderPile() {
    const next = round.slice(index + 1, index + 3);
    pile.innerHTML = next
      .map((c, i) => `<span class="pvd__pile-card" style="--i:${i + 1}">${imgTag(c.back, 'pvd__pile-img')}</span>`)
      .join('');
  }

  function renderProgress() {
    if (progress.children.length !== round.length) progress.innerHTML = round.map(() => '<i></i>').join('');
    [...progress.children].forEach((el, i) => {
      el.classList.toggle('is-done', i < index);
      el.classList.toggle('is-on', i === index);
    });
  }

  function render({ fromNav = false } = {}) {
    clearTimeout(revealTimer);
    const atEnd = index >= round.length;
    totalEl.textContent = String(round.length);
    posEl.textContent = String(Math.min(index + 1, round.length));
    prevBtn.disabled = index === 0;
    nextBtn.disabled = atEnd;
    renderProgress();
    root.classList.toggle('is-end', atEnd);
    endEl.hidden = !atEnd;
    card.hidden = atEnd;
    if (atEnd) {
      pile.innerHTML = '';
      root.style.removeProperty('--pvd-c');
      root.style.removeProperty('--pvd-g');
      codeEl.textContent = '✦';
      nameEl.textContent = 'Voor läbi';
      bonusEl.hidden = true;
      descEl.textContent = 'Karbis on 85 kaarti: 25 SH, 25 OT, 25 SHOT, 5 boonuskaarti, 3 peidetud „Üllatus!“-kaarti ja 2 reeglikaarti. Vajuta „Sega“, et näha uut valikut.';
      live.textContent = 'Voor läbi. Vajuta „Sega“, et segada uus voor.';
      return;
    }
    const c = round[index];
    const info = CATEGORY_INFO[c.type];
    root.style.setProperty('--pvd-c', info.color);
    root.style.setProperty('--pvd-g', info.gradient);
    root.dataset.type = c.type;
    codeEl.textContent = info.code;
    nameEl.textContent = info.name;
    if (c.bonus && BONUS_INFO[c.bonus]) {
      bonusEl.hidden = false;
      bonusEl.textContent = BONUS_INFO[c.bonus].label;
      bonusEl.dataset.bonus = c.bonus;
    } else {
      bonusEl.hidden = true;
    }
    descEl.textContent = c.bonus && BONUS_INFO[c.bonus] ? `${info.short} ${BONUS_INFO[c.bonus].description}` : info.short;
    backEl.innerHTML = imgTag(c.back, 'pvd__img');
    frontEl.innerHTML = imgTag(c.img, 'pvd__img', c.alt);
    // uus kaart tuleb pakist alati tagakülg üleval
    card.classList.add('no-anim');
    setFlip(false, { announce: false });
    void card.offsetWidth;
    card.classList.remove('no-anim');
    renderPile();
    if (fromNav) live.textContent = `Kaart ${index + 1} / ${round.length}: ${info.code} – ${info.name}${c.bonus ? `, ${BONUS_INFO[c.bonus].label.toLowerCase()}` : ''}.`;
    if (autoReveal) {
      if (REDUCED.matches) setFlip(true, { announce: fromNav });
      else revealTimer = setTimeout(() => setFlip(true), 360);
    }
    // eellae järgmised pildid
    const n1 = round[index + 1];
    if (n1) {
      preload(n1.img);
      preload(n1.back);
    }
  }

  function go(delta, { drag = null } = {}) {
    const to = Math.max(0, Math.min(round.length, index + delta));
    if (to === index || busy) return;
    const dir = Math.sign(to - index);
    const focusCard = document.activeElement === card;
    if (!REDUCED.matches) {
      // väljuv kaart (koopia) lendab kõrvale, uus kaart tõuseb pakist
      const leaving = index >= round.length ? endEl : card;
      const ghost = leaving.cloneNode(true);
      ghost.classList.add('pvd__ghost');
      ghost.removeAttribute('data-card');
      ghost.removeAttribute('data-end');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      ghost.querySelectorAll('button, [tabindex]').forEach((el) => (el.tabIndex = -1));
      ghost.inert = true;
      stage.appendChild(ghost);
      const from = drag ? `translateX(${drag.dx}px) rotate(${drag.dx / 22}deg)` : 'none';
      ghost
        .animate(
          [
            { transform: from, opacity: 1 },
            { transform: `translateX(${-dir * 115}%) translateY(4%) rotate(${-dir * 16}deg)`, opacity: 0 },
          ],
          { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
        )
        .finished.catch(() => {})
        .then(() => ghost.remove());
    }
    index = to;
    card.style.transform = '';
    endEl.style.transform = '';
    render({ fromNav: true });
    if (!REDUCED.matches) {
      const target = index >= round.length ? endEl : card;
      busy = true;
      target
        .animate(
          [
            { transform: `translateX(${dir * 10}%) translateY(7%) scale(.9) rotate(${dir * 5}deg)`, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 460, easing: 'cubic-bezier(.22,1.2,.36,1)' },
        )
        .finished.catch(() => {})
        .then(() => (busy = false));
      setTimeout(() => (busy = false), 180); // lase kiirelt edasi klõpsida
    }
    if (index >= round.length) endEl.focus({ preventScroll: true });
    else if (focusCard) card.focus({ preventScroll: true });
  }

  function shuffle() {
    const prevIds = round.map((c) => c.id);
    round = drawRound(ROUND, prevIds);
    index = 0;
    progress.innerHTML = '';
    if (!REDUCED.matches) {
      stage.classList.remove('is-shuffling');
      void stage.offsetWidth;
      stage.classList.add('is-shuffling');
      setTimeout(() => stage.classList.remove('is-shuffling'), 700);
    }
    render();
    live.textContent = `Uus voor: ${round.length} kaarti segatud. Kaart 1 / ${round.length}.`;
  }

  /* ---------- sündmused ---------- */
  let suppressClick = false;
  card.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    clearTimeout(revealTimer);
    const on = !flipped;
    if (on) autoReveal = true;
    root.classList.add('has-flipped');
    setFlip(on);
  });
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  $('[data-shuffle]').addEventListener('click', shuffle);
  $('[data-again]').addEventListener('click', () => {
    shuffle();
    card.focus({ preventScroll: true });
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  });

  // Swipe / lohistamine (vertikaalne kerimine jääb brauserile: touch-action: pan-y)
  let start = null;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let vx = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.pvd__end button')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragging = false;
    lastX = e.clientX;
    lastT = performance.now();
    vx = 0;
  });
  stage.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        dragging = true;
        clearTimeout(revealTimer);
        stage.classList.add('is-dragging');
        try {
          stage.setPointerCapture(e.pointerId);
        } catch {}
      } else if (Math.abs(dy) > 12) {
        start = null;
        return;
      } else return;
    }
    const now = performance.now();
    vx = vx * 0.5 + ((e.clientX - lastX) / Math.max(8, now - lastT)) * 0.5;
    lastX = e.clientX;
    lastT = now;
    // servades vastupanu
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index >= round.length);
    const tx = atEdge ? dx * 0.25 : dx;
    const el = index >= round.length ? endEl : card;
    el.style.transform = `translateX(${tx}px) rotate(${tx / 22}deg)`;
  });
  const end = (e) => {
    if (!start || (e && e.pointerId !== start.id)) return;
    const dx = (e?.clientX ?? lastX) - start.x;
    start = null;
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const el = index >= round.length ? endEl : card;
    const width = stage.clientWidth || 320;
    const fling = Math.abs(vx) > 0.45;
    if ((dx < -width * 0.18 || (fling && vx < 0 && dx < -20)) && index < round.length) go(1, { drag: { dx } });
    else if ((dx > width * 0.18 || (fling && vx > 0 && dx > 20)) && index > 0) go(-1, { drag: { dx } });
    else {
      // tagasi kohale
      const from = el.style.transform;
      el.style.transform = '';
      if (from && !REDUCED.matches) el.animate([{ transform: from }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1.3,.36,1)' });
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', (e) => {
    if (dragging) end(e);
    start = null;
  });

  render();
  return {
    next: () => go(1),
    prev: () => go(-1),
    shuffle,
    get round() {
      return round.map((c) => c.id);
    },
    get index() {
      return index;
    },
  };
}

/** Paigaldab kõik [data-preview-deck] elemendid lehel. */
export function initPreviewDecks(root = document) {
  return [...root.querySelectorAll('[data-preview-deck]')].map((el) => mountPreviewDeck(el));
}

// Testimiseks (Playwright): kõik avalikud kaardi-id-d
export const PREVIEW_IDS = Object.freeze(PREVIEW_CARDS.map((c) => c.id));
