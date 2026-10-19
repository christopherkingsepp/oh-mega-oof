// Europe/Tallinn kuupäevad ↔ UTC vahemikud (sh suveaja vahetus märtsis ja oktoobris),
// nädal E–P, kuu, vormindus ning statistika perioodi lugemine URL-ist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startOfTallinnDay,
  tallinnRange,
  dayRange,
  weekRange,
  monthRange,
  yearRange,
  tallinnDate,
  tallinnMonth,
  tallinnOffsetMinutes,
  formatTallinn,
  formatTallinnDate,
  formatTallinnTime,
  formatMonth,
  isDateString,
  isMonthString,
  addDays,
  addMonths,
  weekdayOf,
  daysInMonth,
  datesBetween,
  monthsBetween,
} from '../netlify/functions/_lib/time.mjs';
import { parseStatsRange } from '../netlify/functions/_lib/admin-api.mjs';

const iso = (d) => d.toISOString();
const hours = (r) => (r.to - r.from) / 3600e3;

test('Tallinna nihe: talvel +2 h, suvel +3 h', () => {
  assert.equal(tallinnOffsetMinutes('2026-01-15T12:00:00Z'), 120);
  assert.equal(tallinnOffsetMinutes('2026-07-15T12:00:00Z'), 180);
});

test('suveaja algus (29.03.2026): päev on 23 h pikk', () => {
  const r = dayRange('2026-03-29');
  assert.equal(iso(r.from), '2026-03-28T22:00:00.000Z');
  assert.equal(iso(r.to), '2026-03-29T21:00:00.000Z');
  assert.equal(hours(r), 23);
  // Kell 03:00 → 04:00 hüppab: 00:59 UTC on 02:59 Tallinnas, 01:00 UTC on 04:00
  assert.equal(formatTallinn('2026-03-29T00:59:00Z'), '29.03.2026 02:59');
  assert.equal(formatTallinn('2026-03-29T01:00:00Z'), '29.03.2026 04:00');
});

test('suveaja lõpp (25.10.2026): päev on 25 h pikk', () => {
  const r = dayRange('2026-10-25');
  assert.equal(iso(r.from), '2026-10-24T21:00:00.000Z');
  assert.equal(iso(r.to), '2026-10-25T22:00:00.000Z');
  assert.equal(hours(r), 25);
  assert.equal(formatTallinn('2026-10-25T00:30:00Z'), '25.10.2026 03:30'); // veel suveaeg
  assert.equal(formatTallinn('2026-10-25T01:30:00Z'), '25.10.2026 03:30'); // juba talveaeg (sama seinakell)
});

test('kuupäevapiir: 23:30 UTC 31.03 on Tallinnas juba 01.04', () => {
  assert.equal(tallinnDate('2026-03-31T23:30:00Z'), '2026-04-01');
  assert.equal(tallinnDate('2026-03-31T20:59:59Z'), '2026-03-31');
  assert.equal(tallinnDate('2026-03-31T21:00:00Z'), '2026-04-01');
  assert.equal(tallinnDate('2026-12-31T22:30:00Z'), '2027-01-01'); // talvel +2 h
  assert.equal(tallinnMonth('2026-03-31T23:30:00Z'), '2026-04');
  const april1 = dayRange('2026-04-01');
  const t = new Date('2026-03-31T23:30:00Z');
  assert.ok(t >= april1.from && t < april1.to);
  const march = monthRange('2026-03');
  assert.ok(!(t >= march.from && t < march.to), 'ei kuulu märtsi');
});

test('nädal on esmaspäevast pühapäevani (ka üle suveaja lõpu)', () => {
  for (const d of ['2026-10-19', '2026-10-21', '2026-10-25']) {
    const r = weekRange(d);
    assert.equal(r.fromDate, '2026-10-19', d);
    assert.equal(r.toDate, '2026-10-25', d);
  }
  const r = weekRange('2026-10-21');
  assert.equal(iso(r.from), '2026-10-18T21:00:00.000Z');
  assert.equal(iso(r.to), '2026-10-25T22:00:00.000Z');
  assert.equal(hours(r), 7 * 24 + 1);
  assert.equal(weekRange('2026-10-26').fromDate, '2026-10-26'); // esmaspäev alustab uut nädalat
  assert.equal(weekdayOf('2026-10-19'), 1);
  assert.equal(weekdayOf('2026-10-25'), 7);
});

test('kuu algus ja lõpp; aasta', () => {
  const m = monthRange('2026-03');
  assert.equal(iso(m.from), '2026-02-28T22:00:00.000Z');
  assert.equal(iso(m.to), '2026-03-31T21:00:00.000Z');
  assert.equal(m.fromDate, '2026-03-01');
  assert.equal(m.toDate, '2026-03-31');
  assert.equal(monthRange('2026-10-19').toDate, '2026-10-31');
  assert.equal(monthRange('2028-02').toDate, '2028-02-29'); // liigaasta
  assert.equal(daysInMonth('2026-02'), 28);
  const y = yearRange('2026-06-01');
  assert.equal(iso(y.from), '2025-12-31T22:00:00.000Z');
  assert.equal(iso(y.to), '2026-12-31T22:00:00.000Z');
});

test('vahemik: kontroll ja abifunktsioonid', () => {
  assert.throws(() => tallinnRange('2026-10-20', '2026-10-19'), RangeError);
  assert.throws(() => startOfTallinnDay('2026-02-30'), RangeError);
  assert.equal(isDateString('2026-02-30'), false);
  assert.equal(isDateString('2026-2-3'), false);
  assert.equal(isDateString('2026-12-31'), true);
  assert.equal(isMonthString('2026-13'), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(datesBetween('2026-10-30', '2026-11-02').join(','), '2026-10-30,2026-10-31,2026-11-01,2026-11-02');
  assert.equal(monthsBetween('2025-11-15', '2026-02-01').join(','), '2025-11,2025-12,2026-01,2026-02');
});

test("vormindus 'DD.MM.YYYY HH:mm' Tallinna ajas", () => {
  assert.equal(formatTallinn('2026-07-01T09:05:00Z'), '01.07.2026 12:05');
  assert.equal(formatTallinn('2026-01-15T09:05:00Z'), '15.01.2026 11:05');
  assert.equal(formatTallinn(new Date('2026-12-31T22:30:00Z')), '01.01.2027 00:30');
  assert.equal(formatTallinnDate('2026-03-31T23:30:00Z'), '01.04.2026');
  assert.equal(formatTallinnTime('2026-03-31T23:30:00Z'), '02:30');
  assert.equal(formatTallinn(null), '');
  assert.equal(formatTallinn('prügi'), '');
  assert.equal(formatMonth('2026-10'), 'oktoober 2026');
});

test('statistika periood URL-ist: day/week/month/year ja vaba vahemik', () => {
  const now = new Date('2026-10-19T21:30:00Z'); // Tallinnas juba 20.10
  const p = (q) => parseStatsRange(new URLSearchParams(q), { now });

  const def = p('');
  assert.equal(def.ok, true);
  assert.equal(def.value.period, 'month');
  assert.equal(def.value.fromDate, '2026-10-01');
  assert.equal(def.value.date, '2026-10-20', 'täna Tallinna aja järgi');

  const day = p('period=day&date=2026-03-29');
  assert.equal(day.value.label, '29.03.2026');
  assert.equal(day.value.prevDate, '2026-03-28');
  assert.equal(hours(day.value), 23);

  const week = p('period=week&date=2026-10-22');
  assert.equal(week.value.fromDate, '2026-10-19');
  assert.equal(week.value.label, '19.10.2026 – 25.10.2026');
  assert.equal(week.value.nextDate, '2026-10-26');

  const month = p('period=month&date=2026-03-15');
  assert.equal(month.value.label, 'märts 2026');
  assert.equal(month.value.prevDate, '2026-02-01');

  assert.equal(p('period=year&date=2026-05-05').value.fromDate, '2026-01-01');

  const range = p('from=2026-03-31&to=2026-04-01');
  assert.equal(range.value.period, 'range');
  assert.equal(iso(range.value.from), '2026-03-30T21:00:00.000Z');
  assert.equal(iso(range.value.to), '2026-04-01T21:00:00.000Z');

  assert.equal(p('from=2026-04-02&to=2026-04-01').ok, false);
  assert.equal(p('from=2020-01-01&to=2026-01-01').ok, false, 'liiga pikk');
  assert.equal(p('from=prügi').ok, false);
  assert.equal(p('period=sajand').ok, false);
  assert.equal(p('period=day&date=2026-02-30').ok, false);
});
