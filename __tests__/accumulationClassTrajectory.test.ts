/**
 * projectClassTrajectory against the real compareAllocations (doc/pac-ate.md §5.9/§11).
 * assetAllocationService pulls in the client Firebase SDK — mock it (same convention as
 * __tests__/compareAllocations.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import { compareAllocations } from '@/lib/services/assetAllocationService';
import { DEFAULT_REBALANCE_BAND, bandForTarget, type RebalanceBand } from '@/lib/utils/allocationUtils';
import { projectClassTrajectory, buildClassMeasurement } from '@/lib/utils/accumulationPlanUtils';
import type { AccumulationPlan, Installment } from '@/types/accumulationPlan';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `a${seq}`,
    userId: 'u1',
    ticker: 'X',
    name: 'X',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const targets = (percentages: Record<string, number>): AssetAllocationTarget => {
  const out: AssetAllocationTarget = {};
  for (const [assetClass, targetPercentage] of Object.entries(percentages)) {
    out[assetClass] = { targetPercentage };
  }
  return out;
};

function basePlan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'plan1',
    userId: 'u1',
    name: 'Piano',
    status: 'draft',
    startMonth: '2026-10',
    months: 3,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [
      { id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' },
    ],
    disposals: [],
    installments: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('projectClassTrajectory — point 0 with currentIndex = 0', () => {
  it('coincides with compareAllocations(allAssets, targets)', () => {
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 60 });
    const bonds = makeAsset({ id: 'bonds1', assetClass: 'bonds', quantity: 40 });
    const allAssets = [equity, bonds];
    const tgts = targets({ equity: 60, bonds: 40 });
    const plan = basePlan();

    const direct = compareAllocations(allAssets, tgts);
    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    const point0 = points.find((p) => p.index === 0)!;
    expect(point0.source).toBe('projected');
    for (const [assetClass, data] of Object.entries(direct.byAssetClass)) {
      expect(point0.byClass[assetClass as keyof typeof point0.byClass]?.currentPct).toBeCloseTo(
        data.currentPercentage,
        6
      );
    }
  });
});

describe('projectClassTrajectory — disposals and executed lines', () => {
  it('a sale executed in month 1 leaves the class, and an executed buy is never counted twice', () => {
    const sellable = makeAsset({ id: 'sell1', assetClass: 'equity', quantity: 10, currentPrice: 100 });
    const keep = makeAsset({ id: 'keep1', assetClass: 'bonds', quantity: 10, currentPrice: 100 });
    const allAssets = [sellable, keep];
    const tgts = targets({ equity: 50, bonds: 50 });

    const installments: Installment[] = [
      {
        index: 1,
        month: '2026-10',
        lines: [
          {
            positionId: 'p1',
            assetId: 'keep1',
            plannedQuantity: 5,
            priceEurAtPlan: 100,
            plannedAmountEur: 500,
            status: 'executed',
          },
        ],
        carryInEur: { p1: 0 },
      },
    ];
    const plan = basePlan({
      positions: [{ id: 'p1', label: 'Bonds', targetPercentage: 100, memberAssetIds: ['keep1'], buyAssetId: 'keep1' }],
      disposals: [{ assetId: 'sell1', estimatedProceedsEur: 1000, status: 'planned' }],
      installments,
    });

    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments,
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    const month1 = points.find((p) => p.index === 1)!;
    // The disposed equity is gone: only the bonds class carries value.
    expect(month1.byClass.equity?.currentPct ?? 0).toBe(0);
    expect(month1.byClass.bonds?.currentPct).toBeCloseTo(100, 6);

    // The buy was already executed (real quantity in `allAssets` already reflects it) — the
    // executed line must be skipped, never adding a second 5 shares on top of keep1's quantity 10.
    const untouchedKeep = compareAllocations([keep], targets({ bonds: 100 }));
    expect(month1.byClass.bonds?.currentPct).toBeCloseTo(untouchedKeep.byAssetClass.bonds.currentPercentage, 6);
  });
});

describe('projectClassTrajectory — fixed-amount cash target', () => {
  it('does not distort the other classes', () => {
    const cash = makeAsset({ id: 'cash1', assetClass: 'cash', quantity: 1, currentPrice: 20000 });
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 1, currentPrice: 80000 });
    const allAssets = [cash, equity];
    const tgts: AssetAllocationTarget = {
      cash: { targetPercentage: 20, useFixedAmount: true, fixedAmount: 20000 },
      equity: { targetPercentage: 100 },
    };
    const plan = basePlan({
      positions: [{ id: 'p1', label: 'Equity', targetPercentage: 100, memberAssetIds: ['equity1'], buyAssetId: 'equity1' }],
    });

    const points = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 0,
    });

    const point0 = points.find((p) => p.index === 0)!;
    expect(point0.byClass.cash?.targetPct).toBeCloseTo(20, 4);
  });
});

describe('projectClassTrajectory — measured points', () => {
  it('same currentPct when targets are unchanged, different drift when they change (D11)', () => {
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 60 });
    const bonds = makeAsset({ id: 'bonds1', assetClass: 'bonds', quantity: 40 });
    const allAssets = [equity, bonds];
    const tgts = targets({ equity: 60, bonds: 40 });

    const measurement = buildClassMeasurement(compareAllocations(allAssets, tgts), new Date('2026-10-05'));
    const plan = basePlan({
      status: 'active',
      baseline: {
        capturedAt: new Date('2026-10-05'),
        positionValuesEur: {},
        sourceCashEur: 0,
        pricesEur: {},
        measurement,
      },
    });

    const pointsSameTargets = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 1,
    });
    const pointsNewTargets = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: targets({ equity: 70, bonds: 30 }),
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      currentIndex: 1,
    });

    const baseline0Same = pointsSameTargets.find((p) => p.index === 0)!;
    const baseline0New = pointsNewTargets.find((p) => p.index === 0)!;
    expect(baseline0Same.source).toBe('measured');
    expect(baseline0Same.byClass.equity?.currentPct).toBeCloseTo(baseline0New.byClass.equity!.currentPct, 6);
    expect(baseline0Same.byClass.equity?.driftPp).not.toBeCloseTo(baseline0New.byClass.equity!.driftPp, 2);
  });
});

describe('outOfBand', () => {
  it('reacts to a fixed 2pp band and to rule525', () => {
    const equity = makeAsset({ id: 'equity1', assetClass: 'equity', quantity: 62 });
    const bonds = makeAsset({ id: 'bonds1', assetClass: 'bonds', quantity: 38 });
    const allAssets = [equity, bonds];
    const tgts = targets({ equity: 60, bonds: 40 });
    const plan = basePlan();

    const fixedBand: RebalanceBand = { type: 'fixed', pp: 2 };
    const rule525: RebalanceBand = { type: 'rule525' };

    const pointsFixed = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: fixedBand,
      compare: compareAllocations,
      currentIndex: 0,
    });
    const pointsRule525 = projectClassTrajectory({
      plan,
      allAssets,
      installments: [],
      targets: tgts,
      band: rule525,
      compare: compareAllocations,
      currentIndex: 0,
    });

    const equityDrift = pointsFixed.find((p) => p.index === 0)!.byClass.equity!.driftPp;
    expect(pointsFixed.find((p) => p.index === 0)!.byClass.equity!.outOfBand).toBe(
      Math.abs(equityDrift) > bandForTarget(fixedBand, 60)
    );
    expect(pointsRule525.find((p) => p.index === 0)!.byClass.equity!.outOfBand).toBe(
      Math.abs(equityDrift) > bandForTarget(rule525, 60)
    );
  });
});
