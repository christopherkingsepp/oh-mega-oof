// Halduse laoseis: mängude laoseis, käsitsi muutmine põhjusega ja ajalugu.
//
// NB! (vt ka orders.mjs) Kui mängul pole inventory rida, loeb pood laoseisu PIIRAMATUKS —
// kassas ei kontrollita midagi. Esimene käsitsi muudatus loob rea ja sellest hetkest
// jälgitakse laoseisu päriselt (müük vähendab, otsas → kassa keeldub).
//
// Iga muudatus = üks SQL-lause (Neon HTTP-draiveril pole interaktiivseid tehinguid):
// laoseisu uuendamine + inventory_movements rida ('adjust' = parandus/inventuur,
// 'restock' = kaup juurde) tehakse koos CTE-dega.
import { PRODUCTS, GAMES } from '../../../public/assets/js/catalog.js';
import { cleanText } from './http.mjs';
import { formatTallinn, toDate } from './time.mjs';

export const REASON_LABELS = {
  sale: 'Müük',
  adjust: 'Parandus / inventuur',
  restock: 'Kaup juurde',
  return: 'Tagastus',
};
export const MANUAL_REASONS = ['adjust', 'restock'];
export const MAX_STOCK = 100000;
export const NOTE_MAX = 300;

const fail = (error, field) => ({ ok: false, error, field });
const iso = (v) => toDate(v)?.toISOString() || null;

/** Mängude laoseis (null = ei jälgita / piiramatu) + müük viimase 30 päeva jooksul. */
export async function getInventory(db, { now = new Date() } = {}) {
  const rows = await db.query('SELECT game_id, stock, updated_at FROM inventory');
  const sold = await db.query(
    `SELECT game_id, COALESCE(-sum(delta), 0)::int AS sold
     FROM inventory_movements WHERE reason = 'sale' AND created_at >= $1::timestamptz GROUP BY game_id`,
    [new Date(now.getTime() - 30 * 86400000).toISOString()],
  );
  const byId = new Map(rows.map((r) => [r.game_id, r]));
  const soldBy = new Map(sold.map((r) => [r.game_id, Number(r.sold) || 0]));
  return GAMES.map((id) => {
    const r = byId.get(id);
    return {
      id,
      name: PRODUCTS[id]?.name || id,
      tracked: Boolean(r),
      stock: r ? Number(r.stock) : null,
      updatedAt: r ? iso(r.updated_at) : null,
      updatedAtText: r ? formatTallinn(r.updated_at) : '',
      sold30d: soldBy.get(id) || 0,
    };
  });
}

/** Laoliikumiste ajalugu (uusimad ees), soovi korral ühe mängu kohta. */
export async function getMovements(db, { gameId = null, limit = 200 } = {}) {
  const params = [];
  let where = '';
  if (gameId) {
    params.push(gameId);
    where = 'WHERE m.game_id = $1';
  }
  const rows = await db.query(
    `SELECT m.id, m.game_id, m.delta, m.reason, m.order_id, m.note, m.created_at, o.number AS order_number
     FROM inventory_movements m LEFT JOIN orders o ON o.id = m.order_id
     ${where}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ${Math.max(1, Math.min(1000, Math.floor(Number(limit) || 200)))}`,
    params,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    gameId: r.game_id,
    gameName: PRODUCTS[r.game_id]?.name || r.game_id,
    delta: Number(r.delta),
    reason: r.reason,
    reasonLabel: REASON_LABELS[r.reason] || r.reason,
    orderNumber: r.order_number || null,
    note: r.note || '',
    createdAt: iso(r.created_at),
    createdAtText: formatTallinn(r.created_at),
  }));
}

/**
 * Kontrollib käsitsi muudatuse.
 * Keha: { gameId, mode: 'delta' | 'set', value: täisarv, reason: 'adjust' | 'restock', note: 'põhjus' }
 *  • delta: lisa (+5) või eemalda (−2) tükke praegusele laoseisule;
 *  • set: määra uus laoseis (nt inventuuri järel 14).
 */
export function validateInventoryChange(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Vigane päring.');
  const gameId = String(body.gameId || '');
  if (!GAMES.includes(gameId)) return fail('Tundmatu mäng.', 'gameId');
  const mode = body.mode === 'set' ? 'set' : body.mode === 'delta' ? 'delta' : null;
  if (!mode) return fail('Vali, kas muudad kogust või määrad uue laoseisu.', 'mode');
  const value = typeof body.value === 'string' && /^[+-]?\d+$/.test(body.value.trim()) ? Number(body.value) : body.value;
  if (!Number.isInteger(value)) return fail('Kogus peab olema täisarv.', 'value');
  if (mode === 'set' && (value < 0 || value > MAX_STOCK)) return fail(`Laoseis peab olema vahemikus 0–${MAX_STOCK}.`, 'value');
  if (mode === 'delta' && (value === 0 || Math.abs(value) > MAX_STOCK)) return fail('Sisesta muutus (nt 10 või -2).', 'value');
  const reason = String(body.reason || '');
  if (!MANUAL_REASONS.includes(reason)) return fail('Vali muudatuse põhjus.', 'reason');
  const note = cleanText(body.note);
  if (Array.from(note).length < 3) return fail('Kirjuta lühidalt, miks laoseisu muudad (nt „inventuur“ või „uus partii trükikojast“).', 'note');
  if (Array.from(note).length > NOTE_MAX) return fail(`Põhjus on liiga pikk (kuni ${NOTE_MAX} märki).`, 'note');
  if (reason === 'restock' && mode === 'delta' && value < 0) return fail('„Kaup juurde“ saab ainult lisada. Vähendamiseks vali „Parandus / inventuur“.', 'reason');
  return { ok: true, value: { gameId, mode, value, reason, note } };
}

/**
 * Rakendab muudatuse ühe lausega: inventory rida (luuakse vajadusel) + inventory_movements.
 * @returns {Promise<{ok:true, stock:number, delta:number, movementId:number} | {ok:false, status:number, error:string, field?:string}>}
 */
export async function applyInventoryChange(db, change) {
  const [cur] = await db.query('SELECT stock FROM inventory WHERE game_id = $1', [change.gameId]);
  const before = cur ? Number(cur.stock) : null;
  const base = before ?? 0;
  const after = change.mode === 'set' ? change.value : base + change.value;
  if (after < 0) return { ok: false, status: 400, field: 'value', error: `Laoseis ei saa minna alla nulli (praegu ${base} tk).` };
  if (after > MAX_STOCK) return { ok: false, status: 400, field: 'value', error: `Laoseis peab olema kuni ${MAX_STOCK}.` };
  if (change.mode === 'set' && before !== null && after === before) return { ok: false, status: 400, field: 'value', error: `Laoseis on juba ${before} tk.` };
  if (change.reason === 'restock' && change.mode === 'set' && after < base) {
    return { ok: false, status: 400, field: 'reason', error: '„Kaup juurde“ ei saa laoseisu vähendada. Vali „Parandus / inventuur“.' };
  }

  // delta-režiimis liidame andmebaasis (stock + delta), et samaaegne müük ei läheks kaduma;
  // valvur (WHERE … >= 0) hoiab ära miinusesse minemise ka siis, kui laoseis vahepeal muutus.
  // set-režiimis salvestame liikumiseks tegeliku erinevuse eelmisest väärtusest.
  // Kõigil alamlausetel on sama hetktõmmis, seega `prev` näeb väärtust ENNE muudatust.
  const rows = await db.query(
    `WITH prev AS (SELECT stock FROM inventory WHERE game_id = $1),
     up AS (
        INSERT INTO inventory (game_id, stock, updated_at)
        VALUES ($1, $3::int, now())
        ON CONFLICT (game_id) DO UPDATE
          SET stock = CASE WHEN $2 = 'set' THEN $3::int ELSE inventory.stock + $3::int END, updated_at = now()
          WHERE $2 = 'set' OR inventory.stock + $3::int >= 0
        RETURNING stock
     ),
     mv AS (
        INSERT INTO inventory_movements (game_id, delta, reason, note)
        SELECT $1, CASE WHEN $2 = 'set' THEN $3::int - COALESCE((SELECT stock FROM prev), 0) ELSE $3::int END, $4, $5
        WHERE EXISTS (SELECT 1 FROM up)
        RETURNING id, delta
     )
     SELECT (SELECT stock FROM up) AS stock, (SELECT delta FROM mv) AS delta, (SELECT id FROM mv) AS movement_id`,
    [change.gameId, change.mode, change.value, change.reason, change.note],
  );
  if (!rows[0] || rows[0].stock === null || rows[0].stock === undefined) {
    return { ok: false, status: 409, field: 'value', error: 'Laoseis muutus vahepeal (nt tuli tellimus). Värskenda vaadet ja proovi uuesti.' };
  }
  const r = rows[0];
  return { ok: true, stock: Number(r.stock), delta: Number(r.delta), movementId: Number(r.movement_id) };
}
