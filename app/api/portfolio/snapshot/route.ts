import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Asset } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
  calculateFIRENetWorth,
} from '@/lib/services/assetService';
import { calculateCurrentAllocation } from '@/lib/services/assetAllocationService';
import { updateUserAssetPrices, type PriceUpdateResult } from '@/lib/helpers/priceUpdater';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
  verifyCronSecret,
} from '@/lib/server/apiAuth';
import { snapshotRequestSchema, parseOr400 } from '@/lib/server/validation';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { settleDueBalances } from '@/lib/server/cashSettlement';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import {
  buildSnapshotDocument,
  buildSnapshotPriceRecord,
  snapshotHasFigures,
} from '@/lib/utils/snapshotDocument';

const SNAPSHOTS_COLLECTION = 'monthly-snapshots';

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
 * POST /api/portfolio/snapshot
 *
 * Create or update monthly snapshot of portfolio state
 *
 * Orchestrates multiple services:
 *   1. Price updates (Yahoo Finance)
 *   2. Asset value calculations
 *   3. Allocation calculations
 *   4. Snapshot persistence
 *
 * Request Body (strict: any other key, `year` and `month` included, is a 400 — RI6):
 *   {
 *     userId: string,
 *     cronSecret?: string // Optional: for cron job authorization
 *   }
 *
 * The target is ALWAYS the current Italian month (doc/snapshot-integri/README.md § 5.3): a closed
 * month is written only by hand, through /manual, which keeps the version it replaces.
 *
 * Snapshot Structure:
 *   - One document per user per month
 *   - Document ID: "{userId}-{year}-{M}"
 *   - Contains: net worth, allocations, per-asset breakdown
 *
 * Idempotency:
 *   - If snapshot exists for the month: Updates (overwrites the figures, keeps `createdAt`, the note
 *     and the `previous` pointer; never archives — it rewrites the running month every evening)
 *   - If new: Creates
 *   - Read and write in ONE transaction (RI5): the cron and the button a second apart cannot both
 *     believe they are the first
 *   - Authorship: `writtenBy` 'cron' with a valid `cronSecret`, 'button' with a token (RI2)
 *
 * Hall of Fame Integration:
 *   - NOT called here (see lines 120-121)
 *   - Client-side triggers update after success
 *   - Rationale: Client controls timing for UI feedback
 *
 * Related:
 *   - portfolio/snapshot/manual/route.ts: Manual snapshot with validation
 *   - cron/monthly-snapshot/route.ts: Scheduled monthly snapshots
 *   - hallOfFameService.server.ts: Ranking updates
 */
export async function POST(request: NextRequest) {
  try {
    // Get user ID and optional year/month from request
    const requestBody = await request.json();
    const bodyResult = parseOr400(snapshotRequestSchema, requestBody);
    if (!bodyResult.ok) return bodyResult.response;
    const { userId, cronSecret } = bodyResult.data;

    // Verify cron secret if provided (for scheduled jobs)
    if (cronSecret && !verifyCronSecret(cronSecret)) {
      return NextResponse.json(
        { error: 'Invalid cron secret' },
        { status: 401 }
      );
    }

    // Scheduled snapshots are authenticated with a shared secret because there is
    // no end-user Firebase session involved. All interactive callers must present
    // a Firebase ID token that matches the requested userId.
    let writtenByUid: string | undefined;
    if (!cronSecret) {
      const decodedToken = await requireFirebaseAuth(request);
      await assertCanAccessAccount(decodedToken, userId);
      writtenByUid = decodedToken.uid;
    } else if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Settle the rows whose date has come (lib/server/cashSettlement.ts) BEFORE the assets are
    // read: the photo of the month must see today's instalments already out of the account,
    // whichever of the two daily crons runs first. A failure is logged and the snapshot goes on
    // — the rows stay pending and the next run settles them.
    try {
      const { settled } = await settleDueBalances(userId, new Date());
      if (settled > 0) console.log(`Settled ${settled} scheduled cashflow rows for user ${userId}`);
    } catch (error) {
      console.error('Error settling scheduled cashflow rows:', error);
    }

    // Attempt fresh price updates before snapshot
    //
    // Error handling strategy: Non-blocking, use stale prices if update fails
    //
    // Why continue on failure?
    //   - Yahoo Finance API occasionally times out or rate-limits
    //   - Assets already have lastPriceUpdate from previous successful fetches
    //   - Better to have snapshot with slightly stale prices than no snapshot
    //   - Monthly snapshots are meant for historical trends, not real-time tracking
    //
    // Alternative considered: Fail snapshot if prices fail
    //   Rejected: Creates brittleness in automated monthly snapshots
    //   Single API failure would break entire snapshot creation
    //
    // What the update did is no longer only a log line: it goes into the snapshot's `prices` record
    // (RI13), so a month built on a stale or jumped price says so for good (C4).
    console.log(`Updating prices for user ${userId}...`);
    let priceUpdateResult: PriceUpdateResult | null = null;
    try {
      priceUpdateResult = await updateUserAssetPrices(userId);
      console.log(`Price update result: ${priceUpdateResult.message}`);
    } catch (error) {
      console.error('Error updating prices:', error);
      // Continue with existing prices (potentially stale)
    }

    // Get all assets for the user using Firebase Admin SDK
    const assetsRef = adminDb.collection('assets');
    const assetsSnapshot = await assetsRef.where('userId', '==', userId).get();

    if (assetsSnapshot.empty) {
      return NextResponse.json({
        success: false,
        message: 'No assets found for user',
        snapshotId: null,
      });
    }

    const assets: Asset[] = assetsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Asset[];

    // Use Italy timezone for month/year calculation: the server runs in UTC, and the evening cron
    // of the last day (19:00 in Italy) must write the Italian month, not the UTC one. ALWAYS the
    // current month (RI6): the request cannot name another.
    const { month: snapshotMonth, year: snapshotYear } = getItalyMonthYear();

    const totalNetWorth = calculateTotalValue(assets);
    const liquidNetWorth = calculateLiquidNetWorth(assets);
    const illiquidNetWorth = calculateIlliquidNetWorth(assets);
    const fireNetWorth = calculateFIRENetWorth(assets, false);
    const allocation = calculateCurrentAllocation(assets);

    // The percentages (`assetAllocation`) are derived by the builder from `byAssetClass` and the
    // total (lib/utils/snapshotDocument.ts): kept for the allocation drift charts.
    const byAsset = buildByAssetBreakdown(assets);

    // Freeze what the pension funds contributed to `byAssetClass` above.
    //
    // Re-running the SAME function over just the funds is what makes the two agree by
    // construction: `allocation` folded each fund in through its `composition`, and this folds the
    // identical funds through the identical composition, so `pension.byAssetClass[c]` is always a
    // subset of `allocation.byAssetClass[c]` and Storico can subtract it exactly instead of
    // estimating with today's composition. Written unconditionally — with no funds it stores a
    // measured zero, which a reader must be able to tell apart from an old snapshot's silence.
    const pensionAllocation = calculateCurrentAllocation(
      assets.filter((asset) => asset.type === 'pensionFund')
    );

    const snapshotId = `${userId}-${snapshotYear}-${snapshotMonth}`;
    const prices = buildSnapshotPriceRecord(assets, priceUpdateResult);
    const snapshotRef = adminDb.collection(SNAPSHOTS_COLLECTION).doc(snapshotId);

    // Save snapshot, read-then-write in one transaction (RI5).
    //
    // `.set()` without merge REPLACES the document, which is what the recomputed fields
    // want (a merge would keep the `byAssetClass` key of a class that left the portfolio).
    // The user's note is not recomputed by anything, so it has to ride across the replace:
    // this cron runs DAILY on the CURRENT month, so a bare replace erased the note the
    // evening it was written (Storico, 2026-09-07). The builder carries it, and `createdAt`
    // of the month's first write (snapshotDocument.ts, RI1–RI3).
    const now = new Date();
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
          writtenBy: cronSecret ? 'cron' : 'button',
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

    // Hall of Fame Integration: Client-side trigger pattern
    //
    // Design Decision: Client calls updateHallOfFame after snapshot success
    // See: app/dashboard/page.tsx createSnapshot function
    //
    // Why not update here?
    //   - Client wants to show loading state during Hall of Fame calculation
    //   - Allows UI to display success message before expensive ranking recalc
    //   - Separates snapshot creation (fast) from ranking (slow, O(n²))
    //
    // Other update locations:
    //   ✓ portfolio/snapshot/manual/route.ts: Server-side trigger
    //   ✓ cron/monthly-snapshot/route.ts: Server-side trigger
    //
    // If adding new snapshot endpoints:
    //   Consider whether client or server should trigger Hall of Fame update
    //   based on whether UI needs to show progress feedback

    return NextResponse.json({
      success: true,
      message: existed
        ? 'Snapshot aggiornato con successo'
        : 'Snapshot creato con successo',
      snapshotId,
      data: {
        year: snapshotYear,
        month: snapshotMonth,
        totalNetWorth,
        liquidNetWorth,
        assetsCount: assets.length,
        prices,
      },
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
