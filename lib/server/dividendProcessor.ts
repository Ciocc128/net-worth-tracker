import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { scrapeDividendsByIsin } from '@/lib/services/borsaItalianaScraperService';
import { createDividend, getDividendById, isDuplicateDividend } from '@/lib/services/dividendService';
import { getAssetTransactionsForAssetAdmin } from '@/lib/server/assetAdminRepository';
import { applyPaymentRecalculation } from '@/lib/server/dividendLedgerSync';
import type { AssetTransaction } from '@/types/assetTransactions';
import {
  computeDividendAmounts,
  entitledQuantity,
  isZeroQuantity,
  planPaymentRecalculation,
} from '@/lib/utils/dividendEntitlement';
import { buildCouponDividendData } from '@/lib/utils/couponRecord';
import { createExpenseFromDividend } from '@/lib/services/dividendIncomeService';
import { DividendFormData } from '@/types/dividend';
import { ExpenseSubCategory } from '@/types/expenses';
import { isDividendEligible } from '@/lib/utils/dividendEligibility';
import { Asset, BondDetails } from '@/types/assets';
import { getFollowingCouponDate } from '@/lib/utils/couponUtils';

/**
 * Lower-bound lookback (days) for the catch-up queries in Phases 2 and 3.
 *
 * Why 370: the cron runs daily, so a miss is normally one day old, but bonds can
 * pay annually. 370 days (just over a year) lets a single missed annual coupon
 * still be recovered, while bounding the Firestore range scan to roughly one year
 * of dividends instead of the whole history.
 */
export const COUPON_CATCHUP_LOOKBACK_DAYS = 370;

/**
 * Auto-generated dividend types whose cashflow expense and schedule are owned
 * exclusively by this cron (see commit 9aa1a50). Only these are eligible for
 * catch-up when their payment date already passed without being processed;
 * scraped equity dividends are intentionally NOT back-dated.
 */
const CATCHUP_DIVIDEND_TYPES = new Set(['coupon', 'finalPremium']);

/**
 * What a stored date field looks like by the time it reaches this module: a real
 * Timestamp from the Admin SDK, a `{ toDate }` stand-in from the fixtures, or an
 * already-converted Date / ISO string / epoch number.
 */
type StoredDateValue = Timestamp | { toDate(): Date } | Date | string | number;

/**
 * Normalizes a stored date to epoch milliseconds, so payment dates can be compared
 * regardless of the exact shape Firestore returns.
 */
function toMillis(value: StoredDateValue): number {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return new Date(value).getTime();
  }
  if ('toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  return value.toDate().getTime();
}

/**
 * The Admin SDK hands back a Timestamp where the domain type says Date, and the
 * fixtures hand back a Date; the coupon walk below needs a real Date either way.
 */
function toJsDate(value: Date | Timestamp): Date {
  return value instanceof Date ? value : value.toDate();
}

type LedgerCacheEntry = { asset: Asset; transactions: AssetTransaction[] } | null;

/**
 * RQ9 — the payment-day re-check. Before the cron turns an app-generated payment into cashflow
 * and account money, its quantity is read from the ledger again: the money that enters is always
 * that of the quantity entitled, even when the hook after a ledger operation was skipped. Zero
 * deletes the record (no row is written); another quantity updates it.
 */
async function reconcileWithLedger(
  userId: string,
  dividendId: string,
  dividend: FirebaseFirestore.DocumentData,
  cache: Map<string, LedgerCacheEntry>,
  now: Date
): Promise<'unchanged' | 'updated' | 'deleted'> {
  let entry = cache.get(dividend.assetId);
  if (entry === undefined) {
    const assetDoc = await adminDb.collection('assets').doc(dividend.assetId).get();
    entry = assetDoc.exists
      ? {
          asset: assetDoc.data() as Asset,
          transactions: await getAssetTransactionsForAssetAdmin(userId, dividend.assetId),
        }
      : null;
    cache.set(dividend.assetId, entry);
  }
  if (!entry) return 'unchanged';

  const plan = planPaymentRecalculation({
    dividend: {
      dividendType: dividend.dividendType,
      exDate: toJsDate(dividend.exDate),
      paymentDate: toJsDate(dividend.paymentDate),
      dividendPerShare: dividend.dividendPerShare,
      quantity: dividend.quantity,
    },
    asset: entry.asset,
    transactions: entry.transactions,
    now,
  });
  await applyPaymentRecalculation(dividendId, dividend.currency, plan);
  return plan.kind === 'delete' ? 'deleted' : plan.kind === 'update' ? 'updated' : 'unchanged';
}

export interface ScrapingResult {
  assetsScraped: number;
  newDividends: number;
  errors: number;
}

export interface ExpenseCreationResult {
  processedCount: number;
  errorCount: number;
  processedDividends: Array<{
    userId: string;
    dividendId: string;
    expenseId: string;
    amount: number;
    asset: string;
  }>;
  errors: Array<{ userId: string; dividendId?: string; error: string }>;
}

export interface CouponSchedulingResult {
  scheduled: number;
  skipped: number;
  errors: number;
}

/**
 * Phase 1: Scrape Borsa Italiana for recent dividends and create entries
 * for all users with equity assets that have an ISIN.
 *
 * Uses a 60-day lookback window to balance coverage vs. scraping load.
 * Non-blocking per-asset: errors for one asset never stop other assets.
 */
export async function runDividendScraping(
  users: FirebaseFirestore.QueryDocumentSnapshot[],
  sixtyDaysAgo: Date
): Promise<ScrapingResult> {
  let assetsScraped = 0;
  let newDividends = 0;
  let errors = 0;

  for (const userDoc of users) {
    const userId = userDoc.id;

    try {
      const assetsSnapshot = await adminDb
        .collection('assets')
        .where('userId', '==', userId)
        .where('assetClass', '==', 'equity')
        .get();

      const assetsWithIsin = assetsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        } as Asset))
        .filter(asset => asset.isin && asset.isin.trim() !== '');

      if (assetsWithIsin.length === 0) continue;

      console.log(`User ${userId}: Found ${assetsWithIsin.length} equity assets with ISIN`);

      for (const asset of assetsWithIsin) {
        try {
          console.log(`Scraping dividends for ${asset.ticker} (ISIN: ${asset.isin}, Type: ${asset.type})`);

          const scrapedDividends = await scrapeDividendsByIsin(asset.isin!, asset.type);
          if (scrapedDividends.length === 0) continue;

          // Two-part eligibility: 60-day recency AND on or after the asset's dividend floor
          // (the holding start when the ledger knows it, else the creation date — the ONE
          // rule in lib/utils/dividendEligibility.ts, shared with the scrape route).
          const relevantDividends = scrapedDividends.filter(div =>
            div.exDate >= sixtyDaysAgo && isDividendEligible(div.exDate, asset)
          );

          console.log(`Found ${scrapedDividends.length} total, ${relevantDividends.length} relevant dividends for ${asset.ticker}`);

          // The quantity that was entitled at each ex-date comes from the ledger, read once per
          // instrument (doc/dividendi-quantita RQ1–RQ5).
          const transactions = await getAssetTransactionsForAssetAdmin(userId, asset.id);
          const now = new Date();

          for (const scrapedDiv of relevantDividends) {
            try {
              const isDuplicate = await isDuplicateDividend(userId, asset.id, scrapedDiv.exDate);
              if (isDuplicate) continue;

              const quantity = entitledQuantity({
                asset,
                transactions,
                referenceDate: scrapedDiv.exDate,
                now,
              });
              if (isZeroQuantity(quantity)) continue; // nothing was held at the ex-date (RQ4)

              // The instrument's rate (default 26%, Legislative Decree 461/1997, Art. 27) — RT1
              const dividendData: DividendFormData = {
                assetId: asset.id,
                exDate: scrapedDiv.exDate,
                paymentDate: scrapedDiv.paymentDate,
                dividendPerShare: scrapedDiv.dividendPerShare,
                quantity,
                ...computeDividendAmounts(scrapedDiv.dividendPerShare, quantity, asset),
                currency: scrapedDiv.currency,
                dividendType: scrapedDiv.dividendType,
                isAutoGenerated: true,
                costPerShare: asset.averageCost,
              };

              await createDividend(userId, dividendData, asset.ticker, asset.name, asset.isin!, true);
              newDividends++;
              console.log(`Created dividend: ${asset.ticker} - ${scrapedDiv.dividendPerShare} ${scrapedDiv.currency} on ${scrapedDiv.exDate.toLocaleDateString('it-IT')}`);
            } catch (dividendError) {
              console.error(`Error creating dividend for ${asset.ticker}:`, dividendError);
            }
          }

          assetsScraped++;
        } catch (assetError) {
          console.error(`Error scraping dividends for asset ${asset.ticker}:`, assetError);
          errors++;
        }
      }
    } catch (userError) {
      console.error(`Error processing user ${userId} for dividend scraping:`, userError);
      errors++;
    }
  }

  return { assetsScraped, newDividends, errors };
}

/**
 * Phase 2: For each user, create cashflow expense entries for dividends that are
 * due and not yet processed.
 *
 * A dividend is processed when it has no linked expense (idempotency) AND either:
 *   - its paymentDate falls within today's Italian-day window, OR
 *   - it is an auto-generated coupon/finalPremium whose paymentDate already passed
 *     (catch-up): these are owned solely by the cron, so a previously missed run
 *     must still produce the expense instead of losing it forever.
 * Scraped equity/manual dividends with a past paymentDate are intentionally NOT
 * back-dated, to avoid surprising retroactive cashflow entries.
 *
 * Requires dividendIncomeCategoryId to be configured in user settings.
 */
export async function runExpenseCreation(
  users: FirebaseFirestore.QueryDocumentSnapshot[],
  todayStart: Timestamp,
  todayEnd: Timestamp,
  lookbackStart: Timestamp
): Promise<ExpenseCreationResult> {
  let processedCount = 0;
  let errorCount = 0;
  const processedDividends: ExpenseCreationResult['processedDividends'] = [];
  const errors: ExpenseCreationResult['errors'] = [];

  for (const userDoc of users) {
    const userId = userDoc.id;

    try {
      const settingsDoc = await adminDb
        .collection('assetAllocationTargets')
        .doc(userId)
        .get();

      if (!settingsDoc.exists) {
        console.log(`No settings found for user ${userId}, skipping`);
        continue;
      }

      const settings = settingsDoc.data();
      const dividendIncomeCategoryId = settings?.dividendIncomeCategoryId;

      if (!dividendIncomeCategoryId) {
        console.log(`No dividend income category configured for user ${userId}, skipping`);
        continue;
      }

      const categoryDoc = await adminDb
        .collection('expenseCategories')
        .doc(dividendIncomeCategoryId)
        .get();

      if (!categoryDoc.exists) {
        console.log(`Category ${dividendIncomeCategoryId} not found for user ${userId}, skipping`);
        continue;
      }

      const category = categoryDoc.data();
      const categoryName = category?.name || 'Dividendi';

      let subCategoryName: string | undefined;
      if (settings?.dividendIncomeSubCategoryId) {
        const subCategory = (category?.subCategories ?? []).find(
          (sub: ExpenseSubCategory) => sub.id === settings.dividendIncomeSubCategoryId
        );
        if (subCategory) subCategoryName = subCategory.name;
      }

      // Range covers the catch-up lookback up to end-of-today; per-dividend
      // eligibility is decided below so past equity dividends are excluded.
      const dividendsSnapshot = await adminDb
        .collection('dividends')
        .where('userId', '==', userId)
        .where('paymentDate', '>=', lookbackStart)
        .where('paymentDate', '<=', todayEnd)
        .get();

      if (dividendsSnapshot.empty) {
        console.log(`No dividends due for user ${userId}`);
        continue;
      }

      console.log(`Found ${dividendsSnapshot.size} candidate dividends for user ${userId}`);
      const ledgerCache = new Map<string, LedgerCacheEntry>();

      for (const dividendDoc of dividendsSnapshot.docs) {
        const dividendId = dividendDoc.id;
        let dividend = dividendDoc.data();

        // Idempotency: skip if expense already created (covers cron retries and manual creation)
        if (dividend.expenseId) {
          continue;
        }

        // Eligibility: due today, or an auto-generated coupon/premium being recovered.
        // Compare in milliseconds so both real Firestore Timestamps and normalized
        // dates behave consistently; the query already bounds the upper edge.
        const paymentMs = toMillis(dividend.paymentDate);
        const isDueToday = paymentMs >= todayStart.toMillis() && paymentMs <= todayEnd.toMillis();
        const isCatchupCoupon =
          dividend.isAutoGenerated === true &&
          CATCHUP_DIVIDEND_TYPES.has(dividend.dividendType);
        if (!isDueToday && !isCatchupCoupon) {
          continue;
        }

        try {
          // RQ9: an app-generated payment not corrected by hand is re-read from the ledger first.
          if (dividend.isAutoGenerated === true && dividend.manuallyEdited !== true) {
            const outcome = await reconcileWithLedger(userId, dividendId, dividend, ledgerCache, new Date());
            if (outcome === 'deleted') {
              console.log(`Dividend ${dividendId} (${dividend.assetTicker}) no longer entitled: removed, no expense written`);
              continue;
            }
            if (outcome === 'updated') {
              const fresh = await getDividendById(dividendId);
              if (!fresh) continue;
              // Only the recomputed amounts: the stored dates stay Timestamps for the code below.
              dividend = {
                ...dividend,
                quantity: fresh.quantity,
                grossAmount: fresh.grossAmount,
                taxAmount: fresh.taxAmount,
                netAmount: fresh.netAmount,
                grossAmountEur: fresh.grossAmountEur,
                taxAmountEur: fresh.taxAmountEur,
                netAmountEur: fresh.netAmountEur,
                exchangeRate: fresh.exchangeRate,
              };
            }
          }

          // Normalize Firestore Timestamps to Date for dividendIncomeService
          const dividendData = {
            id: dividendId,
            userId,
            assetId: dividend.assetId,
            assetTicker: dividend.assetTicker,
            assetName: dividend.assetName,
            isin: dividend.isin,
            exDate: dividend.exDate?.toDate(),
            paymentDate: dividend.paymentDate?.toDate(),
            dividendPerShare: dividend.dividendPerShare,
            quantity: dividend.quantity,
            grossAmount: dividend.grossAmount,
            taxAmount: dividend.taxAmount,
            netAmount: dividend.netAmount,
            currency: dividend.currency,
            dividendType: dividend.dividendType,
            grossAmountEur: dividend.grossAmountEur,
            taxAmountEur: dividend.taxAmountEur,
            netAmountEur: dividend.netAmountEur,
            exchangeRate: dividend.exchangeRate,
            notes: dividend.notes,
            isAutoGenerated: dividend.isAutoGenerated,
            createdAt: dividend.createdAt?.toDate(),
            updatedAt: dividend.updatedAt?.toDate(),
          };

          const expenseId = await createExpenseFromDividend(
            dividendData,
            dividendIncomeCategoryId,
            categoryName,
            settings?.dividendIncomeSubCategoryId,
            subCategoryName
          );

          processedCount++;
          processedDividends.push({
            userId,
            dividendId,
            expenseId,
            amount: dividendData.netAmountEur ?? dividendData.netAmount,
            asset: dividend.assetTicker,
          });

          console.log(`Created expense ${expenseId} for dividend ${dividendId} (${dividend.assetTicker})`);
        } catch (dividendError) {
          console.error(`Error processing dividend ${dividendId}:`, dividendError);
          errorCount++;
          errors.push({ userId, dividendId, error: (dividendError as Error).message });
        }
      }
    } catch (userError) {
      console.error(`Error processing user ${userId}:`, userError);
      errorCount++;
      errors.push({ userId, error: (userError as Error).message });
    }
  }

  return { processedCount, errorCount, processedDividends, errors };
}

/**
 * Phase 3: Keep the coupon chain advanced so that each bond always has exactly
 * one upcoming (future-dated) coupon stored.
 *
 * Design: only one coupon per bond is materialized at a time; when it is paid,
 * the next one must be created. Rather than reacting only to coupons paid exactly
 * today, this walks forward from the most recent paid coupon and generates every
 * missing coupon up to the first future one. This self-heals a chain that was
 * interrupted by a missed run (cron downtime, timezone drift) — without it, a
 * single skipped coupon would stop all future coupons for that bond permanently.
 *
 * Idempotent: isDuplicateDividend (plus deterministic IDs in createDividend)
 * prevents double-creation across runs and retries.
 */
export async function runNextCouponScheduling(
  users: FirebaseFirestore.QueryDocumentSnapshot[],
  todayStart: Timestamp,
  todayEnd: Timestamp,
  lookbackStart: Timestamp
): Promise<CouponSchedulingResult> {
  let scheduled = 0;
  let skipped = 0;
  let errors = 0;
  const todayEndMs = todayEnd.toMillis();

  for (const userDoc of users) {
    const userId = userDoc.id;

    try {
      // Include coupons due within the catch-up window, not just today's, so a
      // previously missed coupon still triggers regeneration of its successor.
      const couponSnapshot = await adminDb
        .collection('dividends')
        .where('userId', '==', userId)
        .where('dividendType', '==', 'coupon')
        .where('isAutoGenerated', '==', true)
        .where('paymentDate', '>=', lookbackStart)
        .where('paymentDate', '<=', todayEnd)
        .get();

      if (couponSnapshot.empty) continue;

      // Process each bond once, from its most recent paid coupon: the heal loop
      // below advances the whole chain, so older coupons of the same bond would
      // only do redundant duplicate checks.
      const latestCouponByAsset = new Map<string, FirebaseFirestore.DocumentData>();
      for (const couponDoc of couponSnapshot.docs) {
        const coupon = couponDoc.data();
        const existing = latestCouponByAsset.get(coupon.assetId);
        if (!existing || toMillis(coupon.paymentDate) > toMillis(existing.paymentDate)) {
          latestCouponByAsset.set(coupon.assetId, coupon);
        }
      }

      console.log(`User ${userId}: Found ${latestCouponByAsset.size} bonds with coupons due to advance`);

      for (const coupon of latestCouponByAsset.values()) {
        try {
          const assetDoc = await adminDb.collection('assets').doc(coupon.assetId).get();

          if (!assetDoc.exists) {
            console.log(`Asset ${coupon.assetId} not found, skipping next-coupon generation`);
            skipped++;
            continue;
          }

          const asset = assetDoc.data() as Asset & { bondDetails?: BondDetails };

          if (!asset.bondDetails) {
            skipped++;
            continue;
          }

          // A bond with no units pays nothing: no coupon is scheduled for it (the ledger hook
          // makes the next one when units come back, RQ7).
          if (asset.quantity <= 0) {
            skipped++;
            continue;
          }

          const bd = asset.bondDetails;
          const maturityDate = toJsDate(bd.maturityDate);

          // Walk forward one period at a time from the paid coupon, creating any
          // missing coupon until we land on (or confirm) the first future one.
          let fromDate = toJsDate(coupon.paymentDate);
          let createdForBond = 0;

          while (true) {
            const nextDate = getFollowingCouponDate(fromDate, bd.couponFrequency, maturityDate);
            if (!nextDate) {
              console.log(`Bond ${coupon.assetTicker} has matured, no further coupon`);
              break;
            }

            const isDuplicate = await isDuplicateDividend(userId, coupon.assetId, nextDate);
            if (isDuplicate) {
              // Already in the chain. If it is the upcoming future coupon the chain
              // is healed; otherwise advance past this gap-filling coupon.
              if (nextDate.getTime() > todayEndMs) break;
              fromDate = nextDate;
              continue;
            }

            // ONE builder, shared with the ledger hook (RQ7), so the cron and the hook cannot
            // diverge. For inflation-linked bonds whose FOI rate for nextDate is not yet announced
            // it yields a PROVISIONAL coupon at the guaranteed fixed floor. The units are today's
            // (a forecast, RQ6): the ledger hook and the payment-day re-check keep them honest.
            const couponData: DividendFormData = {
              ...buildCouponDividendData({
                assetId: coupon.assetId,
                asset,
                bondDetails: bd,
                paymentDate: nextDate,
                quantity: asset.quantity,
              }),
              currency: coupon.currency,
            };

            await createDividend(userId, couponData, coupon.assetTicker, coupon.assetName, asset.isin, true);
            scheduled++;
            createdForBond++;
            console.log(`Scheduled coupon for ${coupon.assetTicker} on ${nextDate.toLocaleDateString('it-IT')}`);

            // Stop once the upcoming (future-dated) coupon exists.
            if (nextDate.getTime() > todayEndMs) break;
            fromDate = nextDate;
          }

          if (createdForBond === 0) skipped++;
        } catch (couponError) {
          console.error(`Error scheduling next coupon for asset ${coupon.assetId}:`, couponError);
          errors++;
        }
      }
    } catch (userError) {
      console.error(`Error in Phase 3 for user ${userId}:`, userError);
      errors++;
    }
  }

  return { scheduled, skipped, errors };
}
