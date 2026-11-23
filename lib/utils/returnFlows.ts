/**
 * returnFlows — what a month's flow must add or remove so the return is ONE definition in both
 * flow branches (doc/rendimenti-misura/README.md § 5.1–5.4, F08 step 1: B1, B3, B2).
 *
 * THE DEFINITION (D-RM1)
 * The return is GROSS of tax and NET of trading fees, whichever branch measured the month:
 *   - a withheld tax (on a sale, on a dividend or coupon) is a WITHDRAWAL: it leaves the base as a
 *     flow and does not lower the gain;
 *   - a trading fee is a COST: it is not a flow and lowers the gain;
 *   - a distribution (dividend, coupon, final premium, interest) paid by an instrument INSIDE the
 *     base is RETURN, never capital entering (B1).
 *
 * THE TWO BRANCHES AND THEIR CORRECTION (§ 5.2)
 *   measured month   F = portfolioFlow − D_gross                              + pensionFlow
 *   cashflow month   F = netCashFlow + C_rows − T_sales − T_distributions      + pensionFlow
 * `externalFlowOf` (lib/utils/cashFlowMap.ts) picks the correction of the branch the month is in;
 * the two travel on their own fields of `CashFlowData` (`measuredAdjustment`,
 * `cashflowAdjustment`), so `netCashFlow` keeps its meaning (the Contributi tile's savings).
 *
 *   - C_rows: the fee rows of a trade (`Expense.feeOfTradeId`, since 2026-10-21) are spending in
 *     `netCashFlow`, i.e. a withdrawal the formula would neutralise; adding them back leaves the
 *     account's drop in the gain. A trade with no fee row has nothing to undo: it already weighs.
 *   - T_sales: `AssetTransaction.withheldTaxEur` lowers the account with no cashflow row, so it
 *     would weigh on the gain; counted as a withdrawal.
 *   - T_distributions: the tax withheld on the registry's distributions of the month, likewise —
 *     only when a dividend income category is set (without it the net amount is ordinary income
 *     in `netCashFlow`, i.e. a contribution, and the gross never reaches the gain).
 *   - D_gross: in a measured month an account inside the base that receives a distribution reads
 *     its rise as a deposit; removing the gross leaves only `−tax` as a withdrawal. With the account
 *     outside the base (or no account) nothing was measured, and `−D_gross` counts the distribution
 *     as return that left the base.
 *
 * WHO PAID (§ 5.3, D-RM3)
 * A distribution of the month is a registry record (`paymentDate` in the window, gross and tax from
 * the record) or an income row in the dividend category that no record names (`Dividend.expenseId`):
 * the interest of an account, a row typed by hand; gross = the row, tax = 0. The payer is inside the
 * base when the record's `assetId` is not excluded, when the row's account (`linkedCashAssetId`) is
 * not excluded, or — a row with no account — always. A payer OUTSIDE the base is not return: if it
 * lands on an account inside the base it is outside money, and the balance already counts it.
 *
 * THE RUNNING MONTH (§ 5.4, B3, D-RM4)
 * When the latest snapshot is of the month we are in, it was written on its capture day and is
 * rewritten every evening: the rows dated after that day are not in its balances yet.
 * `resolveFlowCutoff` returns the end of that Italian day, and every caller caps the window of the
 * rows (expenses, registry, ledger taxes) there. A closed month always counts the whole month.
 */

import type { AssetTransaction } from '@/types/assetTransactions';
import type { MonthlySnapshot } from '@/types/assets';
import type { CashFlowData } from '@/types/performance';
import type { Expense } from '@/types/expenses';
import type { DividendReceipt } from '@/lib/utils/performanceAttribution';
import { getItalyDayBoundsUtc, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { monthKey, monthKeyOf } from '@/lib/utils/cashFlowMap';
import { snapshotCapturedAt } from '@/lib/utils/snapshotDocument';

/** What the corrections read besides the expenses: the dividend registry, the trade ledger, the base's exclusions. */
export interface ReturnFlowContext {
  dividends: DividendReceipt[];
  trades: AssetTransaction[];
  /** The `assetId`s outside the base (`PerformanceBaseResolution.excludedAssetIds`). */
  excludedAssetIds: string[];
}

export const EMPTY_RETURN_FLOW_CONTEXT: ReturnFlowContext = { dividends: [], trades: [], excludedAssetIds: [] };

/** The two corrections of one month, one per branch (§ 5.2). */
export interface MonthlyReturnAdjustment {
  /** `C_rows − T_sales − T_distributions`: added to `netCashFlow` in a cashflow month. */
  cashflowAdjustment: number;
  /** `−D_gross`: added to `portfolioFlow` in a measured month. */
  measuredAdjustment: number;
}

/** The gross of a registry record in euro (a EUR record has no `*Eur` field). */
export function distributionGrossEur(dividend: DividendReceipt): number {
  return dividend.grossAmountEur ?? dividend.grossAmount ?? dividend.netAmountEur ?? dividend.netAmount;
}

/** The tax withheld on a registry record, in euro. */
export function distributionTaxEur(dividend: DividendReceipt): number {
  return dividend.taxAmountEur ?? dividend.taxAmount ?? 0;
}


/**
 * The last instant whose rows count in the flow (§ 5.4): the end of the Italian day the RUNNING
 * month's snapshot was captured, or `null` when the latest snapshot is of a closed month (no cap).
 *
 * @param snapshots - The series, any order
 * @param now - "Today"
 */
export function resolveFlowCutoff(snapshots: MonthlySnapshot[], now: Date): Date | null {
  if (snapshots.length === 0) return null;
  const latest = snapshots.reduce((a, b) => (a.year !== b.year ? (a.year > b.year ? a : b) : a.month >= b.month ? a : b));
  const today = getItalyMonthYear(now);
  if (latest.year !== today.year || latest.month !== today.month) return null;
  return getItalyDayBoundsUtc(snapshotCapturedAt(latest) ?? now).end;
}

/** `endDate` capped at the cutoff, when there is one before it. */
export function capAtCutoff(endDate: Date, cutoff: Date | null): Date {
  return cutoff !== null && cutoff < endDate ? cutoff : endDate;
}

/**
 * The corrections of every month of a window that has any (§ 5.2–5.3).
 *
 * @param expenses - The expenses, any period (filtered here)
 * @param context - Registry, ledger, exclusions
 * @param dividendCategoryId - The dividend income category (`dividendIncomeCategoryId`)
 * @param startDate - First instant of the window
 * @param endDate - Last instant of the window, ALREADY capped by `resolveFlowCutoff`
 * @returns `YYYY-MM` → the month's two corrections
 */
export function buildReturnFlowAdjustments(
  expenses: Expense[],
  context: ReturnFlowContext,
  dividendCategoryId: string | undefined,
  startDate: Date,
  endDate: Date
): Map<string, MonthlyReturnAdjustment> {
  const excluded = new Set(context.excludedAssetIds);
  const inWindow = (date: Date) => date >= startDate && date <= endDate;
  const out = new Map<string, MonthlyReturnAdjustment>();
  const add = (date: Date, cashflow: number, measured: number) => {
    if (cashflow === 0 && measured === 0) return;
    // The ITALIAN month of the row (D-TM6, doc/totali-mensili § 6.4), as `getCashFlowsFromExpenses`
    // buckets it: the series' own dates are built from that month, so `mergeReturnAdjustments` meets it.
    const italy = getItalyMonthYear(date);
    const key = monthKey(italy.year, italy.month);
    const current = out.get(key) ?? { cashflowAdjustment: 0, measuredAdjustment: 0 };
    current.cashflowAdjustment += cashflow;
    current.measuredAdjustment += measured;
    out.set(key, current);
  };

  // C_rows: a trade's fee row is a cost, not a withdrawal.
  for (const expense of expenses) {
    if (!expense.feeOfTradeId || expense.type === 'income' || expense.type === 'transfer' || !inWindow(expense.date)) continue;
    add(expense.date, Math.abs(expense.amount), 0);
  }

  // T_sales: the tax withheld at a sale is a withdrawal.
  for (const trade of context.trades) {
    if (trade.type !== 'sell' || !(trade.withheldTaxEur && trade.withheldTaxEur > 0) || !inWindow(trade.date)) continue;
    add(trade.date, -trade.withheldTaxEur, 0);
  }

  // The registry: D_gross (payer inside the base) and T_distributions.
  const namedRows = new Set<string>();
  for (const dividend of context.dividends) {
    if (dividend.expenseId) namedRows.add(dividend.expenseId);
    if (!inWindow(dividend.paymentDate)) continue;
    const tax = dividendCategoryId ? distributionTaxEur(dividend) : 0;
    const measured = excluded.has(dividend.assetId) ? 0 : -distributionGrossEur(dividend);
    add(dividend.paymentDate, -tax, measured);
  }

  // Income rows in the dividend category that no record names: the interest of their account.
  if (dividendCategoryId) {
    for (const expense of expenses) {
      if (expense.type !== 'income' || expense.categoryId !== dividendCategoryId || !inWindow(expense.date)) continue;
      if (namedRows.has(expense.id)) continue;
      if (expense.linkedCashAssetId && excluded.has(expense.linkedCashAssetId)) continue;
      add(expense.date, 0, -expense.amount);
    }
  }

  return out;
}

/**
 * Put the corrections on the monthly series, inside a window. A month the series does not know
 * yet (a dividend in a month with no other movement) is born as a zero row, so the map sees it.
 * Same shape as `mergePortfolioFlows`; call it AFTER that one, so a measured month already exists.
 *
 * @param cashFlows - The series (never mutated)
 * @param adjustments - From `buildReturnFlowAdjustments`
 */
export function mergeReturnAdjustments(cashFlows: CashFlowData[], adjustments: Map<string, MonthlyReturnAdjustment>): CashFlowData[] {
  if (adjustments.size === 0) return cashFlows;
  const byMonth = new Map<string, CashFlowData>(cashFlows.map((cashFlow) => [monthKeyOf(cashFlow.date), { ...cashFlow }]));
  for (const [month, adjustment] of adjustments) {
    const existing = byMonth.get(month);
    if (existing) {
      existing.cashflowAdjustment = (existing.cashflowAdjustment ?? 0) + adjustment.cashflowAdjustment;
      existing.measuredAdjustment = (existing.measuredAdjustment ?? 0) + adjustment.measuredAdjustment;
      continue;
    }
    const [year, monthNumber] = month.split('-').map(Number);
    byMonth.set(month, {
      date: new Date(year, monthNumber - 1, 1),
      income: 0,
      expenses: 0,
      dividendIncome: 0,
      netCashFlow: 0,
      cashflowAdjustment: adjustment.cashflowAdjustment,
      measuredAdjustment: adjustment.measuredAdjustment,
    });
  }
  return [...byMonth.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * The fingerprint of what the corrections read beyond the snapshots and the expenses, for the
 * performance cache key: the registry by month (payer, gross, tax, named row) and the sale taxes.
 */
export function returnFlowTokens(context: ReturnFlowContext, cutoff: Date | null): string[] {
  const tokens = context.dividends.map(
    (d) => `d${monthKeyOf(d.paymentDate)}:${d.assetId}:${Math.round(distributionGrossEur(d) * 100)}:${Math.round(distributionTaxEur(d) * 100)}:${d.expenseId ?? ''}`
  );
  for (const trade of context.trades) {
    if (trade.type === 'sell' && trade.withheldTaxEur) tokens.push(`t${monthKeyOf(trade.date)}:${Math.round(trade.withheldTaxEur * 100)}`);
  }
  tokens.sort();
  tokens.push(`x${[...context.excludedAssetIds].sort().join(',')}`);
  tokens.push(`c${cutoff ? cutoff.toISOString().slice(0, 10) : 'none'}`);
  return tokens;
}
