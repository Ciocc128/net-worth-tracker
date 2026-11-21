import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { ASSET_TRANSACTIONS_COLLECTION } from '@/types/assetTransactions';
import { syncOpenPaymentsForAsset } from '@/lib/server/dividendLedgerSync';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import type { AssetUsage, LedgerChoice } from '@/lib/utils/assetUsage';

/** Firestore allows 500 operations per batch; the dossier (§ 4.4) uses 400. */
export const DELETE_BATCH_SIZE = 400;

/** The same non-critical re-sync a trade runs: open dividend payments follow the new ledger. */
async function syncDividendsAfterLedgerDelete(userId: string, assetId: string): Promise<void> {
  try {
    await syncOpenPaymentsForAsset(userId, assetId);
  } catch (error) {
    console.error('[assetDeletion] syncOpenPaymentsForAsset failed (non-critical):', error);
  }
}

export interface AssetDeletionResult {
  deletedFutureDividends: number;
  deletedTransactions: number;
  deletedPensionContributions: number;
  cleaned: string[];
}

async function deleteRefsInBatches(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += DELETE_BATCH_SIZE) {
    const batch = adminDb.batch();
    refs.slice(i, i + DELETE_BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/**
 * Deletes an asset the way doc/cancellazione-strumenti/README.md § 4.4 orders it, so a run that stops
 * half-way can be repeated: the cleanups (one field each), the ledger when asked, the future
 * dividends, and the asset document LAST. `usage` is the report just re-read by the route (the
 * client's word is never trusted) and has no blockers.
 */
export async function deleteAssetWithCleanup(
  userId: string,
  assetId: string,
  usage: AssetUsage,
  ledger: LedgerChoice | undefined,
  now: Date = new Date()
): Promise<AssetDeletionResult> {
  const cleaned: string[] = [];

  // 1 — the cleanups, writing only the fields that change (M1's lesson, § 4.5).
  const settingsRef = adminDb.collection('assetAllocationTargets').doc(userId);
  if (usage.plan.instrumentLimits || usage.plan.groupLimitIds.length > 0 || usage.plan.pointers.length > 0) {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(settingsRef);
      if (!snap.exists) return;
      const data = snap.data() ?? {};
      const update: Record<string, unknown> = {};
      const ideal = data.idealAllocation as
        | { instrumentLimits?: Array<{ assetId: string }>; groupLimits?: Array<{ id: string; assetIds: string[] }> }
        | undefined;
      if (ideal?.instrumentLimits?.some((l) => l.assetId === assetId)) {
        update['idealAllocation.instrumentLimits'] = ideal.instrumentLimits.filter((l) => l.assetId !== assetId);
      }
      if (ideal?.groupLimits?.some((g) => g.assetIds.includes(assetId))) {
        update['idealAllocation.groupLimits'] = ideal.groupLimits
          .map((g) => ({ ...g, assetIds: g.assetIds.filter((id) => id !== assetId) }))
          .filter((g) => g.assetIds.length > 0);
      }
      for (const field of ['defaultDebitCashAssetId', 'defaultCreditCashAssetId', 'dividendCashAssetId'] as const) {
        if (data[field] === assetId) update[field] = FieldValue.delete();
      }
      if (Object.keys(update).length > 0) tx.update(settingsRef, update);
    });
    cleaned.push('settings');
  }

  if (usage.plan.goalAssignments) {
    const goalsRef = adminDb.collection('goalBasedInvesting').doc(userId);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(goalsRef);
      if (!snap.exists) return;
      const assignments = (snap.data()?.assignments ?? []) as Array<{ assetId: string }>;
      if (assignments.some((a) => a.assetId === assetId)) {
        tx.update(goalsRef, { assignments: assignments.filter((a) => a.assetId !== assetId) });
      }
    });
    cleaned.push('goals');
  }

  for (const otherId of usage.plan.assetsToUnlinkDividendAccount) {
    await adminDb.collection('assets').doc(otherId).update({ dividendCashAssetId: FieldValue.delete() });
    cleaned.push(`asset:${otherId}`);
  }

  // 2 — the ledger and the pension contributions, when the user chose to delete them.
  let deletedTransactions = 0;
  let deletedPensionContributions = 0;
  if (ledger === 'delete') {
    const txSnap = await adminDb
      .collection(ASSET_TRANSACTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('assetId', '==', assetId)
      .get();
    await deleteRefsInBatches(txSnap.docs.map((d) => d.ref));
    deletedTransactions = txSnap.size;

    const pensionSnap = await adminDb
      .collection('pensionContributions')
      .where('userId', '==', userId)
      .where('assetId', '==', assetId)
      .get();
    await deleteRefsInBatches(pensionSnap.docs.map((d) => d.ref));
    deletedPensionContributions = pensionSnap.size;

    if (deletedTransactions > 0) await syncDividendsAfterLedgerDelete(userId, assetId);
  }

  // 3 — the future dividends (exDate after today), the account's own only.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dividendsSnap = await adminDb
    .collection('dividends')
    .where('assetId', '==', assetId)
    .where('exDate', '>', Timestamp.fromDate(today))
    .get();
  const ownFuture = dividendsSnap.docs.filter((d) => d.data().userId === userId);
  await deleteRefsInBatches(ownFuture.map((d) => d.ref));

  // 4 — the asset document, last: if anything above stopped, the asset is still there and the same
  // request, repeated, finishes (the cleanups find nothing left to remove).
  await adminDb.collection('assets').doc(assetId).delete();
  await invalidateDashboardOverviewSummaryServer(userId, 'asset_deleted');

  return { deletedFutureDividends: ownFuture.length, deletedTransactions, deletedPensionContributions, cleaned };
}
