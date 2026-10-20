// Kataloogileht (/kataloog): mängud ja komplektid. HTML on staatiline (SEO, töötab ka ilma JS-ita);
// siin värskendatakse hinnad, komplektide sisu ja sääst alati catalog.js-ist, et leht ja kassa
// oleksid kooskõlas. „Lisa ostukorvi“ nupud ([data-add-to-cart]) töötavad layout.js kaudu.
import { PRODUCTS, SHIPPING, formatEur, toCents, productContents } from './catalog.js';

const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const wholeEur = new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurNice = (cents) => (cents % 100 === 0 ? wholeEur.format(cents / 100) : formatEur(cents));
const fullCents = (p) => (p?.includes || []).reduce((s, id) => s + toCents(PRODUCTS[id]?.price || 0), 0);

function fillPrices() {
  $$('[data-price]').forEach((el) => {
    const p = PRODUCTS[el.dataset.price];
    if (p) el.textContent = formatEur(toCents(p.price));
  });
  $$('[data-bundle-full]').forEach((el) => {
    const p = PRODUCTS[el.dataset.bundleFull];
    if (p?.includes) el.textContent = formatEur(fullCents(p));
  });
  $$('[data-bundle-save]').forEach((el) => {
    const p = PRODUCTS[el.dataset.bundleSave];
    if (p?.includes) el.textContent = formatEur(fullCents(p) - toCents(p.price));
  });
  $$('[data-contents]').forEach((el) => {
    el.textContent = productContents(el.dataset.contents)
      .map((c) => `${c.qty}× ${c.name}`)
      .join(', ');
  });
  $$('[data-short]').forEach((el) => {
    const p = PRODUCTS[el.dataset.short];
    if (p?.short) el.textContent = p.short;
  });
  $$('[data-ship-price]').forEach((el) => (el.textContent = formatEur(toCents(SHIPPING.price))));
  $$('[data-ship-free]').forEach((el) => (el.textContent = eurNice(toCents(SHIPPING.freeFrom))));
}

/** JSON-LD: suhtelised URL-id täisaadressideks (domeeni ei tea enne avaldamist). */
function absolutizeJsonLd() {
  if (!/^https?:/.test(location.origin)) return;
  $$('script[type="application/ld+json"]').forEach((s) => {
    s.textContent = s.textContent.replace(/"(\/(?!\/)[^"]*)"/g, (_, p) => `"${location.origin}${p}"`);
  });
}

/** Kui leht avatakse ankruga (nt /kataloog#komplekt-koik), tõsta see kaart esile. */
function highlightTarget() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el || !el.matches('.cat-card, .cat-bundle')) return;
  el.classList.add('is-target');
  setTimeout(() => el.classList.remove('is-target'), 2400);
}

fillPrices();
absolutizeJsonLd();
highlightTarget();
window.addEventListener('hashchange', highlightTarget);
