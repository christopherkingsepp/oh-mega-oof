// Ostukorv + kassa (/ostukorv): korvi read, sooduskood, pakiautomaadi valija (kõik võrgud ühes
// nimekirjas + filter), kontaktvorm, kinnitused, kokkuvõte ja makse (POST /api/checkout -> Stripe).
// Tagasitulek Stripe'ist: /ostukorv?katkestatud=1&t=TOKEN → GET /api/tellimus → „Jätka makset“.
import { Cart } from './cart.js';
import { PRODUCTS, SHIPPING, MAX_QTY_PER_ITEM, computeTotals, formatEur, toCents, productContents, gameQuantities } from './catalog.js';
import { ICONS, toast, esc, freeShippingHTML } from './layout.js';
import { isValidEmail } from './validate.js'; // sama reegel mis serveris

/* =========================================================================
   Abifunktsioonid
   ========================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const MOBILE = window.matchMedia('(max-width: 980px)');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FORM_KEY = 'age_checkout_v2';
const OLD_FORM_KEY = 'age_checkout_v1';
const LOCKER_KEY = 'age_lockers_v2_all';
const LOCKER_TTL = 30 * 60 * 1000;
const LAST_ORDER_KEY = 'age_last_order_v2'; // {orderNumber, token, expiresAt, at} — „Jätka makset“ jaoks
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_RESULTS = 50;

const store = {
  get(key, fallback = null) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* privaatne režiim — pole hullu */
    }
  },
};

// Omastav kääne lausete jaoks („Otsi SmartPosti pakiautomaati“).
const CARRIER_GEN = { omniva: 'Omniva', smartpost: 'SmartPosti', dpd: 'DPD' };
const MANUAL_PLACEHOLDER = {
  omniva: 'nt Tartu Lõunakeskuse pakiautomaat, Ringtee 75, Tartu',
  smartpost: 'nt Tallinn Mustika Prisma, Tammsaare tee 116, Tallinn',
  dpd: 'nt DPD Pickup Ülemiste, Suur-Sõjamäe 4, Tallinn',
};

const SVG = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>',
  go: '<svg class="lk__opt-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  truck: '<svg class="co-upsell__truck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4.2l3.3 3.4v3.1h-7.5"/><circle cx="6.5" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.01"/></svg>',
  arrow: '<svg class="icon arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-4 11.6c.8.6 1.2 1.5 1.2 2.4V17h5.6v-.5c0-.9.4-1.8 1.2-2.4A6.5 6.5 0 0 0 12 2.5z"/></svg>',
};

/** Komplekti sisu tekstina: „Oled Semu? + Vigur“ (kogusega, kui sama mäng on mitu korda). */
const contentsText = (id) =>
  productContents(id)
    .map((c) => (c.qty > 1 ? `${c.name} ×${c.qty}` : c.name))
    .join(' + ');

/** Eemaldab diakriitikud (ä→a, õ→o, ü→u, ö→o, š→s, ž→z) ja teeb väiketähtedeks. */
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* =========================================================================
   Elemendid ja olek
   ========================================================================= */
const el = {
  form: $('[data-checkout]'),
  empty: $('[data-empty]'),
  recs: $('[data-recs]'),
  steps: $('[data-steps]'),
  stepsFill: $('[data-steps-fill]'),
  titleCount: $('[data-title-count]'),
  heroSub: $('[data-hero-sub]'),
  banner: $('[data-cancel-banner]'),
  lines: $('[data-lines]'),
  cartSub: $('[data-cart-sub]'),
  bundle: $('[data-bundle-hint]'),
  free: $('[data-free]'),
  codeForm: $('[data-code-form]'),
  codeInput: $('#code-input'),
  codeError: $('#code-error'),
  codeApplied: $('[data-code-applied]'),
  codeName: $('[data-code-name]'),
  codeDesc: $('[data-code-desc]'),
  upsell: $('[data-upsell]'),
  filters: $('[data-lk-filters]'),
  carrierError: $('#carrier-error'),
  stock: $('[data-stock]'),
  locker: $('[data-locker]'),
  lkStatus: $('[data-lk-status]'),
  name: $('#f-name'),
  email: $('#f-email'),
  emailSuggest: $('[data-email-suggest]'),
  phone: $('#f-phone'),
  terms: $('#f-terms'),
  age: $('#f-age'),
  ageWrap: $('[data-age-wrap]'),
  news: $('#f-news'),
  sumCount: $('[data-sum-count]'),
  sumLines: $('[data-sum-lines]'),
  sumSubtotal: $('[data-sum-subtotal]'),
  sumDiscountRow: $('[data-sum-discount-row]'),
  sumDiscountLabel: $('[data-sum-discount-label]'),
  sumDiscount: $('[data-sum-discount]'),
  sumShipLabel: $('[data-sum-ship-label]'),
  sumShip: $('[data-sum-ship]'),
  sumFree: $('[data-sum-free]'),
  sumTotal: $('[data-sum-total]'),
  payError: $('[data-pay-error]'),
  payMain: $('.co-summary [data-pay]'),
  paybar: $('[data-paybar]'),
  paybarTotal: $('[data-paybar-total]'),
};

const state = {
  filter: 'all', // 'all' | 'omniva' | 'smartpost' | 'dpd'
  lockerMode: 'loading', // loading | list | manual (nimekirja pole) | error (päring ebaõnnestus)
  carrierMeta: {}, // id -> {id, name, label, priceCents, eta, enabled, lockerCount, stale?, manual?}
  lockers: [],
  locker: null, // {id, carrier, name, city, address, postalCode}
  stale: false,
  updatedAt: null,
  manual: '',
  shortages: [], // 409: [{id, name, available}]
  query: '',
  results: [],
  activeIndex: -1,
  loadToken: 0,
  submitting: false,
  attempted: false,
  forceAge: false,
  pendingRemoval: new Set(),
  shownTotal: null,
  payInView: false,
  typing: false,
  bundleKey: '',
  upsellKey: '',
  firstRender: true,
};

/* =========================================================================
   Ostukorvi read
   ========================================================================= */
/** Tootepilt: ruudukujuline läbipaistev karp (komplektidel oma kompositsioon). */
function thumbHTML(p) {
  return `<a class="co-thumb" href="${esc(p.url)}" style="--a:${esc(p.accent || '#ff2fa8')}" tabindex="-1" aria-hidden="true"><img src="${esc(p.image)}" alt="" width="240" height="240" loading="lazy" decoding="async"></a>`;
}

function createLine(line, index) {
  const p = line.product;
  const li = document.createElement('li');
  li.className = 'co-line';
  li.dataset.id = p.id;
  if (state.firstRender) li.style.animationDelay = `${index * 70}ms`;
  const badges = [p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '', p.adult ? '<span class="badge badge--18">18+</span>' : '']
    .filter(Boolean)
    .join('');
  li.innerHTML = `
    <div class="co-line__inner">
      <div class="co-line__grid">
        ${thumbHTML(p)}
        <div class="co-line__info">
          ${badges ? `<div class="co-line__badges">${badges}</div>` : ''}
          <h3 class="co-line__name"><a href="${esc(p.url)}">${esc(p.name)}</a></h3>
          <p class="co-line__tag">${esc(p.tagline)}</p>
          ${p.includes?.length ? `<p class="co-line__contents">Sisaldab: ${esc(contentsText(p.id))}</p>` : ''}
          <p class="co-line__unit"><span data-line-unit></span> / tk</p>
          <p class="co-line__stock" data-line-stock hidden></p>
          <button class="co-line__remove" type="button" data-line-remove>${SVG.trash}Eemalda<span class="sr-only"> ${esc(p.name)}</span></button>
        </div>
        <div class="qty" role="group" aria-label="Kogus: ${esc(p.name)}">
          <button type="button" data-line-dec></button>
          <output aria-live="polite" data-line-qty></output>
          <button type="button" data-line-inc aria-label="Suurenda kogust">${SVG.plus}</button>
        </div>
        <div class="co-line__total" data-line-total></div>
      </div>
    </div>`;
  return li;
}

function updateLine(li, line) {
  const { product: p, qty, unitCents, totalCents } = line;
  $('[data-line-qty]', li).textContent = String(qty);
  $('[data-line-unit]', li).textContent = formatEur(unitCents);
  const dec = $('[data-line-dec]', li);
  const isLast = qty <= 1;
  if (dec.dataset.mode !== (isLast ? 'remove' : 'dec')) {
    dec.dataset.mode = isLast ? 'remove' : 'dec';
    dec.innerHTML = isLast ? SVG.trash : SVG.minus;
    dec.setAttribute('aria-label', isLast ? `Eemalda ${p.name} ostukorvist` : 'Vähenda kogust');
  }
  $('[data-line-inc]', li).disabled = qty >= MAX_QTY_PER_ITEM;
  const total = $('[data-line-total]', li);
  const next = formatEur(totalCents);
  if (total.textContent && total.textContent !== next && !REDUCED.matches) {
    total.classList.remove('is-bumped');
    void total.offsetWidth;
    total.classList.add('is-bumped');
  }
  total.textContent = next;
}

function renderLines(t) {
  const existing = new Map($$('.co-line', el.lines).map((li) => [li.dataset.id, li]));
  let prev = null;
  t.lines.forEach((line, i) => {
    const id = line.product.id;
    let li = existing.get(id);
    if (li) {
      existing.delete(id);
      if (!state.pendingRemoval.has(id)) li.classList.remove('is-removing');
    } else {
      li = createLine(line, i);
    }
    const ref = prev ? prev.nextElementSibling : el.lines.firstElementChild;
    if (li !== ref) el.lines.insertBefore(li, ref);
    updateLine(li, line);
    prev = li;
  });
  // Read, mida korvis enam pole (nt teisest vahelehest eemaldatud) — animeeri välja.
  existing.forEach((li) => {
    if (state.pendingRemoval.has(li.dataset.id)) {
      li.remove();
      state.pendingRemoval.delete(li.dataset.id);
      return;
    }
    li.classList.add('is-removing');
    setTimeout(() => li.remove(), REDUCED.matches ? 0 : 460);
  });
  // Komplekt „Kõik 3 mängu“ on pakis 3 mängu, mitte 1.
  const games = t.lines.reduce((s, l) => s + l.qty * (l.product.includes?.length || 1), 0);
  el.cartSub.textContent = `${plural(games, 'mäng', 'mängu')} ootab pakkimist. Kontrolli üle, kas kõik on õige.`;
}

function removeLine(id) {
  const li = el.lines.querySelector(`.co-line[data-id="${CSS.escape(id)}"]`);
  const item = Cart.items().find((i) => i.id === id);
  if (!item || state.pendingRemoval.has(id)) return;
  const p = PRODUCTS[id];
  // Fookus liigub järgmisele reale (või pealkirjale), et klaviatuurikasutaja ei kaoks ära.
  const focusWasInside = li?.contains(document.activeElement);
  const nextLi = li?.nextElementSibling || li?.previousElementSibling;
  state.pendingRemoval.add(id);
  li?.classList.add('is-removing');
  const done = () => {
    Cart.remove(id);
    state.pendingRemoval.delete(id);
    if (focusWasInside) {
      const target = nextLi && nextLi.isConnected ? $('[data-line-inc]', nextLi) : $('#h-ostukorv');
      if (target) {
        if (target.id === 'h-ostukorv') target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
    toast(`<strong>${esc(p.name)}</strong> eemaldati ostukorvist`, {
      image: p.image,
      link: { href: `#tagasi:${encodeURIComponent(id)}:${item.qty}`, label: 'Võta tagasi' },
      duration: 6000,
    });
  };
  if (REDUCED.matches || !li) done();
  else setTimeout(done, 380);
}

el.lines.addEventListener('click', (e) => {
  const li = e.target.closest('.co-line');
  if (!li) return;
  const id = li.dataset.id;
  const item = Cart.items().find((i) => i.id === id);
  if (!item) return;
  if (e.target.closest('[data-line-remove]')) return removeLine(id);
  if (e.target.closest('[data-line-dec]')) {
    if (item.qty <= 1) return removeLine(id);
    return Cart.set(id, item.qty - 1);
  }
  if (e.target.closest('[data-line-inc]')) {
    if (item.qty >= MAX_QTY_PER_ITEM) return;
    Cart.set(id, item.qty + 1);
  }
});

// „Võta tagasi“ teavituses
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#tagasi:"]');
  if (!a) return;
  e.preventDefault();
  const [, rawId, rawQty] = a.getAttribute('href').split(':');
  const id = decodeURIComponent(rawId);
  if (PRODUCTS[id]) {
    const cur = Cart.items().find((i) => i.id === id)?.qty || 0;
    Cart.set(id, cur + (parseInt(rawQty, 10) || 1));
  }
  const t = a.closest('.toast');
  if (t) {
    t.classList.add('is-leaving');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }
});

/* ---------- Komplekti vahetus ---------- */
const BUNDLES = [
  { id: 'komplekt-koik', parts: ['mida-viiu', 'oled-semu', 'vigur'] },
  { id: 'komplekt-semu-vigur', parts: ['oled-semu', 'vigur'] },
];

function bundleOffer() {
  const items = Cart.items();
  const qty = (id) => items.find((i) => i.id === id)?.qty || 0;
  for (const b of BUNDLES) {
    if (!PRODUCTS[b.id] || !b.parts.every((id) => qty(id) > 0)) continue;
    const save = b.parts.reduce((s, id) => s + toCents(PRODUCTS[id].price), 0) - toCents(PRODUCTS[b.id].price);
    if (save > 0) return { ...b, save };
  }
  return null;
}

function renderBundle() {
  const offer = bundleOffer();
  const key = offer ? `${offer.id}:${offer.save}` : '';
  if (key === state.bundleKey) return;
  state.bundleKey = key;
  if (!offer) {
    el.bundle.innerHTML = '';
    return;
  }
  const names = offer.parts.map((id) => `<strong>${esc(PRODUCTS[id].name)}</strong>`);
  const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} ja ${names.at(-1)}` : names.join(' ja ');
  el.bundle.innerHTML = `
    <div class="co-bundle">
      <span class="co-bundle__icon" aria-hidden="true">${SVG.spark}</span>
      <p><strong>Nutikas diil:</strong> ${list} on korvis eraldi. Vaheta need komplekti <strong>„${esc(PRODUCTS[offer.id].name)}“</strong> vastu ja <strong class="save">säästad ${formatEur(offer.save)}</strong>.</p>
      <button class="btn btn--sm btn--white" type="button" data-bundle-swap="${esc(offer.id)}">Vaheta komplektiks</button>
    </div>`;
}

el.bundle.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-bundle-swap]');
  if (!btn) return;
  const offer = bundleOffer();
  if (!offer || offer.id !== btn.dataset.bundleSwap) return;
  const items = Cart.items();
  offer.parts.forEach((id) => {
    const q = items.find((i) => i.id === id)?.qty || 0;
    Cart.set(id, q - 1);
  });
  const cur = Cart.items().find((i) => i.id === offer.id)?.qty || 0;
  Cart.set(offer.id, cur + 1);
  toast(`Vahetatud! Säästad <strong>${formatEur(offer.save)}</strong>.`, { image: PRODUCTS[offer.id].image });
  $('#h-ostukorv').tabIndex = -1;
  $('#h-ostukorv').focus({ preventScroll: true });
});

/* ---------- Sobib juurde ---------- */
const UPSELL_IDS = ['mida-viiu', 'oled-semu', 'vigur'];

function renderUpsell() {
  const items = Cart.items();
  const covered = new Set(items.flatMap((i) => [i.id, ...(PRODUCTS[i.id]?.includes || [])]));
  const cands = UPSELL_IDS.filter((id) => !covered.has(id)).slice(0, 2);
  const t = currentTotals();
  const info = cands.map((id) => {
    const unlocks = t.shippingCents > 0 && computeTotals([...items, { id, qty: 1 }], Cart.code(), currentCarrier()).shippingCents === 0;
    return { id, unlocks };
  });
  const key = info.map((i) => `${i.id}${i.unlocks ? '+' : ''}`).join(',');
  if (key === state.upsellKey) return;
  state.upsellKey = key;
  el.upsell.hidden = !info.length;
  if (!info.length) {
    el.upsell.innerHTML = '';
    return;
  }
  const anyUnlock = info.some((i) => i.unlocks);
  el.upsell.innerHTML = `
    <p class="co-upsell__title">${anyUnlock ? `<strong>Sobib juurde</strong> — ja tarne muutub tasuta ${SVG.truck}` : '<strong>Sobib juurde</strong> — sõbrad tänavad hiljem'}</p>
    <div class="co-upsell__list">
      ${info
        .map(({ id, unlocks }) => {
          const p = PRODUCTS[id];
          return `<div class="co-mini">
            <a href="${esc(p.url)}" tabindex="-1" aria-hidden="true"><img src="${esc(p.image)}" alt="" width="240" height="240" loading="lazy"></a>
            <div>
              <div class="co-mini__name"><a href="${esc(p.url)}">${esc(p.name)}</a></div>
              <div class="co-mini__price">${formatEur(toCents(p.price))}</div>
              ${unlocks ? '<div class="co-mini__unlock">+ tasuta tarne</div>' : ''}
            </div>
            <button class="btn btn--sm" type="button" data-add-to-cart="${esc(id)}" aria-label="Lisa ostukorvi: ${esc(p.name)}">+ Lisa</button>
          </div>`;
        })
        .join('')}
    </div>`;
}

/* =========================================================================
   Sooduskood
   ========================================================================= */
function renderCode(t) {
  const code = Cart.code();
  el.codeForm.hidden = Boolean(code);
  el.codeApplied.hidden = !code;
  if (code) {
    el.codeName.textContent = code;
    el.codeDesc.innerHTML = `−${t.percent}% rakendatud${t.discountCents ? `<span class="co-code__save">säästad ${formatEur(t.discountCents)}</span>` : ''}`;
  }
}

function setCodeError(msg) {
  el.codeError.textContent = msg;
  if (msg) {
    el.codeInput.setAttribute('aria-invalid', 'true');
    el.codeForm.classList.remove('is-shake');
    void el.codeForm.offsetWidth;
    el.codeForm.classList.add('is-shake');
  } else {
    el.codeInput.removeAttribute('aria-invalid');
  }
}

function applyCode() {
  const raw = el.codeInput.value.trim();
  if (!raw) {
    setCodeError('Sisesta sooduskood.');
    el.codeInput.focus();
    return;
  }
  if (Cart.applyCode(raw)) {
    el.codeInput.value = '';
    setCodeError('');
    const t = Cart.totals();
    toast(`Sooduskood <strong>${esc(t.code)}</strong> rakendatud: −${t.percent}%!`);
    $('[data-remove-code]').focus();
  } else {
    setCodeError('Sellist sooduskoodi ei leitud või see ei kehti enam. Kontrolli kirjapilti.');
    el.codeInput.focus();
  }
}

$('[data-apply-code]').addEventListener('click', applyCode);
el.codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyCode();
  }
});
el.codeInput.addEventListener('input', () => {
  if (el.codeError.textContent) setCodeError('');
});
$('[data-remove-code]').addEventListener('click', () => {
  Cart.removeCode();
  el.codeInput.focus();
});

/* =========================================================================
   Kokkuvõte
   ========================================================================= */
let totalStatusTimer;
function animateTotal(cents) {
  const from = state.shownTotal;
  state.shownTotal = cents;
  if (from !== null && from !== cents) {
    // Ekraanilugejale ainult lõppsumma (mitte iga animatsioonikaader).
    clearTimeout(totalStatusTimer);
    totalStatusTimer = setTimeout(() => {
      const st = $('[data-total-status]');
      if (st) st.textContent = `Tellimuse summa on nüüd ${formatEur(cents)}`;
    }, 600);
  }
  const targets = [el.sumTotal, el.paybarTotal];
  if (from === null || from === cents || REDUCED.matches) {
    targets.forEach((t) => (t.textContent = formatEur(cents)));
    return;
  }
  const start = performance.now();
  const dur = 520;
  const step = (now) => {
    if (state.shownTotal !== cents) return; // uus muutus jõudis vahele
    const k = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    const v = Math.round(from + (cents - from) * eased);
    targets.forEach((t) => (t.textContent = formatEur(v)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function payLabel(t) {
  return `Maksa ${formatEur(t.totalCents)}`;
}

/** Kassa summad koos valitud vedaja tarnehinnaga (sama arvutus mis serveris). */
function currentTotals() {
  return computeTotals(Cart.items(), Cart.code(), currentCarrier());
}

function renderSummary(t) {
  const n = Cart.count();
  el.sumCount.textContent = plural(n, 'toode', 'toodet');
  el.sumLines.innerHTML = t.lines
    .map(
      ({ product: p, qty, totalCents }) => `
      <li class="co-sum-line">
        <span class="co-sum-line__img"><img src="${esc(p.image)}" alt="" width="240" height="240" loading="lazy">${qty > 1 ? `<b aria-hidden="true">${qty}</b>` : ''}</span>
        <span class="co-sum-line__name">${esc(p.name)}${qty > 1 ? `<span class="sr-only">, ${qty} tk</span>` : ''}${
          p.includes?.length ? `<small class="co-sum-line__contents">${esc(contentsText(p.id))}</small>` : ''
        }</span>
        <span class="co-sum-line__price">${formatEur(totalCents)}</span>
      </li>`,
    )
    .join('');
  el.sumSubtotal.textContent = formatEur(t.subtotalCents);
  el.sumDiscountRow.hidden = !t.discountCents;
  if (t.discountCents) {
    el.sumDiscountLabel.textContent = `Soodustus ${t.code} (−${t.percent}%)`;
    el.sumDiscount.textContent = `−${formatEur(t.discountCents)}`;
  }
  const carrier = currentCarrier();
  el.sumShipLabel.textContent = carrier ? `Tarne · ${carrierInfo(carrier).name}` : 'Tarne pakiautomaati';
  el.sumShip.textContent = priceText(t.shippingCents);
  el.sumShip.classList.toggle('is-free', !t.shippingCents);
  el.sumFree.innerHTML =
    t.freeShippingRemainingCents > 0
      ? `<p class="co-hint">Veel <strong>${formatEur(t.freeShippingRemainingCents)}</strong> ja tarne on tasuta.</p>`
      : '';
  animateTotal(t.totalCents);
  if (!state.submitting) $$('[data-pay-label]').forEach((s) => (s.textContent = payLabel(t)));
  // Hinnad kiipidel, nimekirjas ja valitud automaadi kaardil (tasuta tarne piir võib muutuda).
  updateFilters();
  const pp = $('[data-picked-price]');
  if (pp && carrier) {
    const c = shipCents(carrier);
    const txt = pp.closest('.lk-picked') ? (c ? `Tarne ${formatEur(c)}` : 'Tarne tasuta') : priceText(c);
    if (pp.textContent !== txt) pp.textContent = txt;
    pp.classList.toggle('is-free', !c);
  }
  if (!$('[data-lk-pop]')?.hidden) renderOptionPrices();
}

/** Uuenda avatud nimekirja hinnad ilma valikut kaotamata. */
function renderOptionPrices() {
  $$('.lk__opt').forEach((opt) => {
    const l = state.results[Number(opt.dataset.index)];
    const p = $('.lk__opt-price', opt);
    if (!l || !p) return;
    const c = shipCents(l.carrier);
    p.textContent = priceText(c);
    p.classList.toggle('is-free', !c);
  });
}

/* =========================================================================
   Pakiautomaadid: üks ühtne nimekiri (GET /api/pakiautomaadid?carrier=all),
   võrgu filter (Kõik / Omniva / SmartPosti / DPD) ja otsitav combobox.
   Vedaja = valitud automaadi vedaja (käsitsi sisestusel valitud võrk).
   ========================================================================= */
const CARRIER_IDS = Object.keys(SHIPPING.carriers);
// Kui nimekirja üldse ei saadud, eeldame serveri vaikimisi ENABLED_CARRIERS väärtust.
// Server kontrollib vedajat niikuinii ise (400, field 'shipping.carrier').
const DEFAULT_ENABLED = ['omniva', 'smartpost'];

/** Väike vedajamärk (nimekirja ridades ja valitud automaadi kaardil). */
function markHTML(id, cls = '') {
  const inner = id === 'dpd' ? SVG.box : id === 'smartpost' ? 'S' : id === 'omniva' ? 'O' : SVG.pin;
  return `<span class="lk-mark lk-mark--${esc(id)}${cls ? ` ${cls}` : ''}" aria-hidden="true">${inner}</span>`;
}

function carrierInfo(id) {
  const cat = SHIPPING.carriers[id] || {};
  const api = state.carrierMeta[id];
  return {
    id,
    name: api?.name || cat.name || id,
    label: api?.label || cat.label || id,
    eta: api?.eta || cat.eta || '1–3 tööpäeva',
    enabled: api ? api.enabled !== false : DEFAULT_ENABLED.includes(id),
    count: state.lockers.reduce((n, l) => n + (l.carrier === id ? 1 : 0), 0),
    stale: Boolean(api?.stale),
  };
}

const enabledCarriers = () => CARRIER_IDS.filter((id) => carrierInfo(id).enabled);
const orList = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(', ')} või ${arr.at(-1)}` : arr[0] || '');

/** Tarnehind sentides selle vedajaga (sama arvutus mis serveris: catalog.js computeTotals). */
const shipCents = (carrier) => computeTotals(Cart.items(), Cart.code(), carrier || null).shippingCents;
const priceText = (cents) => (cents ? formatEur(cents) : 'Tasuta');

const lockersFor = (filter) => (filter === 'all' ? state.lockers : state.lockers.filter((l) => l.carrier === filter));

/** Käsitsi sisestus: nimekirja pole üldse VÕI valitud võrgu nimekiri puudub. */
function manualMode() {
  if (state.lockerMode === 'manual' || state.lockerMode === 'error') return true;
  return state.lockerMode === 'list' && state.filter !== 'all' && !lockersFor(state.filter).length;
}

function currentCarrier() {
  if (state.locker) return state.locker.carrier;
  if (manualMode() && state.filter !== 'all' && carrierInfo(state.filter).enabled) return state.filter;
  return null;
}

/** „Ringtee 75, 50501 Tartu“ */
function lockerAddress(l) {
  const place = [l.postalCode, l.city].filter(Boolean).join(' ');
  return [l.address, place].filter(Boolean).join(', ');
}

function prepareLockers(list) {
  const clean = list
    .filter((l) => l && l.name && Object.prototype.hasOwnProperty.call(SHIPPING.carriers, l.carrier))
    .map((l) => {
      const city = String(l.city || '').trim();
      const address = String(l.address || '').trim();
      const postalCode = String(l.postalCode || '').trim();
      return {
        id: String(l.id ?? '').trim(),
        carrier: l.carrier,
        name: String(l.name).trim(),
        city,
        address,
        postalCode,
        _g: city || 'Muu',
        _n: norm(`${l.name} ${city} ${address} ${postalCode} ${SHIPPING.carriers[l.carrier].name}`),
        _c: norm(city),
      };
    });
  clean.sort((a, b) => a.name.localeCompare(b.name, 'et', { numeric: true }) || a.carrier.localeCompare(b.carrier));
  const cityCount = new Map();
  clean.forEach((l) => cityCount.set(l._g, (cityCount.get(l._g) || 0) + 1));
  clean.forEach((l) => (l._cc = cityCount.get(l._g)));
  return clean;
}

async function loadLockers({ force = false } = {}) {
  const token = ++state.loadToken;
  const cached = force ? null : store.get(LOCKER_KEY);
  if (cached?.data && Date.now() - cached.t < LOCKER_TTL) {
    applyLockerData(cached.data);
    return;
  }
  state.lockerMode = 'loading';
  renderShipping();
  announce('Laadin pakiautomaatide nimekirja…');
  const started = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch('/api/pakiautomaadid?carrier=all', { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    const wait = 380 - (performance.now() - started); // väldi skeletoni välgatust
    if (wait > 0) await sleep(wait);
    if (token !== state.loadToken) return;
    if (!res.ok || !data) throw new Error(data?.error || `HTTP ${res.status}`);
    if (!data.stale && !data.manual && Array.isArray(data.lockers) && data.lockers.length) store.set(LOCKER_KEY, { t: Date.now(), data });
    applyLockerData(data);
  } catch {
    if (token !== state.loadToken) return;
    state.lockerMode = 'error';
    state.lockers = [];
    state.carrierMeta = {};
    state.locker = null;
    if (state.filter === 'all' || !carrierInfo(state.filter).enabled) state.filter = 'all';
    renderShipping();
    afterShippingChange();
  }
}

function applyLockerData(data) {
  state.carrierMeta = Object.fromEntries((Array.isArray(data?.carriers) ? data.carriers : []).filter((c) => c && c.id).map((c) => [c.id, c]));
  state.lockers = Array.isArray(data?.lockers) ? prepareLockers(data.lockers) : [];
  state.stale = Boolean(data?.stale);
  state.updatedAt = data?.updatedAt || null;
  state.lockerMode = state.lockers.length ? 'list' : 'manual';
  if (state.filter !== 'all' && !carrierInfo(state.filter).enabled) state.filter = 'all';
  if (state.locker) {
    const found = state.lockers.find((l) => sameLocker(l, state.locker));
    state.locker = found ? pickLocker(found) : null;
  }
  if (state.lockerMode === 'list') {
    announce(`${plural(state.lockers.length, 'pakiautomaat', 'pakiautomaati')} laaditud. Otsi linna, keskuse või tänava järgi.`);
  }
  renderShipping();
  afterShippingChange();
}

// Võrdle vedaja + id järgi (id puudumisel nime järgi).
const sameLocker = (a, b) =>
  a.carrier === b.carrier && (a.id && b.id ? a.id === String(b.id) : norm(a.name) === norm(b.name));
const pickLocker = (l) => ({ id: l.id, carrier: l.carrier, name: l.name, city: l.city, address: l.address, postalCode: l.postalCode || '' });

let announceTimer;
function announce(msg) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    el.lkStatus.textContent = msg;
  }, 60);
}

function renderShipping() {
  updateFilters();
  renderLocker();
}

/* ---------- Võrgu filter (raadionupud kiipidena; nooleklahvid töötavad loomulikult) ---------- */
function updateFilters() {
  const loading = state.lockerMode === 'loading';
  const globalManual = state.lockerMode === 'manual' || state.lockerMode === 'error';
  const cheapest = Math.min(...(enabledCarriers().map((id) => shipCents(id)).concat(loading ? [shipCents(null)] : [])));
  $$('[data-chip]', el.filters).forEach((chip) => {
    const id = chip.dataset.chip;
    const input = $('input', chip);
    const meta = $('[data-chip-meta]', chip);
    const price = $('[data-chip-price]', chip);
    let text;
    let priceTxt = '';
    let disabled = false;
    if (id === 'all') {
      chip.hidden = globalManual;
      text = loading ? 'Laadin…' : plural(state.lockers.length, 'automaat', 'automaati');
      priceTxt = Number.isFinite(cheapest) ? priceText(cheapest) : '';
    } else {
      const c = carrierInfo(id);
      if (!c.enabled) {
        disabled = true;
        text = 'Hetkel pole saadaval';
      } else {
        text = loading ? 'Laadin…' : globalManual || !c.count ? 'Sisesta käsitsi' : plural(c.count, 'automaat', 'automaati');
        priceTxt = priceText(shipCents(id));
      }
    }
    input.disabled = disabled;
    chip.classList.toggle('is-disabled', disabled);
    input.checked = state.filter === id && !(id === 'all' && globalManual);
    if (meta.textContent !== text) meta.textContent = text;
    if (price.textContent !== priceTxt) price.textContent = priceTxt;
    price.classList.toggle('is-free', priceTxt === 'Tasuta');
  });
}

el.filters.addEventListener('change', (e) => {
  if (e.target.name === 'lkFilter') selectFilter(e.target.value);
});

function selectFilter(filter) {
  if (filter !== 'all' && !carrierInfo(filter).enabled) return;
  const prev = state.filter;
  state.filter = filter;
  // Teise võrgu valimine tähendab, et klient tahab automaati vahetada.
  if (state.locker && filter !== 'all' && state.locker.carrier !== filter) state.locker = null;
  if (prev !== filter) state.activeIndex = -1;
  showError(null, '', el.carrierError);
  $$('.lk-chip').forEach((c) => c.classList.remove('is-invalid'));
  persist();
  renderShipping();
  afterShippingChange();
  if (!state.locker && !manualMode() && state.lockerMode === 'list') {
    const n = lockersFor(filter).length;
    announce(filter === 'all' ? `Kõik võrgud: ${plural(n, 'automaat', 'automaati')}.` : `${carrierInfo(filter).name}: ${plural(n, 'automaat', 'automaati')}.`);
  }
}

/* ---------- Automaadi valik ---------- */
function staleNote() {
  if (!state.stale) return '';
  let when = '';
  if (state.updatedAt) {
    const d = new Date(state.updatedAt);
    if (!Number.isNaN(d.getTime())) {
      when = ` (uuendatud ${new Intl.DateTimeFormat('et-EE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' }).format(d)})`;
    }
  }
  return `<p class="lk-stale"><span aria-hidden="true">${SVG.clock}</span><span>Nimekiri võib olla veidi vananenud${esc(when)}. Kui sinu automaati pole, vali lähim või kirjuta meile.</span></p>`;
}

/** Lubatud võrgud, mille nimekiri puudub (näidatakse „Kõik“ vaates vihjena). */
function missingListNote() {
  if (state.filter !== 'all' || state.lockerMode !== 'list') return '';
  const missing = enabledCarriers().filter((id) => !carrierInfo(id).count);
  if (!missing.length) return '';
  const names = missing.map((id) => carrierInfo(id).name);
  return `<p class="lk-stale lk-stale--info"><span aria-hidden="true">${SVG.pin}</span><span>${esc(orList(names))} automaatide nimekiri pole hetkel saadaval — vali ülalt ${esc(orList(names))}, et automaat käsitsi sisestada.</span></p>`;
}

function renderLocker() {
  const host = el.locker;
  if (state.lockerMode === 'loading') {
    host.innerHTML = `<div class="lk-skel" aria-hidden="true"><span class="s-label"></span><span class="s-input"></span><span class="s-row"></span><span class="s-row"></span><span class="s-row"></span></div><p class="sr-only">Laadin pakiautomaatide nimekirja…</p>`;
    return;
  }
  if (manualMode()) return renderManual(host);
  if (state.locker) return renderPicked(host);
  const gen = state.filter === 'all' ? '' : `${CARRIER_GEN[state.filter] || carrierInfo(state.filter).name} `;
  host.innerHTML = `
    <div class="lk">
      <label class="label" for="locker-input" id="locker-label">Otsi ${esc(gen)}pakiautomaati</label>
      <div class="lk__box">
        ${SVG.search}
        <input class="input lk__input" id="locker-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="locker-listbox" aria-describedby="locker-hint locker-error" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="Linn, keskus, tänav või automaat">
        <button class="lk__clear" type="button" data-lk-clear aria-label="Tühjenda otsing" hidden>${SVG.close}</button>
      </div>
      <p class="lk__hint" id="locker-hint" data-lk-hint></p>
      <div class="lk__pop" data-lk-pop hidden>
        <div class="lk__list" id="locker-listbox" role="listbox" aria-labelledby="locker-label" data-lk-list></div>
        <p class="lk__none" data-lk-none hidden></p>
        <p class="lk__more" data-lk-more></p>
      </div>
      <p class="field-error" id="locker-error" aria-live="polite"></p>
      ${staleNote()}${missingListNote()}
    </div>`;
  bindCombobox();
}

function renderPicked(host) {
  const l = state.locker;
  const c = carrierInfo(l.carrier);
  const cents = shipCents(l.carrier);
  const addr = lockerAddress(l);
  host.innerHTML = `
    <div class="lk-picked lk-picked--${esc(l.carrier)}">
      ${markHTML(l.carrier, 'lk-mark--lg')}
      <div class="lk-picked__text">
        <span class="lk-picked__carrier">${esc(c.label)}<span class="lk-picked__ok"> · valitud</span></span>
        <strong class="lk-picked__name">${esc(l.name)}</strong>
        ${addr ? `<span class="lk-picked__addr">${esc(addr)}</span>` : ''}
        <span class="lk-picked__meta"><span class="lk-picked__price${cents ? '' : ' is-free'}" data-picked-price>${cents ? `Tarne ${formatEur(cents)}` : 'Tarne tasuta'}</span><span aria-hidden="true">·</span><span>teele ${esc(c.eta)} jooksul</span></span>
      </div>
      <button class="btn btn--sm btn--ghost" type="button" data-change-locker aria-label="Muuda pakiautomaati (praegu ${esc(l.name)})">Muuda</button>
    </div>
    ${staleNote()}`;
  $('[data-change-locker]', host).addEventListener('click', () => {
    state.locker = null;
    state.query = '';
    persist();
    renderShipping();
    afterShippingChange();
    $('#locker-input')?.focus();
  });
}

function renderManual(host) {
  const carrier = currentCarrier();
  const globalError = state.lockerMode === 'error';
  const globalManual = state.lockerMode === 'manual';
  const names = orList(enabledCarriers().map((id) => carrierInfo(id).name));
  let note;
  if (globalError) {
    note = `<strong>Automaatide nimekirja laadimine ebaõnnestus.</strong> Vali ülalt võrk (${esc(names)}) ja kirjuta automaadi nimi ja aadress või <button type="button" data-retry-lockers>proovi uuesti</button>.`;
  } else if (globalManual) {
    note = `<strong>Automaatide nimekiri pole hetkel saadaval.</strong> Pole hullu — vali ülalt võrk (${esc(names)}) ja kirjuta automaadi nimi ja aadress. Saadame paki sinna.`;
  } else {
    const gen = CARRIER_GEN[state.filter] || carrierInfo(state.filter).name;
    note = `<strong>${esc(gen)} automaatide nimekiri pole hetkel saadaval.</strong> Kirjuta automaadi nimi ja aadress siia — saadame paki sinna.`;
  }
  const c = carrier ? carrierInfo(carrier) : null;
  const priceRow = c
    ? `<p class="lk-manual__price">${markHTML(carrier)}<span><strong>${esc(c.label)}</strong> · tarne <span class="${shipCents(carrier) ? '' : 'is-free'}" data-picked-price>${esc(priceText(shipCents(carrier)))}</span> · teele ${esc(c.eta)} jooksul</span></p>`
    : '';
  host.innerHTML = `
    <div class="lk-manual">
      <div class="lk-manual__note"><span aria-hidden="true">${SVG.pin}</span><p>${note}</p></div>
      ${priceRow}
      <div class="field">
        <label for="f-locker-manual">Pakiautomaadi nimi ja aadress</label>
        <input class="input" id="f-locker-manual" name="lockerManual" type="text" autocomplete="off" maxlength="160" placeholder="${esc(MANUAL_PLACEHOLDER[carrier] || 'nt Tartu Lõunakeskus, Ringtee 75, Tartu')}" aria-describedby="f-locker-manual-error">
        <p class="field-error" id="f-locker-manual-error" aria-live="polite"></p>
      </div>
    </div>`;
  const input = $('#f-locker-manual', host);
  input.value = state.manual;
  input.addEventListener('input', () => {
    state.manual = input.value;
    if (input.getAttribute('aria-invalid') === 'true') showError(input, V.manual(input.value));
    persistSoon();
    stepsSoon();
  });
  input.addEventListener('blur', () => {
    if (input.value.trim() || input.getAttribute('aria-invalid') === 'true') showError(input, V.manual(input.value));
  });
  $('[data-retry-lockers]', host)?.addEventListener('click', () => loadLockers({ force: true }));
}

/* ---------- Otsitav combobox (WAI-ARIA 1.2 muster) ---------- */
function tokenize(q) {
  return norm(q)
    .split(/[\s,.;/]+/)
    .filter(Boolean);
}

function highlight(text, tokens) {
  const src = String(text);
  if (!tokens.length) return esc(src);
  let n = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const c = norm(src[i]);
    for (let k = 0; k < c.length; k++) {
      n += c[k];
      map.push(i);
    }
  }
  const marks = new Array(src.length).fill(false);
  tokens.forEach((tk) => {
    let from = 0;
    let idx;
    while ((idx = n.indexOf(tk, from)) !== -1) {
      for (let j = idx; j < idx + tk.length; j++) marks[map[j]] = true;
      from = idx + tk.length;
    }
  });
  let out = '';
  let open = false;
  for (let i = 0; i < src.length; i++) {
    if (marks[i] && !open) {
      out += '<mark>';
      open = true;
    } else if (!marks[i] && open) {
      out += '</mark>';
      open = false;
    }
    out += esc(src[i]);
  }
  return open ? `${out}</mark>` : out;
}

function filterLockers() {
  const tokens = tokenize(state.query);
  const pool = lockersFor(state.filter);
  const matched = tokens.length ? pool.filter((l) => tokens.every((t) => l._n.includes(t))) : pool;
  const groups = new Map();
  matched.forEach((l) => {
    if (!groups.has(l._g)) groups.set(l._g, []);
    groups.get(l._g).push(l);
  });
  const first = tokens[0] || '';
  const ordered = [...groups.entries()].sort((a, b) => {
    const am = first && a[1][0]._c.startsWith(first) ? 1 : 0;
    const bm = first && b[1][0]._c.startsWith(first) ? 1 : 0;
    return bm - am || b[1].length - a[1].length || a[0].localeCompare(b[0], 'et');
  });
  return { tokens, matched, ordered, pool };
}

function renderOptions() {
  const list = $('[data-lk-list]');
  if (!list) return;
  const { tokens, matched, ordered, pool } = filterLockers();
  const prices = Object.fromEntries(enabledCarriers().map((id) => [id, shipCents(id)]));
  state.results = [];
  let html = '';
  let g = 0;
  for (const [city, arr] of ordered) {
    if (state.results.length >= MAX_RESULTS) break;
    const take = arr.slice(0, MAX_RESULTS - state.results.length);
    const gid = `lk-g-${g++}`;
    html += `<div class="lk__group" role="group" aria-labelledby="${gid}"><div class="lk__group-label" id="${gid}" role="presentation">${esc(city)}<span>${arr.length}</span></div>`;
    take.forEach((l) => {
      const i = state.results.length;
      state.results.push(l);
      const cents = prices[l.carrier] ?? shipCents(l.carrier);
      html += `<div class="lk__opt lk__opt--${esc(l.carrier)}" role="option" id="lk-opt-${i}" data-index="${i}" aria-selected="false">
        ${markHTML(l.carrier)}
        <span class="lk__opt-main">
          <span class="lk__opt-name">${highlight(l.name, tokens)}</span>
          <span class="lk__opt-addr"><span class="lk__opt-op">${esc(SHIPPING.carriers[l.carrier].name)}</span> · ${highlight(lockerAddress(l), tokens)}</span>
        </span>
        <span class="lk__opt-price${cents ? '' : ' is-free'}">${esc(priceText(cents))}</span>
      </div>`;
    });
    html += '</div>';
  }
  list.innerHTML = html;
  state.activeIndex = -1;
  $('#locker-input')?.removeAttribute('aria-activedescendant');

  const none = $('[data-lk-none]');
  none.hidden = matched.length > 0;
  if (!matched.length) {
    const other = state.filter !== 'all' && tokens.length && state.lockers.some((l) => tokens.every((t) => l._n.includes(t)));
    none.innerHTML = `Päringule „<strong>${esc(state.query.trim())}</strong>“ ei leidnud ühtegi ${state.filter === 'all' ? '' : `${esc(CARRIER_GEN[state.filter] || '')} `}automaati.${
      other ? ' <button type="button" data-lk-all>Otsi kõigist võrkudest</button>' : ' Proovi linna, keskuse või tänava nime.'
    }`;
  }
  const more = $('[data-lk-more]');
  more.textContent =
    matched.length > state.results.length ? `Näitan ${state.results.length} / ${matched.length}. Kirjuta täpsemalt — nt linn, keskus või tänav.` : '';
  $('[data-lk-hint]').textContent = tokens.length
    ? `${plural(matched.length, 'automaat', 'automaati')} vastab otsingule`
    : `${plural(pool.length, 'automaat', 'automaati')} üle Eesti · nt „Tartu“, „Ülemiste“, „Prisma“`;
  announce(matched.length ? `${plural(matched.length, 'tulemus', 'tulemust')}. Kasuta nooleklahve ja Enterit.` : 'Tulemusi pole.');
  // Kui on täpselt üks vaste, märgi see kohe aktiivseks — Enter valib.
  if (tokens.length && state.results.length === 1) setActive(0);
}

function openList() {
  const pop = $('[data-lk-pop]');
  const input = $('#locker-input');
  if (!pop || !pop.hidden) return;
  pop.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function closeList() {
  const pop = $('[data-lk-pop]');
  const input = $('#locker-input');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  setActive(-1);
}

function setActive(i) {
  const list = $('[data-lk-list]');
  const input = $('#locker-input');
  if (!list) return;
  const prev = list.querySelector('.lk__opt.is-active');
  if (prev) {
    prev.classList.remove('is-active');
    prev.setAttribute('aria-selected', 'false');
  }
  state.activeIndex = i;
  if (i < 0) {
    input?.removeAttribute('aria-activedescendant');
    return;
  }
  const opt = list.querySelector(`#lk-opt-${i}`);
  if (!opt) return;
  opt.classList.add('is-active');
  opt.setAttribute('aria-selected', 'true');
  input.setAttribute('aria-activedescendant', opt.id);
  opt.scrollIntoView({ block: 'nearest' });
}

function moveActive(delta) {
  const n = state.results.length;
  if (!n) return;
  let i = state.activeIndex;
  if (i < 0) i = delta > 0 ? 0 : n - 1;
  else i = (i + delta + n) % n;
  setActive(i);
}

function chooseLocker(i) {
  const l = state.results[i];
  if (!l) return;
  state.locker = pickLocker(l);
  state.query = '';
  persist();
  renderShipping();
  afterShippingChange();
  announce(`Valitud: ${l.name}, ${SHIPPING.carriers[l.carrier].name}, tarne ${priceText(shipCents(l.carrier))}.`);
  $('[data-change-locker]')?.focus({ preventScroll: true });
}

function bindCombobox() {
  const input = $('#locker-input');
  const list = $('[data-lk-list]');
  const clear = $('[data-lk-clear]');
  input.value = state.query;
  clear.hidden = !state.query;
  renderOptions();

  input.addEventListener('input', () => {
    state.query = input.value;
    clear.hidden = !input.value;
    openList();
    renderOptions();
    if (input.getAttribute('aria-invalid') === 'true') showError(input, '', $('#locker-error'));
  });
  input.addEventListener('focus', () => {
    openList();
    // Mobiilis tõsta otsing ekraani ülaossa, et nimekiri jääks klaviatuuri kohale nähtavaks.
    if (MOBILE.matches) {
      setTimeout(() => {
        const box = $('.lk');
        if (!box || document.activeElement !== input) return;
        const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
        const top = box.getBoundingClientRect().top + window.scrollY - header - 12;
        if (Math.abs(window.scrollY - top) > 24) window.scrollTo({ top, behavior: REDUCED.matches ? 'auto' : 'smooth' });
      }, 260);
    }
  });
  input.addEventListener('click', openList);
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!el.locker.contains(document.activeElement)) closeList();
    }, 150);
  });
  input.addEventListener('keydown', (e) => {
    const isOpen = !$('[data-lk-pop]').hidden;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) openList();
        if (e.altKey) break;
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) openList();
        moveActive(-1);
        break;
      case 'PageDown':
        if (isOpen) {
          e.preventDefault();
          setActive(Math.min(state.results.length - 1, Math.max(0, state.activeIndex) + 8));
        }
        break;
      case 'PageUp':
        if (isOpen) {
          e.preventDefault();
          setActive(Math.max(0, state.activeIndex - 8));
        }
        break;
      case 'Enter':
        e.preventDefault(); // ära saada vormi teele
        if (isOpen && state.activeIndex >= 0) chooseLocker(state.activeIndex);
        else if (isOpen && state.results.length === 1) chooseLocker(0);
        else openList();
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          closeList();
        } else if (input.value) {
          e.preventDefault();
          input.value = '';
          state.query = '';
          clear.hidden = true;
          renderOptions();
        }
        break;
      case 'Tab':
        closeList();
        break;
      default:
    }
  });
  const pop = $('[data-lk-pop]');
  pop.addEventListener('mousedown', (e) => {
    if (!e.target.closest('button')) e.preventDefault(); // fookus jääb sisendisse
  });
  list.addEventListener('click', (e) => {
    const opt = e.target.closest('[role="option"]');
    if (opt) chooseLocker(Number(opt.dataset.index));
  });
  list.addEventListener('mousemove', (e) => {
    const opt = e.target.closest('[role="option"]');
    if (opt && Number(opt.dataset.index) !== state.activeIndex) setActive(Number(opt.dataset.index));
  });
  pop.addEventListener('click', (e) => {
    if (!e.target.closest('[data-lk-all]')) return;
    const q = state.query;
    selectFilter('all');
    state.query = q;
    const next = $('#locker-input');
    if (next) {
      next.value = q;
      $('[data-lk-clear]').hidden = !q;
      renderOptions();
      next.focus();
      openList();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    state.query = '';
    clear.hidden = true;
    renderOptions();
    input.focus();
    openList();
  });
}

function afterShippingChange() {
  renderSummary(currentTotals());
  updateSteps();
}

/* =========================================================================
   Kontaktandmed ja valideerimine
   ========================================================================= */

/** Konkreetne vihje, miks aadress ei sobi. */
function emailProblem(s) {
  if (s.length > 254) return 'E-posti aadress on liiga pikk. Kontrolli üle.';
  if (/\s/.test(s)) return 'E-posti aadressis ei saa olla tühikuid.';
  const at = s.indexOf('@');
  if (at < 1 || at === s.length - 1) return 'E-posti aadress tundub poolik — see peaks olema kujul nimi@domeen.ee.';
  if (s.indexOf('@', at + 1) !== -1) return 'E-posti aadressis saab olla ainult üks @-märk.';
  return 'Kontrolli aadressi lõppu — see peaks olema kujul nimi@domeen.ee.';
}

export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+372')) d = d.slice(4);
  else if (d.startsWith('00372')) d = d.slice(5);
  else if (d.startsWith('372') && d.length >= 10) d = d.slice(3);
  if (!/^\d+$/.test(d)) return null;
  if (/^5\d{6,7}$/.test(d) || /^8\d{7}$/.test(d)) return `+372${d}`;
  return null;
}

function formatPhone(e164) {
  const d = e164.replace(/^\+372/, '');
  return d.length === 8 ? `${d.slice(0, 4)} ${d.slice(4)}` : `${d.slice(0, 3)} ${d.slice(3)}`;
}

const V = {
  name(v) {
    const s = String(v || '').trim().replace(/\s+/g, ' ');
    if (!s) return 'Sisesta oma nimi — see läheb pakile.';
    if (s.length < 3 || s.split(' ').length < 2) return 'Lisa ka perekonnanimi (nt Mari Maasikas).';
    if (/[0-9@<>]/.test(s)) return 'Nimes ei saa olla numbreid ega erimärke.';
    return '';
  },
  email(v) {
    const s = String(v || '').trim();
    if (!s) return 'Sisesta e-posti aadress — sinna saadame tellimuse kinnituse.';
    if (!isValidEmail(s)) return emailProblem(s);
    return '';
  },
  phone(v) {
    const s = String(v || '').trim();
    if (!s) return 'Sisesta telefoninumber — pakiautomaat saadab sellele SMS-iga koodi.';
    if (!normalizePhone(s)) return 'Sisesta Eesti mobiilinumber, nt 5123 4567 või +372 5123 4567.';
    return '';
  },
  manual(v) {
    const s = String(v || '').trim();
    if (!s) return 'Kirjuta pakiautomaadi nimi ja aadress.';
    if (s.length < 6) return 'Lisa natuke rohkem infot — nt linn ja keskus või tänav.';
    return '';
  },
};

function showError(input, msg, errEl) {
  const err = errEl || (input ? document.getElementById(`${input.id}-error`) : null);
  if (err) err.textContent = msg || '';
  if (!input) return;
  if (msg) {
    input.setAttribute('aria-invalid', 'true');
    input.classList.remove('is-valid');
  } else {
    input.removeAttribute('aria-invalid');
    if (input.classList.contains('input')) input.classList.toggle('is-valid', Boolean(input.value.trim()));
  }
}

/* E-posti kirjavea soovitus (gmial.com → gmail.com) */
const EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'yahoo.com', 'live.com', 'me.com', 'mail.ee', 'online.ee', 'hot.ee', 'neti.ee', 'proton.me', 'protonmail.com'];
const EMAIL_FIXES = { 'gmail.ee': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'hotmail.con': 'hotmail.com' };

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

function suggestEmail(v) {
  const m = String(v || '').trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const [, user, domain] = m;
  if (EMAIL_DOMAINS.includes(domain)) return null;
  if (EMAIL_FIXES[domain]) return `${user}@${EMAIL_FIXES[domain]}`;
  let best = null;
  let bestD = 9;
  EMAIL_DOMAINS.forEach((c) => {
    const dist = lev(domain, c);
    if (dist < bestD) {
      best = c;
      bestD = dist;
    }
  });
  if (best && (bestD === 1 || (bestD === 2 && best.length >= 9))) return `${user}@${best}`;
  return null;
}

function renderEmailSuggest() {
  const s = suggestEmail(el.email.value);
  el.emailSuggest.hidden = !s;
  if (s) el.emailSuggest.innerHTML = `Kas mõtlesid <button type="button" data-fix-email>${esc(s)}</button>?`;
}

el.emailSuggest.addEventListener('click', (e) => {
  if (!e.target.closest('[data-fix-email]')) return;
  el.email.value = suggestEmail(el.email.value) || el.email.value;
  el.emailSuggest.hidden = true;
  showError(el.email, V.email(el.email.value));
  persist();
  updateSteps();
  el.email.focus();
});

// Serveri tagastatud väljaviga jääb kehtima, kuni klient välja väärtust muudab.
const serverErrors = new Map(); // input -> { key, msg }
const valueKey = (input, v) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return input === el.phone ? normalizePhone(s) || s : s.toLowerCase();
};
const withServer = (input, check) => (v) => {
  const se = serverErrors.get(input);
  if (se) {
    if (se.key === valueKey(input, v)) return se.msg;
    serverErrors.delete(input);
  }
  return check(v);
};

const CONTACT = [
  { input: el.name, check: withServer(el.name, V.name) },
  { input: el.email, check: withServer(el.email, V.email) },
  { input: el.phone, check: withServer(el.phone, V.phone) },
];

CONTACT.forEach(({ input, check }) => {
  input.addEventListener('blur', () => {
    if (input === el.name) input.value = input.value.trim().replace(/\s+/g, ' ');
    if (input === el.email) input.value = input.value.trim();
    if (input === el.phone) {
      const n = normalizePhone(input.value);
      if (n) input.value = formatPhone(n);
    }
    if (input.value.trim() || input.getAttribute('aria-invalid') === 'true') showError(input, check(input.value));
    if (input === el.email) renderEmailSuggest();
    persist();
    updateSteps();
  });
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') {
      const msg = check(input.value);
      if (!msg) showError(input, '');
    } else if (input.classList.contains('is-valid') && check(input.value)) {
      input.classList.remove('is-valid');
    }
    if (input === el.email && !el.emailSuggest.hidden) renderEmailSuggest();
    persistSoon();
    stepsSoon();
  });
});

// Enter kontaktväljadel liigub järgmisele väljale (mitte ei saada kogu vormi teele).
CONTACT.forEach(({ input }, i) => {
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const next = CONTACT[i + 1]?.input;
    if (next) next.focus();
    else {
      input.blur();
      if (!el.terms.checked) focusField(el.terms);
    }
  });
});

[el.terms, el.age].forEach((cb) =>
  cb.addEventListener('change', () => {
    if (cb.checked) showError(cb, '');
    updateSteps();
  }),
);

const needsAge = (t = Cart.totals()) => state.forceAge || t.lines.some((l) => l.product.adult);

function renderAge(t) {
  el.ageWrap.hidden = !needsAge(t);
}

/* =========================================================================
   Vormi säilitamine (sessionStorage; checkboxe ei säilitata)
   ========================================================================= */
function persist() {
  store.set(FORM_KEY, {
    name: el.name.value,
    email: el.email.value,
    phone: el.phone.value,
    filter: state.filter,
    locker: state.locker,
    manual: state.manual,
  });
}
let persistTimer;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 250);
}

function readPromoEmail() {
  try {
    const raw = localStorage.getItem('age_promo_email');
    if (!raw) return '';
    let v = raw;
    try {
      const parsed = JSON.parse(raw);
      v = typeof parsed === 'string' ? parsed : parsed?.email || '';
    } catch {
      /* lihtne string */
    }
    return isValidEmail(String(v).trim()) ? String(v).trim() : '';
  } catch {
    return '';
  }
}

function restore() {
  let s = store.get(FORM_KEY, null);
  if (!s) {
    // Vana vorm (v1): automaadil polnud vedajat küljes.
    const old = store.get(OLD_FORM_KEY, null);
    if (old) {
      s = { ...old, filter: 'all', locker: old.locker && old.carrier ? { ...old.locker, carrier: old.carrier } : null };
    }
  }
  s = s || {};
  if (s.name) el.name.value = s.name;
  if (s.email) el.email.value = s.email;
  else {
    const promo = readPromoEmail();
    if (promo) el.email.value = promo;
  }
  if (s.phone) el.phone.value = s.phone;
  CONTACT.forEach(({ input, check }) => {
    if (input.value.trim() && !check(input.value)) input.classList.add('is-valid');
  });
  if (s.filter === 'all' || Object.prototype.hasOwnProperty.call(SHIPPING.carriers, s.filter || '')) state.filter = s.filter;
  if (s.locker && s.locker.name && SHIPPING.carriers[s.locker.carrier]) state.locker = { ...s.locker, id: String(s.locker.id ?? '') };
  state.manual = typeof s.manual === 'string' ? s.manual : '';
  renderShipping();
  loadLockers();
}

/* =========================================================================
   Sammud
   ========================================================================= */
function shippingDone() {
  if (state.lockerMode === 'loading') return false;
  if (manualMode()) return Boolean(currentCarrier()) && !V.manual(state.manual);
  return Boolean(state.locker);
}

function updateSteps() {
  const t = currentTotals();
  const done = [
    t.lines.length > 0,
    shippingDone(),
    CONTACT.every(({ input, check }) => !check(input.value)),
    el.terms.checked && (!needsAge(t) || el.age.checked),
  ];
  const current = done.findIndex((d) => !d);
  $$('.co-step').forEach((li, i) => {
    const a = $('a', li);
    li.classList.toggle('is-done', done[i]);
    li.classList.toggle('is-current', i === current);
    if (i === current) a.setAttribute('aria-current', 'step');
    else a.removeAttribute('aria-current');
    $('[data-step-state]', li).textContent = done[i] ? ' (tehtud)' : i === current ? ' (praegune samm)' : '';
  });
  $$('[data-section]').forEach((sec, i) => sec.classList.toggle('is-done', done[i]));
  el.stepsFill.style.setProperty('--p', String(done.filter(Boolean).length / 4));
  const ready = done.every(Boolean);
  $$('[data-pay]').forEach((b) => b.classList.toggle('is-ready', ready));
  if (state.attempted && !el.payError.hidden && el.payError.dataset.kind === 'validation') {
    const errs = collectErrors();
    if (!errs.length) hidePayError();
    else showValidationSummary(errs);
  }
}
let stepsTimer;
function stepsSoon() {
  clearTimeout(stepsTimer);
  stepsTimer = setTimeout(updateSteps, 160);
}

/* =========================================================================
   Makse
   ========================================================================= */
function collectErrors() {
  const errs = [];
  const t = currentTotals();
  if (!t.lines.length) errs.push({ key: 'cart', msg: 'Ostukorv on tühi.', focus: () => $('#h-ostukorv') });
  const firstChip = () => $('.lk-chip__input:checked:not(:disabled)') || $('.lk-chip:not([hidden]) .lk-chip__input:not(:disabled)');
  if (state.lockerMode === 'loading') {
    errs.push({ key: 'locker', msg: 'Automaatide nimekirja alles laaditakse — oota hetk.', focus: firstChip, label: 'Pakiautomaat' });
  } else if (manualMode()) {
    if (!currentCarrier()) {
      const names = orList(enabledCarriers().map((id) => carrierInfo(id).name));
      errs.push({ key: 'carrier', msg: `Vali pakiautomaadi võrk${names ? ` (${names})` : ''}.`, focus: firstChip, label: 'Võrk' });
    } else {
      const m = V.manual(state.manual);
      if (m) errs.push({ key: 'manual', msg: m, focus: () => $('#f-locker-manual'), label: 'Pakiautomaat' });
    }
  } else if (!state.locker) {
    errs.push({ key: 'locker', msg: 'Vali nimekirjast pakiautomaat, kuhu pakk saata.', focus: () => $('#locker-input'), label: 'Pakiautomaat' });
  }
  const labels = { name: 'Nimi', email: 'E-post', phone: 'Telefon' };
  CONTACT.forEach(({ input, check }) => {
    const m = check(input.value);
    if (m) errs.push({ key: input.name, msg: m, focus: () => input, label: labels[input.name] });
  });
  if (!el.terms.checked) errs.push({ key: 'terms', msg: 'Märgi, et nõustud müügitingimustega.', focus: () => el.terms, label: 'Müügitingimused' });
  if (needsAge(t) && !el.age.checked)
    errs.push({ key: 'age', msg: 'MIDA V!!!U on 18+ mäng — palun kinnita, et oled täisealine.', focus: () => el.age, label: 'Vanus' });
  return errs;
}

function markErrors(errs) {
  errs.forEach((e) => {
    switch (e.key) {
      case 'carrier':
        showError(null, e.msg, el.carrierError);
        $$('.lk-chip:not(.is-disabled)').forEach((c) => c.classList.add('is-invalid'));
        break;
      case 'locker': {
        const input = $('#locker-input');
        if (input) showError(input, e.msg, $('#locker-error'));
        else showError(null, e.msg, el.carrierError);
        break;
      }
      case 'manual':
        showError($('#f-locker-manual'), e.msg);
        break;
      case 'name':
      case 'email':
      case 'phone':
        showError(el[e.key], e.msg);
        break;
      case 'terms':
        showError(el.terms, e.msg);
        break;
      case 'age':
        showError(el.age, e.msg);
        break;
      default:
    }
  });
}

function showValidationSummary(errs) {
  el.payError.dataset.kind = 'validation';
  el.payError.hidden = false;
  el.payError.innerHTML = `<div><strong>${errs.length === 1 ? 'Üks asi on veel puudu:' : 'Paar asja on veel puudu:'}</strong><ul>${errs
    .map((e, i) => `<li><a href="#" data-err="${i}">${esc(e.msg)}</a></li>`)
    .join('')}</ul></div>`;
  el.payError._errs = errs;
}

function showServerError(msg) {
  el.payError.dataset.kind = 'server';
  el.payError.hidden = false;
  el.payError.innerHTML = `<div>${esc(msg)}</div>`;
}

function hidePayError() {
  el.payError.hidden = true;
  el.payError.innerHTML = '';
  delete el.payError.dataset.kind;
}

el.payError.addEventListener('click', (e) => {
  const a = e.target.closest('[data-err]');
  if (!a) return;
  e.preventDefault();
  const err = el.payError._errs?.[Number(a.dataset.err)];
  if (err) focusField(err.focus());
});

function focusField(node) {
  if (!node) return;
  const scrollTarget = node.closest('.field, .co-check-wrap, .lk-filter, .lk, .co-card') || node;
  scrollTarget.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'center' });
  if (node.tagName === 'H2' || node.tagName === 'H3') node.tabIndex = -1;
  setTimeout(() => node.focus({ preventScroll: true }), REDUCED.matches ? 0 : 350);
}

function setSubmitting(on) {
  state.submitting = on;
  const t = currentTotals();
  $$('[data-pay]').forEach((b) => {
    b.disabled = on;
    b.classList.toggle('is-loading', on);
    b.setAttribute('aria-busy', String(on));
  });
  $$('[data-pay-label]').forEach((s) => {
    const short = Boolean(s.closest('.co-paybar'));
    s.textContent = on ? (short ? 'Suuname…' : 'Suuname makselehele…') : payLabel(t);
  });
}

const SERVER_FIELD = {
  name: 'name',
  'customer.name': 'name',
  email: 'email',
  'customer.email': 'email',
  phone: 'phone',
  'customer.phone': 'phone',
  carrier: 'carrier',
  'shipping.carrier': 'carrier',
  locker: 'locker',
  lockerId: 'locker',
  lockerName: 'locker',
  shipping: 'locker',
  'shipping.lockerId': 'locker',
  'shipping.lockerName': 'locker',
  'shipping.lockerAddress': 'locker',
  'shipping.lockerCity': 'locker',
  'shipping.manual': 'locker',
  terms: 'terms',
  termsAccepted: 'terms',
  age: 'age',
  ageConfirmed: 'age',
  code: 'code',
  items: 'cart',
};

function markServerField(field, msg) {
  const key = SERVER_FIELD[field] || null;
  if (!key) return;
  if (key === 'code') {
    setCodeError(msg);
    return focusField(Cart.code() ? $('[data-remove-code]') : el.codeInput);
  }
  if (key === 'cart') return focusField($('#h-ostukorv'));
  if (key === 'carrier') {
    // Vedaja pole (enam) lubatud — värskenda nimekiri ja lase uuesti valida.
    state.locker = null;
    try {
      sessionStorage.removeItem(LOCKER_KEY);
    } catch {
      /* ignore */
    }
    loadLockers({ force: true });
  }
  if (key === 'name' || key === 'email' || key === 'phone') {
    serverErrors.set(el[key], { key: valueKey(el[key], el[key].value), msg });
    updateSteps();
  }
  if (key === 'age') {
    state.forceAge = true;
    renderAge(Cart.totals());
  }
  const errs = collectErrors();
  let target = errs.find((e) => e.key === key || (key === 'locker' && e.key === 'manual'));
  if (!target) {
    const map = {
      name: () => el.name,
      email: () => el.email,
      phone: () => el.phone,
      terms: () => el.terms,
      age: () => el.age,
      carrier: () => $('.lk-chip__input:checked:not(:disabled)') || $('.lk-chip:not([hidden]) .lk-chip__input:not(:disabled)'),
      locker: () => $('#locker-input') || $('#f-locker-manual') || $('[data-change-locker]'),
    };
    target = { key, msg, focus: map[key] || (() => null) };
  }
  markErrors([{ ...target, msg }]);
  focusField(target.focus());
}

function buildPayload() {
  const t = currentTotals();
  const carrier = currentCarrier();
  const l = state.locker;
  // Server võtab ametliku nime/aadressi/linna nimekirjast id järgi; aadress ilma linnata.
  const shipping =
    manualMode() || !l
      ? { carrier, lockerId: '', lockerName: state.manual.trim(), lockerAddress: '', manual: true }
      : { carrier, lockerId: l.id, lockerName: l.name, lockerAddress: l.address, lockerCity: l.city };
  return {
    items: Cart.items(),
    code: Cart.code(),
    customer: {
      name: el.name.value.trim().replace(/\s+/g, ' '),
      email: el.email.value.trim(),
      phone: normalizePhone(el.phone.value),
    },
    shipping,
    ageConfirmed: needsAge(t) ? el.age.checked : false,
    termsAccepted: el.terms.checked,
    newsletter: el.news.checked,
  };
}

function saveLastOrder(data) {
  if (!TOKEN_RE.test(String(data?.token || ''))) return;
  store.set(LAST_ORDER_KEY, { orderNumber: data.orderNumber, token: data.token, expiresAt: data.expiresAt || null, at: Date.now() });
}

/* ---------- Laopuudus (409) ---------- */
function stockShortfalls() {
  if (!state.shortages.length) return [];
  const q = gameQuantities(Cart.items());
  return state.shortages.filter((s) => (q[s.id] || 0) > Math.max(0, Number(s.available) || 0));
}

function renderStock() {
  const short = stockShortfalls();
  if (!short.length) {
    state.shortages = [];
    el.stock.hidden = true;
    el.stock.innerHTML = '';
    if (el.payError.dataset.kind === 'stock') hidePayError();
  } else {
    const q = gameQuantities(Cart.items());
    el.stock.hidden = false;
    el.stock.innerHTML = `
      <span class="co-stock__icon" aria-hidden="true">${SVG.alert}</span>
      <div>
        <p><strong>Kõike ei ole laos piisavalt.</strong> Vähenda kogust või eemalda toode ja proovi siis uuesti maksta.</p>
        <ul>${short
          .map((s) => {
            const avail = Math.max(0, Number(s.available) || 0);
            return `<li><strong>${esc(s.name)}</strong> — ${avail ? `laos ${avail} tk, korvis ${q[s.id] || 0} tk (komplektid kaasa arvatud)` : 'hetkel otsas'}</li>`;
          })
          .join('')}</ul>
      </div>`;
  }
  // Märgi read, mille sisu puudub laost (komplektid lahti võetuna).
  $$('.co-line', el.lines).forEach((li) => {
    const contents = productContents(li.dataset.id).map((c) => c.id);
    const hit = short.filter((s) => contents.includes(s.id));
    li.classList.toggle('is-short', hit.length > 0);
    const note = $('[data-line-stock]', li);
    if (!note) return;
    note.hidden = !hit.length;
    note.textContent = hit
      .map((s) => {
        const avail = Math.max(0, Number(s.available) || 0);
        return avail ? `${s.name}: laos ainult ${avail} tk` : `${s.name} on hetkel otsas`;
      })
      .join(' · ');
  });
}

async function onSubmit(e) {
  e.preventDefault();
  if (state.submitting) return;
  hidePayError();
  const errs = collectErrors();
  if (errs.length) {
    state.attempted = true;
    markErrors(errs);
    showValidationSummary(errs);
    updateSteps();
    focusField(errs[0].focus());
    return;
  }
  const payload = buildPayload();
  setSubmitting(true);
  persist();
  let data = null;
  let res;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    data = await res.json().catch(() => null);
  } catch (err) {
    setSubmitting(false);
    showServerError(
      err?.name === 'AbortError'
        ? 'Makseserver ei vastanud õigeaegselt. Proovi palun uuesti.'
        : 'Ühendus katkes. Kontrolli internetiühendust ja proovi uuesti.',
    );
    el.payError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (res.ok && data?.url) {
    saveLastOrder(data);
    window.location.href = data.url;
    return;
  }
  setSubmitting(false);
  if (res.status === 409 && Array.isArray(data?.shortages) && data.shortages.length) {
    state.shortages = data.shortages.filter((s) => s && s.id);
    renderStock();
    showServerError(data.error || 'Kõike ei ole laos piisavalt. Muuda ostukorvi ja proovi uuesti.');
    el.payError.dataset.kind = 'stock';
    focusField($('#h-ostukorv'));
    return;
  }
  const msg =
    data?.error ||
    (res.status >= 500
      ? 'Makse alustamine ebaõnnestus meie poolel. Proovi mõne hetke pärast uuesti või kirjuta meile.'
      : 'Tellimust ei õnnestunud vormistada. Kontrolli andmed üle ja proovi uuesti.');
  showServerError(msg);
  if (data?.field) markServerField(data.field, msg);
  else el.payError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

el.form.addEventListener('submit', onSubmit);

// Tagasi-nupp Stripe'ist (bfcache) — taasta nupp.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    setSubmitting(false);
    render();
    checkPendingOrder({ cancelled: false });
  }
});

/* =========================================================================
   Mobiili kleepuv makseriba
   ========================================================================= */
function updatePaybar() {
  const show = MOBILE.matches && Cart.count() > 0 && !state.payInView && !state.typing;
  el.paybar.classList.toggle('is-visible', show);
  document.body.classList.toggle('has-paybar', show);
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver(
    ([en]) => {
      state.payInView = en.isIntersecting;
      updatePaybar();
    },
    { threshold: 0.2 },
  ).observe(el.payMain);
}
let typingTimer;
document.addEventListener('focusin', (e) => {
  if (e.target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select')) {
    clearTimeout(typingTimer);
    state.typing = true;
    updatePaybar();
  }
});
document.addEventListener('focusout', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    state.typing = false;
    updatePaybar();
  }, 200);
});
MOBILE.addEventListener?.('change', updatePaybar);

/* =========================================================================
   Tühi ostukorv — soovitused
   ========================================================================= */
const REC_IDS = ['mida-viiu', 'oled-semu', 'vigur', 'komplekt-koik'];
function renderRecs() {
  if (el.recs.childElementCount) return;
  el.recs.innerHTML = REC_IDS.map((id) => PRODUCTS[id])
    .filter(Boolean)
    .map(
      (p) => `
      <article class="rec">
        <a class="rec__media" href="${esc(p.url)}" style="--g:${esc(p.gradient || `radial-gradient(120% 120% at 50% 0%, ${p.accent || '#ff2fa8'} 0%, #14040f 70%)`)}" tabindex="-1" aria-hidden="true">
          <span class="rec__badges">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}${p.adult ? '<span class="badge badge--18">18+</span>' : ''}</span>
          <img src="${esc(p.image)}" alt="" width="240" height="240" loading="lazy" decoding="async">
        </a>
        <div class="rec__body">
          <h4 class="rec__name"><a href="${esc(p.url)}">${esc(p.name)}</a></h4>
          <p class="rec__tag">${esc(p.tagline)}</p>
          <div class="rec__foot">
            <span class="rec__price">${formatEur(toCents(p.price))}</span>
            <button class="btn btn--primary btn--sm" type="button" data-add-to-cart="${esc(p.id)}" aria-label="Lisa ostukorvi: ${esc(p.name)}">${ICONS.cart}<span>Lisa</span></button>
          </div>
        </div>
      </article>`,
    )
    .join('');
}

/* =========================================================================
   Peamine renderdus
   ========================================================================= */
function render() {
  const t = currentTotals();
  const has = t.lines.length > 0;
  el.form.hidden = !has;
  el.empty.hidden = has;
  el.steps.hidden = !has;
  el.titleCount.hidden = !has;
  el.titleCount.textContent = String(Cart.count());
  el.titleCount.setAttribute('aria-label', plural(Cart.count(), 'toode', 'toodet'));
  el.heroSub.innerHTML = has
    ? 'Paar klikki ja pidu on teel. Saadame paki <span class="nowrap">1–3 tööpäevaga</span> teele sinu valitud pakiautomaati.'
    : 'Siin on hetkel vaikne — aga see on kergesti parandatav.';
  if (!has) {
    renderRecs();
    updatePaybar();
    return;
  }
  renderLines(t);
  renderStock();
  renderBundle();
  el.free.innerHTML = freeShippingHTML(t);
  renderCode(t);
  renderUpsell();
  renderAge(t);
  renderSummary(t);
  updateSteps();
  updatePaybar();
  state.firstRender = false;
}

window.addEventListener('cart:change', () => render());

// Päise ostukorvi nupp: kassalehel sahtlit ei avata (layout.js) — keri hoopis korvi juurde.
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-open-cart]')) return;
  const target = Cart.count() ? $('#samm-ostukorv') : el.empty;
  target?.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start' });
});

/* =========================================================================
   Pooleli makse: /ostukorv?katkestatud=1&t=TOKEN (Stripe'i „tagasi“) või
   brauseri tagasinupp makselehelt → GET /api/tellimus → „Jätka makset“
   ========================================================================= */
const TIME_FMT = new Intl.DateTimeFormat('et-EE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' });

function setBanner(kind, html) {
  el.banner.hidden = false;
  el.banner.dataset.kind = kind;
  $('[data-banner-body]', el.banner).innerHTML = html;
}

/** Lubame jätkata ainult Stripe'i makselehele või oma test-Stripe'i (mock) lehele. */
function safeResumeUrl(raw) {
  try {
    const u = new URL(raw, location.origin);
    if (u.origin === location.origin && u.pathname.startsWith('/__mock-stripe/')) return u.href;
    if (u.protocol === 'https:' && /(^|\.)stripe\.com$/.test(u.hostname)) return u.href;
  } catch {
    /* vigane */
  }
  return null;
}

let pendingCheck = 0;
async function checkPendingOrder({ cancelled, token: given } = {}) {
  const last = store.get(LAST_ORDER_KEY);
  const token = given || last?.token || '';
  if (!TOKEN_RE.test(token)) {
    if (cancelled) setBanner('cancel', '<p><strong>Makse katkestati</strong> — sinu ostukorv on alles. Kontrolli andmed üle ja vajuta uuesti „Maksa“.</p>');
    return;
  }
  // Ilma katkestamise märgita (nt tagasinupp) kontrolli ainult värsket tellimust.
  if (!cancelled && (!last || last.token !== token || Date.now() - (last.at || 0) > 2 * 60 * 60 * 1000)) return;
  if (cancelled) setBanner('cancel', '<p><strong>Makse katkestati</strong> — sinu ostukorv on alles. Kontrollime tellimuse olekut…</p>');
  const run = ++pendingCheck;
  let data = null;
  try {
    const res = await fetch(`/api/tellimus?t=${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    data = res.ok ? await res.json().catch(() => null) : null;
  } catch {
    data = null;
  }
  if (run !== pendingCheck) return;
  if (data && (data.paid || data.paymentStatus === 'processing')) {
    if (cancelled) {
      location.replace(`/aitah?t=${encodeURIComponent(token)}`);
      return;
    }
    setBanner(
      'ok',
      `<p><strong>Tellimus ${esc(data.number)} on ${data.paid ? 'makstud' : 'vastu võetud'}.</strong> <a href="/aitah?t=${encodeURIComponent(token)}">Vaata tellimuse kinnitust</a></p>`,
    );
    return;
  }
  const resume = data?.resumeUrl ? safeResumeUrl(data.resumeUrl) : null;
  if (data && data.paymentStatus === 'pending' && resume) {
    const until = data.resumeExpiresAt ? new Date(data.resumeExpiresAt) : null;
    const time = until && !Number.isNaN(until.getTime()) ? TIME_FMT.format(until) : '';
    setBanner(
      'resume',
      `<div class="co-banner__text">
        <p class="co-banner__title"><strong>Makse jäi pooleli</strong></p>
        <p>Tellimus <strong>${esc(data.number)}</strong> (${formatEur(Number(data.totals?.totalCents) || 0)}) ootab makset${time ? ` — makseleht on avatud kuni kella <strong>${esc(time)}</strong>` : ''}. Sinu ostukorv on samuti alles: kui soovid midagi muuta, muuda ja maksa uuesti.</p>
      </div>
      <a class="btn btn--primary co-banner__cta" href="${esc(resume)}" data-resume>Jätka makset ${SVG.arrow}</a>`,
    );
    return;
  }
  if (!cancelled) return;
  const why =
    data?.paymentStatus === 'expired'
      ? 'Makseaeg sai läbi'
      : data?.paymentStatus === 'failed'
        ? 'Makse ei õnnestunud'
        : 'Makse katkestati';
  setBanner('cancel', `<p><strong>${why}</strong> — sinu ostukorv on alles. Kontrolli andmed üle ja vajuta uuesti „Maksa“.</p>`);
}

el.banner.addEventListener('click', (e) => {
  if (e.target.closest('[data-close-banner]')) el.banner.hidden = true;
});

/* =========================================================================
   Käivitus
   ========================================================================= */
(function init() {
  const params = new URLSearchParams(location.search);
  const cancelled = params.get('katkestatud') === '1';
  const token = params.get('t') || '';
  // Salajane tellimuse tunnus ei jää aadressiribale (jagamine, ajalugu); see on sessionStorage'is olemas.
  if (params.has('t')) {
    if (TOKEN_RE.test(token)) {
      const last = store.get(LAST_ORDER_KEY);
      if (!last || last.token !== token) store.set(LAST_ORDER_KEY, { token, at: Date.now() });
    }
    params.delete('t');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`);
  }
  checkPendingOrder({ cancelled, token: TOKEN_RE.test(token) ? token : '' });
  const kood = params.get('kood');
  if (kood) {
    if (Cart.applyCode(kood)) {
      const t = Cart.totals();
      setTimeout(() => toast(`Sooduskood <strong>${esc(t.code)}</strong> on rakendatud: −${t.percent}%!`), 400);
    } else {
      setTimeout(() => toast(`Sooduskood „${esc(kood)}“ ei kehti.`), 400);
    }
  }
  if (params.has('kood')) {
    params.delete('kood');
    const qs = params.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }
  restore();
  render();
})();
