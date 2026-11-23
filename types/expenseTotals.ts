/**
 * The monthly totals of an account's expenses (doc/totali-mensili/README.md § 4).
 *
 * ONE document per account and Italian year, `expense-totals/{userId}_{YYYY}`, written only by the
 * server (Admin SDK) by REBUILDING a month from its rows, never by increments (D-TM5). The readers
 * of Fase A (Hall of Fame, Storico, FIRE, Rendimenti) never read a cell directly: they receive
 * «aggregated rows», one `Expense` per cell (lib/utils/expenseTotals.ts), so their formulas do not
 * change (D-TM3).
 *
 * A year document holds ALL TWELVE months, an empty one as `rowCount: 0` (2026-11-23, impl): a
 * month missing from the map would not say whether it is empty or was never built.
 */

import type { ExpenseType } from '@/types/expenses';

/** Bump when a cell gains a dimension: every year document with an older one is read from its rows until rebuilt. */
export const EXPENSE_TOTALS_SCHEMA_VERSION = 1;

export const EXPENSE_TOTALS_COLLECTION = 'expense-totals';
export const EXPENSE_TOTALS_META_COLLECTION = 'expense-totals-meta';

/** '01' … '12'. */
export type ExpenseTotalsMonthKey = string;

/**
 * One combination of the dimensions the readers sum by. `negative` is a dimension of its own
 * (2026-11-23, impl): `calculateTotalExpenses` and Rendimenti add `Math.abs` of every ROW, so a refund
 * (+20) beside a purchase (−100) in one category is 120 of spending — one signed cell would say 80.
 * Within a cell every row has the same sign, so `|sum| = Σ|amount|`.
 */
export interface ExpenseTotalsCell {
  /** A row without `type` (legacy, import) → 'unclassified'. */
  type: ExpenseType | 'unclassified';
  /** '' when the row has none. */
  categoryId: string;
  /** The name on the most recent row of the cell (`updatedAt`, then `date`). */
  categoryName: string;
  subCategoryId: string | null;
  subCategoryName: string | null;
  /** The row is an asset trade's fee (`feeOfTradeId`): Rendimenti's C_rows. */
  tradeFee: boolean;
  /** `amount < 0`. */
  negative: boolean;
  /** Signed sum of `amount`, in euro, as the rows store it (D-TM10). */
  sum: number;
  count: number;
}

export interface ExpenseTotalsMonth {
  /** When the month was last rebuilt from its rows. */
  builtAt: Date;
  /** Every row of the month, of every type: what the nightly check compares (§ 5.3). */
  rowCount: number;
  /** Signed sum of every row of the month. */
  amountSum: number;
  cells: ExpenseTotalsCell[];
}

export interface ExpenseTotalsYear {
  userId: string;
  year: number;
  schemaVersion: number;
  months: Partial<Record<ExpenseTotalsMonthKey, ExpenseTotalsMonth>>;
}

/** `expense-totals-meta/{userId}`: when the nightly check last ran (its step 2 reads the rows changed since). */
export interface ExpenseTotalsMeta {
  userId: string;
  lastVerifiedAt: Date;
}

/** A month as the totals name it: Italian calendar, `month` 1–12. */
export interface ItalyMonth {
  year: number;
  month: number;
}

export function expenseTotalsDocId(userId: string, year: number): string {
  return `${userId}_${year}`;
}
