// E-kirjade mallid (eesti keeles, ÄGE brändi stiilis). Iga mall tagastab { subject, html, text }.
//
// E-postiprogrammid ei toeta väliseid stiilifaile ega veebifonte usaldusväärselt, seega:
// tabelipõhine paigutus, ainult inline CSS, süsteemifondid (Unbounded/Manrope on esimesed
// valikud neile, kel need on), max laius 600 px. Kõik andmed on HTML-ist läbi esc().
import { formatEur } from '../../../public/assets/js/catalog.js';
import { SITE } from '../../../public/assets/js/site.js';

const C = {
  bg: '#07030a',
  card: '#ffffff',
  ink: '#140a12',
  muted: '#6b5a66',
  line: '#eee3ea',
  pink: '#ff2fa8',
  pinkDark: '#c2147a',
  soft: '#fff3fa',
};
const FONT_BODY = "Manrope, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_DISPLAY = "Unbounded, 'Arial Black', 'Segoe UI', Helvetica, Arial, sans-serif";

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const eur = (cents) => formatEur(Number(cents) || 0).replace(/\u00a0/g, ' ');

/** Kuupäev ja kell Tallinna ajas: "19.10.2026 kell 18:05". */
export function tallinnDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const date = new Intl.DateTimeFormat('et-EE', { timeZone: 'Europe/Tallinn', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('et-EE', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${date} kell ${time}`;
}

/** Ainult kuupäev Tallinna ajas: "19.10.2026". 'YYYY-MM-DD' string võetakse otse. */
export function tallinnDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}.${m}.${y}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('et-EE', { timeZone: 'Europe/Tallinn', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

const addDays = (value, days) => new Date(new Date(value).getTime() + days * 86400000);

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/* ---------------------------------------------------------------------------
 * Ühine raam
 * ------------------------------------------------------------------------- */

function layout({ preheader, title, body, siteUrl, footerNote = '' }) {
  const logo = `${siteUrl}/assets/img/brand/age-logo-white.png`;
  return `<!doctype html>
<html lang="et">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(preheader)}&#8203;&#160;&#8203;&#160;&#8203;&#160;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
    <tr><td style="padding:4px 8px 22px 8px;">
      <a href="${esc(siteUrl)}" style="text-decoration:none;color:#ffffff;">
        <img src="${esc(logo)}" width="96" alt="ÄGE" style="display:block;border:0;width:96px;height:auto;color:#ffffff;font:900 28px ${FONT_DISPLAY};">
      </a>
    </td></tr>
    <tr><td style="background:${C.card};border-radius:20px;padding:30px 26px;border-top:4px solid ${C.pink};font-family:${FONT_BODY};color:${C.ink};font-size:15px;line-height:1.6;">
      ${body}
    </td></tr>
    <tr><td style="padding:22px 10px 6px 10px;font-family:${FONT_BODY};color:#bfaeb9;font-size:12px;line-height:1.6;text-align:center;">
      ${footerNote ? `${footerNote}<br>` : ''}
      ${esc(SITE.brand)} — ${esc(SITE.legalName)}${SITE.regCode ? `, reg. ${esc(SITE.regCode)}` : ''}, ${esc(SITE.address)}<br>
      <a href="mailto:${esc(SITE.email)}" style="color:${C.pink};text-decoration:none;">${esc(SITE.email)}</a>
      &nbsp;·&nbsp; Instagram ja TikTok <a href="${esc(SITE.instagram)}" style="color:${C.pink};text-decoration:none;">${esc(SITE.instagramHandle)}</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const h1 = (text) =>
  `<h1 style="margin:0 0 12px 0;font-family:${FONT_DISPLAY};font-size:24px;line-height:1.25;font-weight:800;color:${C.ink};">${text}</h1>`;
const h2 = (text) =>
  `<h2 style="margin:26px 0 10px 0;font-family:${FONT_DISPLAY};font-size:15px;line-height:1.3;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${C.pinkDark};">${text}</h2>`;
const p = (html, style = '') => `<p style="margin:0 0 12px 0;${style}">${html}</p>`;
const button = (href, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px 0;"><tr><td style="border-radius:999px;background:${C.pink};">
<a href="${esc(href)}" style="display:inline-block;padding:13px 24px;font-family:${FONT_DISPLAY};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;
const box = (html) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px 0;"><tr><td style="background:${C.soft};border-radius:14px;padding:14px 16px;">${html}</td></tr></table>`;

function kvTable(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:${C.muted};font-size:13px;vertical-align:top;width:38%;">${esc(k)}</td><td style="padding:6px 0;font-size:14px;vertical-align:top;">${v}</td></tr>`,
    )
    .join('')}</table>`;
}

/* ---------------------------------------------------------------------------
 * Tellimuse read ja summad (HTML + tekst)
 * ------------------------------------------------------------------------- */

const contentsText = (item) =>
  item.bundle && Array.isArray(item.includes) && item.includes.length
    ? item.includes.map((c) => (c.qty > 1 ? `${c.name} ×${c.qty}` : c.name)).join(' + ')
    : '';

function itemsHtml(items) {
  const rows = (items || [])
    .map((i) => {
      const contents = contentsText(i);
      return `<tr>
<td style="padding:10px 10px 10px 0;border-bottom:1px solid ${C.line};vertical-align:top;">
  <strong style="font-weight:700;">${esc(i.name)}</strong> <span style="color:${C.muted};">× ${esc(i.qty)}</span>
  ${contents ? `<br><span style="font-size:13px;color:${C.muted};">Komplektis: ${esc(contents)}</span>` : ''}
</td>
<td align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};vertical-align:top;white-space:nowrap;font-weight:700;">${esc(eur(i.totalCents))}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`;
}

function totalsRows(order) {
  const rows = [['Vahesumma', eur(order.subtotal_cents)]];
  if (Number(order.discount_cents) > 0) rows.push([`Soodustus${order.discount_code ? ` (${order.discount_code})` : ''}`, `−${eur(order.discount_cents)}`]);
  rows.push([`Tarne (${order.carrier_name})`, Number(order.shipping_cents) > 0 ? eur(order.shipping_cents) : 'Tasuta']);
  return rows;
}

function totalsHtml(order, totalLabel = 'Kokku') {
  const rows = totalsRows(order)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 0;color:${C.muted};font-size:14px;">${esc(k)}</td><td align="right" style="padding:4px 0;font-size:14px;white-space:nowrap;">${esc(v)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;">${rows}
<tr><td style="padding:10px 0 0 0;font-family:${FONT_DISPLAY};font-weight:800;font-size:16px;">${esc(totalLabel)}</td>
<td align="right" style="padding:10px 0 0 0;font-family:${FONT_DISPLAY};font-weight:800;font-size:18px;color:${C.pinkDark};white-space:nowrap;">${esc(eur(order.total_cents))}</td></tr>
</table>`;
}

function itemsText(items) {
  return (items || [])
    .map((i) => {
      const contents = contentsText(i);
      return `- ${i.name} × ${i.qty} — ${eur(i.totalCents)}${contents ? `\n  Komplektis: ${contents}` : ''}`;
    })
    .join('\n');
}

function totalsText(order, totalLabel = 'Kokku') {
  return [...totalsRows(order), [totalLabel, eur(order.total_cents)]].map(([k, v]) => `${k}: ${v}`).join('\n');
}

const lockerLines = (order) =>
  [order.locker_name, [order.locker_address, order.locker_city].filter(Boolean).join(', '), order.locker_id ? `Automaadi ID: ${order.locker_id}` : '']
    .filter(Boolean);

/* ---------------------------------------------------------------------------
 * 1) Tellimuse kinnitus kliendile
 * ------------------------------------------------------------------------- */

/**
 * @param {object} order orders rida (makstud)
 * @param {{siteUrl:string}} ctx
 */
export function orderConfirmationEmail(order, { siteUrl }) {
  const name = firstName(order.customer_name);
  const orderUrl = `${siteUrl}/aitah?t=${encodeURIComponent(order.public_token)}`;
  const withdrawalUrl = `${siteUrl}/taganemine?tellimus=${encodeURIComponent(order.number || '')}`;
  const termsUrl = `${siteUrl}/tingimused`;
  const adult = (order.items || []).some((i) => (i.includes || []).some((c) => c.id === 'mida-viiu') || i.id === 'mida-viiu');
  const subject = `Tellimus ${order.number} on makstud — aitäh!`;
  const preheader = `Saime sinu makse kätte. Paneme mängud teele 1–3 tööpäeva jooksul: ${order.carrier_name}, ${order.locker_name}.`;

  const body = `
${h1(`Aitäh${name ? `, ${esc(name)}` : ''}! Tellimus on makstud.`)}
${p(`Saime sinu makse kätte ja hakkame mänge pakkima. Tellimuse number on <strong style="color:${C.pinkDark};">${esc(order.number)}</strong> — see kulub ära, kui tahad meiega tellimuse asjus suhelda.`)}
${h2('Sinu tellimus')}
${itemsHtml(order.items)}
${totalsHtml(order, 'Makstud kokku')}
${h2('Tarne')}
${box(`<strong>${esc(order.carrier_name)}</strong><br>${lockerLines(order).map(esc).join('<br>')}`)}
${p(`Automaadi avamiskood saabub SMS-iga numbrile <strong>${esc(order.customer_phone)}</strong>.`, `font-size:13px;color:${C.muted};margin-top:8px;`)}
${h2('Mis edasi?')}
<ol style="margin:0 0 12px 0;padding-left:20px;">
  <li style="margin-bottom:6px;">Pakime mängud ja saadame paki teele <strong>1–3 tööpäeva</strong> jooksul.</li>
  <li style="margin-bottom:6px;">Kui pakk on automaadis, saad vedajalt SMS-i (ja tavaliselt ka e-kirja) avamiskoodiga.</li>
  <li style="margin-bottom:6px;">Võta pakk automaadist välja, kutsu sõbrad kokku ja mängi!</li>
</ol>
${button(orderUrl, 'Vaata tellimust')}
${adult ? p('MIDA V!!!U on mõeldud ainult täiskasvanutele (18+). Mängi vastutustundlikult — kui keegi jääb liiga täis, jätke mäng pooleli.', `font-size:13px;color:${C.muted};margin-top:14px;`) : ''}
${h2('Taganemisõigus')}
${p(`Sul on õigus <strong>14 päeva</strong> jooksul alates paki kättesaamisest lepingust taganeda ilma põhjust esitamata. Teata sellest veebivormiga <a href="${esc(withdrawalUrl)}" style="color:${C.pinkDark};">${esc(withdrawalUrl.replace(/^https?:\/\//, ''))}</a> või kirjuta meile. Kauba tagastamise otsekulu kannab ostja. Täpsemalt loe <a href="${esc(termsUrl)}" style="color:${C.pinkDark};">müügitingimustest</a>.`, 'font-size:14px;')}
${h2('Küsimused?')}
${p(`Vasta lihtsalt sellele kirjale või kirjuta <a href="mailto:${esc(SITE.email)}" style="color:${C.pinkDark};">${esc(SITE.email)}</a>. Instagramis ja TikTokis leiad meid nime all ${esc(SITE.instagramHandle)}.`, 'font-size:14px;')}
`;

  const text = [
    `Aitäh${name ? `, ${name}` : ''}! Tellimus ${order.number} on makstud.`,
    '',
    'Saime sinu makse kätte ja hakkame mänge pakkima.',
    '',
    'SINU TELLIMUS',
    itemsText(order.items),
    '',
    totalsText(order, 'Makstud kokku'),
    '',
    'TARNE',
    order.carrier_name,
    ...lockerLines(order),
    `Automaadi avamiskood saabub SMS-iga numbrile ${order.customer_phone}.`,
    '',
    'MIS EDASI?',
    '1. Pakime mängud ja saadame paki teele 1–3 tööpäeva jooksul.',
    '2. Kui pakk on automaadis, saad vedajalt SMS-i avamiskoodiga.',
    '3. Võta pakk välja, kutsu sõbrad kokku ja mängi!',
    '',
    `Vaata tellimust: ${orderUrl}`,
    ...(adult ? ['', 'MIDA V!!!U on mõeldud ainult täiskasvanutele (18+). Mängi vastutustundlikult.'] : []),
    '',
    'TAGANEMISÕIGUS',
    `Sul on õigus 14 päeva jooksul alates paki kättesaamisest lepingust taganeda ilma põhjust esitamata. Teata sellest vormiga ${withdrawalUrl} või kirjuta ${SITE.email}. Kauba tagastamise otsekulu kannab ostja. Müügitingimused: ${termsUrl}`,
    '',
    `Küsimused? Vasta sellele kirjale või kirjuta ${SITE.email}.`,
    `${SITE.brand} — ${SITE.legalName}`,
  ].join('\n');

  return {
    subject,
    html: layout({ preheader, title: subject, body, siteUrl, footerNote: `Said selle kirja, sest tegid tellimuse ${esc(order.number)} ÄGE e-poes.` }),
    text,
  };
}

/* ---------------------------------------------------------------------------
 * 2) Uus tellimus omanikule
 * ------------------------------------------------------------------------- */

export function adminNewOrderEmail(order, { siteUrl }) {
  const subject = `Uus tellimus ${order.number} — ${eur(order.total_cents)} (${order.carrier_name})`;
  const adminUrl = `${siteUrl}/admin`;
  const body = `
${h1(`Uus makstud tellimus ${esc(order.number)}`)}
${p(`${esc(tallinnDateTime(order.paid_at || order.created_at))} · kokku <strong>${esc(eur(order.total_cents))}</strong>`)}
${h2('Tooted')}
${itemsHtml(order.items)}
${totalsHtml(order)}
${h2('Klient')}
${kvTable([
  ['Nimi', esc(order.customer_name)],
  ['E-post', `<a href="mailto:${esc(order.customer_email)}" style="color:${C.pinkDark};">${esc(order.customer_email)}</a>`],
  ['Telefon', esc(order.customer_phone)],
])}
${h2('Saata')}
${box(`<strong>${esc(order.carrier_name)}</strong><br>${lockerLines(order).map(esc).join('<br>')}${order.locker_id ? '' : `<br><span style="color:${C.pinkDark};font-size:13px;">Automaat on sisestatud käsitsi — kontrolli enne saatmist.</span>`}`)}
${button(adminUrl, 'Ava halduspaneel')}
`;
  const text = [
    `Uus makstud tellimus ${order.number}`,
    `${tallinnDateTime(order.paid_at || order.created_at)} · kokku ${eur(order.total_cents)}`,
    '',
    itemsText(order.items),
    '',
    totalsText(order),
    '',
    `Klient: ${order.customer_name}, ${order.customer_email}, ${order.customer_phone}`,
    `Saata: ${order.carrier_name}`,
    ...lockerLines(order),
    ...(order.locker_id ? [] : ['NB! Automaat on sisestatud käsitsi — kontrolli enne saatmist.']),
    '',
    `Halduspaneel: ${adminUrl}`,
  ].join('\n');
  return { subject, html: layout({ preheader: `${order.customer_name} · ${eur(order.total_cents)} · ${order.locker_name}`, title: subject, body, siteUrl }), text };
}

/* ---------------------------------------------------------------------------
 * 3) Taganemisavalduse kinnitus kliendile
 * ------------------------------------------------------------------------- */

function withdrawalRows(w) {
  return [
    ['Viitenumber', w.reference],
    ['Tellimuse number', w.order_number],
    ['Avaldus saabus', tallinnDateTime(w.created_at)],
    ['Kauba kättesaamise kuupäev', w.received_date ? tallinnDate(w.received_date) : ''],
    ['Tagastatavad tooted', w.items || ''],
    ['Sõnum', w.message || ''],
  ];
}

export function withdrawalAckEmail(w, { siteUrl }) {
  const name = firstName(w.customer_name);
  const subject = `Oleme sinu taganemisavalduse kätte saanud (${w.reference})`;
  const rows = withdrawalRows(w);
  const body = `
${h1(`Tere${name ? `, ${esc(name)}` : ''}! Oleme sinu taganemisavalduse kätte saanud.`)}
${p(`Kinnitame, et saime sinu avalduse tellimuse <strong>${esc(w.order_number)}</strong> lepingust taganemiseks. Avalduse viitenumber on <strong style="color:${C.pinkDark};">${esc(w.reference)}</strong>.`)}
${h2('Avalduse kokkuvõte')}
${kvTable(rows.map(([k, v]) => [k, esc(v)]))}
${h2('Mis edasi?')}
<ol style="margin:0 0 12px 0;padding-left:20px;">
  <li style="margin-bottom:6px;"><strong>Tagasta kaup 14 päeva jooksul</strong> pärast avalduse esitamist. Saadame sulle peagi juhised, kuhu ja kuidas kaup saata. Tagastamise otsekulu kannab ostja.</li>
  <li style="margin-bottom:6px;"><strong>Raha tagastame 14 päeva jooksul</strong> avalduse kättesaamisest (sh algse tavatarne hinna) samale maksevahendile, millega maksid. Võime raha tagastamisega oodata, kuni oleme kauba tagasi saanud või oled saatnud tõendi selle tagasisaatmise kohta.</li>
  <li style="margin-bottom:6px;">Palun hoia kaup korras: ostja vastutab kauba väärtuse vähenemise eest, mis tuleneb muust kui kauba olemuse, omaduste ja toimimise kontrollimisest.</li>
</ol>
${p(`Kui midagi on valesti või sul on küsimusi, vasta sellele kirjale või kirjuta <a href="mailto:${esc(SITE.email)}" style="color:${C.pinkDark};">${esc(SITE.email)}</a> ja lisa viitenumber ${esc(w.reference)}.`, 'font-size:14px;')}
`;
  const text = [
    `Tere${name ? `, ${name}` : ''}! Oleme sinu taganemisavalduse kätte saanud.`,
    '',
    `Kinnitame, et saime sinu avalduse tellimuse ${w.order_number} lepingust taganemiseks. Viitenumber: ${w.reference}.`,
    '',
    'AVALDUSE KOKKUVÕTE',
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    '',
    'MIS EDASI?',
    '1. Tagasta kaup 14 päeva jooksul pärast avalduse esitamist. Saadame sulle peagi juhised, kuhu ja kuidas kaup saata. Tagastamise otsekulu kannab ostja.',
    '2. Raha tagastame 14 päeva jooksul avalduse kättesaamisest (sh algse tavatarne hinna) samale maksevahendile. Võime oodata, kuni oleme kauba tagasi saanud või oled saatnud tõendi selle tagasisaatmise kohta.',
    '3. Palun hoia kaup korras: ostja vastutab kauba väärtuse vähenemise eest, mis tuleneb muust kui kauba olemuse, omaduste ja toimimise kontrollimisest.',
    '',
    `Küsimused? Vasta sellele kirjale või kirjuta ${SITE.email} (lisa viitenumber ${w.reference}).`,
    `${SITE.brand} — ${SITE.legalName}`,
  ].join('\n');
  return {
    subject,
    html: layout({ preheader: `Viitenumber ${w.reference}. Tagasta kaup 14 päeva jooksul — raha tagastame 14 päeva jooksul.`, title: subject, body, siteUrl }),
    text,
  };
}

/* ---------------------------------------------------------------------------
 * 4) Taganemisavalduse teavitus omanikule
 * ------------------------------------------------------------------------- */

export function adminWithdrawalEmail(w, { siteUrl }) {
  const subject = `Taganemisavaldus ${w.reference} — tellimus ${w.order_number}`;
  const deadline = tallinnDate(addDays(w.created_at, 14));
  const adminUrl = `${siteUrl}/admin`;
  const rows = [['Klient', w.customer_name], ['E-post', w.customer_email], ...withdrawalRows(w)];
  const body = `
${h1(`Uus taganemisavaldus ${esc(w.reference)}`)}
${p(`Klient soovib tellimuse <strong>${esc(w.order_number)}</strong> lepingust taganeda. Kliendile saadeti automaatne kinnitus.`)}
${kvTable(rows.map(([k, v]) => [k, k === 'E-post' ? `<a href="mailto:${esc(v)}" style="color:${C.pinkDark};">${esc(v)}</a>` : esc(v)]))}
${box(`<strong>Tähtaeg:</strong> raha tuleb tagastada hiljemalt <strong>${esc(deadline)}</strong> (14 päeva avalduse saamisest). Võid tagastamisega oodata, kuni kaup on tagasi või klient on saatnud tõendi selle tagasisaatmise kohta. Saada kliendile juhised, kuhu kaup tagastada.`)}
${button(adminUrl, 'Ava halduspaneel')}
`;
  const text = [
    `Uus taganemisavaldus ${w.reference} — tellimus ${w.order_number}`,
    '',
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    '',
    `Tähtaeg: raha tuleb tagastada hiljemalt ${deadline} (14 päeva avalduse saamisest). Saada kliendile juhised, kuhu kaup tagastada.`,
    `Halduspaneel: ${adminUrl}`,
  ].join('\n');
  return { subject, html: layout({ preheader: `${w.customer_name} · tellimus ${w.order_number}`, title: subject, body, siteUrl }), text };
}
