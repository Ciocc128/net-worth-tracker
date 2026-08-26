/**
 * Every derived number of Cashflow › Tracciamento that is not a raw expense row: the period
 * totals, the delta against the previous period, the anchored month series behind the two
 * charts, the savings history, the category ranking with its residual and the movements
 * count. `cashflowNarrative.ts` turns these into words; the components only render them.
 *
 * Design: pure and Firebase-free (only `types/expenses`, the date helpers and the grouping
 * rule), so the whole layer is unit-tested without a mock. Two rules hold everywhere:
 *   - classification is by `type`, never by the sign of `amount` (a refund is still spending);
 *   - `transfer` rows are net-zero between two accounts — never income, never spending,
 *     still a movement in the inventory.
 * Month bucketing uses the Italian calendar (`getItalyYear`/`getItalyMonth`), like
 * `cashflowTimeSeries.ts`; the period slice uses `periodToRange`, like the filter toolbar.
 */

import type { Expense, ExpenseType } from '@/types/expenses';
import { EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { type Period, periodToRange, MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { endOfMonthBound, getItalyDate, getItalyMonth, getItalyMonthYear, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { getCategoryKey, getCategoryName, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';

// ─── Period totals ────────────────────────────────────────────────────────────

export interface PeriodCashflowTotals {
  /** Income and spending as positive magnitudes; net = income − expenses. */
  income: number;
  expenses: number;
  net: number;
  /** (income − expenses) / income, in percent; null without income — a rate needs a denominator. */
  savingsRate: number | null;
  /** income / expenses; null without spending or without income. The second number of the pair, kept on purpose. */
  coverageRatio: number | null;
  /** Transfers in the period: never a flow, still movements — the verdict must not deny them. */
  transferCount: number;
}

function isSpending(expense: Expense): boolean {
  return expense.type !== 'income' && expense.type !== 'transfer';
}

/** Totals of a list of rows, classified by type. Amount signs are ignored on purpose. */
export function summarizePeriodCashflow(expenses: Expense[]): PeriodCashflowTotals {
  let income = 0;
  let spending = 0;
  let transferCount = 0;
  for (const expense of expenses) {
    if (expense.type === 'transfer') {
      transferCount++;
    } else if (expense.type === 'income') {
      // A negative income row is a reversal of income, not spending.
      income += expense.amount;
    } else if (isSpending(expense)) {
      // Spending is a magnitude (the convention of calculateTotalExpenses): a positive
      // spending row never turns into income.
      spending += Math.abs(expense.amount);
    }
  }
  return {
    income,
    expenses: spending,
    net: income - spending,
    savingsRate: income > 0 ? ((income - spending) / income) * 100 : null,
    // A ratio with a zero numerator says nothing the "nessuna entrata" verdict has not.
    coverageRatio: spending > 0 && income > 0 ? income / spending : null,
    transferCount,
  };
}

/**
 * The rows inside the period, both ends inclusive (the same slice the toolbar filters). A
 * year still running stops at the end of today's month: recurring series are materialised as
 * future-dated rows, and «il 2026» is January → today, not January → December.
 */
export function filterExpensesByPeriod(expenses: Expense[], period: Period, now: Date): Expense[] {
  const range = periodToRange(period);
  const to = period.kind === 'year' && isYearToDate(period, now) ? endOfMonthBound(period.year, resolveAnchorMonth(period, now).month) : range.to;
  return expenses.filter((expense) => {
    const date = getExpenseDate(expense.date);
    return date >= range.from && date <= to;
  });
}

/**
 * Spending already booked up to `now` versus spending dated after it (instalments and
 * recurring rows of the rest of the month): the projection extrapolates only the former and
 * adds the latter as it is — a row due on the 27th is neither "spent" on the 22nd nor to be
 * scaled by 31/22.
 */
export function splitSpendingAtDate(expenses: Expense[], now: Date): { spentToDate: number; scheduled: number } {
  let spentToDate = 0;
  let scheduled = 0;
  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    if (getExpenseDate(expense.date) <= now) spentToDate += Math.abs(expense.amount);
    else scheduled += Math.abs(expense.amount);
  }
  return { spentToDate, scheduled };
}

/** A year period that is still running: its figures stop at today's month. */
export function isYearToDate(period: Period, now: Date): boolean {
  return period.kind === 'year' && period.year === getItalyMonthYear(now).year;
}

/**
 * The period to compare against: the previous month; the previous year — but for a year still
 * running, the SAME months of the previous year (a full year against eight months reads as a
 * drop by construction). A custom range has no honest predecessor (a same-length window would
 * compare unlike months), so null.
 */
export function previousPeriod(period: Period, now: Date): Period | null {
  if (period.kind === 'month') {
    return period.month === 1
      ? { kind: 'month', year: period.year - 1, month: 12 }
      : { kind: 'month', year: period.year, month: period.month - 1 };
  }
  if (period.kind === 'year') {
    if (!isYearToDate(period, now)) return { kind: 'year', year: period.year - 1 };
    const anchor = resolveAnchorMonth(period, now);
    return { kind: 'custom', from: new Date(period.year - 1, 0, 1), to: new Date(period.year - 1, anchor.month, 0) };
  }
  return null;
}

export interface PeriodDelta {
  /** Percent change against the previous period; null when the previous value is zero. */
  income: number | null;
  expenses: number | null;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function computePeriodDelta(current: PeriodCashflowTotals, previous: PeriodCashflowTotals): PeriodDelta {
  return {
    income: percentChange(current.income, previous.income),
    expenses: percentChange(current.expenses, previous.expenses),
  };
}

// ─── Month windows ────────────────────────────────────────────────────────────

export interface MonthRef {
  year: number;
  month: number;
}

/**
 * The month every trailing window ends at: the selected month, the last month of the year
 * (today's month for the current year — the future is not data), or the month of a custom
 * range's last day.
 */
export function resolveAnchorMonth(period: Period, now: Date): MonthRef {
  const today = getItalyMonthYear(now);
  if (period.kind === 'month') return { year: period.year, month: period.month };
  if (period.kind === 'year') {
    return { year: period.year, month: period.year === today.year ? today.month : 12 };
  }
  return { year: getItalyYear(period.to), month: getItalyMonth(period.to) };
}

export interface FlowWindow {
  endYear: number;
  endMonth: number;
  count: number;
}

/**
 * The window of the income-vs-spending chart: the trailing months for a month or a custom
 * range, the year's own months (January → anchor) for a year.
 */
export function resolveFlowWindow(period: Period, now: Date, trailing = 6): FlowWindow {
  const anchor = resolveAnchorMonth(period, now);
  const count = period.kind === 'year' ? anchor.month : trailing;
  return { endYear: anchor.year, endMonth: anchor.month, count };
}

export interface MonthFlow extends MonthRef {
  /** "2026-08" — sortable, unique across years. */
  key: string;
  /** "Ago" — the axis label. */
  label: string;
  income: number;
  expenses: number;
  net: number;
  /** Percent; null when the month had no income. */
  savingsRate: number | null;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * A gap-free series of `count` months ending at (endYear, endMonth), oldest first. Rows
 * outside the window are ignored; an empty month is a zero bucket with a null rate.
 */
export function buildTrailingMonthFlows(expenses: Expense[], endYear: number, endMonth: number, count: number): MonthFlow[] {
  // Walk back from the anchor to build the axis, then reverse into chronological order.
  const axis: MonthRef[] = [];
  let year = endYear;
  let month = endMonth;
  for (let i = 0; i < count; i++) {
    axis.unshift({ year, month });
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }

  const byKey = new Map<string, MonthFlow>();
  for (const ref of axis) {
    byKey.set(monthKey(ref.year, ref.month), {
      ...ref,
      key: monthKey(ref.year, ref.month),
      label: MONTH_NAMES_SHORT[ref.month - 1],
      income: 0,
      expenses: 0,
      net: 0,
      savingsRate: null,
    });
  }

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    const date = toDate(expense.date);
    const bucket = byKey.get(monthKey(getItalyYear(date), getItalyMonth(date)));
    if (!bucket) continue;
    if (expense.type === 'income') bucket.income += expense.amount;
    else bucket.expenses += Math.abs(expense.amount);
  }

  for (const bucket of byKey.values()) {
    bucket.net = bucket.income - bucket.expenses;
    bucket.savingsRate = bucket.income > 0 ? (bucket.net / bucket.income) * 100 : null;
  }

  return axis.map((ref) => byKey.get(monthKey(ref.year, ref.month))!);
}

// ─── Savings history ──────────────────────────────────────────────────────────

export interface SavingsHistory {
  months: MonthFlow[];
  /** The month still running, if the window ends on it — drawn, never ranked. */
  ongoing: MonthFlow | null;
  /** The months that can be judged: the window minus the running one. */
  closedCount: number;
  /** Mean rate over the measured months (closed months with income); null when none. */
  average: number | null;
  best: MonthFlow | null;
  worst: MonthFlow | null;
  /** Measured months whose rate is negative, in chronological order. */
  deficitMonths: MonthFlow[];
  measuredCount: number;
}

/**
 * Average, best, worst and deficits over the CLOSED months with income. A month still running
 * (the salary is in, most of the spending is not) would be the best by construction, so it is
 * excluded from every ranking — its rate is the hero tile's job — but stays in `months` for
 * the chart.
 */
export function summarizeSavingsHistory(months: MonthFlow[], now: Date): SavingsHistory {
  const today = getItalyMonthYear(now);
  const ongoing = months.find((m) => m.year === today.year && m.month === today.month) ?? null;
  const closed = months.filter((m) => m !== ongoing);
  const measured = closed.filter((m) => m.savingsRate !== null);
  if (measured.length === 0) {
    return { months, ongoing, closedCount: closed.length, average: null, best: null, worst: null, deficitMonths: [], measuredCount: 0 };
  }
  const rate = (m: MonthFlow) => m.savingsRate as number;
  const average = measured.reduce((sum, m) => sum + rate(m), 0) / measured.length;
  const best = measured.reduce((top, m) => (rate(m) > rate(top) ? m : top), measured[0]);
  const worst = measured.reduce((bottom, m) => (rate(m) < rate(bottom) ? m : bottom), measured[0]);
  return {
    months,
    ongoing,
    closedCount: closed.length,
    average,
    best,
    worst,
    deficitMonths: measured.filter((m) => rate(m) < 0),
    measuredCount: measured.length,
  };
}

// ─── Category ranking ─────────────────────────────────────────────────────────

/** Shaped like the overview payload's category rows, so `CategoryTile` renders both. */
export interface RankedCategory {
  category: string;
  categoryKey: string;
  amount: number;
  /** Share of the kind's total, 0-100. */
  percentage: number;
}

export interface CategoryRanking {
  rows: RankedCategory[];
  total: number;
  /** What the capped rows leave out; null when every category is shown. */
  remainder: { amount: number; percentage: number } | null;
}

/**
 * The period's top categories of one kind — spending (fixed, variable, debt) or income —
 * keyed by category id (the grouping rule), labels qualified only where two keys share a
 * name, capped at `limit` and closed by the residual so the list adds up to its total. A
 * category whose net amount is negative (a reversed salary, a refund larger than the
 * purchases) is not a share of anything: it leaves the ranking, and the shares are measured
 * over the positive categories, so no row can read «il 120%».
 */
export function rankCategories(expenses: Expense[], kind: 'expenses' | 'income', limit = 5): CategoryRanking {
  const selected = expenses.filter((e) => (kind === 'income' ? e.type === 'income' : isSpending(e)));
  const byKey = new Map<string, { name: string; qualifier: string; amount: number }>();
  let total = 0;
  for (const expense of selected) {
    const key = getCategoryKey(expense);
    const entry = byKey.get(key) ?? { name: getCategoryName(expense), qualifier: EXPENSE_TYPE_LABELS[expense.type], amount: 0 };
    const amount = kind === 'income' ? expense.amount : Math.abs(expense.amount);
    entry.amount += amount;
    total += amount;
    byKey.set(key, entry);
  }
  const ranked = Array.from(byKey.entries())
    .filter(([, entry]) => entry.amount > 0)
    .sort((a, b) => b[1].amount - a[1].amount);
  total = ranked.reduce((sum, [, entry]) => sum + entry.amount, 0);
  if (total <= 0) return { rows: [], total: 0, remainder: null };

  const top = ranked.slice(0, limit);
  const labels = resolveDisplayLabels(top.map(([key, entry]) => ({ key, name: entry.name, qualifier: entry.qualifier })));
  const rows = top.map(([key, entry]) => ({
    category: labels.get(key) ?? entry.name,
    categoryKey: key,
    amount: entry.amount,
    percentage: (entry.amount / total) * 100,
  }));
  const shown = rows.reduce((sum, row) => sum + row.amount, 0);
  const remainderAmount = total - shown;
  return {
    rows,
    total,
    remainder: ranked.length > limit && remainderAmount > 0 ? { amount: remainderAmount, percentage: (remainderAmount / total) * 100 } : null,
  };
}

// ─── Movements ────────────────────────────────────────────────────────────────

export interface MovementsSummary {
  count: number;
  expenseCount: number;
  incomeCount: number;
  transferCount: number;
  /** The row with the largest absolute amount, labelled like the feed (note, else category). */
  largest: { label: string; amount: number; type: ExpenseType } | null;
}

export function summarizeMovements(expenses: Expense[]): MovementsSummary {
  let expenseCount = 0;
  let incomeCount = 0;
  let transferCount = 0;
  let largest: Expense | null = null;
  for (const expense of expenses) {
    if (expense.type === 'income') incomeCount++;
    else if (expense.type === 'transfer') transferCount++;
    else expenseCount++;
    if (!largest || Math.abs(expense.amount) > Math.abs(largest.amount)) largest = expense;
  }
  return {
    count: expenses.length,
    expenseCount,
    incomeCount,
    transferCount,
    largest: largest
      ? { label: largest.notes?.trim() || largest.categoryName, amount: Math.abs(largest.amount), type: largest.type }
      : null,
  };
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface PeriodCalendar {
  dayOfMonth: number;
  daysInMonth: number;
}

/**
 * The day and the length of the month, for the month-end spending projection — only when
 * the period IS the current Italian month: a closed month has nothing left to project.
 */
export function resolvePeriodCalendar(period: Period, now: Date): PeriodCalendar | null {
  if (period.kind !== 'month') return null;
  const today = getItalyMonthYear(now);
  if (period.year !== today.year || period.month !== today.month) return null;
  return {
    dayOfMonth: getItalyDate(now).getDate(),
    daysInMonth: new Date(period.year, period.month, 0).getDate(),
  };
}
