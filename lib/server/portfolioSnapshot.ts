import { adminDb } from '@/lib/firebase/admin';
import { Asset, type SnapshotPriceRecord } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
  calculateFIRENetWorth,
} from '@/lib/services/assetService';
import { calculateCurrentAllocation } from '@/lib/services/assetAllocationService';
import { updateUserAssetPrices, type PriceUpdateResult } from '@/lib/helpers/priceUpdater';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { settleDueBalances } from '@/lib/server/cashSettlement';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import {
  buildSnapshotDocument,
  buildSnapshotPriceRecord,
  snapshotHasFigures,
} from '@/lib/utils/snapshotDocument';

const SNAPSHOTS_COLLECTION = 'monthly-snapshots';

export type PortfolioSnapshotResult =
  | { status: 'no-assets'; snapshotId: null }
  | {
      status: 'created' | 'updated';
      snapshotId: string;
      data: {
        year: number;
        month: number;
        totalNetWorth: number;
        liquidNetWorth: number;
        assetsCount: number;
        prices: SnapshotPriceRecord;
      };
    };

export interface PortfolioSnapshotOptions {
  /** Who is writing: the daily cron or a person pressing the button (F07 RI2). */
  writtenBy: 'cron' | 'button';
  /** The uid of the person, for `button`. */
  writtenByUid?: string;
  now?: Date;
}

function buildByAssetBreakdown(assets: Asset[]) {
  return assets.map((asset) => ({
    assetId: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    quantity: asset.quantity,
    price: asset.currentPrice,
    totalValue: calculateAssetValue(asset),
  }));
}

/**
 * Creates or updates the CURRENT Italian month's snapshot of one account (C7, doc/cron-serale § 5.2).
 *
 * The body of `POST /api/portfolio/snapshot`, moved here so the cron calls it directly instead of
 * fetching its own route with the cron secret in the body. Authorisation is the caller's job: the
 * route checks the token and the account; the cron reads the admitted users.
 *
 * The target is ALWAYS the current month (doc/snapshot-integri § 5.3); read and write happen in ONE
 * transaction (RI5); the user's note and the first `createdAt` ride across the replace.
 */
export async function createPortfolioSnapshot(
  userId: string,
  { writtenBy, writtenByUid, now = new Date() }: PortfolioSnapshotOptions
): Promise<PortfolioSnapshotResult> {
  // Settle the rows whose date has come BEFORE the assets are read: the photo of the month must see
  // today's instalments already out of the account. A failure is logged and the snapshot goes on —
  // the rows stay pending and the next run settles them.
  try {
    const { settled } = await settleDueBalances(userId, now);
    if (settled > 0) console.log(`Settled ${settled} scheduled cashflow rows for user ${userId}`);
  } catch (error) {
    console.error('Error settling scheduled cashflow rows:', error);
  }

  // Fresh prices, non-blocking: a stale price beats no snapshot. What the update did goes into the
  // snapshot's `prices` record (RI13), so a month built on a stale or jumped price says so for good (C4).
  console.log(`Updating prices for user ${userId}...`);
  let priceUpdateResult: PriceUpdateResult | null = null;
  try {
    priceUpdateResult = await updateUserAssetPrices(userId);
    console.log(`Price update result: ${priceUpdateResult.message}`);
  } catch (error) {
    console.error('Error updating prices:', error);
  }

  const assetsSnapshot = await adminDb.collection('assets').where('userId', '==', userId).get();
  if (assetsSnapshot.empty) return { status: 'no-assets', snapshotId: null };

  const assets: Asset[] = assetsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Asset[];

  // Italian month: the server runs in UTC, and the evening cron of the last day must write the
  // Italian month, not the UTC one. ALWAYS the current month (RI6).
  const { month: snapshotMonth, year: snapshotYear } = getItalyMonthYear(now);

  const totalNetWorth = calculateTotalValue(assets);
  const liquidNetWorth = calculateLiquidNetWorth(assets);
  const illiquidNetWorth = calculateIlliquidNetWorth(assets);
  const fireNetWorth = calculateFIRENetWorth(assets, false);
  const allocation = calculateCurrentAllocation(assets);
  const byAsset = buildByAssetBreakdown(assets);

  // Freeze what the pension funds contributed to `byAssetClass`: the same function over just the
  // funds, so `pension.byAssetClass[c]` is always a subset of `allocation.byAssetClass[c]` and Storico
  // subtracts it exactly. Written unconditionally (a measured zero differs from an old snapshot's silence).
  const pensionAllocation = calculateCurrentAllocation(
    assets.filter((asset) => asset.type === 'pensionFund')
  );

  const snapshotId = `${userId}-${snapshotYear}-${snapshotMonth}`;
  const prices = buildSnapshotPriceRecord(assets, priceUpdateResult);
  const snapshotRef = adminDb.collection(SNAPSHOTS_COLLECTION).doc(snapshotId);

  // `.set()` without merge REPLACES the document, which is what the recomputed fields want; the note
  // and `createdAt` ride across through the builder (snapshotDocument.ts, RI1–RI3).
  const existed = await adminDb.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(snapshotRef);
    const existing = existingSnapshot.data() as Record<string, unknown> | undefined;
    transaction.set(
      snapshotRef,
      buildSnapshotDocument({
        figures: {
          userId,
          year: snapshotYear,
          month: snapshotMonth,
          totalNetWorth,
          liquidNetWorth,
          illiquidNetWorth,
          fireNetWorth,
          byAssetClass: allocation.byAssetClass,
          byAsset,
          pension: {
            totalValue: pensionAllocation.totalValue,
            byAssetClass: pensionAllocation.byAssetClass,
          },
        },
        writtenBy,
        writtenByUid,
        now,
        prices,
        existing,
      })
    );
    return snapshotHasFigures(existing);
  });
  await invalidateDashboardOverviewSummaryServer(
    userId,
    existed ? 'snapshot_overwritten' : 'snapshot_created'
  );

  return {
    status: existed ? 'updated' : 'created',
    snapshotId,
    data: {
      year: snapshotYear,
      month: snapshotMonth,
      totalNetWorth,
      liquidNetWorth,
      assetsCount: assets.length,
      prices,
    },
  };
}
