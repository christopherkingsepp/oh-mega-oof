// Kuupäevad ja kellaajad Eesti ajas (Europe/Tallinn).
//
// Andmebaasis on kõik ajad UTC-s (timestamptz). Halduses ja statistikas mõtleme aga
// Tallinna kalendripäevades: „tänane müük“ = Tallinna kesköö kuni järgmise Tallinna
// keskööni. Suveaja vahetuse päevad on 23 h (märtsi viimane pühapäev) või 25 h pikad
// (oktoobri viimane pühapäev) — seepärast EI liida me kunagi „24 tundi“, vaid arvutame
// iga kesköö UTC-hetke eraldi Intl.DateTimeFormat'i abil (sama ajavööndi andmebaas,
// mida kasutab brauser ja Node).
//
// Kuupäev = string 'YYYY-MM-DD' (kalendripäev, ajavööndita). Kuu = 'YYYY-MM'.
// Vahemik = { from: Date, to: Date } — from kaasa arvatud, to MITTE (poolavatud).

export const TZ = 'Europe/Tallinn';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Väärtus → Date (või null, kui see pole kehtiv aeg). */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Hetke osad Tallinna ajas: { year, month, day, hour, minute, second, weekday (1 = E … 7 = P) }.
 */
export function tallinnParts(value) {
  const d = toDate(value);
  if (!d) throw new TypeError('Vigane aeg');
  const out = {};
  for (const p of partsFormatter.formatToParts(d)) {
    if (p.type === 'weekday') out.weekday = WEEKDAYS[p.value];
    else if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** Tallinna ajavööndi nihe UTC suhtes minutites antud hetkel (+120 talvel, +180 suvel). */
export function tallinnOffsetMinutes(value) {
  const d = toDate(value);
  const p = tallinnParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const ms = Math.floor(d.getTime() / 1000) * 1000; // sekunditeta võrdlus
  return Math.round((asUtc - ms) / 60000);
}

const pad = (n, len = 2) => String(n).padStart(len, '0');

/** Kas string on kehtiv kalendripäev 'YYYY-MM-DD'? */
export function isDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Kas string on kehtiv kuu 'YYYY-MM'? */
export function isMonthString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && isDateString(`${s}-01`);
}

/** Hetke Tallinna kalendripäev 'YYYY-MM-DD'. */
export function tallinnDate(value = new Date()) {
  const p = tallinnParts(value);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Hetke Tallinna kuu 'YYYY-MM'. */
export function tallinnMonth(value = new Date()) {
  return tallinnDate(value).slice(0, 7);
}

/**
 * Tallinna seinakella aeg → UTC hetk (Date). Kahe sammuga: esmalt oletame praeguse nihke,
 * siis kontrollime nihet saadud hetkel (suveaja piiril võib see erineda).
 * Kesköö ei ole Eestis kunagi mitmetähenduslik ega puuduv (vahetus on kell 3/4 öösel).
 */
export function tallinnWallTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wall - tallinnOffsetMinutes(new Date(wall)) * 60000;
  const offset2 = tallinnOffsetMinutes(new Date(guess));
  guess = wall - offset2 * 60000;
  return new Date(guess);
}

/** Tallinna päeva algus (kesköö) UTC-hetkena. */
export function startOfTallinnDay(dateStr) {
  if (!isDateString(dateStr)) throw new RangeError(`Vigane kuupäev: ${dateStr}`);
  const [y, m, d] = dateStr.split('-').map(Number);
  return tallinnWallTimeToUtc(y, m, d);
}

/** Kalendripäevade liitmine (ajavööndist sõltumatu). */
export function addDays(dateStr, n) {
  if (!isDateString(dateStr)) throw new RangeError(`Vigane kuupäev: ${dateStr}`);
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Kuude liitmine kuule 'YYYY-MM'. */
export function addMonths(monthStr, n) {
  if (!isMonthString(monthStr)) throw new RangeError(`Vigane kuu: ${monthStr}`);
  const [y, m] = monthStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}`;
}

/** Nädalapäev kuupäevale: 1 = esmaspäev … 7 = pühapäev. */
export function weekdayOf(dateStr) {
  if (!isDateString(dateStr)) throw new RangeError(`Vigane kuupäev: ${dateStr}`);
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = pühapäev
  return wd === 0 ? 7 : wd;
}

/** Päevade arv kuus. */
export function daysInMonth(monthStr) {
  if (!isMonthString(monthStr)) throw new RangeError(`Vigane kuu: ${monthStr}`);
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Kuupäevavahemik (mõlemad kaasa arvatud) → UTC poolavatud vahemik
 * { from: Tallinna kesköö fromDate alguses, to: Tallinna kesköö pärast toDate'i, fromDate, toDate }.
 */
export function tallinnRange(fromDate, toDate = fromDate) {
  if (!isDateString(fromDate) || !isDateString(toDate)) throw new RangeError('Vigane kuupäev');
  if (toDate < fromDate) throw new RangeError('Vahemiku lõpp on enne algust');
  return { from: startOfTallinnDay(fromDate), to: startOfTallinnDay(addDays(toDate, 1)), fromDate, toDate };
}

/** Üks Tallinna päev. */
export const dayRange = (dateStr) => tallinnRange(dateStr, dateStr);

/** Nädal (esmaspäev–pühapäev), mis sisaldab antud päeva. */
export function weekRange(dateStr) {
  const monday = addDays(dateStr, 1 - weekdayOf(dateStr));
  return tallinnRange(monday, addDays(monday, 6));
}

/** Kalendrikuu, mis sisaldab antud päeva (või kuu 'YYYY-MM'). */
export function monthRange(dateOrMonth) {
  const month = isMonthString(dateOrMonth) ? dateOrMonth : String(dateOrMonth).slice(0, 7);
  if (!isMonthString(month)) throw new RangeError(`Vigane kuu: ${dateOrMonth}`);
  return tallinnRange(`${month}-01`, `${month}-${pad(daysInMonth(month))}`);
}

/** Kalendriaasta, mis sisaldab antud päeva. */
export function yearRange(dateStr) {
  const y = String(dateStr).slice(0, 4);
  return tallinnRange(`${y}-01-01`, `${y}-12-31`);
}

/** Kõik kuupäevad vahemikus (mõlemad otsad kaasa arvatud). */
export function datesBetween(fromDate, toDate) {
  const out = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Kõik kuud vahemikus 'YYYY-MM' (mõlemad kaasa arvatud). */
export function monthsBetween(fromDate, toDate) {
  const out = [];
  const last = toDate.slice(0, 7);
  for (let m = fromDate.slice(0, 7); m <= last; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Päevade arv kahe kuupäeva vahel (to − from). */
export function diffDays(fromDate, toDate) {
  const a = Date.UTC(...fromDate.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  const b = Date.UTC(...toDate.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  return Math.round((b - a) / 86400000);
}

/* ---------------------------------------------------------------------------
 * Vormindus (eesti tava: 19.10.2026 14:05)
 * ------------------------------------------------------------------------- */

/** 'DD.MM.YYYY HH:mm' Tallinna ajas (või '' kui aega pole). */
export function formatTallinn(value) {
  const d = toDate(value);
  if (!d) return '';
  const p = tallinnParts(d);
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** 'DD.MM.YYYY' Tallinna ajas. */
export function formatTallinnDate(value) {
  return formatTallinn(value).slice(0, 10);
}

/** 'HH:mm' Tallinna ajas. */
export function formatTallinnTime(value) {
  return formatTallinn(value).slice(11);
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' (kalendripäev, ilma ajavööndita). */
export function formatDateString(dateStr) {
  if (!isDateString(dateStr)) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export const MONTH_NAMES = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];

/** 'YYYY-MM' → 'oktoober 2026'. */
export function formatMonth(monthStr) {
  if (!isMonthString(monthStr)) return '';
  const [y, m] = monthStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
