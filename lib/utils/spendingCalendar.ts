/**
 * Calendario delle spese — the pure half (doc/calendario-spese/README.md § 5).
 *
 * One cell per Italian calendar day of the Analisi period, coloured by what was spent that day.
 * Every figure of the tile and its sentences is born here; the component only draws. SDK-free:
 * rows in, a calendar out.
 *
 * Day arithmetic runs on UTC components of a (year, month, day) triple, never on local `Date`s,
 * so the grid is the same under `TZ=Europe/Rome` and `TZ=UTC`; a ROW's day is its Italian one
 * (`getItalyDateIso`, the resolver every Analisi tile uses).
 */

import type { Expense } from '@/types/expenses';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { isSpendingRow } from '@/lib/utils/tracciamentoSummary';
import type { AnalisiPeriod } from '@/lib/utils/analisiSummary';

/** D-CS2: every spending row, or only the variable ones (a fee row has its category's type). */
export type SpendingCalendarFilter = 'all' | 'variable';

/**
 * The four steps of the scale — the ONE source of the intensities, read by the cell fill and the
 * legend swatch (as `HEATMAP_STEPS` is for the returns heatmap). `intensity` is the percent of
 * `--flow-out` mixed into the card. Measured on 2026-11-03 in the four fork blocks (Lime Frost and Graphite,
 * light and dark): step 1 against `--muted` 1,22–1,57, adjacent steps 1,25–1,68; the ink of the day number is
 * the tile's (`calendarDayInkClass`), 4,5:1 at least on every step in those four blocks.
 */
export const SPENDING_CALENDAR_STEPS = [
  { step: 1, intensity: 35 },
  { step: 2, intensity: 55 },
  { step: 3, intensity: 75 },
  { step: 4, intensity: 100 },
] as const;

export type SpendingStep = 0 | 1 | 2 | 3 | 4;

/** Where the pill's choice is remembered on the device. */
export const CALENDAR_FILTER_STORAGE_KEY = 'analisi.calendario.filtro';

/** The stored value as a filter; anything else (nothing, a stale string) is null. */
export function parseCalendarFilter(raw: string | null | undefined): SpendingCalendarFilter | null {
  return raw === 'all' || raw === 'variable' ? raw : null;
}

/** One row of a day, for the popover. */
export interface CalendarLine {
  id: string;
  label: string;
  amount: number;
}

export interface CalendarDay {
  /** 'YYYY-MM-DD'. */
  date: string;
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** Spent that day, a magnitude in euro; 0 on a day after today. */
  total: number;
  /** Still scheduled that day (rows after today), a magnitude; 0 on a day up to today. */
  planned: number;
  isFuture: boolean;
  isToday: boolean;
  /** 0 = no spending (or a future day); 1-4 from the period's quartiles. */
  step: SpendingStep;
  /** The rows of the day, largest first. */
  lines: CalendarLine[];
}

export interface SpendingCalendar {
  kind: 'year' | 'month';
  year: number;
  /** 1-12 for a month calendar, null for a year. */
  month: number | null;
  days: CalendarDay[];
  /** Weekday (0 = Monday) of the first day: the grid's leading blanks. */
  startWeekday: number;
  /** The quartile limits q1 ≤ q2 ≤ q3 of the past days with spending; null without any. */
  thresholds: [number, number, number] | null;
  /** The steps at least one day wears, ascending: a step nobody wears has no legend entry. */
  stepsUsed: SpendingStep[];
  /** Any spending row (past or scheduled) in the period under the «Tutte» filter. */
  hasAnyRows: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const roundCents = (value: number) => Math.round(value * 100) / 100;

/** Weekday of a calendar date, 0 = Monday. */
export function weekdayOf(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The label of a row in the popover: its note, else its subcategory, else its category. */
function lineLabel(row: Expense): string {
  return row.notes?.trim() || row.subCategoryName || row.categoryName;
}

/** The window the tile draws for a period, or null where it has none (the history). */
export function resolveCalendarWindow(
  period: AnalisiPeriod,
  today: { year: number; month: number },
): { year: number; fromMonth: number; toMonth: number; kind: 'year' | 'month' } | null {
  if (period.mode === 'history' || period.year === null) return null;
  if (period.month !== null) return { year: period.year, fromMonth: period.month, toMonth: period.month, kind: 'month' };
  // `ytd` stops at the end of today's month; `current` and `year` are the whole year.
  const toMonth = period.mode === 'ytd' && period.year === today.year ? today.month : 12;
  return { year: period.year, fromMonth: 1, toMonth, kind: 'year' };
}

/** Index `floor(f · n)` of the ascending list, clamped to the last element. */
function quantile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function stepOf(value: number, [q1, q2, q3]: [number, number, number]): SpendingStep {
  if (value <= q1) return 1;
  if (value <= q2) return 2;
  if (value <= q3) return 3;
  return 4;
}

/**
 * The calendar of the period (§ 5.2). `rows` may be the page's whole collection: only the rows of
 * the window are read. Returns null where the tile has no window (the history).
 */
export function buildSpendingCalendar(
  rows: Expense[],
  period: AnalisiPeriod,
  today: Date,
  filter: SpendingCalendarFilter,
): SpendingCalendar | null {
  const todayIso = getItalyDateIso(today);
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);
  const window = resolveCalendarWindow(period, { year: todayYear, month: todayMonth });
  if (!window) return null;

  const firstIso = isoOf(window.year, window.fromMonth, 1);
  const lastIso = isoOf(window.year, window.toMonth, daysInMonth(window.year, window.toMonth));

  const byDay = new Map<string, Expense[]>();
  let hasAnyRows = false;
  for (const row of rows) {
    if (!isSpendingRow(row)) continue;
    const iso = getItalyDateIso(getExpenseDate(row.date));
    if (iso < firstIso || iso > lastIso) continue;
    hasAnyRows = true;
    if (filter === 'variable' && row.type !== 'variable') continue;
    const list = byDay.get(iso);
    if (list) list.push(row);
    else byDay.set(iso, [row]);
  }

  const days: CalendarDay[] = [];
  for (let month = window.fromMonth; month <= window.toMonth; month++) {
    for (let day = 1; day <= daysInMonth(window.year, month); day++) {
      const date = isoOf(window.year, month, day);
      const dayRows = byDay.get(date) ?? [];
      const isFuture = date > todayIso;
      const lines = dayRows
        .map((row) => ({ id: row.id, label: lineLabel(row), amount: roundCents(Math.abs(row.amount)) }))
        .sort((a, b) => b.amount - a.amount);
      const sum = roundCents(lines.reduce((acc, line) => acc + line.amount, 0));
      days.push({
        date,
        year: window.year,
        month,
        day,
        weekday: weekdayOf(window.year, month, day),
        total: isFuture ? 0 : sum,
        planned: isFuture ? sum : 0,
        isFuture,
        isToday: date === todayIso,
        step: 0,
        lines,
      });
    }
  }

  const spent = days.filter((d) => d.total > 0).map((d) => d.total).sort((a, b) => a - b);
  let thresholds: [number, number, number] | null = null;
  const stepsUsed = new Set<SpendingStep>();
  if (spent.length > 0) {
    thresholds = [quantile(spent, 0.25), quantile(spent, 0.5), quantile(spent, 0.75)];
    for (const d of days) {
      if (d.total > 0) {
        d.step = stepOf(d.total, thresholds);
        stepsUsed.add(d.step);
      }
    }
  }

  return {
    kind: window.kind,
    year: window.year,
    month: window.kind === 'month' ? window.fromMonth : null,
    days,
    startWeekday: days.length ? days[0].weekday : 0,
    thresholds,
    stepsUsed: [...stepsUsed].sort(),
    hasAnyRows,
  };
}

/** The figures the sentences quote (§ 5.5). Unrounded: the sentence rounds, the test pins. */
export interface CalendarStats {
  /** Past days of the window. */
  pastDays: number;
  /** Past days with spending. */
  spendingDays: number;
  /** Spent over the past days. */
  total: number;
  /** Scheduled over the future days. */
  planned: number;
  /** The most expensive past day; null without spending. */
  topDay: CalendarDay | null;
  /** The weekday with the highest mean (zero days included), 0 = Monday; null without spending. */
  heaviestWeekday: number | null;
  /** Mean spent on that weekday, and on the other six together. */
  heaviestMean: number;
  othersMean: number;
}

export function summarizeSpendingCalendar(calendar: SpendingCalendar): CalendarStats {
  const sums = Array(7).fill(0) as number[];
  const counts = Array(7).fill(0) as number[];
  let total = 0;
  let planned = 0;
  let spendingDays = 0;
  let pastDays = 0;
  let topDay: CalendarDay | null = null;
  for (const day of calendar.days) {
    planned += day.planned;
    if (day.isFuture) continue;
    pastDays++;
    counts[day.weekday]++;
    sums[day.weekday] += day.total;
    total += day.total;
    if (day.total > 0) {
      spendingDays++;
      if (!topDay || day.total > topDay.total) topDay = day;
    }
  }
  let heaviestWeekday: number | null = null;
  let heaviestMean = 0;
  let othersMean = 0;
  if (spendingDays > 0) {
    let best = -1;
    for (let w = 0; w < 7; w++) {
      const mean = counts[w] ? sums[w] / counts[w] : 0;
      if (mean > best) {
        best = mean;
        heaviestWeekday = w;
      }
    }
    const w = heaviestWeekday as number;
    heaviestMean = best;
    const otherDays = pastDays - counts[w];
    othersMean = otherDays > 0 ? (total - sums[w]) / otherDays : 0;
  }
  return { pastDays, spendingDays, total: roundCents(total), planned: roundCents(planned), topDay, heaviestWeekday, heaviestMean, othersMean };
}
