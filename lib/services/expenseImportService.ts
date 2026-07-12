/**
 * Expense Import Service (thin Firestore layer)
 *
 * Commits an ImportPlan produced by the pure lib/utils/expenseImport.ts layer:
 * creates any missing categories/subcategories, then bulk-writes the expenses.
 *
 * Key behaviours (see the import tool plan):
 * - Every written expense is stamped with a shared `importBatchId` + `importedAt`,
 *   so an import can be undone in one call (deleteExpensesByImportBatch).
 * - Amount sign convention is applied here (expenses negative, income positive) —
 *   the plan carries positive magnitudes.
 * - We DELIBERATELY do not set `linkedCashAssetId` / touch cash-asset balances:
 *   historical rows must not mutate current balances.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import {
  createCategory,
  getCategoryById,
  updateCategory,
  getAllCategories,
} from '@/lib/services/expenseCategoryService';
import { ImportPlan } from '@/types/expenseImport';
import { ExpenseSubCategory } from '@/types/expenses';

const EXPENSES_COLLECTION = 'expenses';
const BATCH_LIMIT = 400; // mirror costCenterService chunking (Firestore hard limit is 500)

const norm = (s: string): string => s.trim().toLowerCase();
const genSubId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/**
 * Commit a validated ImportPlan for a user.
 *
 * Creates missing categories/subcategories, then writes plan.validRows as expense
 * documents tagged with a fresh importBatchId. Returns the batch id and the number
 * of expenses created (so the UI can offer "undo import").
 */
export async function commitImportPlan(
  userId: string,
  plan: ImportPlan
): Promise<{ importBatchId: string; created: number }> {
  // 1. Create brand-new categories (with their subcategories pre-populated).
  for (const c of plan.categoriesToCreate) {
    const subCategories: ExpenseSubCategory[] = c.subCategories.map((name) => ({ id: genSubId(), name }));
    await createCategory(userId, { name: c.name, type: c.type, subCategories });
  }

  // 2. Add missing subcategories to already-existing categories.
  for (const s of plan.subCategoriesToCreate) {
    const category = await getCategoryById(s.categoryId);
    if (!category) continue;
    const existingNames = new Set(category.subCategories.map((sc) => norm(sc.name)));
    const additions: ExpenseSubCategory[] = s.subCategoryNames
      .filter((n) => !existingNames.has(norm(n)))
      .map((name) => ({ id: genSubId(), name }));
    if (additions.length > 0) {
      await updateCategory(s.categoryId, { subCategories: [...category.subCategories, ...additions] });
    }
  }

  // 3. Re-read categories so we resolve authoritative category/subcategory IDs.
  const refreshed = await getAllCategories(userId);
  const byName = new Map(refreshed.map((c) => [norm(c.name), c]));

  const importBatchId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const importedAtTs = Timestamp.fromDate(new Date());

  // 4. Bulk-write the expenses in chunks.
  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;
  let created = 0;

  for (const row of plan.validRows) {
    const category = byName.get(norm(row.categoryName));
    if (!category) continue; // should not happen — every valid row's category was created/exists
    const sub = row.subCategoryName
      ? category.subCategories.find((sc) => norm(sc.name) === norm(row.subCategoryName!))
      : undefined;

    // Sign convention: income positive, all other (fixed/variable/debt) negative.
    const amount = row.type === 'income' ? row.amount : -row.amount;

    const data = removeUndefinedDeep({
      userId,
      type: row.type,
      categoryId: category.id,
      categoryName: category.name,
      subCategoryId: sub?.id,
      subCategoryName: sub?.name,
      amount,
      currency: row.currency,
      date: Timestamp.fromDate(row.date),
      notes: row.notes,
      isRecurring: false,
      // No linkedCashAssetId on purpose — historical import must not reconcile balances.
      importBatchId,
      importedAt: importedAtTs,
      createdAt: importedAtTs,
      updatedAt: importedAtTs,
    });

    currentBatch.set(doc(collection(db, EXPENSES_COLLECTION)), data);
    created++;
    opCount++;
    if (opCount === BATCH_LIMIT) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  await invalidateDashboardOverviewSummary(userId, 'expense_created');

  return { importBatchId, created };
}

/**
 * Delete every expense written by a given import batch. Used by the "Annulla import"
 * action. Returns the number of expenses deleted.
 */
export async function deleteExpensesByImportBatch(userId: string, importBatchId: string): Promise<number> {
  const q = query(
    collection(db, EXPENSES_COLLECTION),
    where('userId', '==', userId),
    where('importBatchId', '==', importBatchId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;

  snapshot.docs.forEach((d) => {
    currentBatch.delete(d.ref);
    opCount++;
    if (opCount === BATCH_LIMIT) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  });
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  await invalidateDashboardOverviewSummary(userId, 'expense_deleted');

  return snapshot.size;
}
