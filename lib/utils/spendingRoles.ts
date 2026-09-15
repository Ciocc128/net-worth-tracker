/**
 * The 50/30/20 split — which role a spending row plays, and what a period adds up to.
 *
 * Opt-in (`settings.spendingRolesEnabled`) and shown only in Analisi's Sankey. The role is
 * stored on the category (`ExpenseCategory.spendingRole`) with an optional per-subcategory
 * override, never on the row: a row carries `categoryId`, so reclassifying a category is
 * retroactive for every period with no bulk update. This module is the ONE place that turns
 * (row, categories) into a role; the Sankey builder and any later reader consume its output.
 *
 * RISPARMI IS NOT A CATEGORY TOTAL
 * Savings = the rows classified as `saving` PLUS the period's surplus (income − all spending).
 * A Sankey has no negative width, so when spending exceeds income the missing amount is not
 * subtracted from anything: it becomes `deficit`, drawn on the income side as «Coperto dal
 * patrimonio», and the surplus is zero. Either way both sides carry the same total:
 *   income + deficit === need + want + unclassified + saving + surplus
 *
 * Amounts follow cashflowSankey.ts: absolute values, the row's own `type` decides income vs
 * spending, transfers are net-zero and skipped.
 */

import {
  Expense,
  ExpenseCategory,
  ExpenseType,
  SpendingRole,
  SPENDING_ROLES,
} from '@/types/expenses';
import { getCategoryKey, getCategoryName } from '@/lib/utils/expenseGrouping';

/** What the resolver needs from a category document — plain data, testable without Firestore. */
export type SpendingRoleSource = Pick<ExpenseCategory, 'id' | 'type' | 'spendingRole' | 'subCategories'>;

/** A role, or the bucket of rows nobody has classified yet. */
export type SpendingBucket = SpendingRole | 'unclassified';

export const SPENDING_BUCKETS: SpendingBucket[] = [...SPENDING_ROLES, 'unclassified'];

const SPENDING_TYPES: ReadonlySet<ExpenseType> = new Set<ExpenseType>(['fixed', 'variable', 'debt']);

/** Whether rows of this type are spending — the only types a role means anything for. */
export function isSpendingType(type: ExpenseType): boolean {
  return SPENDING_TYPES.has(type);
}

/**
 * The role of a row in `category` with `subCategoryId`.
 *
 * The subcategory's override wins, then the category's role; `null` means «Da classificare».
 * A missing category (deleted, or a legacy row without an id) and a non-spending category
 * (income, transfer — a role left behind by a type change) are `null` too: a stale role on an
 * income category must never pull money into Necessità.
 */
export function resolveSpendingRole(
  category: SpendingRoleSource | undefined,
  subCategoryId?: string
): SpendingRole | null {
  if (!category || !isSpendingType(category.type)) return null;
  const subCategory = subCategoryId
    ? category.subCategories.find((sub) => sub.id === subCategoryId)
    : undefined;
  return subCategory?.spendingRole ?? category.spendingRole ?? null;
}

export interface SpendingRoleSlice {
  /** `getCategoryKey` of the rows — the same identity the Sankey and the dossier use. */
  categoryKey: string;
  categoryName: string;
  /** The rows' own type: with the key, what a click hands to Analisi's entity focus. */
  expenseType: ExpenseType;
  value: number;
}

export interface SpendingBucketTotal {
  total: number;
  /** Largest first. A category split by a subcategory override appears in each of its buckets. */
  categories: SpendingRoleSlice[];
}

export interface SpendingRolesSummary {
  income: number;
  /** Income by category, largest first — the sources a flow starts from. */
  incomeCategories: SpendingRoleSlice[];
  /** Every spending row, whatever its role. */
  spending: number;
  byBucket: Record<SpendingBucket, SpendingBucketTotal>;
  /** income − spending when positive, else 0. */
  surplus: number;
  /** spending − income when positive, else 0 — «Coperto dal patrimonio». */
  deficit: number;
  /** The Risparmi node: saving-classified rows + surplus. */
  savings: number;
}

/** Sums one period's rows into the four buckets, the surplus and the deficit. */
export function summarizeSpendingRoles(
  expenses: Expense[],
  categories: SpendingRoleSource[]
): SpendingRolesSummary {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const slices = new Map<SpendingBucket, Map<string, SpendingRoleSlice>>(
    SPENDING_BUCKETS.map((bucket) => [bucket, new Map()])
  );
  const incomeSlices = new Map<string, SpendingRoleSlice>();
  let income = 0;
  let spending = 0;

  const addTo = (bucket: Map<string, SpendingRoleSlice>, expense: Expense, amount: number) => {
    const key = getCategoryKey(expense);
    const slice = bucket.get(key) ?? { categoryKey: key, categoryName: getCategoryName(expense), expenseType: expense.type, value: 0 };
    slice.value += amount;
    bucket.set(key, slice);
  };

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    const amount = Math.abs(expense.amount);

    if (expense.type === 'income') {
      income += amount;
      addTo(incomeSlices, expense, amount);
      continue;
    }
    if (!isSpendingType(expense.type)) continue;

    spending += amount;
    const role = resolveSpendingRole(categoriesById.get(expense.categoryId), expense.subCategoryId);
    addTo(slices.get(role ?? 'unclassified')!, expense, amount);
  }

  const byBucket = Object.fromEntries(
    SPENDING_BUCKETS.map((bucket) => {
      const list = Array.from(slices.get(bucket)!.values()).sort((a, b) => b.value - a.value);
      return [bucket, { total: list.reduce((sum, slice) => sum + slice.value, 0), categories: list }];
    })
  ) as Record<SpendingBucket, SpendingBucketTotal>;

  const surplus = Math.max(0, income - spending);
  const deficit = Math.max(0, spending - income);

  return {
    income,
    incomeCategories: Array.from(incomeSlices.values()).sort((a, b) => b.value - a.value),
    spending,
    byBucket,
    surplus,
    deficit,
    savings: byBucket.saving.total + surplus,
  };
}

export interface CategoryClassificationCounts {
  /** Spending categories (fixed, variable, debt). */
  spending: number;
  /** Of those, how many carry a role of their own. */
  classified: number;
}

/**
 * How far the classification has got — the Impostazioni reading's numbers.
 *
 * A category counts as classified only through its OWN role: subcategory overrides alone leave
 * its rows without a subcategory in «Da classificare», so they do not make it classified.
 */
export function summarizeCategoryClassification(
  categories: Pick<ExpenseCategory, 'type' | 'spendingRole'>[]
): CategoryClassificationCounts {
  let spending = 0;
  let classified = 0;
  for (const category of categories) {
    if (!isSpendingType(category.type)) continue;
    spending += 1;
    if (category.spendingRole) classified += 1;
  }
  return { spending, classified };
}
