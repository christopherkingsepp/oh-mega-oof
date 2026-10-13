// Tootelehtede (/mida-viiu, /oled-semu, /vigur) ühine loogika.
// Leht määrab toote atribuudiga <body data-product="mida-viiu|oled-semu|vigur">.
//
// Siin on: galerii (3D karp + pildid, swipe, pisipildid), kogusevalija, „Osta kohe“,
// kleepuv osturiba, 3D-mudeli modaal (Pacdora), lohistatav kaardipakk (kaardid pööravad),
// ristmüügi kaardid, „lendab ostukorvi“ animatsioon ja JSON-LD täisaadressid.
import { PRODUCTS, formatEur, toCents, MAX_QTY_PER_ITEM } from './catalog.js';
import { Cart } from './cart.js';
import { SITE } from './site.js';
import { ICONS, trapFocus, initReveal, esc } from './layout.js';
import { mountBox } from './box3d.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const PID = document.body.dataset.product;
const P = PRODUCTS[PID];
const card = (n) => `/assets/img/cards/${n}.webp`;
const eur = (price) => formatEur(toCents(price));

/* =========================================================================
   HTML-kaardid (Oled Semu? ja Vigur — neil pole kaardipilte)
   Mõõdud skaleeruvad konteineri järgi (cqw), nii et sama märgistus töötab
   pisipildis, galeriis ja kaardipakis.
   ========================================================================= */
const dots = (n) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

const HC = {
  semuBack: () =>
    `<span class="hcard hcard--semu-back"><span class="hcard__in">
      <img class="hcard__brand" src="/assets/img/brand/age-logo-pink.webp" alt="" width="161" height="112" loading="lazy" draggable="false">
      <span class="hcard__semu"><span>Oled</span><span>Semu<b>?</b></span></span>
      <span class="hcard__label">Seltskonna kaardimäng</span>
    </span></span>`,
  semuQ: (pts, q) =>
    `<span class="hcard hcard--semu"><span class="hcard__in">
      <span class="hcard__label">„Oled Semu?“</span>
      <span class="hcard__text">${esc(q)}</span>
      <span class="hcard__level" aria-hidden="true">${dots(pts / 100)}</span>
    </span><span class="hcard__pts" aria-hidden="true">${pts}<small>p</small></span></span>`,
  semuBonus: (letter) =>
    `<span class="hcard hcard--bonus"><span class="hcard__in">
      <span class="hcard__label">Boonuskaart</span>
      <span class="hcard__letter">${esc(letter)}</span>
      <span class="hcard__small">Kogu kokku ÄGE ja varasta teistelt punkte!</span>
    </span></span>`,
  vigurBack: () =>
    `<span class="hcard hcard--vigur-back"><span class="hcard__bgword" aria-hidden="true">Vigur Vigur Vigur Vigur</span><span class="hcard__in">
      <img class="hcard__brand" src="/assets/img/brand/age-logo-pink.webp" alt="" width="161" height="112" loading="lazy" draggable="false">
      <span class="hcard__vigur">Vigur</span>
      <span class="hcard__label">Olukorrakaart</span>
    </span></span>`,
  vigurSit: (text) =>
    `<span class="hcard hcard--vigur"><span class="hcard__in">
      <span class="hcard__label">Olukord</span>
      <span class="hcard__serif">${esc(text)}</span>
      <span class="hcard__small">Räägi nii, et sind usutakse.</span>
    </span></span>`,
  shhBack: () =>
    `<span class="hcard hcard--shh-back"><span class="hcard__in">
      <span class="hcard__label">Tegevuskaart</span>
      <span class="hcard__shh">Shh…</span>
      <span class="hcard__small">Ära näita kellelegi</span>
    </span></span>`,
  shhFront: (truth) =>
    `<span class="hcard hcard--shh ${truth ? 'hcard--truth' : 'hcard--lie'}"><span class="hcard__in">
      <span class="hcard__label">Shh…</span>
      <span class="hcard__text">${truth ? 'Räägi tõtt' : 'Valeta'}</span>
      <span class="hcard__small">${truth ? 'Iga sõna peab olema päriselt juhtunud.' : 'Mõtle välja nii hea lugu, et keegi ei kahtle.'}</span>
    </span></span>`,
};

const imgFace = (src, alt = '') =>
  `<img src="${src}" alt="${esc(alt)}" width="760" height="509" loading="lazy" decoding="async" draggable="false">`;

/* =========================================================================
   Toodete sisu: 3D karp, galerii, kaardipakk
   ========================================================================= */
const BOX = {
  'mida-viiu': { theme: 'mida', title: 'MIDA V!!!U', tagline: 'Rohkem kui kaardimäng', facts: ['85 kaarti', '50+ shotti', '18+'] },
  'oled-semu': { theme: 'semu', title: 'OLED SEMU?', tagline: 'Seltskonna kaardimäng', facts: ['75 küsimust', '5 raskusastet', '7 boonuskaarti'] },
  vigur: { theme: 'vigur', title: 'VIGUR', tagline: 'Seltskonna kaardimäng', facts: ['50 olukorda', '32 Shh-kaarti', 'Bluffi!'] },
};

const GALLERY = {
  'mida-viiu': [
    { kind: 'box', label: '3D-karp' },
    { kind: 'image', src: '/assets/img/games/mida-viiu-cover.webp', alt: 'MIDA V!!!U kaanepilt: neoonroosa logo mustal taustal', label: 'Kaanepilt' },
    { kind: 'pair', back: card('back-sh'), front: card('sh-vangi'), alt: 'SH-kaart: „Mille eest ma vangi läheksin? (Parim vastus saab kaardi)“', label: 'SH-kaardid' },
    { kind: 'pair', back: card('back-ot'), front: card('ot-kaob-ara'), alt: 'OT-kaart: „Kes kaob ära õhtu jooksul?“', label: 'OT-kaardid' },
    { kind: 'pair', back: card('back-shot'), front: card('shot-telefon'), alt: 'SHOT-kaart: „Anna oma telefon viieks minutiks teiste kasutusse“', label: 'SHOT-kaardid' },
    { kind: 'pair', back: card('back-age'), front: card('age-pealekas'), alt: 'ÄGE boonuskaart: „Pealekas läinud kolmeks ringiks“', label: 'ÄGE boonuskaardid' },
    { kind: 'pair', back: card('reeglid-1'), front: card('reeglid-2'), alt: 'Reeglikaardid: SHOT – tõde/tegu või joo, ÄGE – väljapääsu pole, ja vastutustundliku mängimise hoiatus', label: 'Reeglikaardid' },
  ],
  'oled-semu': [
    { kind: 'box', label: '3D-karp' },
    { kind: 'image', src: '/assets/img/games/oled-semu-cover.webp', alt: 'Oled Semu? kaanepilt: roosa-lilla logo sinakaslillal taustal', label: 'Kaanepilt' },
    { kind: 'hpair', back: HC.semuBack(), front: HC.semuQ(300, 'Mis on mu unistuste töökoht?'), alt: 'Küsimuskaart (300 punkti): „Mis on mu unistuste töökoht?“', label: 'Küsimuskaardid' },
    { kind: 'hpair', back: HC.semuQ(100, 'Mis oli mu esimese lemmiklooma nimi?'), front: HC.semuBonus('Ä'), alt: 'Boonuskaart tähega Ä: kogu kokku ÄGE ja varasta punkte', label: 'Boonuskaardid' },
  ],
  vigur: [
    { kind: 'box', label: '3D-karp' },
    { kind: 'image', src: '/assets/img/games/vigur-cover.webp', alt: 'Vigur kaanepilt: helendav VIGUR-logo roosal-punasel taustal', label: 'Kaanepilt' },
    { kind: 'hpair', back: HC.vigurBack(), front: HC.vigurSit('Mu kõige hullem reis'), alt: 'Olukorrakaart: „Mu kõige hullem reis“', label: 'Olukorrakaardid' },
    { kind: 'hpair', back: HC.shhBack(), front: HC.shhFront(false), alt: 'Shh-tegevuskaart: „Valeta“', label: 'Shh-kaardid' },
  ],
};

const MIDA_TYPES = {
  sh: { label: 'SH · „Oled Semu?“', back: 'back-sh' },
  ot: { label: 'OT · Kõige tõenäolisemalt', back: 'back-ot' },
  shot: { label: 'SHOT · Tõde/tegu või joo', back: 'back-shot' },
  age: { label: 'ÄGE · Boonuskaart', back: 'back-age' },
  ullatus: { label: 'Üllatus!', back: 'back-sh' },
};
const MIDA_CARDS = [
  ['sh', 'sh-go-to-jook', 'Minu go to alkoholiga jook?'],
  ['ot', 'ot-friikim', 'Kes siit grupist on kõige friikim?'],
  ['shot', 'shot-kusib-mida', 'Seltskond küsib sinult ükskõik mida'],
  ['sh', 'sh-vangi', 'Mille eest ma vangi läheksin? (Parim vastus saab kaardi)'],
  ['age', 'age-koik-peale-sinu', 'Kõik peale sinu joovad!'],
  ['ot', 'ot-kaob-ara', 'Kes kaob ära õhtu jooksul?'],
  ['shot', 'shot-telefon', 'Anna oma telefon viieks minutiks teiste kasutusse'],
  ['ullatus', 'ullatus-koik-joovad', 'Üllatus! Kõik joovad!'],
  ['sh', 'sh-suurim-viga', 'Mu suurim viga täis peaga?'],
  ['ot', 'ot-korgijook', 'Kes kõige tõenäolisemalt korgijooki annab?'],
  ['age', 'age-kahele-teo', 'Saad kahele inimesele teo öelda'],
  ['shot', 'shot-korv', 'Kõige piinlikum inimene, kellelt olen korvi saanud?'],
  ['sh', 'sh-first-kiss', 'Mu first kiss?'],
  ['ot', 'ot-kaotab-asjad', 'Kes kaotaks täis peaga kõik oma asjad ära?'],
  ['age', 'age-pealekas', 'Pealekas läinud kolmeks ringiks'],
  ['shot', 'shot-seltskond-teo', 'Seltskond ütleb sulle teo'],
  ['sh', 'sh-esimene-jooming', 'Milline nägi välja mu esimene jooming?'],
  ['ot', 'ot-kaklus', 'Kes satub kaklustesse?'],
  ['age', 'age-grupp-valib', 'Grupp valib, kellele ja mida sa kirjutad'],
  ['sh', 'sh-varastanud', 'Kas ma olen kunagi midagi varastanud?'],
  ['age', 'age-paased-shotist', 'Pääsed järgmisest shotist'],
];

const SEMU_CARDS = [
  { pts: 100, q: 'Mis on mu lemmiktoit?' },
  { pts: 200, q: 'Mis oli mu esimese lemmiklooma nimi?' },
  { bonus: 'Ä' },
  { pts: 300, q: 'Mis on mu unistuste töökoht?' },
  { pts: 400, q: 'Millist superjõudu ma kõige rohkem tahaksin?' },
  { pts: 200, q: 'Kuhu ma kõige rohkem reisida tahaksin?' },
  { pts: 500, q: 'Mis on mu kõige suurem hirm?' },
  { bonus: 'G' },
  { pts: 300, q: 'Millise kuulsusega ma kõige meelsamini õhtust sööksin?' },
  { pts: 100, q: 'Mis on mu lemmikvärv?' },
  { pts: 400, q: 'Mis on mu salajane anne?' },
  { bonus: 'E' },
  { pts: 500, q: 'Mis oli mu lapsepõlve kõige suurem pahandus?' },
];

const VIGUR_CARDS = [
  { sit: 'Minu lemmikmälestus kooliajast' },
  { shh: true },
  { sit: 'Kõige piinlikum hetk peol' },
  { shh: false },
  { sit: 'Mu kõige hullem reis' },
  { sit: 'Kõige kummalisem asi, mida olen söönud' },
  { shh: false },
  { sit: 'Kord, kui jäin millegagi vahele' },
  { shh: true },
  { sit: 'Mu kõige veidram unenägu' },
  { sit: 'Kõige julgem asi, mida olen teinud' },
  { shh: false },
];

function buildDeck() {
  if (PID === 'mida-viiu') {
    return {
      start: 3,
      labels: Object.fromEntries(Object.entries(MIDA_TYPES).map(([k, v]) => [k, v.label])),
      chips: [
        ['sh', 'SH'],
        ['ot', 'OT'],
        ['shot', 'SHOT'],
        ['age', 'ÄGE'],
        ['ullatus', 'Üllatus!'],
      ],
      cards: MIDA_CARDS.map(([type, file, text]) => ({
        type,
        aria: `${MIDA_TYPES[type].label}: ${text}`,
        back: imgFace(card(MIDA_TYPES[type].back)),
        front: imgFace(card(file), text),
      })),
    };
  }
  if (PID === 'oled-semu') {
    return {
      start: 3,
      labels: { 100: '100 punkti · soojendus', 200: '200 punkti', 300: '300 punkti', 400: '400 punkti', 500: '500 punkti · ainult päris semudele', bonus: 'Boonuskaart' },
      chips: [
        ['100', '100'],
        ['200', '200'],
        ['300', '300'],
        ['400', '400'],
        ['500', '500'],
        ['bonus', 'Boonus'],
      ],
      cards: SEMU_CARDS.map((c) =>
        c.bonus
          ? { type: 'bonus', aria: `Boonuskaart, täht ${c.bonus}: kogu kokku ÄGE ja varasta punkte`, back: HC.semuBack(), front: HC.semuBonus(c.bonus) }
          : { type: String(c.pts), aria: `${c.pts} punkti: ${c.q}`, back: HC.semuBack(), front: HC.semuQ(c.pts, c.q) },
      ),
    };
  }
  return {
    start: 3,
    labels: { sit: 'Olukorrakaart', truth: 'Shh-kaart · Räägi tõtt', lie: 'Shh-kaart · Valeta' },
    chips: [
      ['sit', 'Olukorrad'],
      ['truth', 'Räägi tõtt'],
      ['lie', 'Valeta'],
    ],
    cards: VIGUR_CARDS.map((c) =>
      c.sit
        ? { type: 'sit', aria: `Olukorrakaart: ${c.sit}`, back: HC.vigurBack(), front: HC.vigurSit(c.sit) }
        : { type: c.shh ? 'truth' : 'lie', aria: `Shh-kaart: ${c.shh ? 'Räägi tõtt' : 'Valeta'}`, back: HC.shhBack(), front: HC.shhFront(c.shh) },
    ),
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
    return `<div class="pdp-slide pdp-slide--image" ${a}><img src="${s.src}" alt="${esc(s.alt)}" width="1600" height="900" loading="lazy" decoding="async" draggable="false"></div>`;
  if (s.kind === 'pair')
    return `<div class="pdp-slide pdp-slide--pair" ${a}><div class="pdp-pair">
      <img class="pdp-pair__back" src="${s.back}" alt="" width="760" height="509" loading="lazy" decoding="async" draggable="false">
      <img class="pdp-pair__front" src="${s.front}" alt="${esc(s.alt)}" width="760" height="509" loading="lazy" decoding="async" draggable="false">
    </div></div>`;
  return `<div class="pdp-slide pdp-slide--pair" ${a}><div class="pdp-pair">
      <span class="pdp-pair__back" aria-hidden="true">${s.back}</span>
      <span class="pdp-pair__front" role="img" aria-label="${esc(s.alt)}">${s.front}</span>
    </div></div>`;
}

function thumbHTML(s, i) {
  let inner;
  if (s.kind === 'box') inner = `<img src="${P.image}" alt="" width="1000" height="691" decoding="async"><span class="pdp-thumb__tag">3D</span>`;
  else if (s.kind === 'image') inner = `<img src="${s.src}" alt="" width="1600" height="900" loading="lazy" decoding="async">`;
  else if (s.kind === 'pair') inner = `<img src="${s.front}" alt="" width="760" height="509" loading="lazy" decoding="async">`;
  else inner = `<span class="pdp-thumb__card" aria-hidden="true">${s.front}</span>`;
  return `<button class="pdp-thumb" type="button" data-thumb="${i}" aria-label="Näita: ${esc(s.label)}"${i === 0 ? ' aria-current="true"' : ''}>${inner}</button>`;
}

function initGallery() {
  const root = document.querySelector('[data-gallery]');
  const slides = GALLERY[PID];
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

  // 3D karp
  const boxEl = track.querySelector('[data-box]');
  const cfg = BOX[PID];
  if (boxEl && cfg) {
    const slide = boxEl.parentElement;
    const size = () => {
      const w = slide.clientWidth;
      const h = slide.clientHeight;
      // karbi elemendi kõrgus ≈ 0.97 × laius, lisaks vihje ja hõljumise varu
      const bw = Math.max(160, Math.min(w * 0.68, (h * 0.74) / 0.97, 460));
      boxEl.style.setProperty('--w', `${Math.round(bw)}px`);
    };
    size();
    new ResizeObserver(size).observe(slide);
    mountBox(boxEl, {
      front: P.image,
      theme: cfg.theme,
      title: cfg.title,
      tagline: cfg.tagline,
      facts: cfg.facts,
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
  const barPrice = document.querySelector('[data-buybar-price]');
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
    if (barPrice) barPrice.textContent = q > 1 ? `${q} × ${eur(P.price)}` : eur(P.price);
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
   Kleepuv osturiba (mobiilis allservas, desktopis hõljuv pill)
   ========================================================================= */
function initBuybar() {
  const bar = document.querySelector('[data-buybar]');
  const cta = document.querySelector('[data-main-cta]');
  if (!bar || !cta) return;
  const mobile = window.matchMedia('(max-width: 900px)');
  let ctaVisible = true;
  let ctaAbove = false;
  let shown = null;

  const update = () => {
    const show = !ctaVisible && (ctaAbove || (mobile.matches && window.scrollY > 260));
    if (show === shown) return;
    shown = show;
    bar.classList.toggle('is-visible', show);
    bar.inert = !show;
    bar.setAttribute('aria-hidden', String(!show));
    document.body.classList.toggle('has-buybar', show);
  };
  new IntersectionObserver(
    ([en]) => {
      ctaVisible = en.isIntersecting;
      ctaAbove = !en.isIntersecting && en.boundingClientRect.top < 0;
      update();
    },
    { threshold: 0 },
  ).observe(cta);
  let raf = 0;
  window.addEventListener(
    'scroll',
    () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    },
    { passive: true },
  );
  mobile.addEventListener?.('change', update);
  bar.inert = true;
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
    const w = 84;
    const el = document.createElement('img');
    el.src = p.image;
    el.alt = '';
    el.className = 'pdp-fly';
    el.style.left = `${a.left + a.width / 2 - w / 2}px`;
    el.style.top = `${a.top + a.height / 2 - (w * 0.69) / 2}px`;
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
function initModelModal() {
  const modal = document.querySelector('[data-model-modal]');
  if (!modal) return;
  const backdrop = document.querySelector('[data-model-backdrop]');
  const panel = modal.querySelector('.modal__panel');
  const wrap = modal.querySelector('[data-model-frame]');
  let last = null;
  let loaded = false;
  modal.querySelectorAll('[data-model-link]').forEach((a) => (a.href = SITE.pacdora3d));

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
      open();
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
    labelEl.textContent = deck.labels[c.type] || '';
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
  { q: 'ÄGE müüs 2024/25 õppeaastal üle 200 mängu.', truth: true, a: 'Üle 200 ÄGE mängu leidis selle õppeaasta jooksul oma seltskonna.' },
  { q: 'Viguri pakis on 500 olukorrakaarti.', truth: false, a: 'Olukorrakaarte on 50 ja lisaks 32 salajast „Shh“ tegevuskaarti.' },
  { q: 'ÄGE võitis JA Eesti auhinna „Sotsiaalmeedia täht“.', truth: true, a: 'Auhind tuli õpilasfirmade laadalt Rocca al Mares.' },
  { q: 'Vigurit saab mängida ainult kahekesi.', truth: false, a: 'Mängijaid on vaja vähemalt kolm — ja mida rohkem, seda raskem on valetajat tabada.' },
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
  const media = bundle
    ? `<span class="xcard__stack" data-n="${p.includes.length}">${p.includes
        .map((id) => `<img src="${PRODUCTS[id].image}" alt="" width="1000" height="691" loading="lazy" decoding="async">`)
        .join('')}</span>`
    : `<img class="xcard__img" src="${p.image}" alt="" width="1000" height="691" loading="lazy" decoding="async">`;
  const badges = [p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '', p.adult ? '<span class="badge badge--18">18+</span>' : ''].join('');
  return `<article class="xcard${bundle ? ' xcard--bundle' : ''}" style="--xgrad:${esc(p.gradient)};--xacc:${esc(p.accent)}" data-reveal>
    <a class="xcard__media" href="${p.url}" tabindex="-1" aria-hidden="true">${media}<span class="xcard__badges">${badges}</span>${
      bundle ? `<span class="xcard__save">Säästad ${formatEur(full - toCents(p.price))}</span>` : ''
    }</a>
    <div class="xcard__body">
      <h3 class="xcard__name"><a href="${p.url}">${esc(p.name)}</a></h3>
      <p class="xcard__tag">${esc(bundle && !p.name.includes('+') ? p.includes.map((id) => PRODUCTS[id].name).join(' + ') : p.tagline)}</p>
      <div class="xcard__foot">
        <p class="xcard__price"><strong>${formatEur(toCents(p.price))}</strong>${bundle ? `<s aria-label="Tavahind">${formatEur(full)}</s>` : ''}</p>
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

/* ---------- Käivitus ---------- */
if (P) {
  renderPrices();
  initGallery();
  initBuy();
  initBuybar();
  initFlyToCart();
  initModelModal();
  initDeck();
  initBluff();
  initCrossSell();
  absolutizeJsonLd();
}
