import 'server-only';

import { Timestamp, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { Dividend } from '@/types/dividend';
import { getAllDividends, updateDividend } from '@/lib/services/dividendService';
import type { ExpenseCategory } from '@/types/expenses';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { toDate } from '@/lib/utils/dateHelpers';
import { appliedBalanceEffectsOf, type SettlementRow } from '@/lib/utils/cashSettlement';
import { roundToCents } from '@/lib/utils/cents';
import { dividendIncomeAmount, isPaymentDueOrAhead, resolveDividendAccount } from '@/lib/utils/dividendAccount';

/**
 * The income row of a dividend, and the cash account it credits.
 *
 * A dividend or coupon paid today (or a row created ahead of its payment) credits the account of
 * its instrument, or the default one from the settings — `lib/utils/dividendAccount.ts` is the
 * rule. The row is then an ordinary LINKED income row of the cashflow (`linkedCashAssetId`, no
 * `balancePending`: applied), so an edit or a delete made from Tracciamento gives the account back
 * through the same settlement rule as any other row (lib/utils/cashSettlement.ts), and the two
 * functions below do the same when the DIVIDEND is edited or deleted.
 *
 * The row, the account's balance and the dividend's `expenseId` are written in ONE transaction:
 * the cron is idempotent on `expenseId`, and a row written without its link would be credited
 * again at the next run.
 */

const EXPENSES_COLLECTION = 'expenses';
const ASSETS_COLLECTION = 'assets';
const DIVIDENDS_COLLECTION = 'dividends';
const SETTINGS_COLLECTION = 'assetAllocationTargets';
const CATEGORIES_COLLECTION = 'expenseCategories';

function buildDividendNotes(dividend: Dividend, isConvertedToEur: boolean): string {
  const converted = isConvertedToEur ? ` (${dividend.netAmount.toFixed(2)} ${dividend.currency} convertiti)` : '';
  return `Dividendo ${dividend.assetTicker} - ${dividend.assetName}${converted}${dividend.notes ? ` | ${dividend.notes}` : ''}`;
}

/**
 * The account this dividend credits, or `undefined`. An arrear costs no read: the date is checked
 * before the instrument and the settings are fetched.
 */
async function findAccountToCredit(dividend: Dividend, paymentDate: Date, now: Date): Promise<string | undefined> {
  if (!isPaymentDueOrAhead(paymentDate, now)) return undefined;
  const [assetSnap, settingsSnap] = await Promise.all([
    adminDb.collection(ASSETS_COLLECTION).doc(dividend.assetId).get(),
    adminDb.collection(SETTINGS_COLLECTION).doc(dividend.userId).get(),
  ]);
  const asset = assetSnap.exists ? assetSnap.data() : undefined;
  return resolveDividendAccount({
    assetAccountId: asset?.userId === dividend.userId ? asset.dividendCashAssetId : undefined,
    defaultAccountId: settingsSnap.exists ? settingsSnap.data()?.dividendCashAssetId : undefined,
    paymentDate,
    now,
  });
}

/**
 * Read an account inside a transaction and say whether `currency` money can be credited to it:
 * the user's own cash account, in the same currency as the row. Anything else — a deleted
 * account, someone else's, a USD row on a EUR account — moves nothing, and the row is written
 * without a link rather than with one that lies.
 */
async function readCreditableAccount(
  tx: Transaction,
  accountId: string,
  userId: string,
  currency: string
): Promise<{ ref: DocumentReference; quantity: number } | undefined> {
  const ref = adminDb.collection(ASSETS_COLLECTION).doc(accountId);
  const snap = await tx.get(ref);
  const data = snap.exists ? snap.data() : undefined;
  const isOwnCashAccount = !!data && data.userId === userId && data.type === 'cash' && data.assetClass === 'cash';
  const accountCurrency = String(data?.currency ?? 'EUR').toUpperCase();
  if (!data || !isOwnCashAccount || accountCurrency !== currency.toUpperCase()) {
    console.warn('[dividendIncomeService] Account not creditable, row written without it', { accountId, userId, currency });
    return undefined;
  }
  return { ref, quantity: (data.quantity as number) ?? 0 };
}

/**
 * Create the income row of a dividend and return its id. Uses the EUR-converted net when the
 * dividend is foreign and has one, the native net otherwise — to the cent. Credits the account
 * the rule resolves, atomically with the row. Idempotent: a dividend that already has its row
 * returns that row's id and moves nothing.
 */
export async function createExpenseFromDividend(
  dividend: Dividend,
  categoryId: string,
  categoryName: string,
  subCategoryId?: string,
  subCategoryName?: string,
  now: Date = new Date()
): Promise<string> {
  try {
    const paymentDate = toDate(dividend.paymentDate);
    const { amount, currency, isConvertedToEur } = dividendIncomeAmount(dividend);
    const accountId = await findAccountToCredit(dividend, paymentDate, now);

    const expenseRef = adminDb.collection(EXPENSES_COLLECTION).doc();
    const dividendRef = adminDb.collection(DIVIDENDS_COLLECTION).doc(dividend.id);

    const result = await adminDb.runTransaction(async (tx) => {
      // ALL reads before ANY write: the dividend (owner, idempotency), then the account.
      const dividendSnap = await tx.get(dividendRef);
      // The second defence of A1 (doc/sicurezza/README.md RS4): the object a caller passes is
      // trusted for its figures only when it IS the stored dividend's account's — otherwise a
      // forged `userId` would write a row and move a balance in someone else's account.
      const storedOwnerId = dividendSnap.exists ? (dividendSnap.data()?.userId as string | undefined) : undefined;
      if (!storedOwnerId || storedOwnerId !== dividend.userId) {
        throw new Error(`Dividend ${dividend.id} is not stored for the account it declares`);
      }
      const existingExpenseId = dividendSnap.data()?.expenseId as string | undefined;
      if (existingExpenseId) return { expenseId: existingExpenseId, credited: false, written: false };
      const account = accountId ? await readCreditableAccount(tx, accountId, dividend.userId, currency) : undefined;

      tx.set(expenseRef, {
        userId: storedOwnerId,
        type: 'income',
        categoryId,
        categoryName,
        subCategoryId: subCategoryId || null,
        subCategoryName: subCategoryName || null,
        amount,
        currency,
        date: Timestamp.fromDate(paymentDate),
        notes: buildDividendNotes(dividend, isConvertedToEur),
        ...(account ? { linkedCashAssetId: account.ref.id } : {}),
        createdAt: now,
        updatedAt: now,
      });
      if (account) tx.update(account.ref, { quantity: roundToCents(account.quantity + amount), updatedAt: now });
      tx.update(dividendRef, { expenseId: expenseRef.id, updatedAt: Timestamp.fromDate(now) });
      return { expenseId: expenseRef.id, credited: !!account, written: true };
    });

    // The ROW is an input of the Panoramica (the month's income) whether or not an account was
    // credited: invalidating only on a credit left an uncredited payment out of it for hours.
    if (result.written) await invalidateDashboardOverviewSummaryServer(dividend.userId, 'dividend_income_created');
    console.log(`[dividendIncomeService] Income row in ${currency} (amount: ${amount.toFixed(2)}, credited: ${result.credited})`);
    return result.expenseId;
  } catch (error) {
    console.error('Error creating expense from dividend:', error);
    throw new Error('Failed to create expense from dividend');
  }
}

/** What a stored income row has ALREADY moved on its account; `undefined` when none, or pending. */
function appliedCreditOf(row: SettlementRow): { accountId: string; amount: number } | undefined {
  const [effect] = appliedBalanceEffectsOf(row);
  return effect ? { accountId: effect.assetId, amount: effect.delta } : undefined;
}

/**
 * Bring the income row in step with an edited dividend. When the row has credited an account, the
 * account receives the DIFFERENCE, in the same transaction; the link itself never changes here —
 * re-pointing a payment already credited is an edit of the row, in Tracciamento.
 */
export async function updateExpenseFromDividend(
  dividend: Dividend,
  expenseId: string,
  categoryName: string,
  subCategoryName?: string
): Promise<void> {
  try {
    const paymentDate = toDate(dividend.paymentDate);
    const { amount, currency, isConvertedToEur } = dividendIncomeAmount(dividend);
    const expenseRef = adminDb.collection(EXPENSES_COLLECTION).doc(expenseId);
    const now = new Date();

    await adminDb.runTransaction(async (tx) => {
      const expenseSnap = await tx.get(expenseRef);
      // A4 (doc/sicurezza/README.md RS5): a linked row of another account is never rewritten.
      if (expenseSnap.exists && expenseSnap.data()?.userId !== dividend.userId) {
        throw new Error(`Expense ${expenseId} is not in the account of dividend ${dividend.id}`);
      }
      const applied = expenseSnap.exists ? appliedCreditOf(expenseSnap.data() as SettlementRow) : undefined;
      const difference = applied ? roundToCents(amount - applied.amount) : 0;
      const accountRef = applied && difference !== 0 ? adminDb.collection(ASSETS_COLLECTION).doc(applied.accountId) : undefined;
      const accountSnap = accountRef ? await tx.get(accountRef) : undefined;

      tx.update(expenseRef, {
        amount,
        currency,
        date: Timestamp.fromDate(paymentDate),
        notes: buildDividendNotes(dividend, isConvertedToEur),
        categoryName,
        subCategoryName: subCategoryName || null,
        updatedAt: now,
      });
      const account = accountSnap?.exists ? accountSnap.data() : undefined;
      if (!accountRef || !account || account.userId !== dividend.userId) return;
      tx.update(accountRef, { quantity: roundToCents(((account.quantity as number) ?? 0) + difference), updatedAt: now });
    });

    // The row's amount and date changed even when no account moved.
    await invalidateDashboardOverviewSummaryServer(dividend.userId, 'dividend_income_updated');
    console.log(`[dividendIncomeService] Updated income row in ${currency} (amount: ${amount.toFixed(2)})`);
  } catch (error) {
    console.error('Error updating expense from dividend:', error);
    throw new Error('Failed to update expense from dividend');
  }
}

/**
 * Delete the income row of a dividend, give back what it had credited to its account (same
 * transaction), and remove the row's reference from the dividend.
 *
 * `ownerId` is the dividend's account. A row of ANOTHER account (a false link: `expenseId` was
 * client-writable until 2026-11) is left as it is with its balance, and only the link is dropped
 * (doc/sicurezza/README.md RS5, D-SI4): the dividend stays deletable by its owner.
 */
export async function deleteExpenseForDividend(
  dividendId: string,
  expenseId: string,
  ownerId: string
): Promise<void> {
  try {
    const expenseRef = adminDb.collection(EXPENSES_COLLECTION).doc(expenseId);
    const now = new Date();

    // The owner of the deleted row, whose overview loses an income row whether or not it was credited.
    const rowOwnerId = await adminDb.runTransaction(async (tx) => {
      const expenseSnap = await tx.get(expenseRef);
      const row = expenseSnap.exists ? expenseSnap.data() : undefined;
      if (row && row.userId !== ownerId) {
        console.warn('[dividendIncomeService] Linked expense of another account left untouched', { dividendId, expenseId });
        return undefined;
      }
      const applied = row ? appliedCreditOf(row as SettlementRow) : undefined;
      const accountRef = applied ? adminDb.collection(ASSETS_COLLECTION).doc(applied.accountId) : undefined;
      const accountSnap = accountRef ? await tx.get(accountRef) : undefined;

      tx.delete(expenseRef);
      const deletedRowOwnerId = row?.userId as string | undefined;
      const account = accountSnap?.exists ? accountSnap.data() : undefined;
      if (!applied || !accountRef || !account || account.userId !== deletedRowOwnerId) return deletedRowOwnerId;
      tx.update(accountRef, { quantity: roundToCents(((account.quantity as number) ?? 0) - applied.amount), updatedAt: now });
      return deletedRowOwnerId;
    });

    // Remove expense reference from dividend: the key must be PRESENT with `undefined`,
    // because `updateDividend` turns exactly that shape into the Firestore delete sentinel
    // (a plain omission would leave the stale link in place).
    await updateDividend(dividendId, {
      expenseId: undefined,
    });
    if (rowOwnerId) await invalidateDashboardOverviewSummaryServer(rowOwnerId, 'dividend_income_deleted');
  } catch (error) {
    console.error('Error deleting expense for dividend:', error);
    throw new Error('Failed to delete expense for dividend');
  }
}

/** The category the sync writes on its rows: read from the account's own document, never declared. */
export interface DividendSyncCategory {
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
}

/**
 * Read `categoryId` and say what the sync writes on its rows, or `undefined` when the category is
 * missing or belongs to another account (doc/sicurezza/README.md RS3). The id comes from the
 * request because the tab's category is an unsaved draft of Impostazioni; the names come from the
 * document. A sub-category the document does not list is dropped, id and name together.
 */
export async function readDividendSyncCategory(
  userId: string,
  categoryId: string,
  subCategoryId?: string
): Promise<DividendSyncCategory | undefined> {
  const snap = await adminDb.collection(CATEGORIES_COLLECTION).doc(categoryId).get();
  const category = snap.exists ? (snap.data() as ExpenseCategory | undefined) : undefined;
  if (!category || category.userId !== userId) return undefined;
  const subCategory = subCategoryId ? category.subCategories?.find((sub) => sub.id === subCategoryId) : undefined;
  return {
    categoryId,
    categoryName: category.name,
    ...(subCategory ? { subCategoryId: subCategory.id, subCategoryName: subCategory.name } : {}),
  };
}

/**
 * Write the income row of every dividend of `userId` that is already paid and has none yet.
 *
 * The dividends are READ here, by the account's `userId` (doc/sicurezza/README.md RS2): a caller
 * passes the account it was authorised for, never a list of documents — until 2026-11 the route
 * wrote rows in whatever account each object in the request declared (A1).
 */
export async function syncDividendExpenses(
  userId: string,
  category: DividendSyncCategory
): Promise<{ created: number; skipped: number; failed: number }> {
  const results = {
    created: 0,
    skipped: 0,
    failed: 0,
  };

  const dividends = await getAllDividends(userId);

  // Only create expenses for dividends already paid
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const dividend of dividends) {
    try {
      // Skip if expense already exists
      if (dividend.expenseId) {
        results.skipped++;
        continue;
      }

      // Skip if payment date is in the future
      const paymentDate = toDate(dividend.paymentDate);
      if (paymentDate > today) {
        results.skipped++;
        continue;
      }

      await createExpenseFromDividend(
        dividend,
        category.categoryId,
        category.categoryName,
        category.subCategoryId,
        category.subCategoryName
      );

      results.created++;
    } catch (error) {
      console.error(`Error syncing dividend ${dividend.id}:`, error);
      results.failed++;
    }
  }

  console.log('Dividend expense sync completed:', results);
  return results;
}
