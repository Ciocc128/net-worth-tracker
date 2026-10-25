/**
 * The figures of «Andamento del mese» (Cashflow › Tracciamento, doc/andamento-spese/README.md): the
 * spending of ONE month accumulated day by day, against ONE comparison — the mean of the closed
 * months, last month, or the same month a year ago.
 *
 * Pure and read-free (D-AM10): it works on the rows `trackingWindow(period)` already holds (the
 * period and the twelve months before it). Day and month of a row are read in Italian time, like the
 * monthly buckets of the tab, and «spesa» is exactly what the trio's «Spese» counts
 * (`isSpendingRow`: every type but income and transfer, a magnitude), so the two identities of
 * § 5.1 hold by construction: the value at today is `settleTotals(totals, scheduled).expenses`, the
 * value at the last day is `totals.expenses`.
 *
 * The words live in `cashflowNarrative.ts` (`describeSpendingTrend`); this file prints nothing.
 */

import type { Expense } from '@/types/expenses';
import type { Period } from '@/lib/utils/period';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { getItalyDate, getItalyDateIso, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { isSpendingRow } from '@/lib/utils/tracciamentoSummary';

export type TrendComparisonId = 'media' | 'precedente' | 'annoPrima';

/** The pill's order. */
export const TREND_COMPARISON_IDS: readonly TrendComparisonId[] = ['media', 'precedente', 'annoPrima'];

/** The mean reaches back at most this many closed months. */
export const TREND_MAX_AVERAGE_MONTHS = 12;
/** A mean of one month is not a mean. */
export const TREND_MIN_AVERAGE_MONTHS = 2;

/** Where the comparison is remembered on the device (`'media' | 'precedente' | 'annoPrima'`). */
export const TREND_STORAGE_KEY = 'cashflow.andamento.confronto';

export type TrendMonthPeriod = Extract<Period, { kind: 'month' }>;

/** The words each comparison needs in a sentence, so the narrative holds no grammar of its own. */
export interface TrendComparisonPhrases {
  /** «della media degli ultimi 2 mesi», «di settembre», «di ottobre 2025». */
  than: string;
  /** «la media degli ultimi 2 mesi», «settembre», «ottobre 2025» — after «come». */
  like: string;
  /** «la media», «settembre», «ottobre 2025» — the tablet index's short reference. */
  short: string;
  /** «La media chiude il mese a», «Settembre ha chiuso a». */
  closes: string;
}

export interface TrendComparison {
  id: TrendComparisonId;
  /** The pill's text: «Media 12 mesi», «Settembre», «Ottobre 2025». */
  label: string;
  available: boolean;
  /** Why it is off — the pill's accessible name and title; null when available. */
  reason: string | null;
  /** Months behind a mean (0 for the other two and when off). */
  months: number;
  /** Cumulative spending over the period's axis (`daysInMonth` values); null when off. */
  series: number[] | null;
  /** The comparison's whole month (for a mean, the mean of the totals); null when off. */
  total: number | null;
  phrases: TrendComparisonPhrases;
}

export interface SpendingTrend {
  year: number;
  month: number;
  daysInMonth: number;
  relation: 'past' | 'current' | 'future';
  /** Today's day of the month in the current month, else null. */
  today: number | null;
  /** Cumulative spending already spent, day 1 … (`today` or `daysInMonth`; empty in a future month). */
  spent: number[];
  /** Cumulative spending with the calendar (every row of the month), `daysInMonth` values. */
  withCalendar: number[];
  /** The month's spending dated after today. */
  scheduledTotal: number;
  /** The three comparisons, in the pill's order. */
  comparisons: TrendComparison[];
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const monthIndex = (year: number, month: number): number => year * 12 + (month - 1);
const daysIn = (year: number, month: number): number => new Date(year, month, 0).getDate();

function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = monthIndex(year, month) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The comparison's value on day `day` of a month of `days` days: a shorter month stays flat on its total (D-AM7). */
function readAt(series: readonly number[], day: number): number {
  return series[Math.min(day, series.length) - 1] ?? 0;
}

function accumulate(daily: readonly number[]): number[] {
  let running = 0;
  return daily.map((value) => (running += value));
}

/**
 * The month's cumulative spending by day: `c[d - 1]` is the sum of the rows dated on or before day
 * `d`. Length `daysInMonth`.
 */
export function cumulativeByDay(rows: readonly Expense[], year: number, month: number): number[] {
  const daily = new Array<number>(daysIn(year, month)).fill(0);
  for (const row of rows) {
    if (!isSpendingRow(row)) continue;
    const date = getItalyDate(getExpenseDate(row.date));
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;
    daily[date.getDate() - 1] += Math.abs(row.amount);
  }
  return accumulate(daily);
}

interface Buckets {
  /** Daily spending per month index, summed in ONE pass over the window. */
  daily: Map<number, number[]>;
  /** The month of the first row of ANY type, null for no rows at all. */
  firstMonth: number | null;
}

function bucketRows(rows: readonly Expense[]): Buckets {
  const daily = new Map<number, number[]>();
  let firstMonth: number | null = null;
  for (const row of rows) {
    const date = getItalyDate(getExpenseDate(row.date));
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const index = monthIndex(year, month);
    if (firstMonth === null || index < firstMonth) firstMonth = index;
    if (!isSpendingRow(row)) continue;
    let days = daily.get(index);
    if (!days) {
      days = new Array<number>(daysIn(year, month)).fill(0);
      daily.set(index, days);
    }
    days[date.getDate() - 1] += Math.abs(row.amount);
  }
  return { daily, firstMonth };
}

const cumulativeOf = (buckets: Buckets, year: number, month: number): number[] =>
  accumulate(buckets.daily.get(monthIndex(year, month)) ?? new Array<number>(daysIn(year, month)).fill(0));

const monthLower = (month: number) => MONTH_NAMES[month - 1].toLowerCase();
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// ─── The trend ────────────────────────────────────────────────────────────────

/** Builds every figure of the tile for `period` (a month) from the rows of the tab's window. */
export function buildSpendingTrend(rows: readonly Expense[], period: TrendMonthPeriod, now: Date): SpendingTrend {
  const { year, month } = period;
  const daysInMonth = daysIn(year, month);
  const buckets = bucketRows(rows);
  const todayMonth = getItalyMonthYear(now);
  const todayIndex = monthIndex(todayMonth.year, todayMonth.month);
  const periodIndex = monthIndex(year, month);
  const relation = periodIndex > todayIndex ? 'future' : periodIndex === todayIndex ? 'current' : 'past';
  const today = relation === 'current' ? getItalyDate(now).getDate() : null;

  // The month's own days: every spending row, and the part already spent (on or before today).
  const withCalendar = cumulativeOf(buckets, year, month);
  const lastSpentDay = relation === 'past' ? daysInMonth : relation === 'current' ? (today ?? 0) : 0;
  const spent = relation === 'current' ? spentThroughToday(rows, year, month, daysInMonth, now).slice(0, lastSpentDay) : relation === 'past' ? withCalendar : [];
  const scheduledTotal = (withCalendar[daysInMonth - 1] ?? 0) - (spent[spent.length - 1] ?? 0);

  const first = buckets.firstMonth;
  const exists = (index: number) => first !== null && index >= first;

  // The mean: the closed months from the first month on, at most twelve, none after today's month.
  const lastClosed = Math.min(periodIndex, todayIndex) - 1;
  const averageStart = Math.max(first ?? Number.POSITIVE_INFINITY, lastClosed - TREND_MAX_AVERAGE_MONTHS + 1);
  const averageIndexes: number[] = [];
  for (let index = averageStart; index <= lastClosed; index++) averageIndexes.push(index);

  const average: TrendComparison = (() => {
    const months = averageIndexes.length;
    const phrases: TrendComparisonPhrases = {
      than: `della media degli ultimi ${months} mesi`,
      like: `la media degli ultimi ${months} mesi`,
      short: 'la media',
      closes: 'La media chiude il mese a',
    };
    if (months < TREND_MIN_AVERAGE_MONTHS) {
      return { id: 'media', label: 'Media', available: false, reason: 'Servono almeno 2 mesi chiusi', months: 0, series: null, total: null, phrases };
    }
    const series = new Array<number>(daysInMonth).fill(0);
    let total = 0;
    for (const index of averageIndexes) {
      const monthly = cumulativeOf(buckets, Math.floor(index / 12), (index % 12) + 1);
      for (let d = 1; d <= daysInMonth; d++) series[d - 1] += readAt(monthly, d) / months;
      total += (monthly[monthly.length - 1] ?? 0) / months;
    }
    return { id: 'media', label: `Media ${months} mesi`, available: true, reason: null, months, series, total, phrases };
  })();

  const single = (id: 'precedente' | 'annoPrima', target: { year: number; month: number }): TrendComparison => {
    const index = monthIndex(target.year, target.month);
    // The month's name carries its year when it is not the period's own (and a year ago always does).
    const withYear = id === 'annoPrima' || target.year !== year;
    const lower = withYear ? `${monthLower(target.month)} ${target.year}` : monthLower(target.month);
    const phrases: TrendComparisonPhrases = {
      than: `di ${lower}`,
      like: lower,
      short: lower,
      closes: `${capitalise(lower)} ha chiuso a`,
    };
    const label = capitalise(lower);
    // Closed means before today's month: a future period never compares with a month still running.
    if (!exists(index) || index >= todayIndex) {
      return { id, label, available: false, reason: `Nessun movimento a ${lower}`, months: 0, series: null, total: null, phrases };
    }
    const series = cumulativeOf(buckets, target.year, target.month);
    // Read through the period's axis: a shorter month stays flat on its total, a longer one is cut.
    const onAxis = Array.from({ length: daysInMonth }, (_, d) => readAt(series, d + 1));
    return { id, label, available: true, reason: null, months: 0, series: onAxis, total: series[series.length - 1] ?? 0, phrases };
  };

  const previous = shiftMonth(year, month, -1);
  const yearAgo = shiftMonth(year, month, -12);

  return {
    year,
    month,
    daysInMonth,
    relation,
    today,
    spent,
    withCalendar,
    scheduledTotal,
    comparisons: [average, single('precedente', previous), single('annoPrima', yearAgo)],
  };
}

/** Cumulative spending of the rows dated on or before today's Italian day, the later ones left out. */
function spentThroughToday(rows: readonly Expense[], year: number, month: number, daysInMonth: number, now: Date): number[] {
  const todayIso = getItalyDateIso(now);
  const daily = new Array<number>(daysInMonth).fill(0);
  for (const row of rows) {
    if (!isSpendingRow(row)) continue;
    const date = getExpenseDate(row.date);
    if (getItalyDateIso(date) > todayIso) continue;
    const zoned = getItalyDate(date);
    if (zoned.getFullYear() !== year || zoned.getMonth() + 1 !== month) continue;
    daily[zoned.getDate() - 1] += Math.abs(row.amount);
  }
  return accumulate(daily);
}

// ─── The comparison the reader sees ───────────────────────────────────────────

/** The stored value if it is one of the three, else null. */
export function parseTrendChoice(raw: string | null | undefined): TrendComparisonId | null {
  return raw === 'media' || raw === 'precedente' || raw === 'annoPrima' ? raw : null;
}

/**
 * The comparison drawn: the remembered one when it is available, else the mean, else last month,
 * else a year ago, else none (the area alone). An off comparison never erases the memory — the
 * caller keeps the stored value as it is.
 */
export function resolveTrendComparison(trend: SpendingTrend, stored: TrendComparisonId | null): TrendComparison | null {
  const available = trend.comparisons.filter((comparison) => comparison.available);
  const remembered = stored ? available.find((comparison) => comparison.id === stored) : undefined;
  return remembered ?? available[0] ?? null;
}

/** What the tile reads: the figures behind the sentence, unrounded. */
export interface TrendReading {
  relation: SpendingTrend['relation'];
  month: number;
  /** Today's day (current month only). */
  day: number | null;
  /** Spent at today, or over the whole month for a past one; 0 for a future month. */
  spent: number;
  /** The month's spending dated after today (a future month: everything). */
  scheduled: number;
  comparison: {
    comparison: TrendComparison;
    /** The comparison at the same day (current) or over the whole month (past); null for a future month. */
    reference: number | null;
    /** `spent − reference`; null for a future month. */
    delta: number | null;
    /** The comparison's whole month. */
    total: number;
  } | null;
}

export function readSpendingTrend(trend: SpendingTrend, chosen: TrendComparison | null): TrendReading {
  const spent = trend.spent[trend.spent.length - 1] ?? 0;
  const base = { relation: trend.relation, month: trend.month, day: trend.today, spent, scheduled: trend.scheduledTotal };
  if (!chosen || !chosen.series || chosen.total === null) return { ...base, comparison: null };
  if (trend.relation === 'future') return { ...base, comparison: { comparison: chosen, reference: null, delta: null, total: chosen.total } };
  // A past month is judged whole, a month in progress at the same day: the 31st against a 30-day month reads flat.
  const reference = trend.relation === 'past' ? chosen.total : readAt(chosen.series, trend.today ?? trend.daysInMonth);
  return { ...base, comparison: { comparison: chosen, reference, delta: spent - reference, total: chosen.total } };
}
