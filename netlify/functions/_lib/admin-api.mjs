// Halduspaneeli API: üks marsruuter kõigile /api/admin/* päringutele + eraldi sisselogimine.
//
// TURVALISUS
//  • IGA marsruut (ka tundmatu aadress ja CSV-eksport) kontrollib ENNE midagi muud serveris
//    seanssi (requireAdmin → 401). Muutvatel päringutel kontrollitakse ka päritolu (CSRF → 403).
//    Kuna kontroll on marsruuteri alguses, ei saa uus marsruut seda kogemata vahele jätta.
//  • Ainus erand on POST /api/admin/login (sisselogimine ise) — sellel on oma kaitse:
//    päritolu kontroll, JSON-keha, kiiruspiirang (Netlify rateLimit + mälus piiraja) ja
//    väike viivitus vale parooli korral.
//  • Kõik vastused: no-store, noindex, X-Frame-Options DENY.
//
// MARSRUUDID (vt ka contractNotes / README)
//   POST  /api/admin/login                 { password } → 200 { ok, expiresAt } + küpsis age_admin
//   POST  /api/admin/logout                → 200 { ok } + küpsise tühistamine
//   GET   /api/admin/me                    → { authenticated, expiresAt, dev, labels… }
//   GET   /api/admin/orders                ?q&from&to&payment&fulfillment&sort&page&pageSize&test
//   GET   /api/admin/orders.csv            samad filtrid → CSV (UTF-8 BOM, ;)
//   GET   /api/admin/orders/:number        → { order }   (:number = ÄGE-2026-0001 URL-kodeeritult,
//                                          AGE-2026-0001, väiketähtedega või vana AGE-1001 — vastuses õige kuju)
//   PATCH /api/admin/orders/:number        { fulfillmentStatus?, trackingCode?, notes? } → { order }
//   POST  /api/admin/orders/:number/restock { confirm: true } → { order, restock }  (mängud lattu tagasi, üks kord)
//   GET   /api/admin/packing               ?test → makstud ja saatmata tellimused
//   (test=1 → ainult testtellimused; vaikimisi ainult päris tellimused)
//   GET   /api/admin/inventory             ?game → { games, movements }
//   POST  /api/admin/inventory             { gameId, mode:'delta'|'set', value, reason:'adjust'|'restock', note }
//   GET   /api/admin/withdrawals           ?status=open|received|in_progress|refunded|rejected
//   PATCH /api/admin/withdrawals/:id       { status?, adminNotes? }
//   GET   /api/admin/stats                 ?period=day|week|month|year&date=YYYY-MM-DD  või  ?from&to
//   GET   /api/admin/calendar              ?month=YYYY-MM
import { json, readTextLimited } from './http.mjs';
import { getDb } from './db.mjs';
import { PRODUCTS, GAMES } from '../../../public/assets/js/catalog.js';
import {
  ADMIN_API_HEADERS,
  authConfig,
  checkPassword,
  clearSessionCookie,
  clientIp,
  createLoginLimiter,
  createSessionToken,
  isSameOrigin,
  MAX_PASSWORD_LENGTH,
  MSG_CSRF,
  requireAdmin,
  sessionCookie,
} from './admin-auth.mjs';
import {
  FULFILLMENT_LABELS,
  FULFILLMENT_STATUSES,
  getAdminOrder,
  itemLabel,
  listOrders,
  listOrdersForExport,
  listPacking,
  normalizeNumber,
  orderDetail,
  parseOrderFilters,
  PAYMENT_LABELS,
  PAYMENT_STATUSES,
  parseTestFlag,
  SORTS,
  updateOrder,
  validateOrderPatch,
} from './admin-orders.mjs';
import { ordersToCsv } from './admin-csv.mjs';
import { applyInventoryChange, getInventory, getMovements, REASON_LABELS, restockOrder, validateInventoryChange } from './admin-inventory.mjs';
import {
  listWithdrawals,
  normalizeWithdrawalKey,
  updateWithdrawal,
  validateWithdrawalPatch,
  WITHDRAWAL_LABELS,
  WITHDRAWAL_STATUSES,
} from './admin-withdrawals.mjs';
import { computeCalendar, computeStats, fetchPaidOrders, fetchPendingShipment, METRIC_INFO, parseItems } from './stats.mjs';
import {
  addDays,
  addMonths,
  dayRange,
  diffDays,
  formatDateString,
  formatMonth,
  formatTallinn,
  isDateString,
  isMonthString,
  monthRange,
  tallinnDate,
  tallinnMonth,
  tallinnRange,
  toDate,
  weekdayOf,
  weekRange,
  yearRange,
} from './time.mjs';

export const API_PREFIX = '/api/admin';
export const MAX_JSON_BYTES = 32 * 1024;
export const MAX_STATS_DAYS = 3 * 366 + 1; // vaba vahemik kuni ~3 aastat
export const CSV_MAX_ROWS = 10000;

const MSG_BAD_JSON = 'Vigane päring (oodati JSON-i). Värskenda lehte ja proovi uuesti.';
const MSG_DB = 'Andmebaasiga ei saanud ühendust. Proovi mõne hetke pärast uuesti.';
const MSG_WRONG_PASSWORD = 'Vale parool.';

/** JSON-vastus halduse turvapäistega. */
const reply = (status, body, headers = {}) => json(status, body, { ...ADMIN_API_HEADERS, ...headers });

/** Loeb JSON-keha (Content-Type ja suuruse kontrolliga). */
async function readJson(req, maxBytes = MAX_JSON_BYTES) {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) return { error: reply(415, { error: MSG_BAD_JSON }) };
  const { text, tooLarge } = await readTextLimited(req, maxBytes);
  if (tooLarge) return { error: reply(413, { error: 'Päring on liiga suur.' }) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: reply(400, { error: MSG_BAD_JSON }) };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ===========================================================================
 * Sisselogimine
 * ======================================================================== */

/**
 * POST /api/admin/login { password }.
 * @param {{env?:object, now?:()=>Date, logger?:Console, limiter?:object, delay?:(ms:number)=>Promise<void>, failDelayMs?:()=>number}} deps
 */
export function createLoginHandler({
  env = process.env,
  now = () => new Date(),
  logger = console,
  limiter = createLoginLimiter(),
  delay = sleep,
  // Väike juhuslik viivitus vale parooli korral (aeglustab arvamist, peidab ajastuse erinevused).
  failDelayMs = () => 400 + Math.floor(Math.random() * 300),
} = {}) {
  return async function adminLogin(req, context) {
    if (req.method !== 'POST') return reply(405, { error: 'Lubatud on ainult POST-päring.' }, { Allow: 'POST' });
    // Sisselogimise CSRF ("login CSRF") vastu: ainult samalt saidilt.
    if (!isSameOrigin(req)) return reply(403, { error: MSG_CSRF, code: 'CSRF' });

    const cfg = authConfig(env);
    if (!cfg.enabled) {
      logger.warn?.(`[haldus] sisselogimine keelatud: ${cfg.reason}`);
      return reply(503, { error: `Sisselogimine on välja lülitatud. ${cfg.reason}`, code: 'NOT_CONFIGURED' });
    }

    const ip = clientIp(req, context);
    const gate = limiter.check(ip);
    if (!gate.allowed) {
      return reply(
        429,
        { error: `Liiga palju valesid katseid. Proovi uuesti ${Math.ceil(gate.retryAfterSeconds / 60)} minuti pärast.`, retryAfter: gate.retryAfterSeconds },
        { 'Retry-After': String(gate.retryAfterSeconds) },
      );
    }

    const { body, error } = await readJson(req, 4 * 1024);
    if (error) return error;
    const password = body && typeof body.password === 'string' ? body.password : '';
    if (!password) return reply(400, { error: 'Sisesta parool.', field: 'password' });
    if (password.length > MAX_PASSWORD_LENGTH) return reply(400, { error: 'Parool on liiga pikk.', field: 'password' });

    if (!checkPassword(password, cfg)) {
      limiter.fail(ip);
      logger.warn?.(`[haldus] vale parool (IP ${ip})`);
      await delay(failDelayMs());
      return reply(401, { error: MSG_WRONG_PASSWORD, field: 'password' });
    }

    limiter.reset(ip);
    const issued = now();
    const token = createSessionToken(cfg, { now: issued });
    const exp = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).exp;
    logger.log?.(`[haldus] sisselogimine (IP ${ip})`);
    return reply(200, { ok: true, expiresAt: new Date(exp * 1000).toISOString() }, { 'Set-Cookie': sessionCookie(req, token) });
  };
}

/* ===========================================================================
 * Statistika vahemik
 * ======================================================================== */

/**
 * Loeb statistika vahemiku URL-ist.
 *  • ?period=day|week|month|year&date=YYYY-MM-DD (vaikimisi: see kuu, täna)
 *  • ?from=YYYY-MM-DD&to=YYYY-MM-DD (mõlemad kaasa arvatud)
 * @returns {{ok:true, value:{from:Date,to:Date,fromDate:string,toDate:string,period:string,date?:string,label:string,prevDate?:string,nextDate?:string}} | {ok:false,error:string,field:string}}
 */
export function parseStatsRange(searchParams, { now = new Date() } = {}) {
  const from = (searchParams.get('from') || '').trim();
  const to = (searchParams.get('to') || '').trim();
  if (from || to) {
    if (!isDateString(from)) return { ok: false, error: 'Vigane alguskuupäev (oodati kujul AAAA-KK-PP).', field: 'from' };
    const end = to || from;
    if (!isDateString(end)) return { ok: false, error: 'Vigane lõppkuupäev (oodati kujul AAAA-KK-PP).', field: 'to' };
    if (end < from) return { ok: false, error: 'Lõppkuupäev on enne alguskuupäeva.', field: 'to' };
    if (diffDays(from, end) + 1 > MAX_STATS_DAYS) return { ok: false, error: 'Vahemik on liiga pikk (kuni 3 aastat).', field: 'to' };
    const r = tallinnRange(from, end);
    return {
      ok: true,
      value: { ...r, period: 'range', label: from === end ? formatDateString(from) : `${formatDateString(from)} – ${formatDateString(end)}` },
    };
  }
  const period = (searchParams.get('period') || 'month').trim();
  const date = (searchParams.get('date') || '').trim() || tallinnDate(now);
  if (!isDateString(date)) return { ok: false, error: 'Vigane kuupäev (oodati kujul AAAA-KK-PP).', field: 'date' };
  let r;
  let label;
  let prevDate;
  let nextDate;
  if (period === 'day') {
    r = dayRange(date);
    label = formatDateString(date);
    prevDate = addDays(date, -1);
    nextDate = addDays(date, 1);
  } else if (period === 'week') {
    r = weekRange(date);
    label = `${formatDateString(r.fromDate)} – ${formatDateString(r.toDate)}`;
    prevDate = addDays(r.fromDate, -7);
    nextDate = addDays(r.fromDate, 7);
  } else if (period === 'month') {
    r = monthRange(date);
    const month = date.slice(0, 7);
    label = formatMonth(month);
    prevDate = `${addMonths(month, -1)}-01`;
    nextDate = `${addMonths(month, 1)}-01`;
  } else if (period === 'year') {
    r = yearRange(date);
    label = `${date.slice(0, 4)}. aasta`;
    prevDate = `${Number(date.slice(0, 4)) - 1}-01-01`;
    nextDate = `${Number(date.slice(0, 4)) + 1}-01-01`;
  } else {
    return { ok: false, error: 'Tundmatu periood (lubatud: day, week, month, year).', field: 'period' };
  }
  const valid = (d) => (isDateString(d) ? d : null);
  return { ok: true, value: { ...r, period, date, label, prevDate: valid(prevDate), nextDate: valid(nextDate) } };
}

/** Lühike tellimuse rida statistika/kalendri päevavaate jaoks. */
function statOrderRow(r) {
  const items = parseItems(r.items);
  const paidAt = toDate(r.paid_at) || toDate(r.created_at);
  return {
    number: r.number,
    paidAt: paidAt?.toISOString() || null,
    paidAtText: formatTallinn(paidAt),
    customerName: r.customer_name,
    itemsText: items.map(itemLabel).join(', '),
    totalCents: Number(r.total_cents) || 0,
    refundedCents: Number(r.refunded_cents) || 0,
    paymentStatus: r.payment_status,
    paymentLabel: PAYMENT_LABELS[r.payment_status] || r.payment_status,
    fulfillmentStatus: r.fulfillment_status,
    fulfillmentLabel: FULFILLMENT_LABELS[r.fulfillment_status] || r.fulfillment_status,
    lockerName: r.locker_name,
  };
}

/* ===========================================================================
 * Marsruuter
 * ======================================================================== */

/**
 * @param {{env?:object, now?:()=>Date, logger?:Console, getDb?:()=>Promise<object>, login?:Function}} deps
 */
export function createAdminApi({ env = process.env, now = () => new Date(), logger = console, getDb: getDbImpl = () => getDb(env), login = null } = {}) {
  const loginHandler = login || createLoginHandler({ env, now, logger });

  /* ---------- konto ---------- */

  async function me({ session }) {
    return reply(200, {
      authenticated: true,
      expiresAt: new Date(session.exp * 1000).toISOString(),
      dev: authConfig(env).dev,
      today: tallinnDate(now()),
      labels: {
        payment: PAYMENT_LABELS,
        fulfillment: FULFILLMENT_LABELS,
        withdrawal: WITHDRAWAL_LABELS,
        inventoryReason: REASON_LABELS,
      },
      statuses: { payment: PAYMENT_STATUSES, fulfillment: FULFILLMENT_STATUSES, withdrawal: WITHDRAWAL_STATUSES },
      sorts: Object.keys(SORTS),
      games: GAMES.map((id) => ({ id, name: PRODUCTS[id]?.name || id })),
      metrics: METRIC_INFO,
    });
  }

  async function logout({ req }) {
    return reply(200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
  }

  /* ---------- tellimused ---------- */

  async function ordersList({ url }) {
    const f = parseOrderFilters(url.searchParams);
    if (!f.ok) return reply(400, { error: f.error, field: f.field });
    const db = await getDbImpl();
    const result = await listOrders(db, f.value);
    return reply(200, { ...result, filters: f.value });
  }

  async function ordersCsv({ url }) {
    const f = parseOrderFilters(url.searchParams);
    if (!f.ok) return reply(400, { error: f.error, field: f.field });
    const db = await getDbImpl();
    const rows = await listOrdersForExport(db, f.value, { limit: CSV_MAX_ROWS + 1 });
    const truncated = rows.length > CSV_MAX_ROWS;
    const csv = ordersToCsv(truncated ? rows.slice(0, CSV_MAX_ROWS) : rows);
    const today = tallinnDate(now());
    return new Response(csv, {
      status: 200,
      headers: {
        ...ADMIN_API_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="age-${f.value.test ? 'testtellimused' : 'tellimused'}-${today}.csv"`,
        'X-Content-Type-Options': 'nosniff',
        'X-Row-Count': String(Math.min(rows.length, CSV_MAX_ROWS)),
        ...(truncated ? { 'X-Truncated': 'true' } : {}),
      },
    });
  }

  async function orderGet({ match }) {
    const number = normalizeNumber(match[1]);
    if (!number) return reply(404, { error: 'Tellimust ei leitud.' });
    const db = await getDbImpl();
    const row = await getAdminOrder(db, number);
    if (!row) return reply(404, { error: 'Tellimust ei leitud.' });
    // Vastuses on alati õige number (order.number) — brauser asendab sellega aadressi (nt AGE-… → ÄGE-…).
    return reply(200, { order: orderDetail(row) });
  }

  async function orderPatch({ req, match }) {
    const number = normalizeNumber(match[1]);
    if (!number) return reply(404, { error: 'Tellimust ei leitud.' });
    const { body, error } = await readJson(req);
    if (error) return error;
    const v = validateOrderPatch(body);
    if (!v.ok) return reply(400, { error: v.error, field: v.field });
    const db = await getDbImpl();
    const result = await updateOrder(db, number, v.value, { now: now() });
    if (!result.ok) return reply(result.status, { error: result.error, field: result.field });
    logger.log?.(`[haldus] ${result.row.number}: ${Object.keys(v.value).join(', ')} muudetud${v.value.fulfillmentStatus ? ` (→ ${v.value.fulfillmentStatus})` : ''}`);
    return reply(200, { order: orderDetail(result.row) });
  }

  /**
   * „Pane mängud lattu tagasi“ — omaniku teadlik otsus (tagasimakse ega tühistamine seda ise ei tee).
   * Keha { confirm: true } (JSON) — kinnitus brauseris ja kaitse juhusliku päringu vastu.
   * Korduv klõps ei lisa midagi juurde: vastus { restock: { added: false } }.
   */
  async function orderRestock({ req, match }) {
    const number = normalizeNumber(match[1]);
    if (!number) return reply(404, { error: 'Tellimust ei leitud.' });
    const { body, error } = await readJson(req, 1024);
    if (error) return error;
    if (!body || body.confirm !== true) return reply(400, { error: 'Kinnita, et soovid selle tellimuse mängud lattu tagasi panna.', field: 'confirm' });
    const db = await getDbImpl();
    const row = await getAdminOrder(db, number);
    if (!row) return reply(404, { error: 'Tellimust ei leitud.' });
    const result = await restockOrder(db, row, { now: now() });
    if (!result.ok) return reply(result.status, { error: result.error, code: result.code });
    const fresh = (await getAdminOrder(db, row.number)) || row;
    if (result.added) logger.log?.(`[haldus] ${row.number}: mängud lattu tagasi (${result.movements} laoliikumist)`);
    return reply(200, { order: orderDetail(fresh), restock: { added: result.added, movements: result.movements, stock: result.stock } });
  }

  async function packing({ url }) {
    const test = parseTestFlag(url.searchParams.get('test'));
    if (test === null) return reply(400, { error: 'Vigane test-tellimuste valik.', field: 'test' });
    const db = await getDbImpl();
    return reply(200, await listPacking(db, { test }));
  }

  /* ---------- laoseis ---------- */

  async function inventoryGet({ url }) {
    const game = url.searchParams.get('game') || '';
    if (game && !GAMES.includes(game)) return reply(400, { error: 'Tundmatu mäng.', field: 'game' });
    const db = await getDbImpl();
    const [games, movements] = await Promise.all([getInventory(db, { now: now() }), getMovements(db, { gameId: game || null, limit: 200 })]);
    return reply(200, { games, movements, reasons: REASON_LABELS });
  }

  async function inventoryPost({ req }) {
    const { body, error } = await readJson(req);
    if (error) return error;
    const v = validateInventoryChange(body);
    if (!v.ok) return reply(400, { error: v.error, field: v.field });
    const db = await getDbImpl();
    const result = await applyInventoryChange(db, v.value);
    if (!result.ok) return reply(result.status, { error: result.error, field: result.field });
    logger.log?.(`[haldus] laoseis ${v.value.gameId}: ${result.delta > 0 ? '+' : ''}${result.delta} → ${result.stock} (${v.value.reason})`);
    const [games, movements] = await Promise.all([getInventory(db, { now: now() }), getMovements(db, { limit: 200 })]);
    return reply(200, { ok: true, stock: result.stock, delta: result.delta, games, movements, reasons: REASON_LABELS });
  }

  /* ---------- taganemised ---------- */

  async function withdrawalsList({ url }) {
    const status = (url.searchParams.get('status') || '').trim();
    if (status && status !== 'open' && status !== 'all' && !WITHDRAWAL_STATUSES.includes(status)) {
      return reply(400, { error: 'Tundmatu staatus.', field: 'status' });
    }
    const db = await getDbImpl();
    return reply(200, { ...(await listWithdrawals(db, { status: status === 'all' ? '' : status })), labels: WITHDRAWAL_LABELS });
  }

  async function withdrawalPatch({ req, match }) {
    const key = normalizeWithdrawalKey(match[1]);
    if (!key) return reply(404, { error: 'Avaldust ei leitud.' });
    const { body, error } = await readJson(req);
    if (error) return error;
    const v = validateWithdrawalPatch(body);
    if (!v.ok) return reply(400, { error: v.error, field: v.field });
    const db = await getDbImpl();
    const row = await updateWithdrawal(db, key, v.value);
    if (!row) return reply(404, { error: 'Avaldust ei leitud.' });
    return reply(200, { withdrawal: row });
  }

  /* ---------- statistika ja kalender ---------- */

  async function stats({ url }) {
    const r = parseStatsRange(url.searchParams, { now: now() });
    if (!r.ok) return reply(400, { error: r.error, field: r.field });
    const db = await getDbImpl();
    const [rows, pending] = await Promise.all([fetchPaidOrders(db, r.value.from, r.value.to), fetchPendingShipment(db, { limit: 10 })]);
    const result = computeStats(rows, r.value);
    // Lühikese vahemiku (nt kalendri päev) tellimused kaasa — päevavaate nimekirjaks.
    const orders = result.range.days <= 31 ? rows.slice(-300).reverse().map(statOrderRow) : null;
    return reply(200, {
      ...result,
      range: {
        ...result.range,
        period: r.value.period,
        date: r.value.date || null,
        label: r.value.label,
        prevDate: r.value.prevDate || null,
        nextDate: r.value.nextDate || null,
        fromUtc: r.value.from.toISOString(),
        toUtc: r.value.to.toISOString(),
      },
      pending,
      orders,
      today: tallinnDate(now()),
    });
  }

  async function calendar({ url }) {
    const month = (url.searchParams.get('month') || '').trim() || tallinnMonth(now());
    if (!isMonthString(month)) return reply(400, { error: 'Vigane kuu (oodati kujul AAAA-KK).', field: 'month' });
    const r = monthRange(month);
    const db = await getDbImpl();
    const rows = await fetchPaidOrders(db, r.from, r.to);
    const cal = computeCalendar(rows, r);
    return reply(200, {
      month,
      label: formatMonth(month),
      firstWeekday: weekdayOf(`${month}-01`),
      prevMonth: addMonths(month, -1),
      nextMonth: addMonths(month, 1),
      today: tallinnDate(now()),
      ...cal,
    });
  }

  /* ---------- marsruutide tabel ---------- */

  const ROUTES = [
    ['GET', /^\/me$/, me],
    ['POST', /^\/logout$/, logout],
    ['GET', /^\/orders$/, ordersList],
    ['GET', /^\/orders\.csv$/, ordersCsv],
    ['GET', /^\/orders\/([^/]+)$/, orderGet],
    ['PATCH', /^\/orders\/([^/]+)$/, orderPatch],
    ['POST', /^\/orders\/([^/]+)\/restock$/, orderRestock],
    ['GET', /^\/packing$/, packing],
    ['GET', /^\/inventory$/, inventoryGet],
    ['POST', /^\/inventory$/, inventoryPost],
    ['GET', /^\/withdrawals$/, withdrawalsList],
    ['PATCH', /^\/withdrawals\/([^/]+)$/, withdrawalPatch],
    ['GET', /^\/stats$/, stats],
    ['GET', /^\/calendar$/, calendar],
  ];

  return async function adminApi(req, context) {
    const url = new URL(req.url);
    let path = url.pathname.replace(/\/+$/, '');
    if (path !== API_PREFIX && !path.startsWith(`${API_PREFIX}/`)) return reply(404, { error: 'Ei leitud.' });
    path = path.slice(API_PREFIX.length) || '/';

    // Sisselogimine on ainus avalik marsruut (oma kaitsega). Tavaliselt suunab Netlify selle
    // otse funktsiooni admin-login.mjs juurde; see haru on varuks.
    if (path === '/login') return loginHandler(req, context);

    // 1) Seanss + CSRF — enne marsruudi otsimist, et ka tundmatu aadress annaks 401.
    const gate = requireAdmin(req, { env, now: now() });
    if (!gate.ok) return gate.response;

    // 2) Marsruut
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let pathMatched = false;
    for (const [m, re, handler] of ROUTES) {
      const match = re.exec(path);
      if (!match) continue;
      pathMatched = true;
      if (m !== method) continue;
      try {
        return await handler({ req, url, match, session: gate.session, context });
      } catch (err) {
        if (err?.code === 'DB_NOT_CONFIGURED' || /ECONN|fetch failed|database/i.test(String(err?.message))) {
          logger.error?.(`[haldus] andmebaas: ${err?.message || err}`);
          return reply(503, { error: MSG_DB });
        }
        logger.error?.(`[haldus] ${req.method} ${path}:`, err);
        return reply(500, { error: 'Midagi läks valesti. Proovi uuesti; kui viga kordub, vaata funktsiooni logi.' });
      }
    }
    if (pathMatched) {
      const allow = [...new Set(ROUTES.filter(([, re]) => re.test(path)).map(([m]) => m))];
      if (allow.includes('GET')) allow.push('HEAD');
      return reply(405, { error: 'Seda päringu meetodit ei toetata.' }, { Allow: allow.join(', ') });
    }
    return reply(404, { error: 'Sellist halduse aadressi pole.' });
  };
}
