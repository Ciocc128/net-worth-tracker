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
import { calculateAssetValue, calculateTotalValue } from '@/lib/services/assetService';

const mockedCalculateAssetValue = vi.mocked(calculateAssetValue);
const mockedCalculateTotalValue = vi.mocked(calculateTotalValue);

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

    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 80 },
      bonds: { targetPercentage: 45 },
    };

    mockedCalculateTotalValue.mockReturnValue(100);
    mockedCalculateAssetValue
      .mockReturnValueOnce(50) // VT
      .mockReturnValueOnce(50); // NTSG

    const result = compareAllocations(assets, targets);

    expect(result.totalValue).toBe(100);

    expect(result.byAssetClass.equity).toEqual({
      currentPercentage: 95,
      currentValue: 95,
      targetPercentage: 80,
      targetValue: 80,
      difference: 15,
      differenceValue: 15,
      action: 'VENDI',
    });

    expect(result.byAssetClass.bonds).toEqual({
      currentPercentage: 30,
      currentValue: 30,
      targetPercentage: 45,
      targetValue: 45,
      difference: -15,
      differenceValue: -15,
      action: 'COMPRA',
    });
  });
});