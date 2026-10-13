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

let memoryItems = read(CART_KEY, []).filter((i) => PRODUCTS[i.id]);
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
  add(id, qty = 1) {
    if (!PRODUCTS[id]) return;
    const existing = memoryItems.find((i) => i.id === id);
    if (existing) existing.qty = Math.min(MAX_QTY_PER_ITEM, existing.qty + qty);
    else memoryItems.push({ id, qty: Math.min(MAX_QTY_PER_ITEM, qty) });
    persist({ action: 'add', id, qty });
  },
  set(id, qty) {
    const q = Math.max(0, Math.min(MAX_QTY_PER_ITEM, Math.floor(qty)));
    if (q === 0) return Cart.remove(id);
    const existing = memoryItems.find((i) => i.id === id);
    if (existing) existing.qty = q;
    else if (PRODUCTS[id]) memoryItems.push({ id, qty: q });
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
    memoryItems = read(CART_KEY, []).filter((i) => PRODUCTS[i.id]);
    emit({ action: 'sync' });
  }
  if (e.key === CODE_KEY) {
    memoryCode = normalizeCode(read(CODE_KEY, null));
    emit({ action: 'sync' });
  }
});

export default Cart;
