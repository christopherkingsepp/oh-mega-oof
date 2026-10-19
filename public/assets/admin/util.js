// Halduspaneeli abifunktsioonid: turvaline HTML-mall, API-päringud, vormindus (Tallinna aeg).
//
// XSS-KAITSE: kogu HTML ehitatakse `html` sildiga mallist — iga ${väärtus} paotakse
// automaatselt (& < > " '). Paotamata HTML-i saab lisada ainult teadlikult `raw()` kaudu
// (kasutame seda ainult koodis endas loodud märgenduse jaoks, mitte kunagi andmete jaoks).

class SafeHtml {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
/** Teksti paotamine HTML-i jaoks. */
export const esc = (value) => String(value ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

/** Märgib koodis loodud HTML-i turvaliseks (ÄRA kasuta andmete jaoks). */
export const raw = (s) => new SafeHtml(String(s ?? ''));

function part(v) {
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

/** Mall, mis paob kõik väärtused: html`<p>${nimi}</p>`. Tagastab SafeHtml-i. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Paneb elemendi sisuks turvalise HTML-i. */
export function render(el, content) {
  el.innerHTML = content instanceof SafeHtml ? content.s : esc(content);
}

/* ---------------------------------------------------------------------------
 * API
 * ------------------------------------------------------------------------- */

export class ApiError extends Error {
  constructor(message, { status = 0, field = null, data = null } = {}) {
    super(message);
    this.status = status;
    this.field = field;
    this.data = data;
  }
}

/** Kui seanss aegub (401), saadetakse sündmus — rakendus näitab sisselogimislehte. */
function sessionExpired() {
  window.dispatchEvent(new CustomEvent('admin:unauthorized'));
}

/**
 * Päring halduse API-sse. GET-i parameetrid `params` kaudu, muutvate päringute keha `body` (JSON).
 * Küpsis (HttpOnly) läheb kaasa automaatselt; Origin-päise lisab brauser ise (CSRF-kontroll).
 */
export async function api(path, { method = 'GET', params = null, body = undefined, signal } = {}) {
  const url = new URL(`/api/admin/${path.replace(/^\//, '')}`, location.origin);
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Ühendus serveriga katkes. Kontrolli internetiühendust ja proovi uuesti.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* mitte-JSON */
  }
  if (res.status === 401) {
    sessionExpired();
    throw new ApiError(data?.error || 'Seanss on aegunud. Logi uuesti sisse.', { status: 401 });
  }
  if (!res.ok) throw new ApiError(data?.error || `Viga (${res.status}). Proovi uuesti.`, { status: res.status, field: data?.field || null, data });
  return data;
}

/* ---------------------------------------------------------------------------
 * Vormindus
 * ------------------------------------------------------------------------- */

export const TZ = 'Europe/Tallinn';
const eur = new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const num = new Intl.NumberFormat('et-EE');

/** 1750 → "17,50 €" */
export const money = (cents) => eur.format((Number(cents) || 0) / 100);
/** 175000 → "1750 €" (telgedele) */
export const moneyRound = (cents) => eur0.format(Math.round((Number(cents) || 0) / 100));
export const count = (n) => num.format(Number(n) || 0);

const dtf = new Intl.DateTimeFormat('et-EE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** ISO → "19.10.2026 14:05" Tallinna ajas. */
export function dateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' */
export function dateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return '';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

/** 'YYYY-MM-DD' + n päeva (ajavööndist sõltumatu kalendriarvutus). */
export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export const MONTHS = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];
export const MONTHS_SHORT = ['jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
export const WEEKDAYS_SHORT = ['E', 'T', 'K', 'N', 'R', 'L', 'P'];
export const WEEKDAYS = ['esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev', 'pühapäev'];

/** 'YYYY-MM' → 'okt 2026' */
export function monthShort(m) {
  const [y, mm] = String(m).split('-').map(Number);
  return `${MONTHS_SHORT[mm - 1]} ${y}`;
}

/** 'YYYY-MM-DD' → nädalapäev 0 = E … 6 = P */
export function weekdayIndex(s) {
  const [y, m, d] = s.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Olekumärgi CSS-klass. */
export function statusTone(kind, status) {
  const tones = {
    payment: { paid: 'ok', partially_refunded: 'warn', refunded: 'muted', pending: 'info', processing: 'info', failed: 'bad', expired: 'muted' },
    fulfillment: { new: 'pink', packed: 'info', shipped: 'ok', delivered: 'muted', cancelled: 'bad' },
    withdrawal: { received: 'pink', in_progress: 'info', refunded: 'ok', rejected: 'muted' },
  };
  return tones[kind]?.[status] || 'muted';
}

export function badge(kind, status, label) {
  return html`<span class="adm-badge adm-badge--${statusTone(kind, status)}">${label || status}</span>`;
}

/** Väike teade ekraani nurgas. */
export function toast(message, { tone = 'ok', duration = 3500 } = {}) {
  const region = document.querySelector('.adm-toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = `adm-toast adm-toast--${tone}`;
  el.textContent = message;
  region.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/** Debounce sisestuste jaoks. */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
