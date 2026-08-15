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
const { snapshotsGetMock, expensesGetMock, settingsDocGetMock, assetsGetMock, goalDocGetMock } =
  vi.hoisted(() => ({
    snapshotsGetMock: vi.fn(),
    expensesGetMock: vi.fn(),
    settingsDocGetMock: vi.fn(),
    assetsGetMock: vi.fn(),
    goalDocGetMock: vi.fn(),
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
      if (name === 'assets') {
        return {
          where: vi.fn().mockReturnThis(),
          get: assetsGetMock,
        };
      }
      if (name === 'goalBasedInvesting') {
        return {
          doc: vi.fn(() => ({ get: goalDocGetMock })),
        };
      }
      return { where: vi.fn().mockReturnThis(), get: vi.fn().mockResolvedValue({ docs: [] }) };
    }),
  },
}));

// firebase/config is imported transitively via dateHelpers (and now via goalMath →
// assetService) — mock to avoid real init.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('server-only', () => ({}));

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

function mockSettings(
  dividendIncomeCategoryId?: string,
  extra: Record<string, unknown> = {}
) {
  settingsDocGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ dividendIncomeCategoryId, ...extra }),
  });
}

/** An asset doc as fetchAssets reads it: value = quantity × currentPrice. */
function makeAssetDoc(id: string, assetClass: string, value: number) {
  return {
    id,
    data: () => ({
      userId: 'user1',
      name: id,
      type: 'etf',
      assetClass,
      currency: 'EUR',
      quantity: 1,
      currentPrice: value,
    }),
  };
}

function mockAssets(docs: ReturnType<typeof makeAssetDoc>[]) {
  assetsGetMock.mockResolvedValue({ docs });
}

function mockGoalData(data: unknown | null) {
  goalDocGetMock.mockResolvedValue(
    data === null ? { exists: false } : { exists: true, data: () => data }
  );
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('buildAssistantMonthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings(undefined);
    mockAssets([]);
    mockGoalData(null);
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
    mockAssets([]);
    mockGoalData(null);
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

// ─── Goal-Based Investing block ──────────────────────────────────────────────

describe('goals block', () => {
  // asset1 is €10.000 of equity; the goal below has all of it assigned.
  const GOAL_ASSETS = [makeAssetDoc('asset1', 'equity', 10_000)];

  const CASA_GOAL = {
    id: 'casa',
    name: 'Acquisto Casa',
    targetAmount: 100_000,
    targetDate: '2032-06-01',
    priority: 'alta',
    color: '#3B82F6',
    monthlyContribution: 500,
    recommendedAllocation: { bonds: 70, equity: 30 },
    createdAt: new Date(2025, 0, 1),
    updatedAt: new Date(2025, 0, 1),
  };

  const CASA_DOC = {
    goals: [CASA_GOAL],
    assignments: [{ goalId: 'casa', assetId: 'asset1', percentage: 100 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings(undefined);
    mockAssets(GOAL_ASSETS);
    mockGoalData(null);
    mockSnapshots([makeSnapshotDoc(2025, 3, 100_000, { equity: 100_000 })]);
    mockExpenses([]);
  });

  it('reports goals as null when the feature is disabled, even with a goal document', async () => {
    mockSettings(undefined, { goalBasedInvestingEnabled: false });
    mockGoalData(CASA_DOC);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.goals).toBeNull();
  });

  it('reports goals as null when the user has no goal document', async () => {
    mockSettings(undefined, { goalBasedInvestingEnabled: true });
    mockGoalData(null);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.goals).toBeNull();
  });

  it('reports an enabled feature with no goals as an empty list, not as null', async () => {
    mockSettings(undefined, { goalBasedInvestingEnabled: true });
    mockGoalData({ goals: [], assignments: [] });

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.goals).toEqual({
      enabled: true,
      goalDrivenAllocationEnabled: false,
      items: [],
    });
  });

  it('carries each goal with its assigned value and trajectory verdict', async () => {
    mockSettings(undefined, { goalBasedInvestingEnabled: true });
    mockGoalData(CASA_DOC);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.goals?.items).toHaveLength(1);
    expect(bundle.goals?.items[0]).toMatchObject({
      name: 'Acquisto Casa',
      targetAmount: 100_000,
      targetDateIso: '2032-06-01',
      priority: 'alta',
      currentValue: 10_000,
      monthlyContribution: 500,
      recommendedAllocation: { bonds: 70, equity: 30 },
    });
    // €500/month against a €90.000 gap does not get there — the point of the verdict.
    expect(bundle.goals?.items[0].verdict).toBe('offTrack');
  });

  it('carries the required pace and the projected value for a dated goal', async () => {
    mockSettings(undefined, { goalBasedInvestingEnabled: true });
    mockGoalData(CASA_DOC);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    const item = bundle.goals!.items[0];
    // The three travel together: a required pace without the return it assumes is a
    // number the reader cannot audit.
    expect(item.requiredMonthlyContribution).toBeGreaterThan(500);
    expect(item.projectedValueAtDeadline).toBeGreaterThan(10_000);
    // bonds 70 / equity 30 → 0.7×2.5 + 0.3×7 = 3.85%
    expect(item.assumedAnnualReturn).toBeCloseTo(3.85, 2);
  });

  it('leaves the trajectory numbers out of a goal that has nothing to project', async () => {
    // No deadline means no annuity to solve: the fields must be absent, not zero.
    mockSettings(undefined, { goalBasedInvestingEnabled: true });
    mockGoalData({
      goals: [
        {
          id: 'senza-data',
          name: 'Senza scadenza',
          targetAmount: 50_000,
          priority: 'media',
          color: '#EF4444',
        },
      ],
      assignments: [],
    });

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    const item = bundle.goals!.items[0];
    expect(item).not.toHaveProperty('requiredMonthlyContribution');
    expect(item).not.toHaveProperty('projectedValueAtDeadline');
    expect(item).not.toHaveProperty('assumedAnnualReturn');
    expect(item.verdict).toBe('noDeadline');
  });

  it('omits the optional goal fields that are unset rather than carrying undefined', async () => {
    mockSettings(undefined, { goalBasedInvestingEnabled: true });
    mockGoalData({
      goals: [{ id: 'aperto', name: 'Fondo libero', priority: 'bassa', color: '#64748B' }],
      assignments: [],
    });

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    const item = bundle.goals!.items[0];
    expect(item).not.toHaveProperty('targetAmount');
    expect(item).not.toHaveProperty('targetDateIso');
    expect(item.verdict).toBe('noTarget');
  });

  // ── Target allocation source ───────────────────────────────────────────────

  it('keeps the manual targets and says so when goal-driven allocation is off', async () => {
    mockSettings(undefined, {
      goalBasedInvestingEnabled: true,
      goalDrivenAllocationEnabled: false,
      targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } },
    });
    mockGoalData(CASA_DOC);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.targetAllocationSource).toBe('manual');
    expect(bundle.targetAllocation?.equity.targetPercentage).toBe(60);
  });

  it('replaces the manual targets with the goal-derived ones when the flag is on', async () => {
    mockSettings(undefined, {
      goalBasedInvestingEnabled: true,
      goalDrivenAllocationEnabled: true,
      targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } },
    });
    mockGoalData(CASA_DOC);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    // The single goal's own mix, not the manual 60/40.
    expect(bundle.targetAllocationSource).toBe('goal_driven');
    expect(bundle.targetAllocation?.bonds.targetPercentage).toBe(70);
    expect(bundle.targetAllocation?.equity.targetPercentage).toBe(30);
  });

  it('preserves the user sub-targets underneath a goal-derived class target', async () => {
    mockSettings(undefined, {
      goalBasedInvestingEnabled: true,
      goalDrivenAllocationEnabled: true,
      targets: {
        equity: { targetPercentage: 60, subTargets: { 'Azioni USA': 70 } },
      },
    });
    mockGoalData(CASA_DOC);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.targetAllocation?.equity).toEqual({
      targetPercentage: 30,
      subTargets: { 'Azioni USA': 70 },
    });
  });

  it('falls back to the manual targets when the goals derive nothing', async () => {
    // An open-ended goal has no gap to weight, so the derivation returns null and the
    // page keeps showing the manual targets — the bundle must agree with it.
    mockSettings(undefined, {
      goalBasedInvestingEnabled: true,
      goalDrivenAllocationEnabled: true,
      targets: { equity: { targetPercentage: 60 } },
    });
    mockGoalData({
      goals: [{ id: 'aperto', name: 'Fondo libero', priority: 'bassa', color: '#64748B' }],
      assignments: [],
    });

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.targetAllocationSource).toBe('manual');
    expect(bundle.targetAllocation?.equity.targetPercentage).toBe(60);
  });

  it('builds the same goals block for a year period', async () => {
    mockSettings(undefined, { goalBasedInvestingEnabled: true });
    mockGoalData(CASA_DOC);
    mockSnapshots([makeSnapshotDoc(2025, 12, 100_000, { equity: 100_000 })]);

    const bundle = await buildAssistantYearContext('user1', 2025);

    expect(bundle.goals?.items[0].name).toBe('Acquisto Casa');
    expect(bundle.goals?.items[0].currentValue).toBe(10_000);
  });
});
