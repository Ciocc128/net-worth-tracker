import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Asset } from '@/types/assets';

vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: vi.fn(),
}));

import { calculateAssetValue } from '@/lib/services/assetService';
import {
  buildInstrumentExposures,
  planInstrumentContribution,
  planInstrumentRebalance,
} from '@/lib/utils/leverageAwareAllocationUtils';

const mockedCalculateAssetValue = vi.mocked(calculateAssetValue);

function createMockAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-id',
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

describe('buildInstrumentExposures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives exposure-per-euro from a plain single-class holding', () => {
    const asset = createMockAsset({ id: 'vt', ticker: 'VT', assetClass: 'equity' });
    mockedCalculateAssetValue.mockReturnValue(500);

    const [inst] = buildInstrumentExposures([asset]);
    expect(inst.marketValue).toBe(500);
    expect(inst.exposurePerEuro).toEqual({ equity: 1 });
  });

  it('derives exposure-per-euro from a multi-class leveraged holding', () => {
    const asset = createMockAsset({
      id: 'ntsg',
      ticker: 'NTSG',
      type: 'leveragedEtf',
      leverageRatio: 1.5,
      composition: [
        { assetClass: 'equity', percentage: 60 },
        { assetClass: 'bonds', percentage: 40 },
      ],
    });
    mockedCalculateAssetValue.mockReturnValue(1000);

    const [inst] = buildInstrumentExposures([asset]);
    expect(inst.exposurePerEuro.equity).toBeCloseTo(0.9, 10);
    expect(inst.exposurePerEuro.bonds).toBeCloseTo(0.6, 10);
  });

  it('excludes fully-sold (zero market value) holdings', () => {
    const asset = createMockAsset({ id: 'sold', quantity: 0 });
    mockedCalculateAssetValue.mockReturnValue(0);

    expect(buildInstrumentExposures([asset])).toEqual([]);
  });
});

describe('planInstrumentContribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reduces to the simple per-class answer when instruments are unleveraged and single-class', () => {
    // Equity already over target (800/1000=80% vs 50%), bonds under (200/1000=20% vs 50%).
    // Held via two plain, single-class instruments — Versa can only buy, so the optimizer
    // should put the whole contribution into the underweight bond instrument.
    const assets: Asset[] = [
      createMockAsset({ id: 'vt', ticker: 'VT', assetClass: 'equity' }),
      createMockAsset({ id: 'bnd', ticker: 'BND', assetClass: 'bonds' }),
    ];
    mockedCalculateAssetValue.mockReturnValueOnce(800).mockReturnValueOnce(200);

    const plan = planInstrumentContribution(
      assets,
      { equity: 800, bonds: 200 },
      1000,
      1000,
      { equity: 50, bonds: 50 },
      200
    );

    expect(plan.trades).toHaveLength(1);
    expect(plan.trades[0].ticker).toBe('BND');
    expect(plan.trades[0].amount).toBeCloseTo(200, 1);
  });

  it('uses the leverage tie-breaker to choose between equally-good instrument splits', () => {
    // Single asset class (equity) — ANY split between the two held instruments hits the
    // notional target exactly (100% of a single-class total), so the target-gap term is
    // zero regardless of split. That isolates the leverage tie-breaker: with a low target
    // leverage (1.0), the optimizer should prefer the unleveraged instrument (A) over
    // topping up the already-leveraged one (B).
    const assets: Asset[] = [
      createMockAsset({ id: 'a', ticker: 'A', assetClass: 'equity' }), // unleveraged
      createMockAsset({ id: 'b', ticker: 'B', assetClass: 'equity', type: 'leveragedEtf', leverageRatio: 2 }),
    ];
    mockedCalculateAssetValue.mockReturnValueOnce(100).mockReturnValueOnce(100);

    const plan = planInstrumentContribution(
      assets,
      { equity: 300 }, // 100 (A, 1x) + 200 (B, 2x)
      300,
      200, // market total = 100 + 100
      { equity: 100 },
      100,
      1.0 // target leverage: as low as achievable
    );

    expect(plan.trades).toHaveLength(1);
    expect(plan.trades[0].ticker).toBe('A');
    expect(plan.trades[0].amount).toBeCloseTo(100, 1);
  });

  it('returns an empty plan when there are no held instruments', () => {
    const plan = planInstrumentContribution([], {}, 0, 0, { equity: 100 }, 500);
    expect(plan.trades).toEqual([]);
  });
});

describe('planInstrumentRebalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sells the overweight instrument and buys the underweight one, net-zero', () => {
    // Equity overweight (800/1000 vs 50% target), bonds underweight (200/1000 vs 50%),
    // both single-instrument, unleveraged classes — symmetric solution: sell 300 of VT,
    // buy 300 of BND, landing exactly on 500/500.
    const assets: Asset[] = [
      createMockAsset({ id: 'vt', ticker: 'VT', assetClass: 'equity' }),
      createMockAsset({ id: 'bnd', ticker: 'BND', assetClass: 'bonds' }),
    ];
    mockedCalculateAssetValue.mockReturnValueOnce(800).mockReturnValueOnce(200);

    const plan = planInstrumentRebalance(assets, { equity: 800, bonds: 200 }, 1000, 1000, {
      equity: 50,
      bonds: 50,
    });

    const vtTrade = plan.trades.find((t) => t.ticker === 'VT');
    const bndTrade = plan.trades.find((t) => t.ticker === 'BND');
    expect(vtTrade?.amount).toBeCloseTo(-300, 1);
    expect(bndTrade?.amount).toBeCloseTo(300, 1);
    expect(plan.resultingNotionalByAssetClass.equity).toBeCloseTo(500, 1);
    expect(plan.resultingNotionalByAssetClass.bonds).toBeCloseTo(500, 1);
  });

  it('never sells more than an instrument is currently worth (full liquidation caps exactly at holding)', () => {
    // Target pushes equity and bonds to 0% and commodity to 100% — the unconstrained
    // optimum wants to fully liquidate VT and SmallBond; the box constraint (can't sell
    // more than held) must cap each sell at exactly its own market value, never beyond.
    const assets: Asset[] = [
      createMockAsset({ id: 'vt', ticker: 'VT', assetClass: 'equity' }),
      createMockAsset({ id: 'bond', ticker: 'BOND', assetClass: 'bonds' }),
      createMockAsset({ id: 'gld', ticker: 'GLD', assetClass: 'commodity' }),
    ];
    mockedCalculateAssetValue.mockReturnValueOnce(50).mockReturnValueOnce(10).mockReturnValueOnce(940);

    const plan = planInstrumentRebalance(
      assets,
      { equity: 50, bonds: 10, commodity: 940 },
      1000,
      1000,
      { equity: 0, bonds: 0, commodity: 100 }
    );

    const vtTrade = plan.trades.find((t) => t.ticker === 'VT');
    const bondTrade = plan.trades.find((t) => t.ticker === 'BOND');
    const gldTrade = plan.trades.find((t) => t.ticker === 'GLD');
    expect(vtTrade?.amount).toBeCloseTo(-50, 1);
    expect(bondTrade?.amount).toBeCloseTo(-10, 1);
    expect(gldTrade?.amount).toBeCloseTo(60, 1);
  });

  it('returns an empty plan when there are no held instruments', () => {
    const plan = planInstrumentRebalance([], {}, 0, 0, { equity: 100 });
    expect(plan.trades).toEqual([]);
  });
});
