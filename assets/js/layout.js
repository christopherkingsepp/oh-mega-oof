// Ühine päis, mobiilimenüü, jalus, ostukorvi sahtel, teavitused ja
// kerimisel ilmumise animatsioon. Iga leht laeb selle main.js kaudu.
import { PRODUCTS, formatEur, SHIPPING, toCents } from './catalog.js';
import { Cart } from './cart.js';
import { SITE } from './site.js';

/* ---------- Ikoonid (inline SVG) ---------- */
export const ICONS = {
  cart: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h15l-1.5 9h-12z"/><path d="M6 7 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  menu: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  arrow: '<svg class="icon arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  instagram: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  tiktok: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 3c.4 2.2 1.8 3.7 4 3.9v3.2c-1.5.1-2.9-.4-4-1.1v6.3c0 3.4-2.6 5.7-5.8 5.7-3.1 0-5.6-2.4-5.6-5.5 0-3.4 3-6 6.6-5.4v3.3c-1.6-.4-3.2.6-3.2 2.1 0 1.2 1 2.2 2.3 2.2 1.4 0 2.4-1 2.4-2.6V3z"/></svg>',
  mail: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  box: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>',
};

const NAV = [
  { href: '/mida-viiu', label: 'MIDA V!!!U', isNew: true },
  { href: '/#mangud', label: 'Kõik mängud' },
  { href: '/#kuidas', label: 'Kuidas mängida' },
  { href: '/kkk', label: 'KKK' },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function currentPath() {
  const p = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  return p === '' ? '/' : p;
}

/* ---------- Päis ---------- */
function renderHeader() {
  const host = document.querySelector('[data-site-header]');
  if (!host) return;
  const path = currentPath();
  const links = NAV.map(
    (n) =>
      `<a href="${n.href}" class="${n.isNew ? 'is-new' : ''}" ${path === n.href ? 'aria-current="page"' : ''}>${esc(n.label)}</a>`,
  ).join('');
  host.outerHTML = `
  <a class="skip-link" href="#main">Liigu sisu juurde</a>
  <header class="site-header" id="site-header">
    <div class="container site-header__inner">
      <a class="site-logo" href="/" aria-label="ÄGE avaleht">
        <img src="/assets/img/brand/age-logo-white.webp" alt="ÄGE" width="56" height="40">
      </a>
      <nav class="site-nav" aria-label="Peamenüü">${links}</nav>
      <div class="header-actions">
        <button class="icon-btn cart-btn" type="button" data-open-cart aria-label="Ava ostukorv">
          ${ICONS.cart}<span class="cart-count" data-cart-count aria-hidden="true">0</span>
        </button>
        <button class="icon-btn menu-btn" type="button" data-menu-toggle aria-label="Ava menüü" aria-expanded="false" aria-controls="mobile-nav">${ICONS.menu}</button>
      </div>
    </div>
  </header>
  <nav class="mobile-nav" id="mobile-nav" aria-label="Mobiilimenüü">
    ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
    <a href="/ostukorv">Ostukorv</a>
  </nav>`;

  const header = document.getElementById('site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const toggle = document.querySelector('[data-menu-toggle]');
  const mobile = document.getElementById('mobile-nav');
  const setMenu = (open) => {
    mobile.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Sulge menüü' : 'Ava menüü');
    toggle.innerHTML = open ? ICONS.close : ICONS.menu;
    document.body.classList.toggle('is-locked', open);
  };
  toggle.addEventListener('click', () => setMenu(!mobile.classList.contains('is-open')));
  mobile.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobile.classList.contains('is-open')) setMenu(false);
  });
}

/* ---------- Jalus ---------- */
function renderFooter() {
  const host = document.querySelector('[data-site-footer]');
  if (!host) return;
  const year = new Date().getFullYear();
  host.outerHTML = `
  <footer class="site-footer grain">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <img src="/assets/img/brand/age-logo-white.webp" alt="ÄGE" width="90" height="64" loading="lazy">
          <p>Eesti seltskonnamängud, mis panevad inimesed rääkima, naerma ja teineteist uuest küljest avastama.</p>
          <div class="socials">
            <a class="icon-btn" href="${SITE.instagram}" target="_blank" rel="noopener" aria-label="Instagram ${esc(SITE.instagramHandle)}">${ICONS.instagram}</a>
            <a class="icon-btn" href="${SITE.tiktok}" target="_blank" rel="noopener" aria-label="TikTok ${esc(SITE.tiktokHandle)}">${ICONS.tiktok}</a>
            <a class="icon-btn" href="mailto:${SITE.email}" aria-label="Saada e-kiri">${ICONS.mail}</a>
          </div>
        </div>
        <div>
          <h4>Mängud</h4>
          <ul>
            <li><a href="/mida-viiu">MIDA V!!!U</a></li>
            <li><a href="/oled-semu">Oled Semu?</a></li>
            <li><a href="/vigur">Vigur</a></li>
            <li><a href="/#komplekt">Komplektid</a></li>
          </ul>
        </div>
        <div>
          <h4>Abi</h4>
          <ul>
            <li><a href="/kkk">KKK</a></li>
            <li><a href="/kkk#tarne">Tarne</a></li>
            <li><a href="/tingimused">Müügitingimused</a></li>
            <li><a href="/privaatsus">Privaatsuspoliitika</a></li>
          </ul>
        </div>
        <div>
          <h4>Kontakt</h4>
          <ul>
            <li><a href="mailto:${SITE.email}">${esc(SITE.email)}</a></li>
            <li><a href="${SITE.instagram}" target="_blank" rel="noopener">Instagram ${esc(SITE.instagramHandle)}</a></li>
            <li><a href="${SITE.tiktok}" target="_blank" rel="noopener">TikTok ${esc(SITE.tiktokHandle)}</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-giant" aria-hidden="true">ÄGE</div>
      <div class="footer-bottom">
        <span>© ${year} ${esc(SITE.legalName)}${SITE.regCode ? ` · reg. ${esc(SITE.regCode)}` : ''}</span>
        <span>MIDA V!!!U on mõeldud ainult täisealistele. Joo vastutustundlikult.</span>
      </div>
    </div>
  </footer>`;
}

/* ---------- Ostukorvi sahtel ---------- */
let drawer, backdrop, lastFocus;

function renderDrawer() {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="drawer-backdrop" data-cart-backdrop></div>
     <aside class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" aria-hidden="true" tabindex="-1">
       <div class="cart-drawer__head">
         <h2 id="cart-drawer-title">Sinu ostukorv</h2>
         <button class="icon-btn" type="button" data-close-cart aria-label="Sulge ostukorv">${ICONS.close}</button>
       </div>
       <div class="cart-drawer__body" data-cart-body></div>
       <div class="cart-drawer__foot" data-cart-foot></div>
     </aside>
     <div class="toast-region" aria-live="polite" aria-atomic="false"></div>`,
  );
  drawer = document.querySelector('.cart-drawer');
  backdrop = document.querySelector('[data-cart-backdrop]');
  backdrop.addEventListener('click', closeCart);
  drawer.querySelector('[data-close-cart]').addEventListener('click', closeCart);
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCart();
    if (e.key === 'Tab') trapFocus(e, drawer);
  });
  drawer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qty]');
    if (btn) {
      const { id, delta } = btn.dataset;
      const item = Cart.items().find((i) => i.id === id);
      if (item) Cart.set(id, item.qty + Number(delta));
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) Cart.remove(rm.dataset.remove);
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart]')) {
      e.preventDefault();
      openCart();
    }
  });
}

export function openCart() {
  if (location.pathname.replace(/\.html$/, '') === '/ostukorv') return;
  lastFocus = document.activeElement;
  renderDrawerContents();
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('is-open');
  document.body.classList.add('is-locked');
  setTimeout(() => drawer.querySelector('[data-close-cart]').focus(), 50);
}

export function closeCart() {
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

export function trapFocus(e, root) {
  const f = [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => el.offsetParent !== null,
  );
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function freeShippingHTML(t) {
  if (!t.lines.length) return '';
  const goal = toCents(SHIPPING.freeFrom);
  const pct = Math.min(100, Math.round(((goal - t.freeShippingRemainingCents) / goal) * 100));
  const msg =
    t.freeShippingRemainingCents > 0
      ? `Lisa veel <strong>${formatEur(t.freeShippingRemainingCents)}</strong> ja tarne on <strong>tasuta</strong>!`
      : `<strong>Tarne on tasuta!</strong>`;
  return `<div class="free-ship"><span>${msg}</span><div class="free-ship__bar"><span style="--p:${pct}%"></span></div></div>`;
}

function renderDrawerContents() {
  if (!drawer) return;
  const body = drawer.querySelector('[data-cart-body]');
  const foot = drawer.querySelector('[data-cart-foot]');
  const t = Cart.totals();
  if (!t.lines.length) {
    body.innerHTML = `<div class="empty-state"><div class="big" aria-hidden="true">🃏</div><p>Ostukorv on veel tühi.<br>Pidu ootab!</p><a class="btn btn--primary" href="/mida-viiu">Vaata MIDA V!!!U ${ICONS.arrow}</a></div>`;
    foot.innerHTML = '';
    return;
  }
  body.innerHTML = t.lines
    .map(
      ({ product: p, qty, totalCents }) => `
      <div class="cart-line">
        <img src="${p.image}" alt="" width="76" height="56" loading="lazy">
        <div>
          <div class="cart-line__name">${esc(p.name)}</div>
          <div class="cart-line__price">${formatEur(totalCents)}</div>
          <button class="cart-line__remove" type="button" data-remove="${p.id}">Eemalda</button>
        </div>
        <div class="qty" role="group" aria-label="Kogus: ${esc(p.name)}">
          <button type="button" data-qty data-id="${p.id}" data-delta="-1" aria-label="Vähenda">−</button>
          <output aria-live="polite">${qty}</output>
          <button type="button" data-qty data-id="${p.id}" data-delta="1" aria-label="Suurenda">+</button>
        </div>
      </div>`,
    )
    .join('');
  foot.innerHTML = `
    ${freeShippingHTML(t)}
    <div class="sum-row"><span>Vahesumma</span><span>${formatEur(t.subtotalCents)}</span></div>
    ${t.discountCents ? `<div class="sum-row sum-row--discount"><span>Soodustus ${esc(t.code)} (−${t.percent}%)</span><span>−${formatEur(t.discountCents)}</span></div>` : ''}
    <div class="sum-row"><span>Tarne pakiautomaati</span><span>${t.shippingCents ? formatEur(t.shippingCents) : 'Tasuta'}</span></div>
    <div class="sum-row sum-row--total"><span>Kokku</span><span>${formatEur(t.totalCents)}</span></div>
    <a class="btn btn--primary btn--lg btn--block" href="/ostukorv">Vormista tellimus ${ICONS.arrow}</a>`;
}

function updateCount(bump) {
  const n = Cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = String(n);
    el.classList.toggle('has-items', n > 0);
    if (bump) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  });
  document.querySelectorAll('[data-open-cart]').forEach((b) => b.setAttribute('aria-label', n ? `Ava ostukorv (${n} toodet)` : 'Ava ostukorv'));
}

/* ---------- Teavitused ---------- */
export function toast(html, { image, link, duration = 3800 } = {}) {
  const region = document.querySelector('.toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${image ? `<img src="${image}" alt="">` : ''}<span>${html}</span>${link ? `<a href="${link.href}" ${link.cart ? 'data-open-cart' : ''}>${esc(link.label)}</a>` : ''}`;
  region.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
}

/* ---------- "Lisa ostukorvi" nupud üle kogu saidi ---------- */
// Kasutus: <button data-add-to-cart="mida-viiu" data-qty-source="#qty">Lisa ostukorvi</button>
function bindAddToCart() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.addToCart;
    const p = PRODUCTS[id];
    if (!p) return;
    let qty = 1;
    if (btn.dataset.qtySource) {
      const src = document.querySelector(btn.dataset.qtySource);
      qty = Math.max(1, parseInt(src?.value ?? src?.textContent ?? '1', 10) || 1);
    }
    Cart.add(id, qty);
    btn.classList.add('is-added');
    setTimeout(() => btn.classList.remove('is-added'), 1200);
    toast(`<strong>${esc(p.name)}</strong> lisatud ostukorvi`, { image: p.image, link: { href: '/ostukorv', label: 'Vaata', cart: true } });
    window.dispatchEvent(new CustomEvent('cart:added', { detail: { id, qty, button: btn } }));
  });
}

/* ---------- Kerimisel ilmumine ---------- */
export function initReveal(root = document) {
  const els = root.querySelectorAll('[data-reveal]:not(.is-visible)');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-visible');
          io.unobserve(en.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((el) => io.observe(el));
}

/* ---------- Käivitus ---------- */
renderHeader();
renderFooter();
renderDrawer();
bindAddToCart();
updateCount(false);
initReveal();
window.addEventListener('cart:change', (e) => {
  updateCount(e.detail?.action === 'add');
  if (drawer?.classList.contains('is-open')) renderDrawerContents();
});

export { esc };
