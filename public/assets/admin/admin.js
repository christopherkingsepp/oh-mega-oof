// ÄGE halduspaneel (vanilla JS, ES-moodulid, ilma raamistikuta).
//
// Vaated: Ülevaade, Tellimused (+ detailpaneel), Pakkimine, Laoseis, Kalender, Taganemised.
// Andmed tulevad AINULT /api/admin/* kaudu (server kontrollib igal päringul seanssi).
// Kuupäevad ja kellaajad on Tallinna ajas. Kogu HTML ehitatakse `html` mallist, mis paob
// kõik andmed (XSS-kaitse) — vt util.js.
import { html, render, api, ApiError, money, moneyRound, count, dateTime, dateStr, addDays, MONTHS, WEEKDAYS_SHORT, WEEKDAYS, monthShort, weekdayIndex, badge, toast, debounce } from './util.js';
import { barChart } from './charts.js';

const view = document.getElementById('view');
const state = { me: null };
let teardown = [];
let controller = null;

const onCleanup = (fn) => teardown.push(fn);
const L = (kind, status) => state.me?.labels?.[kind]?.[status] || status;

/* ===========================================================================
 * Marsruutimine
 * ======================================================================== */

const ROUTES = [
  { re: /^\/admin\/?$/, nav: 'ulevaade', title: 'Ülevaade', render: renderOverview },
  { re: /^\/admin\/tellimused\/?$/, nav: 'tellimused', title: 'Tellimused', render: () => renderOrders() },
  { re: /^\/admin\/tellimused\/(AGE-[A-Za-z0-9]{3,12})\/?$/i, nav: 'tellimused', title: 'Tellimus', render: (m) => renderOrders({ open: m[1].toUpperCase() }) },
  { re: /^\/admin\/pakkimine\/?$/, nav: 'pakkimine', title: 'Pakkimine', render: renderPacking },
  { re: /^\/admin\/laoseis\/?$/, nav: 'laoseis', title: 'Laoseis', render: renderInventory },
  { re: /^\/admin\/kalender\/?$/, nav: 'kalender', title: 'Kalender', render: renderCalendar },
  { re: /^\/admin\/taganemised\/?$/, nav: 'taganemised', title: 'Taganemised', render: renderWithdrawals },
];

function navigate(url, { replace = false, keepScroll = false } = {}) {
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  route({ keepScroll });
}

/** Uuendab ainult aadressiriba päringuparameetreid (ilma vaadet uuesti joonistamata). */
function setQuery(params, { push = false } = {}) {
  const url = new URL(location.href);
  url.search = '';
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v);
  history[push ? 'pushState' : 'replaceState']({}, '', url.pathname + url.search);
}

function route({ keepScroll = false, focus = true } = {}) {
  teardown.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  teardown = [];
  controller?.abort();
  controller = new AbortController();

  const path = location.pathname;
  let hit = null;
  let match = null;
  for (const r of ROUTES) {
    match = r.re.exec(path);
    if (match) {
      hit = r;
      break;
    }
  }
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (hit && a.dataset.nav === hit.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (!hit) {
    document.title = 'Ei leitud | ÄGE haldus';
    render(view, html`<div class="adm-empty"><h1>Sellist lehte pole</h1><p><a href="/admin">Mine ülevaatesse →</a></p></div>`);
    return;
  }
  document.title = `${hit.title} | ÄGE haldus`;
  if (!keepScroll) window.scrollTo(0, 0);
  hit.render(match, controller.signal);
  if (focus && route.initialized) view.focus({ preventScroll: true });
  route.initialized = true;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === '_blank' || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!/^\/admin(\/|$|\?)/.test(href)) return;
  e.preventDefault();
  navigate(href);
});
window.addEventListener('popstate', () => route());

/** Vaate laadimisviga (v.a katkestatud päring). */
function showError(target, err, retry) {
  if (err?.name === 'AbortError' || err?.status === 401) return;
  render(
    target,
    html`<div class="adm-alert adm-alert--error" role="alert"><strong>Andmeid ei õnnestunud laadida.</strong> ${err?.message || 'Proovi uuesti.'}
      ${retry ? html` <button class="adm-btn adm-btn--sm adm-btn--ghost" type="button" data-retry>Proovi uuesti</button>` : ''}</div>`,
  );
  target.querySelector('[data-retry]')?.addEventListener('click', retry);
}

const loading = (text = 'Laen…') => html`<div class="adm-loading" role="status"><span class="adm-spinner" aria-hidden="true"></span>${text}</div>`;

/* ===========================================================================
 * Ülevaade
 * ======================================================================== */

const PERIODS = [
  ['day', 'Päev'],
  ['week', 'Nädal'],
  ['month', 'Kuu'],
  ['year', 'Aasta'],
  ['range', 'Vahemik'],
];

function metricValue(m) {
  return m.unit === 'cents' ? money(m.value) : count(m.value);
}

function metricTiles(stats) {
  const keys = ['netRevenueCents', 'grossSalesCents', 'shippingCents', 'refundsCents', 'orders', 'avgOrderCents', 'unitsSold', 'discountCents'];
  const byKey = Object.fromEntries(stats.metrics.map((m) => [m.key, m]));
  return html`<div class="adm-metrics">
    ${keys
      .filter((k) => byKey[k])
      .map((k, i) => {
        const m = byKey[k];
        return html`<article class="adm-metric${i === 0 ? ' adm-metric--hero' : ''}${k === 'refundsCents' && m.value > 0 ? ' adm-metric--neg' : ''}">
          <h3 class="adm-metric__label">${m.label}</h3>
          <p class="adm-metric__value">${k === 'refundsCents' && m.value > 0 ? '−' : ''}${metricValue(m)}</p>
          <p class="adm-metric__desc">${m.description}</p>
        </article>`;
      })}
  </div>`;
}

function dailyChartData(stats) {
  return stats.daily.map((d) => {
    const wd = WEEKDAYS_SHORT[weekdayIndex(d.date)];
    return {
      key: d.date,
      label: stats.daily.length > 16 ? String(Number(d.date.slice(8))) : `${wd} ${Number(d.date.slice(8))}.`,
      title: `${WEEKDAYS[weekdayIndex(d.date)]}, ${dateStr(d.date)}`,
      value: d.grossCents,
      details: [
        ['Tellimusi', count(d.orders)],
        ['Tarne', money(d.shippingCents)],
        ['Tagasimaksed', money(d.refundsCents)],
        ['Netokäive', money(d.netCents)],
      ],
    };
  });
}

function monthlyChartData(stats) {
  return stats.monthly.map((m) => ({
    key: m.month,
    label: monthShort(m.month).replace(/ \d{4}$/, (y) => (m.month.endsWith('-01') ? y : '')),
    title: `${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`,
    value: m.grossCents,
    details: [
      ['Tellimusi', count(m.orders)],
      ['Tarne', money(m.shippingCents)],
      ['Tagasimaksed', money(m.refundsCents)],
      ['Netokäive', money(m.netCents)],
    ],
  }));
}

const CHART_HEAD = ['Periood', 'Toodete müük', 'Tellimusi', 'Tarne', 'Tagasimaksed', 'Netokäive'];

function pendingList(pending, { compact = false } = {}) {
  if (!pending.count) return html`<p class="adm-muted">Kõik makstud tellimused on saadetud. 🎉</p>`;
  return html`<p class="adm-pending-sum"><strong>${count(pending.count)}</strong> ${pending.count === 1 ? 'tellimus ootab' : 'tellimust ootab'} saatmist
      <span class="adm-muted">(${count(pending.new)} pakkimata, ${count(pending.packed)} pakitud)</span></p>
    <ul class="adm-list">
      ${pending.orders.map(
        (o) => html`<li class="adm-list__row">
          <a class="adm-list__main" href="/admin/tellimused/${o.number}"><strong>${o.number}</strong> ${o.customerName}</a>
          <span class="adm-list__meta">${dateTime(o.paidAt)} · ${o.lockerName}</span>
          ${badge('fulfillment', o.fulfillmentStatus, L('fulfillment', o.fulfillmentStatus))}
        </li>`,
      )}
    </ul>
    ${compact ? '' : html`<p><a class="adm-link-arrow" href="/admin/pakkimine">Ava pakkimisvaade →</a></p>`}`;
}

function productsTable(stats) {
  if (!stats.products.length) return html`<p class="adm-muted">Selles vahemikus müüki polnud.</p>`;
  return html`<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th scope="col">Toode</th><th scope="col" class="num">Müüdud</th><th scope="col" class="num">Tellimustes</th><th scope="col" class="num">Tulu</th></tr></thead>
    <tbody>${stats.products.map(
      (p) => html`<tr><th scope="row">${p.name}${p.bundle ? html` <span class="adm-badge adm-badge--muted">komplekt</span>` : ''}</th>
        <td class="num">${count(p.qty)} tk</td><td class="num">${count(p.orders)}</td><td class="num">${money(p.revenueCents)}</td></tr>`,
    )}</tbody>
  </table></div>
  <p class="adm-note">${stats.info.products}</p>`;
}

function gamesTable(stats) {
  return html`<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th scope="col">Mäng</th><th scope="col" class="num">Ühikud kokku</th><th scope="col" class="num">Eraldi</th><th scope="col" class="num">Komplektides</th></tr></thead>
    <tbody>${stats.games.map(
      (g) => html`<tr><th scope="row">${g.name}</th><td class="num"><strong>${count(g.units)}</strong></td><td class="num">${count(g.single)}</td><td class="num">${count(g.inBundles)}</td></tr>`,
    )}</tbody>
  </table></div>
  <p class="adm-note">${stats.info.games}</p>`;
}

async function renderOverview(_m, signal) {
  const qs = new URLSearchParams(location.search);
  const today = state.me?.today;
  const st = {
    period: PERIODS.some(([p]) => p === qs.get('period')) ? qs.get('period') : 'month',
    date: /^\d{4}-\d{2}-\d{2}$/.test(qs.get('date') || '') ? qs.get('date') : today,
    from: qs.get('from') || '',
    to: qs.get('to') || '',
  };
  if (st.period === 'range' && !st.from) {
    st.from = addDays(today, -29);
    st.to = today;
  }

  render(
    view,
    html`<section class="adm-page-head">
      <div><p class="adm-eyebrow">Ülevaade</p><h1 class="adm-h1">Müük ja tellimused</h1></div>
      <div class="adm-period" role="group" aria-label="Periood">
        <div class="adm-seg" role="group" aria-label="Perioodi pikkus">
          ${PERIODS.map(([p, label]) => html`<button type="button" class="adm-seg__btn" data-period="${p}" aria-pressed="${String(p === st.period)}">${label}</button>`)}
        </div>
        <div class="adm-period__nav" data-period-nav></div>
      </div>
    </section>
    <div data-overview>${loading()}</div>`,
  );

  const navEl = view.querySelector('[data-period-nav]');
  const body = view.querySelector('[data-overview]');

  function renderNav(range) {
    if (st.period === 'range') {
      render(
        navEl,
        html`<form class="adm-range" data-range-form>
          <label><span class="adm-sr">Alates</span><input class="adm-input adm-input--sm" type="date" name="from" value="${st.from}" required></label>
          <span aria-hidden="true">–</span>
          <label><span class="adm-sr">Kuni</span><input class="adm-input adm-input--sm" type="date" name="to" value="${st.to}" required></label>
          <button class="adm-btn adm-btn--sm adm-btn--primary" type="submit">Näita</button>
        </form>`,
      );
      navEl.querySelector('[data-range-form]').addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        st.from = fd.get('from');
        st.to = fd.get('to') || st.from;
        if (st.to < st.from) [st.from, st.to] = [st.to, st.from];
        load();
      });
      return;
    }
    render(
      navEl,
      html`<button class="adm-icon-btn" type="button" data-shift="prev" aria-label="Eelmine periood" ${range?.prevDate ? '' : 'disabled'}>‹</button>
        <strong class="adm-period__label">${range?.label || '…'}</strong>
        <button class="adm-icon-btn" type="button" data-shift="next" aria-label="Järgmine periood" ${range?.nextDate ? '' : 'disabled'}>›</button>
        ${range && today && (today < range.from || today > range.to) ? html`<button class="adm-btn adm-btn--sm adm-btn--ghost" type="button" data-shift="today">Täna</button>` : ''}`,
    );
    navEl.querySelectorAll('[data-shift]').forEach((b) =>
      b.addEventListener('click', () => {
        const dir = b.dataset.shift;
        st.date = dir === 'today' ? today : dir === 'prev' ? range.prevDate : range.nextDate;
        load();
      }),
    );
  }

  view.querySelectorAll('[data-period]').forEach((b) =>
    b.addEventListener('click', () => {
      st.period = b.dataset.period;
      if (st.period === 'range' && !st.from) {
        st.from = addDays(today, -29);
        st.to = today;
      }
      view.querySelectorAll('[data-period]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      load();
    }),
  );

  let charts = [];
  onCleanup(() => charts.forEach((c) => c.destroy()));

  async function load() {
    const params = st.period === 'range' ? { from: st.from, to: st.to } : { period: st.period, date: st.date };
    setQuery(params);
    renderNav(null);
    body.classList.add('is-busy');
    try {
      const stats = await api('stats', { params, signal });
      renderNav(stats.range);
      // Päevagraafik: valitud vahemik, kui see on 7–62 päeva; muidu 30 päeva kuni vahemiku lõpuni.
      const end = stats.range.to > stats.today ? stats.today : stats.range.to;
      const days = stats.range.days;
      const dailyPromise = days >= 7 && days <= 62 ? Promise.resolve(stats) : api('stats', { params: { from: addDays(end, -29), to: end }, signal });
      const monthEnd = end.slice(0, 7);
      const [y, mo] = monthEnd.split('-').map(Number);
      const startMonth = new Date(Date.UTC(y, mo - 12, 1)).toISOString().slice(0, 10);
      const lastDay = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      const [daily, monthly] = await Promise.all([dailyPromise, api('stats', { params: { from: startMonth, to: lastDay }, signal })]);

      charts.forEach((c) => c.destroy());
      charts = [];
      render(
        body,
        html`${metricTiles(stats)}
        <div class="adm-grid-2 adm-grid-2--wide-left">
          <section class="adm-card">
            <header class="adm-card__head"><h2 class="adm-h2">Müük päevade kaupa</h2>
              <p class="adm-muted">${dateStr(daily.range.from)} – ${dateStr(daily.range.to)} · ${daily.info.daily} Klõpsa tulbal, et avada päev kalendris.</p></header>
            <div data-chart="daily"></div>
          </section>
          <section class="adm-card">
            <header class="adm-card__head"><h2 class="adm-h2">${stats.pending.label}</h2><p class="adm-muted">${stats.pending.description}</p></header>
            ${pendingList(stats.pending)}
          </section>
        </div>
        <section class="adm-card">
          <header class="adm-card__head"><h2 class="adm-h2">Müük kuude kaupa</h2>
            <p class="adm-muted">Viimased 12 kuud (${monthShort(monthly.range.from.slice(0, 7))} – ${monthShort(monthly.range.to.slice(0, 7))}) · ${monthly.info.monthly}</p></header>
          <div data-chart="monthly"></div>
        </section>
        <div class="adm-grid-2">
          <section class="adm-card"><header class="adm-card__head"><h2 class="adm-h2">Populaarsemad tooted</h2><p class="adm-muted">${stats.range.label}</p></header>${productsTable(stats)}</section>
          <section class="adm-card"><header class="adm-card__head"><h2 class="adm-h2">Müüdud mängud</h2><p class="adm-muted">${stats.range.label}</p></header>${gamesTable(stats)}
            ${stats.discountCodes.length ? html`<p class="adm-note">Sooduskoodid: ${stats.discountCodes.map((c) => `${c.code} × ${c.orders}`).join(', ')}</p>` : ''}
          </section>
        </div>`,
      );
      charts.push(
        barChart(body.querySelector('[data-chart="daily"]'), {
          data: dailyChartData(daily),
          format: moneyRound,
          ariaLabel: `Toodete müük päevade kaupa, ${dateStr(daily.range.from)} – ${dateStr(daily.range.to)}`,
          tableHead: ['Päev', ...CHART_HEAD.slice(1)],
          onSelect: (d) => navigate(`/admin/kalender?month=${d.key.slice(0, 7)}&day=${d.key}`),
        }),
        barChart(body.querySelector('[data-chart="monthly"]'), {
          data: monthlyChartData(monthly),
          format: moneyRound,
          ariaLabel: 'Toodete müük kuude kaupa, viimased 12 kuud',
          tableHead: ['Kuu', ...CHART_HEAD.slice(1)],
        }),
      );
    } catch (err) {
      showError(body, err, load);
    } finally {
      body.classList.remove('is-busy');
    }
  }
  load();
}

/* ===========================================================================
 * Tellimused
 * ======================================================================== */

const PAYMENT_FILTERS = [
  ['', 'Kõik makse olekud'],
  ['paid_any', 'Tasutud (sh tagastatud)'],
  ['paid', 'Makstud'],
  ['partially_refunded', 'Osaliselt tagastatud'],
  ['refunded', 'Raha tagastatud'],
  ['unpaid', 'Maksmata (kõik)'],
  ['pending', 'Ootab makset'],
  ['processing', 'Makse töötlemisel'],
  ['expired', 'Makseaeg läbi'],
  ['failed', 'Makse ebaõnnestus'],
];
const FULFILLMENT_FILTERS = [
  ['', 'Kõik täitmise olekud'],
  ['open', 'Saatmata (uus + pakitud)'],
  ['new', 'Uus'],
  ['packed', 'Pakitud'],
  ['shipped', 'Saadetud'],
  ['delivered', 'Kohale toimetatud'],
  ['done', 'Saadetud või kohal'],
  ['cancelled', 'Tühistatud'],
];
const SORT_OPTIONS = [
  ['created_desc', 'Uuemad ees'],
  ['created_asc', 'Vanemad ees'],
  ['total_desc', 'Suurim summa'],
  ['total_asc', 'Väikseim summa'],
  ['number_desc', 'Number ↓'],
  ['customer_asc', 'Klient A–Ü'],
];
const FILTER_KEYS = ['q', 'from', 'to', 'payment', 'fulfillment', 'sort', 'page'];

const options = (list, value) => list.map(([v, label]) => html`<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`);

function renderOrders({ open = null } = {}, signal = controller.signal) {
  const qs = new URLSearchParams(location.search);
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, qs.get(k) || '']));
  if (!f.sort) f.sort = 'created_desc';

  render(
    view,
    html`<section class="adm-page-head">
      <div><p class="adm-eyebrow">Tellimused</p><h1 class="adm-h1">Kõik tellimused</h1><p class="adm-muted" data-total>&nbsp;</p></div>
      <div class="adm-page-head__actions"><a class="adm-btn adm-btn--ghost" data-csv href="/api/admin/orders.csv" download>⬇ Lae CSV (Excel)</a></div>
    </section>
    <form class="adm-filters" data-filters role="search" aria-label="Tellimuste filtrid">
      <label class="adm-filters__search"><span class="adm-label">Otsi</span>
        <input class="adm-input" type="search" name="q" value="${f.q}" placeholder="Nr, nimi, e-post, telefon, automaat…" maxlength="100" autocomplete="off"></label>
      <button class="adm-btn adm-btn--ghost adm-btn--sm adm-filters__toggle" type="button" data-filters-toggle aria-expanded="false" aria-controls="filters-more">Filtrid</button>
      <div class="adm-filters__more" id="filters-more">
        <label><span class="adm-label">Alates</span><input class="adm-input" type="date" name="from" value="${f.from}"></label>
        <label><span class="adm-label">Kuni</span><input class="adm-input" type="date" name="to" value="${f.to}"></label>
        <label><span class="adm-label">Makse</span><select class="adm-input" name="payment">${options(PAYMENT_FILTERS, f.payment)}</select></label>
        <label><span class="adm-label">Täitmine</span><select class="adm-input" name="fulfillment">${options(FULFILLMENT_FILTERS, f.fulfillment)}</select></label>
        <label><span class="adm-label">Järjestus</span><select class="adm-input" name="sort">${options(SORT_OPTIONS, f.sort)}</select></label>
        <button class="adm-btn adm-btn--ghost adm-btn--sm adm-filters__reset" type="reset">Tühjenda filtrid</button>
      </div>
    </form>
    <p class="adm-note">Kuupäevad = tellimuse loomise aeg Tallinna aja järgi. CSV sisaldab kõiki filtritele vastavaid tellimusi (kuni 10 000).</p>
    <div data-list>${loading()}</div>
    <aside class="adm-drawer" data-drawer hidden aria-labelledby="drawer-title" role="dialog" aria-modal="false"></aside>`,
  );

  const form = view.querySelector('[data-filters]');
  const list = view.querySelector('[data-list]');
  const totalEl = view.querySelector('[data-total]');
  const csv = view.querySelector('[data-csv]');
  const drawer = view.querySelector('[data-drawer]');

  function filterParams({ withPage = true } = {}) {
    const out = {};
    for (const k of FILTER_KEYS) if (f[k] && (withPage || k !== 'page') && !(k === 'sort' && f[k] === 'created_desc') && !(k === 'page' && f[k] === '1')) out[k] = f[k];
    return out;
  }

  const toggle = form.querySelector('[data-filters-toggle]');
  toggle.addEventListener('click', () => {
    const expanded = form.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
  });

  function syncUrl() {
    const active = ['from', 'to', 'payment', 'fulfillment'].filter((k) => f[k]).length + (f.sort !== 'created_desc' ? 1 : 0);
    toggle.textContent = active ? `Filtrid · ${active}` : 'Filtrid';
    const base = open ? `/admin/tellimused/${open}` : '/admin/tellimused';
    const q = new URLSearchParams(filterParams()).toString();
    history.replaceState({}, '', q ? `${base}?${q}` : base);
    const csvQ = new URLSearchParams(filterParams({ withPage: false })).toString();
    csv.href = `/api/admin/orders.csv${csvQ ? `?${csvQ}` : ''}`;
  }

  async function loadList() {
    syncUrl();
    list.classList.add('is-busy');
    try {
      const data = await api('orders', { params: { ...filterParams(), pageSize: 25 }, signal });
      totalEl.textContent = `${count(data.total)} ${data.total === 1 ? 'tellimus' : 'tellimust'}${Object.keys(filterParams({ withPage: false })).some((k) => k !== 'sort') ? ' (filtreeritud)' : ''}`;
      if (!data.orders.length) {
        render(list, html`<div class="adm-empty"><p>Ühtegi tellimust ei leitud.</p>${Object.keys(filterParams()).length ? html`<button class="adm-btn adm-btn--ghost adm-btn--sm" type="button" data-clear>Tühjenda filtrid</button>` : ''}</div>`);
        list.querySelector('[data-clear]')?.addEventListener('click', () => form.reset());
        return;
      }
      render(
        list,
        html`<div class="adm-table-wrap"><table class="adm-table adm-table--orders adm-table--cards">
          <thead><tr>
            <th scope="col">Nr</th><th scope="col">Aeg</th><th scope="col">Klient</th><th scope="col">Tooted</th>
            <th scope="col" class="num">Summa</th><th scope="col">Makse</th><th scope="col">Täitmine</th><th scope="col">Automaat</th>
          </tr></thead>
          <tbody>${data.orders.map(
            (o) => html`<tr class="adm-row${o.number === open ? ' is-open' : ''}" data-number="${o.number}" tabindex="0" aria-label="Ava tellimus ${o.number}">
              <td data-label="Nr"><strong class="adm-mono">${o.number}</strong></td>
              <td data-label="Aeg">${o.createdAtText}</td>
              <td data-label="Klient"><span class="adm-cell-main">${o.customerName}</span><span class="adm-cell-sub">${o.customerEmail}</span></td>
              <td data-label="Tooted" class="adm-cell-items">${o.itemsText}</td>
              <td data-label="Summa" class="num"><strong>${money(o.totalCents)}</strong>${o.refundedCents ? html`<span class="adm-cell-sub">tagastatud ${money(o.refundedCents)}</span>` : ''}</td>
              <td data-label="Makse">${badge('payment', o.paymentStatus, o.paymentLabel)}</td>
              <td data-label="Täitmine">${badge('fulfillment', o.fulfillmentStatus, o.fulfillmentLabel)}</td>
              <td data-label="Automaat"><span class="adm-cell-main">${o.carrierName}</span><span class="adm-cell-sub">${o.lockerName}</span></td>
            </tr>`,
          )}</tbody>
        </table></div>
        ${data.pages > 1
          ? html`<nav class="adm-pager" aria-label="Lehekülgede valik">
              <button class="adm-btn adm-btn--ghost adm-btn--sm" type="button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>‹ Eelmine</button>
              <span>Lk ${data.page} / ${data.pages}</span>
              <button class="adm-btn adm-btn--ghost adm-btn--sm" type="button" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Järgmine ›</button>
            </nav>`
          : ''}`,
      );
      list.querySelectorAll('[data-page]').forEach((b) =>
        b.addEventListener('click', () => {
          f.page = b.dataset.page;
          loadList();
          view.scrollIntoView({ block: 'start' });
        }),
      );
    } catch (err) {
      showError(list, err, loadList);
    } finally {
      list.classList.remove('is-busy');
    }
  }

  const onInput = debounce(() => {
    f.q = form.elements.q.value.trim();
    f.page = '';
    loadList();
  }, 300);
  form.elements.q.addEventListener('input', onInput);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'q') return;
    f[e.target.name] = e.target.value;
    f.page = '';
    loadList();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    f.q = form.elements.q.value.trim();
    loadList();
  });
  form.addEventListener('reset', () => {
    setTimeout(() => {
      for (const k of FILTER_KEYS) f[k] = '';
      f.sort = 'created_desc';
      form.elements.sort.value = 'created_desc';
      loadList();
    });
  });

  // Rea klõps → detailpaneel
  function openRow(row) {
    if (!row) return;
    openDrawer(row.dataset.number, row);
  }
  list.addEventListener('click', (e) => openRow(e.target.closest('tr[data-number]')));
  list.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-number]')) {
      e.preventDefault();
      openRow(e.target);
    }
  });

  let returnFocus = null;
  function closeDrawer() {
    drawer.hidden = true;
    document.body.classList.remove('adm-drawer-open');
    open = null;
    list.querySelectorAll('tr.is-open').forEach((r) => r.classList.remove('is-open'));
    syncUrl();
    document.title = 'Tellimused | ÄGE haldus';
    const target = returnFocus && document.contains(returnFocus) ? returnFocus : null;
    target?.focus();
  }
  const onKey = (e) => {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => {
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('adm-drawer-open');
  });

  async function openDrawer(number, fromRow = null) {
    open = number;
    returnFocus = fromRow || returnFocus;
    syncUrl();
    document.title = `${number} | ÄGE haldus`;
    list.querySelectorAll('tr[data-number]').forEach((r) => r.classList.toggle('is-open', r.dataset.number === number));
    drawer.hidden = false;
    document.body.classList.add('adm-drawer-open');
    render(drawer, html`<div class="adm-drawer__panel">${loading('Laen tellimust…')}</div>`);
    try {
      const { order } = await api(`orders/${encodeURIComponent(number)}`, { signal });
      if (open !== number) return;
      renderDetail(order);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      render(
        drawer,
        html`<div class="adm-drawer__panel"><div class="adm-drawer__head"><h2 class="adm-h2" id="drawer-title">${number}</h2>
          <button class="adm-icon-btn" type="button" data-close aria-label="Sulge">✕</button></div>
          <div class="adm-alert adm-alert--error" role="alert">${err.message}</div></div>`,
      );
      drawer.querySelector('[data-close]').addEventListener('click', closeDrawer);
    }
  }

  function renderDetail(o) {
    const t = o.totals;
    const fs = o.fulfillment;
    const choices = [fs.status, ...fs.allowed];
    render(
      drawer,
      html`<div class="adm-drawer__panel">
        <div class="adm-drawer__head">
          <div>
            <p class="adm-eyebrow">Tellimus</p>
            <h2 class="adm-h2 adm-mono" id="drawer-title">${o.number}</h2>
            <p class="adm-muted">${o.createdAtText} (Tallinna aeg)</p>
            <p class="adm-badges">${badge('payment', o.payment.status, o.payment.label)} ${badge('fulfillment', fs.status, fs.label)}</p>
          </div>
          <button class="adm-icon-btn" type="button" data-close aria-label="Sulge tellimuse vaade">✕</button>
        </div>

        <section class="adm-sec">
          <h3 class="adm-h3">Klient</h3>
          <dl class="adm-dl">
            <dt>Nimi</dt><dd>${o.customerName}</dd>
            <dt>E-post</dt><dd><a href="mailto:${encodeURIComponent(o.customerEmail).replace(/%40/g, '@')}">${o.customerEmail}</a></dd>
            <dt>Telefon</dt><dd><a href="tel:${o.customerPhone.replace(/[^\d+]/g, '')}">${o.customerPhone}</a></dd>
            <dt>Uudiskiri</dt><dd>${o.newsletter ? 'Jah' : 'Ei'}</dd>
            <dt>18+ kinnitatud</dt><dd>${o.ageConfirmed ? 'Jah' : 'Ei'}</dd>
          </dl>
        </section>

        <section class="adm-sec">
          <h3 class="adm-h3">Tooted</h3>
          <ul class="adm-items">
            ${o.items.map(
              (i) => html`<li>
                <div class="adm-items__row"><span><strong>${i.name}</strong> × ${i.qty}</span><span class="num">${money(i.totalCents)}</span></div>
                <div class="adm-cell-sub">${money(i.unitCents)} / tk</div>
                ${i.bundle ? html`<ul class="adm-items__sub">${i.includes.map((c) => html`<li>${c.qty * i.qty} × ${c.name}</li>`)}</ul>` : ''}
              </li>`,
            )}
          </ul>
          <dl class="adm-sum">
            <dt>Vahesumma</dt><dd>${money(t.subtotalCents)}</dd>
            ${t.discountCents ? html`<dt>Soodustus${t.discountCode ? ` (${t.discountCode}${t.discountPercent ? ` −${t.discountPercent}%` : ''})` : ''}</dt><dd>−${money(t.discountCents)}</dd>` : ''}
            <dt>Tarne</dt><dd>${t.shippingCents ? money(t.shippingCents) : 'tasuta'}</dd>
            <dt class="adm-sum__total">Kokku</dt><dd class="adm-sum__total">${money(t.totalCents)}</dd>
            ${t.amountPaidCents !== null ? html`<dt>Makstud</dt><dd>${money(t.amountPaidCents)}</dd>` : ''}
            ${t.refundedCents ? html`<dt>Tagastatud</dt><dd class="adm-neg">−${money(t.refundedCents)}</dd>` : ''}
          </dl>
          <p class="adm-note">Mängud kokku (komplektid lahti võetuna): ${o.games.map((g) => `${g.name} × ${g.qty}`).join(', ') || '—'}</p>
        </section>

        <section class="adm-sec">
          <h3 class="adm-h3">Makse</h3>
          <dl class="adm-dl">
            <dt>Staatus</dt><dd>${o.payment.label}</dd>
            <dt>Makstud</dt><dd>${o.payment.paidAtText || '—'}</dd>
            <dt>PaymentIntent</dt><dd class="adm-mono adm-break">${o.payment.stripePaymentIntentId || '—'}</dd>
            <dt>Checkout Session</dt><dd class="adm-mono adm-break">${o.payment.stripeSessionId || '—'}</dd>
          </dl>
          ${/^https:\/\/dashboard\.stripe\.com\//.test(o.payment.stripeDashboardUrl || '')
            ? html`<p><a class="adm-link-arrow" href="${o.payment.stripeDashboardUrl}" target="_blank" rel="noopener noreferrer">Ava Stripe'i töölaual ↗</a></p>`
            : ''}
          <p class="adm-note">Makse staatus tuleb Stripe'ist ja seda siin muuta ei saa. Raha tagastamine käib Stripe'i töölaual — tagasimakse jõuab siia automaatselt.</p>
        </section>

        <section class="adm-sec">
          <h3 class="adm-h3">Tarne <span class="adm-badge adm-badge--muted">muutmatu</span></h3>
          <dl class="adm-dl">
            <dt>Operaator</dt><dd>${o.shipping.carrierName}</dd>
            <dt>Automaat</dt><dd>${o.shipping.lockerName}</dd>
            <dt>Aadress</dt><dd>${[o.shipping.lockerAddress, o.shipping.lockerCity].filter(Boolean).join(', ') || '—'}</dd>
            <dt>Automaadi ID</dt><dd class="adm-mono">${o.shipping.lockerId || '—'}</dd>
          </dl>
          <p class="adm-note">Tarne andmed salvestati tellimisel. Kui klient soovib muud automaati, lahenda see operaatori kaudu.</p>
        </section>

        <form class="adm-sec adm-form" data-edit>
          <h3 class="adm-h3">Täitmine</h3>
          <label class="adm-field"><span class="adm-label">Staatus</span>
            <select class="adm-input" name="fulfillmentStatus">${choices.map((s) => html`<option value="${s}" ${s === fs.status ? 'selected' : ''}>${L('fulfillment', s)}</option>`)}</select></label>
          ${!o.payment.paid ? html`<p class="adm-note">Maksmata tellimust ei saa pakkida ega saata.</p>` : ''}
          <label class="adm-field"><span class="adm-label">Jälgimiskood</span>
            <input class="adm-input" name="trackingCode" value="${fs.trackingCode}" maxlength="100" autocomplete="off" placeholder="nt CC123456789EE"></label>
          <label class="adm-field"><span class="adm-label">Sisemised märkmed <span class="adm-muted">(klient ei näe)</span></span>
            <textarea class="adm-input" name="notes" rows="3" maxlength="5000">${o.notes}</textarea></label>
          <p class="adm-note">Tühistamine ei tagasta raha ega muuda laoseisu automaatselt.</p>
          <p class="adm-field-error" data-error role="alert"></p>
          <button class="adm-btn adm-btn--primary" type="submit">Salvesta muudatused</button>
        </form>

        <section class="adm-sec">
          <h3 class="adm-h3">Ajalugu</h3>
          <ul class="adm-timeline">
            <li><span>Tellimus loodud</span><span>${o.createdAtText}</span></li>
            ${o.payment.paidAtText ? html`<li><span>Makse laekus</span><span>${o.payment.paidAtText}</span></li>` : ''}
            ${o.events.confirmationSentAt ? html`<li><span>Kinnituskiri kliendile</span><span>${dateTime(o.events.confirmationSentAt)}</span></li>` : ''}
            ${o.events.inventoryAppliedAt ? html`<li><span>Laoseis vähendatud</span><span>${dateTime(o.events.inventoryAppliedAt)}</span></li>` : ''}
            ${fs.packedAtText ? html`<li><span>Pakitud</span><span>${fs.packedAtText}</span></li>` : ''}
            ${fs.shippedAtText ? html`<li><span>Saadetud</span><span>${fs.shippedAtText}</span></li>` : ''}
            <li><span>Viimati muudetud</span><span>${dateTime(o.updatedAt)}</span></li>
          </ul>
        </section>
      </div>`,
    );
    drawer.querySelector('[data-close]').addEventListener('click', closeDrawer);
    drawer.querySelector('[data-close]').focus({ preventScroll: true });
    const edit = drawer.querySelector('[data-edit]');
    edit.addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = {};
      const status = edit.elements.fulfillmentStatus.value;
      const tracking = edit.elements.trackingCode.value.trim();
      const notes = edit.elements.notes.value;
      if (status !== fs.status) patch.fulfillmentStatus = status;
      if (tracking !== fs.trackingCode) patch.trackingCode = tracking;
      if (notes.trim() !== o.notes) patch.notes = notes;
      const errEl = edit.querySelector('[data-error]');
      errEl.textContent = '';
      if (!Object.keys(patch).length) {
        toast('Muudatusi polnud.', { tone: 'info' });
        return;
      }
      if (status === 'cancelled' && fs.status !== 'cancelled' && !confirm(`Tühistada tellimus ${o.number}? Raha tuleb vajadusel tagastada Stripe'i töölaual.`)) return;
      const btn = edit.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const res = await api(`orders/${encodeURIComponent(o.number)}`, { method: 'PATCH', body: patch });
        toast(`${o.number} salvestatud.`);
        renderDetail(res.order);
        loadList();
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false;
      }
    });
  }

  loadList();
  if (open) openDrawer(open);
}

/* ===========================================================================
 * Pakkimine
 * ======================================================================== */

function itemsChecklist(items) {
  return html`<ul class="adm-checklist">
    ${items.map((i) =>
      i.bundle
        ? html`<li><span class="adm-check" aria-hidden="true"></span><strong>${i.qty} × ${i.name}</strong>
            <ul>${i.includes.map((c) => html`<li><span class="adm-check" aria-hidden="true"></span>${c.qty * i.qty} × ${c.name}</li>`)}</ul></li>`
        : html`<li><span class="adm-check" aria-hidden="true"></span><strong>${i.qty} × ${i.name}</strong></li>`,
    )}
  </ul>`;
}

async function renderPacking(_m, signal) {
  render(
    view,
    html`<section class="adm-page-head">
      <div><p class="adm-eyebrow">Pakkimine</p><h1 class="adm-h1">Mida ja kuhu saata</h1>
        <p class="adm-muted">Makstud tellimused, mis on veel saatmata (vanimad ees).</p></div>
      <div class="adm-page-head__actions adm-no-print"><button class="adm-btn adm-btn--ghost" type="button" data-print>🖨 Prindi</button></div>
    </section>
    <div data-packing>${loading()}</div>`,
  );
  view.querySelector('[data-print]').addEventListener('click', () => window.print());
  const body = view.querySelector('[data-packing]');

  async function load() {
    try {
      const data = await api('packing', { signal });
      if (!data.count) {
        render(body, html`<div class="adm-empty"><p class="adm-empty__big">Kõik on teele saadetud! 🎉</p><p class="adm-muted">Uued makstud tellimused ilmuvad siia automaatselt.</p></div>`);
        return;
      }
      render(
        body,
        html`<div class="adm-pack-sum">
          <p><strong>${count(data.count)}</strong> ${data.count === 1 ? 'tellimus' : 'tellimust'} · kokku vaja:</p>
          <ul class="adm-chips">${data.games.map((g) => html`<li class="adm-chip"><strong>${g.qty}</strong> × ${g.name}</li>`)}</ul>
        </div>
        <div class="adm-pack-grid">
          ${data.orders.map(
            (o) => html`<article class="adm-pack" data-number="${o.number}">
              <header class="adm-pack__head">
                <div><h2 class="adm-h2 adm-mono"><a href="/admin/tellimused/${o.number}">${o.number}</a></h2>
                  <p class="adm-muted">Makstud ${o.paidAtText || o.createdAtText}</p></div>
                ${badge('fulfillment', o.fulfillmentStatus, o.fulfillmentLabel)}
              </header>
              ${o.paymentStatus === 'partially_refunded' ? html`<p class="adm-alert adm-alert--warn">Osaliselt tagastatud (${money(o.refundedCents)}) — kontrolli enne saatmist sisu.</p>` : ''}
              <div class="adm-pack__cols">
                <section><h3 class="adm-h3">Mida</h3>${itemsChecklist(o.items)}</section>
                <section><h3 class="adm-h3">Kuhu</h3>
                  <p class="adm-pack__to"><strong>${o.shipping.carrierName}</strong><br>${o.shipping.lockerName}
                    ${o.shipping.lockerAddress || o.shipping.lockerCity ? html`<br><span class="adm-muted">${[o.shipping.lockerAddress, o.shipping.lockerCity].filter(Boolean).join(', ')}</span>` : ''}
                    ${o.shipping.lockerId ? html`<br><span class="adm-muted">Automaadi ID: <span class="adm-mono">${o.shipping.lockerId}</span></span>` : ''}</p>
                  <h3 class="adm-h3">Kellele</h3>
                  <p>${o.customerName}<br><span class="adm-muted">${o.customerPhone} · ${o.customerEmail}</span></p>
                </section>
              </div>
              ${o.notes ? html`<p class="adm-pack__notes"><strong>Märkmed:</strong> ${o.notes}</p>` : ''}
              <form class="adm-pack__actions adm-no-print" data-ship>
                ${o.fulfillmentStatus === 'new' ? html`<button class="adm-btn adm-btn--ghost" type="button" data-packed>✓ Märgi pakituks</button>` : html`<p class="adm-muted">Pakitud ${o.packedAtText}</p>`}
                <div class="adm-pack__ship">
                  <label class="adm-sr" for="tc-${o.number}">Jälgimiskood (${o.number})</label>
                  <input class="adm-input" id="tc-${o.number}" name="trackingCode" value="${o.trackingCode}" placeholder="Jälgimiskood" maxlength="100" autocomplete="off">
                  <button class="adm-btn adm-btn--primary" type="submit">Märgi saadetuks</button>
                </div>
                <p class="adm-field-error" data-error role="alert"></p>
              </form>
            </article>`,
          )}
        </div>`,
      );
    } catch (err) {
      showError(body, err, load);
    }
  }

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-packed]');
    if (!btn) return;
    const card = btn.closest('[data-number]');
    btn.disabled = true;
    try {
      await api(`orders/${encodeURIComponent(card.dataset.number)}`, { method: 'PATCH', body: { fulfillmentStatus: 'packed' } });
      toast(`${card.dataset.number} märgitud pakituks.`);
      load();
    } catch (err) {
      card.querySelector('[data-error]').textContent = err.message;
      btn.disabled = false;
    }
  });
  body.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-ship]');
    if (!form) return;
    e.preventDefault();
    const card = form.closest('[data-number]');
    const trackingCode = form.elements.trackingCode.value.trim();
    if (!trackingCode && !confirm(`Märkida ${card.dataset.number} saadetuks ilma jälgimiskoodita?`)) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api(`orders/${encodeURIComponent(card.dataset.number)}`, { method: 'PATCH', body: { fulfillmentStatus: 'shipped', trackingCode } });
      toast(`${card.dataset.number} märgitud saadetuks.`);
      load();
    } catch (err) {
      form.querySelector('[data-error]').textContent = err.message;
      btn.disabled = false;
    }
  });
  load();
}

/* ===========================================================================
 * Laoseis
 * ======================================================================== */

async function renderInventory(_m, signal) {
  render(
    view,
    html`<section class="adm-page-head">
      <div><p class="adm-eyebrow">Laoseis</p><h1 class="adm-h1">Mängud laos</h1>
        <p class="adm-muted">Komplektid koosnevad mängudest — laoseisu peetakse ainult mängude kaupa.</p></div>
    </section>
    <div data-inv>${loading()}</div>`,
  );
  const body = view.querySelector('[data-inv]');
  let selectedGame = '';

  function draw(data) {
    const games = data.games;
    render(
      body,
      html`<div class="adm-stock-grid">
        ${games.map(
          (g) => html`<article class="adm-stock${g.tracked && g.stock <= 0 ? ' is-out' : g.tracked && g.stock <= 5 ? ' is-low' : ''}">
            <h2 class="adm-h3">${g.name}</h2>
            ${g.tracked
              ? html`<p class="adm-stock__value">${count(g.stock)} <span>tk</span></p>
                  <p class="adm-muted">${g.stock <= 0 ? 'Otsas — kassa ei luba seda tellida.' : g.stock <= 5 ? 'Hakkab otsa saama.' : 'Laos olemas.'}</p>`
              : html`<p class="adm-stock__value adm-stock__value--muted">∞</p><p class="adm-muted">Laoseisu pole sisestatud — müüki ei piirata.</p>`}
            <p class="adm-note">Müüdud viimase 30 päeva jooksul: <strong>${count(g.sold30d)} tk</strong>${g.updatedAtText ? html`<br>Muudetud ${g.updatedAtText}` : ''}</p>
          </article>`,
        )}
      </div>

      <div class="adm-grid-2 adm-grid-2--wide-right">
        <form class="adm-card adm-form" data-adjust>
          <h2 class="adm-h2">Muuda laoseisu</h2>
          <label class="adm-field"><span class="adm-label">Mäng</span>
            <select class="adm-input" name="gameId">${games.map((g) => html`<option value="${g.id}">${g.name} (${g.tracked ? `${g.stock} tk` : 'ei jälgita'})</option>`)}</select></label>
          <fieldset class="adm-field adm-radios"><legend class="adm-label">Kuidas?</legend>
            <label><input type="radio" name="mode" value="delta" checked> Lisa või eemalda (nt 10 või -2)</label>
            <label><input type="radio" name="mode" value="set"> Määra uus laoseis (inventuur)</label>
          </fieldset>
          <label class="adm-field"><span class="adm-label" data-value-label>Muutus (tk)</span>
            <input class="adm-input" name="value" type="number" inputmode="numeric" step="1" required placeholder="nt 20"></label>
          <label class="adm-field"><span class="adm-label">Põhjus</span>
            <select class="adm-input" name="reason">
              <option value="restock">${data.reasons.restock} (uus partii)</option>
              <option value="adjust">${data.reasons.adjust}</option>
            </select></label>
          <label class="adm-field"><span class="adm-label">Selgitus</span>
            <input class="adm-input" name="note" required minlength="3" maxlength="300" placeholder="nt uus partii trükikojast, inventuur, kahjustatud karp"></label>
          <p class="adm-note" data-preview></p>
          <p class="adm-field-error" data-error role="alert"></p>
          <button class="adm-btn adm-btn--primary" type="submit">Salvesta laoseis</button>
          <p class="adm-note">Esimene sisestus lülitab mängu laoseisu jälgimise sisse: iga makstud tellimus vähendab seda automaatselt ja kui laoseis on 0, ei saa seda mängu (ega seda sisaldavat komplekti) tellida.</p>
        </form>

        <section class="adm-card">
          <header class="adm-card__head adm-card__head--row"><h2 class="adm-h2">Ajalugu</h2>
            <label><span class="adm-sr">Näita mängu</span><select class="adm-input adm-input--sm" data-history-filter>
              <option value="">Kõik mängud</option>${games.map((g) => html`<option value="${g.id}" ${g.id === selectedGame ? 'selected' : ''}>${g.name}</option>`)}
            </select></label></header>
          ${data.movements.length
            ? html`<div class="adm-table-wrap"><table class="adm-table adm-table--compact adm-table--cards">
                <thead><tr><th scope="col">Aeg</th><th scope="col">Mäng</th><th scope="col" class="num">Muutus</th><th scope="col">Põhjus</th><th scope="col">Selgitus</th></tr></thead>
                <tbody>${data.movements.map(
                  (mv) => html`<tr>
                    <td data-label="Aeg">${mv.createdAtText}</td>
                    <td data-label="Mäng">${mv.gameName}</td>
                    <td data-label="Muutus" class="num"><strong class="${mv.delta < 0 ? 'adm-neg' : 'adm-pos'}">${mv.delta > 0 ? '+' : ''}${mv.delta}</strong></td>
                    <td data-label="Põhjus">${mv.reasonLabel}${mv.orderNumber ? html` <a class="adm-mono" href="/admin/tellimused/${mv.orderNumber}">${mv.orderNumber}</a>` : ''}</td>
                    <td data-label="Selgitus">${mv.note}</td>
                  </tr>`,
                )}</tbody></table></div>`
            : html`<p class="adm-muted">Laoliikumisi veel pole.</p>`}
        </section>
      </div>`,
    );

    const form = body.querySelector('[data-adjust]');
    if (selectedGame) form.elements.gameId.value = selectedGame;
    const preview = form.querySelector('[data-preview]');
    const valueLabel = form.querySelector('[data-value-label]');
    function updatePreview() {
      const g = games.find((x) => x.id === form.elements.gameId.value);
      const mode = form.elements.mode.value;
      valueLabel.textContent = mode === 'set' ? 'Uus laoseis (tk)' : 'Muutus (tk)';
      const v = Number(form.elements.value.value);
      if (form.elements.value.value === '' || !Number.isInteger(v)) {
        preview.textContent = '';
        return;
      }
      const base = g?.tracked ? g.stock : 0;
      const after = mode === 'set' ? v : base + v;
      preview.textContent = `${g?.name}: ${g?.tracked ? `${base} tk` : 'ei jälgita'} → ${after} tk${after < 0 ? ' (ei saa olla alla nulli!)' : ''}`;
    }
    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = form.querySelector('[data-error]');
      errEl.textContent = '';
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      selectedGame = form.elements.gameId.value;
      try {
        const res = await api('inventory', {
          method: 'POST',
          body: { gameId: selectedGame, mode: form.elements.mode.value, value: form.elements.value.value, reason: form.elements.reason.value, note: form.elements.note.value },
        });
        const g = res.games.find((x) => x.id === selectedGame);
        toast(`${g?.name}: laoseis nüüd ${res.stock} tk.`);
        draw(res);
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false;
      }
    });
    body.querySelector('[data-history-filter]').addEventListener('change', async (e) => {
      selectedGame = e.target.value;
      try {
        const res = await api('inventory', { params: { game: selectedGame }, signal });
        draw(res);
      } catch (err) {
        showError(body, err, load);
      }
    });
  }

  async function load() {
    try {
      draw(await api('inventory', { params: { game: selectedGame }, signal }));
    } catch (err) {
      showError(body, err, load);
    }
  }
  load();
}

/* ===========================================================================
 * Kalender
 * ======================================================================== */

async function renderCalendar(_m, signal) {
  const qs = new URLSearchParams(location.search);
  const today = state.me?.today;
  let month = /^\d{4}-\d{2}$/.test(qs.get('month') || '') ? qs.get('month') : today.slice(0, 7);
  let day = /^\d{4}-\d{2}-\d{2}$/.test(qs.get('day') || '') ? qs.get('day') : null;

  render(
    view,
    html`<section class="adm-page-head">
      <div><p class="adm-eyebrow">Kalender</p><h1 class="adm-h1">Müük päevade kaupa</h1>
        <p class="adm-muted">Iga päeva tasutud tellimused ja summa (makse laekumise aja järgi, Tallinna aeg). Klõpsa päeval, et näha selle tellimusi ja statistikat.</p></div>
    </section>
    <section class="adm-card" data-cal>${loading()}</section>
    <section data-day aria-live="polite"></section>`,
  );
  const cal = view.querySelector('[data-cal]');
  const dayEl = view.querySelector('[data-day]');

  async function loadMonth() {
    setQuery({ month, day });
    cal.classList.add('is-busy');
    try {
      const data = await api('calendar', { params: { month }, signal });
      const max = data.maxPaidCents || 0;
      const level = (c) => (!c || !max ? 0 : Math.min(4, Math.max(1, Math.ceil((c / max) * 4))));
      const blanks = Array.from({ length: data.firstWeekday - 1 });
      render(
        cal,
        html`<header class="adm-cal__head">
          <button class="adm-icon-btn" type="button" data-month="${data.prevMonth}" aria-label="Eelmine kuu">‹</button>
          <h2 class="adm-h2 adm-cal__title">${data.label}</h2>
          <button class="adm-icon-btn" type="button" data-month="${data.nextMonth}" aria-label="Järgmine kuu">›</button>
          ${month !== today.slice(0, 7) ? html`<button class="adm-btn adm-btn--ghost adm-btn--sm" type="button" data-month="${today.slice(0, 7)}">Täna</button>` : ''}
          <p class="adm-cal__totals"><strong>${count(data.totals.orders)}</strong> tasutud tellimust · <strong>${money(data.totals.paidCents)}</strong> laekunud</p>
        </header>
        <div class="adm-cal" role="group" aria-label="${data.label}">
          <div class="adm-cal__row adm-cal__row--head" aria-hidden="true">${WEEKDAYS_SHORT.map((w, i) => html`<div class="adm-cal__wd" title="${WEEKDAYS[i]}">${w}</div>`)}</div>
          <div class="adm-cal__grid">
            ${blanks.map(() => html`<div class="adm-cal__blank" aria-hidden="true"></div>`)}
            ${data.days.map((d) => {
              const n = Number(d.date.slice(8));
              const label = `${n}. ${MONTHS[Number(d.date.slice(5, 7)) - 1]}: ${d.orders ? `${d.orders} ${d.orders === 1 ? 'tellimus' : 'tellimust'}, ${money(d.paidCents)}` : 'tellimusi pole'}`;
              return html`<button type="button" class="adm-cal__day adm-heat-${level(d.paidCents)}${d.date === today ? ' is-today' : ''}${d.date === day ? ' is-selected' : ''}${d.date > today ? ' is-future' : ''}"
                data-day="${d.date}" aria-label="${label}" aria-pressed="${String(d.date === day)}">
                <span class="adm-cal__n">${n}</span>
                ${d.orders ? html`<span class="adm-cal__orders">${d.orders}<span class="adm-hide-sm"> ${d.orders === 1 ? 'tellimus' : 'tellimust'}</span></span><span class="adm-cal__sum">${moneyRound(d.paidCents)}</span>` : ''}
              </button>`;
            })}
          </div>
        </div>
        <p class="adm-note">${data.info.orders} Summa: ${data.info.paidCents} Mida tumedam roosa, seda suurem päeva müük.</p>`,
      );
      cal.querySelectorAll('[data-month]').forEach((b) =>
        b.addEventListener('click', () => {
          month = b.dataset.month;
          day = null;
          dayEl.replaceChildren();
          loadMonth();
        }),
      );
      cal.querySelectorAll('[data-day]').forEach((b) =>
        b.addEventListener('click', () => {
          day = b.dataset.day;
          cal.querySelectorAll('[data-day]').forEach((x) => {
            x.classList.toggle('is-selected', x === b);
            x.setAttribute('aria-pressed', String(x === b));
          });
          setQuery({ month, day });
          loadDay();
        }),
      );
      if (day && day.startsWith(month)) loadDay();
    } catch (err) {
      showError(cal, err, loadMonth);
    } finally {
      cal.classList.remove('is-busy');
    }
  }

  async function loadDay() {
    render(dayEl, html`<div class="adm-card">${loading('Laen päeva…')}</div>`);
    try {
      const s = await api('stats', { params: { period: 'day', date: day }, signal });
      const keys = ['orders', 'grossSalesCents', 'shippingCents', 'refundsCents', 'netRevenueCents', 'avgOrderCents', 'unitsSold'];
      const byKey = Object.fromEntries(s.metrics.map((m) => [m.key, m]));
      render(
        dayEl,
        html`<div class="adm-card">
          <header class="adm-card__head"><p class="adm-eyebrow">${WEEKDAYS[weekdayIndex(day)]}</p><h2 class="adm-h2">${dateStr(day)}</h2></header>
          <div class="adm-metrics adm-metrics--compact">
            ${keys.map((k) => html`<article class="adm-metric" title="${byKey[k].description}"><h3 class="adm-metric__label">${byKey[k].label}</h3><p class="adm-metric__value">${metricValue(byKey[k])}</p></article>`)}
          </div>
          ${s.orders?.length
            ? html`<h3 class="adm-h3">Selle päeva tasutud tellimused</h3>
              <ul class="adm-list">${s.orders.map(
                (o) => html`<li class="adm-list__row">
                  <a class="adm-list__main" href="/admin/tellimused/${o.number}"><strong class="adm-mono">${o.number}</strong> ${o.customerName}</a>
                  <span class="adm-list__meta">${o.paidAtText.slice(11)} · ${o.itemsText}</span>
                  <span class="adm-list__amount">${money(o.totalCents)}</span>
                  ${badge('fulfillment', o.fulfillmentStatus, o.fulfillmentLabel)}
                </li>`,
              )}</ul>
              ${s.products.length ? html`<h3 class="adm-h3">Tooted</h3>${productsTable(s)}` : ''}`
            : html`<p class="adm-muted">Sel päeval tasutud tellimusi polnud.</p>`}
        </div>`,
      );
      dayEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    } catch (err) {
      showError(dayEl, err, loadDay);
    }
  }
  loadMonth();
}

/* ===========================================================================
 * Taganemised
 * ======================================================================== */

const WITHDRAWAL_FILTERS = [
  ['open', 'Avatud'],
  ['all', 'Kõik'],
  ['received', 'Saabunud'],
  ['in_progress', 'Menetluses'],
  ['refunded', 'Raha tagastatud'],
  ['rejected', 'Tagasi lükatud'],
];

async function renderWithdrawals(_m, signal) {
  const qs = new URLSearchParams(location.search);
  let status = WITHDRAWAL_FILTERS.some(([v]) => v === qs.get('status')) ? qs.get('status') : 'open';
  render(
    view,
    html`<section class="adm-page-head">
      <div><p class="adm-eyebrow">Taganemised</p><h1 class="adm-h1">Taganemisavaldused</h1>
        <p class="adm-muted">Seadusjärgne 14-päevane taganemisõigus. Raha (sh algne tavatarne) tuleb tagastada 14 päeva jooksul avalduse saamisest; võid oodata, kuni kaup on tagasi jõudnud. Tagasimakse tee Stripe'i töölaual.</p></div>
    </section>
    <div class="adm-seg adm-seg--scroll" role="group" aria-label="Avalduste filter">
      ${WITHDRAWAL_FILTERS.map(([v, label]) => html`<button type="button" class="adm-seg__btn" data-status="${v}" aria-pressed="${String(v === status)}">${label}</button>`)}
    </div>
    <div data-wd>${loading()}</div>`,
  );
  const body = view.querySelector('[data-wd]');
  view.querySelectorAll('[data-status]').forEach((b) =>
    b.addEventListener('click', () => {
      status = b.dataset.status;
      view.querySelectorAll('[data-status]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      load();
    }),
  );

  function card(w) {
    const deadline = w.createdAt ? addDays(new Date(w.createdAt).toISOString().slice(0, 10), 14) : null;
    const open = w.status === 'received' || w.status === 'in_progress';
    const overdue = open && deadline && deadline < state.me.today;
    return html`<article class="adm-wd${overdue ? ' is-overdue' : ''}" data-id="${w.id}">
      <header class="adm-wd__head">
        <div><h2 class="adm-h2 adm-mono">${w.reference}</h2><p class="adm-muted">Saabus ${w.createdAtText}</p></div>
        ${badge('withdrawal', w.status, w.statusLabel)}
      </header>
      ${open && deadline ? html`<p class="adm-alert ${overdue ? 'adm-alert--error' : 'adm-alert--info'}">Raha tagastamise tähtaeg: <strong>${dateStr(deadline)}</strong>${overdue ? ' — tähtaeg on möödas!' : ''}</p>` : ''}
      <dl class="adm-dl">
        <dt>Klient</dt><dd>${w.customerName}<br><a href="mailto:${w.customerEmail}">${w.customerEmail}</a></dd>
        <dt>Tellimus</dt><dd>${w.orderFound
          ? html`<a class="adm-mono" href="/admin/tellimused/${w.orderNumber}">${w.orderNumber}</a> <span class="adm-muted">(${w.orderPaymentLabel}, ${w.orderFulfillmentLabel})</span>`
          : html`<span class="adm-mono">${w.orderNumber}</span> <span class="adm-badge adm-badge--warn">ei leitud</span>`}</dd>
        <dt>Kauba kättesaamine</dt><dd>${w.receivedDateText || '—'}</dd>
        <dt>Tooted</dt><dd>${w.items || '—'}</dd>
        ${w.message ? html`<dt>Sõnum</dt><dd class="adm-prewrap">${w.message}</dd>` : ''}
        <dt>Kinnituskiri</dt><dd>${w.ackSentAt ? `saadetud ${dateTime(w.ackSentAt)}` : 'jäi saatmata (vaata meili seadistust)'}</dd>
      </dl>
      <form class="adm-form adm-wd__form" data-wd-form>
        <label class="adm-field"><span class="adm-label">Staatus</span>
          <select class="adm-input" name="status">${Object.entries(state.me.labels.withdrawal).map(([v, label]) => html`<option value="${v}" ${v === w.status ? 'selected' : ''}>${label}</option>`)}</select></label>
        <label class="adm-field"><span class="adm-label">Märkmed <span class="adm-muted">(klient ei näe)</span></span>
          <textarea class="adm-input" name="adminNotes" rows="2" maxlength="2000">${w.adminNotes}</textarea></label>
        <p class="adm-field-error" data-error role="alert"></p>
        <button class="adm-btn adm-btn--primary adm-btn--sm" type="submit">Salvesta</button>
      </form>
    </article>`;
  }

  async function load() {
    setQuery(status === 'open' ? {} : { status });
    try {
      const data = await api('withdrawals', { params: { status }, signal });
      if (!data.withdrawals.length) {
        render(body, html`<div class="adm-empty"><p>${status === 'open' ? 'Avatud avaldusi pole.' : 'Avaldusi ei leitud.'}</p><p class="adm-muted">Kokku ${count(data.total)} avaldust, neist avatud ${count(data.open)}.</p></div>`);
        return;
      }
      render(body, html`<p class="adm-muted">Kokku ${count(data.total)} avaldust, neist avatud ${count(data.open)}.</p><div class="adm-wd-grid">${data.withdrawals.map(card)}</div>`);
    } catch (err) {
      showError(body, err, load);
    }
  }
  body.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-wd-form]');
    if (!form) return;
    e.preventDefault();
    const art = form.closest('[data-id]');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api(`withdrawals/${encodeURIComponent(art.dataset.id)}`, { method: 'PATCH', body: { status: form.elements.status.value, adminNotes: form.elements.adminNotes.value } });
      toast(`${res.withdrawal.reference} salvestatud.`);
      art.outerHTML = card(res.withdrawal).s;
    } catch (err) {
      form.querySelector('[data-error]').textContent = err.message;
      btn.disabled = false;
    }
  });
  load();
}

/* ===========================================================================
 * Käivitus, seanss ja väljalogimine
 * ======================================================================== */

let expiredShown = false;
function showExpired() {
  if (expiredShown) return;
  expiredShown = true;
  const box = document.createElement('div');
  box.className = 'adm-expired';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-labelledby', 'exp-title');
  render(
    box,
    html`<div class="adm-expired__panel"><h2 class="adm-h2" id="exp-title">Seanss on lõppenud</h2>
      <p>Turvalisuse huvides logitakse halduspaneelist 12 tunni pärast välja. Logi uuesti sisse — pooleli olevad muudatused tuleb uuesti teha.</p>
      <button class="adm-btn adm-btn--primary" type="button">Logi uuesti sisse</button></div>`,
  );
  box.querySelector('button').addEventListener('click', () => location.reload());
  document.body.append(box);
  box.querySelector('button').focus();
}
window.addEventListener('admin:unauthorized', showExpired);

document.querySelector('[data-logout]')?.addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  try {
    await api('logout', { method: 'POST' });
  } catch {
    /* ka vea korral suuname sisselogimislehele */
  }
  location.replace('/admin');
});

async function start() {
  try {
    state.me = await api('me');
  } catch (err) {
    if (err?.status !== 401) render(view, html`<div class="adm-alert adm-alert--error" role="alert">Halduspaneeli ei õnnestunud käivitada: ${err.message}</div>`);
    return;
  }
  const ms = new Date(state.me.expiresAt).getTime() - Date.now();
  if (ms > 0) setTimeout(showExpired, Math.min(ms, 2 ** 31 - 1));
  route({ focus: false });
}

export { ApiError };
start();
