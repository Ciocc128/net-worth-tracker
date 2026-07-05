import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Asset } from '@/types/assets';

const { setDocMock, docMock, timestampNowMock } = vi.hoisted(() => ({
  setDocMock: vi.fn(),
  docMock: vi.fn(() => ({ id: 'mock-doc-ref' })),
  timestampNowMock: vi.fn(() => 'MOCK_TIMESTAMP'),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: docMock,
  setDoc: setDocMock,
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: {
    now: timestampNowMock,
  },
  deleteField: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('@/lib/utils/dateHelpers', () => ({
  getItalyMonthYear: vi.fn(() => ({
    month: 6,
    year: 2026,
  })),
}));

vi.mock('@/lib/services/assetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/assetService')>();

  return {
    ...actual,
    calculateAssetValue: vi.fn(),
    calculateTotalValue: vi.fn(),
    calculateLiquidNetWorth: vi.fn(),
    calculateIlliquidNetWorth: vi.fn(),
    calculateFIRENetWorth: vi.fn(),
  };
});

vi.mock('@/lib/services/assetAllocationService', () => ({
  calculateCurrentAllocation: vi.fn(),
}));

import { createSnapshot } from '@/lib/services/snapshotService';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
  calculateFIRENetWorth,
} from '@/lib/services/assetService';
import { calculateCurrentAllocation } from '@/lib/services/assetAllocationService';

const mockedCalculateAssetValue = vi.mocked(calculateAssetValue);
const mockedCalculateTotalValue = vi.mocked(calculateTotalValue);
const mockedCalculateLiquidNetWorth = vi.mocked(calculateLiquidNetWorth);
const mockedCalculateIlliquidNetWorth = vi.mocked(calculateIlliquidNetWorth);
const mockedCalculateFIRENetWorth = vi.mocked(calculateFIRENetWorth);
const mockedCalculateCurrentAllocation = vi.mocked(calculateCurrentAllocation);

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

describe('createSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores notional allocation and portfolio leverage ratio for a portfolio with VT + leveraged NTSG', async () => {
    const userId = 'test-user';

    const assets: Asset[] = [
      createMockAsset({
        id: 'vt-id',
        ticker: 'VT',
        name: 'Vanguard Total World Stock ETF',
        type: 'etf',
        assetClass: 'equity',
        quantity: 1,
        currentPrice: 50,
      }),
      createMockAsset({
        id: 'ntsg-id',
        ticker: 'NTSG',
        name: 'WisdomTree NTSG',
        type: 'leveragedEtf',
        assetClass: 'equity',
        leverageRatio: 1.5,
        quantity: 1,
        currentPrice: 50,
        composition: [
          { assetClass: 'equity', percentage: 60 },
          { assetClass: 'bonds', percentage: 40 },
        ],
      }),
    ];

    mockedCalculateTotalValue.mockReturnValue(100);
    mockedCalculateLiquidNetWorth.mockReturnValue(100);
    mockedCalculateIlliquidNetWorth.mockReturnValue(0);
    mockedCalculateFIRENetWorth.mockReturnValue(100);

    mockedCalculateCurrentAllocation.mockReturnValue({
      byAssetClass: {
        equity: 95,
        bonds: 30,
      },
      bySubCategory: {},
      totalValue: 100,
    });

    mockedCalculateAssetValue
      .mockReturnValueOnce(50) // VT
      .mockReturnValueOnce(50); // NTSG

    const snapshotId = await createSnapshot(userId, assets);

    expect(snapshotId).toBe('test-user-2026-6');

    expect(docMock).toHaveBeenCalledWith({}, 'monthly-snapshots', 'test-user-2026-6');

    expect(setDocMock).toHaveBeenCalledTimes(1);

    const savedSnapshot = setDocMock.mock.calls[0][1];

    expect(savedSnapshot).toMatchObject({
      userId: 'test-user',
      year: 2026,
      month: 6,
      totalNetWorth: 100,
      liquidNetWorth: 100,
      illiquidNetWorth: 0,
      fireNetWorth: 100,
      byAssetClass: {
        equity: 95,
        bonds: 30,
      },
      assetAllocation: {
        equity: 95,
        bonds: 30,
      },
      portfolioLeverageRatio: 1.25,
      byAsset: [
        {
          assetId: 'vt-id',
          ticker: 'VT',
          name: 'Vanguard Total World Stock ETF',
          quantity: 1,
          price: 50,
          totalValue: 50,
        },
        {
          assetId: 'ntsg-id',
          ticker: 'NTSG',
          name: 'WisdomTree NTSG',
          quantity: 1,
          price: 50,
          totalValue: 50,
        },
      ],
      createdAt: 'MOCK_TIMESTAMP',
    });
  });
});