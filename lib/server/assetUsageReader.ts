import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { ASSET_TRANSACTIONS_COLLECTION } from '@/types/assetTransactions';
import { toDate } from '@/lib/utils/dateHelpers';
import { buildAssetUsage, type AssetUsage } from '@/lib/utils/assetUsage';

/**
 * Reads what `buildAssetUsage` needs for one asset (doc/cancellazione-strumenti/README.md § 4.1):
 * Admin SDK only, one query per collection with `userId` plus at most one more equality (no
 * composite index). Returns null when the asset does not exist or is not the account's.
 */
export async function readAssetUsage(userId: string, assetId: string, now: Date = new Date()): Promise<AssetUsage | null> {
  const assets = await getUserAssetsAdmin(userId);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return null;

  const byField = (collection: string, field: string) =>
    adminDb.collection(collection).where('userId', '==', userId).where(field, '==', assetId).get();

  const [txSnap, settlingSnap, divSnap, plansSnap, modelSnap, settingsSnap, goalsSnap, exp1, exp2, exp3, pensionInto, pensionFrom] =
    await Promise.all([
      byField(ASSET_TRANSACTIONS_COLLECTION, 'assetId'),
      byField(ASSET_TRANSACTIONS_COLLECTION, 'linkedCashAssetId'),
      // By `assetId` alone, then filtered to the account's own (no composite index; RS6b).
      adminDb.collection('dividends').where('assetId', '==', assetId).get(),
      adminDb.collection('accumulationPlans').where('userId', '==', userId).get(),
      adminDb.collection('modelPortfolios').doc(userId).get(),
      adminDb.collection('assetAllocationTargets').doc(userId).get(),
      adminDb.collection('goalBasedInvesting').doc(userId).get(),
      byField('expenses', 'linkedCashAssetId'),
      byField('expenses', 'transferCashAssetId'),
      byField('expenses', 'debtAssetId'),
      byField('pensionContributions', 'assetId'),
      byField('pensionContributions', 'sourceCashAssetId'),
    ]);

  const expenseIds = new Set([...exp1.docs, ...exp2.docs, ...exp3.docs].map((d) => d.id));
  const settings = settingsSnap.exists ? settingsSnap.data() ?? {} : {};
  const goalData = goalsSnap.exists ? goalsSnap.data() ?? {} : {};
  const model = modelSnap.exists ? modelSnap.data() : null;

  return buildAssetUsage({
    asset: { id: asset.id, name: asset.name, type: asset.type, quantity: asset.quantity },
    today: now,
    transactions: txSnap.docs.map((d) => ({ date: d.data().date ? toDate(d.data().date) : null })),
    settlingTransactions: settlingSnap.docs.filter((d) => d.data().assetId !== assetId).length,
    dividends: divSnap.docs
      .filter((d) => d.data().userId === userId)
      .map((d) => ({ exDate: d.data().exDate ? toDate(d.data().exDate) : null })),
    plans: plansSnap.docs.map((d) => d.data() as never),
    model: model ? { weights: (model.weights ?? []) as never } : null,
    idealAllocation: settings.idealAllocation ?? null,
    pointers: {
      defaultDebitCashAssetId: settings.defaultDebitCashAssetId,
      defaultCreditCashAssetId: settings.defaultCreditCashAssetId,
      dividendCashAssetId: settings.dividendCashAssetId,
    },
    goals: (goalData.goals ?? []) as Array<{ id: string; name: string }>,
    goalAssignments: (goalData.assignments ?? []) as Array<{ goalId: string; assetId: string }>,
    otherAssets: assets
      .filter((a) => a.id !== assetId)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, dividendCashAssetId: a.dividendCashAssetId, financedAssetId: a.financedAssetId })),
    fireDatedFlows: (settings.fireDatedFlows ?? []) as never,
    expenseRows: expenseIds.size,
    pensionContributionsInto: pensionInto.size,
    pensionContributionsFrom: pensionFrom.docs.filter((d) => d.data().assetId !== assetId).length,
  });
}
