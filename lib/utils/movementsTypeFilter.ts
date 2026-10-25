/**
 * Splits the category MultiSelect's value of Cashflow › Tracciamento's Movimenti list into the
 * two filters the list applies: a whole type (every category of it ticked, deleted ones included)
 * and the loose category ids of the types only partly ticked.
 *
 * `MOVEMENT_TYPE_ORDER` is the ONE list of types the picker offers AND the split reads: a type
 * missing from it (Trasferimento was, until 2026-10-25) shows in the picker, but ticking it
 * filtered nothing, and the list and its summary kept every row.
 */

import type { ExpenseType } from '@/types/expenses';

export const MOVEMENT_TYPE_ORDER: ExpenseType[] = ['income', 'fixed', 'variable', 'debt', 'transfer'];

export interface MovementCategorySelection {
  selectedTypes: ExpenseType[];
  selectedCatIds: string[];
}

export function splitCategorySelection(
  values: string[],
  categories: ReadonlyArray<{ id: string; type: ExpenseType }>,
): MovementCategorySelection {
  const selectedTypes: ExpenseType[] = [];
  const selectedCatIds: string[] = [];
  for (const type of MOVEMENT_TYPE_ORDER) {
    const typeCats = categories.filter((c) => c.type === type);
    if (typeCats.length === 0) continue;
    if (typeCats.every((c) => values.includes(c.id))) {
      selectedTypes.push(type);
    } else {
      typeCats.filter((c) => values.includes(c.id)).forEach((c) => selectedCatIds.push(c.id));
    }
  }
  return { selectedTypes, selectedCatIds };
}
