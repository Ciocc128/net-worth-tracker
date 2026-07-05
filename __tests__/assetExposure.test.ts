import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expandAssetExposure, calculatePortfolioLeverage } from '@/lib/utils/assetExposureUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import type { Asset } from '@/types/assets';

vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: vi.fn(),
}));

const mockedCalculateAssetValue = vi.mocked(calculateAssetValue);

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

describe('assetExposure utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expands a normal asset as a single exposure component', () => {
    const asset = createMockAsset({
      assetClass: 'equity',
      subCategory: 'US Stocks',
      composition: [],
    });

    mockedCalculateAssetValue.mockReturnValue(1000);

    expect(expandAssetExposure(asset)).toEqual([
      {
        assetClass: 'equity',
        subCategory: 'US Stocks',
        marketValue: 1000,
        notionalValue: 1000,
      },
    ]);
  });

  it('expands a composite asset without leverage', () => {
    const asset = createMockAsset({
      assetClass: 'equity',
      composition: [
        { assetClass: 'equity', percentage: 60, subCategory: 'Value' },
        { assetClass: 'bonds', percentage: 40, subCategory: 'Treasury' },
      ],
    });

    mockedCalculateAssetValue.mockReturnValue(1000);

    expect(expandAssetExposure(asset)).toEqual([
      {
        assetClass: 'equity',
        subCategory: 'Value',
        marketValue: 600,
        notionalValue: 600,
      },
      {
        assetClass: 'bonds',
        subCategory: 'Treasury',
        marketValue: 400,
        notionalValue: 400,
      },
    ]);
  });

  it('expands a leveraged ETF using leverageRatio on all components', () => {
    const asset = createMockAsset({
      assetClass: 'equity',
      type: 'leveragedEtf',
      leverageRatio: 1.5,
      composition: [
        { assetClass: 'equity', percentage: 60, subCategory: 'US Stocks' },
        { assetClass: 'bonds', percentage: 40, subCategory: 'Treasury' },
      ],
    });

    mockedCalculateAssetValue.mockReturnValue(1000);

    expect(expandAssetExposure(asset)).toEqual([
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
  });

  it('calculates portfolio leverage across mixed assets', () => {
    const assets = [
      {
        assetClass: 'equity',
        composition: [],
      },
      {
        assetClass: 'equity',
        type: 'leveragedEtf',
        leverageRatio: 2,
        composition: [
          { assetClass: 'equity', percentage: 100 },
        ],
      },
    ] as Asset[];

    mockedCalculateAssetValue
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(500);

    expect(calculatePortfolioLeverage(assets)).toBe(1.3333333333333333);
  });
});