// Ostukorv brauseri localStorage'is. Iga muudatus saadab sündmuse `cart:change`.
import { PRODUCTS, MAX_QTY_PER_ITEM, computeTotals, normalizeCode } from './catalog.js';

const CART_KEY = 'age_cart_v1';
const CODE_KEY = 'age_discount_v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privaatne režiim vms — ostukorv töötab siis ainult selle lehe piires */
  }
}

const has = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PRODUCTS, id);

/** Puhastab localStorage'ist loetud korvi: ainult tuntud tooted, täisarvulised kogused 1..MAX, ilma duplikaatideta. */
function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const i of raw) {
    if (!i || typeof i !== 'object' || !has(i.id)) continue;
    const qty = Math.min(MAX_QTY_PER_ITEM, Math.floor(Number(i.qty)) || 0);
    if (qty < 1) continue;
    const dup = out.find((o) => o.id === i.id);
    if (dup) dup.qty = Math.min(MAX_QTY_PER_ITEM, dup.qty + qty);
    else out.push({ id: i.id, qty });
  }
  return out;
}

let memoryItems = sanitize(read(CART_KEY, []));
let memoryCode = normalizeCode(read(CODE_KEY, null));

function emit(detail = {}) {
  window.dispatchEvent(new CustomEvent('cart:change', { detail: { ...detail, cart: Cart.snapshot() } }));
}

function persist(detail) {
  write(CART_KEY, memoryItems);
  emit(detail);
}

export const Cart = {
  items() {
    return memoryItems.map((i) => ({ ...i }));
  },
  count() {
    return memoryItems.reduce((s, i) => s + i.qty, 0);
  },
  /** Lisab toote; tagastab tegelikult lisatud koguse (0, kui piir MAX_QTY_PER_ITEM on täis). */
  add(id, qty = 1) {
    if (!has(id)) return 0;
    const want = Math.max(1, Math.floor(Number(qty)) || 1);
    const existing = memoryItems.find((i) => i.id === id);
    const before = existing ? existing.qty : 0;
    const after = Math.min(MAX_QTY_PER_ITEM, before + want);
    if (after === before) return 0;
    if (existing) existing.qty = after;
    else memoryItems.push({ id, qty: after });
    persist({ action: 'add', id, qty: after - before });
    return after - before;
  },
  set(id, qty) {
    const q = Math.max(0, Math.min(MAX_QTY_PER_ITEM, Math.floor(Number(qty)) || 0));
    if (q === 0) return Cart.remove(id);
    const existing = memoryItems.find((i) => i.id === id);
    if (existing) existing.qty = q;
    else if (has(id)) memoryItems.push({ id, qty: q });
    persist({ action: 'set', id, qty: q });
  },
  remove(id) {
    memoryItems = memoryItems.filter((i) => i.id !== id);
    persist({ action: 'remove', id });
  },
  clear() {
    memoryItems = [];
    persist({ action: 'clear' });
  },
  code() {
    return memoryCode;
  },
  /** Tagastab true, kui kood on kehtiv ja rakendati. */
  applyCode(code) {
    const c = normalizeCode(code);
    if (!c) return false;
    memoryCode = c;
    write(CODE_KEY, c);
    emit({ action: 'code', code: c });
    return true;
  },
  removeCode() {
    memoryCode = null;
    write(CODE_KEY, null);
    emit({ action: 'code', code: null });
  },
  totals() {
    return computeTotals(memoryItems, memoryCode);
  },
  snapshot() {
    return { items: Cart.items(), count: Cart.count(), code: memoryCode, totals: Cart.totals() };
  },
};

// Sünkroniseeri teiste vahelehtedega.
window.addEventListener('storage', (e) => {
  if (e.key === CART_KEY) {
    memoryItems = sanitize(read(CART_KEY, []));
    emit({ action: 'sync' });
  }
  if (e.key === CODE_KEY) {
    memoryCode = normalizeCode(read(CODE_KEY, null));
    emit({ action: 'sync' });
  }
});

export default Cart;
