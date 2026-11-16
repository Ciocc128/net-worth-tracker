import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { parseOr400, snapshotRestoreSchema } from '@/lib/server/validation';
import { snapshotCapturedAt, snapshotHasFigures } from '@/lib/utils/snapshotDocument';
import type { SnapshotPreviousVersion, SnapshotWriter } from '@/types/assets';

/** The fields a version adds to the document it archives; they never travel back. */
const ARCHIVE_FIELDS = ['archivedAt', 'archivedByUid'] as const;

class NothingToRestoreError extends Error {}

/**
 * POST /api/portfolio/snapshot/restore — the undo of a replacement by hand
 * (doc/snapshot-integri/README.md § 5.5, RI10; kind `owner`).
 *
 * Request Body (strict): { userId: string, year: number, month: number }
 *
 * In ONE transaction: read the month and the version its `previous.versionId` names; archive the
 * current document as a new version; write the old version back with ITS OWN `writtenBy`,
 * `writtenByUid`, `createdAt`, `updatedAt` and figures — they describe the figures, not the act of
 * restoring — the CURRENT note, and `previous` pointing at the version just archived. A restore is
 * therefore undone by a second restore (a swap, D-SN4: nothing is ever deleted, on the one
 * collection with no backup).
 *
 * No `previous`, or its version missing → 404, nothing written.
 * Afterwards: the overview invalidation and `updateHallOfFame`, as the manual route.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const parsed = parseOr400(snapshotRestoreSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const { userId, year, month } = parsed.data;
    await assertCanAccessAccount(decodedToken, userId);

    const snapshotRef = adminDb.collection('monthly-snapshots').doc(`${userId}-${year}-${month}`);
    const now = new Date();

    try {
      await adminDb.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(snapshotRef);
        const current = currentSnapshot.data() as Record<string, unknown> | undefined;
        const pointer = current?.previous as SnapshotPreviousVersion | undefined;
        if (!current || !snapshotHasFigures(current) || !pointer?.versionId) throw new NothingToRestoreError();

        const versionRef = snapshotRef.collection('versions').doc(pointer.versionId);
        const versionSnapshot = await transaction.get(versionRef);
        const version = versionSnapshot.data() as Record<string, unknown> | undefined;
        if (!versionSnapshot.exists || !version) throw new NothingToRestoreError();

        const archiveRef = snapshotRef.collection('versions').doc();
        transaction.set(archiveRef, { ...current, archivedAt: now, archivedByUid: decodedToken.uid });

        const restored: Record<string, unknown> = { ...version };
        for (const field of ARCHIVE_FIELDS) delete restored[field];
        delete restored.note;
        if (current.note !== undefined && current.note !== null) restored.note = current.note;

        const currentCapturedAt = snapshotCapturedAt(current as { createdAt: Date; updatedAt?: unknown });
        const currentWriter = current.writtenBy as SnapshotWriter | undefined;
        restored.previous = {
          versionId: archiveRef.id,
          archivedAt: now.toISOString(),
          ...(currentWriter ? { writtenBy: currentWriter } : {}),
          ...(currentCapturedAt ? { updatedAt: currentCapturedAt.toISOString() } : {}),
        } satisfies SnapshotPreviousVersion;

        transaction.set(snapshotRef, restored);
      });
    } catch (error) {
      if (error instanceof NothingToRestoreError) {
        return NextResponse.json({ error: 'Nessuna versione precedente da ripristinare' }, { status: 404 });
      }
      throw error;
    }

    await invalidateDashboardOverviewSummaryServer(userId, 'manual_snapshot_restored');
    try {
      await updateHallOfFame(userId);
    } catch (error) {
      // Non-critical, as after a manual snapshot: the restore stands, the ranking can be recalculated.
      console.error('Error updating Hall of Fame after a restore:', error);
    }

    return NextResponse.json({ success: true, snapshotId: snapshotRef.id, message: 'Snapshot restored' });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    console.error('Error restoring snapshot:', error);
    return NextResponse.json({ error: 'Failed to restore snapshot' }, { status: 500 });
  }
}
