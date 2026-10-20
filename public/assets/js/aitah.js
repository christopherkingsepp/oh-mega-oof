// Tellimuse kinnitusleht (/aitah?t=TOKEN[&session_id=cs_…]).
// Makse olekut ei arvata URL-i järgi: leht küsib selle serverist (GET /api/tellimus), mis
// session_id korral kontrollib vajadusel ka Stripe'ist. pending/processing → küsime uuesti
// (~3 s kuni 2 min, siis ~15 s). Ostukorv ja sooduskood tühjendatakse AINULT paid või
// processing korral; failed/expired korral jääb korv alles (vajadusel taastatakse tellimusest).
import { Cart } from './cart.js';
import { PRODUCTS, SHIPPING, formatEur } from './catalog.js';
import { esc } from './layout.js';
import { SITE } from './site.js';

const $ = (sel, root = document) => root.querySelector(sel);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const SESSION_RE = /^cs_[A-Za-z0-9_]{6,250}$/;
const LAST_ORDER_KEY = 'age_last_order_v2'; // checkout.js (sessionStorage): {orderNumber, token, expiresAt, at}
const DONE_KEY = 'age_orders_done_v1'; // localStorage: {tokeniAlgus: {cleared?, party?}}
const FAST_MS = 3000;
const FAST_FOR_MS = 2 * 60 * 1000;
const SLOW_MS = 15000;
const GIVE_UP_MS = 30 * 60 * 1000;

const SVG = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  fail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.01"/></svg>',
  refund: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  arrow: '<svg class="icon arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  retry: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
};
const PARTY =
  '<span class="ty-party" data-party title="Veel konfetit!" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 20.5 9 8.5l7.5 7.5z"/><path d="M7.4 12.8 11.2 16.6M6 16.6l1.9 1.9"/><path d="M13 3.5c.9.9.9 2.4 0 3.3M17.5 9.2c1-.6 2.4-.4 3.1.5M15 6.5l1.2-1.2"/><path d="M19.5 3.5v.01M21 13.5v.01M10.5 2.5v.01"/></svg></span>';

/* =========================================================================
   Salvestus (iga pöördumine võib privaatses režiimis visata)
   ========================================================================= */
function storageGet(kind, key) {
  try {
    const raw = window[kind].getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function storageSet(kind, key, value) {
  try {
    window[kind].setItem(key, JSON.stringify(value));
  } catch {
    /* pole hullu */
  }
}
try {
  sessionStorage.removeItem('age_last_order_v1'); // vana kassa kokkuvõte (v1)
} catch {
  /* pole hullu */
}

// Tunnuse algusest piisab, et ära tunda, kas selle tellimuse korv on juba tühjendatud / pidu peetud.
const tokenKey = (t) => t.slice(0, 16);
function doneFlags(t) {
  const all = storageGet('localStorage', DONE_KEY) || {};
  return all[tokenKey(t)] || {};
}
function setDone(t, flags) {
  const all = storageGet('localStorage', DONE_KEY) || {};
  const k = tokenKey(t);
  all[k] = { ...(all[k] || {}), ...flags, at: Date.now() };
  // Hoia ainult viimased 20 tellimust.
  const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
  for (const old of keys.slice(20)) delete all[old];
  storageSet('localStorage', DONE_KEY, all);
}

/* =========================================================================
   Sisend
   ========================================================================= */
const params = new URLSearchParams(location.search);
const token = TOKEN_RE.test(params.get('t') || '') ? params.get('t') : '';
const sessionId = SESSION_RE.test(params.get('session_id') || '') ? params.get('session_id') : '';
const lastOrder = storageGet('sessionStorage', LAST_ORDER_KEY);
// Kas see tellimus vormistati just selles brauseris (Stripe suunas tagasi või sama vaheleht)?
const isOwnFreshOrder = Boolean(token && (sessionId || (lastOrder && lastOrder.token === token)));

const el = {
  main: $('#main'),
  icon: $('[data-ty-icon]'),
  eyebrow: $('[data-ty-eyebrow]'),
  title: $('[data-ty-title]'),
  lead: $('[data-ty-lead]'),
  actions: $('[data-ty-actions]'),
  poll: $('[data-ty-poll]'),
  live: $('[data-ty-live]'),
  detail: $('[data-ty-detail]'),
  receipt: $('[data-ty-receipt]'),
  ship: $('[data-ty-ship]'),
  withdraw: $('[data-ty-withdraw]'),
  next: $('[data-ty-next]'),
  share: $('[data-ty-share]'),
  cta: $('[data-ty-cta]'),
  helpNo: $('[data-help-no]'),
  step1When: $('[data-step1-when]'),
  step1Text: $('[data-step1-text]'),
  step3Text: $('[data-step3-text]'),
};

/* =========================================================================
   Vormindus
   ========================================================================= */
const DATE_FMT = new Intl.DateTimeFormat('et-EE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Tallinn' });
const TIME_FMT = new Intl.DateTimeFormat('et-EE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' });
const CLOCK_FMT = new Intl.DateTimeFormat('et-EE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Tallinn' });

function toDate(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function dateTime(iso) {
  const d = toDate(iso);
  return d ? `${DATE_FMT.format(d)}, kell ${TIME_FMT.format(d)}` : '';
}
const cents = (v) => Math.max(0, Math.round(Number(v) || 0));
const product = (id) => (Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id] : null);
const carrierOf = (o) => (Object.prototype.hasOwnProperty.call(SHIPPING.carriers, o?.shipping?.carrier) ? SHIPPING.carriers[o.shipping.carrier] : null);

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

function markHTML(carrier) {
  const id = ['omniva', 'smartpost', 'dpd'].includes(carrier) ? carrier : 'other';
  const inner = id === 'dpd' ? SVG.box : id === 'smartpost' ? 'S' : id === 'omniva' ? 'O' : SVG.pin;
  return `<span class="lk-mark lk-mark--lg lk-mark--${id}" aria-hidden="true">${inner}</span>`;
}

/* =========================================================================
   Tellimuse kokkuvõte
   ========================================================================= */
const PILL = {
  paid: 'ok',
  partially_refunded: 'ok',
  processing: 'wait',
  pending: 'wait',
  failed: 'bad',
  expired: 'bad',
  refunded: 'info',
};

function lineHTML(i) {
  const p = product(i.id);
  const qty = Math.max(1, Math.floor(Number(i.qty)) || 1);
  const inc = Array.isArray(i.includes) && i.bundle
    ? i.includes.map((x) => `${Number(x.qty) > 1 ? `${Number(x.qty)}× ` : ''}${esc(x.name)}`).join(', ')
    : '';
  const img = p?.image
    ? `<img src="${esc(p.image)}" alt="" width="240" height="240" loading="lazy" decoding="async">`
    : `<span class="ty-line__ph">${SVG.box}</span>`;
  return `<li class="ty-line">
    <span class="ty-line__img" aria-hidden="true">${img}</span>
    <div class="ty-line__info">
      <p class="ty-line__name">${esc(i.name || p?.name || i.id)}</p>
      ${inc ? `<p class="ty-line__inc"><span>Sisaldab:</span> ${inc}</p>` : ''}
      <p class="ty-line__qty">${qty} × ${formatEur(cents(i.unitCents))}</p>
    </div>
    <span class="ty-line__total">${formatEur(cents(i.totalCents))}</span>
  </li>`;
}

function receiptHTML(o) {
  const t = o.totals || {};
  const c = carrierOf(o);
  const paidLike = ['paid', 'partially_refunded', 'refunded'].includes(o.paymentStatus);
  const pill = `<span class="ty-pill ty-pill--${PILL[o.paymentStatus] || 'info'}">${esc(o.paymentStatusLabel || '')}</span>`;
  const created = dateTime(o.createdAt);
  const paid = paidLike && o.paidAt ? dateTime(o.paidAt) : '';
  const ship = cents(t.shippingCents);
  const rows = [
    `<div class="sum-row"><dt>Tooted</dt><dd>${formatEur(cents(t.subtotalCents))}</dd></div>`,
    cents(t.discountCents)
      ? `<div class="sum-row sum-row--discount"><dt>Soodustus${t.discountCode ? ` (${esc(t.discountCode)}${t.discountPercent ? `, −${Number(t.discountPercent)}%` : ''})` : ''}</dt><dd>−${formatEur(cents(t.discountCents))}</dd></div>`
      : '',
    `<div class="sum-row"><dt>Tarne${c ? ` · ${esc(c.name)}` : ''}</dt><dd${ship ? '' : ' class="is-free"'}>${ship ? formatEur(ship) : 'Tasuta'}</dd></div>`,
    `<div class="sum-row sum-row--total ty-sums__total"><dt>${paidLike ? 'Makstud' : 'Kokku'}</dt><dd>${formatEur(cents(t.totalCents))}</dd></div>`,
    cents(t.refundedCents)
      ? `<div class="sum-row ty-sums__refund"><dt>Tagastatud</dt><dd>−${formatEur(cents(t.refundedCents))}</dd></div>`
      : '',
  ].join('');
  return `
    <header class="ty-receipt__head">
      <div>
        <p class="ty-receipt__label">Tellimus</p>
        <p class="ty-receipt__no" id="ty-receipt-no">${esc(o.number)}</p>
      </div>
      ${pill}
      <p class="ty-receipt__date">${created ? `Esitatud ${esc(created)}` : ''}${paid ? `<br>Makstud ${esc(paid)}` : ''}</p>
    </header>
    <ul class="ty-lines" role="list" aria-label="Tellitud tooted">${(o.items || []).map(lineHTML).join('')}</ul>
    <dl class="ty-sums">${rows}</dl>`;
}

function shipHTML(o, kind) {
  const s = o.shipping || {};
  const c = carrierOf(o);
  const label = s.carrierName || c?.label || 'Pakiautomaat';
  const addr = [s.lockerAddress, s.lockerCity].filter(Boolean).join(', ');
  let status = '';
  if (o.fulfillmentStatus === 'cancelled') status = o.fulfillmentStatusLabel || 'Tühistatud';
  else if (kind === 'paid') status = o.fulfillmentStatusLabel || '';
  else if (kind === 'processing') status = 'Ootab makse kinnitust';
  const rows = [
    status ? `<div><dt>Olek</dt><dd>${esc(status)}</dd></div>` : '',
    o.trackingCode ? `<div><dt>Jälgimiskood</dt><dd><code>${esc(o.trackingCode)}</code></dd></div>` : '',
    o.customer?.emailMasked ? `<div><dt>E-post</dt><dd>${esc(o.customer.emailMasked)}</dd></div>` : '',
  ].join('');
  return `
    <h2 class="ty-side__title">Tarne pakiautomaati</h2>
    <div class="ty-ship__locker">
      ${markHTML(s.carrier)}
      <div class="ty-ship__text">
        <p class="ty-ship__carrier">${esc(label)}</p>
        <p class="ty-ship__name">${esc(s.lockerName || 'Pakiautomaat')}</p>
        ${addr ? `<p class="ty-ship__addr">${esc(addr)}</p>` : ''}
      </div>
    </div>
    ${rows ? `<dl class="ty-ship__meta">${rows}</dl>` : ''}`;
}

/* =========================================================================
   Olekud
   ========================================================================= */
function kindOf(o) {
  switch (o?.paymentStatus) {
    case 'paid':
    case 'partially_refunded':
      return 'paid';
    case 'processing':
      return 'processing';
    case 'pending':
      return sessionId ? 'confirming' : 'unpaid';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'refunded':
      return 'refunded';
    default:
      return 'unknown';
  }
}

const ICON_FOR = {
  loading: 'wait',
  confirming: 'wait',
  processing: 'wait',
  paid: 'paid',
  unpaid: 'card',
  failed: 'fail',
  expired: 'expired',
  refunded: 'info',
  unknown: 'info',
  error: 'info',
};

function iconHTML(kind) {
  switch (ICON_FOR[kind]) {
    case 'paid':
      return `<span class="ty-icon__ring"></span><span class="ty-icon__ring"></span><span class="ty-icon__ring"></span><span class="ty-icon__rays"></span><span class="ty-icon__core">${SVG.check}</span>`;
    case 'wait':
      return '<span class="ty-icon__spin"></span><span class="ty-icon__core"></span>';
    case 'fail':
      return `<span class="ty-icon__core">${SVG.fail}</span>`;
    case 'expired':
      return `<span class="ty-icon__core">${SVG.clock}</span>`;
    case 'card':
      return `<span class="ty-icon__core">${SVG.card}</span>`;
    default:
      return `<span class="ty-icon__core">${kind === 'refunded' ? SVG.refund : SVG.info}</span>`;
  }
}

const btn = (href, label, { primary = false, attrs = '', icon = '', iconStart = '' } = {}) =>
  `<a class="btn btn--lg ${primary ? 'btn--primary' : 'btn--ghost'}" href="${esc(href)}" ${attrs}>${iconStart}${label}${icon}</a>`;

/** Hero tekstid ja nupud iga oleku jaoks. Isikuandmetest ainult eesnimi ja maskeeritud e-post. */
function heroFor(kind, o, extra = {}) {
  const no = o?.number ? `<span class="nowrap">${esc(o.number)}</span>` : '';
  const first = o?.customer?.firstName ? esc(o.customer.firstName) : '';
  const mail = o?.customer?.emailMasked ? `<strong class="nowrap">${esc(o.customer.emailMasked)}</strong>` : 'sinu e-postile';
  const hasCart = Cart.count() > 0;
  const resume = o?.resumeUrl ? safeResumeUrl(o.resumeUrl) : null;
  const resumeUntil = toDate(o?.resumeExpiresAt);
  const retry = btn('/ostukorv', 'Tagasi kassasse', { primary: true, attrs: 'data-retry', icon: SVG.arrow });
  switch (kind) {
    case 'loading':
      return { eyebrow: 'Tellimus', title: 'Kontrollime tellimust…', lead: 'Hetk, vaatame tellimuse oleku üle.', doc: 'Tellimus' };
    case 'paid': {
      const refunded = o.paymentStatus === 'partially_refunded';
      let lead = `${first ? `${first}, hea valik!` : 'Hea valik!'} Tellimuse kinnitus läheb aadressile ${mail} ja pakk läheb teele <span class="nowrap">1–3 tööpäeva</span> jooksul.`;
      if (o.fulfillmentStatus === 'shipped') lead = `${first ? `${first}, sinu` : 'Sinu'} pakk on juba teel! Kui see on automaadis, saad SMS-i koodiga.`;
      if (o.fulfillmentStatus === 'delivered') lead = `${first ? `${first}, sinu` : 'Sinu'} pakk on kohale toimetatud. Head mänguõhtut!`;
      if (o.fulfillmentStatus === 'cancelled') lead = 'See tellimus on tühistatud. Kui sul on küsimusi, kirjuta meile.';
      if (refunded) lead += ` Osa summast (${formatEur(cents(o.totals?.refundedCents))}) on sulle tagastatud.`;
      return {
        eyebrow: 'Makse õnnestus',
        title: `<span class="neon">Aitäh!</span><span class="ty-title__sub">Tellimus ${no} on makstud ${PARTY}</span>`,
        lead,
        doc: `Aitäh! Tellimus ${o.number} on makstud`,
      };
    }
    case 'processing':
      return {
        eyebrow: 'Tellimus on vastu võetud',
        title: `Makse on <span class="neon">töötlemisel</span>`,
        lead: `${first ? `${first}, aitäh!` : 'Aitäh!'} Tellimus ${no} on vastu võetud ja sinu pank kinnitab makset. Tavaliselt võtab see mõne minuti, mõne makseviisi puhul kuni paar tööpäeva. Kui makse on kinnitatud, saadame tellimuse kinnituse aadressile ${mail}.`,
        doc: `Makse on töötlemisel – ${o.number}`,
      };
    case 'confirming': {
      const slow = extra.slow;
      return {
        eyebrow: 'Hetk…',
        title: `Kinnitame <span class="neon">makset</span>…`,
        lead: slow
          ? `Makse kinnitamine võtab tavapärasest kauem. Kui maksid, ei pea sa midagi tegema — leht uueneb ise ja kinnitus tuleb ka e-postile.${resume ? ' Kui makse jäi pooleli, saad selle lõpule viia.' : ''}`
          : 'Makse andmed jõuavad meieni tavaliselt mõne sekundi jooksul. Ära sulge seda lehte — see uueneb ise.',
        actions: slow && resume ? [btn(resume, 'Jätka makset', { primary: true, attrs: 'data-resume', iconStart: SVG.lock })] : [],
        doc: 'Kinnitame makset…',
      };
    }
    case 'unpaid': {
      const until = resume && resumeUntil ? ` Makseleht on avatud kuni kella <strong>${esc(TIME_FMT.format(resumeUntil))}</strong>.` : '';
      return {
        eyebrow: 'Ootab makset',
        title: `Tellimus ootab <span class="neon">makset</span>`,
        lead: resume
          ? `Tellimus ${no} on loodud, aga makse on veel tegemata.${until} Kui soovid tellimust muuta, muuda ostukorvi ja maksa uuesti.`
          : `Tellimus ${no} on loodud, aga makset pole tehtud ja makseleht on suletud. Tellimuse saad uuesti vormistada kassas — ${hasCart ? 'sinu ostukorv on alles' : 'paneme tooted ostukorvi tagasi'}.`,
        actions: resume
          ? [btn(resume, 'Jätka makset', { primary: true, attrs: 'data-resume', iconStart: SVG.lock }), btn('/ostukorv', 'Ostukorvi', { attrs: 'data-retry' })]
          : [retry],
        doc: `Tellimus ${o.number} ootab makset`,
      };
    }
    case 'failed':
      return {
        eyebrow: 'Midagi läks valesti',
        title: `Makse <span class="neon">ebaõnnestus</span>`,
        lead: `Tellimuse ${no} makset ei õnnestunud lõpule viia. ${hasCart ? 'Sinu ostukorv on alles' : 'Paneme tooted ostukorvi tagasi'} — proovi uuesti, näiteks mõne teise kaardi või makseviisiga.`,
        actions: [retry],
        doc: 'Makse ebaõnnestus',
      };
    case 'expired':
      return {
        eyebrow: 'Makseleht aegus',
        title: `Makseaeg sai <span class="neon">läbi</span>`,
        lead: `Tellimuse ${no} makseleht oli avatud 60 minutit ja aegus enne makset, seega raha ei võetud. ${hasCart ? 'Sinu ostukorv on alles' : 'Paneme tooted ostukorvi tagasi'} — vormista tellimus uuesti.`,
        actions: [retry],
        doc: 'Makseaeg sai läbi',
      };
    case 'refunded':
      return {
        eyebrow: 'Tagasimakse',
        title: `Raha on <span class="neon">tagastatud</span>`,
        lead: `Tellimuse ${no} eest tasutud ${formatEur(cents(o.totals?.refundedCents) || cents(o.totals?.totalCents))} on tagastatud. Pank kannab raha kontole tavaliselt 5–10 tööpäeva jooksul.`,
        doc: `Tellimus ${o.number}: raha on tagastatud`,
      };
    case 'error':
      return {
        eyebrow: 'Ühendus katkes',
        title: `Olekut ei õnnestunud <span class="neon">kontrollida</span>`,
        lead: `${extra.message ? `${esc(extra.message)} ` : ''}Proovime mõne hetke pärast automaatselt uuesti. Kui maksid, ei kao sinu tellimus kuhugi — kinnitus tuleb ka e-postile.`,
        actions: [`<button class="btn btn--primary btn--lg" type="button" data-reload>${SVG.retry}Proovi uuesti</button>`],
        doc: 'Tellimuse olekut ei õnnestunud kontrollida',
      };
    default:
      return {
        eyebrow: 'Tellimus',
        title: `Tellimust <span class="neon">ei leitud</span>`,
        lead: `Selle lingiga me tellimust ei leidnud. Kontrolli, et link oleks täielik — kõige kindlam on avada see uuesti tellimuse kinnituskirjast.${hasCart ? ' Sinu ostukorv on alles.' : ''}`,
        actions: hasCart
          ? [btn('/ostukorv', 'Tagasi ostukorvi', { primary: true, icon: SVG.arrow }), btn('/', 'Avalehele')]
          : [btn('/', 'Avalehele', { primary: true, icon: SVG.arrow }), btn('/#mangud', 'Vaata mänge')],
        doc: 'Tellimust ei leitud',
      };
  }
}

let current = { kind: '', html: '' };

function render(kind, o, extra = {}) {
  const v = heroFor(kind, o, extra);
  const first = current.kind === '';
  el.main.dataset.state = kind;
  document.title = `${v.doc} | ÄGE`;
  if (el.icon.dataset.kind !== ICON_FOR[kind]) {
    el.icon.className = `ty-icon ty-icon--${ICON_FOR[kind]}`;
    el.icon.dataset.kind = ICON_FOR[kind];
    el.icon.innerHTML = iconHTML(kind);
  }
  const html = `${v.eyebrow}|${v.title}|${v.lead}|${(v.actions || []).join('')}`;
  if (html !== current.html) {
    el.eyebrow.textContent = v.eyebrow;
    el.title.innerHTML = v.title;
    el.lead.innerHTML = v.lead;
    el.actions.innerHTML = (v.actions || []).join('');
    el.actions.hidden = !(v.actions || []).length;
    if (!first && kind !== current.kind) el.live.textContent = `${el.title.textContent.trim()}. ${el.lead.textContent.trim()}`;
  }
  current = { kind, html };

  const hasOrder = Boolean(o && o.number);
  el.detail.hidden = !hasOrder;
  if (hasOrder) {
    el.receipt.innerHTML = receiptHTML(o);
    el.ship.innerHTML = shipHTML(o, kind);
    el.helpNo.textContent = ` (lisa kirjale tellimuse number ${o.number})`;
    const wdLink = el.withdraw.querySelector('a[href^="/taganemine"]');
    if (wdLink) wdLink.href = `/taganemine?tellimus=${encodeURIComponent(o.number)}`;
  } else {
    el.helpNo.textContent = '';
  }
  const ok = kind === 'paid' || kind === 'processing';
  el.next.hidden = !ok || o?.fulfillmentStatus === 'cancelled';
  el.withdraw.hidden = !ok; // taganemisinfo on asjakohane ainult makstud / töötlemisel tellimusel
  el.share.hidden = kind !== 'paid';
  el.cta.hidden = !(ok || kind === 'refunded');
  if (ok && o) {
    const c = carrierOf(o);
    const mail = o.customer?.emailMasked ? `<strong class="nowrap">${esc(o.customer.emailMasked)}</strong>` : 'sinu e-postile';
    el.step1When.textContent = kind === 'paid' ? 'Kohe' : 'Kui pank makse kinnitab';
    el.step1Text.innerHTML =
      kind === 'paid'
        ? `Tellimuse kinnitus läheb aadressile ${mail}. Kui kirja ei paista, vaata ka rämpsposti kausta.`
        : `Kui makse on kinnitatud, saadame tellimuse kinnituse aadressile ${mail}. Kui kirja ei paista, vaata ka rämpsposti kausta.`;
    el.step3Text.textContent = `Kui pakk on automaadis, saadab ${c?.name || 'vedaja'} sulle SMS-i koodiga, millega automaadi ukse avad. Siis jääb üle vaid sõbrad kokku kutsuda.`;
  }
}

/* =========================================================================
   Korv: tühjendame ainult makstud / töötlemisel tellimuse järel, taastame ebaõnnestumisel
   ========================================================================= */
function clearCartFor(o) {
  if (!isOwnFreshOrder || doneFlags(token).cleared) return;
  Cart.clear();
  Cart.removeCode();
  setDone(token, { cleared: true });
}

function restoreCart(o) {
  if (Cart.count() || !Array.isArray(o?.items)) return;
  for (const i of o.items) if (product(i.id)) Cart.add(i.id, Math.max(1, Math.floor(Number(i.qty)) || 1));
  if (o.totals?.discountCode) Cart.applyCode(o.totals.discountCode);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-retry]')) restoreCart(order);
  if (e.target.closest('[data-reload]')) {
    e.preventDefault();
    load();
  }
});

/* =========================================================================
   Päring ja korduv kontroll
   ========================================================================= */
const startedAt = Date.now();
let order = null;
let timer = 0;
let failures = 0;
let inflight = false;
let deferred = false;

function pollNote(text) {
  el.poll.hidden = !text;
  el.poll.textContent = text || '';
}

function schedule(kind) {
  clearTimeout(timer);
  const elapsed = Date.now() - startedAt;
  const polling = ['confirming', 'processing', 'unpaid', 'error'].includes(kind);
  if (!polling) return pollNote('');
  if (elapsed > GIVE_UP_MS) return pollNote('Leht ei uuene enam ise — värskenda lehte, et olekut uuesti kontrollida.');
  let wait = elapsed < FAST_FOR_MS ? FAST_MS : SLOW_MS;
  if (kind === 'unpaid') wait = SLOW_MS;
  if (failures) wait = Math.min(SLOW_MS, FAST_MS * 2 ** Math.min(failures - 1, 3));
  if (kind !== 'unpaid') pollNote(`Leht uueneb ise · viimati kontrollitud kell ${CLOCK_FMT.format(new Date())}`);
  timer = setTimeout(load, wait);
}

function apply(o) {
  const prev = current.kind;
  order = o;
  const kind = kindOf(o);
  if (kind === 'paid' || kind === 'processing') clearCartFor(o);
  render(kind, o, { slow: Date.now() - startedAt > FAST_FOR_MS });
  if (kind === 'paid' && prev !== 'paid') {
    // Pidu: alati, kui olek muutus siin lehel makstuks; muidu üks kord tellimuse kohta.
    const live = prev && prev !== 'loading';
    if (live || !doneFlags(token).party) {
      setDone(token, { party: true });
      if (document.readyState === 'complete') celebrate();
      else window.addEventListener('load', celebrate, { once: true });
    }
  }
  schedule(kind);
}

async function load() {
  clearTimeout(timer);
  if (inflight) return;
  if (document.hidden && current.kind && current.kind !== 'loading') {
    deferred = true; // kontrollime uuesti, kui vaheleht on jälle nähtav
    return;
  }
  inflight = true;
  const q = new URLSearchParams({ t: token });
  if (sessionId) q.set('session_id', sessionId);
  let res = null;
  let data = null;
  try {
    res = await fetch(`/api/tellimus?${q}`, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
    data = await res.json().catch(() => null);
  } catch {
    res = null;
  }
  inflight = false;
  if (res?.ok && data && data.number) {
    failures = 0;
    apply(data);
    return;
  }
  if (res && (res.status === 400 || res.status === 404)) {
    order = null;
    render('unknown', null);
    schedule('unknown');
    return;
  }
  failures += 1;
  if (order) {
    // Viimane teadaolev olek jääb nähtavale; proovime vaikselt uuesti.
    schedule(current.kind);
    pollNote('Ühendus katkes — proovime uuesti…');
  } else {
    render('error', null, { message: typeof data?.error === 'string' ? data.error : '' });
    schedule('error');
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && deferred) {
    deferred = false;
    load();
  }
});

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
  const b = $('[data-ty-icon]');
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

// „Veel konfetit!“ — ikoon tekib pealkirja alles makstud olekus, seega delegeeritud kuulaja.
document.addEventListener('click', (e) => {
  const party = e.target.closest('[data-party]');
  if (!party || !canvas || !ctx || REDUCED.matches) return;
  if (!W) resize();
  const c = centerOf(party);
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


/* =========================================================================
   Käivitus
   ========================================================================= */
if (token) {
  render('loading', null);
  load();
} else {
  render('unknown', null);
}
