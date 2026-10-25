import { describe, expect, it } from 'vitest';
import { MOVEMENT_TYPE_ORDER, splitCategorySelection } from '@/lib/utils/movementsTypeFilter';
import type { ExpenseType } from '@/types/expenses';

const categories: { id: string; type: ExpenseType }[] = [
  { id: 'salary', type: 'income' },
  { id: 'rent', type: 'fixed' },
  { id: 'food', type: 'variable' },
  { id: 'fun', type: 'variable' },
  { id: 'transfers', type: 'transfer' },
];

describe('splitCategorySelection', () => {
  it('promotes a fully ticked Trasferimento to the type (regression: the filter kept every row)', () => {
    expect(splitCategorySelection(['transfers'], categories)).toEqual({
      selectedTypes: ['transfer'],
      selectedCatIds: [],
    });
  });

  it('keeps loose ids for a partly ticked type', () => {
    expect(splitCategorySelection(['food'], categories)).toEqual({
      selectedTypes: [],
      selectedCatIds: ['food'],
    });
  });

  it('handles every type the picker offers', () => {
    for (const type of MOVEMENT_TYPE_ORDER) {
      const ids = categories.filter((c) => c.type === type).map((c) => c.id);
      expect(splitCategorySelection(ids, categories).selectedTypes).toEqual(ids.length ? [type] : []);
    }
  });
});
