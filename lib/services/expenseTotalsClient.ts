/**
 * The browser's half of the monthly totals' writing (doc/totali-mensili/README.md § 5.2).
 *
 * Only the server writes `expense-totals` (D-TM5): a client writer that touched rows of a month
 * that is NOT the running one asks for that month's rebuild here, after its commit, beside the
 * Panoramica's invalidation. The running month asks nothing (it is read from its rows, and the cron
 * rebuilds it every evening — D-TM4). Awaited by the writer, so the mutation's `onSuccess`
 * invalidation of `expenses.all` (the totals key sits under it) reads the rebuilt document.
 *
 * Never throws: a failure is logged and the write stands; the nightly check repairs it (CU5).
 */

import { authenticatedFetch } from '@/lib/utils/authFetch';
import { italyMonthLabel, monthsToRebuild } from '@/lib/utils/expenseTotals';

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
