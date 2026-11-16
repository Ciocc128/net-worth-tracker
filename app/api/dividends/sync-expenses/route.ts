import { NextRequest, NextResponse } from 'next/server';
import { readDividendSyncCategory, syncDividendExpenses } from '@/lib/services/dividendIncomeService';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { dividendSyncRequestSchema, parseOr400 } from '@/lib/server/validation';

/**
 * POST /api/dividends/sync-expenses
 *
 * Write the income row of every dividend of the account that is already paid and has none yet
 * (Impostazioni › Dividendi › «Sincronizza»).
 *
 * Request Body:
 *   {
 *     userId: string,          // the account, checked with assertCanAccessAccount
 *     categoryId: string,      // an income category OF THAT ACCOUNT (the tab's draft)
 *     subCategoryId?: string
 *   }
 *
 * The request carries ids, never documents (doc/sicurezza/README.md § 4, RS1–RS3): the server
 * reads the account's dividends and the category itself, and the names on the rows come from the
 * stored category. Until 2026-11 the body carried the dividend objects and the rows were written
 * in the account each object declared (A1 of the security review).
 *
 * Response: { success: true, result: { created, skipped, failed } } · 400 «Categoria non trovata»
 * when the category is missing or another account's.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(dividendSyncRequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const { userId, categoryId, subCategoryId } = parsed.data;

    await assertCanAccessAccount(decodedToken, userId);

    const category = await readDividendSyncCategory(userId, categoryId, subCategoryId || undefined);
    if (!category) {
      return NextResponse.json({ error: 'Categoria non trovata' }, { status: 400 });
    }

    const result = await syncDividendExpenses(userId, category);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error in sync-expenses API:', error);
    return NextResponse.json(
      { error: 'Failed to sync dividend expenses' },
      { status: 500 }
    );
  }
}
