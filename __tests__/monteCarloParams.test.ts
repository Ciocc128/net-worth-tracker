import { describe, it, expect } from 'vitest';

import { computeSimulatedCapital, deriveMonteCarloWeights } from '@/lib/utils/monteCarloParams';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import type { Asset, AssetClass, AssetComposition } from '@/types/assets';

/**
 * `deriveMonteCarloWeights` is the ONE normalizer the Monte Carlo tab and the FIRE Ventaglio call
 * (doc/montecarlo/README.md § 5.2): the rule of the four-class version, extended to seven:
 *   - percentages rounded per class, classes sorted descending by value, the rounding residual
 *     on the SMALLEST class so the total is exactly 100;
 *   - a portfolio with no value in the seven classes yields null («keep what you had»).
 * `computeSimulatedCapital` is rules RK and RG.
 */

const weights = (named: Partial<Record<keyof ReturnType<typeof monteCarloClassRecord<number>>, number>>) => monteCarloClassRecord((cls) => named[cls] ?? 0);

function asset(id: string, assetClass: AssetClass, value: number, extra: Partial<Asset> = {}): Asset {
  return { id, name: id, type: 'etf', assetClass, currentPrice: value, quantity: 1, ...extra } as Asset;
}
const valueOf = (a: Asset) => a.currentPrice * a.quantity;

describe('deriveMonteCarloWeights', () => {
  it('normalizes a two-class portfolio to percentages summing to 100', () => {
    expect(deriveMonteCarloWeights({ equity: 60_000, bonds: 40_000 })).toEqual(weights({ equity: 60, bonds: 40 }));
  });

  it('A7: 100.000 € azioni + 100.000 € liquidità seed 50/50 (the cash used to be outside)', () => {
    expect(deriveMonteCarloWeights({ equity: 100_000, cash: 100_000 })).toEqual(weights({ equity: 50, cash: 50 }));
  });

  it('reads Oro, Trend and Carry as classes of their own', () => {
    expect(deriveMonteCarloWeights({ equity: 50_000, gold: 20_000, commodity: 10_000, trendFollowing: 10_000, carry: 10_000 })).toEqual(
      weights({ equity: 50, gold: 20, commodity: 10, trendFollowing: 10, carry: 10 }),
    );
  });

  it('always sums to exactly 100: the rounding residual lands on the smallest class', () => {
    // 30,4 / 30,4 / 10,4 / 10,4 / 6,8 / 6,8 / 5,2 round to 30+30+10+10+7+7 = 94 → the smallest class closes at 6, not at its rounded 5.
    const result = deriveMonteCarloWeights({ equity: 304, bonds: 304, gold: 104, commodity: 104, cash: 68, trendFollowing: 68, carry: 52 });
    expect(result).toEqual(weights({ equity: 30, bonds: 30, gold: 10, commodity: 10, cash: 7, trendFollowing: 7, carry: 6 }));
  });

  it('the residual may land on a class at zero value, as the four-class rule did', () => {
    // Thirds: 33+33+33 = 99, the hundredth point goes to the smallest class — a zero one, the last in model order.
    const result = deriveMonteCarloWeights({ equity: 1, bonds: 1, commodity: 1 })!;
    expect(Object.values(result).reduce((sum, pct) => sum + pct, 0)).toBe(100);
    expect(result.carry).toBe(1);
  });

  it('never makes a class negative when many small classes round up', () => {
    const result = deriveMonteCarloWeights({ equity: 970, bonds: 5, gold: 5, commodity: 5, cash: 5, trendFollowing: 5, carry: 5 })!;
    expect(Object.values(result).every((pct) => pct >= 0)).toBe(true);
    expect(Object.values(result).reduce((sum, pct) => sum + pct, 0)).toBe(100);
  });

  it('returns null when the seven classes hold no value, and ignores negatives', () => {
    expect(deriveMonteCarloWeights({})).toBeNull();
    expect(deriveMonteCarloWeights({ equity: 0, bonds: -50 })).toBeNull();
  });
});

describe('computeSimulatedCapital', () => {
  it('A7b: realestate and crypto stay out of K and are reported', () => {
    const capital = computeSimulatedCapital(
      [asset('a', 'equity', 100_000), asset('b', 'cash', 100_000, { type: 'cash' }), asset('c', 'realestate', 250_000, { type: 'realestate' }), asset('d', 'crypto', 5_000, { type: 'crypto' })],
      valueOf,
    );
    expect(capital.total).toBe(200_000);
    expect(deriveMonteCarloWeights(capital.byClass)).toEqual(weights({ equity: 50, cash: 50 }));
    expect(capital.excluded).toEqual({ realestate: 250_000, crypto: 5_000 });
  });

  it('A7c: the sub-category named as Oro splits the commodity class', () => {
    const assets = [asset('g', 'commodity', 20_000, { subCategory: 'Gold' }), asset('o', 'commodity', 10_000, { subCategory: 'Other Commodities' })];
    const withGold = computeSimulatedCapital(assets, valueOf, { goldSubCategory: 'Gold' });
    expect(withGold.byClass.gold).toBe(20_000);
    expect(withGold.byClass.commodity).toBe(10_000);
    const without = computeSimulatedCapital(assets, valueOf, { goldSubCategory: null });
    expect(without.byClass.gold).toBe(0);
    expect(without.byClass.commodity).toBe(30_000);
  });

  it('takes Trend and Carry from the legs of a composite, and leaves the real-estate leg out', () => {
    const composition: AssetComposition[] = [
      { assetClass: 'equity', percentage: 50 },
      { assetClass: 'trendFollowing', percentage: 20 },
      { assetClass: 'carry', percentage: 10 },
      { assetClass: 'realestate', percentage: 20 },
    ];
    const capital = computeSimulatedCapital([asset('etf', 'equity', 100_000, { composition })], valueOf);
    expect(capital.byClass.equity).toBe(50_000);
    expect(capital.byClass.trendFollowing).toBe(20_000);
    expect(capital.byClass.carry).toBe(10_000);
    expect(capital.excluded.realestate).toBe(20_000);
    expect(capital.total).toBe(80_000);
  });

  it('a gold leg of a composite is Oro through the leg\'s own sub-category', () => {
    const composition: AssetComposition[] = [
      { assetClass: 'commodity', percentage: 40, subCategory: 'Gold' },
      { assetClass: 'equity', percentage: 60 },
    ];
    const capital = computeSimulatedCapital([asset('mix', 'equity', 10_000, { composition })], valueOf, { goldSubCategory: 'Gold' });
    expect(capital.byClass.gold).toBe(4_000);
    expect(capital.byClass.equity).toBe(6_000);
  });

  it('keeps a closed pension fund out of K', () => {
    const capital = computeSimulatedCapital([asset('p', 'equity', 31_400, { type: 'pensionFund' }), asset('a', 'equity', 100_000)], valueOf, { lockedAssetIds: new Set(['p']) });
    expect(capital.total).toBe(100_000);
  });

  it('counts as liquid what calculateLiquidNetWorth counts: the explicit flag, else the type rule', () => {
    const capital = computeSimulatedCapital(
      [asset('a', 'equity', 100_000), asset('b', 'equity', 40_000, { isLiquid: false }), asset('p', 'equity', 10_000, { type: 'pensionFund' })],
      valueOf,
    );
    expect(capital.total).toBe(150_000);
    expect(capital.liquid).toBe(100_000);
  });
});
