// Taganemisavaldus (/taganemine): vorm → POST /api/taganemine.
// 201 → kinnitus ekraanil (viitenumber, kättesaamise aeg Tallinna ajas, kas kinnitus läks e-postile);
// 400 {error, field} → tõstame vastava välja esile; 503 → näitame serveri teadet (sisaldab e-posti aadressi).
import { PRODUCTS } from './catalog.js';
import { esc, toast } from './layout.js';
import { SITE } from './site.js';
import { isValidEmail } from './validate.js'; // sama reegel mis serveris
import { normalizeOrderNumber, ORDER_INPUT_MAX } from './order-number.js'; // sama reegel mis serveris

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const LIMITS = { name: 100, items: 500, message: 2000 };
const ALL = 'Kogu tellimus';
const len = (s) => Array.from(s).length;

const form = $('[data-wd-form]');
const done = $('[data-wd-done]');
const alertBox = $('[data-wd-alert]');
const submit = $('[data-wd-submit]');
const submitLabel = $('[data-wd-submit-label]');
const itemsHost = $('[data-wd-items]');
const message = $('#wd-message');
const count = $('[data-wd-count]');

const FIELD = {
  name: $('#wd-name'),
  email: $('#wd-email'),
  orderNumber: $('#wd-order'),
  receivedDate: $('#wd-date'),
  message,
  confirm: $('#wd-confirm'),
};

/* ---------- Ettevõtte e-post (site.js) ---------- */
$$('[data-site-href="email"]').forEach((a) => {
  if (SITE.email) a.href = `mailto:${SITE.email}`;
});
$$('[data-site-text="email"]').forEach((a) => {
  if (SITE.email) a.textContent = SITE.email;
});

/* ---------- Kuupäev: ei tohi olla tulevikus (Tallinna aja järgi) ---------- */
const tallinnToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
FIELD.receivedDate.max = tallinnToday();

/* ---------- Tooted ---------- */
const PRODUCT_IDS = ['mida-viiu', 'oled-semu', 'vigur', 'komplekt-semu-vigur', 'komplekt-koik'].filter((id) => PRODUCTS[id]);
itemsHost.innerHTML = [
  `<label class="wd-pick wd-pick--all"><input type="checkbox" name="items" value="${esc(ALL)}" checked><span class="wd-pick__box" aria-hidden="true"></span><span class="wd-pick__name">Kogu tellimus</span></label>`,
  ...PRODUCT_IDS.map((id) => {
    const p = PRODUCTS[id];
    return `<label class="wd-pick"><input type="checkbox" name="items" value="${esc(p.name)}"><span class="wd-pick__box" aria-hidden="true"></span><img src="${esc(p.image)}" alt="" width="240" height="240" loading="lazy" decoding="async"><span class="wd-pick__name">${esc(p.name)}</span></label>`;
  }),
].join('');
const allBox = $(`input[value="${ALL}"]`, itemsHost);
itemsHost.addEventListener('change', (e) => {
  const input = e.target.closest('input[name="items"]');
  if (!input) return;
  // „Kogu tellimus“ ja üksikud mängud välistavad teineteist.
  if (input === allBox && input.checked) $$('input[name="items"]', itemsHost).forEach((i) => (i.checked = i === allBox));
  else if (input !== allBox && input.checked) allBox.checked = false;
  clearError('items');
});
const selectedItems = () => $$('input[name="items"]:checked', itemsHost).map((i) => i.value);

/* ---------- Eeltäitmine: /taganemine?tellimus=ÄGE-2026-0001 (link kinnituslehelt ja -kirjast) ---------- */
// Klient võib numbri kirjutada ka ilma Ä-ta, väiketähtedega või tühikutega (AGE 2026 1) —
// normalizeOrderNumber() teeb sellest õige kuju (ÄGE-2026-0001), sama reegel kehtib serveris.
const params = new URLSearchParams(location.search);
const pre = normalizeOrderNumber((params.get('tellimus') || '').trim().slice(0, ORDER_INPUT_MAX));
if (pre) FIELD.orderNumber.value = pre;

/* ---------- Valideerimine (sama loogika mis serveris) ---------- */

const V = {
  name(v) {
    const s = v.trim().replace(/\s+/g, ' ');
    if (len(s) < 2 || !/\p{L}/u.test(s)) return 'Sisesta oma ees- ja perekonnanimi.';
    if (len(s) > LIMITS.name) return `Nimi on liiga pikk (kuni ${LIMITS.name} märki).`;
    return '';
  },
  email(v) {
    return isValidEmail(v.trim()) ? '' : 'Kontrolli e-posti aadressi — sinna saadame avalduse kinnituse.';
  },
  orderNumber(v) {
    return normalizeOrderNumber(v) ? '' : 'Sisesta tellimuse number (nt ÄGE-2026-0001). Selle leiad tellimuse kinnituskirjast.';
  },
  receivedDate(v) {
    if (!v) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Kontrolli kauba kättesaamise kuupäeva.';
    if (v > tallinnToday()) return 'Kauba kättesaamise kuupäev ei saa olla tulevikus.';
    if (v < '2024-01-01') return 'Kontrolli kauba kättesaamise kuupäeva.';
    return '';
  },
  message(v) {
    return len(v) > LIMITS.message ? `Sõnum on liiga pikk (kuni ${LIMITS.message} märki).` : '';
  },
  confirm(checked) {
    return checked ? '' : 'Kinnita, et soovid lepingust taganeda.';
  },
};

const errorEl = (field) => $(`#${field === 'items' ? 'wd-items' : FIELD[field]?.id || `wd-${field}`}-error`);

function setError(field, msg) {
  const box = $(`[data-field="${field}"]`);
  const el = errorEl(field);
  if (el) el.textContent = msg || '';
  box?.classList.toggle('is-invalid', Boolean(msg));
  const input = FIELD[field];
  if (input) {
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}
function clearError(field) {
  setError(field, '');
}

let tried = false;
function validateField(field) {
  const input = FIELD[field];
  if (!input) return '';
  const msg = field === 'confirm' ? V.confirm(input.checked) : V[field](input.value);
  setError(field, msg);
  return msg;
}

Object.keys(FIELD).forEach((field) => {
  const input = FIELD[field];
  const ev = field === 'confirm' ? 'change' : 'blur';
  input.addEventListener(ev, () => {
    if (tried || (field !== 'confirm' && input.value.trim())) validateField(field);
  });
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') validateField(field);
  });
});
FIELD.orderNumber.addEventListener('blur', () => {
  const n = normalizeOrderNumber(FIELD.orderNumber.value);
  if (n) FIELD.orderNumber.value = n;
});

/* ---------- Sõnumi pikkus ---------- */
function updateCount() {
  const n = len(message.value);
  count.textContent = `${n} / ${LIMITS.message}`;
  count.classList.toggle('is-near', n > LIMITS.message * 0.9);
}
message.addEventListener('input', updateCount);
updateCount();

/* ---------- Teated ---------- */
function showAlert(html) {
  alertBox.innerHTML = html;
  alertBox.hidden = !html;
  if (html) alertBox.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'center' });
}
const mailLink = () => {
  const m = SITE.email || 'aarmiselt@gmail.com';
  return `<a href="mailto:${esc(m)}">${esc(m)}</a>`;
};
/** Serveri tekstis olev e-posti aadress → klikitav link (tekst ise on turvaliselt varjestatud). */
const linkify = (text) => esc(text).replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');

function setBusy(busy) {
  submit.disabled = busy;
  submit.classList.toggle('is-busy', busy);
  submit.setAttribute('aria-busy', String(busy));
  submitLabel.textContent = busy ? 'Saadan…' : 'Esita taganemisavaldus';
}

/* ---------- Kinnitus ---------- */
const WHEN_FMT = new Intl.DateTimeFormat('et-EE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Tallinn',
});
function tallinnWhen(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(WHEN_FMT.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day}. ${parts.month} ${parts.year}, kell ${parts.hour}:${parts.minute} (Tallinna aeg)`;
}

function showDone(data, sent) {
  $('[data-wd-ref]').textContent = data.reference || '—';
  $('[data-wd-when]').textContent = tallinnWhen(data.receivedAt);
  $('[data-wd-order]').textContent = sent.orderNumber;
  $('[data-wd-mail]').innerHTML = data.emailSent
    ? `Saatsime kinnituse aadressile <strong>${esc(sent.email)}</strong>.`
    : `Kinnituskirja ei õnnestunud praegu saata. <strong>Jäta viitenumber meelde</strong> (nt tee ekraanipilt) — avaldus on sellegipoolest kätte saadud.`;
  form.hidden = true;
  done.hidden = false;
  document.title = `Avaldus ${data.reference} on kätte saadud | ÄGE`;
  const card = $('[data-wd-card]');
  card.classList.add('is-done');
  card.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start' });
  $('#wd-done-title').focus({ preventScroll: true });
}

$('[data-wd-copy]').addEventListener('click', async () => {
  const ref = $('[data-wd-ref]').textContent.trim();
  try {
    await navigator.clipboard.writeText(ref);
    toast(`Viitenumber <strong>${esc(ref)}</strong> on kopeeritud.`);
  } catch {
    toast(`Viitenumber: <strong>${esc(ref)}</strong>`);
  }
});

/* ---------- Saatmine ---------- */
let sending = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;
  tried = true;
  showAlert('');
  const order = ['name', 'email', 'orderNumber', 'receivedDate', 'message', 'confirm'];
  const bad = order.filter((f) => validateField(f)); // kõik väljad korraga, mitte ainult esimene
  const firstBad = bad[0];
  const items = selectedItems();
  const itemsText = items.join(', ');
  if (len(itemsText) > LIMITS.items) setError('items', `Toodete loetelu on liiga pikk (kuni ${LIMITS.items} märki).`);
  if (firstBad) {
    FIELD[firstBad].focus();
    return;
  }

  const body = {
    name: FIELD.name.value.trim().replace(/\s+/g, ' '),
    email: FIELD.email.value.trim(),
    orderNumber: normalizeOrderNumber(FIELD.orderNumber.value),
    receivedDate: FIELD.receivedDate.value || undefined,
    items: items.length ? items : undefined,
    message: message.value.trim() || undefined,
    confirm: true,
  };

  sending = true;
  setBusy(true);
  let res = null;
  let data = null;
  try {
    res = await fetch('/api/taganemine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    data = await res.json().catch(() => null);
  } catch {
    res = null;
  }
  sending = false;
  setBusy(false);

  if (res?.status === 201 && data?.reference) {
    showDone(data, body);
    return;
  }
  if (res?.status === 400 && data?.field) {
    const field = data.field in FIELD || data.field === 'items' ? data.field : null;
    if (field) {
      setError(field, data.error || 'Kontrolli seda välja.');
      const target = field === 'items' ? $('input[name="items"]', itemsHost) : FIELD[field];
      target?.focus();
      return;
    }
  }
  if (res?.status === 429) {
    showAlert(`<p><strong>Liiga palju katseid järjest.</strong> Oota minut ja proovi uuesti või kirjuta meile ${mailLink()}.</p>`);
    return;
  }
  if (res && data?.error) {
    showAlert(`<p><strong>Avaldust ei õnnestunud saata.</strong> ${linkify(data.error)}</p>`);
    return;
  }
  showAlert(
    `<p><strong>Ühendus katkes.</strong> Proovi mõne hetke pärast uuesti. Kui see ei õnnestu, saada taganemisavaldus e-kirjaga aadressile ${mailLink()} — ka see on täiesti kehtiv.</p>`,
  );
});
