import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));

vi.mock('@/lib/services/assetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/assetService')>();

  return {
    ...actual,
    calculateAssetValue: vi.fn(),
    calculateTotalValue: vi.fn(),
  };
});

import {
  compareAllocations,
  deriveTargetLeverageRatio,
} from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';

const mockedCalculateAssetValue = vi.mocked(calculateAssetValue);

function createMockAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: crypto.randomUUID(),
    userId: 'test-user',
    ticker: 'TEST',
    name: 'Test Asset',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('compareAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Shared portfolio: VT (plain equity) + NTSG (1.5x, 60% equity / 40% bonds), each 50 market.
  //   market:   equity 80 (50 VT + 30 NTSG), bonds 20 (NTSG)               → market total 100
  //   notional: equity 95 (50 VT + 45 NTSG), bonds 30 (NTSG × 1.5)         → notional total 125
  //   ⇒ current leverage 1.25×. In the leverage-aware model current % are notional over the
  //     100 market base, so equity 95% + bonds 30% = 125% (they sum to leverage × 100).
  const leveragedAssets: Asset[] = [
    createMockAsset({ ticker: 'VT', name: 'Vanguard Total World Stock ETF', type: 'etf', assetClass: 'equity' }),
    createMockAsset({
      ticker: 'NTSG',
      name: 'WisdomTree NTSG',
      type: 'leveragedEtf',
      assetClass: 'equity',
      leverageRatio: 1.5,
      composition: [
        { assetClass: 'equity', percentage: 60 },
        { assetClass: 'bonds', percentage: 40 },
      ],
    }),
  ];

  it('expresses current % as notional exposure over invested market capital (weights sum to leverage × 100)', () => {
    // Leveraged target: equity 90% + bonds 60% = 150% ⇒ target leverage 1.5×.
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 90 },
      bonds: { targetPercentage: 60 },
    };

    mockedCalculateAssetValue.mockReturnValueOnce(50).mockReturnValueOnce(50);

    const result = compareAllocations(leveragedAssets, targets);

    // Investable base metadata: market 100, notional 125, leverage 1.25.
    expect(result.marketValue).toBe(100);
    expect(result.totalValue).toBe(125); // notional total = composition-bar denominator
    expect(result.leverageRatio).toBeCloseTo(1.25, 5);
    expect(result.excludedClasses).toEqual([]);

    // equity: 95 notional / 100 market = 95%; target 90% ⇒ +5 p.p. (over) → VENDI.
    expect(result.byAssetClass.equity).toEqual({
      currentPercentage: 95,
      currentValue: 95,
      targetPercentage: 90,
      targetValue: 90,
      difference: 5,
      differenceValue: 5,
      action: 'VENDI',
    });

    // bonds: 30 notional / 100 market = 30%; target 60% ⇒ −30 p.p. (under) → COMPRA.
    expect(result.byAssetClass.bonds).toEqual({
      currentPercentage: 30,
      currentValue: 30,
      targetPercentage: 60,
      targetValue: 60,
      difference: -30,
      differenceValue: -30,
      action: 'COMPRA',
    });
  });

  it('is byte-identical to the old behavior for an unleveraged portfolio (weights sum to 100)', () => {
    const assets: Asset[] = [
      createMockAsset({ ticker: 'VWCE', assetClass: 'equity' }),
      createMockAsset({ ticker: 'AGGH', assetClass: 'bonds' }),
    ];
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60 },
      bonds: { targetPercentage: 40 },
    };

    mockedCalculateAssetValue.mockReturnValueOnce(70).mockReturnValueOnce(30);

    const result = compareAllocations(assets, targets);

    expect(result.marketValue).toBe(100);
    expect(result.totalValue).toBe(100); // notional == market, no leverage
    expect(result.leverageRatio).toBe(1);
    expect(result.byAssetClass.equity.currentPercentage).toBe(70);
    expect(result.byAssetClass.equity.difference).toBe(10); // 70 − 60 → VENDI
    expect(result.byAssetClass.equity.action).toBe('VENDI');
    expect(result.byAssetClass.bonds.currentPercentage).toBe(30);
  });

  it('removes an excluded class from the base and reports it under excludedClasses', () => {
    const assets: Asset[] = [
      createMockAsset({ ticker: 'VWCE', assetClass: 'equity' }),
      createMockAsset({ ticker: 'CASH', assetClass: 'cash' }),
    ];
    // Cash excluded → target has no cash entry; equity is the whole investable base.
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 100 },
    };

    mockedCalculateAssetValue.mockReturnValueOnce(60).mockReturnValueOnce(40);

    const result = compareAllocations(assets, targets, { cash: true });

    // Base is equity only (60); cash (40) is out of numerator + denominator.
    expect(result.marketValue).toBe(60);
    expect(result.totalValue).toBe(60);
    expect(result.byAssetClass.equity.currentPercentage).toBe(100);
    expect(result.byAssetClass.equity.action).toBe('OK');
    expect(result.byAssetClass.cash).toBeUndefined();
    expect(result.excludedClasses).toEqual([{ assetClass: 'cash', marketValue: 40 }]);
  });
});

describe('deriveTargetLeverageRatio', () => {
  it('returns 1 for targets that sum to 100 (no leverage)', () => {
    expect(
      deriveTargetLeverageRatio({ equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } })
    ).toBe(1);
  });

  it('reads the leverage off a target set summing above 100', () => {
    expect(
      deriveTargetLeverageRatio({ equity: { targetPercentage: 90 }, bonds: { targetPercentage: 60 } })
    ).toBeCloseTo(1.5, 5);
  });

  it('ignores excluded classes when summing', () => {
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 100 },
      cash: { targetPercentage: 20 },
    };
    expect(deriveTargetLeverageRatio(targets, { cash: true })).toBe(1);
  });

  it('returns 1 for an absent target set', () => {
    expect(deriveTargetLeverageRatio(null)).toBe(1);
  });
});