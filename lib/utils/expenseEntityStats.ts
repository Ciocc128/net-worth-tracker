/**
 * Entity dossier statistics — the numbers behind ONE category (optionally narrowed to a
 * subcategory): per-year table, run-rate strip and monthly series.
 *
 * WHY ONE MODULE
 * The EntityDossier renders three views of the same entity, and they must agree on what
 * "the entity" is. Row selection is therefore always selectExpensesForDrillDown, so the
 * dossier can never disagree with the drill-down the user clicked through (key by id,
 * label by name — see expenseGrouping). Income entities go through the same code paths:
 * every figure is a magnitude (Math.abs), which reads the same on both sides of the
 * ledger, and classification is always by `type`, never by sign.
 *
 * TIME
 * The month resolver is injected (same pattern as detectSpendingAnomalies): this module
 * knows nothing about timezones; callers pass the Italy-timezone resolver. Months are
 * 1-12. `historyStartYear` acts as a global data floor: rows dated before January of
 * that year are invisible to every figure here, and windows clamp at the floor instead
 * of padding below it.
 */

import { Expense } from '@/types/expenses';
import { MONTH_NAMES } from '@/lib/constants/months';
import { selectExpensesForDrillDown, type CategoryScope } from '@/lib/utils/expenseGrouping';

/**
 * The entity a dossier is about: a category, optionally narrowed to one subcategory.
 * NO_SUBCATEGORY_KEY is a valid subcategory key — it selects exactly the rows that
 * carry no subcategory (see getSubCategoryKey).
 */
export interface EntityScope {
  category: CategoryScope;
  subCategory?: { key: string };
}

export interface EntityYearRow {
  year: number;
  /** Magnitude over the year, or year-to-date (months 1..now.month) for the partial year. */
  total: number;
  /** True only for now.year, regardless of how far the year has progressed. */
  isPartial: boolean;
  /**
   * Partial row only: months 1..now.month of (year − 1), the like-for-like baseline for
   * its delta; null when (year − 1) falls before historyStartYear. Always null on full
   * rows — their baseline is the previous row's total.
   */
  prevSameMonthsTotal: number | null;
  /**
   * Partial row: total − prevSameMonthsTotal. Full rows: total − previous year row's
   * total. Null when no baseline exists (oldest row, or a partial row with no
   * comparable previous year).
   */
  delta: number | null;
  /** Delta as a share of its baseline, in percent; null when delta is null or the baseline is 0. */
  deltaPercent: number | null;
}

/** Magnitudes everywhere: a refund does not read negative, income reads like spending. */
const magnitude = (expense: Expense): number => Math.abs(expense.amount);

/** Absolute month index (year × 12 + month − 1), for calendar arithmetic without Date objects. */
const toMonthIndex = (when: { year: number; month: number }): number => when.year * 12 + (when.month - 1);

const fromMonthIndex = (index: number): { year: number; month: number } => ({
  year: Math.floor(index / 12),
  month: (index % 12) + 1,
});

/** 'YYYY-MM', zero-padded so keys sort lexically in chronological order. */
const monthKey = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}`;

/** Entity magnitude per month, floored at January of historyStartYear. */
function sumEntityByMonth(
  entityRows: Expense[],
  historyStartYear: number,
  monthOf: (expense: Expense) => { year: number; month: number }
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of entityRows) {
    const when = monthOf(row);
    if (when.year < historyStartYear) continue;
    const key = monthKey(when.year, when.month);
    totals.set(key, (totals.get(key) ?? 0) + magnitude(row));
  }
  return totals;
}

/**
 * The per-year table of an entity's history, NEWEST FIRST.
 *
 * Rows run from now.year down to the first year with entity data at or after the floor;
 * zero-spend years in between are included — a zero year is information, not a gap. An
 * entity with no data at or after the floor gets no rows at all.
 *
 * The current-year row is partial: its total is year-to-date and its delta compares
 * against the SAME months of the previous year, never the full previous year. Full
 * rows chain: each one's baseline is the row below it, so the oldest row has no delta.
 *
 * @param expenses         Every row available; the entity is selected here, never pre-filtered.
 * @param scope            The entity (category, optional subcategory) — keyed by id.
 * @param historyStartYear Global data floor; rows before January of this year are ignored.
 * @param now              Current Italy-timezone year/month (month 1-12), resolved by the caller.
 * @param monthOf          Injected month resolver for a row (month 1-12).
 */
export function buildEntityYearRows(
  expenses: Expense[],
  scope: EntityScope,
  historyStartYear: number,
  now: { year: number; month: number },
  monthOf: (expense: Expense) => { year: number; month: number }
): EntityYearRow[] {
  const entityRows = selectExpensesForDrillDown(expenses, scope.category, scope.subCategory);

  // Per-month buckets rather than per-year totals, because the partial row and its
  // baseline both need a months-1..now.month slice of a year.
  const monthTotalsByYear = new Map<number, number[]>();
  let firstYearWithData: number | null = null;
  for (const row of entityRows) {
    const when = monthOf(row);
    if (when.year < historyStartYear) continue;
    const months = monthTotalsByYear.get(when.year) ?? new Array<number>(12).fill(0);
    months[when.month - 1] += magnitude(row);
    monthTotalsByYear.set(when.year, months);
    if (firstYearWithData === null || when.year < firstYearWithData) firstYearWithData = when.year;
  }

  if (firstYearWithData === null) return [];

  const fullYearTotal = (year: number): number =>
    (monthTotalsByYear.get(year) ?? []).reduce((sum, value) => sum + value, 0);
  const sameMonthsTotal = (year: number): number =>
    (monthTotalsByYear.get(year) ?? []).slice(0, now.month).reduce((sum, value) => sum + value, 0);

  const rows: EntityYearRow[] = [];
  for (let year = now.year; year >= firstYearWithData; year--) {
    const isPartial = year === now.year;
    const total = isPartial ? sameMonthsTotal(year) : fullYearTotal(year);

    let prevSameMonthsTotal: number | null = null;
    let delta: number | null = null;
    let deltaPercent: number | null = null;

    if (isPartial) {
      // A previous year inside history but without entity data is a 0 baseline, not a
      // missing one: "you spent nothing on this last year" is a real comparison.
      prevSameMonthsTotal = year - 1 >= historyStartYear ? sameMonthsTotal(year - 1) : null;
      if (prevSameMonthsTotal !== null) {
        delta = total - prevSameMonthsTotal;
        deltaPercent = prevSameMonthsTotal !== 0 ? (delta / prevSameMonthsTotal) * 100 : null;
      }
    } else if (year - 1 >= firstYearWithData) {
      const baseline = fullYearTotal(year - 1);
      delta = total - baseline;
      deltaPercent = baseline !== 0 ? (delta / baseline) * 100 : null;
    }

    rows.push({ year, total, isPartial, prevSameMonthsTotal, delta, deltaPercent });
  }

  return rows;
}

export interface EntityRunRate {
  /** Entity magnitude over the page period. */
  periodTotal: number;
  /** periodTotal / elapsed months in the period; null for the all-history period. */
  periodMonthlyAverage: number | null;
  /** Entity magnitude over the trailing 12-month window ending at now (inclusive). */
  trailing12Total: number;
  /** trailing12Total / observedMonths; 0 when observedMonths is 0. */
  trailing12MonthlyAverage: number;
  /**
   * Months of the trailing window not before historyStartYear (≤ 12) — declared to the
   * UI so a short window is never silently presented as a full year.
   */
  observedMonths: number;
  /** (periodTotal / now.month) × 12, only when the period is the current year with no month; else null. */
  currentYearProjection: number | null;
  /**
   * periodTotal as a share (0-1) of the same-side period total: all income magnitude
   * for an income entity, all spending magnitude (type ≠ income/transfer) otherwise.
   * Null when that denominator is 0.
   */
  shareOfPeriodTotal: number | null;
}

/**
 * The run-rate strip: what the entity costs (or yields) per period, per month, and on a
 * trailing-12 basis.
 *
 * Elapsed months in the period: 1 for a single month, now.month for the current year,
 * 12 for a completed year. The all-history period ({null, null}) is floored at
 * historyStartYear and has no meaningful monthly average or projection.
 *
 * @param expenses         Every row available — also the pool for the same-side denominator.
 * @param scope            The entity (category, optional subcategory) — keyed by id.
 * @param period           Page period state: {y, m} single month · {y, null} year · {null, null} all history.
 * @param historyStartYear Global data floor; rows before January of this year are ignored.
 * @param now              Current Italy-timezone year/month (month 1-12), resolved by the caller.
 * @param monthOf          Injected month resolver for a row (month 1-12).
 */
export function computeEntityRunRate(
  expenses: Expense[],
  scope: EntityScope,
  period: { year: number | null; month: number | null },
  historyStartYear: number,
  now: { year: number; month: number },
  monthOf: (expense: Expense) => { year: number; month: number }
): EntityRunRate {
  const entityRows = selectExpensesForDrillDown(expenses, scope.category, scope.subCategory);
  const entityByMonth = sumEntityByMonth(entityRows, historyStartYear, monthOf);

  const isInPeriod = (when: { year: number; month: number }): boolean => {
    if (when.year < historyStartYear) return false;
    if (period.year === null) return true;
    if (when.year !== period.year) return false;
    return period.month === null || when.month === period.month;
  };

  let periodTotal = 0;
  for (const row of entityRows) {
    if (isInPeriod(monthOf(row))) periodTotal += magnitude(row);
  }

  let periodMonthlyAverage: number | null = null;
  if (period.year !== null) {
    const elapsedMonths = period.month !== null ? 1 : period.year === now.year ? now.month : 12;
    periodMonthlyAverage = periodTotal / elapsedMonths;
  }

  // Trailing window: walk 12 calendar months back from now; months below the floor are
  // not observed, so they shrink the average's denominator instead of diluting it.
  const nowIndex = toMonthIndex(now);
  let trailing12Total = 0;
  let observedMonths = 0;
  for (let back = 0; back < 12; back++) {
    const when = fromMonthIndex(nowIndex - back);
    if (when.year < historyStartYear) continue;
    observedMonths++;
    trailing12Total += entityByMonth.get(monthKey(when.year, when.month)) ?? 0;
  }
  const trailing12MonthlyAverage = observedMonths > 0 ? trailing12Total / observedMonths : 0;

  const currentYearProjection =
    period.year === now.year && period.month === null ? (periodTotal / now.month) * 12 : null;

  // Same-side denominator: income entities are compared to all income, everything else
  // to all spending — sign never enters the classification, only `type` does.
  const isIncomeEntity = scope.category.expenseType === 'income';
  let sameSideTotal = 0;
  for (const row of expenses) {
    const isSameSide = isIncomeEntity ? row.type === 'income' : row.type !== 'income' && row.type !== 'transfer';
    if (!isSameSide) continue;
    if (!isInPeriod(monthOf(row))) continue;
    sameSideTotal += magnitude(row);
  }
  const shareOfPeriodTotal = sameSideTotal > 0 ? periodTotal / sameSideTotal : null;

  return {
    periodTotal,
    periodMonthlyAverage,
    trailing12Total,
    trailing12MonthlyAverage,
    observedMonths,
    currentYearProjection,
    shareOfPeriodTotal,
  };
}

export interface EntityMonthPoint {
  /** 'YYYY-MM', zero-padded, lexically sortable. */
  key: string;
  /** 'Mar 26' — three-letter Italian month + two-digit year. */
  label: string;
  /** Entity magnitude in that month. */
  value: number;
  /**
   * Same month one year earlier. 0 means "tracked, nothing spent"; null means the
   * baseline month predates historyStartYear — unknowable, not zero. The chart
   * renders null as a gap: a fabricated flat 0 would be indistinguishable from
   * "spent nothing", the exact lie the year table refuses with "storico dal {year}".
   */
  prevYearValue: number | null;
}

/**
 * Gap-free chronological monthly series for the entity, ending at now inclusive.
 *
 * The window is monthsBack months long but clamps at January of historyStartYear — it
 * never pads below the floor, so a young history yields a short series rather than a
 * run of fabricated zero months. Months inside the window with no entity data ARE
 * zero points: within history, silence is data.
 *
 * @param expenses         Every row available; the entity is selected here, never pre-filtered.
 * @param scope            The entity (category, optional subcategory) — keyed by id.
 * @param monthsBack       Window length in months (callers pass 24).
 * @param historyStartYear Global data floor; the window clamps at January of this year.
 * @param now              Current Italy-timezone year/month (month 1-12), resolved by the caller.
 * @param monthOf          Injected month resolver for a row (month 1-12).
 */
export function buildEntityMonthlySeries(
  expenses: Expense[],
  scope: EntityScope,
  monthsBack: number,
  historyStartYear: number,
  now: { year: number; month: number },
  monthOf: (expense: Expense) => { year: number; month: number }
): EntityMonthPoint[] {
  const entityRows = selectExpensesForDrillDown(expenses, scope.category, scope.subCategory);
  const entityByMonth = sumEntityByMonth(entityRows, historyStartYear, monthOf);

  const nowIndex = toMonthIndex(now);
  const floorIndex = toMonthIndex({ year: historyStartYear, month: 1 });
  const startIndex = Math.max(nowIndex - (monthsBack - 1), floorIndex);

  const points: EntityMonthPoint[] = [];
  for (let index = startIndex; index <= nowIndex; index++) {
    const { year, month } = fromMonthIndex(index);
    points.push({
      key: monthKey(year, month),
      label: `${MONTH_NAMES[month - 1].slice(0, 3)} ${String(year).slice(2)}`,
      value: entityByMonth.get(monthKey(year, month)) ?? 0,
      // In-history silence is a real 0; a baseline below the floor is unknowable → null.
      prevYearValue:
        year - 1 >= historyStartYear ? (entityByMonth.get(monthKey(year - 1, month)) ?? 0) : null,
    });
  }

  return points;
}
