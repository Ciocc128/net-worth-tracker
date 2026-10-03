import { describe, expect, it, vi } from 'vitest';
import { getDefaultMonteCarloCorrelations, getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { buildPortfolioScenarios, portfolioCompoundReturn, realReturn, resolveFireAssumptions } from '@/lib/utils/fireAssumptions';
import { resolveMonteCarloMarket } from '@/lib/utils/monteCarloMarket';
import { buildDrawPlan, drawYear, portfolioReturn } from '@/lib/utils/monteCarloDraw';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import type { MonteCarloMarketScenario } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

const market = getDefaultMonteCarloMarket();
const correlations = getDefaultMonteCarloCorrelations();
const weights = (partial: Partial<Record<MonteCarloClass, number>>) => monteCarloClassRecord<number>((cls) => partial[cls] ?? 0);
const near = (actual: number, expected: number, tolerance = 1e-4) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
const cagr = (w: Partial<Record<MonteCarloClass, number>>, key: 'bear' | 'base' | 'bull', corr: readonly number[] | undefined = correlations, spread = 2) =>
  portfolioCompoundReturn(weights(w), market.scenarios[key], corr, spread).cagr;
const zeroVol = (scenario: MonteCarloMarketScenario): MonteCarloMarketScenario => ({
  ...scenario,
  classes: monteCarloClassRecord((cls) => ({ cagr: scenario.classes[cls].cagr, volatility: 0 })),
});

describe('portfolioCompoundReturn (RP1)', () => {
  it('A1: a single class at 100% returns exactly its CAGR in the three scenarios', () => {
    near(cagr({ equity: 100 }, 'bear'), 8.01);
    near(cagr({ equity: 100 }, 'base'), 10.02);
    near(cagr({ equity: 100 }, 'bull'), 12.19);
  });

  it('A2: at zero volatility the portfolio returns the weighted CAGR', () => {
    const result = portfolioCompoundReturn(weights({ equity: 60, bonds: 40 }), zeroVol(market.scenarios.base), correlations, 2);
    // 0,6 · 10,02 + 0,4 · 4,53 = 6,012 + 1,812
    near(result.cagr, 7.824);
    near(result.volatility, 0);
  });

  it('A3: 60/40 with the default correlations', () => {
    const w = { equity: 60, bonds: 40 };
    near(cagr(w, 'bear'), 5.9669);
    near(cagr(w, 'base'), 8.2623);
    near(cagr(w, 'bull'), 11.0855);
    const base = portfolioCompoundReturn(weights(w), market.scenarios.base, correlations, 2);
    near(base.arithmeticMean, 8.9313);
    near(base.volatility, 12.1288);
  });

  it('A4: with the identity matrix the 60/40 Base is 8,2697% (and no matrix means independent classes)', () => {
    const identity = new Array(21).fill(0);
    near(cagr({ equity: 60, bonds: 40 }, 'base', identity), 8.2697);
    near(portfolioCompoundReturn(weights({ equity: 60, bonds: 40 }), market.scenarios.base, undefined, 2).cagr, 8.2697);
  });

  it('A5: a five-class mix', () => {
    const w = { equity: 50, bonds: 20, gold: 10, cash: 10, trendFollowing: 10 };
    near(cagr(w, 'bear'), 6.078);
    near(cagr(w, 'base'), 8.5976);
    near(cagr(w, 'bull'), 11.4379);
  });

  it('A6: leverage 1,5× with a 2,0% spread', () => {
    const w = { equity: 90, bonds: 60 };
    near(cagr(w, 'bear'), 6.6383);
    near(cagr(w, 'base'), 9.2298);
    near(cagr(w, 'bull'), 12.6731);
  });

  it('A7: leverage at zero volatility', () => {
    const result = portfolioCompoundReturn(weights({ equity: 90, bonds: 60 }), zeroVol(market.scenarios.base), correlations, 2);
    // 0,9·10,02 + 0,6·4,53 − 0,5·(3,37 + 2,0) = 9,018 + 2,718 − 2,685
    near(result.cagr, 9.051);
  });

  it('A8: agrees with a correlated simulation of the same engine within 0,05 points', () => {
    const w = weights({ equity: 60, bonds: 40 });
    const plan = buildDrawPlan(market.scenarios.base, correlations);
    const random = createSeededRandom(20261003);
    const draws = 100_000;
    let sumLog = 0;
    for (let i = 0; i < draws; i++) sumLog += Math.log(1 + portfolioReturn(MONTE_CARLO_CLASSES.map((cls) => w[cls]), drawYear(plan, random), 2));
    const simulated = (Math.exp(sumLog / draws) - 1) * 100;
    expect(Math.abs(simulated - cagr({ equity: 60, bonds: 40 }, 'base'))).toBeLessThan(0.05);
  });

  it('a portfolio without weights has no positive mean and says so instead of NaN', () => {
    const result = portfolioCompoundReturn(weights({}), market.scenarios.base, correlations, 2);
    expect(Number.isFinite(result.cagr)).toBe(true);
  });
});

describe('realReturn (RP2)', () => {
  it('A9: Fisher, not the subtraction', () => {
    near(realReturn(7, 3.04), 3.8432);
    expect(realReturn(7, 3.04)).not.toBeCloseTo(3.96, 2);
  });

  it('A10: the real return of the 60/40 scenarios', () => {
    const scenarios = buildPortfolioScenarios(weights({ equity: 60, bonds: 40 }), resolveMonteCarloMarket(null));
    near(scenarios.bear.realReturnRate, 2.8406);
    near(scenarios.base.realReturnRate, 5.0682);
    near(scenarios.bull.realReturnRate, 7.8081);
    expect(scenarios.base.inflationRate).toBe(3.04);
    near(scenarios.base.growthRate, 8.2623);
  });
});

describe('resolveFireAssumptions (RP4)', () => {
  it('with no assets it declares the 60/40 default', () => {
    const result = resolveFireAssumptions({ settings: null, assets: [] });
    expect(result.weightsOrigin).toBe('default');
    expect(result.weights.equity).toBe(60);
    expect(result.leverage).toBe(1);
    near(result.scenarios.base.growthRate, 8.2623);
  });
});
