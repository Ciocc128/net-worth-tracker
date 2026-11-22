import type { Expense } from '@/types/expenses';

/**
 * The row's title in the compact feed: the note when the row has one, else the category.
 * Shared with the row's accessible name, so the two never drift apart.
 */
export function rowTitle(expense: Pick<Expense, 'notes' | 'categoryName'>): string {
  return expense.notes?.trim() || expense.categoryName;
}

/**
 * The row's second line (UM4 P12, D-UM11): the category never shows on both lines.
 *
 * - A row WITH a note has the note as its title, so the second line names where it belongs:
 *   «Alimentari · Spesa», or «Alimentari» alone without a sub-category.
 * - A row WITHOUT a note already has the category as its title, so the second line says
 *   something new: the sub-category, else the account the row moves, else nothing (an empty
 *   string — the row keeps its height, the line is just blank).
 */
export function rowSubtitle(
  expense: Pick<Expense, 'notes' | 'categoryName' | 'subCategoryName'>,
  accountName?: string | null,
): string {
  const subCategory = expense.subCategoryName?.trim() || null;
  if (expense.notes?.trim()) {
    return [expense.categoryName, subCategory].filter(Boolean).join(' · ');
  }
  return subCategory ?? accountName?.trim() ?? '';
}
