// Tootelehtede (/mida-viiu, /oled-semu, /vigur) ühine loogika.
// Leht määrab toote atribuudiga <body data-product="mida-viiu|oled-semu|vigur">.
//
// Siin on: galerii (3D karp + pildid, swipe, pisipildid), kogusevalija, „Osta kohe“,
// 3D-mudeli modaal (Pacdora), MIDA V!!!U eelvaade (preview-deck.js), Oled Semu? ja Viguri
// päris kaartide pakk (card-samples.js, kaardid pööravad), ristmüügi kaardid,
// „lendab ostukorvi“ animatsioon ja JSON-LD täisaadressid.
import { PRODUCTS, formatEur, toCents, MAX_QTY_PER_ITEM, productContents } from './catalog.js';
import { Cart } from './cart.js';
import { SITE } from './site.js';
import { ICONS, trapFocus, initReveal, esc } from './layout.js';
import { mountBox } from './box3d.js';
import { previewCard, CARD_SIZE, SHOT_RULE } from './preview-cards.js';
import { CARD_SAMPLES, CARD_SAMPLE_SIZE } from './card-samples.js';
import { initPreviewDecks, legendHTML } from './preview-deck.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const PID = document.body.dataset.product;
const P = PRODUCTS[PID];
const eur = (price) => formatEur(toCents(price));

/* =========================================================================
   Toodete sisu: 3D karp, galerii, kaardipakk
   ========================================================================= */
const THEME = { 'mida-viiu': 'mida', 'oled-semu': 'semu', vigur: 'vigur' };

/** Kaardipaar galeriisse: tagakülg + esikülg (päris kaardipildid). */
const midaPair = (id, label) => {
  const c = previewCard(id);
  return { kind: 'pair', back: c.back, front: c.img, alt: c.alt, label, size: CARD_SIZE };
};
const samplePair = (game, id, label) => {
  const c = CARD_SAMPLES[game].find((x) => x.id === id);
  return { kind: 'pair', back: c.back, front: c.front, alt: c.alt, label, size: CARD_SAMPLE_SIZE };
};
const boxImage = () => ({ kind: 'image', src: P.box, alt: `${P.name} mängukarp`, label: 'Tootepilt', w: 900, h: 900, contain: true });
const cover = (alt) => ({ kind: 'image', src: P.cover, alt, label: 'Karp eest ja tagant', w: 1600, h: 900, wide: true });

const GALLERY = {
  'mida-viiu': () => [
    { kind: 'box', label: '3D-karp' },
    boxImage(),
    cover('MIDA V!!!U mängukarp eest ja tagant'),
    midaPair('sh-vangi', 'SH-kaardid'),
    midaPair('ot-kaob-ara', 'OT-kaardid'),
    midaPair('shot-telefon', 'SHOT-kaardid'),
    midaPair('age-pealekas', 'Boonuskaardid'),
  ],
  'oled-semu': () => [
    { kind: 'box', label: '3D-karp' },
    boxImage(),
    cover('Oled Semu? mängukarp eest ja tagant'),
    samplePair('oled-semu', 'a300-kohting', 'Küsimuskaardid'),
    samplePair('oled-semu', 'g500-president', 'Küsimuskaardid 500 punkti'),
    samplePair('oled-semu', 'boonus1-pikem', 'Boonuskaardid'),
  ],
  vigur: () => [
    { kind: 'box', label: '3D-karp' },
    boxImage(),
    cover('Vigur mängukarp eest ja tagant'),
    samplePair('vigur', 'olukord-parim-spikker', 'Olukorrakaardid'),
    samplePair('vigur', 'shh-valeta', 'Shh-kaardid'),
  ],
};

/** Oled Semu? ja Viguri kaardipakk päris kaardipiltidest (card-samples.js). */
const sampleFace = (src, alt = '') =>
  `<img src="${esc(src)}" alt="${esc(alt)}" width="${CARD_SAMPLE_SIZE.width}" height="${CARD_SAMPLE_SIZE.height}" loading="lazy" decoding="async" draggable="false">`;

function buildDeck() {
  const list = CARD_SAMPLES[PID];
  if (!list) return null;
  if (PID === 'oled-semu') {
    // järjekord: punktid kasvavad, boonuskaardid vahele
    const order = ['g100-ananassid', 'a200-kelleks', 'boonus1-pikem', 'a300-kohting', 'e400-narvi', 'boonus3-lyhem', 'g500-president'];
    const cards = order.map((id) => list.find((c) => c.id === id)).filter(Boolean);
    return {
      start: 1,
      labels: { 100: '100 punkti', 200: '200 punkti', 300: '300 punkti', 400: '400 punkti', 500: '500 punkti', boonus: 'Boonuskaart' },
      chips: [
        ['100', '100'],
        ['200', '200'],
        ['300', '300'],
        ['400', '400'],
        ['500', '500'],
        ['boonus', 'Boonus'],
      ],
      cards: cards.map((c) => ({
        type: c.kind === 'boonus' ? 'boonus' : String(c.points),
        label: c.meta,
        aria: `${c.meta}: ${c.text}`,
        back: sampleFace(c.back),
        front: sampleFace(c.front, c.alt),
      })),
    };
  }
  const order = ['olukord-eelmine-synnipaev', 'shh-raagi-tott', 'olukord-parim-spikker', 'olukord-raha-kogusin', 'shh-valeta', 'olukord-lemmikmanguasi'];
  const cards = order.map((id) => list.find((c) => c.id === id)).filter(Boolean);
  return {
    start: 1,
    labels: { olukord: 'Olukorrakaart', tott: 'Shh-kaart · Räägi tõtt!', vale: 'Shh-kaart · Valeta!' },
    chips: [
      ['olukord', 'Olukorrad'],
      ['tott', 'Räägi tõtt!'],
      ['vale', 'Valeta!'],
    ],
    cards: cards.map((c) => ({
      type: c.kind === 'olukord' ? 'olukord' : c.id === 'shh-valeta' ? 'vale' : 'tott',
      aria: `${c.meta}: ${c.text}`,
      back: sampleFace(c.back),
      front: sampleFace(c.front, c.alt),
    })),
  };
}

/* =========================================================================
   Hinnad (alati kataloogist, et leht ja makse oleksid samad)
   ========================================================================= */
function renderPrices() {
  document.querySelectorAll('[data-price]').forEach((el) => {
    const p = PRODUCTS[el.dataset.price || PID];
    if (p) el.textContent = eur(p.price);
  });
  document.querySelectorAll('[data-full-price]').forEach((el) => {
    const p = PRODUCTS[el.dataset.fullPrice];
    if (p?.includes) el.textContent = formatEur(p.includes.reduce((s, id) => s + toCents(PRODUCTS[id].price), 0));
  });
  document.querySelectorAll('[data-save]').forEach((el) => {
    const p = PRODUCTS[el.dataset.save];
    if (p?.includes) el.textContent = formatEur(p.includes.reduce((s, id) => s + toCents(PRODUCTS[id].price), 0) - toCents(p.price));
  });
}

/* =========================================================================
   Galerii
   ========================================================================= */
function slideHTML(s, i, n) {
  const a = `role="group" aria-roledescription="slaid" aria-label="${i + 1} / ${n}: ${esc(s.label)}"`;
  if (s.kind === 'box') return `<div class="pdp-slide pdp-slide--box" ${a}><div class="pdp-slide__box" data-box></div></div>`;
  if (s.kind === 'image')
    return `<div class="pdp-slide pdp-slide--image${s.contain ? ' pdp-slide--product' : ''}${s.wide ? ' pdp-slide--wide' : ''}" ${a}><img src="${esc(s.src)}" alt="${esc(s.alt)}" width="${s.w}" height="${s.h}" loading="lazy" decoding="async" draggable="false"></div>`;
  const { width: w, height: h } = s.size;
  return `<div class="pdp-slide pdp-slide--pair" ${a}><div class="pdp-pair" style="--pair-ar:${w} / ${h}">
      <img class="pdp-pair__back" src="${esc(s.back)}" alt="" width="${w}" height="${h}" loading="lazy" decoding="async" draggable="false">
      <img class="pdp-pair__front" src="${esc(s.front)}" alt="${esc(s.alt)}" width="${w}" height="${h}" loading="lazy" decoding="async" draggable="false">
    </div></div>`;
}

function thumbHTML(s, i) {
  let inner;
  if (s.kind === 'box') inner = `<img class="pdp-thumb__contain" src="${esc(P.image)}" alt="" width="240" height="240" decoding="async"><span class="pdp-thumb__tag">3D</span>`;
  else if (s.kind === 'image')
    inner = `<img${s.contain ? ' class="pdp-thumb__contain"' : ''} src="${esc(s.contain ? P.image : s.src)}" alt="" width="${s.contain ? 240 : s.w}" height="${s.contain ? 240 : s.h}" loading="lazy" decoding="async">`;
  else inner = `<img class="pdp-thumb__card" src="${esc(s.front)}" alt="" width="${s.size.width}" height="${s.size.height}" loading="lazy" decoding="async">`;
  return `<button class="pdp-thumb" type="button" data-thumb="${i}" aria-label="Näita: ${esc(s.label)}"${i === 0 ? ' aria-current="true"' : ''}>${inner}</button>`;
}

function initGallery() {
  const root = document.querySelector('[data-gallery]');
  const slides = GALLERY[PID]?.();
  if (!root || !slides) return;
  const stage = root.querySelector('.pdp-stage');
  const track = root.querySelector('[data-track]');
  const thumbs = root.querySelector('[data-thumbs]');
  const countEl = root.querySelector('[data-count]');
  const n = slides.length;
  track.innerHTML = slides.map((s, i) => slideHTML(s, i, n)).join('');
  thumbs.innerHTML = slides.map(thumbHTML).join('');
  root.querySelector('[data-total]').textContent = String(n);
  const thumbEls = [...thumbs.children];
  let cur = 0;

  const setCur = (i) => {
    if (i === cur || i < 0 || i >= n) return;
    cur = i;
    countEl.textContent = String(i + 1);
    stage.dataset.slide = String(i);
    thumbEls.forEach((t, k) => (k === i ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current')));
    const t = thumbEls[i];
    if (thumbs.scrollWidth > thumbs.clientWidth) {
      thumbs.scrollTo({ left: t.offsetLeft - thumbs.clientWidth / 2 + t.offsetWidth / 2, behavior: REDUCED.matches ? 'auto' : 'smooth' });
    }
  };
  // Programmiline kerimine lukustab loenduri sihtslaidile, et see vahepeal ei vilguks.
  let lock = null;
  let lockTimer = 0;
  const unlock = () => {
    lock = null;
    clearTimeout(lockTimer);
  };
  const go = (i) => {
    const k = (i + n) % n;
    setCur(k);
    lock = k;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(unlock, 1500);
    track.scrollTo({ left: k * track.clientWidth, behavior: REDUCED.matches ? 'auto' : 'smooth' });
  };
  ['pointerdown', 'wheel', 'touchstart'].forEach((ev) => track.addEventListener(ev, unlock, { passive: true }));

  let ticking = false;
  track.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const w = Math.max(1, track.clientWidth);
        if (lock !== null) {
          if (Math.abs(track.scrollLeft - lock * w) > 2) return;
          unlock();
        }
        setCur(Math.round(track.scrollLeft / w));
      });
    },
    { passive: true },
  );
  thumbs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-thumb]');
    if (t) go(Number(t.dataset.thumb));
  });
  root.querySelector('[data-prev]')?.addEventListener('click', () => go(cur - 1));
  root.querySelector('[data-next]')?.addEventListener('click', () => go(cur + 1));
  stage.addEventListener('keydown', (e) => {
    if (e.target.closest('.box3d')) return; // karp kasutab nooli ise
    if (e.key === 'ArrowRight') go(cur + 1);
    else if (e.key === 'ArrowLeft') go(cur - 1);
  });
  // Hoia aktiivne slaid paigas, kui akna suurus muutub.
  new ResizeObserver(() => track.scrollTo({ left: cur * track.clientWidth, behavior: 'auto' })).observe(track);

  // 3D karp (püstine: elemendi kõrgus = 2.144 × laius)
  const boxEl = track.querySelector('[data-box]');
  if (boxEl && P.faces) {
    const slide = boxEl.parentElement;
    const size = () => {
      const w = slide.clientWidth;
      const h = slide.clientHeight;
      const bw = Math.max(90, Math.min(w * 0.44, (h * 0.9) / 2.144, 300));
      boxEl.style.setProperty('--w', `${Math.round(bw)}px`);
    };
    size();
    new ResizeObserver(size).observe(slide);
    mountBox(boxEl, {
      faces: P.faces,
      dims: P.dims,
      theme: THEME[PID],
      speed: 16,
      startAngle: -26,
      hint: 'Lohista, et keerutada',
      label: `${P.name} mängukarp`,
    });
  }
}

/* =========================================================================
   Kogus, „Osta kohe“, kogusumma
   ========================================================================= */
function initBuy() {
  const input = document.getElementById('qty');
  if (!input) return;
  const minus = document.querySelector('[data-qty-step="-1"]');
  const plus = document.querySelector('[data-qty-step="1"]');
  const totalEls = document.querySelectorAll('[data-qty-total]');
  const clamp = (v) => Math.max(1, Math.min(MAX_QTY_PER_ITEM, parseInt(v, 10) || 1));

  const sync = () => {
    const q = clamp(input.value);
    minus.disabled = q <= 1;
    plus.disabled = q >= MAX_QTY_PER_ITEM;
    const total = formatEur(toCents(P.price) * q);
    totalEls.forEach((el) => {
      el.hidden = q < 2;
      const strong = el.querySelector('strong');
      if (strong) strong.textContent = total;
    });
  };
  const set = (v) => {
    input.value = String(clamp(v));
    sync();
  };
  minus.addEventListener('click', () => set(clamp(input.value) - 1));
  plus.addEventListener('click', () => set(clamp(input.value) + 1));
  input.addEventListener('input', () => {
    if (input.value !== '') sync();
  });
  input.addEventListener('change', () => set(input.value));
  input.addEventListener('blur', () => set(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      set(input.value);
    }
  });
  set(input.value);

  document.querySelectorAll('[data-buy-now]').forEach((b) =>
    b.addEventListener('click', () => {
      Cart.add(PID, clamp(input.value));
      b.classList.add('is-loading');
      location.href = '/ostukorv';
    }),
  );
}

/* =========================================================================
   „Lendab ostukorvi“ animatsioon
   ========================================================================= */
function initFlyToCart() {
  window.addEventListener('cart:added', (e) => {
    const { id, button } = e.detail || {};
    const p = PRODUCTS[id];
    if (REDUCED.matches || !p || !button || !button.animate) return;
    const target = document.querySelector('.site-header [data-open-cart]');
    if (!target) return;
    const a = button.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const w = 96;
    const el = document.createElement('img');
    el.src = p.image;
    el.alt = '';
    el.className = 'pdp-fly';
    el.style.left = `${a.left + a.width / 2 - w / 2}px`;
    el.style.top = `${a.top + a.height / 2 - w / 2}px`;
    el.style.width = `${w}px`;
    document.body.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = el.animate(
      [
        { transform: 'translate(0, 0) scale(.6) rotate(0deg)', opacity: 0 },
        { transform: 'translate(0, -26px) scale(1.05) rotate(-6deg)', opacity: 1, offset: 0.18 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 70}px) scale(.75) rotate(-14deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(.16) rotate(-28deg)`, opacity: 0.4 },
      ],
      { duration: 900, easing: 'cubic-bezier(.45,.05,.55,.95)' },
    );
    anim.onfinish = () => {
      el.remove();
      target.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', boxShadow: '0 0 26px rgba(255,47,168,.8)' }, { transform: 'scale(1)' }],
        { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' },
      );
    };
  });
}

/* =========================================================================
   3D-mudeli modaal (Pacdora) — iframe laetakse alles avamisel
   ========================================================================= */
// Kas Pacdora vaade avatakse lehe sees (modaalis)? Kui pärast avaldamist selgub, et
// Pacdora keelab raamimise (modaalis on 3D asemel tühi valge kast), pane siia `false`
// — siis avaneb 3D-vaade alati uues aknas, nagu puuteekraanidel praegu.
const EMBED_3D = true;

function initModelModal() {
  const modal = document.querySelector('[data-model-modal]');
  if (!modal) return;
  const backdrop = document.querySelector('[data-model-backdrop]');
  const panel = modal.querySelector('.modal__panel');
  const wrap = modal.querySelector('[data-model-frame]');
  let last = null;
  let loaded = false;
  modal.querySelectorAll('[data-model-link]').forEach((a) => (a.href = SITE.pacdora3d));
  // Puuteekraanil on Pacdora 3D-vaade iframe'is kohmakas (ja kui Pacdora keelab
  // raamimise, jääks modaali ainult tühi kast) — seal avame vaate kohe uues aknas.
  const touch = window.matchMedia('(hover: none) and (pointer: coarse)');
  const external = () => !EMBED_3D || touch.matches;
  const syncTrigger = () =>
    document.querySelectorAll('[data-open-model]').forEach((b) => {
      if (external()) {
        b.removeAttribute('aria-haspopup');
        b.setAttribute('aria-label', `${b.textContent.trim()} (avaneb uues aknas)`);
      } else {
        b.setAttribute('aria-haspopup', 'dialog');
        b.removeAttribute('aria-label');
      }
    });
  syncTrigger();
  touch.addEventListener?.('change', syncTrigger);

  const open = () => {
    last = document.activeElement;
    if (!loaded) {
      loaded = true;
      const f = document.createElement('iframe');
      f.title = `${P.name} karbi 3D-mudel (Pacdora)`;
      f.loading = 'lazy';
      f.allow = 'fullscreen';
      f.setAttribute('allowfullscreen', '');
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.addEventListener('load', () => wrap.classList.add('is-loaded'));
      f.src = SITE.pacdora3d;
      wrap.appendChild(f);
      setTimeout(() => wrap.classList.add('is-slow'), 7000);
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    backdrop?.classList.add('is-open');
    document.body.classList.add('is-locked');
    setTimeout(() => modal.querySelector('[data-close-model]')?.focus(), 60);
  };
  const close = () => {
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    backdrop?.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    if (last?.focus) last.focus();
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-model]')) {
      e.preventDefault();
      if (external()) window.open(SITE.pacdora3d, '_blank', 'noopener');
      else open();
    }
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-close-model]')) close();
  });
  backdrop?.addEventListener('click', close);
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Tab') trapFocus(e, panel);
  });
}

/* =========================================================================
   Kaardipakk: lehvik, mida saab lohistada/swaipida; kaardid pööravad
   ========================================================================= */
function initDeck() {
  const root = document.querySelector('[data-deck]');
  if (!root) return;
  const deck = buildDeck();
  if (!deck) return;
  const stage = root.querySelector('[data-deck-stage]');
  const labelEl = root.querySelector('[data-deck-label]');
  const countEl = root.querySelector('[data-deck-count]');
  const chipsEl = root.querySelector('[data-deck-chips]');
  let data = deck.cards.slice();
  const n = data.length;

  stage.innerHTML = data
    .map(
      (c, i) => `<button class="deck-card" type="button" data-i="${i}" data-type="${c.type}" tabindex="-1" aria-pressed="false" aria-label="${esc(c.aria)}">
        <span class="deck-card__inner">
          <span class="deck-card__face deck-card__face--back">${c.back}</span>
          <span class="deck-card__face deck-card__face--front">${c.front}</span>
        </span>
      </button>`,
    )
    .join('');
  let els = [...stage.children];
  chipsEl.innerHTML = deck.chips
    .map(([type, label]) => `<button class="pdp-deck__chip" type="button" data-jump="${type}" data-t="${type}" aria-pressed="false">${esc(label)}</button>`)
    .join('');
  const chipEls = [...chipsEl.children];

  let pos = Math.min(deck.start, n - 1);
  let target = pos;
  let cur = -1;
  let spacing = 160;
  let raf = 0;
  let lastT = 0;

  const clampI = (i) => Math.max(0, Math.min(n - 1, i));

  function measure() {
    const w = els[0].offsetWidth || 300;
    spacing = w * (window.innerWidth < 700 ? 0.34 : 0.4);
  }

  function layout() {
    for (let i = 0; i < n; i++) {
      const el = els[i];
      const o = i - pos;
      const a = Math.abs(o);
      if (a > 4.4) {
        el.style.visibility = 'hidden';
        continue;
      }
      const s = Math.sign(o);
      const dist = a <= 1 ? a : 1 + (a - 1) * 0.6;
      const x = s * dist * spacing;
      const y = Math.pow(Math.min(a, 4), 1.5) * spacing * 0.1;
      const r = o * 6;
      const sc = 1 - Math.min(a, 4) * 0.07;
      el.style.visibility = 'visible';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${r.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      el.style.zIndex = String(100 - Math.round(a * 10));
      el.style.opacity = a > 3.4 ? String(Math.max(0, 1 - (a - 3.4)).toFixed(2)) : '1';
      el.style.setProperty('--shade', Math.min(0.6, a * 0.2).toFixed(3));
    }
  }

  function setCurrent(i) {
    if (i === cur) return;
    cur = i;
    els.forEach((el, k) => {
      el.classList.toggle('is-center', k === i);
      el.tabIndex = k === i ? 0 : -1;
    });
    const c = data[i];
    labelEl.textContent = c.label || deck.labels[c.type] || '';
    countEl.textContent = `${i + 1} / ${n}`;
    chipEls.forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.t === c.type)));
  }

  let dragging = false;
  function tick(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    if (!dragging) {
      const d = target - pos;
      pos = REDUCED.matches ? target : pos + d * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - pos) < 0.0015) pos = target;
    }
    layout();
    setCurrent(clampI(Math.round(pos)));
    raf = dragging || pos !== target ? requestAnimationFrame(tick) : 0;
  }
  const kick = () => {
    if (raf) return;
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const go = (i, focus = false) => {
    target = clampI(i);
    kick();
    if (focus) els[target].focus({ preventScroll: true });
  };
  const flip = (i, force) => {
    const el = els[i];
    const on = force ?? !el.classList.contains('is-flipped');
    el.classList.toggle('is-flipped', on);
    el.setAttribute('aria-pressed', String(on));
    root.classList.add('has-flipped');
  };

  // Lohistamine / swipe
  let down = false;
  let startX = 0;
  let startPos = 0;
  let lastX = 0;
  let lastMove = 0;
  let vel = 0;
  let pid = null;
  let suppressClick = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = true;
    startX = lastX = e.clientX;
    startPos = pos;
    lastMove = performance.now();
    vel = 0;
    pid = e.pointerId;
  });
  stage.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > 6) {
      dragging = true;
      stage.classList.add('is-dragging');
      try {
        stage.setPointerCapture(pid);
      } catch {}
      kick();
    }
    if (!dragging) return;
    let p = startPos - dx / spacing;
    if (p < 0) p *= 0.3;
    else if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.3;
    pos = p;
    const now = performance.now();
    const inst = (-(e.clientX - lastX) / spacing) / (Math.max(8, now - lastMove) / 1000);
    vel = vel * 0.6 + inst * 0.4;
    lastX = e.clientX;
    lastMove = now;
  });
  const end = () => {
    if (!down) return;
    down = false;
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const fling = performance.now() - lastMove > 90 ? 0 : vel * 0.16;
    target = clampI(Math.round(pos + Math.max(-4, Math.min(4, fling))));
    kick();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('lostpointercapture', end);

  stage.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const c = e.target.closest('.deck-card');
    if (!c) return;
    const i = Number(c.dataset.i);
    if (i === cur) flip(i);
    else go(i, document.activeElement?.closest?.('.deck-card') != null);
  });
  stage.addEventListener('keydown', (e) => {
    const map = { ArrowRight: 1, ArrowLeft: -1 };
    if (e.key in map) {
      e.preventDefault();
      go(target + map[e.key], true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(n - 1, true);
    }
  });

  root.querySelector('[data-deck-prev]').addEventListener('click', () => go(target - 1));
  root.querySelector('[data-deck-next]').addEventListener('click', () => go(target + 1));
  chipsEl.addEventListener('click', (e) => {
    const ch = e.target.closest('[data-jump]');
    if (!ch) return;
    const t = ch.dataset.jump;
    // järgmine selle tüübi kaart (praegusest edasi, ringiga)
    let idx = -1;
    for (let k = 1; k <= n; k++) {
      const j = (target + k) % n;
      if (data[j].type === t) {
        idx = j;
        break;
      }
    }
    if (idx >= 0) {
      go(idx);
      setTimeout(() => flip(idx, true), REDUCED.matches ? 0 : 420);
    }
  });

  const flipAllBtn = root.querySelector('[data-deck-flipall]');
  flipAllBtn?.addEventListener('click', () => {
    const anyBack = els.some((el) => !el.classList.contains('is-flipped'));
    els.forEach((el, i) => setTimeout(() => flip(i, anyBack), REDUCED.matches ? 0 : Math.abs(i - cur) * 45));
    flipAllBtn.querySelector('span').textContent = anyBack ? 'Keera tagasi' : 'Pööra kõik';
  });

  root.querySelector('[data-deck-shuffle]')?.addEventListener('click', () => {
    els.forEach((el) => flip(Number(el.dataset.i), false));
    if (flipAllBtn) flipAllBtn.querySelector('span').textContent = 'Pööra kõik';
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    data = order.map((k) => data[k]);
    els = order.map((k) => els[k]);
    els.forEach((el, i) => {
      el.dataset.i = String(i);
      stage.appendChild(el);
    });
    cur = -1;
    pos = REDUCED.matches ? deck.start : deck.start - 9;
    go(deck.start);
    setTimeout(() => flip(deck.start, true), REDUCED.matches ? 0 : 900);
  });

  measure();
  layout();
  setCurrent(clampI(Math.round(pos)));
  window.addEventListener('resize', () => {
    measure();
    layout();
  });

  // Esimene kaart pöörab end ise ümber, kui pakk vaatesse jõuab.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        setTimeout(() => {
          if (!root.classList.contains('has-flipped')) flip(cur, true);
        }, 700);
      },
      { threshold: 0.6 },
    );
    io.observe(stage);
  }
}

/* =========================================================================
   Vigur: „Tõde või vale?“ minimäng (ainult tõesed faktid ÄGE kohta + ilmsed valed)
   ========================================================================= */
const BLUFF = [
  { q: 'ÄGE müüs 2024/25. õppeaastal üle 200 mängu.', truth: true, a: 'Üle 200 ÄGE mängu leidis 2024/25. õppeaastal oma seltskonna.' },
  { q: 'Viguri pakis on 500 olukorrakaarti.', truth: false, a: 'Olukorrakaarte on 50 ja lisaks 32 salajast „Shh“-tegevuskaarti.' },
  { q: 'ÄGE võitis JA Eesti auhinna „Sotsiaalmeedia täht“.', truth: true, a: 'Auhind tuli õpilasfirmade laadalt Rocca al Mares.' },
  { q: 'Vigurit saab mängida kuni 10 mängijaga.', truth: true, a: 'Reeglite järgi mängib Vigurit kuni 10 inimest — mida rohkem jutustajaid, seda raskem on valetajat tabada.' },
];

function initBluff() {
  const root = document.querySelector('[data-bluff]');
  if (!root) return;
  const card = root.querySelector('.pdp-bluff__card');
  const countEl = root.querySelector('[data-bluff-count]');
  const qEl = root.querySelector('[data-bluff-q]');
  const resEl = root.querySelector('[data-bluff-res]');
  const btns = root.querySelector('[data-bluff-btns]');
  const scoreEl = root.querySelector('[data-bluff-score]');
  const n = BLUFF.length;
  scoreEl.innerHTML = BLUFF.map(() => '<i></i>').join('');
  const dots = [...scoreEl.children];
  let i = 0;
  let score = 0;
  let answered = false;

  const show = () => {
    answered = false;
    card.classList.remove('is-right', 'is-wrong');
    countEl.textContent = `Väide ${i + 1} / ${n}`;
    qEl.textContent = BLUFF[i].q;
    resEl.textContent = '';
    btns.innerHTML = `<button class="btn btn--white" type="button" data-guess="1">Tõde</button><button class="btn btn--dark" type="button" data-guess="0">Vale</button>`;
  };
  const end = () => {
    card.classList.remove('is-right', 'is-wrong');
    countEl.textContent = `Tulemus: ${score} / ${n}`;
    qEl.textContent =
      score === n
        ? 'Sinust ei pääse ükski vale läbi. Vigur ootab sind!'
        : score >= n / 2
          ? 'Pole paha! Aga päris mängus bluffivad su sõbrad palju paremini.'
          : 'Oi-oi… sind on lihtne lollitada. Viguris teeb see asja ainult naljakamaks.';
    resEl.textContent = '';
    btns.innerHTML = `<button class="btn btn--white" type="button" data-add-to-cart="${PID}">${ICONS.cart}<span>Lisa ${esc(P.name)} ostukorvi</span></button><button class="btn btn--dark" type="button" data-bluff-restart>Mängi uuesti</button>`;
  };

  root.addEventListener('click', (e) => {
    const g = e.target.closest('[data-guess]');
    if (g && !answered) {
      answered = true;
      const ok = (g.dataset.guess === '1') === BLUFF[i].truth;
      if (ok) score++;
      dots[i].classList.add(ok ? 'ok' : 'no');
      card.classList.add(ok ? 'is-right' : 'is-wrong');
      const verdict = BLUFF[i].truth ? 'see on tõsi' : 'see on vale';
      resEl.textContent = `${ok ? `Õige, ${verdict}!` : `Said petta — ${verdict}!`} ${BLUFF[i].a}`;
      const last = i === n - 1;
      btns.innerHTML = `<button class="btn btn--white" type="button" ${last ? 'data-bluff-end' : 'data-bluff-next'}>${last ? 'Vaata tulemust' : 'Järgmine väide'} ${ICONS.arrow}</button>`;
      btns.querySelector('button').focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('[data-bluff-next]')) {
      i++;
      show();
      btns.querySelector('button').focus({ preventScroll: true });
    } else if (e.target.closest('[data-bluff-end]')) {
      end();
      btns.querySelector('button').focus({ preventScroll: true });
    } else if (e.target.closest('[data-bluff-restart]')) {
      i = 0;
      score = 0;
      dots.forEach((d) => (d.className = ''));
      show();
      btns.querySelector('button').focus({ preventScroll: true });
    }
  });
  show();
}

/* =========================================================================
   Ristmüük
   ========================================================================= */
function xcardHTML(p) {
  const bundle = Array.isArray(p.includes);
  const full = bundle ? p.includes.reduce((s, id) => s + toCents(PRODUCTS[id].price), 0) : 0;
  const url = bundle ? `/kataloog#${p.id}` : p.url;
  const media = `<img class="xcard__img" src="${esc(p.box || p.image)}" alt="" width="900" height="900" loading="lazy" decoding="async">`;
  const badges = [p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '', p.adult ? '<span class="badge badge--18">18+</span>' : ''].join('');
  const contents = bundle
    ? productContents(p.id)
        .map((c) => `${c.qty}× ${c.name}`)
        .join(', ')
    : p.tagline;
  return `<article class="xcard${bundle ? ' xcard--bundle' : ''}" style="--xgrad:${esc(p.gradient)};--xacc:${esc(p.accent)}" data-reveal>
    <a class="xcard__media" href="${url}" tabindex="-1" aria-hidden="true">${media}<span class="xcard__badges">${badges}</span></a>
    <div class="xcard__body">
      <h3 class="xcard__name"><a href="${url}">${esc(p.name)}</a></h3>
      <p class="xcard__tag">${esc(contents)}</p>
      <div class="xcard__foot">
        <p class="xcard__price"><strong>${formatEur(toCents(p.price))}</strong>${bundle ? `<span class="xcard__was">Eraldi ostes <s>${formatEur(full)}</s></span>` : ''}</p>
        <button class="btn btn--sm ${bundle ? 'btn--primary' : 'btn--ghost'} xcard__add" type="button" data-add-to-cart="${p.id}" aria-label="Lisa ostukorvi: ${esc(p.name)}">${ICONS.cart}<span>Lisa</span></button>
      </div>
    </div>
  </article>`;
}

function initCrossSell() {
  document.querySelectorAll('[data-crosssell]').forEach((el) => {
    const ids = el.dataset.crosssell.split(',').map((s) => s.trim());
    el.innerHTML = ids
      .map((id) => PRODUCTS[id])
      .filter(Boolean)
      .map(xcardHTML)
      .join('');
    el.querySelectorAll('[data-reveal]').forEach((c, i) => c.style.setProperty('--delay', `${i * 0.08}s`));
    initReveal(el);
  });
}

/* =========================================================================
   JSON-LD: suhtelised teed täisaadressideks (domeen pole koodis teada)
   ========================================================================= */
function absolutizeJsonLd() {
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    s.textContent = s.textContent.replace(/"(\/(?!\/)[^"]*)"/g, (_, p) => `"${location.origin}${p}"`);
  });
}

/* =========================================================================
   MIDA V!!!U: eelvaade (preview-deck.js) ja kaarditüüpide legend
   ========================================================================= */
function initPreview() {
  document.querySelectorAll('[data-pvd-legend]').forEach((el) => (el.innerHTML = legendHTML({ tag: 'h3' })));
  document.querySelectorAll('[data-shot-rule]').forEach((el) => (el.textContent = SHOT_RULE));
  initPreviewDecks();
}

/* ---------- Käivitus ---------- */
if (P) {
  renderPrices();
  initGallery();
  initBuy();
  initFlyToCart();
  initModelModal();
  initDeck();
  initPreview();
  initBluff();
  initCrossSell();
  absolutizeJsonLd();
}
