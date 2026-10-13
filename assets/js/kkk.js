// Sisulehtede skript (KKK, müügitingimused, privaatsuspoliitika, 404).
// - täidab ettevõtte andmed (site.js) ja hinnad (catalog.js), et need oleksid alati ühesugused
// - KKK: sujuvalt avanevad küsimused, reaalajas otsing (täpitähtede-tundetu) ja esiletõstmine
// - kerimisel aktiivse teema/peatüki märkimine (KKK teemad, tingimuste sisukord)
import { SITE } from './site.js';
import { PRODUCTS, SHIPPING, toCents } from './catalog.js';
import { esc } from './layout.js';

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileQuery = window.matchMedia('(max-width: 900px)');

/* ---------- Ettevõtte andmed ja hinnad ---------- */
function eur(value) {
  const opts = { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(value) ? 0 : 2 };
  return new Intl.NumberFormat('et-EE', opts).format(value);
}

function fillSite() {
  document.querySelectorAll('[data-site-text]').forEach((el) => {
    const v = SITE[el.dataset.siteText];
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-site-href]').forEach((el) => {
    const key = el.dataset.siteHref;
    const v = SITE[key];
    if (v) el.href = key === 'email' ? `mailto:${v}` : v;
  });
  // Read, mille väärtus puudub (nt registrikood), peidetakse.
  document.querySelectorAll('[data-site-row]').forEach((el) => {
    if (!SITE[el.dataset.siteRow]) el.hidden = true;
  });
}

function fillPrices() {
  document.querySelectorAll('[data-price]').forEach((el) => {
    const p = PRODUCTS[el.dataset.price];
    if (p) el.textContent = eur(p.price);
  });
  document.querySelectorAll('[data-ship-price]').forEach((el) => (el.textContent = eur(SHIPPING.price)));
  document.querySelectorAll('[data-ship-free]').forEach((el) => (el.textContent = eur(SHIPPING.freeFrom)));
  document.querySelectorAll('[data-bundle-save]').forEach((el) => {
    const b = PRODUCTS[el.dataset.bundleSave];
    if (!b?.includes) return;
    const sum = b.includes.reduce((s, id) => s + toCents(PRODUCTS[id]?.price || 0), 0);
    el.textContent = eur((sum - toCents(b.price)) / 100);
  });
}

/* ---------- Akordion (sujuv avanemine) ---------- */
function toggleItem(d, open, { animate = true } = {}) {
  const body = d.querySelector('.faq-item__body');
  if (!body) {
    d.open = open;
    return;
  }
  body.getAnimations().forEach((a) => a.cancel());
  d.classList.remove('is-closing');
  if (!animate || reduce()) {
    d.open = open;
    return;
  }
  if (open) {
    d.open = true;
    const h = body.scrollHeight;
    body.animate(
      [
        { height: '0px', opacity: 0 },
        { height: `${h}px`, opacity: 1 },
      ],
      { duration: 440, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    );
  } else {
    const h = body.offsetHeight;
    d.classList.add('is-closing');
    const a = body.animate(
      [
        { height: `${h}px`, opacity: 1 },
        { height: '0px', opacity: 0 },
      ],
      { duration: 280, easing: 'cubic-bezier(.4, 0, .2, 1)' },
    );
    a.onfinish = () => {
      d.open = false;
      d.classList.remove('is-closing');
    };
  }
}

function initAccordions() {
  document.querySelectorAll('details.faq-item').forEach((d) => {
    const summary = d.querySelector(':scope > summary');
    summary?.addEventListener('click', (e) => {
      if (reduce()) return; // brauseri vaikimisi käitumine
      e.preventDefault();
      toggleItem(d, !(d.open && !d.classList.contains('is-closing')));
    });
  });
}

/* ---------- KKK otsing ---------- */
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function clearMarks(root) {
  root.querySelectorAll('mark[data-hl]').forEach((m) => {
    const parent = m.parentNode;
    m.replaceWith(document.createTextNode(m.textContent));
    parent.normalize();
  });
}

/** Tõstab esile otsingusõnad (täpitähtede-tundetult) elemendi tekstisõlmedes. */
function highlight(root, tokens) {
  const words = tokens.filter((t) => t.length >= 2);
  if (!words.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('mark, button, .faq-item__icon') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const text = node.nodeValue;
    let flat = '';
    const map = [];
    for (let i = 0; i < text.length; i++) {
      const c = norm(text[i]);
      for (let k = 0; k < c.length; k++) {
        flat += c[k];
        map.push(i);
      }
    }
    const ranges = [];
    words.forEach((w) => {
      let idx = flat.indexOf(w);
      while (idx !== -1) {
        ranges.push([map[idx], map[idx + w.length - 1] + 1]);
        idx = flat.indexOf(w, idx + w.length);
      }
    });
    if (!ranges.length) return;
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    });
    const frag = document.createDocumentFragment();
    let pos = 0;
    merged.forEach(([a, b]) => {
      if (a > pos) frag.append(text.slice(pos, a));
      const m = document.createElement('mark');
      m.dataset.hl = '';
      m.textContent = text.slice(a, b);
      frag.append(m);
      pos = b;
    });
    if (pos < text.length) frag.append(text.slice(pos));
    node.replaceWith(frag);
  });
}

function initSearch() {
  const input = document.querySelector('[data-faq-search]');
  if (!input) return;
  const form = input.closest('form');
  const status = document.getElementById('faq-status');
  const statusCopy = document.querySelector('[data-faq-status-copy]');
  const empty = document.querySelector('[data-faq-empty]');
  const results = document.getElementById('faq-results');
  const sections = [...document.querySelectorAll('.faq-section')];
  // Otsitav tekst = teema pealkiri + küsimus + vastus (nt „tarne“ leiab kogu tarne teema).
  const items = [...document.querySelectorAll('.faq-item')].map((d) => {
    const topic = d.closest('.faq-section')?.querySelector('h2')?.textContent || '';
    return { d, text: norm(`${topic} ${d.textContent}`.replace(/\s+/g, ' ')) };
  });
  const autoOpened = new Set();

  const updateCounts = () => {
    document.querySelectorAll('[data-count-for]').forEach((el) => {
      const sec = document.getElementById(el.dataset.countFor);
      const n = sec ? sec.querySelectorAll('.faq-item:not([hidden])').length : 0;
      el.textContent = String(n);
      el.closest('a')?.classList.toggle('is-empty', n === 0);
    });
  };

  const run = () => {
    const raw = input.value.trim();
    const q = norm(raw);
    form.classList.toggle('has-value', input.value.length > 0);
    items.forEach(({ d }) => clearMarks(d));
    autoOpened.forEach((d) => toggleItem(d, false, { animate: false }));
    autoOpened.clear();

    if (!q) {
      items.forEach(({ d }) => (d.hidden = false));
      sections.forEach((s) => (s.hidden = false));
      empty.hidden = true;
      status.textContent = '';
      if (statusCopy) statusCopy.textContent = '';
      updateCounts();
      return;
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    let n = 0;
    items.forEach((it) => {
      const ok = tokens.every((t) => it.text.includes(t));
      it.d.hidden = !ok;
      if (ok) n++;
    });
    sections.forEach((s) => (s.hidden = !s.querySelector('.faq-item:not([hidden])')));
    empty.hidden = n > 0;
    const msg = n
      ? `Leidsime <strong>${n}</strong> ${n === 1 ? 'vastuse' : 'vastust'} päringule „${esc(raw)}“`
      : `Päringule „${esc(raw)}“ ei leidnud me ühtegi vastust.`;
    status.innerHTML = `${msg} <a href="#faq-results" data-faq-jump>${n ? 'Vaata' : 'Küsi meilt'} <span aria-hidden="true">↓</span></a>`;
    if (statusCopy) statusCopy.innerHTML = msg;
    const shown = items.filter((it) => !it.d.hidden);
    shown.forEach((it) => highlight(it.d, tokens));
    // Vähese tulemuse korral ava vastused kohe.
    if (n <= 3) {
      shown.forEach((it) => {
        if (!it.d.open) {
          it.d.open = true;
          autoOpened.add(it.d);
        }
      });
    }
    updateCounts();
  };

  const scrollToResults = () => {
    const top = results.getBoundingClientRect().top + window.scrollY - (mobileQuery.matches ? 140 : 100);
    window.scrollTo({ top, behavior: reduce() ? 'auto' : 'smooth' });
  };

  input.addEventListener('input', run);
  status.addEventListener('click', (e) => {
    if (!e.target.closest('[data-faq-jump]')) return;
    e.preventDefault();
    if (mobileQuery.matches) input.blur();
    scrollToResults();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      input.value = '';
      run();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
    if (mobileQuery.matches) input.blur();
    scrollToResults();
  });
  form.querySelector('[data-faq-clear]')?.addEventListener('click', () => {
    input.value = '';
    run();
    input.focus();
  });
  document.querySelectorAll('[data-faq-suggest]').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.dataset.faqSuggest;
      run();
      scrollToResults();
    }),
  );
  // „/“ viib otsingusse
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable="true"]') || document.body.classList.contains('ov-locked')) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    input.value = q;
    run();
  } else updateCounts();
}

/* ---------- Aktiivne teema / peatükk kerimisel ---------- */
function initSpy() {
  if (!('IntersectionObserver' in window)) return;
  document.querySelectorAll('[data-spy]').forEach((nav) => {
    const links = [...nav.querySelectorAll('a[href^="#"]')];
    const map = new Map();
    links.forEach((a) => {
      const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
      if (target) map.set(target, a);
    });
    if (!map.size) return;
    const visible = new Set();
    let current = null;
    const setActive = (a) => {
      if (a === current) return;
      current = a;
      links.forEach((l) => (l === a ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
      // horisontaalses kiibireas hoia aktiivne nähtaval
      if (a && nav.scrollWidth > nav.clientWidth + 4) {
        const nr = nav.getBoundingClientRect();
        const ar = a.getBoundingClientRect();
        nav.scrollTo({ left: nav.scrollLeft + ar.left - nr.left - nr.width / 2 + ar.width / 2, behavior: reduce() ? 'auto' : 'smooth' });
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
        const first = [...map.keys()].find((s) => visible.has(s) && !s.hidden);
        if (first) setActive(map.get(first));
      },
      { rootMargin: '-22% 0px -58% 0px' },
    );
    map.forEach((_, s) => io.observe(s));
  });
}

/* ---------- Sisukord (tingimused, privaatsus) ---------- */
function initToc() {
  const toc = document.querySelector('[data-toc]');
  if (!toc) return;
  const sync = () => (toc.open = !mobileQuery.matches);
  sync();
  mobileQuery.addEventListener?.('change', sync);
  toc.addEventListener('click', (e) => {
    if (e.target.closest('a') && mobileQuery.matches) toc.open = false;
  });
}

/* ---------- Otselink küsimusele (#id) ---------- */
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (el?.matches('details.faq-item')) {
    toggleItem(el, true, { animate: false });
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'auto' }));
  }
}

fillSite();
fillPrices();
initAccordions();
initSearch();
initSpy();
initToc();
openFromHash();
window.addEventListener('hashchange', openFromHash);
