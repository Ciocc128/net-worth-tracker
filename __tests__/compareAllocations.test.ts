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

import { compareAllocations } from '@/lib/services/assetAllocationService';
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

  it('suggests selling equity and buying bonds for a portfolio with VT + leveraged NTSG exposure', () => {
    const assets: Asset[] = [
      createMockAsset({
        ticker: 'VT',
        name: 'Vanguard Total World Stock ETF',
        type: 'etf',
        assetClass: 'equity',
      }),
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

    // Targets sum to 100% of the (self-consistent) notional total: 55% equity / 45% bonds.
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 55 },
      bonds: { targetPercentage: 45 },
    };

    mockedCalculateAssetValue
      .mockReturnValueOnce(50) // VT market value
      .mockReturnValueOnce(50); // NTSG market value

    const result = compareAllocations(assets, targets);

    // VT: 50 market/notional, all equity.
    // NTSG (1.5x, 60% equity / 40% bonds): equity 30 market / 45 notional, bonds 20 market / 30 notional.
    // Notional total = (50 + 45) equity + 30 bonds = 125 — this IS the 100% basis, so
    // percentages below sum to 100 even though notional exceeds the 100 market value.
    expect(result.totalValue).toBe(125);

    expect(result.byAssetClass.equity).toEqual({
      currentPercentage: 76,
      currentValue: 95,
      targetPercentage: expect.closeTo(55, 5),
      targetValue: 68.75,
      difference: expect.closeTo(21, 5),
      differenceValue: 26.25,
      action: 'VENDI',
    });

    expect(result.byAssetClass.bonds).toEqual({
      currentPercentage: 24,
      currentValue: 30,
      targetPercentage: 45,
      targetValue: 56.25,
      difference: expect.closeTo(-21, 5),
      differenceValue: -26.25,
      action: 'COMPRA',
    });
  });
});