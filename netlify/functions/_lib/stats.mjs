// Müügistatistika halduspaneelile.
//
// PÕHIMÕTTED
//  • Arvestame AINULT tegelikult tasutud tellimusi: payment_status 'paid', 'partially_refunded'
//    või 'refunded' (ka tagastatud tellimuse raha laekus kord — tagasimakse näidatakse eraldi).
//    Ootel, töötlemisel, aegunud ja ebaõnnestunud tellimused ei ole müük.
//  • Testtellimused (is_test: Stripe'i testrežiim / näidisrežiim) ei lähe ühtegi numbrisse
//    (statistika, kalender, saatmist ootavad) — need on ainult poe proovimiseks.
//  • Periood = makse laekumise aeg (paid_at; vanadel ridadel varuna created_at) Tallinna
//    kalendripäevades (vt time.mjs), mitte UTC päevades.
//  • Toodete müük = toodete summa PÄRAST sooduskoodi, ILMA tarneta (subtotal − discount).
//    Tarnetulu ja tagasimaksed on eraldi read. Netokäive = toodete müük + tarne − tagasimaksed.
//  • Komplektid: tulu läheb komplekti (toote) alla — mängude kaupa EI jagata, et summa ei
//    topelduks. Müüdud mängude KOGUSED („ühikud“) võetakse komplektid lahti eraldi tabelis.
//  • Rahasummad on täisarvulised sendid.
import { PRODUCTS, GAMES, productContents } from '../../../public/assets/js/catalog.js';
import { datesBetween, monthsBetween, tallinnDate, toDate } from './time.mjs';

export const PAID_STATUSES = ['paid', 'partially_refunded', 'refunded'];
/** Makstud ja veel saatmist vajavad (osaliselt tagastatud tellimuse kaup tuleb ikkagi saata). */
export const SHIPPABLE_PAYMENT = ['paid', 'partially_refunded'];
export const OPEN_FULFILLMENT = ['new', 'packed'];

const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

/** jsonb võib tulla objektina (PGlite, Neon) või stringina — käsitleme mõlemat. */
export function parseItems(items) {
  let list = items;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  return (Array.isArray(list) ? list : []).map((i) => {
    const id = String(i?.id || '');
    const includes = Array.isArray(i?.includes) && i.includes.length ? i.includes : productContents(id);
    return {
      id,
      name: String(i?.name || PRODUCTS[id]?.name || id),
      qty: int(i?.qty),
      unitCents: int(i?.unitCents),
      totalCents: int(i?.totalCents),
      bundle: Boolean(i?.bundle) || includes.length > 1 || includes.some((c) => int(c?.qty) > 1),
      includes: includes.map((c) => ({ id: String(c?.id || ''), name: String(c?.name || PRODUCTS[c?.id]?.name || c?.id || ''), qty: int(c?.qty) })),
    };
  });
}

/** Mängude kogused tellimuses (komplektid lahti võetuna) mängude kataloogijärjekorras. */
export function orderGameUnits(items) {
  const q = new Map();
  for (const item of parseItems(items)) {
    for (const c of item.includes) q.set(c.id, (q.get(c.id) || 0) + c.qty * item.qty);
  }
  const order = [...GAMES, ...[...q.keys()].filter((id) => !GAMES.includes(id))];
  return order.filter((id) => q.get(id) > 0).map((id) => ({ id, name: PRODUCTS[id]?.name || id, qty: q.get(id) }));
}

/**
 * Jagab tellimuse soodustuse ridade vahel proportsionaalselt (suurima jäägi meetodil), et
 * toodete tulu summa võrduks täpselt tellimuse toodete müügiga (subtotal − discount).
 * @returns {number[]} iga rea tulu sentides pärast soodustust
 */
export function allocateDiscount(lineTotals, discountCents) {
  const total = lineTotals.reduce((s, v) => s + v, 0);
  const discount = Math.max(0, Math.min(int(discountCents), total));
  if (!total || !discount) return [...lineTotals];
  const shares = lineTotals.map((v) => (v * discount) / total);
  const floors = shares.map(Math.floor);
  let rest = discount - floors.reduce((s, v) => s + v, 0);
  const order = shares.map((s, i) => [s - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return lineTotals.map((v, i) => v - floors[i]);
}

/** Tellimuse rahanumbrid statistika jaoks. */
export function orderMoney(o) {
  const subtotal = int(o.subtotal_cents);
  const discount = int(o.discount_cents);
  const shipping = int(o.shipping_cents);
  const total = int(o.total_cents);
  return {
    grossCents: subtotal - discount, // toodete müük pärast soodustust, ilma tarneta
    discountCents: discount,
    shippingCents: shipping,
    totalCents: total,
    paidCents: o.amount_paid_cents === null || o.amount_paid_cents === undefined ? total : int(o.amount_paid_cents),
    refundsCents: int(o.refunded_cents),
  };
}

/** Tellimuse „müügihetk“ statistikas: paid_at (varuna created_at). */
export const saleTime = (o) => toDate(o.paid_at) || toDate(o.created_at);

/** Näitajate selgitused (näidatakse halduses iga numbri juures). */
export const METRIC_INFO = {
  orders: { label: 'Tasutud tellimused', description: 'Tellimused, mille makse laekus valitud perioodil (sh hiljem osaliselt või täielikult tagastatud). Maksmata, aegunud ja ebaõnnestunud tellimusi ega testtellimusi ei loeta.' },
  grossSalesCents: { label: 'Toodete müük', description: 'Toodete summa pärast sooduskoodi, ilma tarneta. Komplekt on arvestatud komplekti hinnaga — mängude kaupa seda ei jagata.' },
  shippingCents: { label: 'Tarnetulu', description: 'Klientidelt võetud tarnetasud (tasuta tarnega tellimustel 0 €).' },
  refundsCents: { label: 'Tagasimaksed', description: 'Stripe’i kaudu tagastatud raha nende tellimuste eest, mis maksti valitud perioodil.' },
  netRevenueCents: { label: 'Netokäive', description: 'Toodete müük + tarnetulu − tagasimaksed. See on raha, mis jääb poele (enne Stripe’i tasusid).' },
  avgOrderCents: { label: 'Keskmine ostukorv', description: 'Tasutud tellimuse keskmine kogusumma koos tarnega (enne tagasimakseid).' },
  unitsSold: { label: 'Müüdud mänge', description: 'Mängude arv tükkides, komplektid lahti võetuna (nt „Kõik 3 mängu“ = 3 mängu). Summasid see ei mõjuta.' },
  discountCents: { label: 'Antud soodustus', description: 'Sooduskoodidega tehtud allahindlus kokku (on toodete müügist juba maha arvatud).' },
  pendingShipment: { label: 'Saatmist ootavad', description: 'Makstud tellimused, mis on pakkimata või pakitud, aga veel saatmata — kogu aja peale, mitte ainult valitud perioodil.' },
};

export const TABLE_INFO = {
  products: 'Müüdud kogus ja tulu toote kaupa (komplekt on eraldi toode). Tulu on pärast soodustust: sooduskoodi allahindlus on jagatud tellimuse ridade vahel nende summa järgi.',
  games: 'Mitu tükki igat mängu läks välja, komplektid lahti võetuna. „Komplektides“ näitab, mitu neist oli komplekti sees. Siin pole rahasummasid, et müüki ei loetaks topelt.',
  daily: 'Toodete müük päevade kaupa (Tallinna aja järgi, ilma tarneta).',
  monthly: 'Toodete müük kuude kaupa (Tallinna aja järgi, ilma tarneta).',
};

function emptyBucket() {
  return { orders: 0, grossCents: 0, shippingCents: 0, refundsCents: 0, netCents: 0, totalCents: 0 };
}

function addToBucket(b, m) {
  b.orders += 1;
  b.grossCents += m.grossCents;
  b.shippingCents += m.shippingCents;
  b.refundsCents += m.refundsCents;
  b.totalCents += m.totalCents;
  b.netCents = b.grossCents + b.shippingCents - b.refundsCents;
}

/**
 * Arvutab statistika tellimuste ridadest (andmebaasist; arvesse lähevad AINULT tasutud, päris
 * (mitte test-) ja vahemikku jäävad — kontroll on ka siin, et funktsioon oleks ohutu ka valimata andmetel).
 * @param {object[]} rows orders read
 * @param {{fromDate:string, toDate:string, from?:Date, to?:Date}} range Tallinna kuupäevad (mõlemad kaasa arvatud)
 */
export function computeStats(rows, range) {
  const { fromDate, toDate: toDateStr } = range;
  const days = new Map(datesBetween(fromDate, toDateStr).map((d) => [d, emptyBucket()]));
  const months = new Map(monthsBetween(fromDate, toDateStr).map((m) => [m, emptyBucket()]));
  const products = new Map();
  const games = new Map();
  const totals = { ...emptyBucket(), discountCents: 0, unitsSold: 0 };
  const codes = new Map();

  for (const o of rows) {
    if (!PAID_STATUSES.includes(o.payment_status) || o.is_test) continue;
    const t = saleTime(o);
    if (!t) continue;
    const date = tallinnDate(t);
    if (date < fromDate || date > toDateStr) continue;
    const m = orderMoney(o);
    addToBucket(totals, m);
    totals.discountCents += m.discountCents;
    addToBucket(days.get(date), m);
    addToBucket(months.get(date.slice(0, 7)), m);
    if (o.discount_code) codes.set(o.discount_code, (codes.get(o.discount_code) || 0) + 1);

    const items = parseItems(o.items);
    const revenue = allocateDiscount(
      items.map((i) => i.totalCents),
      m.discountCents,
    );
    items.forEach((item, idx) => {
      const p = products.get(item.id) || { id: item.id, name: PRODUCTS[item.id]?.name || item.name, bundle: item.bundle, qty: 0, orders: 0, revenueCents: 0 };
      p.qty += item.qty;
      p.orders += 1;
      p.revenueCents += revenue[idx];
      products.set(item.id, p);
      for (const c of item.includes) {
        const g = games.get(c.id) || { id: c.id, name: PRODUCTS[c.id]?.name || c.name, units: 0, single: 0, inBundles: 0 };
        const units = c.qty * item.qty;
        g.units += units;
        if (item.bundle) g.inBundles += units;
        else g.single += units;
        games.set(c.id, g);
        totals.unitsSold += units;
      }
    });
  }

  const productList = [...products.values()].sort((a, b) => b.qty - a.qty || b.revenueCents - a.revenueCents || a.name.localeCompare(b.name, 'et'));
  const gameOrder = (id) => (GAMES.includes(id) ? GAMES.indexOf(id) : 99);
  const gameList = [...games.values()].sort((a, b) => b.units - a.units || gameOrder(a.id) - gameOrder(b.id));
  // Kõik mängud on tabelis ka siis, kui neid ei müüdud (0 tk) — nii on näha, mis ei liigu.
  for (const id of GAMES) if (!games.has(id)) gameList.push({ id, name: PRODUCTS[id]?.name || id, units: 0, single: 0, inBundles: 0 });

  const metric = (key, value, unit) => ({ key, value, unit, label: METRIC_INFO[key].label, description: METRIC_INFO[key].description });
  const netRevenueCents = totals.grossCents + totals.shippingCents - totals.refundsCents;
  return {
    range: { from: fromDate, to: toDateStr, days: days.size },
    totals: {
      orders: totals.orders,
      grossSalesCents: totals.grossCents,
      shippingCents: totals.shippingCents,
      refundsCents: totals.refundsCents,
      netRevenueCents,
      avgOrderCents: totals.orders ? Math.round(totals.totalCents / totals.orders) : 0,
      unitsSold: totals.unitsSold,
      discountCents: totals.discountCents,
      paidTotalCents: totals.totalCents,
    },
    metrics: [
      metric('orders', totals.orders, 'count'),
      metric('grossSalesCents', totals.grossCents, 'cents'),
      metric('shippingCents', totals.shippingCents, 'cents'),
      metric('refundsCents', totals.refundsCents, 'cents'),
      metric('netRevenueCents', netRevenueCents, 'cents'),
      metric('avgOrderCents', totals.orders ? Math.round(totals.totalCents / totals.orders) : 0, 'cents'),
      metric('unitsSold', totals.unitsSold, 'count'),
      metric('discountCents', totals.discountCents, 'cents'),
    ],
    products: productList,
    games: gameList,
    discountCodes: [...codes.entries()].map(([code, orders]) => ({ code, orders })),
    daily: [...days.entries()].map(([date, b]) => ({ date, ...b })),
    monthly: [...months.entries()].map(([month, b]) => ({ month, ...b })),
    info: TABLE_INFO,
  };
}

/* ---------------------------------------------------------------------------
 * Andmebaasipäringud
 * ------------------------------------------------------------------------- */

const STAT_COLUMNS = `id, number, created_at, paid_at, customer_name, items, subtotal_cents, discount_code, discount_cents,
  shipping_cents, total_cents, amount_paid_cents, refunded_cents, payment_status, fulfillment_status, carrier_name, locker_name`;

/** Tasutud PÄRIS tellimused (testtellimused välja arvatud), mille makse laekus vahemikus [from, to) (UTC hetked). */
export async function fetchPaidOrders(db, from, to, { limit = 20000 } = {}) {
  return db.query(
    `SELECT ${STAT_COLUMNS} FROM orders
     WHERE NOT is_test AND payment_status = ANY($1::text[])
       AND COALESCE(paid_at, created_at) >= $2::timestamptz AND COALESCE(paid_at, created_at) < $3::timestamptz
     ORDER BY COALESCE(paid_at, created_at) ASC
     LIMIT ${Math.max(1, Math.min(50000, int(limit)))}`,
    [PAID_STATUSES, from.toISOString(), to.toISOString()],
  );
}

/** Saatmist ootavad päris tellimused (makstud, täitmine new/packed) — vanimad ees. */
export async function fetchPendingShipment(db, { limit = 10 } = {}) {
  const rows = await db.query(
    `SELECT id, number, created_at, paid_at, customer_name, fulfillment_status, carrier_name, locker_name, total_cents,
            count(*) OVER ()::int AS total_count,
            count(*) FILTER (WHERE fulfillment_status = 'packed') OVER ()::int AS packed_count
     FROM orders
     WHERE NOT is_test AND payment_status = ANY($1::text[]) AND fulfillment_status = ANY($2::text[])
     ORDER BY COALESCE(paid_at, created_at) ASC
     LIMIT ${Math.max(1, Math.min(500, int(limit)))}`,
    [SHIPPABLE_PAYMENT, OPEN_FULFILLMENT],
  );
  const count = rows[0]?.total_count || 0;
  const packed = rows[0]?.packed_count || 0;
  return {
    count,
    packed,
    new: count - packed,
    label: METRIC_INFO.pendingShipment.label,
    description: METRIC_INFO.pendingShipment.description,
    orders: rows.map((r) => ({
      number: r.number,
      customerName: r.customer_name,
      paidAt: (toDate(r.paid_at) || toDate(r.created_at))?.toISOString() || null,
      fulfillmentStatus: r.fulfillment_status,
      carrierName: r.carrier_name,
      lockerName: r.locker_name,
      totalCents: int(r.total_cents),
    })),
  };
}

/**
 * Kalender: kuu iga päeva tasutud tellimuste arv ja summa (Tallinna päevad).
 * @param {object[]} rows fetchPaidOrders() tulemus kuu vahemikus
 */
export function computeCalendar(rows, { fromDate, toDate: toDateStr }) {
  const days = new Map(datesBetween(fromDate, toDateStr).map((d) => [d, { date: d, orders: 0, paidCents: 0, grossCents: 0, refundsCents: 0 }]));
  for (const o of rows) {
    if (!PAID_STATUSES.includes(o.payment_status) || o.is_test) continue;
    const t = saleTime(o);
    if (!t) continue;
    const day = days.get(tallinnDate(t));
    if (!day) continue;
    const m = orderMoney(o);
    day.orders += 1;
    day.paidCents += m.paidCents;
    day.grossCents += m.grossCents;
    day.refundsCents += m.refundsCents;
  }
  const list = [...days.values()];
  return {
    days: list,
    totals: {
      orders: list.reduce((s, d) => s + d.orders, 0),
      paidCents: list.reduce((s, d) => s + d.paidCents, 0),
      grossCents: list.reduce((s, d) => s + d.grossCents, 0),
      refundsCents: list.reduce((s, d) => s + d.refundsCents, 0),
    },
    maxPaidCents: list.reduce((s, d) => Math.max(s, d.paidCents), 0),
    info: {
      orders: 'Selle päeva tasutud tellimuste arv (makse laekumise aja järgi, Tallinna aeg).',
      paidCents: 'Klientide makstud summa koos tarnega (enne tagasimakseid).',
    },
  };
}
