// Halduse tellimuste päringud: nimekiri (otsing, filtrid, sortimine, lehed), detailvaade,
// täitmise muutmine (PATCH) ja pakkimisvaade.
//
// Päringud on kirjutatud otse skeemi (schema.mjs) vastu. Kasutaja sisend läheb SQL-i ainult
// parameetritena ($1, $2 …); sortimine ja veerunimed tulevad koodis olevatest valgetest nimekirjadest.
//
// MUUDETAV halduses: fulfillment_status (koos packed_at/shipped_at ajatemplitega), tracking_code,
// notes. MITTE muudetav: makse staatus ja summad (tulevad Stripe'ist), klient, tooted ning tarne
// andmed (vedaja, automaat, automaadi ID ja aadress salvestatakse tellimisel ja jäävad muutmata).
//
// PÄRIS- JA TESTTELLIMUSED: nimekiri, CSV ja pakkimisvaade näitavad vaikimisi ainult päris
// tellimusi; `test=1` näitab ainult testtellimusi (Stripe'i testrežiim / näidisrežiim).
//
// TELLIMUSE NUMBER URL-is ja otsingus: ÄGE-2026-0001 võib tulla URL-kodeeritult (%C3%84GE-…),
// ilma Ä-ta (AGE-2026-0001), väiketähtedega või vana numbrina (AGE-1001) — normalizeNumber()
// teeb sellest õige kuju ja server vastab alati õige (kanoonilise) numbriga.
import { PRODUCTS, SHIPPING, DISCOUNT_CODES } from '../../../public/assets/js/catalog.js';
import { asciiOrderNumber, parseOrderNumber, TEST_PREFIX } from '../../../public/assets/js/order-number.js';
import { cleanText, truncate } from './http.mjs';
import { tallinnRange, isDateString, formatTallinn, toDate, diffDays } from './time.mjs';
import { parseItems, orderGameUnits, PAID_STATUSES, SHIPPABLE_PAYMENT, OPEN_FULFILLMENT } from './stats.mjs';
import { restockBlocker } from './admin-inventory.mjs';

export const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded'];
export const FULFILLMENT_STATUSES = ['new', 'packed', 'shipped', 'delivered', 'cancelled'];

export const PAYMENT_LABELS = {
  pending: 'Ootab makset',
  processing: 'Makse töötlemisel',
  paid: 'Makstud',
  failed: 'Makse ebaõnnestus',
  expired: 'Makseaeg läbi',
  refunded: 'Raha tagastatud',
  partially_refunded: 'Osaliselt tagastatud',
};

export const FULFILLMENT_LABELS = {
  new: 'Uus',
  packed: 'Pakitud',
  shipped: 'Saadetud',
  delivered: 'Kohale toimetatud',
  cancelled: 'Tühistatud',
};

/** Filtrite rühmad (lisaks üksikutele olekutele). */
const PAYMENT_GROUPS = {
  paid_any: PAID_STATUSES,
  unpaid: ['pending', 'processing', 'failed', 'expired'],
  shippable: SHIPPABLE_PAYMENT,
};
const FULFILLMENT_GROUPS = { open: OPEN_FULFILLMENT, done: ['shipped', 'delivered'] };

/**
 * Lubatud täitmise üleminekud. Tagasisammud (nt saadetud → pakitud) on lubatud vigade
 * parandamiseks; tühistatud tellimuse saab taastada („uus“).
 */
export const FULFILLMENT_TRANSITIONS = {
  new: ['packed', 'shipped', 'cancelled'],
  packed: ['shipped', 'new', 'cancelled'],
  shipped: ['delivered', 'packed', 'cancelled'],
  delivered: ['shipped'],
  cancelled: ['new'],
};
/** Need olekud eeldavad, et raha on laekunud (maksmata tellimust ei saa saata). */
const NEEDS_PAYMENT = new Set(['packed', 'shipped', 'delivered']);

export const SORTS = {
  created_desc: 'created_at DESC, id DESC',
  created_asc: 'created_at ASC, id ASC',
  total_desc: 'total_cents DESC, created_at DESC',
  total_asc: 'total_cents ASC, created_at DESC',
  number_desc: 'number_year DESC NULLS LAST, number_seq DESC NULLS LAST, created_at DESC',
  number_asc: 'number_year ASC NULLS LAST, number_seq ASC NULLS LAST, created_at ASC',
  customer_asc: 'lower(customer_name) ASC, created_at DESC',
};

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_RANGE_DAYS = 3660;
export const LIMITS = { q: 100, trackingCode: 100, notes: 5000 };

const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const iso = (v) => toDate(v)?.toISOString() || null;
const fail = (error, field) => ({ ok: false, error, field });

/** '%' ja '_' LIKE-mustris sõnasõnaliseks (Postgresi vaikimisi paoemärk on \). */
export const escapeLike = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

function parseList(value, allowed, groups) {
  const out = new Set();
  for (const part of String(value || '').split(',')) {
    const v = part.trim();
    if (!v || v === 'all') continue;
    if (groups[v]) groups[v].forEach((s) => out.add(s));
    else if (allowed.includes(v)) out.add(v);
    else return null;
  }
  return [...out];
}

/**
 * Loeb ja kontrollib nimekirja/ekspordi filtrid URL-i parameetritest.
 * q (nr/vana nr/nimi/e-post/telefon/automaat/jälgimiskood), from/to (Tallinna kuupäevad YYYY-MM-DD,
 * tellimuse loomise aeg), payment, fulfillment (olek, rühm või komadega nimekiri), sort, page, pageSize,
 * test (1 = ainult testtellimused; vaikimisi ainult päris tellimused).
 */
export function parseOrderFilters(searchParams) {
  const get = (k) => searchParams.get(k) ?? '';
  const q = truncate(cleanText(get('q')), LIMITS.q);
  const from = get('from').trim();
  const to = get('to').trim();
  if (from && !isDateString(from)) return fail('Vigane alguskuupäev (oodati kujul AAAA-KK-PP).', 'from');
  if (to && !isDateString(to)) return fail('Vigane lõppkuupäev (oodati kujul AAAA-KK-PP).', 'to');
  if (from && to && to < from) return fail('Lõppkuupäev on enne alguskuupäeva.', 'to');
  if (from && to && diffDays(from, to) > MAX_RANGE_DAYS) return fail('Vahemik on liiga pikk.', 'to');
  const payment = parseList(get('payment'), PAYMENT_STATUSES, PAYMENT_GROUPS);
  if (!payment) return fail('Tundmatu makse staatus.', 'payment');
  const fulfillment = parseList(get('fulfillment'), FULFILLMENT_STATUSES, FULFILLMENT_GROUPS);
  if (!fulfillment) return fail('Tundmatu täitmise staatus.', 'fulfillment');
  const sort = get('sort') || 'created_desc';
  if (!Object.prototype.hasOwnProperty.call(SORTS, sort)) return fail('Tundmatu sortimine.', 'sort');
  const page = Math.max(1, Math.min(100000, Math.floor(Number(get('page')) || 1)));
  const pageSize = Math.max(5, Math.min(MAX_PAGE_SIZE, Math.floor(Number(get('pageSize')) || DEFAULT_PAGE_SIZE)));
  const test = parseTestFlag(get('test'));
  if (test === null) return fail('Vigane test-tellimuste valik (lubatud: test=1 või test=0).', 'test');
  return { ok: true, value: { q, from, to, payment, fulfillment, sort, page, pageSize, test } };
}

/** URL-i `test` parameeter: '' / '0' → päris tellimused (false), '1' → testtellimused (true), muu → null. */
export function parseTestFlag(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  return null;
}

/**
 * WHERE-lause ja parameetrid filtritest. `f.test` true/false piirab päris/test tellimustega;
 * null/undefined → mõlemad (kasutatakse mõlema liigi loendamiseks).
 */
export function buildOrderWhere(f) {
  const where = [];
  const params = [];
  const add = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (typeof f.test === 'boolean') where.push(`is_test = ${add(f.test)}::boolean`);
  if (f.q) {
    const p = add(`%${escapeLike(f.q)}%`);
    const cols = ['legacy_number', 'customer_name', 'customer_email', 'customer_phone', 'locker_name', 'locker_id', 'locker_address', 'locker_city', 'tracking_code', 'stripe_payment_intent_id'];
    const conds = cols.map((c) => `${c} ILIKE ${p}`);
    // Tellimuse number ka ilma Ä-ta ja osaliselt: „AGE-2026-0001“, „age-2026“, „2026-0001“, „0001“.
    conds.push(`translate(number, 'Ää', 'Aa') ILIKE ${add(`%${escapeLike(asciiOrderNumber(f.q))}%`)}`);
    // Tühikutega või muul kujul number („äge 2026 1“) → täpne vaste (nii päris kui ka testtellimus).
    const parsed = parseOrderNumber(f.q);
    if (parsed && !parsed.legacy) {
      const bare = parsed.number.replace(TEST_PREFIX, '');
      conds.push(`number = ANY(${add(parsed.test ? [parsed.number] : [bare, TEST_PREFIX + bare])}::text[])`);
    } else if (parsed?.legacy) conds.push(`legacy_number = ${add(parsed.number)}`);
    const digits = f.q.replace(/\D/g, '');
    // Telefoni otsing ilma tühikute/plussita: "51234567" leiab "+372 5123 4567".
    if (digits.length >= 4) conds.push(`regexp_replace(customer_phone, '[^0-9]', '', 'g') LIKE ${add(`%${digits}%`)}`);
    where.push(`(${conds.join(' OR ')})`);
  }
  if (f.from || f.to) {
    const r = tallinnRange(f.from || f.to, f.to || f.from);
    if (f.from) where.push(`created_at >= ${add(r.from.toISOString())}::timestamptz`);
    if (f.to) where.push(`created_at < ${add(r.to.toISOString())}::timestamptz`);
  }
  if (f.payment?.length) where.push(`payment_status = ANY(${add(f.payment)}::text[])`);
  if (f.fulfillment?.length) where.push(`fulfillment_status = ANY(${add(f.fulfillment)}::text[])`);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// Halduses vajalikud veerud. public_token (kliendi kinnituslehe salajane tunnus) ja
// stripe_session_url jäetakse teadlikult välja — haldus ei vaja neid.
export const ADMIN_COLUMNS = `id, number, legacy_number, is_test, number_year, number_seq, created_at, updated_at, customer_name, customer_email, customer_phone, newsletter, age_confirmed,
  items, subtotal_cents, discount_code, discount_cents, shipping_cents, total_cents, currency,
  carrier, carrier_name, locker_id, locker_name, locker_address, locker_city,
  payment_status, stripe_session_id, stripe_session_expires_at, stripe_payment_intent_id, paid_at, amount_paid_cents, refunded_cents,
  fulfillment_status, packed_at, shipped_at, tracking_code, notes,
  inventory_applied_at, restocked_at, confirmation_sent_at, admin_notified_at`;

/**
 * Tellimused filtritega + lehekülgede info. `counts` = samadele filtritele vastavate päris- ja
 * testtellimuste arv (lüliti „Päris / Test“ jaoks — nt kohalikus näidisrežiimis on kõik testid).
 */
export async function listOrders(db, f) {
  const test = f.test === true;
  const both = buildOrderWhere({ ...f, test: null });
  const [c] = await db.query(
    `SELECT count(*) FILTER (WHERE NOT is_test)::int AS live, count(*) FILTER (WHERE is_test)::int AS test FROM orders ${both.sql}`,
    both.params,
  );
  const counts = { live: Number(c?.live) || 0, test: Number(c?.test) || 0 };
  const count = test ? counts.test : counts.live;
  const { sql, params } = buildOrderWhere({ ...f, test });
  const pages = Math.max(1, Math.ceil(count / f.pageSize));
  const page = Math.min(f.page, pages);
  const rows = await db.query(
    `SELECT ${ADMIN_COLUMNS} FROM orders ${sql} ORDER BY ${SORTS[f.sort]} LIMIT ${f.pageSize} OFFSET ${(page - 1) * f.pageSize}`,
    params,
  );
  return { orders: rows.map(orderSummary), total: count, page, pageSize: f.pageSize, pages, test, counts };
}

/** Kõik filtritele vastavad tellimused (CSV), kuni `limit` rida. */
export async function listOrdersForExport(db, f, { limit = 10000 } = {}) {
  const { sql, params } = buildOrderWhere({ ...f, test: f.test === true });
  return db.query(`SELECT ${ADMIN_COLUMNS} FROM orders ${sql} ORDER BY ${SORTS[f.sort]} LIMIT ${Math.max(1, Math.min(50000, int(limit)))}`, params);
}

/** Operaatori nimi (Omniva / SmartPosti / DPD). */
export const carrierShortName = (carrier, fallback = '') => SHIPPING.carriers[carrier]?.name || fallback || carrier || '';

/** „Kõik 3 mängu × 1 (MIDA V!!!U + Oled Semu? + Vigur)“ */
export function itemLabel(item) {
  const contents = item.bundle ? ` (${item.includes.map((c) => (c.qty > 1 ? `${c.qty}× ${c.name}` : c.name)).join(' + ')})` : '';
  return `${item.name} × ${item.qty}${contents}`;
}

/** Nimekirja rida (kompaktne). */
export function orderSummary(row) {
  const items = parseItems(row.items);
  return {
    id: row.id,
    number: row.number,
    legacyNumber: row.legacy_number || null,
    isTest: Boolean(row.is_test),
    createdAt: iso(row.created_at),
    createdAtText: formatTallinn(row.created_at),
    paidAt: iso(row.paid_at),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    itemsText: items.map(itemLabel).join(', '),
    itemCount: items.reduce((s, i) => s + i.qty, 0),
    totalCents: int(row.total_cents),
    refundedCents: int(row.refunded_cents),
    paymentStatus: row.payment_status,
    paymentLabel: PAYMENT_LABELS[row.payment_status] || row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    fulfillmentLabel: FULFILLMENT_LABELS[row.fulfillment_status] || row.fulfillment_status,
    carrier: row.carrier,
    carrierName: carrierShortName(row.carrier, row.carrier_name),
    lockerName: row.locker_name,
    trackingCode: row.tracking_code || '',
  };
}

/** Stripe'i töölaua link maksele (test- või live-režiim). Näidisrežiimi ID-del linki pole. */
export function stripeDashboardUrl(row) {
  const pi = row.stripe_payment_intent_id;
  if (!pi || !/^pi_[A-Za-z0-9_]+$/.test(pi) || pi.startsWith('pi_mock_')) return null;
  const test = Boolean(row.is_test) || String(row.stripe_session_id || '').startsWith('cs_test_');
  return `https://dashboard.stripe.com/${test ? 'test/' : ''}payments/${encodeURIComponent(pi)}`;
}

/** Kõik tellimuse väljad halduse detailvaate jaoks. */
export function orderDetail(row) {
  const items = parseItems(row.items);
  const paid = PAID_STATUSES.includes(row.payment_status);
  const code = row.discount_code || null;
  return {
    ...orderSummary(row),
    updatedAt: iso(row.updated_at),
    paidAtText: formatTallinn(row.paid_at),
    newsletter: Boolean(row.newsletter),
    ageConfirmed: Boolean(row.age_confirmed),
    items: items.map((i) => ({ ...i, label: itemLabel(i) })),
    games: orderGameUnits(items),
    totals: {
      subtotalCents: int(row.subtotal_cents),
      discountCode: code,
      discountPercent: code && DISCOUNT_CODES[code] ? DISCOUNT_CODES[code] : 0,
      discountCents: int(row.discount_cents),
      shippingCents: int(row.shipping_cents),
      totalCents: int(row.total_cents),
      amountPaidCents: row.amount_paid_cents === null || row.amount_paid_cents === undefined ? null : int(row.amount_paid_cents),
      refundedCents: int(row.refunded_cents),
      currency: row.currency || 'eur',
    },
    payment: {
      status: row.payment_status,
      label: PAYMENT_LABELS[row.payment_status] || row.payment_status,
      paid,
      paidAt: iso(row.paid_at),
      paidAtText: formatTallinn(row.paid_at),
      stripePaymentIntentId: row.stripe_payment_intent_id || null,
      stripeSessionId: row.stripe_session_id || null,
      stripeSessionExpiresAt: iso(row.stripe_session_expires_at),
      stripeDashboardUrl: stripeDashboardUrl(row),
    },
    shipping: {
      carrier: row.carrier,
      carrierName: carrierShortName(row.carrier, row.carrier_name),
      carrierLabel: row.carrier_name,
      lockerId: row.locker_id || null,
      lockerName: row.locker_name,
      lockerAddress: row.locker_address || null,
      lockerCity: row.locker_city || null,
    },
    fulfillment: {
      status: row.fulfillment_status,
      label: FULFILLMENT_LABELS[row.fulfillment_status] || row.fulfillment_status,
      packedAt: iso(row.packed_at),
      packedAtText: formatTallinn(row.packed_at),
      shippedAt: iso(row.shipped_at),
      shippedAtText: formatTallinn(row.shipped_at),
      trackingCode: row.tracking_code || '',
      allowed: allowedTransitions(row),
    },
    notes: row.notes || '',
    restock: restockInfo(row),
    events: {
      inventoryAppliedAt: iso(row.inventory_applied_at),
      restockedAt: iso(row.restocked_at),
      confirmationSentAt: iso(row.confirmation_sent_at),
      adminNotifiedAt: iso(row.admin_notified_at),
    },
  };
}

/**
 * „Pane mängud lattu tagasi“ olek detailvaatele: kas nupp on lubatud, miks mitte ja millal tehti.
 * Kogused on samad, mis müük laost maha võttis (komplektid lahti võetuna).
 */
export function restockInfo(row) {
  const blocker = restockBlocker(row);
  return {
    allowed: blocker === null,
    reason: blocker && blocker.code !== 'done' ? blocker.error : '',
    restockedAt: iso(row.restocked_at),
    restockedAtText: formatTallinn(row.restocked_at),
    inventoryApplied: Boolean(row.inventory_applied_at),
  };
}

/** Täitmise olekud, kuhu sellest tellimusest praegu minna saab. */
export function allowedTransitions(row) {
  const paid = SHIPPABLE_PAYMENT.includes(row.payment_status);
  return (FULFILLMENT_TRANSITIONS[row.fulfillment_status] || []).filter((s) => !NEEDS_PAYMENT.has(s) || paid);
}

/**
 * URL-i lõik → dekodeeritud tekst. Netlify ja kohalik dev-server annavad tee tavaliselt
 * URL-kodeeritult (%C3%84GE-…), aga see võib olla ka juba dekodeeritud või kogemata kaks korda
 * kodeeritud — dekodeerime, kuni tekstis pole enam %XX-kodeeringut (tellimuse numbris % ei esine).
 */
export function decodePathSegment(value) {
  let s = String(value ?? '');
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(s); i++) {
    try {
      s = decodeURIComponent(s);
    } catch {
      break;
    }
  }
  return s;
}

/**
 * Tellimuse number URL-ist või sisestusest → õige kuju ('ÄGE-2026-0001', 'TEST-ÄGE-2026-0001'
 * või vana 'AGE-1001'), muidu null. Lubab ka ASCII-kuju (AGE-2026-0001) ja väiketähti.
 */
export function normalizeNumber(value) {
  return parseOrderNumber(decodePathSegment(value))?.number || null;
}

/** Tellimus numbri (või vana numbri) järgi. */
export async function getAdminOrder(db, number) {
  const rows = await db.query(
    `SELECT ${ADMIN_COLUMNS} FROM orders WHERE number = $1 OR legacy_number = $1 ORDER BY (number = $1) DESC LIMIT 1`,
    [number],
  );
  return rows[0] || null;
}

/* ---------------------------------------------------------------------------
 * Muutmine
 * ------------------------------------------------------------------------- */

const PATCHABLE = new Set(['fulfillmentStatus', 'trackingCode', 'notes']);

/** Mitmerealine märkus: reavahetused jäävad, juhtmärgid kaovad. */
function cleanNotes(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200D\u2028\u2029\uFEFF]/g, ' ')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Kontrollib PATCH-keha. Lubatud: { fulfillmentStatus?, trackingCode?, notes? }.
 * Muud väljad (nt paymentStatus, lockerId, totalCents) → viga: neid ei saa halduses muuta.
 */
export function validateOrderPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Vigane päring.');
  const keys = Object.keys(body);
  const forbidden = keys.filter((k) => !PATCHABLE.has(k));
  if (forbidden.length) {
    return fail(
      `Neid välju ei saa halduses muuta: ${forbidden.join(', ')}. Makse staatus tuleb Stripe’ist ning tooted, summad ja tarne andmed (automaat) jäävad tellimisel salvestatud kujule.`,
      forbidden[0],
    );
  }
  if (!keys.length) return fail('Muudatusi pole.');
  const value = {};
  if ('fulfillmentStatus' in body) {
    if (!FULFILLMENT_STATUSES.includes(body.fulfillmentStatus)) return fail('Tundmatu täitmise staatus.', 'fulfillmentStatus');
    value.fulfillmentStatus = body.fulfillmentStatus;
  }
  if ('trackingCode' in body) {
    if (body.trackingCode !== null && typeof body.trackingCode !== 'string') return fail('Vigane jälgimiskood.', 'trackingCode');
    const t = cleanText(body.trackingCode ?? '');
    if (Array.from(t).length > LIMITS.trackingCode) return fail(`Jälgimiskood on liiga pikk (kuni ${LIMITS.trackingCode} märki).`, 'trackingCode');
    value.trackingCode = t || null;
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') return fail('Vigased märkmed.', 'notes');
    const n = cleanNotes(body.notes);
    if (Array.from(n).length > LIMITS.notes) return fail(`Märkmed on liiga pikad (kuni ${LIMITS.notes} märki).`, 'notes');
    value.notes = n;
  }
  return { ok: true, value };
}

/**
 * Rakendab muudatuse ühe lausega. Täitmise olekumuutus kontrollitakse praeguse oleku vastu
 * (WHERE fulfillment_status = praegune), nii et samaaegne muudatus ei kirjuta teist üle.
 * @returns {Promise<{ok:true, row:object} | {ok:false, status:number, error:string, field?:string}>}
 */
export async function updateOrder(db, number, patch, { now = new Date() } = {}) {
  const current = await getAdminOrder(db, number);
  if (!current) return { ok: false, status: 404, error: 'Tellimust ei leitud.' };
  const from = current.fulfillment_status;
  const to = patch.fulfillmentStatus ?? from;
  if (to !== from) {
    if (!(FULFILLMENT_TRANSITIONS[from] || []).includes(to)) {
      return { ok: false, status: 409, field: 'fulfillmentStatus', error: `Olekust „${FULFILLMENT_LABELS[from]}“ ei saa minna olekusse „${FULFILLMENT_LABELS[to]}“.` };
    }
    if (NEEDS_PAYMENT.has(to) && !SHIPPABLE_PAYMENT.includes(current.payment_status)) {
      return {
        ok: false,
        status: 409,
        field: 'fulfillmentStatus',
        error: `Tellimus pole makstud (${PAYMENT_LABELS[current.payment_status] || current.payment_status}) — seda ei saa pakkida ega saata.`,
      };
    }
  }
  const rows = await db.query(
    `UPDATE orders SET
        fulfillment_status = $2::text,
        packed_at = CASE
          WHEN $2::text = $3::text THEN packed_at
          WHEN $2::text IN ('packed','shipped','delivered') THEN COALESCE(packed_at, $4::timestamptz)
          WHEN $2::text = 'new' THEN NULL
          ELSE packed_at END,
        shipped_at = CASE
          WHEN $2::text = $3::text THEN shipped_at
          WHEN $2::text IN ('shipped','delivered') THEN COALESCE(shipped_at, $4::timestamptz)
          WHEN $2::text IN ('new','packed') THEN NULL
          ELSE shipped_at END,
        tracking_code = CASE WHEN $5::boolean THEN $6::text ELSE tracking_code END,
        notes = CASE WHEN $7::boolean THEN $8::text ELSE notes END,
        updated_at = $4::timestamptz
     WHERE id = $1::text AND fulfillment_status = $3::text
     RETURNING ${ADMIN_COLUMNS}`,
    [current.id, to, from, now.toISOString(), 'trackingCode' in patch, patch.trackingCode ?? null, 'notes' in patch, patch.notes ?? ''],
  );
  if (!rows[0]) return { ok: false, status: 409, error: 'Tellimust muudeti vahepeal. Värskenda vaadet ja proovi uuesti.' };
  return { ok: true, row: rows[0] };
}

/* ---------------------------------------------------------------------------
 * Pakkimine: makstud ja saatmata tellimused — mida ja kuhu saata
 * ------------------------------------------------------------------------- */

/** Pakkimisvaade: vaikimisi päris tellimused, `test: true` → ainult testtellimused. */
export async function listPacking(db, { limit = 300, test = false } = {}) {
  const rows = await db.query(
    `SELECT ${ADMIN_COLUMNS} FROM orders
     WHERE is_test = $3::boolean AND payment_status = ANY($1::text[]) AND fulfillment_status = ANY($2::text[])
     ORDER BY COALESCE(paid_at, created_at) ASC
     LIMIT ${Math.max(1, Math.min(1000, int(limit)))}`,
    [SHIPPABLE_PAYMENT, OPEN_FULFILLMENT, test === true],
  );
  const orders = rows.map((r) => {
    const d = orderDetail(r);
    return {
      number: d.number,
      isTest: d.isTest,
      createdAtText: d.createdAtText,
      paidAt: d.paidAt,
      paidAtText: d.paidAtText,
      customerName: d.customerName,
      customerEmail: d.customerEmail,
      customerPhone: d.customerPhone,
      items: d.items,
      games: d.games,
      shipping: d.shipping,
      fulfillmentStatus: d.fulfillment.status,
      fulfillmentLabel: d.fulfillment.label,
      packedAtText: d.fulfillment.packedAtText,
      trackingCode: d.fulfillment.trackingCode,
      notes: d.notes,
      paymentStatus: d.payment.status,
      paymentLabel: d.payment.label,
      refundedCents: d.totals.refundedCents,
    };
  });
  // Kokkuvõte: mitu tükki igat mängu kokku vaja (komplektid lahti võetuna).
  const need = new Map();
  for (const o of orders) for (const g of o.games) need.set(g.id, (need.get(g.id) || 0) + g.qty);
  const games = [...need.entries()].map(([id, qty]) => ({ id, name: PRODUCTS[id]?.name || id, qty }));
  return { orders, games, count: orders.length, test: test === true };
}
