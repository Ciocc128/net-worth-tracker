import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { snapshotRequestSchema, parseOr400 } from '@/lib/server/validation';
import { createPortfolioSnapshot } from '@/lib/server/portfolioSnapshot';

/**
 * POST /api/portfolio/snapshot
 *
 * Create or update the CURRENT month's snapshot of an account, for a person pressing «Crea snapshot».
 * The work itself is `createPortfolioSnapshot` (lib/server/portfolioSnapshot.ts), the same function
 * the daily cron calls directly: since C7 (doc/cron-serale § 5.2) this route has no cron door and
 * `cronSecret` is not part of its body.
 *
 * Request Body (strict: any other key, `year`, `month` and `cronSecret` included, is a 400 — RI6):
 *   { userId: string }
 *
 * Auth: a Firebase ID token that matches the requested account (`assertCanAccessAccount`).
 *
 * The target is ALWAYS the current Italian month (doc/snapshot-integri/README.md § 5.3): a closed
 * month is written only by hand, through /manual, which keeps the version it replaces.
 *
 * Idempotency: an existing month is updated (figures overwritten, `createdAt`, note and `previous`
 * kept; never archived), read and written in ONE transaction (RI5). Authorship: `writtenBy` 'button'
 * with the token's uid (RI2).
 *
 * Hall of Fame: NOT updated here — the client triggers it after success (app/dashboard/page.tsx),
 * so the UI can show its own progress.
 *
 * Related:
 *   - portfolio/snapshot/manual/route.ts: manual snapshot with validation
 *   - cron/monthly-snapshot/route.ts: the daily run, which calls the function directly
 */
export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    const bodyResult = parseOr400(snapshotRequestSchema, requestBody);
    if (!bodyResult.ok) return bodyResult.response;
    const { userId } = bodyResult.data;

    const decodedToken = await requireFirebaseAuth(request);
    await assertCanAccessAccount(decodedToken, userId);

    const result = await createPortfolioSnapshot(userId, {
      writtenBy: 'button',
      writtenByUid: decodedToken.uid,
    });

    if (result.status === 'no-assets') {
      return NextResponse.json({
        success: false,
        message: 'No assets found for user',
        snapshotId: null,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        result.status === 'updated'
          ? 'Snapshot aggiornato con successo'
          : 'Snapshot creato con successo',
      snapshotId: result.snapshotId,
      data: result.data,
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error creating snapshot:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create snapshot',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
