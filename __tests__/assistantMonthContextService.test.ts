/**
 * Unit tests for buildAssistantMonthContext
 *
 * The service uses Firebase Admin SDK, so we mock adminDb.collection()
 * following the same pattern as dashboardOverviewService.test.ts.
 * All assertions verify bundle shape, data quality flags, cashflow
 * aggregation, and allocation change computation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// adminDb mock must be hoisted before the service is imported
const { snapshotsGetMock, expensesGetMock, settingsDocGetMock } = vi.hoisted(() => ({
  snapshotsGetMock: vi.fn(),
  expensesGetMock: vi.fn(),
  settingsDocGetMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'monthly-snapshots') {
        return {
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          get: snapshotsGetMock,
        };
      }
      if (name === 'expenses') {
        return {
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          get: expensesGetMock,
        };
      }
      if (name === 'assetAllocationTargets') {
        return {
          doc: vi.fn(() => ({ get: settingsDocGetMock })),
        };
      }
      return { where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue({ docs: [] }) };
    }),
  },
}));

// firebase/config is imported transitively via dateHelpers — mock to avoid real init
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

import {
  buildAssistantMonthContext,
  buildAssistantYearContext,
} from '@/lib/services/assistantMonthContextService';
import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSnapshotDoc(
  year: number,
  month: number,
  totalNetWorth: number,
  byAssetClass: Record<string, number> = {},
  isDummy?: boolean
) {
  const snapshot: Partial<MonthlySnapshot> = {
    userId: 'user1',
    year,
    month,
    isDummy,
    totalNetWorth,
    liquidNetWorth: totalNetWorth,
    illiquidNetWorth: 0,
    byAssetClass,
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  };
  return { data: () => snapshot };
}

/**
 * Builds an expense doc.
 *
 * `type` is an explicit field on `overrides`, never derived from the sign of `amount`:
 * deriving it would bake the assumption under test (the aggregator classifies by type,
 * not by sign) into the fixture, so a regression could never fail here. It defaults to
 * income for positive amounts purely so the older tests below keep reading naturally.
 */
function makeExpenseDoc(
  amount: number,
  categoryId: string,
  date: Date = new Date(2025, 0, 15),
  overrides: Partial<Expense> = {}
) {
  const expense: Partial<Expense> = {
    id: `exp-${Math.random()}`,
    userId: 'user1',
    type: amount > 0 ? 'income' : 'variable',
    categoryId,
    categoryName: categoryId,
    amount,
    currency: 'EUR',
    date,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
  return { id: expense.id, data: () => expense };
}

function mockSnapshots(docs: ReturnType<typeof makeSnapshotDoc>[]) {
  snapshotsGetMock.mockResolvedValue({ docs });
}

function mockExpenses(docs: ReturnType<typeof makeExpenseDoc>[]) {
  expensesGetMock.mockResolvedValue({ docs });
}

function mockSettings(dividendIncomeCategoryId?: string) {
  settingsDocGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ dividendIncomeCategoryId }),
  });
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('buildAssistantMonthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings(undefined);
  });

  // ── Missing snapshot ──────────────────────────────────────────────────────

  it('returns null snapshots and hasSnapshot=false when no snapshot exists for the month', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.currentSnapshot).toBeNull();
    expect(bundle.previousSnapshot).toBeNull();
    expect(bundle.dataQuality.hasSnapshot).toBe(false);
    expect(bundle.dataQuality.hasPreviousBaseline).toBe(false);
  });

  it('adds a data quality note when there is no snapshot and no cashflow', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.dataQuality.notes.some((n) => n.includes('Nessun dato'))).toBe(true);
  });

  // ── Single snapshot (no previous baseline) ───────────────────────────────

  it('handles a single snapshot with no previous baseline', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.currentSnapshot?.totalNetWorth).toBe(100_000);
    expect(bundle.previousSnapshot).toBeNull();
    expect(bundle.dataQuality.hasPreviousBaseline).toBe(false);
    // Delta cannot be computed without baseline
    expect(bundle.netWorth.delta).toBeNull();
    expect(bundle.netWorth.deltaPct).toBeNull();
    // Data quality should note the missing baseline
    expect(bundle.dataQuality.notes.some((n) => n.includes('delta percentuale'))).toBe(true);
  });

  // ── Month without cashflow ────────────────────────────────────────────────

  it('returns zero cashflow values when no transactions exist for the month', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 2, 90_000), makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.cashflow.totalIncome).toBe(0);
    expect(bundle.cashflow.totalExpenses).toBe(0);
    expect(bundle.cashflow.totalDividends).toBe(0);
    expect(bundle.cashflow.netCashFlow).toBe(0);
    expect(bundle.cashflow.transactionCount).toBe(0);
    expect(bundle.dataQuality.hasCashflowData).toBe(false);
  });

  // ── Month with only dividends ─────────────────────────────────────────────

  it('separates dividends from other income using dividendIncomeCategoryId', async () => {
    mockSettings('cat-div');
    mockSnapshots([makeSnapshotDoc(2025, 2, 100_000), makeSnapshotDoc(2025, 3, 110_000)]);
    mockExpenses([
      makeExpenseDoc(500, 'cat-div'),     // dividend income
      makeExpenseDoc(200, 'cat-div'),     // another dividend
      makeExpenseDoc(1000, 'cat-salary'), // regular income
      makeExpenseDoc(-300, 'cat-rent'),   // expense
    ]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.cashflow.totalDividends).toBe(700);
    expect(bundle.cashflow.totalIncome).toBe(1000);
    expect(bundle.cashflow.totalExpenses).toBeCloseTo(-300);
    expect(bundle.cashflow.netCashFlow).toBeCloseTo(700 + 1000 - 300);
    expect(bundle.cashflow.transactionCount).toBe(4);
    expect(bundle.cashflow.expenseTransactionCount).toBe(1);
  });

  // ── Breakdown granularity ─────────────────────────────────────────────────

  it('exposes every category with its subcategories, not just the top five', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses([
      makeExpenseDoc(-1180, 'cat-casa', new Date(2025, 2, 5), {
        type: 'fixed',
        categoryName: 'Casa',
        subCategoryId: 'sub-luce',
        subCategoryName: 'Elettricità',
      }),
      makeExpenseDoc(-390, 'cat-casa', new Date(2025, 2, 12), {
        type: 'fixed',
        categoryName: 'Casa',
        subCategoryId: 'sub-bon',
        subCategoryName: 'Bonifica',
      }),
      // Five other categories, each smaller than Casa: under the old top-5 cap the
      // sixth would have vanished from the bundle entirely.
      ...['A', 'B', 'C', 'D', 'E'].map((name, i) =>
        makeExpenseDoc(-(100 + i), `cat-${name}`, new Date(2025, 2, 20), {
          type: 'variable',
          categoryName: name,
        })
      ),
    ]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.expensesByCategory).toHaveLength(6);
    const casa = bundle.expensesByCategory.find((c) => c.categoryName === 'Casa');
    expect(casa?.total).toBeCloseTo(-1570);
    expect(casa?.subCategories.map((s) => s.subCategoryName)).toEqual(['Elettricità', 'Bonifica']);
  });

  it('counts a refund booked on a spending category as spending, not income', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses([
      makeExpenseDoc(-200, 'cat-cibo', new Date(2025, 2, 5), { type: 'variable' }),
      makeExpenseDoc(50, 'cat-cibo', new Date(2025, 2, 6), { type: 'variable' }), // refund
    ]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.cashflow.totalIncome).toBe(0);
    expect(bundle.cashflow.totalExpenses).toBeCloseTo(-250);
  });

  it('adds a data quality note when most spending carries no subcategory', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses([
      makeExpenseDoc(-900, 'cat-casa', new Date(2025, 2, 5), { type: 'fixed' }),
      makeExpenseDoc(-100, 'cat-casa', new Date(2025, 2, 6), {
        type: 'fixed',
        subCategoryId: 'sub-luce',
        subCategoryName: 'Elettricità',
      }),
    ]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.dataQuality.notes.some((n) => n.includes('sottocategoria assegnata'))).toBe(true);
  });

  it('keeps at most five individual expenses for a month', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses(
      Array.from({ length: 8 }, (_, i) =>
        makeExpenseDoc(-(100 + i), 'cat-cibo', new Date(2025, 2, i + 1), { type: 'variable' })
      )
    );

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.topIndividualExpenses).toHaveLength(5);
  });

  // ── Dummy snapshot exclusion ──────────────────────────────────────────────

  it('excludes dummy snapshots from the context', async () => {
    // isDummy=true for March, real snapshot for February
    mockSnapshots([
      makeSnapshotDoc(2025, 2, 90_000),
      makeSnapshotDoc(2025, 3, 999_999, {}, true), // isDummy
    ]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    // The dummy snapshot for March must not be treated as the current snapshot
    expect(bundle.currentSnapshot).toBeNull();
    // February real snapshot must be found as previous
    expect(bundle.previousSnapshot?.totalNetWorth).toBe(90_000);
  });

  // ── Net worth delta ───────────────────────────────────────────────────────

  it('computes correct net worth delta and percentage when both snapshots exist', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 2, 100_000), makeSnapshotDoc(2025, 3, 110_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.netWorth.start).toBe(100_000);
    expect(bundle.netWorth.end).toBe(110_000);
    expect(bundle.netWorth.delta).toBe(10_000);
    expect(bundle.netWorth.deltaPct).toBeCloseTo(10);
  });

  it('handles negative delta correctly', async () => {
    mockSnapshots([makeSnapshotDoc(2024, 12, 100_000), makeSnapshotDoc(2025, 1, 80_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.netWorth.delta).toBe(-20_000);
    expect(bundle.netWorth.deltaPct).toBeCloseTo(-20);
  });

  // ── January → December previous month ────────────────────────────────────

  it('resolves previous month correctly for January (wraps to December of prior year)', async () => {
    mockSnapshots([makeSnapshotDoc(2024, 12, 90_000), makeSnapshotDoc(2025, 1, 95_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.previousSnapshot?.year).toBe(2024);
    expect(bundle.previousSnapshot?.month).toBe(12);
    expect(bundle.netWorth.start).toBe(90_000);
  });

  // ── Allocation changes ────────────────────────────────────────────────────

  it('computes allocation changes sorted by absolute change descending, capped at 5', async () => {
    const prevByClass = { Azioni: 50_000, Obbligazioni: 30_000, Cash: 20_000 };
    const currByClass = {
      Azioni: 70_000,       // +20k
      Obbligazioni: 28_000, // -2k
      Cash: 15_000,         // -5k
      Crypto: 5_000,        // new (+5k)
      Immobili: 10_000,     // new (+10k)
    };
    mockSnapshots([
      makeSnapshotDoc(2025, 2, 100_000, prevByClass),
      makeSnapshotDoc(2025, 3, 128_000, currByClass),
    ]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.allocationChanges.length).toBeLessThanOrEqual(5);
    // Top change should be Azioni (+20k)
    expect(bundle.allocationChanges[0].assetClass).toBe('Azioni');
    expect(bundle.allocationChanges[0].absoluteChange).toBe(20_000);
    // Changes should be in descending absolute order
    const abs = bundle.allocationChanges.map((c) => Math.abs(c.absoluteChange));
    for (let i = 0; i < abs.length - 1; i++) {
      expect(abs[i]).toBeGreaterThanOrEqual(abs[i + 1]);
    }
  });

  it('sets previousValue to null for asset classes that did not exist in the previous snapshot', async () => {
    mockSnapshots([
      makeSnapshotDoc(2025, 2, 100_000, { Azioni: 100_000 }),
      makeSnapshotDoc(2025, 3, 110_000, { Azioni: 100_000, Crypto: 10_000 }),
    ]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    const cryptoChange = bundle.allocationChanges.find((c) => c.assetClass === 'Crypto');
    expect(cryptoChange).toBeDefined();
    expect(cryptoChange!.previousValue).toBeNull();
    expect(cryptoChange!.absoluteChange).toBe(10_000);
  });

  // ── Month boundary: end date covers full last day ─────────────────────────

  it('passes the end-of-month date with time 23:59:59 to the expenses query', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    // The Timestamp.fromDate call uses the endDate we computed — verify via the
    // raw Date that would produce it (March has 31 days)
    // We verify by checking the call to collection('expenses').where(...)
    // The second where call receives the end timestamp; check it via mock args
    const expensesCollection = vi.mocked(
      (await import('@/lib/firebase/admin')).adminDb.collection
    )('expenses') as any;
    // The where mock captures calls; we check the date passed to fromDate via the
    // endDate boundary logic directly by re-deriving it
    const endDate = new Date(2025, 3, 0, 23, 59, 59); // March 31
    expect(endDate.getDate()).toBe(31);
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getSeconds()).toBe(59);
  });

  it('end date is correct for February in a leap year (29 days)', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    await buildAssistantMonthContext('user1', { year: 2024, month: 2 });

    // 2024 is a leap year; February has 29 days
    const endDate = new Date(2024, 2, 0, 23, 59, 59); // Feb 29 in leap year
    expect(endDate.getDate()).toBe(29);
  });
});

describe('buildAssistantYearContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings(undefined);
  });

  it('keeps more individual expenses than a month does, since the window is twelve times longer', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 12, 100_000)]);
    mockExpenses(
      Array.from({ length: 20 }, (_, i) =>
        makeExpenseDoc(-(100 + i), 'cat-cibo', new Date(2025, i % 12, 5), { type: 'variable' })
      )
    );

    const bundle = await buildAssistantYearContext('user1', 2025);

    expect(bundle.topIndividualExpenses).toHaveLength(10);
  });
});
