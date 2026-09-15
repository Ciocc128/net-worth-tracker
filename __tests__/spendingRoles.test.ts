import { describe, expect, it } from 'vitest';
import {
  resolveSpendingRole,
  summarizeCategoryClassification,
  summarizeSpendingRoles,
  type SpendingRoleSource,
  type SpendingRolesSummary,
} from '@/lib/utils/spendingRoles';
import { Expense, ExpenseType } from '@/types/expenses';

function makeExpense(overrides: Partial<Expense> & { type: ExpenseType; amount: number }): Expense {
  return {
    id: 'e1',
    userId: 'u1',
    categoryId: 'cat-casa',
    categoryName: 'Casa',
    currency: 'EUR',
    date: new Date('2026-06-15T12:00:00Z'),
    createdAt: new Date('2026-06-15T12:00:00Z'),
    updatedAt: new Date('2026-06-15T12:00:00Z'),
    ...overrides,
  } as Expense;
}

// The owner's own shape: Abbonamenti is a want, except WiFi, which is a need.
const CASA: SpendingRoleSource = { id: 'cat-casa', type: 'fixed', spendingRole: 'need', subCategories: [] };
const ABBONAMENTI: SpendingRoleSource = {
  id: 'cat-abbonamenti',
  type: 'fixed',
  spendingRole: 'want',
  subCategories: [
    { id: 'sub-wifi', name: 'WiFi', spendingRole: 'need' },
    { id: 'sub-streaming', name: 'Streaming' },
  ],
};
const PAC: SpendingRoleSource = { id: 'cat-pac', type: 'variable', spendingRole: 'saving', subCategories: [] };
const ALTRO: SpendingRoleSource = { id: 'cat-altro', type: 'variable', subCategories: [] };
const STIPENDIO: SpendingRoleSource = { id: 'cat-stipendio', type: 'income', subCategories: [] };
const CATEGORIES = [CASA, ABBONAMENTI, PAC, ALTRO, STIPENDIO];

/** Both sides of the Sankey carry the same money — the invariant the chart depends on. */
function expectBalanced(summary: SpendingRolesSummary): void {
  const left = summary.income + summary.deficit;
  const right =
    summary.byBucket.need.total +
    summary.byBucket.want.total +
    summary.byBucket.unclassified.total +
    summary.byBucket.saving.total +
    summary.surplus;
  expect(left).toBeCloseTo(right, 6);
}

describe('resolveSpendingRole', () => {
  it('reads the category role when the row has no subcategory', () => {
    expect(resolveSpendingRole(CASA)).toBe('need');
  });

  it('lets a subcategory override win over its category', () => {
    expect(resolveSpendingRole(ABBONAMENTI, 'sub-wifi')).toBe('need');
  });

  it('inherits the category role for a subcategory without an override', () => {
    expect(resolveSpendingRole(ABBONAMENTI, 'sub-streaming')).toBe('want');
  });

  it('inherits the category role for a subcategory id the category no longer has', () => {
    expect(resolveSpendingRole(ABBONAMENTI, 'sub-deleted')).toBe('want');
  });

  it('returns null for an unclassified category', () => {
    expect(resolveSpendingRole(ALTRO)).toBeNull();
  });

  it('classifies a subcategory of an unclassified category through its override alone', () => {
    const mixed: SpendingRoleSource = {
      id: 'c',
      type: 'variable',
      subCategories: [{ id: 's', name: 'S', spendingRole: 'want' }],
    };
    expect(resolveSpendingRole(mixed, 's')).toBe('want');
    expect(resolveSpendingRole(mixed)).toBeNull();
  });

  it('returns null for a missing category', () => {
    expect(resolveSpendingRole(undefined, 'sub-wifi')).toBeNull();
  });

  it('ignores a role left behind on a category that became income or transfer', () => {
    expect(resolveSpendingRole({ ...CASA, type: 'income' })).toBeNull();
    expect(resolveSpendingRole({ ...CASA, type: 'transfer' })).toBeNull();
  });

  it('treats debt as spending', () => {
    expect(resolveSpendingRole({ ...CASA, type: 'debt' })).toBe('need');
  });
});

describe('summarizeSpendingRoles', () => {
  it('splits spending by role and puts the surplus into savings', () => {
    const summary = summarizeSpendingRoles(
      [
        makeExpense({ type: 'income', amount: 3000, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
        makeExpense({ type: 'fixed', amount: -900 }),
        makeExpense({ type: 'fixed', amount: -30, categoryId: 'cat-abbonamenti', categoryName: 'Abbonamenti', subCategoryId: 'sub-wifi' }),
        makeExpense({ type: 'fixed', amount: -15, categoryId: 'cat-abbonamenti', categoryName: 'Abbonamenti', subCategoryId: 'sub-streaming' }),
        makeExpense({ type: 'variable', amount: -200, categoryId: 'cat-pac', categoryName: 'PAC' }),
        makeExpense({ type: 'variable', amount: -55, categoryId: 'cat-altro', categoryName: 'Altro' }),
      ],
      CATEGORIES
    );

    expect(summary.income).toBe(3000);
    expect(summary.spending).toBe(1200);
    expect(summary.byBucket.need.total).toBe(930);
    expect(summary.byBucket.want.total).toBe(15);
    expect(summary.byBucket.saving.total).toBe(200);
    expect(summary.byBucket.unclassified.total).toBe(55);
    expect(summary.surplus).toBe(1800);
    expect(summary.deficit).toBe(0);
    expect(summary.savings).toBe(2000);
    expectBalanced(summary);
  });

  it('lists a category split by an override in each bucket, largest first', () => {
    const summary = summarizeSpendingRoles(
      [
        makeExpense({ type: 'fixed', amount: -900 }),
        makeExpense({ type: 'fixed', amount: -30, categoryId: 'cat-abbonamenti', categoryName: 'Abbonamenti', subCategoryId: 'sub-wifi' }),
        makeExpense({ type: 'fixed', amount: -15, categoryId: 'cat-abbonamenti', categoryName: 'Abbonamenti', subCategoryId: 'sub-streaming' }),
      ],
      CATEGORIES
    );

    expect(summary.byBucket.need.categories).toEqual([
      { categoryKey: 'cat-casa', categoryName: 'Casa', expenseType: 'fixed', value: 900 },
      { categoryKey: 'cat-abbonamenti', categoryName: 'Abbonamenti', expenseType: 'fixed', value: 30 },
    ]);
    expect(summary.byBucket.want.categories).toEqual([
      { categoryKey: 'cat-abbonamenti', categoryName: 'Abbonamenti', expenseType: 'fixed', value: 15 },
    ]);
  });

  it('turns an overspent period into a deficit, with savings holding only saving rows', () => {
    const summary = summarizeSpendingRoles(
      [
        makeExpense({ type: 'income', amount: 1000, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
        makeExpense({ type: 'fixed', amount: -900 }),
        makeExpense({ type: 'variable', amount: -300, categoryId: 'cat-pac', categoryName: 'PAC' }),
      ],
      CATEGORIES
    );

    expect(summary.surplus).toBe(0);
    expect(summary.deficit).toBe(200);
    expect(summary.savings).toBe(300);
    expectBalanced(summary);
  });

  it('has no savings at all when overspent without saving rows', () => {
    const summary = summarizeSpendingRoles(
      [
        makeExpense({ type: 'income', amount: 500, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
        makeExpense({ type: 'fixed', amount: -800 }),
      ],
      CATEGORIES
    );
    expect(summary.savings).toBe(0);
    expect(summary.deficit).toBe(300);
    expectBalanced(summary);
  });

  it('is exactly balanced when income equals spending', () => {
    const summary = summarizeSpendingRoles(
      [
        makeExpense({ type: 'income', amount: 900, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
        makeExpense({ type: 'fixed', amount: -900 }),
      ],
      CATEGORIES
    );
    expect(summary.surplus).toBe(0);
    expect(summary.deficit).toBe(0);
    expectBalanced(summary);
  });

  it('skips transfers on both sides', () => {
    const summary = summarizeSpendingRoles(
      [
        makeExpense({ type: 'income', amount: 1000, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
        makeExpense({ type: 'transfer', amount: 400, categoryId: 'cat-trasf', categoryName: 'Trasferimenti' }),
      ],
      CATEGORIES
    );
    expect(summary.spending).toBe(0);
    expect(summary.income).toBe(1000);
    expect(summary.surplus).toBe(1000);
  });

  it('counts a row whose category document is gone as unclassified', () => {
    const summary = summarizeSpendingRoles(
      [makeExpense({ type: 'variable', amount: -40, categoryId: 'cat-deleted', categoryName: 'Vecchia' })],
      CATEGORIES
    );
    expect(summary.byBucket.unclassified.categories).toEqual([
      { categoryKey: 'cat-deleted', categoryName: 'Vecchia', expenseType: 'variable', value: 40 },
    ]);
  });

  it('lists income by category, largest first', () => {
    const summary = summarizeSpendingRoles(
      [
        makeExpense({ type: 'income', amount: 200, categoryId: 'cat-regali', categoryName: 'Regali' }),
        makeExpense({ type: 'income', amount: 1500, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
        makeExpense({ type: 'income', amount: 1500, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
      ],
      CATEGORIES
    );
    expect(summary.incomeCategories).toEqual([
      { categoryKey: 'cat-stipendio', categoryName: 'Stipendio', expenseType: 'income', value: 3000 },
      { categoryKey: 'cat-regali', categoryName: 'Regali', expenseType: 'income', value: 200 },
    ]);
  });

  it('uses absolute amounts, like the budget Sankey', () => {
    const summary = summarizeSpendingRoles([makeExpense({ type: 'fixed', amount: 120 })], CATEGORIES);
    expect(summary.byBucket.need.total).toBe(120);
  });

  it('returns empty buckets for an empty period', () => {
    const summary = summarizeSpendingRoles([], CATEGORIES);
    expect(summary.income).toBe(0);
    expect(summary.savings).toBe(0);
    expect(summary.byBucket.unclassified).toEqual({ total: 0, categories: [] });
    expectBalanced(summary);
  });
});

describe('summarizeCategoryClassification', () => {
  it('counts only spending categories, classified by their own role', () => {
    const withOverrideOnly: SpendingRoleSource = {
      id: 'x',
      type: 'variable',
      subCategories: [{ id: 's', name: 'S', spendingRole: 'need' }],
    };
    expect(summarizeCategoryClassification([...CATEGORIES, withOverrideOnly, { ...CASA, type: 'transfer' }])).toEqual({
      spending: 5,
      classified: 3,
    });
  });
});
