/**
 * The monthly totals of the expenses, as the readers see them (doc/totali-mensili/README.md § 4).
 *
 * Pure: no SDK. The server rebuilds a month with `buildMonthTotals` (lib/server/expenseTotals.ts),
 * and every reader of Fase A receives ONE list from `loadExpenseFlows`, whatever reads the
 * documents (the client SDK in the browser, the Admin SDK in the cron):
 *
 *   - a CLOSED month whose totals are trustworthy arrives as «aggregated rows», one `Expense` per
 *     cell, dated the 15th at noon Italian time — the same month in every calendar (Italian, the
 *     browser's, UTC), which is all the Fase A readers look at;
 *   - the RUNNING month, and any month the totals cannot vouch for (§ 4.3), arrives as its real rows.
 *
 * A month is never both (D-TM3). The readers SUM `amount` by month, type and category, so the
 * figures are the same (D-TM1, `__tests__/expenseTotalsInvariance.test.ts`); one that COUNTS rows
 * across months reads `rowCountOf`.
 *
 * Future months live in the totals too (2026-11-23, impl): the Hall of Fame's yearly records and
 * FIRE's running year count the rows already in the calendar, and a mortgage to 2045 would
 * otherwise be hundreds of rows read at every visit. So a writer asks for the rebuild of every
 * month that is not the running one (`monthsToRebuild`), and only the running month is read live.
 */

import { fromZonedTime } from 'date-fns-tz';
import type { Expense } from '@/types/expenses';
import {
  EXPENSE_TOTALS_SCHEMA_VERSION,
  type ExpenseTotalsCell,
  type ExpenseTotalsMonth,
  type ExpenseTotalsYear,
  type ItalyMonth,
} from '@/types/expenseTotals';
import { ITALY_TIMEZONE, getItalyMonthYear } from '@/lib/utils/dateHelpers';

/** An aggregated row's id prefix: never a Firestore id (those have no colon). */
export const AGGREGATED_ROW_PREFIX = 'agg:';

/** Sum tolerance of the nightly check and of the invariance tests (D-TM1). */
export const EXPENSE_TOTALS_SUM_TOLERANCE = 0.005;

// ─── Months ──────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

export function monthKeyOf(month: number): string {
  return pad2(month);
}

/** `YYYY-MM`: how the rebuild route names a month. */
export function italyMonthLabel(m: ItalyMonth): string {
  return `${m.year}-${pad2(m.month)}`;
}

export function parseItalyMonthLabel(label: string): ItalyMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(label);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function italyMonthOf(date: Date): ItalyMonth {
  return getItalyMonthYear(date);
}

export function monthIndex(m: ItalyMonth): number {
  return m.year * 12 + (m.month - 1);
}

export function monthFromIndex(index: number): ItalyMonth {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The first instant of an Italian month. */
export function italyMonthStart(m: ItalyMonth): Date {
  const normalised = monthFromIndex(monthIndex(m));
  return fromZonedTime(`${normalised.year}-${pad2(normalised.month)}-01T00:00:00.000`, ITALY_TIMEZONE);
}

/** The last instant of an Italian month (one millisecond before the next one opens). */
export function italyMonthEnd(m: ItalyMonth): Date {
  return new Date(italyMonthStart(monthFromIndex(monthIndex(m) + 1)).getTime() - 1);
}

/** The 15th at noon, Italian time: inside the month in every calendar. */
export function aggregatedRowDate(m: ItalyMonth): Date {
  return fromZonedTime(`${m.year}-${pad2(m.month)}-15T12:00:00.000`, ITALY_TIMEZONE);
}

// ─── Building ───────────────────────────────────────────────────────────────

/** A row's cell, as a string key. */
function cellKeyOf(row: Expense): string {
  return [
    row.type ?? 'unclassified',
    row.categoryId ?? '',
    row.subCategoryId ?? '',
    row.feeOfTradeId ? 'fee' : '',
    row.amount < 0 ? '-' : '+',
  ].join('\u0000');
}

const timeOf = (value: unknown): number => (value instanceof Date ? value.getTime() : 0);

/**
 * The totals of ONE month from its rows (§ 5.1), without `builtAt` (the caller stamps it).
 * The cells are sorted (type, category, subcategory, fee, sign) so a rebuild of the same rows writes
 * the same document.
 */
export function buildMonthTotals(rows: Expense[]): Omit<ExpenseTotalsMonth, 'builtAt'> {
  const cells = new Map<string, ExpenseTotalsCell & { newest: [number, number] }>();
  let amountSum = 0;
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    amountSum += amount;
    const key = cellKeyOf(row);
    const recency: [number, number] = [timeOf(row.updatedAt), timeOf(row.date)];
    const current = cells.get(key);
    if (!current) {
      cells.set(key, {
        type: row.type ?? 'unclassified',
        categoryId: row.categoryId ?? '',
        categoryName: row.categoryName ?? '',
        subCategoryId: row.subCategoryId ?? null,
        subCategoryName: row.subCategoryName ?? null,
        tradeFee: !!row.feeOfTradeId,
        negative: amount < 0,
        sum: amount,
        count: 1,
        newest: recency,
      });
      continue;
    }
    current.sum += amount;
    current.count += 1;
    const newer = recency[0] > current.newest[0] || (recency[0] === current.newest[0] && recency[1] > current.newest[1]);
    if (newer) {
      current.newest = recency;
      current.categoryName = row.categoryName ?? '';
      current.subCategoryName = row.subCategoryName ?? null;
    }
  }
  const sorted = [...cells.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, cell]) => {
      const { newest: _newest, ...rest } = cell;
      return rest;
    });
  return { rowCount: rows.length, amountSum, cells: sorted };
}

/** The twelve months of a year from the rows of that year (any order; rows of other years are ignored). */
export function buildYearTotals(userId: string, year: number, rows: Expense[], builtAt: Date): ExpenseTotalsYear {
  const byMonth = new Map<number, Expense[]>();
  for (const row of rows) {
    const m = italyMonthOf(row.date);
    if (m.year !== year) continue;
    const list = byMonth.get(m.month) ?? [];
    list.push(row);
    byMonth.set(m.month, list);
  }
  const months: ExpenseTotalsYear['months'] = {};
  for (let month = 1; month <= 12; month++) {
    months[monthKeyOf(month)] = { builtAt, ...buildMonthTotals(byMonth.get(month) ?? []) };
  }
  return { userId, year, schemaVersion: EXPENSE_TOTALS_SCHEMA_VERSION, months };
}

// ─── Reading ────────────────────────────────────────────────────────────────

/** How many real rows a row stands for: an aggregated row carries its cell's count. */
export function rowCountOf(row: Expense): number {
  return row.aggregateCount ?? 1;
}

export function isAggregatedRow(row: Expense): boolean {
  return row.id.startsWith(AGGREGATED_ROW_PREFIX);
}

/**
 * The cells of one month as rows. `excludeCategoryId` leaves out a category whose REAL rows the
 * caller reads instead (Rendimenti's dividend category, § 6.4).
 */
export function aggregatedRowsOf(
  userId: string,
  m: ItalyMonth,
  totals: ExpenseTotalsMonth,
  excludeCategoryId?: string,
): Expense[] {
  const date = aggregatedRowDate(m);
  const rows: Expense[] = [];
  totals.cells.forEach((cell, index) => {
    if (excludeCategoryId && cell.categoryId === excludeCategoryId) return;
    const row: Expense = {
      id: `${AGGREGATED_ROW_PREFIX}${italyMonthLabel(m)}:${index}`,
      userId,
      // A legacy row without `type` stays without it: every reader skips it the same way.
      type: (cell.type === 'unclassified' ? undefined : cell.type) as Expense['type'],
      categoryId: cell.categoryId,
      categoryName: cell.categoryName,
      amount: cell.sum,
      currency: 'EUR',
      date,
      createdAt: totals.builtAt,
      updatedAt: totals.builtAt,
      aggregateCount: cell.count,
    };
    if (cell.subCategoryId !== null) row.subCategoryId = cell.subCategoryId;
    if (cell.subCategoryName !== null) row.subCategoryName = cell.subCategoryName;
    if (cell.tradeFee) row.feeOfTradeId = 'agg';
    rows.push(row);
  });
  return rows;
}

export interface ExpenseFlowPlan {
  /** Months read from the totals. */
  totalsMonths: ItalyMonth[];
  /** Months read from their rows: the running one, and those the totals cannot vouch for. */
  liveMonths: ItalyMonth[];
  /** `liveMonths` as contiguous instants, both ends included: one query each. */
  liveRanges: { from: Date; to: Date }[];
}

/**
 * Which months come from the totals and which from the rows (§ 4.3).
 *
 * A month is read FROM ITS ROWS when it is the running Italian month, when its year has no
 * document with the current `schemaVersion` (CU10: the deploy before the migration reads as today),
 * when the document has no entry for it, or — a CLOSED month — when it was last rebuilt before it
 * ended: the 1st of the month before the cron, the rows saved after the last evening's run are not
 * in it. Everything else comes from the totals.
 *
 * @param years - The account's year documents (any subset; a missing year reads from rows)
 * @param bounds - The dates of the oldest and newest row, or null: an account with no rows reads nothing
 * @param now - The reader's clock
 * @param from - The reader's first instant, when it needs less than the whole history
 */
export function planExpenseFlows(
  years: ExpenseTotalsYear[],
  bounds: { oldest: Date; newest: Date } | null,
  now: Date,
  from?: Date | null,
): ExpenseFlowPlan {
  const plan: ExpenseFlowPlan = { totalsMonths: [], liveMonths: [], liveRanges: [] };
  if (!bounds) return plan;
  const byYear = new Map(years.map((y) => [y.year, y]));
  const current = monthIndex(italyMonthOf(now));
  let first = monthIndex(italyMonthOf(bounds.oldest));
  if (from) first = Math.max(first, monthIndex(italyMonthOf(from)));
  const last = Math.max(monthIndex(italyMonthOf(bounds.newest)), current);

  let run: [number, number] | null = null;
  const closeRun = () => {
    if (!run) return;
    plan.liveRanges.push({ from: italyMonthStart(monthFromIndex(run[0])), to: italyMonthEnd(monthFromIndex(run[1])) });
    run = null;
  };
  for (let index = first; index <= last; index++) {
    const m = monthFromIndex(index);
    const doc = byYear.get(m.year);
    const entry = doc && doc.schemaVersion === EXPENSE_TOTALS_SCHEMA_VERSION ? doc.months[monthKeyOf(m.month)] : undefined;
    const trustworthy =
      index !== current && !!entry && (index > current || entry.builtAt.getTime() >= italyMonthEnd(m).getTime());
    if (trustworthy) {
      plan.totalsMonths.push(m);
      closeRun();
      continue;
    }
    plan.liveMonths.push(m);
    if (run && run[1] === index - 1) run[1] = index;
    else {
      closeRun();
      run = [index, index];
    }
  }
  closeRun();
  return plan;
}

/** Newest first, as `getAllExpenses` orders the rows. */
const byDateDesc = (a: Expense, b: Expense) => b.date.getTime() - a.date.getTime();

/**
 * The list a reader receives: aggregated rows for the totals months, real rows for the live ones
 * (rows outside the live months are dropped, so a range that reads a little wide cannot count a
 * month twice), and — Rendimenti — the real rows of `excludeCategoryId` for the totals months.
 */
export function mergeExpenseFlows(
  userId: string,
  plan: ExpenseFlowPlan,
  years: ExpenseTotalsYear[],
  liveRows: Expense[],
  options: { excludeCategoryId?: string; categoryRows?: Expense[] } = {},
): Expense[] {
  const byYear = new Map(years.map((y) => [y.year, y]));
  const live = new Set(plan.liveMonths.map(monthIndex));
  const fromTotals = new Set(plan.totalsMonths.map(monthIndex));
  const out: Expense[] = [];
  const seen = new Set<string>();
  for (const row of liveRows) {
    if (!live.has(monthIndex(italyMonthOf(row.date))) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  for (const m of plan.totalsMonths) {
    const entry = byYear.get(m.year)?.months[monthKeyOf(m.month)];
    if (entry) out.push(...aggregatedRowsOf(userId, m, entry, options.excludeCategoryId));
  }
  if (options.excludeCategoryId) {
    for (const row of options.categoryRows ?? []) {
      if (row.categoryId !== options.excludeCategoryId || seen.has(row.id)) continue;
      if (!fromTotals.has(monthIndex(italyMonthOf(row.date)))) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out.sort(byDateDesc);
}

/** What `loadExpenseFlows` reads, from whichever SDK. */
export interface ExpenseFlowSource {
  /** The dates of the oldest and newest row (two one-document reads), or null with no rows. */
  readBounds(): Promise<{ oldest: Date; newest: Date } | null>;
  /** The year documents of `years` that exist (one read each). */
  readYears(years: number[]): Promise<ExpenseTotalsYear[]>;
  /** The rows dated inside `[from, to]`. */
  readRows(from: Date, to: Date): Promise<Expense[]>;
  /** Every row of one category (Rendimenti's dividends). */
  readCategoryRows?(categoryId: string): Promise<Expense[]>;
}

export interface LoadExpenseFlowsOptions {
  now: Date;
  /** The reader's first instant (FIRE's recent window, Rendimenti's first snapshot). */
  from?: Date | null;
  /** A category read from its real rows in every month (Rendimenti, § 6.4). */
  realRowsCategoryId?: string;
}

/**
 * THE reader of Fase A: bounds (2 reads) + the year documents (Y) + the live months' rows (the running
 * month: Em) + — Rendimenti — the dividend category's rows.
 */
export async function loadExpenseFlows(
  userId: string,
  source: ExpenseFlowSource,
  options: LoadExpenseFlowsOptions,
): Promise<Expense[]> {
  const bounds = await source.readBounds();
  if (!bounds) return [];
  const firstYear = italyMonthOf(options.from && options.from > bounds.oldest ? options.from : bounds.oldest).year;
  const lastYear = Math.max(italyMonthOf(bounds.newest).year, italyMonthOf(options.now).year);
  const wanted: number[] = [];
  for (let year = firstYear; year <= lastYear; year++) wanted.push(year);
  const years = await source.readYears(wanted);
  const plan = planExpenseFlows(years, bounds, options.now, options.from);
  const realCategory = options.realRowsCategoryId && source.readCategoryRows ? options.realRowsCategoryId : undefined;
  const [liveChunks, categoryRows] = await Promise.all([
    Promise.all(plan.liveRanges.map((range) => source.readRows(range.from, range.to))),
    realCategory && plan.totalsMonths.length > 0 ? source.readCategoryRows!(realCategory) : Promise.resolve([] as Expense[]),
  ]);
  return mergeExpenseFlows(userId, plan, years, liveChunks.flat(), {
    excludeCategoryId: realCategory,
    categoryRows,
  });
}

// ─── Writing ────────────────────────────────────────────────────────────────

/**
 * The months a write must have rebuilt (§ 5.2): those of `dates`, minus the running Italian month
 * (read from its rows, rebuilt by the cron every evening — D-TM4), deduplicated and in order.
 */
export function monthsToRebuild(dates: Array<Date | null | undefined>, now: Date): ItalyMonth[] {
  const current = monthIndex(italyMonthOf(now));
  const indexes = new Set<number>();
  for (const date of dates) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) continue;
    const index = monthIndex(italyMonthOf(date));
    if (index !== current) indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b).map(monthFromIndex);
}

/** Σ rowCount and Σ amountSum of the months of a year document: what the nightly check compares. */
export function yearTotalsSummary(doc: ExpenseTotalsYear): { rowCount: number; amountSum: number } {
  let rowCount = 0;
  let amountSum = 0;
  for (const entry of Object.values(doc.months)) {
    if (!entry) continue;
    rowCount += entry.rowCount;
    amountSum += entry.amountSum;
  }
  return { rowCount, amountSum };
}

export function totalsDiffer(a: { rowCount: number; amountSum: number }, b: { rowCount: number; amountSum: number }): boolean {
  return a.rowCount !== b.rowCount || Math.abs(a.amountSum - b.amountSum) > EXPENSE_TOTALS_SUM_TOLERANCE;
}
