import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import {
  createDividend,
  deleteDividend,
  getDividendsByAsset,
  updateDividend,
} from '@/lib/services/dividendService';
import { getAssetTransactionsForAssetAdmin } from '@/lib/server/assetAdminRepository';
import { buildCouponDividendData, buildFinalPremiumDividendData } from '@/lib/utils/couponRecord';
import { getNextCouponDate, hasCouponPayments } from '@/lib/utils/couponUtils';
import { getItalyDateIso, toDate } from '@/lib/utils/dateHelpers';
import {
  isOpenPayment,
  planPaymentRecalculation,
  type PaymentRecalculation,
} from '@/lib/utils/dividendEntitlement';
import type { Asset } from '@/types/assets';
import type { Dividend } from '@/types/dividend';

/**
 * Apply a recalculation to a stored payment. Returns the plan's kind.
 * An update goes through `updateDividend`, which recomputes the EUR fields; dates, per-share
 * amount and notes do not change (doc/dividendi-quantita RQ7.3).
 */
export async function applyPaymentRecalculation(
  dividendId: string,
  currency: string,
  plan: PaymentRecalculation
): Promise<PaymentRecalculation['kind']> {
  if (plan.kind === 'delete') {
    await deleteDividend(dividendId);
  } else if (plan.kind === 'update') {
    await updateDividend(dividendId, {
      quantity: plan.quantity,
      grossAmount: plan.grossAmount,
      taxAmount: plan.taxAmount,
      netAmount: plan.netAmount,
      currency,
    });
  }
  return plan.kind;
}

/**
 * RQ7: after a ledger operation, every OPEN payment of the instrument follows the ledger again,
 * and a bond that has none gets its next coupon and final premium (the «sell everything, buy
 * again» case). Called after the trade's transaction committed; the caller treats a failure as
 * non-critical (RQ8) — the cron re-checks on the payment day (RQ9).
 */
export async function syncOpenPaymentsForAsset(
  ownerId: string,
  assetId: string,
  now: Date = new Date()
): Promise<{ updated: number; deleted: number; created: number }> {
  const result = { updated: 0, deleted: 0, created: 0 };

  const assetDoc = await adminDb.collection('assets').doc(assetId).get();
  if (!assetDoc.exists) return result;
  const asset = { ...(assetDoc.data() as Asset), id: assetDoc.id };
  if (asset.userId !== ownerId) return result;

  const [transactions, dividends] = await Promise.all([
    getAssetTransactionsForAssetAdmin(ownerId, assetId),
    getDividendsByAsset(ownerId, assetId),
  ]);

  const remaining: Dividend[] = [];
  for (const dividend of dividends) {
    if (!isOpenPayment(dividend, now)) {
      remaining.push(dividend);
      continue;
    }
    const plan = planPaymentRecalculation({ dividend, asset, transactions, now });
    await applyPaymentRecalculation(dividend.id, dividend.currency, plan);
    if (plan.kind === 'delete') {
      result.deleted++;
      continue;
    }
    if (plan.kind === 'update') result.updated++;
    remaining.push(dividend);
  }

  result.created += await ensureBondPayments(ownerId, asset, remaining, now);
  return result;
}

/**
 * A bond with units in hand keeps one open coupon and its final premium. Never overwrites: an id
 * that exists (paid, corrected by hand) is left alone.
 */
async function ensureBondPayments(
  ownerId: string,
  asset: Asset & { id: string },
  existing: Dividend[],
  now: Date
): Promise<number> {
  const bondDetails = asset.bondDetails;
  if (!bondDetails || asset.quantity <= 0) return 0;
  let created = 0;

  if (hasCouponPayments(bondDetails)) {
    const maturityDate = toDate(bondDetails.maturityDate);
    const nextDate = getNextCouponDate(toDate(bondDetails.issueDate), bondDetails.couponFrequency, maturityDate);
    const nextDay = nextDate ? getItalyDateIso(nextDate) : undefined;
    const alreadyThere = existing.some(
      (d) => d.dividendType === 'coupon' && getItalyDateIso(d.exDate) === nextDay
    );
    if (nextDate && !alreadyThere) {
      const data = buildCouponDividendData({
        assetId: asset.id,
        asset,
        bondDetails,
        paymentDate: nextDate,
        quantity: asset.quantity,
      });
      await createDividend(ownerId, data, asset.ticker, asset.name, asset.isin, true);
      created++;
    }
  }

  if (bondDetails.finalPremiumRate) {
    const maturityDate = toDate(bondDetails.maturityDate);
    const hasPremium = existing.some((d) => d.dividendType === 'finalPremium');
    if (maturityDate > now && !hasPremium) {
      const data = buildFinalPremiumDividendData({
        assetId: asset.id,
        asset,
        bondDetails,
        maturityDate,
        quantity: asset.quantity,
      });
      if (data) {
        await createDividend(ownerId, data, asset.ticker, asset.name, asset.isin, true);
        created++;
      }
    }
  }
  return created;
}
