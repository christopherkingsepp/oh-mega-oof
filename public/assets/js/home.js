// Avaleht: hero 3D karp + parallaks, tootekaardid, komplektid ja MIDA V!!!U eelvaade („Piilu pakki“).
import { PRODUCTS, SHIPPING, formatEur, toCents, productContents } from './catalog.js';
import { mountBox } from './box3d.js';
import { initReveal, esc } from './layout.js';
import { initPreviewDecks, legendHTML, SHOT_RULE } from './preview-deck.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Lävendid (nt „tasuta alates 30 €“) ilma senditeta; hinnad alati formatEur-iga („33,00 €“), nagu kassas. */
const wholeEur = new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurNice = (cents) => (cents % 100 === 0 ? wholeEur.format(cents / 100) : formatEur(cents));
const sumCents = (ids) => ids.reduce((s, id) => s + toCents(PRODUCTS[id]?.price || 0), 0);
const contentsText = (id) => productContents(id).map((c) => `${c.qty}× ${c.name}`).join(', ');

const THEME = { 'mida-viiu': 'mida', 'oled-semu': 'semu', vigur: 'vigur' };

const ICON_CART =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h15l-1.5 9h-12z"/><path d="M6 7 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>';

/* =========================================================================
   Hinnad kataloogist (et leht oleks alati catalog.js-iga kooskõlas)
   ========================================================================= */
function fillPrices() {
  $$('[data-price]').forEach((el) => {
    const p = PRODUCTS[el.dataset.price];
    if (p) el.textContent = formatEur(toCents(p.price));
  });
  $$('[data-bundle-old]').forEach((el) => {
    const p = PRODUCTS[el.dataset.bundleOld];
    if (p?.includes) el.textContent = formatEur(sumCents(p.includes));
  });
  $$('[data-bundle-save]').forEach((el) => {
    const p = PRODUCTS[el.dataset.bundleSave];
    if (p?.includes) el.textContent = formatEur(sumCents(p.includes) - toCents(p.price));
  });
  $$('[data-contents]').forEach((el) => (el.textContent = contentsText(el.dataset.contents)));
  $$('[data-ship-price]').forEach((el) => (el.textContent = formatEur(toCents(SHIPPING.price))));
  $$('[data-ship-free]').forEach((el) => (el.textContent = eurNice(toCents(SHIPPING.freeFrom))));
}

/* =========================================================================
   HERO
   ========================================================================= */
function initHero() {
  const hero = $('[data-hero]');
  const boxEl = $('#hero-box');
  if (!hero || !boxEl) return;
  const p = PRODUCTS['mida-viiu'];

  const box = mountBox(boxEl, {
    faces: p.faces,
    dims: p.dims,
    theme: 'mida',
    speed: 16,
    hint: 'Lohista, et keerutada',
    label: 'MIDA V!!!U mängukarp',
    startAngle: -30,
    tilt: -10,
  });

  // Sissetuleku keerutus: karp vuhiseb sisse ja rahuneb hõljuma.
  if (!REDUCED.matches) setTimeout(() => box.spin(560), 700);

  // Ostukorvi lisamisel teeb karp rõõmust tiiru.
  window.addEventListener('cart:added', (e) => {
    const id = e.detail?.id;
    if (id === 'mida-viiu' || id === 'komplekt-koik') box.spin(780);
  });

  // Kursori kuma + parallaks (ainult hiirega ja kui liikumine on lubatud).
  if (!FINE.matches || REDUCED.matches) return;
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  let mx = 0;
  let my = 0;
  let gx = 0;
  let gy = 0;
  let raf = 0;
  let rect = hero.getBoundingClientRect();

  const loop = () => {
    cx += (tx - cx) * 0.07;
    cy += (ty - cy) * 0.07;
    gx += (mx - gx) * 0.16;
    gy += (my - gy) * 0.16;
    hero.style.setProperty('--px', cx.toFixed(4));
    hero.style.setProperty('--py', cy.toFixed(4));
    hero.style.setProperty('--mx', `${gx.toFixed(1)}px`);
    hero.style.setProperty('--my', `${gy.toFixed(1)}px`);
    const settled = Math.abs(tx - cx) < 0.001 && Math.abs(ty - cy) < 0.001 && Math.abs(mx - gx) < 0.5 && Math.abs(my - gy) < 0.5;
    raf = settled ? 0 : requestAnimationFrame(loop);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };

  hero.addEventListener('pointerenter', () => {
    rect = hero.getBoundingClientRect();
    hero.classList.add('has-pointer');
  });
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    rect = hero.getBoundingClientRect();
    mx = e.clientX - rect.left;
    my = e.clientY - rect.top;
    tx = (mx / rect.width - 0.5) * 2;
    ty = (my / rect.height - 0.5) * 2;
    if (!hero.classList.contains('has-pointer')) {
      hero.classList.add('has-pointer');
      gx = mx;
      gy = my;
    }
    kick();
  });
  hero.addEventListener('pointerleave', () => {
    tx = 0;
    ty = 0;
    hero.classList.remove('has-pointer');
    kick();
  });
}

/* =========================================================================
   Kaldu-efekt (tilt) tootekaartidel
   ========================================================================= */
function initTilt(root = document) {
  if (!FINE.matches || REDUCED.matches) return;
  $$('[data-tilt]', root).forEach((card) => {
    let raf = 0;
    const max = card.classList.contains('game--featured') ? 4.5 : 6.5;
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        card.classList.add('is-tilting');
        card.style.setProperty('--ry', `${((x - 0.5) * max * 2).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - y) * max * 2).toFixed(2)}deg`);
        card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
        card.style.setProperty('--tx', `${((x - 0.5) * 22).toFixed(1)}px`);
        card.style.setProperty('--ty', `${((y - 0.5) * 14).toFixed(1)}px`);
      });
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf);
      card.classList.remove('is-tilting');
      ['--rx', '--ry', '--tx', '--ty'].forEach((v) => card.style.removeProperty(v));
    });
  });
}

/* =========================================================================
   Kõik mängud (renderdatakse PRODUCTS-ist; tootepilt = läbipaistev 3/4 karp)
   ========================================================================= */
function renderGames() {
  const grid = $('[data-games]');
  if (!grid) return;
  const ids = ['mida-viiu', 'oled-semu', 'vigur'];
  grid.innerHTML = ids
    .map((id, i) => {
      const p = PRODUCTS[id];
      if (!p) return '';
      const featured = id === 'mida-viiu';
      const facts = p.facts.slice(0, featured ? 4 : 3);
      const badges = `${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}${p.adult ? '<span class="badge badge--18">18+</span>' : ''}`;
      return `
      <div class="game-cell${featured ? ' game-cell--featured' : ''}" data-reveal style="--delay:${(i * 0.08).toFixed(2)}s">
        <article class="game ${featured ? 'game--featured' : 'game--side'} game--${THEME[id]}" data-tilt
          style="--game-grad:${esc(p.gradient)};--accent:${esc(p.accent)}" aria-labelledby="game-${id}">
          <div class="game__visual">
            ${badges ? `<div class="game__badges">${badges}</div>` : ''}
            <img class="game__img" src="${esc(p.box)}" alt="${esc(p.name)} mängukarp" width="900" height="900" loading="lazy" decoding="async">
            <span class="game__glare" aria-hidden="true"></span>
          </div>
          <div class="game__body">
            <h3 class="game__name" id="game-${id}"><a class="game__link" href="${esc(p.url)}">${esc(p.name)}</a></h3>
            <p class="game__tagline">${esc(p.tagline)}</p>
            <p class="game__short">${esc(p.short)}</p>
            <ul class="game__facts" role="list" aria-label="Mängu andmed">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
            <div class="game__buy">
              <span class="game__price"><span class="sr-only">Hind: </span>${formatEur(toCents(p.price))}</span>
              <div class="game__actions">
                <a class="btn btn--ghost btn--sm game__more" href="${esc(p.url)}" aria-label="Vaata lähemalt: ${esc(p.name)}">Vaata</a>
                <button class="btn btn--primary btn--sm" type="button" data-add-to-cart="${esc(id)}" aria-label="Lisa ostukorvi: ${esc(p.name)}">${ICON_CART}<span>Lisa ostukorvi</span></button>
              </div>
            </div>
          </div>
        </article>
      </div>`;
    })
    .join('');
  initReveal(grid);
  initTilt(grid);
}

/* =========================================================================
   MIDA V!!!U eelvaade + kaarditüüpide legend (andmed: preview-cards.js)
   ========================================================================= */
function initPeek() {
  const legend = $('[data-pvd-legend]');
  if (legend) legend.innerHTML = legendHTML({ tag: 'h3' });
  $$('[data-shot-rule]').forEach((el) => (el.textContent = SHOT_RULE));
  initPreviewDecks();
}

/* =========================================================================
   JSON-LD: suhtelised URL-id absoluutseks (domeeni ei tea enne deploy'd)
   ========================================================================= */
function absolutizeJsonLd() {
  const origin = location.origin;
  if (!/^https?:/.test(origin)) return;
  $$('script[type="application/ld+json"]').forEach((s) => {
    try {
      const data = JSON.parse(s.textContent);
      const walk = (o) => {
        Object.keys(o).forEach((k) => {
          const v = o[k];
          if (v && typeof v === 'object') walk(v);
          else if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) o[k] = origin + v;
        });
      };
      walk(data);
      s.textContent = JSON.stringify(data);
    } catch {
      /* jäta nagu on */
    }
  });
}

/* =========================================================================
   Käivitus
   ========================================================================= */
fillPrices();
renderGames();
initHero();
initPeek();
absolutizeJsonLd();
