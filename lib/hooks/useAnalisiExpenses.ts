'use client';

/**
 * Analisi's movements for a period (totali mensili, Fase B — doc/totali-mensili/README.md § 6.5,
 * lib/utils/analisiExpenses.ts): the totals' list with the period's year (and, compared on the same
 * days, one month of the year before) read from its rows; «Storico» the whole collection.
 *
 * `rows` is null until EVERY read of the reads asked for has answered: a list missing its year would
 * hand aggregated rows to the tiles that read a row's day and text. The page keeps showing the
 * period it holds until then (AnalisiTab, `shown`). Every key sits under `queryKeys.expenses.all`:
 * a write invalidates all of them, and a write on a closed month has had its total rebuilt first.
 */

import { useMemo } from 'react';
import { useExpenses, useExpensesInRange } from '@/lib/hooks/useExpenses';
import { useExpenseFlows } from '@/lib/hooks/useExpenseFlows';
import { analisiMonthWindow, analisiYearWindow } from '@/lib/utils/expenseWindows';
import { analisiReadsKey, composeAnalisiExpenses, type AnalisiReads } from '@/lib/utils/analisiExpenses';
import type { Expense } from '@/types/expenses';

export interface AnalisiExpensesRead {
  /** The list for `readsKey`, or null while one of its reads is pending. */
  rows: Expense[] | null;
  /** `analisiReadsKey` of the reads `rows` answers. */
  readsKey: string;
  /** A read failed: the page says so instead of showing zeros. */
  failed: boolean;
  /** The queries, for the header's freshness reading. */
  queries: Array<{ isFetching: boolean; isLoading: boolean; dataUpdatedAt: number }>;
}

/**
 * @param ownerId - The account read (the owner, also for a shared-account delegate)
 * @param reads - What the period needs (`resolveAnalisiReads`), or null while it is not known yet
 */
export function useAnalisiExpenses(ownerId: string | undefined, reads: AnalisiReads | null): AnalisiExpensesRead {
  const wholeCollection = reads?.kind === 'all';
  const onYear = reads?.kind === 'year' ? reads : null;

  const all = useExpenses(ownerId, { enabled: wholeCollection });
  const flows = useExpenseFlows(ownerId, { enabled: onYear !== null });
  const year = useExpensesInRange(ownerId, onYear ? analisiYearWindow(onYear.year) : null);
  const comparisonMonth = onYear?.comparisonMonth ?? null;
  const month = useExpensesInRange(ownerId, comparisonMonth ? analisiMonthWindow(comparisonMonth.year, comparisonMonth.month) : null);

  const allData = all.data;
  const flowsData = flows.data;
  const yearData = year.data;
  const monthData = month.data;
  const rows = useMemo((): Expense[] | null => {
    if (!reads) return null;
    if (reads.kind === 'all') return allData ?? null;
    if (!flowsData || !yearData) return null;
    if (reads.comparisonMonth && !monthData) return null;
    return composeAnalisiExpenses(flowsData, [
      { year: reads.year, rows: yearData },
      ...(reads.comparisonMonth && monthData ? [{ ...reads.comparisonMonth, rows: monthData }] : []),
    ]);
  }, [reads, allData, flowsData, yearData, monthData]);

  const used = wholeCollection ? [all] : onYear ? [flows, year, ...(comparisonMonth ? [month] : [])] : [];
  return {
    rows,
    readsKey: reads ? analisiReadsKey(reads) : '',
    failed: used.some((query) => query.isError),
    queries: used.map((query) => ({ isFetching: query.isFetching, isLoading: query.isLoading, dataUpdatedAt: query.dataUpdatedAt })),
  };
}
