// Avaleht: hero 3D karp + parallaks, tootekaardid, komplektid, „Tõmba kaart“
// mini-demo, numbrite loendus, mobiili osturiba.
import { PRODUCTS, SHIPPING, formatEur, toCents } from './catalog.js';
import { mountBox } from './box3d.js';
import { initReveal, esc } from './layout.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** Täiseurod ilma senditeta („33 €“), muidu „17,50 €“. */
const wholeEur = new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurNice = (cents) => (cents % 100 === 0 ? wholeEur.format(cents / 100) : formatEur(cents));
const sumCents = (ids) => ids.reduce((s, id) => s + toCents(PRODUCTS[id]?.price || 0), 0);

const THEME = { 'mida-viiu': 'mida', 'oled-semu': 'semu', vigur: 'vigur' };
const IMG = '/assets/img/cards/';

const ICON_CART =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h15l-1.5 9h-12z"/><path d="M6 7 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>';

/* =========================================================================
   Hinnad kataloogist (et leht oleks alati catalog.js-iga kooskõlas)
   ========================================================================= */
function fillPrices() {
  $$('[data-price]').forEach((el) => {
    const p = PRODUCTS[el.dataset.price];
    if (p) el.textContent = eurNice(toCents(p.price));
  });
  $$('[data-bundle-old]').forEach((el) => {
    const p = PRODUCTS[el.dataset.bundleOld];
    if (p?.includes) el.textContent = eurNice(sumCents(p.includes));
  });
  $$('[data-bundle-save]').forEach((el) => {
    const p = PRODUCTS[el.dataset.bundleSave];
    if (p?.includes) el.textContent = eurNice(sumCents(p.includes) - toCents(p.price));
  });
  $$('[data-ship-price]').forEach((el) => (el.textContent = eurNice(toCents(SHIPPING.price))));
  $$('[data-ship-free]').forEach((el) => (el.textContent = eurNice(toCents(SHIPPING.freeFrom))));
}

/* =========================================================================
   Staatiline 3D karp (box3d.css klassid, ilma JS-animatsioonita)
   ========================================================================= */
function staticBox(p) {
  const theme = THEME[p.id] || 'mida';
  const title = esc(p.name);
  return `
  <div class="box3d box3d--${theme} sbox sbox--${theme}" aria-hidden="true">
    <div class="box3d__float">
      <div class="box3d__obj">
        <div class="box3d__face box3d__face--front" style="--shade:0">
          <img src="${esc(p.image)}" alt="" width="1000" height="691" loading="lazy" decoding="async" draggable="false">
          <div class="box3d__sheen"></div>
        </div>
        <div class="box3d__face box3d__face--back" style="--shade:.3"><div class="box3d__back"></div></div>
        <div class="box3d__face box3d__face--right" style="--shade:.3"><div class="box3d__spine"><span>${title}</span></div></div>
        <div class="box3d__face box3d__face--left" style="--shade:.18"><div class="box3d__spine"><span>ÄGE</span></div></div>
        <div class="box3d__face box3d__face--top" style="--shade:.08"><div class="box3d__spine">${esc(p.tagline)}</div></div>
        <div class="box3d__face box3d__face--bottom" style="--shade:.5"><div class="box3d__spine"></div></div>
      </div>
    </div>
    <div class="box3d__shadow"></div>
  </div>`;
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
    front: p.image,
    theme: 'mida',
    title: 'MIDA V!!!U',
    facts: ['85 kaarti', '50+ shotti', '18+'],
    tagline: p.tagline,
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
   Kõik mängud (renderdatakse PRODUCTS-ist)
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
      const facts = p.facts.slice(0, featured ? 5 : 3);
      const badges = `${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}${p.adult ? '<span class="badge badge--18">18+</span>' : ''}`;
      return `
      <div class="game-cell${featured ? ' game-cell--featured' : ''}" data-reveal style="--delay:${(i * 0.08).toFixed(2)}s">
        <article class="game ${featured ? 'game--featured' : 'game--side'} game--${THEME[id]}" data-tilt
          style="--game-grad:${esc(p.gradient)};--accent:${esc(p.accent)}" aria-labelledby="game-${id}">
          <div class="game__visual">
            ${badges ? `<div class="game__badges">${badges}</div>` : ''}
            ${staticBox(p)}
            <span class="game__glare" aria-hidden="true"></span>
          </div>
          <div class="game__body">
            <h3 class="game__name" id="game-${id}"><a class="game__link" href="${esc(p.url)}">${esc(p.name)}</a></h3>
            <p class="game__tagline">${esc(p.tagline)}</p>
            <p class="game__short">${esc(p.short)}</p>
            <ul class="game__facts" role="list" aria-label="Mängu andmed">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
            <div class="game__buy">
              <span class="game__price"><span class="sr-only">Hind: </span>${eurNice(toCents(p.price))}</span>
              <div class="game__actions">
                <a class="btn btn--ghost btn--sm" href="${esc(p.url)}" aria-label="Vaata lähemalt: ${esc(p.name)}">Vaata lähemalt</a>
                <button class="btn btn--primary btn--sm" type="button" data-add-to-cart="${esc(id)}" aria-label="Lisa ostukorvi: ${esc(p.name)}">${ICON_CART}<span>Lisa korvi</span></button>
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
   Komplektide karbilehvik
   ========================================================================= */
function renderFans() {
  $$('[data-fan]').forEach((fan) => {
    const b = PRODUCTS[fan.dataset.fan];
    if (!b?.includes) return;
    const items = b.includes.map((id) => PRODUCTS[id]).filter(Boolean);
    let slots;
    if (items.length >= 3) {
      // keskel MIDA V!!!U, külgedel teised
      slots = [
        ['l', items[2]],
        ['r', items[1]],
        ['c', items[0]],
      ];
    } else {
      slots = items.map((p, i) => [i === 0 ? 'l' : 'r', p]);
    }
    fan.innerHTML = slots.map(([pos, p]) => `<div class="fan__item fan__item--${pos}">${staticBox(p)}</div>`).join('');
  });
}

/* =========================================================================
   Kaardi keeramine („Mis karbis on?“)
   ========================================================================= */
function initFlips() {
  $$('.flip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!on));
    });
  });
}

/* =========================================================================
   „Tõmba kaart“ mini-demo
   ========================================================================= */
const DRAW_CARDS = [
  { id: 'sh-go-to-jook', type: 'sh', text: 'Minu go to alkoholiga jook?' },
  { id: 'sh-suurim-viga', type: 'sh', text: 'Mu suurim viga täis peaga?' },
  { id: 'sh-vangi', type: 'sh', text: 'Mille eest ma vangi läheksin? (Parim vastus saab kaardi)' },
  { id: 'sh-esimene-jooming', type: 'sh', text: 'Milline nägi välja mu esimene jooming?' },
  { id: 'sh-first-kiss', type: 'sh', text: 'Mu first kiss?' },
  { id: 'sh-varastanud', type: 'sh', text: 'Kas ma olen kunagi midagi varastanud?' },
  { id: 'ot-kaklus', type: 'ot', text: 'Kes satub kaklustesse?' },
  { id: 'ot-friikim', type: 'ot', text: 'Kes siit grupist on kõige friikim?' },
  { id: 'ot-kaob-ara', type: 'ot', text: 'Kes kaob ära õhtu jooksul?' },
  { id: 'ot-korgijook', type: 'ot', text: 'Kes kõige tõenäolisemalt korgijooki annab?' },
  { id: 'ot-kaotab-asjad', type: 'ot', text: 'Kes kaotaks täis peaga kõik oma asjad ära?' },
  { id: 'shot-korv', type: 'shot', text: 'Kõige piinlikum inimene, kellelt olen korvi saanud?' },
  { id: 'shot-telefon', type: 'shot', text: 'Anna oma telefon viieks minutiks teiste kasutusse.' },
  { id: 'shot-seltskond-teo', type: 'shot', text: 'Seltskond ütleb sulle teo.' },
  { id: 'shot-kusib-mida', type: 'shot', text: 'Seltskond küsib sinult ükskõik mida.' },
  { id: 'age-paased-shotist', type: 'age', text: 'Pääsed järgmisest shotist.' },
  { id: 'age-koik-peale-sinu', type: 'age', text: 'Kõik peale sinu joovad!' },
  { id: 'age-kahele-teo', type: 'age', text: 'Saad kahele inimesele teo öelda.' },
  { id: 'age-grupp-valib', type: 'age', text: 'Grupp valib, kellele ja mida sa kirjutad.' },
  { id: 'age-pealekas', type: 'age', text: 'Pealekas läinud kolmeks ringiks.' },
  { id: 'ullatus-koik-joovad', type: 'ullatus', text: 'Üllatus! Kõik joovad!' },
];

const TYPE_INFO = {
  sh: { label: 'SH · Oled Semu?', back: 'back-sh', rule: 'Küsi seda teistelt enda kohta — kes vastab õigesti, saab kaardi endale.' },
  ot: { label: 'OT · Kõige tõenäolisemalt', back: 'back-ot', rule: 'Grupp otsustab, keda kaart kõige paremini kirjeldab. Väljavalitu saab kaardi.' },
  shot: { label: 'SHOT · Tee või joo', back: 'back-shot', rule: 'Tee ära ja saada shot kellelegi teisele — või joo see ise.' },
  age: { label: 'ÄGE · Boonuskaart', back: 'back-age', rule: 'Grupp või mängija teeb nii, nagu kaardil kirjas. Väljapääsu pole!' },
  ullatus: { label: 'Üllatus!', back: 'back-sh', rule: 'Peidetud üllatuskaart. Siin pole midagi arutada — terviseks!' },
};
const TOTAL_CARDS = 85;
const LETTERS_FOR = { sh: ['S', 'H'], ot: ['O', 'T'] };

function initDraw() {
  const stage = $('[data-draw-stage]');
  if (!stage) return;
  const deck = $('[data-draw-deck]');
  const slot = $('[data-draw-slot]');
  const deckTop = $('[data-deck-top]');
  const drawBtn = $('[data-draw-btn]');
  const drawLabel = $('[data-draw-label]');
  const shuffleBtn = $('[data-shuffle-btn]');
  const countEl = $('[data-draw-count]');
  const countWrap = countEl.closest('.counter__value');
  const bar = $('[data-draw-bar]');
  const result = $('[data-draw-result]');
  const chip = result.querySelector('.type-chip');
  const textEl = result.querySelector('.draw__text');
  const ruleEl = result.querySelector('.draw__rule');
  const meter = $('[data-shot-meter]');
  const meterSr = $('[data-shot-sr]');

  let pool = [];
  let next = null;
  let last = null;
  let count = 0;
  let busy = false;
  let queued = false;
  const letters = new Set();
  let meterTimer = 0;

  const shuffleArr = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const refill = () => {
    pool = shuffleArr(DRAW_CARDS.slice());
    // ära näita sama kaarti kaks korda järjest
    if (last && pool[pool.length - 1].id === last.id) [pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]];
  };
  const preload = (src) => {
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
  };
  const peek = () => {
    if (!pool.length) refill();
    next = pool[pool.length - 1];
    deckTop.src = `${IMG}${TYPE_INFO[next.type].back}.webp`;
    preload(`${IMG}${next.id}.webp`);
  };

  const updateCounter = (bump) => {
    countEl.textContent = String(count);
    bar.style.width = `${((count / TOTAL_CARDS) * 100).toFixed(2)}%`;
    if (bump && !REDUCED.matches) {
      countWrap.classList.remove('bump');
      void countWrap.offsetWidth;
      countWrap.classList.add('bump');
    }
    drawLabel.textContent = count >= TOTAL_CARDS ? 'Sega ja alusta uuesti' : count ? 'Tõmba uus' : 'Tõmba kaart';
  };

  const updateMeter = () => {
    $$('[data-l]', meter).forEach((el) => el.classList.toggle('is-on', letters.has(el.dataset.l)));
    const got = ['S', 'H', 'O', 'T'].filter((l) => letters.has(l));
    meterSr.textContent = got.length ? `Sõna SHOT: kogutud tähed ${got.join(', ')}.` : 'Sõna SHOT: ühtegi tähte pole veel kogutud.';
  };

  const setResult = (card, extra = '') => {
    if (!card) {
      chip.dataset.type = 'none';
      chip.textContent = 'Pakk on segatud';
      textEl.textContent = 'Vajuta pakile või nupule „Tõmba kaart“.';
      ruleEl.textContent = 'Kaardi tagakülg reedab tüübi juba enne, kui selle ümber keerad.';
    } else {
      const info = TYPE_INFO[card.type];
      chip.dataset.type = card.type;
      chip.textContent = info.label;
      textEl.textContent = `„${card.text.replace(/[.!]$/, (m) => (m === '!' ? '!' : ''))}“`;
      ruleEl.innerHTML = extra ? `<strong>${esc(extra)}</strong> ${esc(info.rule)}` : esc(info.rule);
    }
    result.classList.remove('is-new');
    void result.offsetWidth;
    result.classList.add('is-new');
  };

  const collectLetters = (card) => {
    const add = LETTERS_FOR[card.type];
    if (!add) return '';
    add.forEach((l) => letters.add(l));
    updateMeter();
    if (letters.size === 4) {
      clearTimeout(meterTimer);
      meter.classList.remove('is-complete');
      void meter.offsetWidth;
      meter.classList.add('is-complete');
      meterTimer = setTimeout(() => {
        letters.clear();
        meter.classList.remove('is-complete');
        updateMeter();
      }, 2600);
      return 'SHOT on koos — saada kellelegi shot!';
    }
    return '';
  };

  const fadeOutAndRemove = (el, dur = 320) => {
    if (REDUCED.matches) {
      el.remove();
      return Promise.resolve();
    }
    return el
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => el.remove())
      .catch(() => el.remove());
  };

  async function doShuffle(resetCount = true) {
    busy = true;
    queued = false;
    stage.setAttribute('aria-busy', 'true');
    $$('.pcard', slot).forEach((c) => fadeOutAndRemove(c));
    slot.classList.remove('has-card');
    if (!REDUCED.matches) {
      deck.classList.remove('is-shuffling');
      void deck.offsetWidth;
      deck.classList.add('is-shuffling');
      await wait(950);
      deck.classList.remove('is-shuffling');
    }
    last = null;
    refill();
    peek();
    if (resetCount) {
      count = 0;
      letters.clear();
      clearTimeout(meterTimer);
      meter.classList.remove('is-complete');
      updateMeter();
      stage.classList.remove('has-drawn');
    }
    updateCounter(false);
    setResult(null);
    stage.removeAttribute('aria-busy');
    busy = false;
  }

  async function draw() {
    if (busy) {
      // üks klikk animatsiooni ajal jääb meelde, et midagi ei kaoks
      queued = true;
      return;
    }
    if (count >= TOTAL_CARDS) {
      await doShuffle(true);
    }
    busy = true;
    stage.setAttribute('aria-busy', 'true');
    if (!pool.length) refill();
    const card = pool.pop();
    last = card;
    count += 1;

    // vanad kaardid lükatakse kõrvale (max 2 jääb lauale)
    $$('.pcard', slot).forEach((old) => {
      const age = Number(old.dataset.age || 0) + 1;
      old.dataset.age = String(age);
      if (age > 2) {
        fadeOutAndRemove(old);
        return;
      }
      const sign = Math.random() < 0.5 ? -1 : 1;
      old.style.setProperty('--or', `${(sign * (5 + Math.random() * 7)).toFixed(1)}deg`);
      old.style.setProperty('--ox', `${(sign * (4 + Math.random() * 6)).toFixed(1)}%`);
      old.style.setProperty('--oy', `${(4 + Math.random() * 5).toFixed(1)}%`);
      old.classList.add('is-old');
    });

    const info = TYPE_INFO[card.type];
    const el = document.createElement('div');
    el.className = 'pcard';
    el.dataset.type = card.type;
    el.innerHTML = `
      <div class="pcard__inner">
        <div class="pcard__face pcard__face--front"><img src="${IMG}${card.id}.webp" alt="${esc(`${info.label}: ${card.text}`)}" width="760" height="509" decoding="async"></div>
        <div class="pcard__face pcard__face--back"><img src="${IMG}${info.back}.webp" alt="" width="760" height="509" decoding="async"></div>
      </div>`;

    // mõõda paki ja koha asukoht enne lisamist (FLIP)
    const from = deckTop.getBoundingClientRect();
    slot.appendChild(el);
    slot.classList.add('has-card');
    stage.classList.add('has-drawn');
    const to = slot.getBoundingClientRect();
    peek();

    const extra = collectLetters(card);

    if (REDUCED.matches) {
      setResult(card, extra);
    } else {
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const s = from.width / to.width;
      const mid = (s + 1) / 2;
      const fly = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-3deg)` },
          { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 46}px) scale(${mid * 1.06}) rotate(4deg)`, offset: 0.5 },
          { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
        ],
        { duration: 720, easing: 'cubic-bezier(.22,.85,.3,1)', fill: 'backwards' },
      );
      const flip = el.querySelector('.pcard__inner').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], {
        duration: 760,
        delay: 360,
        easing: 'cubic-bezier(.34,1.45,.64,1)',
        fill: 'backwards',
      });
      setTimeout(() => setResult(card, extra), 560);
      await Promise.allSettled([fly.finished, flip.finished]);
    }

    updateCounter(true);
    if (count >= TOTAL_CARDS) {
      ruleEl.innerHTML = `${ruleEl.innerHTML} <strong>Kõik 85 kaarti tõmmatud!</strong> Päris pakiga oleks pidu alles alanud.`;
    }
    stage.removeAttribute('aria-busy');
    busy = false;
    if (queued) {
      queued = false;
      draw();
    }
  }

  deck.addEventListener('click', draw);
  drawBtn.addEventListener('click', draw);
  shuffleBtn.addEventListener('click', () => {
    if (!busy) doShuffle(true);
  });

  refill();
  peek();
  updateCounter(false);
  updateMeter();
}

/* =========================================================================
   Numbrite loendus („Meie lugu“)
   ========================================================================= */
function initCounters() {
  const els = $$('[data-count]');
  if (!els.length || REDUCED.matches || !('IntersectionObserver' in window)) return;
  const run = (el) => {
    const end = Number(el.dataset.count) || 0;
    const dur = 1700;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = String(Math.round(end * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        run(en.target);
      });
    },
    { threshold: 0.6 },
  );
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return; // juba nähtav — ära nulli
    el.textContent = '0';
    io.observe(el);
  });
}

/* =========================================================================
   Mobiili osturiba
   ========================================================================= */
function initBuybar() {
  const bar = $('[data-buybar]');
  const cta = $('[data-hero-cta]');
  if (!bar || !cta || !('IntersectionObserver' in window)) return;
  const btn = bar.querySelector('button');
  const blockers = [$('[data-final]'), $('.site-footer')].filter(Boolean);
  let ctaGone = false;
  const blocked = new Set();
  const update = () => {
    const show = ctaGone && blocked.size === 0;
    bar.classList.toggle('is-visible', show);
    bar.setAttribute('aria-hidden', String(!show));
    btn.tabIndex = show ? 0 : -1;
    document.body.classList.toggle('has-buybar', show && window.matchMedia('(max-width: 819px)').matches);
  };
  new IntersectionObserver(([en]) => {
    // peida riba, kuni hero nupp on nähtav või alles allpool
    ctaGone = !en.isIntersecting && en.boundingClientRect.top < 0;
    update();
  }).observe(cta);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => (en.isIntersecting ? blocked.add(en.target) : blocked.delete(en.target)));
    update();
  });
  blockers.forEach((b) => io.observe(b));
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
renderFans();
renderGames();
initHero();
initFlips();
initDraw();
initCounters();
initBuybar();
absolutizeJsonLd();
