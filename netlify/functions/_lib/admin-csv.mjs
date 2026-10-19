// Tellimuste CSV-eksport Exceli jaoks (Eesti seaded):
//  • UTF-8 BOM faili alguses (Excel tunneb täpitähed õigesti ära),
//  • eraldaja semikoolon (;), kümnendkoht koma (17,50), read CRLF-iga,
//  • kuupäev ja kellaaeg Tallinna ajas,
//  • CSV-süstimise kaitse: lahter, mis algab märgiga = + - @ (või tab/CR), saab ette ülakoma ('),
//    et Excel/LibreOffice ei käivitaks seda valemina (nt =HYPERLINK(...) kliendi nimes).
import { PRODUCTS } from '../../../public/assets/js/catalog.js';
import { formatTallinnDate, formatTallinnTime } from './time.mjs';
import { parseItems, orderGameUnits } from './stats.mjs';
import { PAYMENT_LABELS, FULFILLMENT_LABELS, carrierShortName, itemLabel } from './admin-orders.mjs';

export const BOM = '﻿';
export const SEPARATOR = ';';

export const CSV_COLUMNS = [
  'Nr',
  'Kuupäev',
  'Kellaaeg (Tallinn)',
  'Klient',
  'E-post',
  'Telefon',
  'Tooted',
  'Kogused (mängud)',
  'Vahesumma',
  'Soodustus',
  'Tarne',
  'Kokku',
  'Makse staatus',
  'Stripe PaymentIntent',
  'Operaator',
  'Automaat',
  'Automaadi ID',
  'Aadress',
  'Täitmise staatus',
  'Jälgimiskood',
  'Märkmed',
  'Sooduskood',
  'Tagastatud',
];

/** Sendid → "17,50" (ilma € märgita, et Excel loeks arvuna). */
export function csvMoney(cents) {
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Valemisüstimise kaitse (OWASP): ohtlik algusmärk → ette ülakoma. */
export function neutralizeFormula(value) {
  const s = String(value ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Üks lahter: süstimiskaitse + jutumärgid, kui vaja (eraldaja, jutumärk, reavahetus, servatühik). */
export function csvCell(value, { raw = false } = {}) {
  const s = raw ? String(value ?? '') : neutralizeFormula(value);
  return /[";\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(cells, opts) {
  return cells.map((c, i) => csvCell(c, opts?.[i])).join(SEPARATOR);
}

/** Tellimuse rida CSV jaoks (veergude järjekord = CSV_COLUMNS). */
export function orderCsvCells(row) {
  const items = parseItems(row.items);
  const games = orderGameUnits(items);
  return [
    row.number,
    formatTallinnDate(row.created_at),
    formatTallinnTime(row.created_at),
    row.customer_name,
    row.customer_email,
    row.customer_phone,
    items.map(itemLabel).join(' | '),
    games.map((g) => `${PRODUCTS[g.id]?.name || g.name}: ${g.qty}`).join(', '),
    csvMoney(row.subtotal_cents),
    csvMoney(row.discount_cents),
    csvMoney(row.shipping_cents),
    csvMoney(row.total_cents),
    PAYMENT_LABELS[row.payment_status] || row.payment_status,
    row.stripe_payment_intent_id || '',
    carrierShortName(row.carrier, row.carrier_name),
    row.locker_name || '',
    row.locker_id || '',
    [row.locker_address, row.locker_city].filter(Boolean).join(', '),
    FULFILLMENT_LABELS[row.fulfillment_status] || row.fulfillment_status,
    row.tracking_code || '',
    String(row.notes || '').replace(/\r?\n/g, ' / '),
    row.discount_code || '',
    csvMoney(row.refunded_cents),
  ];
}

/** Terve CSV-fail (BOM + päis + read), CRLF reavahetustega. */
export function ordersToCsv(rows) {
  const lines = [csvLine(CSV_COLUMNS), ...rows.map((r) => csvLine(orderCsvCells(r)))];
  return BOM + lines.join('\r\n') + '\r\n';
}
