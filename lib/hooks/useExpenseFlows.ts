'use client';

/**
 * The movements of an account as the readers of the monthly totals take them (doc/totali-mensili/
 * README.md § 6): for every closed month with a trusted total, one AGGREGATED row per cell (type,
 * category, sub-category, fee, sign — `aggregateCount` rows inside it); the running month, a year
 * without its document and a month rebuilt too early from their REAL rows (§ 4.3). Storico, FIRE
 * and Rendimenti sum by month, type and category, so the same builders give the same figures
 * (CA5, `__tests__/expenseTotalsInvariance.test.ts`); a reader that needs a row's text or day must
 * not take this list.
 *
 * The key sits under `queryKeys.expenses.all`: every expense write invalidates it, and a write that
 * touched a closed month has already had it rebuilt (`markExpenseMonthsChanged` is awaited).
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { readExpenseFlows } from '@/lib/services/expenseTotalsClient';
import type { Expense } from '@/types/expenses';

export interface ExpenseFlowsOptions {
  /** The reader's first instant (a month's first instant): earlier months are not read. Null: every month. */
  from?: Date | null;
  /** The last instant kept (a month's last instant), filtered in memory: the key does not change with it. */
  to?: Date | null;
  /** A category read from its real rows in every month (Rendimenti's dividends). */
  realRowsCategoryId?: string;
  enabled?: boolean;
}

export function useExpenseFlows(ownerId: string | undefined, options: ExpenseFlowsOptions = {}) {
  const from = options.from ?? null;
  const to = options.to ?? null;
  return useQuery({
    queryKey: queryKeys.expenses.flows(ownerId || '', from ? from.toISOString() : 'all', options.realRowsCategoryId ?? 'none'),
    queryFn: () => readExpenseFlows(ownerId!, { from, realRowsCategoryId: options.realRowsCategoryId }),
    select: to ? (rows: Expense[]) => rows.filter((row) => row.date <= to) : undefined,
    enabled: !!ownerId && (options.enabled ?? true),
  });
}
