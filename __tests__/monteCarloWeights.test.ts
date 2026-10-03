/**
 * `monteCarloWeights` — rule R6 (doc/montecarlo/README.md § 1.5, § 7.5): the weights the Monte Carlo
 * simulates with, seeded from the effective targets of Allocazione or from the notional held today.
 * `expandAssetExposure` reads `calculateAssetValue` from assetService, which loads the client Firebase
 * SDK: mocked out as in `assetExposure.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationTarget, AssetClass, AssetComposition } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { seedWeightsFromTargets, weightsFromHoldings } from '@/lib/utils/monteCarloWeights';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';

const weights = (named: Partial<Record<string, number>>) => monteCarloClassRecord((cls) => named[cls] ?? 0);

function asset(id: string, assetClass: AssetClass, value: number, extra: Partial<Asset> = {}): Asset {
  return { id, name: id, type: 'etf', assetClass, currency: 'EUR', currentPrice: value, quantity: 1, ...extra } as Asset;
}

const targets = (named: Record<string, number>): AssetAllocationTarget => Object.fromEntries(Object.entries(named).map(([cls, targetPercentage]) => [cls, { targetPercentage }]));

describe('seedWeightsFromTargets (R6)', () => {
  it('targets 90/60 on a 200.000 € portfolio seed weights summing to 150: leverage 1,5×', () => {
    const seed = seedWeightsFromTargets(targets({ equity: 90, bonds: 60 }), [asset('e', 'equity', 100_000), asset('b', 'bonds', 100_000)]);
    expect(seed?.weights).toEqual(weights({ equity: 90, bonds: 60 }));
    expect(seed?.leverage).toBeCloseTo(1.5, 10);
  });

  it('targets summing to 100 give the integer weights the unleveraged seed always had (A7: 50/50)', () => {
    const seed = seedWeightsFromTargets(targets({ equity: 50, cash: 50 }), [asset('e', 'equity', 100_000), asset('c', 'cash', 100_000, { type: 'cash' })]);
    expect(seed?.weights).toEqual(weights({ equity: 50, cash: 50 }));
    expect(seed?.leverage).toBe(1);
  });

  it('a fixed-amount cash target enters as its amount, not as a percentage', () => {
    const cash = { targetPercentage: 5, useFixedAmount: true, fixedAmount: 20_000 };
    const seed = seedWeightsFromTargets({ equity: { targetPercentage: 100 }, cash }, [asset('e', 'equity', 100_000), asset('c', 'cash', 100_000, { type: 'cash' })]);
    // equity 100% of the 200.000 € base, cash 20.000 € / 200.000 € = 10%: a 1,1× portfolio.
    expect(seed?.weights).toEqual(weights({ equity: 100, cash: 10 }));
    expect(seed?.leverage).toBeCloseTo(1.1, 10);
  });

  it('an asset kept out of the allocation is inside the capital: its notional is added to its class', () => {
    const seed = seedWeightsFromTargets(targets({ equity: 50, bonds: 50 }), [asset('e', 'equity', 100_000), asset('x', 'equity', 50_000, { allocationRole: 'excluded' })]);
    // B = 100.000 €, E_equity = 50.000 €, K = 150.000 €: equity (50.000 + 50.000) / 150.000, bonds 50.000 / 150.000.
    expect(seed?.weights).toEqual(weights({ equity: 67, bonds: 33 }));
  });

  it('a pension fund the lock keeps closed is outside K and outside the base', () => {
    const fund = asset('p', 'bonds', 100_000, { type: 'pensionFund' });
    const seed = seedWeightsFromTargets(targets({ equity: 90, bonds: 60 }), [asset('e', 'equity', 100_000), fund], { lockedAssetIds: new Set(['p']) });
    // K = B = 100.000 € of equity: 90 + 60 = 150% of it.
    expect(seed?.weights).toEqual(weights({ equity: 90, bonds: 60 }));
  });

  it('the crypto and real-estate targets take no weight: the modelled targets are rescaled', () => {
    const seed = seedWeightsFromTargets(targets({ equity: 60, bonds: 35, crypto: 5 }), [asset('e', 'equity', 60_000), asset('b', 'bonds', 35_000), asset('c', 'crypto', 5_000, { type: 'crypto' })]);
    // 60 / 0,95 = 63,16 and 35 / 0,95 = 36,84 → 63 / 37, leverage 1.
    expect(seed?.weights).toEqual(weights({ equity: 63, bonds: 37 }));
    expect(seed?.leverage).toBe(1);
  });

  it('splits the commodity target between Oro and Materie prime by the sub-targets when they are configured', () => {
    const commodity = { targetPercentage: 20, subCategoryConfig: { enabled: true, categories: ['Gold', 'Other'] }, subTargets: { Gold: 15, Other: 5 } };
    const seed = seedWeightsFromTargets({ equity: { targetPercentage: 80 }, commodity }, [asset('e', 'equity', 80_000), asset('g', 'commodity', 20_000, { subCategory: 'Other' })], { goldSubCategory: 'Gold' });
    expect(seed?.weights).toEqual(weights({ equity: 80, gold: 15, commodity: 5 }));
  });

  it('without sub-targets the commodity target splits like the gold held today, and all goes to Materie prime with no gold named', () => {
    const assets = [asset('e', 'equity', 80_000), asset('g', 'commodity', 15_000, { subCategory: 'Gold' }), asset('o', 'commodity', 5_000, { subCategory: 'Other' })];
    const seed = seedWeightsFromTargets(targets({ equity: 80, commodity: 20 }), assets, { goldSubCategory: 'Gold' });
    expect(seed?.weights).toEqual(weights({ equity: 80, gold: 15, commodity: 5 }));
    const none = seedWeightsFromTargets(targets({ equity: 80, commodity: 20 }), assets, { goldSubCategory: null });
    expect(none?.weights).toEqual(weights({ equity: 80, commodity: 20 }));
  });

  it('is null without targets on the modelled classes, and for an empty capital', () => {
    expect(seedWeightsFromTargets(null, [asset('e', 'equity', 1)])).toBeNull();
    expect(seedWeightsFromTargets(targets({ equity: 0, bonds: 0 }), [asset('e', 'equity', 1_000)])).toBeNull();
    expect(seedWeightsFromTargets(targets({ equity: 100 }), [])).toBeNull();
  });
});

describe('weightsFromHoldings (R6, «Importa il portafoglio di oggi»)', () => {
  it('a 2x ETF of 10.000 € on 100% equity holds 20.000 € of notional: weights 100 / 50, leverage 1,5×', () => {
    const seed = weightsFromHoldings([asset('l', 'equity', 10_000, { leverageRatio: 2 }), asset('c', 'cash', 10_000, { type: 'cash' })]);
    expect(seed?.weights).toEqual(weights({ equity: 100, cash: 50 }));
    expect(seed?.leverage).toBeCloseTo(1.5, 10);
  });

  it('an unleveraged portfolio gives the integer weights summing to 100', () => {
    const seed = weightsFromHoldings([asset('e', 'equity', 60_000), asset('b', 'bonds', 40_000)]);
    expect(seed?.weights).toEqual(weights({ equity: 60, bonds: 40 }));
    expect(seed?.leverage).toBe(1);
  });

  it('leaves real estate, crypto and a composite\'s outside legs out of K', () => {
    const composition: AssetComposition[] = [
      { assetClass: 'equity', percentage: 50 },
      { assetClass: 'realestate', percentage: 50 },
    ];
    const seed = weightsFromHoldings([asset('c', 'equity', 100_000, { composition }), asset('x', 'crypto', 9_000, { type: 'crypto' })]);
    expect(seed?.weights).toEqual(weights({ equity: 100 }));
  });

  it('keeps a locked pension fund out, and is null when nothing is left', () => {
    const fund = asset('p', 'bonds', 100_000, { type: 'pensionFund' });
    expect(weightsFromHoldings([fund], { lockedAssetIds: new Set(['p']) })).toBeNull();
  });
});
