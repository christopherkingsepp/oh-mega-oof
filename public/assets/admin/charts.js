// Halduspaneeli graafikud: SVG tulpdiagramm (päeva- ja kuupõhine müük).
//
// Üks seeria → üks värv (brändi roosa), legendi pole vaja (pealkiri ütleb, mis on joonisel).
// Tulbad on õhukesed (≤ 24 px), ülaservas 4 px ümardus, alus sirge; ruudustik on õrn 1 px joon.
// Silt ainult suurimal väärtusel; ülejäänud väärtused näeb kohtspikrist (hiir, puudutus,
// nooleklahvid) ja tabelivaatest („Näita tabelina“). Kõik tekstid paotakse (html-mall).
import { html, render } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "Ilusad" telje jaotised: 0, samm, 2×samm … ≥ max (4–5 jaotist). */
export function niceTicks(max, target = 4) {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) || 10 * pow;
  const ticks = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Tulp, mille ülaservas on ümardatud nurgad ja all sirge serv. */
function barPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const y0 = y + h;
  if (h <= 0) return '';
  return `M${x},${y0}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y0}Z`;
}

/**
 * Tulpdiagramm.
 * @param {HTMLElement} host konteiner (sisu asendatakse)
 * @param {{
 *   data: {key:string, label:string, title:string, value:number, details?:[string,string][]}[],
 *   format: (v:number)=>string,          // väärtus tekstiks (telg, silt)
 *   ariaLabel: string,
 *   emptyText?: string,
 *   tableHead?: string[],                 // tabelivaate veerud: [kuupäev, väärtus, …detailid]
 *   height?: number,
 *   onSelect?: (item)=>void,              // tulba klõps (nt ava päev)
 * }} opts
 * @returns {{destroy:()=>void}}
 */
export function barChart(host, opts) {
  const { data, format, ariaLabel, emptyText = 'Selles vahemikus müüki polnud.', onSelect } = opts;
  const allZero = !data.some((d) => d.value > 0);
  render(
    host,
    html`<div class="adm-chart">
      <div class="adm-chart__plot"></div>
      <div class="adm-chart__tip" role="status" aria-live="polite" hidden></div>
      ${allZero ? html`<p class="adm-chart__empty">${emptyText}</p>` : ''}
    </div>
    <details class="adm-chart__table">
      <summary>Näita tabelina</summary>
      <div class="adm-table-wrap">
        <table class="adm-table adm-table--compact">
          <thead><tr>${(opts.tableHead || ['Periood', 'Väärtus']).map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
          <tbody>
            ${data.map(
              (d) => html`<tr><th scope="row">${d.title}</th><td class="num">${format(d.value)}</td>${(d.details || []).map(([, v]) => html`<td class="num">${v}</td>`)}</tr>`,
            )}
          </tbody>
        </table>
      </div>
    </details>`,
  );
  const wrap = host.querySelector('.adm-chart');
  const plot = host.querySelector('.adm-chart__plot');
  const tip = host.querySelector('.adm-chart__tip');
  let active = -1;
  let geometry = null;

  function showTip(i) {
    if (!geometry || i < 0 || i >= data.length) return hideTip();
    active = i;
    const d = data[i];
    const g = geometry.bars[i];
    plot.querySelectorAll('.adm-chart__bar').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.i) === i));
    plot.querySelectorAll('.adm-chart__hit').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.i) === i));
    render(
      tip,
      html`<strong>${d.title}</strong><span class="adm-chart__tip-value">${format(d.value)}</span>${(d.details || []).map(
        ([k, v]) => html`<span class="adm-chart__tip-row"><span>${k}</span><span>${v}</span></span>`,
      )}`,
    );
    tip.hidden = false;
    // Positsioon: tulba kohal, konteineri sees (CSSOM-iga, mitte style-atribuudiga — CSP).
    const scale = plot.clientWidth / geometry.width;
    const cx = (g.x + g.w / 2) * scale;
    const top = Math.max(0, g.y * scale - 10);
    const tw = tip.offsetWidth;
    const left = Math.min(Math.max(cx - tw / 2, 0), wrap.clientWidth - tw);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, top - tip.offsetHeight)}px`;
  }

  function hideTip() {
    active = -1;
    tip.hidden = true;
    plot.querySelectorAll('.is-active').forEach((b) => b.classList.remove('is-active'));
  }

  function draw() {
    const width = Math.max(280, Math.round(plot.clientWidth || 600));
    const height = opts.height || (width < 520 ? 210 : 260);
    const max = Math.max(0, ...data.map((d) => d.value));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1] || 1;
    const tickLabels = ticks.map((t) => format(t));
    const left = Math.min(84, 14 + Math.max(...tickLabels.map((t) => t.length)) * 6.6);
    const m = { top: 22, right: 8, bottom: 26, left };
    const pw = width - m.left - m.right;
    const ph = height - m.top - m.bottom;
    const n = Math.max(1, data.length);
    const band = pw / n;
    let bw = Math.min(24, Math.max(2, band * 0.62));
    if (band - bw < 2) bw = Math.max(1, band - 2); // vähemalt 2 px vahe naabritega
    const y = (v) => m.top + ph - (v / top) * ph;

    const svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: 'img',
      'aria-label': ariaLabel,
      tabindex: '0',
      class: 'adm-chart__svg',
      focusable: 'true',
    });
    svg.append(el('title', {}, `${ariaLabel}. Väärtuste nägemiseks kasuta nooleklahve või ava tabelivaade.`));

    // Ruudustik + Y-telje sildid
    const grid = el('g', { class: 'adm-chart__grid', 'aria-hidden': 'true' });
    ticks.forEach((t, i) => {
      const yy = Math.round(y(t)) + 0.5;
      grid.append(el('line', { x1: m.left, x2: width - m.right, y1: yy, y2: yy, class: i === 0 ? 'adm-chart__base' : '' }));
      grid.append(el('text', { x: m.left - 8, y: yy + 4, 'text-anchor': 'end', class: 'adm-chart__ylabel' }, tickLabels[i]));
    });
    svg.append(grid);

    // X-telje sildid: nii tihedalt, kui ära mahub
    const longest = Math.max(...data.map((d) => d.label.length), 1);
    const every = Math.max(1, Math.ceil((longest * 6.4 + 10) / band));
    const xl = el('g', { class: 'adm-chart__xlabels', 'aria-hidden': 'true' });
    data.forEach((d, i) => {
      if (i % every !== 0) return;
      xl.append(el('text', { x: m.left + band * i + band / 2, y: height - 8, 'text-anchor': 'middle', class: 'adm-chart__xlabel' }, d.label));
    });
    svg.append(xl);

    // Tulbad + tabamisalad (terve veeru kõrgus — lihtne sihtida ka sõrmega)
    const bars = [];
    const gBars = el('g', { class: 'adm-chart__bars' });
    const gHits = el('g', { class: 'adm-chart__hits' });
    let maxIdx = -1;
    data.forEach((d, i) => {
      const x = m.left + band * i + (band - bw) / 2;
      const yy = y(Math.max(0, d.value));
      const h = m.top + ph - yy;
      bars.push({ x, y: d.value > 0 ? yy : m.top + ph, w: bw });
      if (d.value > 0) {
        gBars.append(el('path', { d: barPath(x, yy, bw, Math.max(h, 1), 4), class: 'adm-chart__bar', 'data-i': i }));
        if (maxIdx < 0 || d.value > data[maxIdx].value) maxIdx = i;
      }
      gHits.append(el('rect', { x: m.left + band * i, y: m.top, width: band, height: ph, class: 'adm-chart__hit', 'data-i': i }));
    });
    svg.append(gBars);
    // Silt ainult suurimal väärtusel (valikuline otsesilt)
    if (maxIdx >= 0) {
      const b = bars[maxIdx];
      const label = format(data[maxIdx].value);
      const cx = Math.min(Math.max(b.x + b.w / 2, m.left + label.length * 3.3), width - m.right - label.length * 3.3);
      svg.append(el('text', { x: cx, y: b.y - 7, 'text-anchor': 'middle', class: 'adm-chart__maxlabel', 'aria-hidden': 'true' }, label));
    }
    svg.append(gHits);

    plot.replaceChildren(svg);
    geometry = { width, height, bars };

    gHits.addEventListener('pointerover', (e) => {
      const i = Number(e.target?.dataset?.i);
      if (Number.isInteger(i)) showTip(i);
    });
    gHits.addEventListener('pointerdown', (e) => {
      const i = Number(e.target?.dataset?.i);
      if (Number.isInteger(i)) showTip(i);
    });
    gHits.addEventListener('click', (e) => {
      const i = Number(e.target?.dataset?.i);
      if (Number.isInteger(i) && onSelect) onSelect(data[i]);
    });
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hideTip();
    });
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = active < 0 ? (e.key === 'ArrowRight' ? 0 : data.length - 1) : Math.min(data.length - 1, Math.max(0, active + (e.key === 'ArrowRight' ? 1 : -1)));
        showTip(next);
      } else if (e.key === 'Escape') hideTip();
      else if ((e.key === 'Enter' || e.key === ' ') && active >= 0 && onSelect) {
        e.preventDefault();
        onSelect(data[active]);
      }
    });
    svg.addEventListener('blur', hideTip);
    if (onSelect) svg.classList.add('is-clickable');
  }

  draw();
  let lastW = plot.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(plot.clientWidth - lastW) < 4) return;
    lastW = plot.clientWidth;
    hideTip();
    draw();
  });
  ro.observe(plot);
  return { destroy: () => ro.disconnect() };
}
