/**
 * The browser's half of the monthly totals (doc/totali-mensili/README.md § 5.2, § 6).
 *
 * READING: `readExpenseFlows` is `loadExpenseFlows` on the client SDK — the year documents of the
 * owner (one query, Y reads), the bounds (two one-document reads), the rows of the months § 4.3
 * reads live and, for Rendimenti, the real rows of one category. Storico, FIRE and Rendimenti read
 * through it (`useExpenseFlows`), so their closed months cost one document a year, not their rows.
 *
 * WRITING:
 *
 * Only the server writes `expense-totals` (D-TM5): a client writer that touched rows of a month
 * that is NOT the running one asks for that month's rebuild here, after its commit, beside the
 * Panoramica's invalidation. The running month asks nothing (it is read from its rows, and the cron
 * rebuilds it every evening — D-TM4). Awaited by the writer, so the mutation's `onSuccess`
 * invalidation of `expenses.all` (the totals key sits under it) reads the rebuilt document.
 *
 * Never throws: a failure is logged and the write stands; the nightly check repairs it (CU5).
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getExpenseDateBounds, getExpensesByDateRange } from '@/lib/services/expenseService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import {
  expenseTotalsYearFromData,
  italyMonthLabel,
  loadExpenseFlows,
  monthsToRebuild,
  type ExpenseFlowSource,
} from '@/lib/utils/expenseTotals';
import { EXPENSE_TOTALS_COLLECTION } from '@/types/expenseTotals';
import type { Expense } from '@/types/expenses';

/** `loadExpenseFlows`' reads on the client SDK, for one owner. */
export function expenseFlowSourceClient(ownerId: string): ExpenseFlowSource {
  return {
    readBounds: () => getExpenseDateBounds(ownerId),
    readYears: async (years) => {
      if (years.length === 0) return [];
      // One query for the owner's documents (the rules need the `userId` filter on a list): Y reads,
      // and a year with no document is simply absent — § 4.3 reads it from its rows.
      const snap = await getDocs(query(collection(db, EXPENSE_TOTALS_COLLECTION), where('userId', '==', ownerId)));
      const wanted = new Set(years);
      return snap.docs.map((doc) => expenseTotalsYearFromData(doc.data())).filter((doc) => wanted.has(doc.year));
    },
    readRows: (from, to) => getExpensesByDateRange(ownerId, from, to),
    readCategoryRows: async (categoryId) => {
      const snap = await getDocs(
        query(collection(db, 'expenses'), where('userId', '==', ownerId), where('categoryId', '==', categoryId)),
      );
      return snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Expense;
      });
    },
  };
}

/**
 * Every movement of the owner as the readers of Fase A take it: aggregated rows for the months with
 * a trusted total, real rows for the others (§ 4.3), newest first.
 *
 * @param from - The reader's first instant (FIRE: the first snapshot; Rendimenti: the period's start), or null for all
 * @param realRowsCategoryId - A category read from its real rows in every month (Rendimenti's dividends, § 6.4)
 */
export async function readExpenseFlows(
  ownerId: string,
  options: { from?: Date | null; realRowsCategoryId?: string } = {},
): Promise<Expense[]> {
  return loadExpenseFlows(ownerId, expenseFlowSourceClient(ownerId), {
    now: new Date(),
    from: options.from ?? null,
    realRowsCategoryId: options.realRowsCategoryId,
  });
}

type DateLike = Date | { toDate(): Date } | null | undefined;

const asDate = (value: DateLike): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  return typeof value.toDate === 'function' ? value.toDate() : null;
};

/**
 * @param ownerId - The account whose rows changed (the OWNER, also for a shared-account delegate)
 * @param dates - Every date a written row had BEFORE and AFTER the write, or `'all'` for a mass rewrite
 * @param reason - A short label for the server's log
 */
export async function markExpenseMonthsChanged(ownerId: string, dates: DateLike[] | 'all', reason: string): Promise<void> {
  try {
    let months: string[] | 'all';
    if (dates === 'all') months = 'all';
    else {
      months = monthsToRebuild(dates.map(asDate), new Date()).map(italyMonthLabel);
      if (months.length === 0) return;
      // The route takes at most 120 months: past that, one read of every row costs less anyway.
      if (months.length > 120) months = 'all';
    }
    const response = await authenticatedFetch('/api/expense-totals/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId, months, reason }),
    });
    if (!response.ok) console.warn('[expenseTotals] rebuild refused', { status: response.status, reason });
  } catch (error) {
    console.warn('[expenseTotals] rebuild request failed', { reason, error });
  }
}
