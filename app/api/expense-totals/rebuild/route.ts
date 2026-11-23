import { NextRequest, NextResponse } from 'next/server';
import { assertCanAccessAccount, getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { expenseTotalsRebuildSchema, parseOr400 } from '@/lib/server/validation';
import { rebuildAllExpenseTotals, rebuildExpenseTotals } from '@/lib/server/expenseTotals';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { parseItalyMonthLabel } from '@/lib/utils/expenseTotals';
import type { ItalyMonth } from '@/types/expenseTotals';

/**
 * POST /api/expense-totals/rebuild (doc/totali-mensili/README.md § 5.2)
 *
 * After a client write on a month that is not the running one, the browser asks the server to
 * rebuild that month's totals from its rows (D-TM5: only the server writes them). The same
 * authorization as `/api/dashboard/overview/invalidate`: `ownerId` must be an account the caller
 * can act on (a shared-account delegate rebuilds the OWNER's totals).
 *
 * Body: `{ ownerId, months: ['YYYY-MM', …] | 'all', reason? }`. `all` rebuilds every month from one
 * read of every row (a mass rewrite: a category renamed, an import undone), so it is rate-limited.
 *
 * Not critical for the caller (`markExpenseMonthsChanged` logs a failure and goes on): the nightly
 * check repairs what a failed call left behind (CU5).
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const parsed = parseOr400(expenseTotalsRebuildSchema, await request.json().catch(() => null));
    if (!parsed.ok) return parsed.response;
    const { ownerId, months } = parsed.data;
    await assertCanAccessAccount(decodedToken, ownerId);

    if (months === 'all') {
      const limit = checkRateLimit(`${decodedToken.uid}:expense-totals-all`, 10, 60 * 60 * 1000);
      if (!limit.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 60) } });
      }
      const result = await rebuildAllExpenseTotals(ownerId);
      return NextResponse.json({ ok: true, years: result.years });
    }

    const parsedMonths = months.map(parseItalyMonthLabel).filter((m): m is ItalyMonth => m !== null);
    const result = await rebuildExpenseTotals(ownerId, parsedMonths);
    return NextResponse.json({ ok: true, months: result.months });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    console.error('Failed to rebuild expense totals', { operation: 'POST /api/expense-totals/rebuild', error });
    return NextResponse.json({ error: 'Failed to rebuild expense totals' }, { status: 500 });
  }
}
