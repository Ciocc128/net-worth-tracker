import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { portfolioCost, resolveClassCosts } from '@/lib/utils/fireCosts';
import type { Asset, AssetClass } from '@/types/assets';

const near = (actual: number, expected: number, tolerance = 1e-4) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
const weights = (partial: Partial<Record<MonteCarloClass, number>>) => monteCarloClassRecord<number>((cls) => partial[cls] ?? 0);

function asset(id: string, assetClass: AssetClass, value: number, extra: Partial<Asset> = {}): Asset {
  return { id, name: id, type: 'etf', assetClass, currentPrice: value, quantity: 1, ...extra } as Asset;
}

const ON = { stampDutyEnabled: true, stampDutyRate: 0.2, checkingAccountSubCategory: 'Conto corrente' };
const OFF = { ...ON, stampDutyEnabled: false };

/** The test portfolio P of doc/fire-ipotesi § 9.9. */
const P = [
  asset('azionario', 'equity', 100_000, { totalExpenseRatio: 0.2 }),
  asset('obbligazionario', 'bonds', 50_000, { totalExpenseRatio: 0.1 }),
  asset('corrente', 'cash', 20_000, { type: 'cash', subCategory: 'Conto corrente' }),
  asset('deposito', 'cash', 10_000, { type: 'cash', subCategory: 'Conto deposito' }),
];

describe('resolveClassCosts (RC1, RC2)', () => {
  it('C1: TER plus duty per class; the checking account is in the denominator, not in the duty', () => {
    const { byClass } = resolveClassCosts(P, ON);
    near(byClass.equity.total, 0.4);
    near(byClass.bonds.total, 0.3);
    near(byClass.cash.ter, 0);
    near(byClass.cash.stampDuty, 0.2 / 3, 1e-6);
    near(byClass.cash.total, 0.066667, 1e-6);
  });

  it('C2: a class with no instrument takes the average TER of K and the full duty', () => {
    const { byClass } = resolveClassCosts(P, ON);
    expect(byClass.gold.held).toBe(false);
    near(byClass.gold.ter, 25_000 / 180_000 * 1, 1e-6); // (100000·0,20 + 50000·0,10) / 180000
    near(byClass.gold.total, 0.338889, 1e-6);
  });

  it('C5: with the duty off only the TER is left', () => {
    const costs = resolveClassCosts(P, OFF);
    expect(costs.stampDutyEnabled).toBe(false);
    near(costs.byClass.equity.total, 0.2);
    near(costs.byClass.cash.total, 0);
    expect(costs.anyTer).toBe(true);
  });

  it('C7: a trend-following fund pays the duty only (its default return is already net of the TER)', () => {
    const costs = resolveClassCosts([asset('dbmf', 'trendFollowing', 20_000, { totalExpenseRatio: 0.85 })], ON);
    near(costs.byClass.trendFollowing.total, 0.2);
    near(costs.byClass.trendFollowing.ter, 0);
    expect(costs.anyTer).toBe(false);
  });

  it('an empty K: no TER, the full duty when on (the 60/40 fallback weights meet it)', () => {
    const costs = resolveClassCosts([], ON);
    near(costs.byClass.equity.total, 0.2);
    near(portfolioCost(weights({ equity: 60, bonds: 40 }), costs).total, 0.2);
    near(resolveClassCosts([], OFF).byClass.equity.total, 0);
  });

  it('an exempt instrument stays out of the duty, in the denominator', () => {
    const costs = resolveClassCosts([asset('a', 'equity', 100_000), asset('b', 'equity', 100_000, { stampDutyExempt: true })], ON);
    near(costs.byClass.equity.stampDuty, 0.1);
  });

  it('a composite is read leg by leg, weighted on the market value', () => {
    const composite = asset('mix', 'equity', 100_000, {
      totalExpenseRatio: 0.3,
      composition: [
        { assetClass: 'equity', percentage: 60 },
        { assetClass: 'bonds', percentage: 40 },
      ],
    } as Partial<Asset>);
    const costs = resolveClassCosts([composite, asset('bond', 'bonds', 60_000, { totalExpenseRatio: 0.1 })], OFF);
    near(costs.byClass.equity.ter, 0.3);
    // bonds: 40.000 at 0,30 and 60.000 at 0,10 → 0,18
    near(costs.byClass.bonds.ter, 0.18);
  });

  it('a leveraged ETF is weighted on its market value, not its notional', () => {
    const costs = resolveClassCosts([asset('x2', 'equity', 10_000, { totalExpenseRatio: 0.6, leverageRatio: 2 }), asset('plain', 'equity', 10_000, { totalExpenseRatio: 0.2 })], OFF);
    near(costs.byClass.equity.ter, 0.4);
  });

  it('a locked pension fund and a sold instrument are not in K', () => {
    const costs = resolveClassCosts([asset('fund', 'equity', 90_000, { totalExpenseRatio: 2 }), asset('sold', 'equity', 1_000, { totalExpenseRatio: 2, quantity: 0 }), asset('etf', 'equity', 10_000, { totalExpenseRatio: 0.2 })], OFF, {
      lockedAssetIds: new Set(['fund']),
    });
    near(costs.byClass.equity.ter, 0.2);
  });
});

describe('portfolioCost (RC3)', () => {
  const costs = resolveClassCosts(P, ON);

  it('C3: 60/40 costs 0,36% (TER 0,16%, duty 0,20%)', () => {
    const cost = portfolioCost(weights({ equity: 60, bonds: 40 }), costs);
    near(cost.total, 0.36);
    near(cost.ter, 0.16);
    near(cost.stampDuty, 0.2);
  });

  it('C6: leverage does not multiply the costs (the weights are brought back to 100)', () => {
    near(portfolioCost(weights({ equity: 90, bonds: 60 }), costs).total, 0.36);
  });

  it('C10: an 80/20 allocation costs 0,38%', () => {
    near(portfolioCost(weights({ equity: 80, bonds: 20 }), costs).total, 0.38);
  });

  it('no costs or no weights cost nothing', () => {
    expect(portfolioCost(weights({ equity: 60, bonds: 40 }), null).total).toBe(0);
    expect(portfolioCost(weights({}), costs).total).toBe(0);
  });
});
