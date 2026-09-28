/**
 * lib/utils/allocationComparison.ts — the pieces the periodic email needs beyond
 * `compareAllocations` itself (covered by __tests__/compareAllocations.test.ts through the
 * service's re-export): the effective targets and the assets as they stood in a snapshot.
 *
 * `calculateAssetValue` lives in assetService, which pulls in the client Firebase SDK at load.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationTarget, MonthlySnapshot } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

import { assetsAtSnapshot, compareAllocations, getDefaultTargets, resolveEffectiveTargets } from '@/lib/utils/allocationComparison';
import * as service from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'VWCE',
    name: 'Asset',
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

type Row = MonthlySnapshot['byAsset'][number];
const row = (overrides: Partial<Row>): Row => ({ assetId: 'a1', ticker: 'X', name: 'X', quantity: 1, price: 1, totalValue: 1, ...overrides });

describe('allocationComparison — the service re-exports the one definition', () => {
  it('re-exports the same functions, not copies', () => {
    expect(service.compareAllocations).toBe(compareAllocations);
    expect(service.getDefaultTargets).toBe(getDefaultTargets);
    expect(service.resolveEffectiveTargets).toBe(resolveEffectiveTargets);
  });
});

describe('assetsAtSnapshot', () => {
  it('values each asset at the snapshot total, whatever its currency today', () => {
    const usd = makeAsset({ id: 'usd', currency: 'USD', currentPrice: 200, currentPriceEur: 180, quantity: 50 });
    const { assets } = assetsAtSnapshot([usd], [row({ assetId: 'usd', quantity: 40, price: 190, totalValue: 7000 })]);
    expect(assets).toHaveLength(1);
    expect(assets[0].quantity).toBe(40);
    expect(calculateAssetValue(assets[0])).toBeCloseTo(7000, 8);
  });

  it('keeps today’s metadata: role, composition, leverage', () => {
    const composite = makeAsset({ id: 'c', allocationRole: 'frozen', leverageRatio: 2, composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }] });
    const { assets } = assetsAtSnapshot([composite], [row({ assetId: 'c', quantity: 2, totalValue: 500 })]);
    expect(assets[0]).toMatchObject({ allocationRole: 'frozen', leverageRatio: 2, composition: composite.composition });
  });

  it('reads a property net of its debt AT THE SNAPSHOT, not today’s', () => {
    const house = makeAsset({ id: 'h', type: 'realestate', assetClass: 'realestate', currentPrice: 300000, outstandingDebt: 90000 });
    const { assets } = assetsAtSnapshot([house], [row({ assetId: 'h', quantity: 1, price: 250000, totalValue: 150000 })]);
    expect(assets[0].outstandingDebt).toBe(100000);
    expect(calculateAssetValue(assets[0])).toBe(150000);
  });

  it('drops a closed position and an asset not held then; declares a row whose asset is gone', () => {
    const held = makeAsset({ id: 'a1' });
    const notYet = makeAsset({ id: 'later' });
    const { assets, unmatched } = assetsAtSnapshot(
      [held, notYet],
      [row({ assetId: 'a1', quantity: 0, totalValue: 0 }), row({ assetId: 'deleted', name: 'Vecchio fondo', quantity: 3, totalValue: 900 })]
    );
    expect(assets).toEqual([]);
    expect(unmatched).toEqual([{ name: 'Vecchio fondo', totalValue: 900 }]);
  });

  it('measures the snapshot through compareAllocations with today’s roles (excluded out of the base)', () => {
    const etf = makeAsset({ id: 'etf' });
    const bond = makeAsset({ id: 'bond', assetClass: 'bonds' });
    const house = makeAsset({ id: 'h', type: 'realestate', assetClass: 'realestate', allocationRole: 'excluded' });
    const { assets } = assetsAtSnapshot([etf, bond, house], [
      row({ assetId: 'etf', quantity: 10, totalValue: 7000 }),
      row({ assetId: 'bond', quantity: 1, totalValue: 3000 }),
      row({ assetId: 'h', quantity: 1, price: 200000, totalValue: 200000 }),
    ]);
    const result = compareAllocations(assets, { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 } });
    expect(result.marketValue).toBe(10000);
    expect(result.byAssetClass.equity.currentPercentage).toBeCloseTo(70, 8);
  });
});

describe('resolveEffectiveTargets', () => {
  const manual: AssetAllocationTarget = { equity: { targetPercentage: 80, subTargets: { USA: 60 } }, bonds: { targetPercentage: 20 } };

  it('uses the manual targets when goal-driven allocation is off', () => {
    expect(resolveEffectiveTargets({ settings: { targets: manual }, goalData: null, assets: [] })).toEqual({ targets: manual, fromGoals: false });
  });

  it('falls back to the defaults without any target', () => {
    expect(resolveEffectiveTargets({ settings: null, goalData: null, assets: [] })).toEqual({ targets: getDefaultTargets(), fromGoals: false });
  });

  it('keeps the manual targets when the goal switch is on but there are no goals', () => {
    const settings = { targets: manual, goalBasedInvestingEnabled: true, goalDrivenAllocationEnabled: true };
    expect(resolveEffectiveTargets({ settings, goalData: { goals: [], assignments: [] }, assets: [] }).fromGoals).toBe(false);
  });
});
