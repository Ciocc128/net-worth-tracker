/**
 * Dividend analytics pure utilities
 *
 * All the in-memory derivation behind the redesigned "Dividendi & Cedole" tab lives
 * here, free of React, Firestore and the DOM, so it can be unit-tested in isolation.
 * The tab fetches the full dividend list once and derives every period view from it,
 * exactly like the Cost Centers Panoramica — switching period is instant and needs no
 * refetch.
 *
 * MONEY:
 * Every figure is in EUR. We always prefer the converted *Eur fields (populated for
 * non-EUR dividends via Frankfurter) and fall back to the native amount for legacy or
 * already-EUR records. A dividend is "paid" once its payment date has passed; future
 * payment dates are "upcoming" (announced but not yet cashed).
 *
 * TIMEZONE:
 * Calendar boundaries are computed in Italy time via dateHelpers, so a coupon paid late
 * on 31/12 in Italy lands in the right month/year regardless of the server's UTC offset.
 * Every function accepts an explicit `now` for deterministic tests.
 */

import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Dividend } from '@/types/dividend';
import { toDate, getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';

// The period axis driving every figure on the tab. Mirrors the Cost Centers axis;
// "year" is the current calendar year (Jan 1 → now), which for a calendar-based tracker
// is the same as year-to-date — so we deliberately don't carry a separate YTD option.
export type DividendPeriod = 'month' | 'year' | 'rolling12' | 'all';

// Payers beyond this rank collapse into a single "Altri" slice in the ranked list, to
// keep the leaderboard readable instead of sprouting a long tail of tiny rows.
export const MAX_RANKED_PAYERS = 8;

const OTHER_PAYER_LABEL = 'Altri';

// ==================== Money helpers ====================

/** Net dividend in EUR (converted field when present, native amount otherwise). */
export function netEur(d: Dividend): number {
  return d.netAmountEur ?? d.netAmount;
}

/** Gross dividend in EUR. */
export function grossEur(d: Dividend): number {
  return d.grossAmountEur ?? d.grossAmount;
}

/** Withholding tax in EUR. */
export function taxEur(d: Dividend): number {
  return d.taxAmountEur ?? d.taxAmount;
}

/** A dividend is paid once its payment date is on or before `now`. */
export function isPaid(d: Dividend, now: Date): boolean {
  return toDate(d.paymentDate) <= now;
}

// ==================== Period filtering ====================

/** A {year, month} pair (month 1-based) used as an ordered month key. */
interface YearMonth {
  year: number;
  month: number;
}

function toYearMonth(date: Date): YearMonth {
  return { year: getItalyYear(date), month: getItalyMonth(date) };
}

/** Subtract `count` whole months from a {year, month} pair (month 1-based). */
function subtractMonths({ year, month }: YearMonth, count: number): YearMonth {
  const zeroBased = month - 1 - count;
  const y = year + Math.floor(zeroBased / 12);
  const m = ((zeroBased % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

function isOnOrAfter(a: YearMonth, b: YearMonth): boolean {
  return a.year !== b.year ? a.year > b.year : a.month >= b.month;
}

/** A noon Date that lands inside the given {year, month} regardless of timezone. */
function noonOf({ year, month }: YearMonth): Date {
  return new Date(year, month - 1, 15, 12, 0, 0);
}

/**
 * Returns the paid dividends whose payment date falls inside the given period window,
 * measured in Italy time relative to `now`. We filter on payment date (when the money
 * arrives) because that is what the user cares about for an income view.
 *
 * - month: the current calendar month
 * - year: the current calendar year (Jan 1 → now)
 * - rolling12: the trailing 12 calendar months, current month included
 * - all: every paid dividend
 */
export function filterPaidByPeriod(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): Dividend[] {
  const paid = dividends.filter((d) => isPaid(d, now));
  if (period === 'all') return paid;

  const current = toYearMonth(now);

  if (period === 'month') {
    return paid.filter((d) => {
      const ym = toYearMonth(toDate(d.paymentDate));
      return ym.year === current.year && ym.month === current.month;
    });
  }

  if (period === 'year') {
    return paid.filter((d) => getItalyYear(toDate(d.paymentDate)) === current.year);
  }

  // rolling12: lower bound is 11 months before the current month
  const lowerBound = subtractMonths(current, 11);
  return paid.filter((d) => isOnOrAfter(toYearMonth(toDate(d.paymentDate)), lowerBound));
}

/**
 * Number of calendar months spanned by the period window, used as the denominator for
 * the monthly average and the income-coverage ratio. For "all" it spans from the first
 * paid dividend to now.
 */
export function monthsInWindow(
  period: DividendPeriod,
  paidDividends: Dividend[],
  now: Date,
): number {
  switch (period) {
    case 'month':
      return 1;
    case 'year':
      return getItalyMonth(now); // months elapsed this year (1-based)
    case 'rolling12':
      return 12;
    case 'all': {
      if (paidDividends.length === 0) return 1;
      const first = paidDividends.reduce(
        (min, d) => (toDate(d.paymentDate) < min ? toDate(d.paymentDate) : min),
        toDate(paidDividends[0].paymentDate),
      );
      const a = toYearMonth(first);
      const b = toYearMonth(now);
      return Math.max(1, (b.year - a.year) * 12 + (b.month - a.month) + 1);
    }
  }
}

// ==================== Period summary (hero + KPI grid) ====================

export interface DividendPeriodSummary {
  net: number;
  gross: number;
  tax: number;
  count: number;
  // Net divided by the calendar months in the window — a true monthly average, so a
  // lumpy semi-annual payer reads as the modest monthly income it really is.
  averageMonthlyNet: number;
}

/**
 * Aggregate net / gross / tax for the paid dividends in the period — the figures behind
 * the hero number and the KPI chip grid.
 */
export function computePeriodSummary(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): DividendPeriodSummary {
  const scoped = filterPaidByPeriod(dividends, period, now);
  const net = scoped.reduce((sum, d) => sum + netEur(d), 0);
  const gross = scoped.reduce((sum, d) => sum + grossEur(d), 0);
  const tax = scoped.reduce((sum, d) => sum + taxEur(d), 0);
  return {
    net,
    gross,
    tax,
    count: scoped.length,
    averageMonthlyNet: net / monthsInWindow(period, scoped, now),
  };
}

export interface DividendNetComparison {
  current: number;
  previous: number;
  // Signed fraction (e.g. 0.2 = +20%). null when there is no comparable predecessor
  // (the "all" period) or the previous window had zero income.
  deltaPct: number | null;
}

/**
 * Compares the current period's net income against the immediately preceding comparable
 * window: previous month, previous year, or the 12 months before the trailing year.
 * Drives the variation chip under the hero. "all" has no predecessor → deltaPct null.
 */
export function computeNetComparison(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): DividendNetComparison {
  const net = (list: Dividend[]) => list.reduce((sum, d) => sum + netEur(d), 0);
  const current = net(filterPaidByPeriod(dividends, period, now));

  if (period === 'all') return { current, previous: 0, deltaPct: null };

  const shift = period === 'month' ? 1 : 12;
  const prevNow = noonOf(subtractMonths(toYearMonth(now), shift));
  const previous = net(filterPaidByPeriod(dividends, period, prevNow));

  const deltaPct = previous > 0 ? (current - previous) / previous : null;
  return { current, previous, deltaPct };
}

/**
 * Total net of dividends announced but not yet paid (payment date in the future).
 * Independent of the selected period — "in arrivo" is always forward-looking.
 */
export function computeUpcomingNet(dividends: Dividend[], now: Date = new Date()): number {
  return dividends
    .filter((d) => !isPaid(d, now))
    .reduce((sum, d) => sum + netEur(d), 0);
}

// ==================== Payer ranking (leaderboard) ====================

export interface PayerRow {
  assetId: string;
  assetTicker: string;
  assetName: string;
  net: number;
  count: number;
}

/**
 * Ranks the period's payers by net income, descending. Payers past MAX_RANKED_PAYERS
 * collapse into a single "Altri" row so the leaderboard stays scannable.
 */
export function rankPayers(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): PayerRow[] {
  const scoped = filterPaidByPeriod(dividends, period, now);

  const byAsset = new Map<string, PayerRow>();
  for (const d of scoped) {
    const row = byAsset.get(d.assetId) ?? {
      assetId: d.assetId,
      assetTicker: d.assetTicker,
      assetName: d.assetName,
      net: 0,
      count: 0,
    };
    row.net += netEur(d);
    row.count += 1;
    byAsset.set(d.assetId, row);
  }

  const sorted = [...byAsset.values()].sort((a, b) => b.net - a.net);
  if (sorted.length <= MAX_RANKED_PAYERS) return sorted;

  const head = sorted.slice(0, MAX_RANKED_PAYERS);
  const tail = sorted.slice(MAX_RANKED_PAYERS);
  head.push({
    assetId: OTHER_PAYER_LABEL,
    assetTicker: OTHER_PAYER_LABEL,
    assetName: `${tail.length} altri strumenti`,
    net: tail.reduce((sum, r) => sum + r.net, 0),
    count: tail.reduce((sum, r) => sum + r.count, 0),
  });
  return head;
}

// ==================== Time series (sparkline + charts) ====================

/** Enumerate a gap-free, inclusive month axis from `start` to `end`. */
function enumerateMonths(start: YearMonth, end: YearMonth): YearMonth[] {
  const months: YearMonth[] = [];
  let cursor = start;
  while (isOnOrAfter(end, cursor)) {
    months.push(cursor);
    cursor = subtractMonths(cursor, -1); // add one month
  }
  return months;
}

function monthLabel(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), 'MMM yy', { locale: it });
}

export interface MonthlyNetPoint {
  label: string;
  year: number;
  month: number;
  net: number;
}

/**
 * Gap-free monthly net-income series across the paid dividends, oldest → newest.
 * Feeds both the hero sparkline and the monthly chart. `maxMonths`, when given, keeps
 * only the most recent N months (e.g. 12 for the sparkline).
 */
export function buildMonthlyNetSeries(
  dividends: Dividend[],
  now: Date = new Date(),
  maxMonths?: number,
): MonthlyNetPoint[] {
  const paid = dividends.filter((d) => isPaid(d, now));
  if (paid.length === 0) return [];

  const dates = paid.map((d) => toDate(d.paymentDate));
  const first = toYearMonth(dates.reduce((min, d) => (d < min ? d : min), dates[0]));
  const last = toYearMonth(dates.reduce((max, d) => (d > max ? d : max), dates[0]));
  let axis = enumerateMonths(first, last);
  if (maxMonths && axis.length > maxMonths) axis = axis.slice(-maxMonths);

  const netByKey = new Map<string, number>();
  for (const d of paid) {
    const ym = toYearMonth(toDate(d.paymentDate));
    const key = `${ym.year}-${ym.month}`;
    netByKey.set(key, (netByKey.get(key) ?? 0) + netEur(d));
  }

  return axis.map(({ year, month }) => ({
    label: monthLabel(year, month),
    year,
    month,
    net: netByKey.get(`${year}-${month}`) ?? 0,
  }));
}

export interface YearlyNetPoint {
  year: number;
  gross: number;
  tax: number;
  net: number;
}

/**
 * Net / gross / tax grouped by calendar year of payment, oldest → newest. Feeds the
 * "Dividendi per anno" bar chart.
 */
export function buildYearlySeries(
  dividends: Dividend[],
  now: Date = new Date(),
): YearlyNetPoint[] {
  const paid = dividends.filter((d) => isPaid(d, now));
  const byYear = new Map<number, YearlyNetPoint>();
  for (const d of paid) {
    const year = getItalyYear(toDate(d.paymentDate));
    const entry = byYear.get(year) ?? { year, gross: 0, tax: 0, net: 0 };
    entry.gross += grossEur(d);
    entry.tax += taxEur(d);
    entry.net += netEur(d);
    byYear.set(year, entry);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

// ==================== Reliability (B2) ====================

export interface DividendReliability {
  // How many distinct calendar months in the window actually had income.
  monthsWithIncome: number;
  monthsInWindow: number;
  // monthsWithIncome / monthsInWindow — how "smooth" the income stream is (0..1).
  coveragePct: number;
  // Largest single payer's share of the window's net income (0..1).
  topPayerSharePct: number;
  topPayerTicker: string | null;
  // Herfindahl-Hirschman index over payer shares (0..1). 1 = a single payer; lower =
  // more diversified. A blunt but honest concentration signal for an income stream.
  concentrationHhi: number;
  payerCount: number;
}

/**
 * Derives two risk signals for the income stream over the period (B2):
 * smoothness (how many months actually paid) and concentration (how dependent the
 * income is on one or two payers). Both are latent in the data but never surfaced today.
 */
export function computeReliability(
  dividends: Dividend[],
  period: DividendPeriod,
  now: Date = new Date(),
): DividendReliability {
  const scoped = filterPaidByPeriod(dividends, period, now);
  const totalMonths = monthsInWindow(period, scoped, now);

  // Distinct paid months in the window.
  const paidMonths = new Set<string>();
  // Net per payer, for concentration.
  const netByAsset = new Map<string, { ticker: string; net: number }>();
  let totalNet = 0;

  for (const d of scoped) {
    const ym = toYearMonth(toDate(d.paymentDate));
    paidMonths.add(`${ym.year}-${ym.month}`);

    const net = netEur(d);
    totalNet += net;
    const entry = netByAsset.get(d.assetId) ?? { ticker: d.assetTicker, net: 0 };
    entry.net += net;
    netByAsset.set(d.assetId, entry);
  }

  const monthsWithIncome = paidMonths.size;
  const coveragePct = totalMonths > 0 ? monthsWithIncome / totalMonths : 0;

  let topPayerSharePct = 0;
  let topPayerTicker: string | null = null;
  let concentrationHhi = 0;
  if (totalNet > 0) {
    for (const { ticker, net } of netByAsset.values()) {
      const share = net / totalNet;
      concentrationHhi += share * share;
      if (share > topPayerSharePct) {
        topPayerSharePct = share;
        topPayerTicker = ticker;
      }
    }
  }

  return {
    monthsWithIncome,
    monthsInWindow: totalMonths,
    coveragePct,
    topPayerSharePct,
    topPayerTicker,
    concentrationHhi,
    payerCount: netByAsset.size,
  };
}

// ==================== Period → date bounds (for the stats API) ====================

/**
 * Resolves the selected period to concrete {startDate, endDate} bounds, so the
 * server-computed advanced sections (YOC, DPS growth, total return) stay consistent
 * with the in-memory period axis. "all" returns undefined bounds (no date filter).
 */
export function periodToDateBounds(
  period: DividendPeriod,
  now: Date = new Date(),
): { startDate?: Date; endDate?: Date } {
  if (period === 'all') return {};

  const current = toYearMonth(now);

  if (period === 'month') {
    return {
      startDate: new Date(current.year, current.month - 1, 1, 0, 0, 0),
      endDate: now,
    };
  }

  if (period === 'year') {
    return { startDate: new Date(current.year, 0, 1, 0, 0, 0), endDate: now };
  }

  // rolling12
  const lower = subtractMonths(current, 11);
  return {
    startDate: new Date(lower.year, lower.month - 1, 1, 0, 0, 0),
    endDate: now,
  };
}
