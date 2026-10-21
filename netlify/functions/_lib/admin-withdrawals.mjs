// Halduse taganemisavaldused: nimekiri ja menetluse staatuse/märkmete muutmine.
// Avaldused ise tulevad veebivormist (/api/taganemine → tabel withdrawals).
// Tellimus seotakse numbri järgi (withdrawals.order_number); vana numbri (AGE-1001) korral
// leitakse tellimus veeru legacy_number kaudu.
import { formatTallinn, formatDateString, toDate } from './time.mjs';
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from './admin-orders.mjs';

export const WITHDRAWAL_STATUSES = ['received', 'in_progress', 'refunded', 'rejected'];
export const WITHDRAWAL_LABELS = {
  received: 'Saabunud',
  in_progress: 'Menetluses',
  refunded: 'Raha tagastatud',
  rejected: 'Tagasi lükatud',
};
export const NOTES_MAX = 2000;

const fail = (error, field) => ({ ok: false, error, field });
const iso = (v) => toDate(v)?.toISOString() || null;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^TAG-[A-Z0-9]{6}$/;

function view(r) {
  // received_date on Postgresi `date`. Loeme selle SQL-is tekstina (received_date_str), sest
  // draiverid teisendavad `date` tüüpi erinevalt (PGlite: Date protsessi ajavööndis, Neon: string).
  const rawDate = r.received_date_str ?? null;
  const received = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(String(rawDate)) ? String(rawDate) : null;
  return {
    id: r.id,
    reference: r.reference,
    createdAt: iso(r.created_at),
    createdAtText: formatTallinn(r.created_at),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    orderNumber: r.order_number,
    orderFound: Boolean(r.o_number),
    orderCurrentNumber: r.o_number || null,
    orderIsTest: Boolean(r.o_is_test),
    orderPaymentLabel: r.o_payment ? PAYMENT_LABELS[r.o_payment] || r.o_payment : null,
    orderFulfillmentLabel: r.o_fulfillment ? FULFILLMENT_LABELS[r.o_fulfillment] || r.o_fulfillment : null,
    receivedDate: received,
    receivedDateText: received ? formatDateString(received) : '',
    items: r.items || '',
    message: r.message || '',
    status: r.status,
    statusLabel: WITHDRAWAL_LABELS[r.status] || r.status,
    ackSentAt: iso(r.ack_sent_at),
    adminNotes: r.admin_notes || '',
  };
}

const ORDER_JOIN = (alias) => `LEFT JOIN LATERAL (
    SELECT number AS o_number, payment_status AS o_payment, fulfillment_status AS o_fulfillment, is_test AS o_is_test
    FROM orders WHERE number = ${alias}.order_number OR legacy_number = ${alias}.order_number
    ORDER BY (number = ${alias}.order_number) DESC LIMIT 1
  ) o ON true`;

const SELECT = `SELECT w.*, w.received_date::text AS received_date_str, o.*
  FROM withdrawals w ${ORDER_JOIN('w')}`;

export async function listWithdrawals(db, { status = '' } = {}) {
  const params = [];
  let where = '';
  if (status === 'open') where = `WHERE w.status IN ('received','in_progress')`;
  else if (status && WITHDRAWAL_STATUSES.includes(status)) {
    params.push(status);
    where = 'WHERE w.status = $1';
  }
  const rows = await db.query(`${SELECT} ${where} ORDER BY w.created_at DESC LIMIT 500`, params);
  const [counts] = await db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('received','in_progress'))::int AS open FROM withdrawals`,
  );
  return { withdrawals: rows.map(view), total: counts?.total || 0, open: counts?.open || 0 };
}

export function validateWithdrawalPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Vigane päring.');
  const keys = Object.keys(body);
  const bad = keys.filter((k) => !['status', 'adminNotes'].includes(k));
  if (bad.length) return fail(`Neid välju ei saa muuta: ${bad.join(', ')}.`, bad[0]);
  if (!keys.length) return fail('Muudatusi pole.');
  const value = {};
  if ('status' in body) {
    if (!WITHDRAWAL_STATUSES.includes(body.status)) return fail('Tundmatu staatus.', 'status');
    value.status = body.status;
  }
  if ('adminNotes' in body) {
    if (typeof body.adminNotes !== 'string') return fail('Vigased märkmed.', 'adminNotes');
    // eslint-disable-next-line no-control-regex
    const n = body.adminNotes.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim();
    if (Array.from(n).length > NOTES_MAX) return fail(`Märkmed on liiga pikad (kuni ${NOTES_MAX} märki).`, 'adminNotes');
    value.adminNotes = n;
  }
  return { ok: true, value };
}

/** Avalduse tunnus URL-ist: UUID või viide TAG-XXXXXX. */
export function normalizeWithdrawalKey(value) {
  const s = String(value || '').trim();
  if (ID_RE.test(s)) return { column: 'id', value: s.toLowerCase() };
  if (REF_RE.test(s.toUpperCase())) return { column: 'reference', value: s.toUpperCase() };
  return null;
}

export async function updateWithdrawal(db, key, patch) {
  const column = key.column === 'reference' ? 'reference' : 'id';
  const rows = await db.query(
    `WITH upd AS (
        UPDATE withdrawals SET
          status = CASE WHEN $2::boolean THEN $3::text ELSE status END,
          admin_notes = CASE WHEN $4::boolean THEN $5::text ELSE admin_notes END
        WHERE ${column} = $1 RETURNING *
     )
     SELECT upd.*, upd.received_date::text AS received_date_str, o.*
     FROM upd ${ORDER_JOIN('upd')}`,
    [key.value, 'status' in patch, patch.status ?? null, 'adminNotes' in patch, patch.adminNotes ?? ''],
  );
  return rows[0] ? view(rows[0]) : null;
}
