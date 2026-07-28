/**
 * Unit tests for pdfTimeFilters.ts, focused on filterExpensesByTime's
 * cashflowHistoryStartYear floor for "Totale" PDF exports.
 */

import { describe, it, expect } from 'vitest';
import {
  filterExpensesByTime,
  DEFAULT_CASHFLOW_HISTORY_START_YEAR,
} from '@/lib/utils/pdfTimeFilters';

function makeExpense(year: number, month: number) {
  return { date: new Date(year, month - 1, 15) };
}

describe('filterExpensesByTime', () => {
  it('applies the configured cashflowHistoryStartYear floor for total exports', () => {
    const expenses = [
      makeExpense(2022, 6),
      makeExpense(2023, 6),
      makeExpense(2024, 6),
    ];

    const result = filterExpensesByTime(expenses, 'total', undefined, undefined, 2023);

    expect(result).toEqual([makeExpense(2023, 6), makeExpense(2024, 6)]);
  });

  it('falls back to DEFAULT_CASHFLOW_HISTORY_START_YEAR when no floor is configured', () => {
    const expenses = [
      makeExpense(DEFAULT_CASHFLOW_HISTORY_START_YEAR - 1, 6),
      makeExpense(DEFAULT_CASHFLOW_HISTORY_START_YEAR, 1),
    ];

    const result = filterExpensesByTime(expenses, 'total');

    expect(result).toEqual([makeExpense(DEFAULT_CASHFLOW_HISTORY_START_YEAR, 1)]);
  });

  it('does not apply the total floor to yearly/monthly exports, which are already period-bound', () => {
    const expenses = [makeExpense(2020, 3), makeExpense(2024, 3)];

    const yearly = filterExpensesByTime(expenses, 'yearly', 2024, undefined, 2023);
    const monthly = filterExpensesByTime(expenses, 'monthly', 2024, 3, 2023);

    expect(yearly).toEqual([makeExpense(2024, 3)]);
    expect(monthly).toEqual([makeExpense(2024, 3)]);
  });
});
