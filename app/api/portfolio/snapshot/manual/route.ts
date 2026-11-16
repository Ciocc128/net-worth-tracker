import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { manualSnapshotSchema, parseOr400 } from '@/lib/server/validation';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { describeManualSnapshotIncoherence } from '@/lib/utils/manualSnapshotAmounts';
import {
  buildSnapshotDocument,
  snapshotCapturedAt,
  snapshotHasFigures,
} from '@/lib/utils/snapshotDocument';
import type { SnapshotPreviousVersion, SnapshotWriter } from '@/types/assets';

/** A replacement without `replace: true` (RI9): nothing written, the dialog names who wrote the month. */
class SnapshotExistsError extends Error {
  constructor(readonly existing: { writtenBy?: SnapshotWriter; updatedAt?: string }) {
    super('snapshot_exists');
  }
}

/**
 * POST /api/portfolio/snapshot/manual
 *
 * Create a snapshot with explicit, declared figures (no price fetching, no calculation) — the only
 * writer of a CLOSED month (doc/snapshot-integri/README.md § 5.3–5.4).
 *
 * Use Case:
 *   - Enter history from before the app (a month with no snapshot)
 *   - Correct a month by hand: an explicit replacement, the replaced version kept
 *
 * Order: token → schema (strict, `manualSnapshotSchema`) → `assertCanAccessAccount` → coherence
 * (RI8: classes and liquid + illiquid sum to the total, ± 0,01) → not a future month.
 *
 * Request Body:
 *   {
 *     userId: string,
 *     year: number,              // integer 1900-2100
 *     month: number,             // integer 1-12, not after the current Italian month
 *     totalNetWorth: number,     // finite; below zero is legal (loans)
 *     liquidNetWorth: number,
 *     illiquidNetWorth: number,
 *     byAssetClass: { [assetClass]: number },   // keys among ASSET_CLASS_SEQUENCE
 *     byAsset?: Array<{ assetId, ticker, name, quantity, price, totalValue }>,  // ≤ 500 rows
 *     replace?: boolean          // required to replace a month that already has figures
 *   }
 *   `assetAllocation` is derived (never received); `createdAt`/`updatedAt` are stamped.
 *
 * Replacement (RI9), in one transaction:
 *   - the month has figures and no `replace` → 409 { error: 'snapshot_exists', existing: { writtenBy, updatedAt } }
 *   - with `replace: true` → the stored document is copied whole to `{id}/versions/{autoId}` with
 *     `archivedAt`/`archivedByUid`, the new one points at it (`previous`); the note rides across.
 *   A legacy note-only document is not «existing»: it is completed, its note kept.
 *
 * Response: { success, snapshotId, message, replaced }
 *
 * Related:
 *   - portfolio/snapshot/route.ts: the automatic writer (current month only)
 *   - portfolio/snapshot/restore/route.ts: the undo of a replacement
 *   - lib/utils/snapshotDocument.ts: the one builder
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const parsed = parseOr400(manualSnapshotSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const { userId, year, month, totalNetWorth, liquidNetWorth, illiquidNetWorth, byAsset, replace } = parsed.data;
    const byAssetClass = parsed.data.byAssetClass as Record<string, number>;
    await assertCanAccessAccount(decodedToken, userId);

    const incoherence = describeManualSnapshotIncoherence({ totalNetWorth, liquidNetWorth, illiquidNetWorth, byAssetClass });
    if (incoherence) return NextResponse.json({ error: incoherence }, { status: 400 });

    // The current month is allowed (an account with no market-priced asset has no other door,
    // D-SN9); a month after it is not a photograph of anything.
    const today = getItalyMonthYear();
    if (year > today.year || (year === today.year && month > today.month)) {
      return NextResponse.json({ error: 'Un mese futuro non ha uno snapshot' }, { status: 400 });
    }

    // Snapshot document ID format: "{userId}-{year}-{M}" — month NOT zero-padded ("2024-1"), one
    // document per user per month; sorting reads the year/month fields, never the id.
    const snapshotId = `${userId}-${year}-${month}`;
    const snapshotRef = adminDb.collection('monthly-snapshots').doc(snapshotId);
    const now = new Date();

    let replaced: boolean;
    try {
      replaced = await adminDb.runTransaction(async (transaction) => {
        const existingSnapshot = await transaction.get(snapshotRef);
        const existing = existingSnapshot.data() as Record<string, unknown> | undefined;
        const hasFigures = snapshotHasFigures(existing);
        const existingCapturedAt = hasFigures ? snapshotCapturedAt(existing as { createdAt: Date; updatedAt?: unknown }) : null;
        const existingWriter = existing?.writtenBy as SnapshotWriter | undefined;

        if (hasFigures && replace !== true) {
          throw new SnapshotExistsError({
            ...(existingWriter ? { writtenBy: existingWriter } : {}),
            ...(existingCapturedAt ? { updatedAt: existingCapturedAt.toISOString() } : {}),
          });
        }

        let previous: SnapshotPreviousVersion | undefined;
        if (hasFigures) {
          const versionRef = snapshotRef.collection('versions').doc();
          transaction.set(versionRef, { ...existing, archivedAt: now, archivedByUid: decodedToken.uid });
          previous = {
            versionId: versionRef.id,
            archivedAt: now.toISOString(),
            ...(existingWriter ? { writtenBy: existingWriter } : {}),
            ...(existingCapturedAt ? { updatedAt: existingCapturedAt.toISOString() } : {}),
          };
        }

        transaction.set(
          snapshotRef,
          buildSnapshotDocument({
            // No `fireNetWorth`, no `pension`: this form does not measure them, and absent means
            // «unknown» to every reader (types/assets.ts). No `prices`: declared, not priced.
            figures: { userId, year, month, totalNetWorth, liquidNetWorth, illiquidNetWorth, byAssetClass, byAsset: byAsset ?? [] },
            writtenBy: 'manual',
            writtenByUid: decodedToken.uid,
            now,
            // The note and the month's first `createdAt` ride across; `previous` names the version just archived.
            existing,
            previous,
          })
        );
        return hasFigures;
      });
    } catch (error) {
      if (error instanceof SnapshotExistsError) {
        return NextResponse.json({ error: 'snapshot_exists', existing: error.existing }, { status: 409 });
      }
      throw error;
    }
    await invalidateDashboardOverviewSummaryServer(userId, replaced ? 'manual_snapshot_replaced' : 'manual_snapshot_created');

    // Update Hall of Fame rankings after snapshot creation
    //
    // Error handling: Non-critical failure (snapshot still succeeds)
    //
    // Rationale:
    //   - Hall of Fame is a secondary feature (nice-to-have, not essential)
    //   - Snapshot data is the critical operation (must succeed)
    //   - Ranking errors (e.g., DB timeout) shouldn't block snapshot imports
    //   - User can manually recalculate rankings later if needed
    //
    // This mirrors the error handling in cron/monthly-snapshot/route.ts
    try {
      await updateHallOfFame(userId);
      console.log('Hall of Fame updated successfully after manual snapshot');
    } catch (error) {
      console.error('Error updating Hall of Fame:', error);
      // Snapshot succeeds even if Hall of Fame update fails
    }

    return NextResponse.json({
      success: true,
      snapshotId,
      replaced,
      message: replaced ? 'Manual snapshot replaced' : 'Manual snapshot created successfully',
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error creating manual snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to create manual snapshot' },
      { status: 500 }
    );
  }
}
