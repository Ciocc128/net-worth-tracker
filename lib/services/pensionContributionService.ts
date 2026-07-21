/**
 * Pension contribution persistence + value/transfer effects — dedicated `pensionContributions`
 * collection.
 *
 * A contribution is a dated, per-asset event with a tax nature, stored in its OWN collection (spec
 * §2.2), NOT as an `Expense` (contributions must never enter the cashflow savings-rate / budget
 * metrics, §2.3). Same event-per-asset shape as `dividends`.
 *
 * On top of recording the fact, this service applies the value effect (spec §4.2/§4.4): EVERY
 * contribution raises the fund's value by its amount immediately (the fund is a manually-valued asset
 * whose euro value lives in `quantity`, price = 1 — exactly like a cash balance). The two sources
 * differ only in WHERE the money comes from:
 *   - TFR / employer never transit the user's account → the fund is credited standalone.
 *   - VOLUNTARY is the user moving their own money → modelled as a `transfer` from a cash account to
 *     the fund (spec §4.3): it reuses `reconcileTransferCreate` (cash −amount, fund +amount, atomic)
 *     and leaves an audit-trail transfer entry in the cashflow (net-zero, excluded from spend). The
 *     transfer's destination credit IS the fund's value increment, so it is never double-counted.
 *
 * The periodic statement update (absolute NAV overwrite that captures market return, §4.2) is a plain
 * asset edit in Patrimonio and is intentionally NOT handled here.
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { updateCashAssetBalance } from '@/lib/services/assetService';
import {
  reconcileTransferCreate,
  reconcileTransferDelete,
} from '@/lib/services/cashBalanceReconciliation';
import { createExpense, deleteExpense, getExpenseById } from '@/lib/services/expenseService';
import { ensureTransferCategory } from '@/lib/services/expenseCategoryService';
import {
  isDeductibleSource,
  type ContributionSource,
  type PensionContribution,
} from '@/types/pension';

const PENSION_CONTRIBUTIONS_COLLECTION = 'pensionContributions';

/**
 * Fetch all pension contributions for a user, newest first. Optionally scoped to one fund asset.
 * Reads are small (a profile makes ~12–24/year) so no pagination is needed.
 */
export async function getPensionContributions(
  userId: string,
  assetId?: string
): Promise<PensionContribution[]> {
  const contributionsRef = collection(db, PENSION_CONTRIBUTIONS_COLLECTION);
  const constraints = [
    where('userId', '==', userId),
    ...(assetId ? [where('assetId', '==', assetId)] : []),
    orderBy('date', 'desc'),
  ];
  const snapshot = await getDocs(query(contributionsRef, ...constraints));

  return snapshot.docs.map((snap) => {
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      date: data.date?.toDate() ?? new Date(),
      createdAt: data.createdAt?.toDate() ?? new Date(),
    } as PensionContribution;
  });
}

export interface PensionContributionInput {
  /** The fondo pensione asset (type 'pension') this contribution flows into. */
  assetId: string;
  source: ContributionSource;
  /** Positive magnitude in EUR. */
  amount: number;
  date: Date;
  /** Tax year of competence; defaults to the calendar year of `date`. */
  taxYear?: number;
  notes?: string;
  /**
   * Origin cash account for a VOLUNTARY contribution — required only when `source === 'voluntary'`,
   * since that is the one nature that actually leaves the user's account (spec §4.3).
   */
  sourceCashAssetId?: string;
}

/**
 * Low-level write of the contribution document. `deductible` is derived from `source` and persisted
 * so per-year deductible queries don't have to re-derive it.
 */
async function writePensionContribution(
  userId: string,
  input: PensionContributionInput,
  linkedExpenseId?: string
): Promise<string> {
  const contributionsRef = collection(db, PENSION_CONTRIBUTIONS_COLLECTION);
  const payload = removeUndefinedFields({
    userId,
    assetId: input.assetId,
    source: input.source,
    amount: Math.abs(input.amount),
    date: Timestamp.fromDate(input.date),
    taxYear: input.taxYear ?? input.date.getFullYear(),
    deductible: isDeductibleSource(input.source),
    notes: input.notes,
    linkedExpenseId,
    sourceCashAssetId: input.source === 'voluntary' ? input.sourceCashAssetId : undefined,
    createdAt: Timestamp.now(),
  });
  const docRef = await addDoc(contributionsRef, payload);
  return docRef.id;
}

/**
 * Record a pension contribution and apply its value/transfer effect (see module doc).
 *
 * Returns the new contribution's id. Preconditions: a voluntary contribution requires
 * `sourceCashAssetId`; `amount` must be positive.
 */
export async function recordPensionContribution(
  userId: string,
  input: PensionContributionInput
): Promise<string> {
  const amount = Math.abs(input.amount);

  if (input.source === 'voluntary') {
    if (!input.sourceCashAssetId) {
      throw new Error('A voluntary pension contribution requires a source cash account');
    }

    // Audit-trail transfer entry (conto → fondo): net-zero, excluded from spend metrics.
    const transferCategoryId = await ensureTransferCategory(userId);
    const transferResult = await createExpense(
      userId,
      {
        type: 'transfer',
        categoryId: transferCategoryId,
        amount,
        currency: 'EUR',
        date: input.date,
        notes: input.notes ?? 'Versamento volontario al fondo pensione',
        linkedCashAssetId: input.sourceCashAssetId,
        transferCashAssetId: input.assetId,
      },
      'Trasferimenti'
    );
    const transferExpenseId = Array.isArray(transferResult) ? transferResult[0] : transferResult;

    // Move the balances: cash −amount, fund +amount (the fund credit is the value increment).
    await reconcileTransferCreate({
      originId: input.sourceCashAssetId,
      destId: input.assetId,
      amount,
    });

    return writePensionContribution(userId, input, transferExpenseId);
  }

  // TFR / employer: the money never transits the user's account — credit the fund standalone.
  await updateCashAssetBalance(input.assetId, amount);
  return writePensionContribution(userId, input);
}

/**
 * Delete a pension contribution and REVERSE its value/transfer effect (the mirror of
 * `recordPensionContribution`), so the fund value — and, for a voluntary contribution, the source
 * cash balance and its transfer entry — return to where they were before it.
 *
 * Robustness: the reversal is BEST-EFFORT and must never block the record's removal. The linked fund
 * (or transfer entry) may already have been deleted by hand — in that case there is nothing left to
 * reverse and the contribution should still be removable. Each reversal step is therefore isolated
 * and logged; the document is always deleted at the end. The underlying balance helpers already skip
 * assets that no longer exist.
 */
export async function deletePensionContribution(contribution: PensionContribution): Promise<void> {
  const amount = Math.abs(contribution.amount);

  try {
    if (contribution.source === 'voluntary') {
      // The origin cash account. Newer records store it directly; for records written before
      // `sourceCashAssetId` was persisted, recover it from the linked transfer entry (read BEFORE
      // deleting that entry).
      let originId = contribution.sourceCashAssetId;
      if (!originId && contribution.linkedExpenseId) {
        const transfer = await getExpenseById(contribution.linkedExpenseId);
        originId = transfer?.linkedCashAssetId;
      }
      // Reverse the transfer: credit the cash account back, debit the fund (missing fund is skipped).
      if (originId) {
        await reconcileTransferDelete({
          originId,
          destId: contribution.assetId,
          amount,
        });
      }
      // Remove the audit-trail transfer entry, if it was linked and still exists.
      if (contribution.linkedExpenseId) {
        await deleteExpense(contribution.linkedExpenseId);
      }
    } else {
      // TFR / employer only credited the fund — debit it back (no-op if the fund was deleted).
      await updateCashAssetBalance(contribution.assetId, -amount);
    }
  } catch (error) {
    // A failed reversal (e.g. orphaned data after the fund was deleted by hand) must not strand the
    // record — log and proceed to remove it.
    console.warn('Pension contribution reversal failed; deleting the record anyway', {
      contributionId: contribution.id,
      error,
    });
  }

  await deleteDoc(doc(db, PENSION_CONTRIBUTIONS_COLLECTION, contribution.id));
}
