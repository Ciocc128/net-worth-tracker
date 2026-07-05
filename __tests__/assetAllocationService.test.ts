import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Asset } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));

vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: vi.fn(),
  calculateTotalValue: vi.fn(),
}));

vi.mock('@/lib/utils/assetExposureUtils', () => ({
  expandAssetExposure: vi.fn(),
}));

import { calculateCurrentAllocation } from '@/lib/services/assetAllocationService';
import { calculateTotalValue } from '@/lib/services/assetService';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';

const mockedCalculateTotalValue = vi.mocked(calculateTotalValue);
const mockedExpandAssetExposure = vi.mocked(expandAssetExposure);

function createMockAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'test-id',
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

describe('calculateCurrentAllocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates current allocation for a normal asset', () => {
    const assets = [
      createMockAsset({
        assetClass: 'equity',
        subCategory: 'US Stocks',
      }),
    ];

    mockedCalculateTotalValue.mockReturnValue(1000);
    mockedExpandAssetExposure.mockReturnValue([
      {
        assetClass: 'equity',
        subCategory: 'US Stocks',
        marketValue: 1000,
        notionalValue: 1000,
      },
    ]);

    expect(calculateCurrentAllocation(assets)).toEqual({
      byAssetClass: {
        equity: 1000,
      },
      bySubCategory: {
        'equity:US Stocks': 1000,
      },
      totalValue: 1000,
    });
  });

  it('calculates current allocation using notional exposure for a leveraged ETF', () => {
    const assets = [
      createMockAsset({
        type: 'leveragedEtf',
        assetClass: 'equity',
        leverageRatio: 1.5,
      }),
    ];

    mockedCalculateTotalValue.mockReturnValue(1000);
    mockedExpandAssetExposure.mockReturnValue([
      {
        assetClass: 'equity',
        subCategory: 'US Stocks',
        marketValue: 600,
        notionalValue: 900,
      },
      {
        assetClass: 'bonds',
        subCategory: 'Treasury',
        marketValue: 400,
        notionalValue: 600,
      },
    ]);

    expect(calculateCurrentAllocation(assets)).toEqual({
      byAssetClass: {
        equity: 900,
        bonds: 600,
      },
      bySubCategory: {
        'equity:US Stocks': 900,
        'bonds:Treasury': 600,
      },
      totalValue: 1000,
    });
  });

  it('returns empty allocation when total value is zero', () => {
    const assets = [createMockAsset()];

    mockedCalculateTotalValue.mockReturnValue(0);

    expect(calculateCurrentAllocation(assets)).toEqual({
      byAssetClass: {},
      bySubCategory: {},
      totalValue: 0,
    });
  });
});