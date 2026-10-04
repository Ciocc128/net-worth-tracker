import { describe, expect, it, vi } from 'vitest';
import { getDefaultMonteCarloCorrelations, getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { buildPortfolioScenarios, portfolioCompoundReturn, realReturn, resolveFireAssumptions, resolveFireCapital, resolvePlanExpenses } from '@/lib/utils/fireAssumptions';
import { describeFireAssumptions } from '@/lib/utils/fireAssumptionsNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import { calculateFIREProjection } from '@/lib/services/fireService';
import { runAccumulationSimulation } from '@/lib/services/monteCarloService';
import type { Asset, AssetClass } from '@/types/assets';
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


// ─── L2: capital, expenses, savings (doc/fire-ipotesi/README.md D4, D5, D6) ──────────────────

function asset(id: string, assetClass: AssetClass, value: number, extra: Partial<Asset> = {}): Asset {
  return { id, name: id, type: 'etf', assetClass, currentPrice: value, quantity: 1, ...extra } as Asset;
}
const valueOf = (a: Asset) => a.currentPrice * a.quantity;
const text = (input: Parameters<typeof resolveFireAssumptions>[0]) => narrativeToText(describeFireAssumptions(resolveFireAssumptions(input))).replace(/\u00a0/g, ' ');

describe('resolveFireCapital (RP5, A12)', () => {
  const portfolio = [asset('etf', 'equity', 300_000), asset('btc', 'crypto', 50_000), asset('casa2', 'realestate', 200_000)];

  it('A12: the capital is the seven classes; crypto and real estate are declared outside', () => {
    const capital = resolveFireCapital(portfolio, valueOf, {});
    expect(capital.total).toBe(300_000);
    expect(capital.outside).toEqual({ realestate: 200_000, crypto: 50_000 });
  });

  it('A12: the line says it, Immobili first', () => {
    const line = text({ settings: null, assets: portfolio, assetValue: valueOf });
    expect(line).toContain(' · capitale 300.000 € (fuori: Immobili 200.000 €, Crypto 50.000 €)');
  });

  it('a closed pension fund is not capital', () => {
    const capital = resolveFireCapital([...portfolio, asset('fund', 'equity', 40_000)], valueOf, { lockedAssetIds: new Set(['fund']) });
    expect(capital.total).toBe(300_000);
  });

  it('the cost basis is the one behind K: real estate and crypto stay out of it, a composite counts for its share', () => {
    const withBasis = (id: string, assetClass: AssetClass, value: number, basis: number, extra: Partial<Asset> = {}) =>
      asset(id, assetClass, value, { averageCost: basis, ...extra });
    const plain = resolveFireCapital([withBasis('etf', 'equity', 100_000, 60_000)], valueOf, {}).taxProfile;
    const mixed = resolveFireCapital([withBasis('etf', 'equity', 100_000, 60_000), withBasis('btc', 'crypto', 50_000, 10_000)], valueOf, {}).taxProfile;
    expect(plain).not.toBeNull();
    // The crypto position (value 50.000, basis 10.000) is not in K, so it moves neither the basis nor the gain share.
    expect(mixed?.basisToday).toBeCloseTo(plain!.basisToday, 6);
    expect(mixed?.gainShare).toBeCloseTo(plain!.gainShare, 6);
  });

  it('no assets, no capital (the line carries none)', () => {
    expect(resolveFireAssumptions({ settings: null, assets: [] }).capital).toBeUndefined();
    expect(resolveFireAssumptions({ settings: null, assets: [], assetValue: valueOf }).capital?.total).toBe(0);
  });
});

describe('resolvePlanExpenses (RP6, A13)', () => {
  const cashflow = { annualExpensesFromCashflow: 31_500, referenceYear: 2025, isAnnualized: false };

  it('A13: planned expenses win, said «da Impostazioni»', () => {
    expect(resolvePlanExpenses({ plannedAnnualExpenses: 28_000 }, cashflow)).toEqual({ annual: 28_000, origin: 'settings' });
    expect(text({ settings: { plannedAnnualExpenses: 28_000 } as never, assets: [], cashflowData: cashflow })).toContain(' · spesa 28.000 € da Impostazioni');
  });

  it('A13: without them the Cashflow, with its year', () => {
    expect(resolvePlanExpenses({}, cashflow)).toEqual({ annual: 31_500, origin: 'cashflow', referenceYear: 2025, isAnnualized: false });
    expect(text({ settings: null, assets: [], cashflowData: cashflow })).toContain(' · spesa 31.500 € dal Cashflow 2025');
    expect(text({ settings: null, assets: [], cashflowData: { ...cashflow, referenceYear: 2026, isAnnualized: true } })).toContain('dal Cashflow 2026, annualizzato');
  });

  it('the Coast FIRE custom expenses of before D5 stand in until the next save moves them', () => {
    expect(resolvePlanExpenses({ coastFireCustomExpenses: 26_000 }, cashflow)).toEqual({ annual: 26_000, origin: 'settings' });
    expect(resolvePlanExpenses({ plannedAnnualExpenses: 28_000, coastFireCustomExpenses: 26_000 }, cashflow)?.annual).toBe(28_000);
  });

  it('a Cashflow with no expenses is said, not printed as 0 €', () => {
    expect(text({ settings: null, assets: [], cashflowData: { ...cashflow, annualExpensesFromCashflow: 0 } })).toContain('spesa non rilevata (nessuna spesa nel Cashflow)');
  });

  it('while the Cashflow is unread and nothing is typed there are no expenses (the line does not guess)', () => {
    expect(resolvePlanExpenses({}, undefined)).toBeNull();
    expect(resolveFireAssumptions({ settings: null, assets: [] }).expenses).toBeUndefined();
  });

  it('a typed zero or a negative is not an amount', () => {
    expect(resolvePlanExpenses({ plannedAnnualExpenses: 0 }, cashflow)?.origin).toBe('cashflow');
  });
});

describe('A18: one line for every tab', () => {
  it('the same data give the same string whichever tab asks (and in whatever order the locked set is built)', () => {
    const assets = [asset('etf', 'equity', 300_000), asset('fund', 'equity', 20_000), asset('casa', 'realestate', 200_000)];
    const cashflow = { annualExpensesFromCashflow: 31_500, referenceYear: 2025, isAnnualized: false };
    const settings = { plannedAnnualExpenses: 28_000 } as never;
    const forTab = (locked: string[]) => text({ settings, assets, assetValue: valueOf, cashflowData: cashflow, lockedAssetIds: new Set(locked) });
    expect(forTab(['fund'])).toBe(forTab(['fund']));
    expect(forTab(['fund'])).toContain('capitale 300.000 € (fuori: Immobili 200.000 €)');
    expect(forTab([])).toContain('capitale 320.000 €');
  });
});

describe('A17: at zero volatility the Ventaglio is the Calcolatore\'s Base curve', () => {
  it('same capital, same g_p, same indexed saving', () => {
    const base = zeroVol(market.scenarios.base);
    const w = weights({ equity: 60, bonds: 40 });
    const result = portfolioCompoundReturn(w, base, correlations, 2);
    const inflation = base.inflationRate;
    const scenario = { growthRate: result.cagr, inflationRate: inflation };
    const projection = calculateFIREProjection(250_000, 30_000, 12_000, 4, { bear: scenario, base: scenario, bull: scenario }, 50, undefined, undefined, true);
    const years = Math.min(projection.yearlyData.length, 40);
    const fan = runAccumulationSimulation({
      initialPortfolio: 250_000,
      annualSavings: 12_000,
      savingsInflationRate: inflation,
      annualExpenses: 30_000,
      withdrawalRate: 4,
      expenseInflationRate: inflation,
      years,
      weights: w,
      market: base,
      correlations: [...correlations],
      leverageSpread: 2,
      numberOfSimulations: 3,
    });
    for (const path of fan.paths) {
      for (let year = 1; year <= years; year++) {
        expect(Math.round(path[year].value)).toBe(projection.yearlyData[year - 1].baseNetWorth);
      }
    }
    expect(projection.baseYearsToFIRE).not.toBeNull();
    for (const fireYear of fan.fireYears) expect(fireYear).toBe(projection.baseYearsToFIRE);
  });
});
