import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { readAssetUsage } from '@/lib/server/assetUsageReader';
import { deleteAssetWithCleanup } from '@/lib/server/assetDeletion';
import { assetDeleteSchema, assetIdParamSchema, parseOr400 } from '@/lib/server/validation';

/**
 * DELETE /api/assets/[assetId]
 *
 * Deletes an asset after RE-READING where it is used (doc/cancellazione-strumenti/README.md § 4.4):
 * the client's report is never trusted.
 *
 * Body: `{ userId, ledger?: 'keep' | 'delete' }` — `ledger` is required when the asset has ledger
 * operations or pension contributions (D4): `keep` leaves them, `delete` removes them in batches.
 *
 * Responses: 409 `asset/in-use` with the blocking lines (nothing is written); 400 when the ledger
 * choice is missing; 404/403 as before; 200 with what was removed.
 * Order (idempotent, asset last): cleanups → ledger → future dividends → asset document.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const assetIdResult = parseOr400(assetIdParamSchema, (await params).assetId);
    if (!assetIdResult.ok) return assetIdResult.response;
    const assetId = assetIdResult.data;

    const parsed = parseOr400(assetDeleteSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const { userId, ledger } = parsed.data;
    await assertCanAccessAccount(decodedToken, userId);

    const assetDoc = await adminDb.collection('assets').doc(assetId).get();
    if (!assetDoc.exists) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    if (assetDoc.data()?.userId !== userId) {
      return NextResponse.json({ error: 'Asset does not belong to user' }, { status: 403 });
    }

    const usage = await readAssetUsage(userId, assetId);
    if (!usage) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    if (usage.blockers.length > 0) {
      return NextResponse.json({ error: 'asset/in-use', blockers: usage.blockers }, { status: 409 });
    }
    if (usage.needsLedgerChoice && !ledger) {
      return NextResponse.json({ error: 'asset/ledger-choice-required' }, { status: 400 });
    }

    const result = await deleteAssetWithCleanup(userId, assetId, usage, ledger);
    return NextResponse.json({ success: true, message: 'Asset deleted successfully', ...result });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error deleting asset:', error);
    return NextResponse.json(
      { error: 'Failed to delete asset' },
      { status: 500 }
    );
  }
}
