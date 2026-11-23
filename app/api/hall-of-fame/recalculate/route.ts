import { NextRequest, NextResponse } from 'next/server';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import { rebuildAllExpenseTotals } from '@/lib/server/expenseTotals';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { hallOfFameRecalculateSchema, parseOr400 } from '@/lib/server/validation';

/**
 * POST /api/hall-of-fame/recalculate
 *
 * Manually trigger Hall of Fame rankings recalculation for a single user
 *
 * Request Body:
 *   {
 *     userId: string  // Required
 *     rebuildTotals?: boolean  // Rebuild the monthly expense totals from every row first
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     message: string
 *   }
 *
 * Use Cases:
 *   - Manual refresh after data corrections
 *   - Recovery from failed automatic updates
 *   - Admin operations
 *
 * Related:
 *   - hallOfFameService.server.ts: Ranking calculation logic
 *   - portfolio/snapshot/manual/route.ts: Automatic trigger after snapshot
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const parsed = parseOr400(hallOfFameRecalculateSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const { userId, rebuildTotals } = parsed.data;

    await assertCanAccessAccount(decodedToken, userId);

    // «Aggiorna i record» first rebuilds the monthly totals from every row (doc/totali-mensili
    // § 5.4: the manual way to put them back in order); after a snapshot from the Panoramica the
    // totals are read as they are.
    if (rebuildTotals) await rebuildAllExpenseTotals(userId);
    await updateHallOfFame(userId);

    return NextResponse.json({
      success: true,
      message: 'Hall of Fame recalculated successfully',
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error recalculating Hall of Fame:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate Hall of Fame' },
      { status: 500 }
    );
  }
}
