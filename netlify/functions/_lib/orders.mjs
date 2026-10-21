// Tellimused andmebaasis: loomine, olekuüleminekud, laoseis ja avalik vaade.
//
// Andmebaasi tootmisdraiver (Netlify DB / Neon HTTP) ei toeta interaktiivseid tehinguid,
// seepärast on IGA olekumuutus ÜKS SQL-lause (vajadusel CTE-dega). Kõik üleminekud on
// idempotentsed: lause muudab rida ainult siis, kui praegune olek seda lubab, ja tagastab
// { transitioned, order } — korduv sama sündmus ei muuda midagi ega käivita kõrvalmõjusid.
//
// Olekud (orders.payment_status):
//   pending ──► processing ──► paid ──► partially_refunded ──► refunded
//      │            │           ▲
//      │            └──► failed │ (makse tõend Stripe'ist on alati ülimuslik: paid lubatakse
//      └──► expired ────────────┘  ka failed/expired olekust, sest raha on päriselt laekunud)
//
// LAOSEIS: tabelis `inventory` on rida ainult mängudel, mille laoseisu omanik on halduses
// seadnud. Kui mängul rida PUUDUB, loetakse laoseis piiramatuks (kassas ei kontrollita ega
// keelata midagi) — nii ei jää pood kogemata "kõik otsas" olekusse enne, kui laoseis on
// sisestatud. Müügi laoliikumine (inventory_movements, reason 'sale') salvestatakse siiski
// alati ajaloo jaoks; `inventory.stock` väheneb ainult olemasoleval real.
//
// TESTTELLIMUSED (is_test: Stripe'i testvõti või kohalik näidisrežiim) saavad numbri
// TEST-ÄGE-AAAA-NNNN oma loenduriga, EI muuda laoseisu (laoliikumisi ei teki) ega lähe
// statistikasse. Laoseisu piisavust kontrollitakse kassas siiski ka nende puhul (409).
import { randomBytes, randomUUID } from 'node:crypto';
import { PRODUCTS, SHIPPING, DISCOUNT_CODES, GAMES, computeTotals, productContents, gameQuantities } from '../../../public/assets/js/catalog.js';
import { ORDER_PREFIX, TEST_PREFIX, parseOrderNumber } from '../../../public/assets/js/order-number.js';

/* ---------------------------------------------------------------------------
 * Abifunktsioonid
 * ------------------------------------------------------------------------- */

/** 32 juhuslikku baiti base64url-ina (43 märki) — kinnituslehe salajane tunnus. */
export function createPublicToken() {
  return randomBytes(32).toString('base64url');
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Date | string | unix-sekundid → ISO string (või null). */
export function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const nullIfEmpty = (s) => (s === undefined || s === null || s === '' ? null : s);

/** Ostukorvi read hetktõmmisena (hinnad serverist): [{ id, name, qty, unitCents, totalCents, bundle, includes }]. */
export function itemsSnapshot(totals) {
  return totals.lines.map((line) => ({
    id: line.product.id,
    name: line.product.name,
    qty: line.qty,
    unitCents: line.unitCents,
    totalCents: line.totalCents,
    bundle: Boolean(line.product.includes?.length),
    includes: productContents(line.product.id),
  }));
}

/**
 * Mitu tükki igat mängu tellimus sisaldab (komplektid lahti võetuna). Kasutab tellimuse
 * hetktõmmist (komplekti sisu tellimise hetkel), mitte praegust kataloogi.
 */
export function orderGameQuantities(items) {
  const q = {};
  for (const item of Array.isArray(items) ? items : []) {
    const qty = Number(item?.qty) || 0;
    const contents = Array.isArray(item?.includes) && item.includes.length ? item.includes : productContents(item?.id);
    for (const c of contents) q[c.id] = (q[c.id] || 0) + (Number(c.qty) || 0) * qty;
  }
  return q;
}

/* ---------------------------------------------------------------------------
 * Lugemine
 * ------------------------------------------------------------------------- */

async function one(db, sql, params) {
  const rows = await db.query(sql, params);
  return rows[0] || null;
}

export const getOrderById = (db, id) => one(db, 'SELECT * FROM orders WHERE id = $1', [String(id)]);
/** Tellimus numbri järgi: õige kuju, ilma Ä-ta (AGE-2026-0001), väiketähtedega või vana number (AGE-1001). */
export function getOrderByNumber(db, number) {
  const parsed = parseOrderNumber(number);
  if (!parsed) return Promise.resolve(null);
  return one(db, 'SELECT * FROM orders WHERE number = $1 OR legacy_number = $1 ORDER BY (number = $1) DESC LIMIT 1', [parsed.number]);
}
export const getOrderByToken = (db, token) => one(db, 'SELECT * FROM orders WHERE public_token = $1', [String(token)]);
export const getOrderBySessionId = (db, sessionId) => one(db, 'SELECT * FROM orders WHERE stripe_session_id = $1', [String(sessionId)]);
export const getOrderByPaymentIntent = (db, pi) =>
  one(db, 'SELECT * FROM orders WHERE stripe_payment_intent_id = $1 ORDER BY created_at DESC LIMIT 1', [String(pi)]);

/* ---------------------------------------------------------------------------
 * Laoseis
 * ------------------------------------------------------------------------- */

/** Praegune laoseis: { 'mida-viiu': 12, … } — ainult mängud, millel on inventory rida. */
export async function getStockLevels(db) {
  const rows = await db.query('SELECT game_id, stock FROM inventory');
  const out = {};
  for (const r of rows) out[r.game_id] = Number(r.stock);
  return out;
}

/**
 * Kontrollib, kas ostukorvi jaoks on piisavalt mänge laos (komplektid lahti võetuna).
 * Kontrollitakse AINULT mänge, millel on inventory rida (vt faili päis).
 * @returns {Promise<{ok:boolean, shortages:{id,name,requested,available}[]}>}
 */
export async function checkAvailability(db, items) {
  const need = gameQuantities(items);
  const stock = await getStockLevels(db);
  const shortages = [];
  for (const [gameId, requested] of Object.entries(need)) {
    if (!Object.prototype.hasOwnProperty.call(stock, gameId)) continue; // rida puudub → piiramatu
    const available = Math.max(0, stock[gameId]);
    if (available < requested) shortages.push({ id: gameId, name: PRODUCTS[gameId]?.name || gameId, requested, available });
  }
  return { ok: shortages.length === 0, shortages };
}

/** Eestikeelne veateade laoseisu puudujäägi kohta. */
export function shortageMessage(shortages) {
  const parts = shortages.map((s) =>
    s.available <= 0 ? `„${s.name}“ on hetkel otsas` : `„${s.name}“ on laos ainult ${s.available} tk (ostukorvis ${s.requested} tk, komplektid kaasa arvatud)`,
  );
  return `Kahjuks ${parts.join('; ')}. Muuda ostukorvi ja proovi uuesti.`;
}

/**
 * Vähendab laoseisu makstud PÄRIS tellimuse eest — täpselt üks kord (testtellimus ei muuda midagi).
 * Laoliikumised on unikaalsed (order_id, game_id, 'sale'), seega korduv väljakutse ei
 * muuda midagi. Kõik toimub ühes lauses: liikumise lisamine + laoseisu vähendamine +
 * orders.inventory_applied_at märkimine.
 * Laoseis võib minna negatiivseks (kaks samaaegset ostu viimasele mängule) — raha on
 * siis juba makstud, seega müük salvestatakse ja haldus näeb miinust.
 * @returns {Promise<{movements:number, stock:{gameId,stock}[]}>}
 */
export async function applyInventoryForOrder(db, order) {
  const need = Object.entries(orderGameQuantities(order.items))
    .filter(([id, qty]) => GAMES.includes(id) && qty > 0)
    .map(([game_id, qty]) => ({ game_id, qty }));
  const rows = await db.query(
    `WITH need AS (
        SELECT game_id, qty FROM jsonb_to_recordset($2::jsonb) AS x(game_id text, qty int)
        WHERE EXISTS (SELECT 1 FROM orders WHERE id = $1 AND NOT is_test AND payment_status IN ('paid','partially_refunded','refunded'))
     ),
     ins AS (
        INSERT INTO inventory_movements (game_id, delta, reason, order_id, note)
        SELECT game_id, -qty, 'sale', $1, $3 FROM need
        ON CONFLICT (order_id, game_id, reason) WHERE order_id IS NOT NULL DO NOTHING
        RETURNING game_id, delta
     ),
     upd AS (
        UPDATE inventory i SET stock = i.stock + ins.delta, updated_at = now()
        FROM ins WHERE i.game_id = ins.game_id
        RETURNING i.game_id, i.stock
     ),
     mark AS (
        UPDATE orders SET inventory_applied_at = now()
        WHERE id = $1 AND inventory_applied_at IS NULL AND EXISTS (SELECT 1 FROM need)
        RETURNING id
     )
     SELECT (SELECT count(*)::int FROM ins) AS movements,
            (SELECT count(*)::int FROM mark) AS marked,
            COALESCE((SELECT json_agg(json_build_object('gameId', game_id, 'stock', stock)) FROM upd), '[]'::json) AS stock`,
    [order.id, JSON.stringify(need), `Tellimus ${order.number}`],
  );
  const r = rows[0] || {};
  return { movements: Number(r.movements) || 0, stock: Array.isArray(r.stock) ? r.stock : [] };
}

/* ---------------------------------------------------------------------------
 * Tellimuse loomine
 * ------------------------------------------------------------------------- */

/**
 * Salvestab uue tellimuse (payment_status 'pending') ja annab sellele numbri ÄGE-AAAA-NNNN.
 *
 * Number tuleb loendurist order_counters SAMAS lauses, mis tellimuse lisab: loenduri rida
 * lukustatakse (INSERT … ON CONFLICT DO UPDATE), nii et samaaegsed ostud saavad alati erinevad
 * järjestikused numbrid. Kui tellimuse lisamine ebaõnnestub, jääb ka loendur muutmata (sama
 * tehing). AAAA arvutatakse andmebaasi kellast Tallinna aja järgi (31.12 kell 23:59 Tallinnas
 * on veel vana aasta, 1.01 kell 00:00 juba uus). Number on püsiv — seda ei muudeta hiljem.
 * Igaks juhuks ei lähe loendur kunagi alla selle aasta suurima olemasoleva numbri.
 *
 * @param {object} order validateOrder() tulemus (order); summad arvutatakse siin UUESTI kataloogist.
 * @param {{locker?:{id,name,address,city}, isTest?:boolean, now?:Date|string|number|null}} [opts]
 *   locker — automaadi andmed vedaja nimekirjast (ülimuslikud kliendi omadest)
 *   isTest — testtellimus (Stripe'i testvõti või näidisrežiim): TEST-eesliide ja oma loendur
 *   now    — ainult testidele: loomise hetk andmebaasi kella asemel (aastavahetuse kontroll)
 * @returns {Promise<object>} orders rida
 */
export async function createOrder(db, order, { locker = null, isTest = false, now = null } = {}) {
  const carrier = order.shipping.carrier;
  if (!Object.prototype.hasOwnProperty.call(SHIPPING.carriers, carrier)) throw new Error(`Tundmatu vedaja: ${carrier}`);
  const totals = computeTotals(order.items, order.code, carrier);
  if (!totals.lines.length) throw new Error('Tellimuses pole ühtegi toodet');

  const ship = {
    lockerId: nullIfEmpty(locker?.id ?? order.shipping.lockerId),
    lockerName: locker?.name || order.shipping.lockerName,
    lockerAddress: nullIfEmpty(locker ? locker.address : order.shipping.lockerAddress),
    lockerCity: nullIfEmpty(locker ? locker.city : order.shipping.lockerCity),
  };

  const test = isTest === true;
  const rows = await db.query(
    `WITH clock AS (
        SELECT COALESCE($20::timestamptz, now()) AS at
     ),
     num AS (
        INSERT INTO order_counters AS c (scope, year, last_value)
        SELECT $21::text, y.year,
               COALESCE((SELECT max(o.number_seq) FROM orders o WHERE o.is_test = $22::boolean AND o.number_year = y.year), 0) + 1
        FROM (SELECT EXTRACT(YEAR FROM (clock.at AT TIME ZONE 'Europe/Tallinn'))::int AS year FROM clock) y
        ON CONFLICT (scope, year) DO UPDATE SET last_value = GREATEST(c.last_value + 1, EXCLUDED.last_value), updated_at = now()
        RETURNING c.year, c.last_value
     )
     INSERT INTO orders (
        id, number, number_year, number_seq, is_test, public_token, created_at, updated_at,
        customer_name, customer_email, customer_phone, newsletter, age_confirmed,
        items, subtotal_cents, discount_code, discount_cents, shipping_cents, total_cents, currency,
        carrier, carrier_name, locker_id, locker_name, locker_address, locker_city
     )
     SELECT
        $1, $23::text || num.year::text || '-' || lpad(num.last_value::text, GREATEST(4, length(num.last_value::text)), '0'),
        num.year, num.last_value, $22::boolean, $2, clock.at, clock.at,
        $3, $4, $5, $6, $7,
        $8::jsonb, $9, $10, $11, $12, $13, 'eur',
        $14, $15, $16, $17, $18, $19
     FROM num, clock
     RETURNING *`,
    [
      randomUUID(),
      createPublicToken(),
      order.customer.name,
      order.customer.email,
      order.customer.phone,
      order.newsletter === true,
      order.ageConfirmed === true,
      JSON.stringify(itemsSnapshot(totals)),
      totals.subtotalCents,
      totals.code,
      totals.discountCents,
      totals.shippingCents,
      totals.totalCents,
      carrier,
      SHIPPING.carriers[carrier].label,
      ship.lockerId,
      ship.lockerName,
      ship.lockerAddress,
      ship.lockerCity,
      toIso(now),
      test ? 'test' : 'live',
      test,
      `${test ? TEST_PREFIX : ''}${ORDER_PREFIX}-`,
    ],
  );
  return rows[0];
}

/** Salvestab Stripe Checkout'i sessiooni andmed tellimuse juurde. */
export async function attachCheckoutSession(db, orderId, { sessionId, url, expiresAt }) {
  return one(
    db,
    `UPDATE orders SET stripe_session_id = $2, stripe_session_url = $3, stripe_session_expires_at = $4::timestamptz, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [orderId, sessionId, url || null, toIso(expiresAt)],
  );
}

/* ---------------------------------------------------------------------------
 * Olekuüleminekud (üks lause, idempotentne)
 * ------------------------------------------------------------------------- */

const STATUS_RE = /^[a-z_]+$/;

/**
 * Üldine üleminek: UPDATE ainult lubatud lähteolekust; tagastab { transitioned, order }.
 * `fromStates` ja `status` on koodis olevad konstandid (mitte kasutaja sisend).
 */
async function transition(db, orderId, status, fromStates, extraSet = '', extraParams = []) {
  if (!STATUS_RE.test(status) || !fromStates.every((s) => STATUS_RE.test(s))) throw new Error('Vigane olek');
  const from = fromStates.map((s) => `'${s}'`).join(',');
  const rows = await db.query(
    `WITH upd AS (
        UPDATE orders SET payment_status = '${status}', updated_at = now()${extraSet ? `, ${extraSet}` : ''}
        WHERE id = $1 AND payment_status IN (${from})
        RETURNING *
     )
     SELECT true AS transitioned, upd.* FROM upd
     UNION ALL
     SELECT false AS transitioned, o.* FROM orders o WHERE o.id = $1 AND NOT EXISTS (SELECT 1 FROM upd)`,
    [String(orderId), ...extraParams],
  );
  const row = rows[0];
  if (!row) return { transitioned: false, order: null };
  const { transitioned, ...order } = row;
  return { transitioned: transitioned === true, order };
}

/**
 * Makse laekus. Lubatud olekutest pending, processing, failed, expired.
 * @param {{paymentIntentId?:string|null, amountPaid?:number|null, at?:Date|string|number|null, sessionId?:string|null}} p
 */
export function markPaid(db, orderId, { paymentIntentId = null, amountPaid = null, at = null, sessionId = null } = {}) {
  return transition(
    db,
    orderId,
    'paid',
    ['pending', 'processing', 'failed', 'expired'],
    `paid_at = COALESCE(paid_at, $4::timestamptz, now()),
     amount_paid_cents = COALESCE($3::int, amount_paid_cents, total_cents),
     stripe_payment_intent_id = COALESCE($2::text, stripe_payment_intent_id),
     stripe_session_id = COALESCE(stripe_session_id, $5::text)`,
    [paymentIntentId || null, Number.isInteger(amountPaid) ? amountPaid : null, toIso(at), sessionId || null],
  );
}

/** Makse on algatatud, aga raha pole veel laekunud (nt pangaülekanne). Ainult pending'ust. */
export function markProcessing(db, orderId, { paymentIntentId = null, sessionId = null } = {}) {
  return transition(
    db,
    orderId,
    'processing',
    ['pending'],
    `stripe_payment_intent_id = COALESCE($2::text, stripe_payment_intent_id),
     stripe_session_id = COALESCE(stripe_session_id, $3::text)`,
    [paymentIntentId || null, sessionId || null],
  );
}

/** Makse ebaõnnestus (viivitusega makseviis lükati tagasi). Ainult pending/processing'ust. */
export function markFailed(db, orderId) {
  return transition(db, orderId, 'failed', ['pending', 'processing']);
}

/** Makseleht aegus. Ainult pending/processing'ust. */
export function markExpired(db, orderId) {
  return transition(db, orderId, 'expired', ['pending', 'processing']);
}

/**
 * Tagasimakse (Stripe charge.refunded). `refundedCents` on KOGU tagastatud summa (charge.amount_refunded),
 * mitte viimane osa — seega korduv/hilinenud sündmus ei saa summat topelt lugeda.
 * @returns {Promise<{transitioned:boolean, order:object|null}>}
 */
export async function applyRefund(db, paymentIntentId, refundedCents) {
  if (!paymentIntentId || !Number.isInteger(refundedCents) || refundedCents < 0) return { transitioned: false, order: null };
  const rows = await db.query(
    `WITH target AS (
        SELECT id FROM orders WHERE stripe_payment_intent_id = $1 ORDER BY created_at DESC LIMIT 1
     ),
     upd AS (
        UPDATE orders o SET
          refunded_cents = $2::int,
          payment_status = CASE WHEN $2::int >= COALESCE(o.amount_paid_cents, o.total_cents) THEN 'refunded' ELSE 'partially_refunded' END,
          updated_at = now()
        FROM target t
        WHERE o.id = t.id AND o.payment_status IN ('paid','partially_refunded') AND $2::int > o.refunded_cents
        RETURNING o.*
     )
     SELECT true AS transitioned, upd.* FROM upd
     UNION ALL
     SELECT false AS transitioned, o.* FROM orders o JOIN target t ON t.id = o.id WHERE NOT EXISTS (SELECT 1 FROM upd)`,
    [String(paymentIntentId), refundedCents],
  );
  const row = rows[0];
  if (!row) return { transitioned: false, order: null };
  const { transitioned, ...order } = row;
  return { transitioned: transitioned === true, order };
}

/* ---------------------------------------------------------------------------
 * Ühekordsed kõrvalmõjud (meilid)
 * ------------------------------------------------------------------------- */

const FLAG_COLUMNS = new Set(['confirmation_sent_at', 'admin_notified_at']);

/**
 * "Broneerib" ühekordse tegevuse: seab veeru ajatempli ainult siis, kui see oli tühi.
 * Tagastab true, kui SELLE väljakutse broneering õnnestus (ainult siis saada meil).
 */
export async function claimOrderFlag(db, orderId, column) {
  if (!FLAG_COLUMNS.has(column)) throw new Error(`Tundmatu veerg: ${column}`);
  const rows = await db.query(`UPDATE orders SET ${column} = now() WHERE id = $1 AND ${column} IS NULL RETURNING id`, [orderId]);
  return rows.length === 1;
}

/** Vabastab broneeringu (nt meili saatmine ebaõnnestus — järgmine katse võib uuesti proovida). */
export async function releaseOrderFlag(db, orderId, column) {
  if (!FLAG_COLUMNS.has(column)) throw new Error(`Tundmatu veerg: ${column}`);
  await db.query(`UPDATE orders SET ${column} = NULL WHERE id = $1`, [orderId]);
}

/* ---------------------------------------------------------------------------
 * Avalik vaade (kinnitusleht /aitah) — ainult selle tellimuse andmed, ilma isikuandmeteta
 * ------------------------------------------------------------------------- */

export const PAYMENT_STATUS_LABELS = {
  pending: 'Ootab makset',
  processing: 'Makse on töötlemisel',
  paid: 'Makstud',
  failed: 'Makse ebaõnnestus',
  expired: 'Makseaeg sai läbi',
  refunded: 'Raha on tagastatud',
  partially_refunded: 'Raha on osaliselt tagastatud',
};

export const FULFILLMENT_STATUS_LABELS = {
  new: 'Ootab pakkimist',
  packed: 'Pakitud',
  shipped: 'Teel pakiautomaati',
  delivered: 'Kohale toimetatud',
  cancelled: 'Tühistatud',
};

/** "mari.maasikas@gmail.com" → "m***s@g***.com" (piisav äratundmiseks, aga mitte lekkimiseks). */
export function maskEmail(email) {
  const s = String(email || '');
  const at = s.lastIndexOf('@');
  if (at < 1) return '***';
  const local = Array.from(s.slice(0, at));
  const domain = s.slice(at + 1);
  const maskedLocal = local.length >= 3 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
  const labels = domain.split('.');
  const tld = labels.length > 1 ? labels.pop() : '';
  const first = Array.from(labels.join('.'))[0] || '';
  return `${maskedLocal}@${first}***${tld ? `.${tld}` : ''}`;
}

/** Eesnimi tervituseks ("Mari Maasikas" → "Mari"). */
export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/** Tellimuse read avalikuks vaateks (vana/vigase hetktõmmise korral kaitsvalt). */
export function publicItems(items) {
  return (Array.isArray(items) ? items : []).map((i) => ({
    id: String(i.id || ''),
    name: String(i.name || ''),
    qty: Number(i.qty) || 0,
    unitCents: Number(i.unitCents) || 0,
    totalCents: Number(i.totalCents) || 0,
    bundle: Boolean(i.bundle),
    includes: (Array.isArray(i.includes) ? i.includes : []).map((c) => ({ id: String(c.id), name: String(c.name), qty: Number(c.qty) || 0 })),
  }));
}

/**
 * Kinnituslehe andmed. `resumeUrl` on kaasas ainult siis, kui makse on alustamata/pooleli
 * (pending) ja Stripe'i makseleht kehtib veel vähemalt minuti.
 */
export function publicOrderView(row, { now = Date.now() } = {}) {
  const expiresAt = toIso(row.stripe_session_expires_at);
  const resumable =
    row.payment_status === 'pending' && row.stripe_session_url && expiresAt && new Date(expiresAt).getTime() - now > 60 * 1000;
  const code = row.discount_code || null;
  return {
    number: row.number,
    test: Boolean(row.is_test),
    createdAt: toIso(row.created_at),
    paymentStatus: row.payment_status,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[row.payment_status] || row.payment_status,
    paid: ['paid', 'partially_refunded', 'refunded'].includes(row.payment_status),
    paidAt: toIso(row.paid_at),
    fulfillmentStatus: row.fulfillment_status,
    fulfillmentStatusLabel: FULFILLMENT_STATUS_LABELS[row.fulfillment_status] || row.fulfillment_status,
    shippedAt: toIso(row.shipped_at),
    trackingCode: row.tracking_code || null,
    items: publicItems(row.items),
    totals: {
      subtotalCents: Number(row.subtotal_cents),
      discountCode: code,
      discountPercent: code && DISCOUNT_CODES[code] ? DISCOUNT_CODES[code] : 0,
      discountCents: Number(row.discount_cents),
      shippingCents: Number(row.shipping_cents),
      totalCents: Number(row.total_cents),
      refundedCents: Number(row.refunded_cents) || 0,
      currency: row.currency || 'eur',
    },
    shipping: {
      carrier: row.carrier,
      carrierName: row.carrier_name,
      lockerId: row.locker_id || null,
      lockerName: row.locker_name,
      lockerAddress: row.locker_address || null,
      lockerCity: row.locker_city || null,
    },
    customer: { firstName: firstName(row.customer_name), emailMasked: maskEmail(row.customer_email) },
    ...(resumable ? { resumeUrl: row.stripe_session_url, resumeExpiresAt: expiresAt } : {}),
  };
}
