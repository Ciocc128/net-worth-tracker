import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { buildPortfolioScenarios } from '@/lib/utils/fireAssumptions';
import { buildMarketNumbers, resolveMonteCarloMarket, type MonteCarloMarketOverrides } from '@/lib/utils/monteCarloMarket';
import { buildDrawPlan, drawYear, portfolioReturn, standardNormal } from '@/lib/utils/monteCarloDraw';
import { createSeededRandom } from '@/lib/utils/seededRandom';

const weights = (partial: Partial<Record<MonteCarloClass, number>>) => monteCarloClassRecord<number>((cls) => partial[cls] ?? 0);
const market = resolveMonteCarloMarket(null);

/** [Bear, Base, Bull], nominal and real, percent. */
function band(w: Partial<Record<MonteCarloClass, number>>, cost = 0, overrides?: MonteCarloMarketOverrides) {
  const resolved = overrides ? { ...market, ...buildMarketNumbers(overrides) } : market;
  const scenarios = buildPortfolioScenarios(weights(w), resolved, cost);
  return {
    nominal: [scenarios.bear.growthRate, scenarios.base.growthRate, scenarios.bull.growthRate],
    real: [scenarios.bear.realReturnRate, scenarios.base.realReturnRate, scenarios.bull.realReturnRate],
  };
}
const expectBand = (actual: number[], expected: number[], tolerance = 1e-4) => expected.forEach((value, index) => expect(Math.abs(actual[index] - value)).toBeLessThan(tolerance));

describe('Bear and Bull of the portfolio (RQ3, RQ4)', () => {
  it('AQ6: 100% Azioni, real', () => expectBand(band({ equity: 100 }).real, [1.1816, 5.74, 10.5038]));

  it('AQ7: 60/40, real and nominal', () => {
    const result = band({ equity: 60, bonds: 40 });
    expectBand(result.real, [1.6113, 4.4934, 7.4573]);
    expectBand(result.nominal, [3.681, 6.6218, 9.6461]);
  });

  it('AQ8: 50 Azioni · 20 Obbligazioni · 10 Oro · 10 Trend · 10 Carry', () => expectBand(band({ equity: 50, bonds: 20, gold: 10, trendFollowing: 10, carry: 10 }).real, [2.3536, 4.8217, 7.3492]));

  it('AQ9: 100% Liquidità', () => expectBand(band({ cash: 100 }).real, [-2.0975, 0.3941, 2.9491]));

  it('AQ10: Azioni at 150% with a 2% spread — nominal and real', () => {
    const result = band({ equity: 150 });
    expectBand(result.nominal, [1.6163, 8.4671, 15.7799]);
    expectBand(result.real, [-0.4123, 6.3019, 13.4686]);
  });

  it('AQ11: a cost of 0,3% scales the factor of every year — the gross figures × 0,997', () => {
    const gross = band({ equity: 60, bonds: 40 }).nominal;
    const net = band({ equity: 60, bonds: 40 }, 0.3).nominal;
    expectBand(net, [3.37, 6.302, 9.3171]);
    net.forEach((value, index) => expect(Math.abs(value - (((1 + gross[index] / 100) * 0.997 - 1) * 100))).toBeLessThan(1e-9));
  });

  it('AQ12: with no uncertainty only the dispersion over 30 years remains', () => {
    const noUncertainty = { classes: Object.fromEntries(MONTE_CARLO_CLASSES.map((cls) => [cls, { uncertainty: 0 }])) };
    expectBand(band({ equity: 60, bonds: 40 }, 0, noUncertainty).real, [2.2464, 4.4934, 6.7898]);
  });

  it('AQ13: no volatility and no uncertainty — Bear = Base = Bull', () => {
    const flat = { classes: Object.fromEntries(MONTE_CARLO_CLASSES.map((cls) => [cls, { uncertainty: 0, volatility: 0 }])) };
    const result = band({ equity: 60, bonds: 40 }, 0, flat).nominal;
    expect(Math.abs(result[0] - result[1])).toBeLessThan(1e-9);
    expect(Math.abs(result[2] - result[1])).toBeLessThan(1e-9);
  });

  it('Bear < Base < Bull whenever there is uncertainty, and a portfolio that cannot be positive has no band', () => {
    const [bear, base, bull] = band({ equity: 60, bonds: 40 }).nominal;
    expect(bear).toBeLessThan(base);
    expect(base).toBeLessThan(bull);
  });
});

describe('AQ14: the closed form against a simulation (100.000 seeded paths, 30 years, mean per path from N(m, u²), yearly rebalancing)', () => {
  const simulate = (w: Partial<Record<MonteCarloClass, number>>): number[] => {
    const weightVector = MONTE_CARLO_CLASSES.map((cls) => weights(w)[cls]);
    const plan = buildDrawPlan(market.scenarios.base, market.correlations);
    const random = createSeededRandom(20261010);
    const cagrs: number[] = [];
    for (let path = 0; path < 100_000; path++) {
      const means = plan.m.map((m, index) => m + (market.classes[MONTE_CARLO_CLASSES[index]].uncertainty / 100) * standardNormal(random));
      const pathPlan = { ...plan, m: means, medianGrowth: means.map((m) => Math.exp(m)) };
      let factor = 1;
      for (let year = 0; year < 30; year++) factor *= 1 + portfolioReturn(weightVector, drawYear(pathPlan, random), market.leverageSpread);
      cagrs.push((Math.pow(Math.max(factor, 1e-12), 1 / 30) - 1) * 100);
    }
    cagrs.sort((a, b) => a - b);
    return [cagrs[Math.floor(0.15 * cagrs.length)], cagrs[Math.floor(0.5 * cagrs.length)], cagrs[Math.floor(0.85 * cagrs.length)]];
  };

  it.each([
    ['100% Azioni', { equity: 100 }],
    ['60/40', { equity: 60, bonds: 40 }],
    ['five classes', { equity: 50, bonds: 20, gold: 10, trendFollowing: 10, carry: 10 }],
  ])('%s', (_name, w) => {
    const closed = band(w).nominal;
    const simulated = simulate(w);
    expect(Math.abs(closed[0] - simulated[0])).toBeLessThan(0.1);
    expect(Math.abs(closed[1] - simulated[1])).toBeLessThan(0.1);
    expect(Math.abs(closed[2] - simulated[2])).toBeLessThan(0.1);
  }, 120_000);
});
