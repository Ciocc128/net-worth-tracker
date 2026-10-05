/**
 * Tests for lib/utils/monteCarloSummary.ts — the numbers of FIRE › Monte Carlo, read from the
 * results the service already computed: the base run (probability, the year the 10th percentile
 * touches zero, the final percentiles, the histogram with the median's bin), the three scenarios
 * side by side, the overlay and percentile rows of the Dettaglio, the plan as typed, and the
 * «parameters changed since the last run» comparison.
 */

import { describe, expect, it, vi } from 'vitest';

// `getDefaultMonteCarloScenarios` lives beside the service's chartService import, which drags the
// Firebase chain in — mocked away as in every other pure-layer suite.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import type { MonteCarloParams, MonteCarloResults, PercentilesData } from '@/types/assets';
import {
  buildOverlaySeries,
  buildPercentileRows,
  deflate,
  deflatePercentiles,
  formatInputAmount,
  haveRunInputsChanged,
  parseItalianNumber,
  resolveP10DepletionYear,
  resolveSuccessTone,
  summarizeMonteCarloPlan,
  summarizeMonteCarloRun,
  summarizeScenarios,
  type MonteCarloRunInputs,
} from '@/lib/utils/monteCarloSummary';
import { getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';

const defaultScenarios = () => getDefaultMonteCarloMarket().scenarios;
/** Weights: the named classes, every other at 0. */
const weightsOf = (named: Partial<Record<'equity' | 'bonds' | 'gold' | 'commodity' | 'cash' | 'trendFollowing' | 'carry', number>>) => monteCarloClassRecord((cls) => named[cls] ?? 0);

const CTX = { startCalendarYear: 2026, currentAge: 46 };

function makeParams(overrides: Partial<MonteCarloParams> = {}): MonteCarloParams {
  return {
    portfolioSource: 'total',
    initialPortfolio: 488600,
    retirementYears: 35,
    weights: weightsOf({ equity: 58, bonds: 27, cash: 10, commodity: 5 }),
    annualWithdrawal: 22000,
    withdrawalAdjustment: 'inflation',
    market: defaultScenarios().base,
    numberOfSimulations: 10000,
    ...overrides,
  };
}

/** Percentiles for years 0..years; `p10ZeroFrom` = first year the 10th percentile is 0 (null = never). */
function makePercentiles(years: number, p10ZeroFrom: number | null): PercentilesData[] {
  const rows: PercentilesData[] = [];
  for (let year = 0; year <= years; year++) {
    const depleted = p10ZeroFrom !== null && year >= p10ZeroFrom;
    rows.push({ year, p10: depleted ? 0 : 400000 - year * 1000, p25: 450000, p50: 500000 + year * 3000, p75: 700000, p90: 900000 });
  }
  return rows;
}

function makeResults(overrides: Partial<MonteCarloResults> = {}): MonteCarloResults {
  return {
    successRate: 84.21,
    successCount: 8421,
    failureCount: 1579,
    leverageFailureCount: 0,
    medianFinalValue: 640000,
    percentiles: makePercentiles(35, 27),
    failureAnalysis: { averageFailureYear: 24.4, medianFailureYear: 26 },
    distribution: [
      { range: '€0-€420k', count: 1579, percentage: 15.79, from: 0, to: 420000 },
      { range: '€420k-€840k', count: 2210, percentage: 22.1, from: 420000, to: 840000 },
      { range: '€840k-€1,3 Mln', count: 6211, percentage: 62.11, from: 840000, to: 1260000 },
    ],
    simulations: [],
    ...overrides,
  };
}

describe('resolveP10DepletionYear', () => {
  it('returns the first simulation year (from 1) at which the 10th percentile is zero', () => {
    expect(resolveP10DepletionYear(makePercentiles(35, 27))).toBe(27);
  });

  it('returns null when the 10th percentile never touches zero', () => {
    expect(resolveP10DepletionYear(makePercentiles(35, null))).toBeNull();
  });

  it('ignores year 0 (the starting capital is never "depleted")', () => {
    const rows = makePercentiles(5, null);
    rows[0] = { ...rows[0], p10: 0 };
    expect(resolveP10DepletionYear(rows)).toBeNull();
  });
});

describe('summarizeMonteCarloRun', () => {
  it('reads the probability, the horizon and the age at its end from the saved age', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.successRate).toBeCloseTo(84.21);
    expect(run.successCount).toBe(8421);
    expect(run.failureCount).toBe(1579);
    expect(run.simulations).toBe(10000);
    expect(run.years).toBe(35);
    expect(run.endCalendarYear).toBe(2061);
    expect(run.endAge).toBe(81);
  });

  it('has no end age without a saved age', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), { ...CTX, currentAge: null });
    expect(run.endAge).toBeNull();
  });

  it('takes the median of ALL simulations from the last percentile row, never the survivors-only figure', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.medianFinal).toBe(500000 + 35 * 3000);
    expect(run.finalPercentiles).toEqual({ p10: 0, p25: 450000, p50: 605000, p75: 700000, p90: 900000 });
  });

  it('dates the 10th-percentile depletion in calendar years and in age', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.p10DepletionYear).toBe(27);
    expect(run.p10DepletionCalendarYear).toBe(2053);
    expect(run.p10DepletionAge).toBe(73);
  });

  it('leaves the depletion null when the 10th percentile survives', () => {
    const run = summarizeMonteCarloRun(makeResults({ percentiles: makePercentiles(35, null) }), makeParams(), CTX);
    expect(run.p10DepletionYear).toBeNull();
    expect(run.p10DepletionCalendarYear).toBeNull();
    expect(run.p10DepletionAge).toBeNull();
  });

  it('rounds the average failure year and dates both failure figures', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.failureAverageYear).toBe(24);
    expect(run.failureAverageCalendarYear).toBe(2050);
    expect(run.failureMedianYear).toBe(26);
    expect(run.failureMedianCalendarYear).toBe(2052);
  });

  it('has no failure figures when nothing failed', () => {
    const run = summarizeMonteCarloRun(makeResults({ failureAnalysis: null, failureCount: 0, successCount: 10000, successRate: 100 }), makeParams(), CTX);
    expect(run.failureAverageYear).toBeNull();
    expect(run.failureMedianCalendarYear).toBeNull();
  });

});

describe('summarizeScenarios', () => {
  it('lists bear, base and bull in that order with their probability, median and depletion year', () => {
    const bear = makeResults({ successRate: 61.5, successCount: 6150, failureCount: 3850, percentiles: makePercentiles(35, 19) });
    const base = makeResults();
    const bull = makeResults({ successRate: 96.8, successCount: 9680, failureCount: 320, percentiles: makePercentiles(35, null) });
    const comparison = summarizeScenarios({ bear, base, bull }, makeParams(), CTX);
    expect(comparison.rows.map((row) => row.key)).toEqual(['bear', 'base', 'bull']);
    expect(comparison.rows[0]).toMatchObject({ successRate: 61.5, p10DepletionCalendarYear: 2045, failureCount: 3850 });
    expect(comparison.rows[2]).toMatchObject({ successRate: 96.8, p10DepletionCalendarYear: null });
    expect(comparison.rows[1].medianFinal).toBe(605000);
    expect(comparison.spreadPoints).toBeCloseTo(35.3);
  });
});

describe('buildOverlaySeries / buildPercentileRows', () => {
  it('merges the three medians and the base band by calendar year', () => {
    const bear = makeResults({ percentiles: makePercentiles(2, null).map((r) => ({ ...r, p50: 100 })) });
    const base = makeResults({ percentiles: makePercentiles(2, null) });
    const bull = makeResults({ percentiles: makePercentiles(2, null).map((r) => ({ ...r, p50: 900 })) });
    const series = buildOverlaySeries({ bear, base, bull }, 2026);
    expect(series).toHaveLength(3);
    expect(series[1]).toEqual({ calendarYear: 2027, bearP50: 100, baseP50: 503000, bullP50: 900, baseBand: [399000, 900000] });
  });

  it('samples the percentiles every five years, first and last included', () => {
    const rows = buildPercentileRows(makePercentiles(35, 27), 2026);
    expect(rows.map((row) => row.calendarYear)).toEqual([2026, 2031, 2036, 2041, 2046, 2051, 2056, 2061]);
    expect(rows[7]).toMatchObject({ p10: 0, p50: 605000 });
  });

  it('keeps the last year even when the horizon is not a multiple of five', () => {
    const rows = buildPercentileRows(makePercentiles(12, null), 2026);
    expect(rows.map((row) => row.calendarYear)).toEqual([2026, 2031, 2036, 2038]);
  });
});

describe('summarizeMonteCarloPlan', () => {
  it('states the plan as typed, with the locked fund and its inflows dated', () => {
    const plan = summarizeMonteCarloPlan(makeParams(), [{ year: 19, amount: 31400 }], 31400, CTX);
    expect(plan).toMatchObject({
      initialPortfolio: 488600,
      lockedValue: 31400,
      annualWithdrawal: 22000,
      isIndexed: true,
      years: 35,
      endAge: 81,
      endCalendarYear: 2061,
      simulations: 10000,
    });
    expect(plan.allocation).toEqual([
      { key: 'equity', label: 'azioni', pct: 58 },
      { key: 'bonds', label: 'obbligazioni', pct: 27 },
      { key: 'commodity', label: 'materie prime', pct: 5 },
      { key: 'cash', label: 'liquidità', pct: 10 },
    ]);
    expect(plan.inflows).toEqual([{ yearOffset: 19, calendarYear: 2045, amount: 31400 }]);
  });

  it('drops the classes at 0% and reads a fixed withdrawal', () => {
    const honest = summarizeMonteCarloPlan(
      makeParams({ annualInflows: [{ fromYear: 34, annualNetToday: 13000 }, { fromYear: 30, annualNetToday: 5000 }], withdrawalTax: { basisToday: 293160, rate: 26 } }),
      [],
      0,
      CTX,
    );
    // The pensions in start order, dated; the gain share read on the starting capital (40%).
    expect(honest.statePensions).toEqual([
      { yearOffset: 30, calendarYear: 2056, annualNetToday: 5000 },
      { yearOffset: 34, calendarYear: 2060, annualNetToday: 13000 },
    ]);
    expect(honest.withdrawalTax?.rate).toBe(26);
    expect(honest.withdrawalTax?.gainSharePct).toBeCloseTo(40);
    const plan = summarizeMonteCarloPlan(makeParams({ weights: weightsOf({ equity: 60, bonds: 40 }), withdrawalAdjustment: 'fixed' }), [], 0, CTX);
    expect(plan.statePensions).toEqual([]);
    expect(plan.withdrawalTax).toBeNull();
    expect(plan.allocation.map((a) => a.key)).toEqual(['equity', 'bonds']);
    expect(plan.isIndexed).toBe(false);
    expect(plan.lockedValue).toBe(0);
    expect(plan.inflows).toEqual([]);
  });
});

describe('haveRunInputsChanged', () => {
  const inputs = (): MonteCarloRunInputs => ({ params: makeParams(), scenarios: defaultScenarios(), inflows: [{ year: 19, amount: 31400 }] });

  it('is false for identical inputs', () => {
    expect(haveRunInputsChanged(inputs(), inputs())).toBe(false);
  });

  it('is true when a plan parameter, a scenario parameter or an inflow changes', () => {
    const a = inputs();
    expect(haveRunInputsChanged(a, { ...inputs(), params: makeParams({ annualWithdrawal: 23000 }) })).toBe(true);
    const scenarios = defaultScenarios();
    scenarios.bear.classes.equity.cagr = 3;
    expect(haveRunInputsChanged(a, { ...inputs(), scenarios })).toBe(true);
    expect(haveRunInputsChanged(a, { ...inputs(), inflows: [] })).toBe(true);
    // T2: a saved correlation matrix makes the last run stale too.
    expect(haveRunInputsChanged(a, { ...inputs(), params: makeParams({ correlations: new Array(21).fill(0.1) }) })).toBe(true);
    // The pensions and the tax ride on the params (2026-09-24): a change is a new plan.
    expect(haveRunInputsChanged(a, { ...inputs(), params: makeParams({ annualInflows: [{ fromYear: 34, annualNetToday: 13000 }] }) })).toBe(true);
    expect(haveRunInputsChanged(a, { ...inputs(), params: makeParams({ withdrawalTax: { basisToday: 300000, rate: 26 } }) })).toBe(true);
    const withTax = { ...inputs(), params: makeParams({ withdrawalTax: { basisToday: 300000, rate: 26 } }) };
    expect(haveRunInputsChanged(withTax, { ...inputs(), params: makeParams({ withdrawalTax: { basisToday: 300000, rate: 26 } }) })).toBe(false);
  });

  it('§ 12: a saved dated flow, or a different list, makes the last run stale', () => {
    const lump = { id: 'l', label: 'Eredità', kind: 'lumpIn' as const, sigma: 0 as const, indexed: false, amount: 100000, anchor: 'fixed' as const, start: 10, durationYears: null, inCashflowToday: false };
    const withFlow = (amount: number) => ({ ...inputs(), params: makeParams({ flows: { resolved: [{ ...lump, amount }], planExpensesFromCashflow: true } }) });
    expect(haveRunInputsChanged(inputs(), withFlow(100000))).toBe(true);
    expect(haveRunInputsChanged(withFlow(100000), withFlow(100000))).toBe(false);
    expect(haveRunInputsChanged(withFlow(100000), withFlow(120000))).toBe(true);
    expect(haveRunInputsChanged(inputs(), { ...inputs(), params: makeParams({ flows: { resolved: [], planExpensesFromCashflow: true } }) })).toBe(false);
  });

  it('ignores the market on the shared params (the scenarios carry it)', () => {
    const other = defaultScenarios().base;
    other.classes.equity.cagr = 9;
    expect(haveRunInputsChanged(inputs(), { ...inputs(), params: makeParams({ market: other }) })).toBe(false);
  });

  it('is true when a weight changes, or a saved market makes the last run stale', () => {
    expect(haveRunInputsChanged(inputs(), { ...inputs(), params: makeParams({ weights: weightsOf({ equity: 60, bonds: 25, cash: 10, commodity: 5 }) }) })).toBe(true);
    const saved = defaultScenarios();
    saved.base.classes.carry.volatility = 12;
    expect(haveRunInputsChanged(inputs(), { ...inputs(), scenarios: saved })).toBe(true);
    const inflation = defaultScenarios();
    inflation.bull.inflationRate = 2;
    expect(haveRunInputsChanged(inputs(), { ...inputs(), scenarios: inflation })).toBe(true);
  });
});

describe('resolveSuccessTone', () => {
  it('is positive from 90, warning from 80, negative below', () => {
    expect(resolveSuccessTone(95)).toBe('positive');
    expect(resolveSuccessTone(90)).toBe('positive');
    expect(resolveSuccessTone(84.2)).toBe('warning');
    expect(resolveSuccessTone(80)).toBe('warning');
    expect(resolveSuccessTone(79.9)).toBe('negative');
  });
});

describe('parseItalianNumber / formatInputAmount', () => {
  it('reads it-IT amounts, plain numbers and hand-typed decimals', () => {
    expect(parseItalianNumber('488.600,00')).toBe(488600);
    expect(parseItalianNumber('488600')).toBe(488600);
    expect(parseItalianNumber('1.250.000')).toBe(1250000);
    expect(parseItalianNumber('12.5')).toBe(12.5);
    expect(parseItalianNumber('22000 €')).toBe(22000);
    expect(parseItalianNumber('')).toBeNull();
    expect(parseItalianNumber('abc')).toBeNull();
  });

  it('prints a committed amount grouped, without cents', () => {
    expect(formatInputAmount(488600.4)).toBe('488.600');
    expect(formatInputAmount(9500)).toBe('9500');
  });
});

describe('summarizeMonteCarloRun — leverage (T3)', () => {
  const failed = (id: number, failureYear: number, failureCause: 'withdrawals' | 'leverage') => ({ simulationId: id, success: false, failureYear, failureCause, finalValue: 0, path: [{ year: 0, value: 488600 }] });

  it('carries the leverage of the weights and the failures by cause', () => {
    const results = makeResults({
      leverageFailureCount: 1,
      failureCount: 2,
      simulations: [failed(0, 20, 'leverage'), failed(1, 22, 'withdrawals')],
      failureAnalysis: { averageFailureYear: 21, medianFailureYear: 22 },
    });
    const run = summarizeMonteCarloRun(results, makeParams({ weights: weightsOf({ equity: 90, bonds: 60 }), numberOfSimulations: 2 }), CTX);
    expect(run.leverage).toBeCloseTo(1.5, 10);
    expect(run.leverageFailureCount).toBe(1);
  });

  it('has leverage 1 without leverage', () => {
    const results = makeResults({ simulations: [{ simulationId: 0, success: false, failureYear: 20, failureCause: 'withdrawals', finalValue: 0, path: [{ year: 0, value: 1 }] }], failureCount: 1 });
    const run = summarizeMonteCarloRun(results, makeParams({ numberOfSimulations: 1 }), CTX);
    expect(run.leverage).toBe(1);
  });

  it('a change of the leverage spread makes the last run stale', () => {
    const inputs = (spread: number): MonteCarloRunInputs => ({ params: makeParams({ leverageSpread: spread }), scenarios: defaultScenarios(), inflows: [] });
    expect(haveRunInputsChanged(inputs(2), inputs(2))).toBe(false);
    expect(haveRunInputsChanged(inputs(2), inputs(3))).toBe(true);
  });
});


describe('T5 — euro di oggi (RD6) e partenza dal FIRE', () => {
  const REAL = { ...CTX, inflationRate: 2 };

  it('A-T3: the euros of year s are divided by (1 + π)^s; the 1.026.497,88 € of year 3 is 967.291,88 € of today', () => {
    expect(deflate(1_026_497.88, 3, 2)).toBeCloseTo(967_291.88, 1);
    expect(deflate(100, 0, 2)).toBe(100);
    expect(deflate(100, 5, undefined)).toBe(100);
    expect(deflate(0, 7, 2)).toBe(0);
  });

  it('deflates the percentile rows year by year and keeps their order', () => {
    const rows = deflatePercentiles(makePercentiles(10, null), 2);
    expect(rows[10].p50).toBeCloseTo(530000 / Math.pow(1.02, 10), 6);
    for (const row of rows) expect(row.p10 <= row.p25 && row.p25 <= row.p50 && row.p50 <= row.p75 && row.p75 <= row.p90).toBe(true);
    expect(deflatePercentiles(makePercentiles(10, null), undefined)).toEqual(makePercentiles(10, null));
  });

  it('A-T10: the euros change, the probabilities, the failures and the failure years do not', () => {
    const results = makeResults();
    const nominal = summarizeMonteCarloRun(results, makeParams(), CTX);
    const real = summarizeMonteCarloRun(results, makeParams(), REAL);
    expect(real.successRate).toBe(nominal.successRate);
    expect(real.failureCount).toBe(nominal.failureCount);
    expect(real.p10DepletionYear).toBe(nominal.p10DepletionYear);
    expect(real.failureAverageYear).toBe(nominal.failureAverageYear);
    expect(real.medianFinal).toBeCloseTo(nominal.medianFinal / Math.pow(1.02, 35), 6);
    expect(real.todayEuros).toBe(true);
    expect(nominal.todayEuros).toBe(false);
  });

  it('dates the run from the FIRE year: years and ages are those of the withdrawal', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams({ retirementYears: 35 }), { startCalendarYear: 2031, currentAge: 51, startYears: 5, inflationRate: 2 });
    expect(run.endCalendarYear).toBe(2066);
    expect(run.endAge).toBe(86);
    expect(run.startYears).toBe(5);
    expect(run.p10DepletionCalendarYear).toBe(2031 + 27);
  });

  it('each scenario is deflated with its own inflation', () => {
    const results = { bear: makeResults(), base: makeResults(), bull: makeResults() };
    const comparison = summarizeScenarios(results, makeParams(), CTX, { bear: 3, base: 2, bull: 1 });
    expect(comparison.rows[0].medianFinal).toBeCloseTo(605000 / Math.pow(1.03, 35), 4);
    expect(comparison.rows[2].medianFinal).toBeCloseTo(605000 / Math.pow(1.01, 35), 4);
    expect(comparison.rows[1].todayEuros).toBe(true);
  });

  it('the overlay and the percentile rows are in today\'s euros; the nominal median stays beside the real one', () => {
    const results = { bear: makeResults(), base: makeResults(), bull: makeResults() };
    const overlay = buildOverlaySeries(results, 2031, { bear: 2, base: 2, bull: 2 });
    expect(overlay[5].baseP50).toBeCloseTo(515000 / Math.pow(1.02, 5), 6);
    const rows = buildPercentileRows(makePercentiles(10, null), 2031, 5, 2);
    expect(rows.map((row) => row.calendarYear)).toEqual([2031, 2036, 2041]);
    expect(rows[1].p50).toBeCloseTo(515000 / Math.pow(1.02, 5), 6);
    expect(rows[1].p50Nominal).toBe(515000);
  });

  it('the plan states pensions and unlocks in years OF THE WITHDRAWAL (RD4): dated 29 and 33 from today, FIRE at 7 ⇒ 22 and 26', () => {
    const params = makeParams({ annualInflows: [{ fromYear: 29, annualNetToday: 13000 }, { fromYear: 5, annualNetToday: 2000 }] });
    const plan = summarizeMonteCarloPlan(params, [{ year: 33, amount: 31400 }, { year: 4, amount: 9000 }], 0, { startCalendarYear: 2033, currentAge: 53, startYears: 7 });
    expect(plan.statePensions.map((pension) => pension.yearOffset)).toEqual([1, 22]);
    expect(plan.statePensions[1].calendarYear).toBe(2055);
    expect(plan.inflows).toEqual([{ yearOffset: 26, calendarYear: 2059, amount: 31400 }]);
  });

  it('the start year is a plan field: a new mode makes the last run stale', () => {
    const inputs = (startYear?: number): MonteCarloRunInputs => ({ params: makeParams({ startYear }), scenarios: defaultScenarios(), inflows: [] });
    expect(haveRunInputsChanged(inputs(5), inputs(5))).toBe(false);
    expect(haveRunInputsChanged(inputs(5), inputs(undefined))).toBe(true);
  });
});
