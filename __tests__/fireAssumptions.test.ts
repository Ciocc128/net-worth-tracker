import { describe, expect, it, vi } from 'vitest';
import { getDefaultMonteCarloCorrelations, getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { buildPortfolioScenarios, portfolioCompoundReturn, realReturn, resolveFireAssumptions, resolveFireCapital, resolvePlanExpenses } from '@/lib/utils/fireAssumptions';
import { portfolioCost, resolveClassCosts } from '@/lib/utils/fireCosts';
import { weightsForFireCapital } from '@/lib/utils/monteCarloWeights';
import { describeEmergencyFund, describeFundMonths, describeFireAssumptions } from '@/lib/utils/fireAssumptionsNarrative';
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
    expect(capital.outside).toEqual({ realestate: 200_000, crypto: 50_000, cash: 0, otherExcluded: 0, cashIsFund: false });
  });

  it('A12: the line says it, Immobili first', () => {
    const line = text({ settings: null, assets: portfolio, assetValue: valueOf });
    expect(line).toContain(' · capitale 300.000 € (portafoglio; fuori: Immobili 200.000 €, Crypto 50.000 €)');
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
    expect(forTab(['fund'])).toContain('capitale 300.000 € (portafoglio; fuori: Immobili 200.000 €)');
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

// ─── P6: recurring costs (doc/fire-ipotesi/README.md § 9, C3–C11) ─────────────────────────────

describe('recurring costs in the rates (RC4)', () => {
  const costPortfolio = [
    asset('azionario', 'equity', 100_000, { totalExpenseRatio: 0.2 }),
    asset('obbligazionario', 'bonds', 50_000, { totalExpenseRatio: 0.1 }),
    asset('corrente', 'cash', 20_000, { type: 'cash', subCategory: 'Conto corrente' }),
    asset('deposito', 'cash', 10_000, { type: 'cash', subCategory: 'Conto deposito' }),
  ];
  const settings = { stampDutyEnabled: true, stampDutyRate: 0.2, checkingAccountSubCategory: 'Conto corrente', targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } } };
  const w6040 = weights({ equity: 60, bonds: 40 });
  const costs = resolveClassCosts(costPortfolio, settings);

  it('C3: 60/40 Bear, Base, Bull net of 0,36% — 5,5854 / 7,8726 / 10,6856 (gross A3: 5,9669 / 8,2623 / 11,0855)', () => {
    const net = (key: 'bear' | 'base' | 'bull') => portfolioCompoundReturn(w6040, market.scenarios[key], correlations, 2, portfolioCost(w6040, costs).total).cagr;
    near(net('bear'), 5.5854);
    near(net('base'), 7.8726);
    near(net('bull'), 10.6856);
  });

  it('C4: the real return is Fisher on the net one (π = 3,04%)', () => {
    const scenarios = buildPortfolioScenarios(w6040, resolveMonteCarloMarket(null), 0.36);
    near(scenarios.bear.realReturnRate, 2.4703);
    near(scenarios.base.realReturnRate, 4.69);
    near(scenarios.bull.realReturnRate, 7.42);
  });

  it('C5: the duty off, the 60/40 Base is 8,0891%', () => {
    const net = portfolioCompoundReturn(w6040, market.scenarios.base, correlations, 2, portfolioCost(w6040, resolveClassCosts(costPortfolio, { ...settings, stampDutyEnabled: false })).total).cagr;
    near(net, 8.0891);
  });

  it('C6: leverage 1,5× (A6 weights) with the costs of P → Base 8,8366%', () => {
    const w = weights({ equity: 90, bonds: 60 });
    near(portfolioCompoundReturn(w, market.scenarios.base, correlations, 2, portfolioCost(w, costs).total).cagr, 8.8366);
  });

  it('a zero cost is the gross return, float for float (C11)', () => {
    expect(portfolioCompoundReturn(w6040, market.scenarios.base, correlations, 2, 0)).toEqual(portfolioCompoundReturn(w6040, market.scenarios.base, correlations, 2));
  });

  it('C8: at zero volatility g_net = (1,07824 · 0,9964) − 1 = 7,4358% and the Ventaglio is still the Base curve (A17 with the costs)', () => {
    const base = zeroVol(market.scenarios.base);
    const result = portfolioCompoundReturn(w6040, base, correlations, 2, 0.36);
    near(result.cagr, 7.4358);
    const scenario = { growthRate: result.cagr, inflationRate: base.inflationRate };
    const projection = calculateFIREProjection(250_000, 30_000, 12_000, 4, { bear: scenario, base: scenario, bull: scenario }, 50, undefined, undefined, true);
    const years = Math.min(projection.yearlyData.length, 40);
    const fan = runAccumulationSimulation({
      initialPortfolio: 250_000,
      annualSavings: 12_000,
      savingsInflationRate: base.inflationRate,
      annualExpenses: 30_000,
      withdrawalRate: 4,
      expenseInflationRate: base.inflationRate,
      years,
      weights: w6040,
      market: base,
      correlations: [...correlations],
      leverageSpread: 2,
      annualCostRate: 0.36,
      numberOfSimulations: 3,
    });
    for (const path of fan.paths) {
      for (let year = 1; year <= years; year++) expect(Math.round(path[year].value)).toBe(projection.yearlyData[year - 1].baseNetWorth);
    }
    for (const fireYear of fan.fireYears) expect(fireYear).toBe(projection.baseYearsToFIRE);
  });

  it('resolveFireAssumptions carries the costs and the net rates when it has the values; without them the rates stay gross', () => {
    const withValues = resolveFireAssumptions({ settings, assets: costPortfolio, assetValue: valueOf });
    near(withValues.cost!.total, 0.36);
    near(withValues.scenarios.base.growthRate, 7.8726);
    const without = resolveFireAssumptions({ settings, assets: costPortfolio });
    expect(without.cost).toBeUndefined();
    near(without.scenarios.base.growthRate, 8.2623);
  });

  it('C12: the line says the costs, the three readings', () => {
    const base = { assets: costPortfolio, assetValue: valueOf };
    expect(text({ ...base, settings })).toContain('costi 0,36% (TER 0,16%, bollo 0,20%)');
    expect(text({ ...base, settings: { ...settings, stampDutyEnabled: false } })).toContain('costi 0,16% (solo TER; bollo non attivo in Impostazioni › Allocazione)');
    const noTer = costPortfolio.map((a) => ({ ...a, totalExpenseRatio: undefined }));
    expect(text({ assets: noTer, assetValue: valueOf, settings })).toContain('TER non inseriti negli strumenti');
  });
});


// ─── K1: patrimonio e portafoglio (doc/fire-ipotesi/README.md § 11) ──────────────────────────

describe('K1 + EF1: the portfolio, the cash outside it, the emergency fund and the capital of the tabs', () => {
  const noTargets = { targets: {} } as never;
  const targets7030 = { targets: { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 }, cash: { targetPercentage: 0 } } };
  const cash = (id: string, value: number, extra: Partial<Asset> = {}) => asset(id, 'cash', value, { type: 'cash', ...extra });
  const example = (extra: Asset[] = []): Asset[] => [
    asset('azioni', 'equity', 280_000, { averageCost: 200_000 }),
    asset('obbl', 'bonds', 120_000, { averageCost: 110_000 }),
    cash('conto', 15_000),
    cash('deposito', 45_000, { allocationRole: 'excluded' }),
    asset('btc', 'crypto', 10_000),
    asset('casa', 'realestate', 250_000, { allocationRole: 'excluded' }),
    ...extra,
  ];
  // The legacy share (RE5): read only to derive the fund, so `resolve(q)` is the capital of K1 with the fund equivalent to q.
  const resolve = (pct: number | undefined, settings: Record<string, unknown> = targets7030, assets: Asset[] = example()) =>
    resolveFireAssumptions({ settings: { ...settings, fireCashToInvestPct: pct } as never, assets, assetValue: valueOf });
  // § 14 (RE1): the fund in euro; undefined = not set.
  const withFund = (fund: number | undefined, settings: Record<string, unknown> = targets7030, assets: Asset[] = example()) =>
    resolveFireAssumptions({ settings: { ...settings, fireEmergencyFund: fund } as never, assets, assetValue: valueOf });

  it('K2: N, C, C_in, P, X, E, L', () => {
    const { capital } = resolve(0);
    expect(capital!.portfolio).toBeCloseTo(400_000, 2);
    expect(capital!.cashToInvest.overTarget).toBeCloseTo(15_000, 2);
    expect(capital!.cashToInvest.excludedAccounts).toBeCloseTo(45_000, 2);
    expect(capital!.cashToInvest.total).toBeCloseTo(60_000, 2);
  });

  it('K3 (rewritten with the equivalent fund, § 14.9): the capital is P + max(0, L − F) for F = 60.000 / 30.000 / 0', () => {
    expect(withFund(60_000).capital!.total).toBeCloseTo(400_000, 2);
    expect(withFund(30_000).capital!.total).toBeCloseTo(430_000, 2);
    expect(withFund(0).capital!.total).toBeCloseTo(460_000, 2);
  });

  it('E1: F = 30.000 — U = 30.000, capital 430.000, outside 30.000, weights 70/30', () => {
    const result = withFund(30_000);
    const { capital } = result;
    near(capital!.cashToInvest.used, 30_000, 0.01);
    near(capital!.total, 430_000, 0.01);
    near(capital!.outside.cash, 30_000, 0.01);
    expect(result.weights).toEqual(weights({ equity: 70, bonds: 30 }));
  });

  it('E2: F = 0 — everything outside the portfolio enters', () => {
    const { capital } = withFund(0);
    near(capital!.cashToInvest.used, 60_000, 0.01);
    near(capital!.total, 460_000, 0.01);
    near(capital!.outside.cash, 0, 0.01);
  });

  it('E3: no fund set (and no legacy share) — nothing enters, all the cash stays out', () => {
    const { capital } = withFund(undefined);
    near(capital!.cashToInvest.used, 0, 0.01);
    near(capital!.total, 400_000, 0.01);
    near(capital!.outside.cash, 60_000, 0.01);
    expect(capital!.cashToInvest.fund).toBeNull();
  });

  it('E4: the fund is a fixed sum — the accounts rise by 4.000 and all of it enters', () => {
    const raised = example().map((a) => (a.id === 'deposito' ? cash('deposito', 49_000, { allocationRole: 'excluded' }) : a));
    const { capital } = withFund(30_000, targets7030, raised);
    near(capital!.cashToInvest.total, 64_000, 0.01);
    near(capital!.cashToInvest.used, 34_000, 0.01);
    near(capital!.total, 434_000, 0.01);
    near(capital!.outside.cash, 30_000, 0.01);
  });

  it('E5: a fund above L enters nothing, the portfolio stays whole and the shortfall is declared (RE3)', () => {
    const { capital } = withFund(80_000);
    near(capital!.cashToInvest.used, 0, 0.01);
    near(capital!.total, 400_000, 0.01);
    near(capital!.cashToInvest.fundShortfall, 20_000, 0.01);
    near(capital!.outside.cash, 60_000, 0.01);
  });

  it('E6: the tax profile and the liquid part with F = 30.000 are those of K8 / K9', () => {
    const { capital } = withFund(30_000);
    near(capital!.taxProfile!.basisToday, 340_000, 0.01);
    near(1 - capital!.taxProfile!.basisToday / 430_000, 90_000 / 430_000, 1e-4);
    near(capital!.liquid, 430_000, 0.01);
  });

  it('E7: a credit card excluded lowers L, and so U (F = 30.000)', () => {
    const { capital } = withFund(30_000, targets7030, example([cash('carta', -2_000, { allocationRole: 'excluded' })]));
    near(capital!.cashToInvest.used, 28_000, 0.01);
    near(capital!.total, 428_000, 0.01);
  });

  it('E8: the fund takes from L only, never from the Liquidità the target keeps in (D-E2)', () => {
    const assets = [asset('azioni', 'equity', 280_000), asset('obbl', 'bonds', 120_000), cash('conto', 60_000)];
    const { capital } = withFund(10_000, { targets: { equity: { targetPercentage: 63 }, bonds: { targetPercentage: 27 }, cash: { targetPercentage: 10 } } }, assets);
    near(capital!.cashToInvest.used, 5_555.56, 0.01);
    near(capital!.total, 450_000, 0.01);
    near(capital!.portfolio, 444_444.44, 0.01);
  });

  it('E9: a fixed-amount Liquidità target with F = 10.000 — U = 30.000, capital 450.000', () => {
    const assets = [asset('azioni', 'equity', 280_000), asset('obbl', 'bonds', 120_000), cash('conto', 60_000)];
    const settings = { targets: { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 }, cash: { targetPercentage: 0, useFixedAmount: true, fixedAmount: 20_000 } } };
    const result = withFund(10_000, settings, assets);
    near(result.capital!.cashToInvest.used, 30_000, 0.01);
    near(result.capital!.total, 450_000, 0.01);
    // w_cash 20.000 / 450.000 = 4,4444%, Azioni 66,8889%, Obbligazioni 28,6667% before the integer normaliser (4 / 67 / 29 after)
    expect(result.weights.cash).toBe(4);
    expect(result.weights.equity).toBe(67);
    expect(result.weights.bonds).toBe(29);
  });

  it('E11: a legacy share q with no fund saved derives F = (1 − q)·L, and the capital is the one of K1', () => {
    for (const [q, fund, total] of [[50, 30_000, 430_000], [0, 60_000, 400_000], [100, 0, 460_000]] as const) {
      const { capital } = resolve(q);
      near(capital!.cashToInvest.fund!, fund, 0.01);
      near(capital!.total, total, 0.01);
      expect(capital!.cashToInvest.fundFromPct).toBe(q);
    }
    // out of [0, 100] is clamped, never read as a bigger capital
    near(resolve(250).capital!.total, 460_000, 0.01);
    near(resolve(-5).capital!.total, 400_000, 0.01);
    expect(resolve(undefined).capital!.cashToInvest.fund).toBeNull();
  });

  it('E12: with both saved the fund wins and the legacy share is ignored', () => {
    const result = resolveFireAssumptions({ settings: { ...targets7030, fireEmergencyFund: 25_000, fireCashToInvestPct: 50 } as never, assets: example(), assetValue: valueOf });
    near(result.capital!.total, 435_000, 0.01);
    expect(result.capital!.cashToInvest.fundFromPct).toBeNull();
  });

  it('K4: the weights are the pure targets whatever q (no dilution), and the rates follow', () => {
    for (const q of [0, 50, 100]) {
      const result = resolve(q);
      expect(result.weights).toEqual(weights({ equity: 70, bonds: 30 }));
      expect(result.weightsOrigin).toBe('targets');
      near(result.scenarios.bear.growthRate, 6.5158);
      near(result.scenarios.base.growthRate, 8.7525);
      near(result.scenarios.bull.growthRate, 11.4278);
      near(result.scenarios.base.realReturnRate, 5.5439);
    }
  });

  it('K5: a Liquidità target of 10% keeps 10% of the portfolio as cash, the rest of the included account is excess', () => {
    const assets = [asset('azioni', 'equity', 280_000), asset('obbl', 'bonds', 120_000), cash('conto', 60_000)];
    const result = resolve(0, { targets: { equity: { targetPercentage: 63 }, bonds: { targetPercentage: 27 }, cash: { targetPercentage: 10 } } }, assets);
    expect(result.capital!.portfolio).toBeCloseTo(444_444.44, 2);
    expect(result.capital!.cashToInvest.overTarget).toBeCloseTo(15_555.56, 2);
    expect(result.capital!.cashToInvest.total).toBeCloseTo(15_555.56, 2);
  });

  it('K6: a fixed-amount Liquidità target', () => {
    const assets = [asset('azioni', 'equity', 280_000), asset('obbl', 'bonds', 120_000), cash('conto', 60_000)];
    const settings = { targets: { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 }, cash: { targetPercentage: 0, useFixedAmount: true, fixedAmount: 20_000 } } };
    const result = resolve(100, settings, assets);
    expect(result.capital!.portfolio).toBeCloseTo(420_000, 2);
    expect(result.capital!.cashToInvest.overTarget).toBeCloseTo(40_000, 2);
    expect(result.capital!.total).toBeCloseTo(460_000, 2);
    // w_cash = 20.000 / 460.000 = 4,3478%, Azioni 66,9565%, Obbligazioni 28,6957% — before the integer normaliser
    const direct = weightsForFireCapital(
      settings.targets,
      { capital: 460_000, cashIn: 20_000, cashToInvest: 40_000, legs: [] },
    );
    expect(direct?.weights.cash).toBe(4);
    expect(direct?.weights.equity).toBe(67);
    expect(direct?.weights.bonds).toBe(29);
  });

  it('K7: a negative balance excluded (a credit card) lowers the cash to invest', () => {
    const { capital } = resolve(0, targets7030, example([cash('carta', -2_000, { allocationRole: 'excluded' })]));
    expect(capital!.cashToInvest.excludedAccounts).toBeCloseTo(43_000, 2);
    expect(capital!.cashToInvest.total).toBeCloseTo(58_000, 2);
  });

  it('K8 (legacy share 50): the tax profile of the capital', () => {
    const profile = resolve(50).capital!.taxProfile!;
    expect(profile.basisToday).toBeCloseTo(340_000, 2);
    expect(1 - profile.basisToday / 430_000).toBeCloseTo(90_000 / 430_000, 6);
  });

  it('K9 (legacy share 50): the liquid part', () => {
    expect(resolve(50).capital!.liquid).toBeCloseTo(430_000, 2);
  });

  it('K10: with no targets the holdings are the weights, the included account is in and the deposit is out', () => {
    const result = resolve(0, noTargets);
    expect(result.capital!.total).toBeCloseTo(415_000, 2);
    expect(result.weightsOrigin).toBe('holdings');
    // 280/415, 120/415, 15/415 → 67,47 / 28,92 / 3,61 before the normaliser (67 / 29 / 4 after it)
    expect(result.weights).toEqual(weights({ equity: 67, bonds: 29, cash: 4 }));
  });

  it('with no targets and no instrument, the cash that enters has no weights to take: the 60/40 default is declared', () => {
    const result = resolve(100, noTargets, [cash('deposito', 45_000, { allocationRole: 'excluded' })]);
    expect(result.capital!.total).toBeCloseTo(45_000, 2);
    expect(result.weightsOrigin).toBe('default');
  });

  it('RK8: a locked pension fund is not portfolio, the net worth keeps it', () => {
    const result = resolveFireAssumptions({
      settings: targets7030 as never,
      assets: example([asset('fondo', 'equity', 20_000)]),
      assetValue: valueOf,
      lockedAssetIds: new Set(['fondo']),
    });
    expect(result.capital!.portfolio).toBeCloseTo(400_000, 2);
    expect(result.capital!.netWorth).toBeCloseTo(740_000, 2);
  });

  it('K12 / E14 / E15: the line is the same in every tab and says portfolio, cash entering beyond the fund and what is outside', () => {
    expect(text({ settings: { ...targets7030, fireEmergencyFund: 30_000 } as never, assets: example(), assetValue: valueOf })).toContain(
      ' · capitale 430.000 € (portafoglio 400.000 € + 30.000 € di liquidità oltre il fondo; fuori: fondo di emergenza 30.000 €, Immobili 250.000 €, Crypto 10.000 €)',
    );
    expect(text({ settings: targets7030 as never, assets: example(), assetValue: valueOf })).toContain(
      ' · capitale 400.000 € (portafoglio; fuori: Liquidità 60.000 €, Immobili 250.000 €, Crypto 10.000 €)',
    );
    // a fund above L: the entry is the cash that is really there
    expect(text({ settings: { ...targets7030, fireEmergencyFund: 80_000 } as never, assets: example(), assetValue: valueOf })).toContain(
      ' · capitale 400.000 € (portafoglio; fuori: fondo di emergenza 60.000 €, Immobili 250.000 €, Crypto 10.000 €)',
    );
  });

  it('other excluded instruments (not Liquidità) stay out and are declared, never invested', () => {
    const result = withFund(0, targets7030, example([asset('azione-fuori', 'equity', 5_000, { allocationRole: 'excluded' })]));
    expect(result.capital!.total).toBeCloseTo(460_000, 2);
    expect(result.capital!.outside.otherExcluded).toBeCloseTo(5_000, 2);
    expect(text({ settings: { ...targets7030, fireEmergencyFund: 0 } as never, assets: example([asset('azione-fuori', 'equity', 5_000, { allocationRole: 'excluded' })]), assetValue: valueOf })).toContain('Altri strumenti esclusi 5000 €');
  });

  it('E16: describeEmergencyFund says where the cash comes from, what stays as fund (in months) and what enters', () => {
    const say = (cash: Parameters<typeof describeEmergencyFund>[0], expense?: number) => describeEmergencyFund(cash, expense).replace(/\u00a0/g, ' ');
    expect(say(withFund(30_000).capital!.cashToInvest, 36_000)).toBe(
      '60.000 € fuori dal portafoglio (conti esclusi 45.000 €, oltre il target 15.000 €): 30.000 € restano come fondo, pari a 10 mesi della spesa del piano, e 30.000 € entrano nei pesi target.',
    );
    // no plan expense: no months
    expect(say(withFund(30_000).capital!.cashToInvest)).toBe(
      '60.000 € fuori dal portafoglio (conti esclusi 45.000 €, oltre il target 15.000 €): 30.000 € restano come fondo, e 30.000 € entrano nei pesi target.',
    );
    expect(say(withFund(0).capital!.cashToInvest, 36_000)).toBe('60.000 € fuori dal portafoglio (conti esclusi 45.000 €, oltre il target 15.000 €): entrano tutti nei pesi target.');
    expect(say(withFund(undefined).capital!.cashToInvest)).toBe('60.000 € fuori dal portafoglio (conti esclusi 45.000 €, oltre il target 15.000 €): senza un fondo indicato restano tutti fuori.');
    expect(say(withFund(80_000).capital!.cashToInvest, 36_000)).toBe(
      'Il fondo supera di 20.000 € la liquidità fuori dal portafoglio (60.000 €): non entra niente nel capitale e il fondo non è coperto.',
    );
    expect(say(resolve(50).capital!.cashToInvest, 36_000)).toBe(
      '60.000 € fuori dal portafoglio (conti esclusi 45.000 €, oltre il target 15.000 €): 30.000 € restano come fondo, pari a 10 mesi della spesa del piano, e 30.000 € entrano nei pesi target. Calcolato dalla quota del 50% salvata prima: salva per fissarlo in euro.',
    );
    const noCash = withFund(undefined, targets7030, [asset('azioni', 'equity', 100_000)]).capital!.cashToInvest;
    expect(say(noCash)).toBe('Nessuna liquidità fuori dal portafoglio.');
  });

  it('E10: the months of the fund — one decimal, «,0» dropped, none without a fund or a plan expense', () => {
    expect(describeFundMonths(30_000, 36_000)).toBe('10 mesi');
    expect(describeFundMonths(30_000, 35_000)).toBe('10,3 mesi');
    expect(describeFundMonths(3_000, 36_000)).toBe('1 mese');
    expect(describeFundMonths(30_000, undefined)).toBeNull();
    expect(describeFundMonths(30_000, 0)).toBeNull();
    expect(describeFundMonths(null, 36_000)).toBeNull();
  });

  it('RK6: the recurring costs read the shares — an excluded cash account pays no duty with no fund set, and does with F = 0', () => {
    const settings = { ...targets7030, stampDutyEnabled: true, stampDutyRate: 0.2 };
    // Only the ETFs pay at q = 0 (the included account is excess, the deposit is out): the cash class is not held.
    const q0 = withFund(undefined, settings).costs!.byClass;
    expect(q0.cash.held).toBe(false);
    expect(withFund(0, settings).costs!.byClass.cash.held).toBe(true);
  });

  it('K14 / E18: at zero volatility the Ventaglio is the Base curve, starting from the capital of RE1', () => {
    const result = withFund(30_000);
    const base = zeroVol(result.market.scenarios.base);
    const w = result.weights;
    const g = portfolioCompoundReturn(w, base, correlations, 2);
    const inflation = base.inflationRate;
    const scenario = { growthRate: g.cagr, inflationRate: inflation };
    const capital = Math.round(result.capital!.total);
    const projection = calculateFIREProjection(capital, 30_000, 12_000, 4, { bear: scenario, base: scenario, bull: scenario }, 50, undefined, undefined, true);
    const years = Math.min(projection.yearlyData.length, 40);
    const fan = runAccumulationSimulation({
      initialPortfolio: capital,
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
      for (let year = 1; year <= years; year++) expect(Math.round(path[year].value)).toBe(projection.yearlyData[year - 1].baseNetWorth);
    }
  });
});
