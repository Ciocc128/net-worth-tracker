import { describe, it, expect } from 'vitest';
import {
  countAtLeast,
  haveProjectionInputsChanged,
  inflationFactor,
  percentileOf,
  resolveMilestoneYears,
  resolveProjectionThreshold,
  resolveRunYears,
  summarizeProjection,
  type ProjectionRunData,
  type ProjectionRunInputs,
  type ProjectionScenarioRun,
} from '@/lib/utils/projectionSummary';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import type { MonteCarloMarketScenario } from '@/types/assets';

/** Standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9). */
function normalQuantile(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const N_PATHS = 100_000;

/** The sorted nominal values `K·exp(t·m + z·s·√t)`, one per quantile — the real ones are these over `(1+π)^t` (P1's closed form). */
function lognormalSnapshot(capital: number, years: number, m: number, s: number): Float64Array {
  return Float64Array.from({ length: N_PATHS }, (_, i) => capital * Math.exp(years * m + normalQuantile((i + 0.5) / N_PATHS) * s * Math.sqrt(years)));
}

const BASE_M = 0.095492;
const BASE_S = 0.1724395;

function flatScenario(years: number, k: number, m: number, s: number, zeroed = 0): ProjectionScenarioRun {
  const snapshots: Record<number, Float64Array> = {};
  for (let year = 1; year <= years; year++) snapshots[year] = lognormalSnapshot(k, year, m, s);
  return { snapshots, leverageZeroedCount: zeroed };
}

const ctx = { startCalendarYear: 2026, currentAge: 40 };

function baseData(): ProjectionRunData {
  const base = flatScenario(50, 100_000, BASE_M, BASE_S);
  return { scenarios: { bear: base, base, bull: base }, inflation: { bear: 3.04, base: 3.04, bull: 3.04 }, startValue: 100_000, simulations: N_PATHS, years: 50 };
}

const near = (actual: number, expected: number, tolerance = 0.003) => expect(Math.abs(actual / expected - 1)).toBeLessThan(tolerance);

describe('summarizeProjection — closed-form reference values (P1–P4)', () => {
  const data = baseData();
  const summary = summarizeProjection(data, { horizon: 30, threshold: 800_000, startingCapital: 100_000, ctx });

  it('P1: percentiles at 30 years in today\'s euros, and the nominal median', () => {
    const at = summary.scenarios.base.atHorizon;
    near(at.p10, 212_960);
    near(at.p25, 377_839);
    near(at.p50, 714_453);
    near(at.p75, 1_350_954);
    near(at.p90, 2_396_896);
    near(at.p50Nominal, 1_754_483);
  });

  it('RV3: the nominal median over the inflation factor is the real median', () => {
    const at = summary.scenarios.base.atHorizon;
    expect(at.p50Nominal / inflationFactor(3.04, 30)).toBeCloseTo(at.p50, 6);
  });

  it('P2: the Tappe rows at 10 / 20 / 50 years', () => {
    const rows = summary.scenarios.base.milestones;
    expect(rows.map((row) => row.year)).toEqual([10, 20, 30, 40, 50]);
    near(rows[0].p50, 192_601);
    near(rows[0].p10, 95_754);
    near(rows[1].p50, 370_950);
    near(rows[1].p10, 138_071);
    near(rows[4].p50, 2_650_266);
    near(rows[4].p10, 555_451);
  });

  it('P3: probability above a threshold and below the starting capital', () => {
    const threshold = (x: number) => summarizeProjection(data, { horizon: 30, threshold: x, startingCapital: 100_000, ctx }).scenarios.base.atHorizon.probabilityAtLeast ?? NaN;
    expect(threshold(500_000)).toBeCloseTo(64.72, 0);
    expect(threshold(1_000_000)).toBeCloseTo(36.09, 0);
    expect(summary.scenarios.base.atHorizon.probabilityBelowStart).toBeCloseTo(1.87, 0);
  });

  it('P4: three scenarios on one threshold (each scenario\'s spread solved from its reference figures)', () => {
    const years = 30;
    const f = inflationFactor(3.04, years);
    const scenarioFor = (medianReal: number, probability: number) => {
      const tm = Math.log((medianReal * f) / 100_000);
      const z = normalQuantile(1 - probability);
      const sRoot = (Math.log((800_000 * f) / 100_000) - tm) / z;
      return flatScenario(years, 100_000, tm / years, sRoot / Math.sqrt(years));
    };
    const three: ProjectionRunData = {
      scenarios: { bear: scenarioFor(410_907, 0.216), base: scenarioFor(714_453, 0.4523), bull: scenarioFor(1_283_657, 0.6794) },
      inflation: { bear: 3.04, base: 3.04, bull: 3.04 },
      startValue: 100_000,
      simulations: N_PATHS,
      years,
    };
    const result = summarizeProjection(three, { horizon: 30, threshold: 800_000, startingCapital: 100_000, ctx });
    near(result.scenarios.bear.atHorizon.p50, 410_907);
    near(result.scenarios.bull.atHorizon.p50, 1_283_657);
    expect(result.scenarios.bear.atHorizon.probabilityAtLeast).toBeCloseTo(21.6, 0);
    expect(result.scenarios.base.atHorizon.probabilityAtLeast).toBeCloseTo(45.23, 0);
    expect(result.scenarios.bull.atHorizon.probabilityAtLeast).toBeCloseTo(67.94, 0);
  });
});

describe('summarizeProjection — shape', () => {
  const data = baseData();

  it('the series starts at the starting value in every percentile and runs to H', () => {
    const series = summarizeProjection(data, { horizon: 30, threshold: null, startingCapital: 100_000, ctx }).scenarios.base.series;
    expect(series).toHaveLength(51);
    expect(series[0]).toMatchObject({ year: 0, calendarYear: 2026, p10: 100_000, p50: 100_000, p90: 100_000 });
    expect(series[30].calendarYear).toBe(2056);
  });

  it('no threshold means no probability, and age follows the saved age', () => {
    const at = summarizeProjection(data, { horizon: 30, threshold: null, startingCapital: 100_000, ctx }).scenarios.base.atHorizon;
    expect(at.probabilityAtLeast).toBeNull();
    expect(at.age).toBe(70);
    expect(summarizeProjection(data, { horizon: 30, threshold: null, startingCapital: 100_000, ctx: { ...ctx, currentAge: null } }).endAge).toBeNull();
  });

  it('the chosen horizon joins the milestones when it is not one of them', () => {
    expect(resolveMilestoneYears(25, 50)).toEqual([10, 20, 25, 30, 40, 50]);
    expect(resolveMilestoneYears(30, 50)).toEqual([10, 20, 30, 40, 50]);
    expect(resolveMilestoneYears(5, 50)).toEqual([5, 10, 20, 30, 40, 50]);
    expect(resolveMilestoneYears(55, 55)).toEqual([10, 20, 30, 40, 50, 55]);
  });

  it('the histogram bins the real values and outlines the median\'s bin', () => {
    const { histogram } = summarizeProjection(data, { horizon: 30, threshold: null, startingCapital: 100_000, ctx });
    expect(histogram).toHaveLength(10);
    expect(histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(N_PATHS);
    expect(histogram.filter((bin) => bin.containsMedian)).toHaveLength(1);
  });

  it('reports the leveraged wipe-out share', () => {
    const run = { ...data, scenarios: { ...data.scenarios, base: { ...data.scenarios.base, leverageZeroedCount: 3_000 } } };
    const summary = summarizeProjection(run, { horizon: 30, threshold: null, startingCapital: 100_000, ctx });
    expect(summary.scenarios.base.leverageZeroedShare).toBeCloseTo(3, 6);
  });
});

describe('readings', () => {
  it('percentileOf is floor(n × p) on the sorted values', () => {
    const values = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(percentileOf(values, 0.1)).toBe(2);
    expect(percentileOf(values, 0.5)).toBe(6);
    expect(percentileOf(values, 0.9)).toBe(10);
    expect(percentileOf(values, 1)).toBe(10);
  });

  it('countAtLeast counts values at or above x', () => {
    const values = Float64Array.from([1, 2, 2, 3, 5]);
    expect(countAtLeast(values, 2)).toBe(4);
    expect(countAtLeast(values, 6)).toBe(0);
    expect(countAtLeast(values, 0)).toBe(5);
  });

  it('P10: the default threshold is the plan\'s expenses over the SWR', () => {
    expect(resolveProjectionThreshold(32_000, 4)).toBe(800_000);
    expect(resolveProjectionThreshold(32_000, undefined)).toBe(800_000);
    expect(resolveProjectionThreshold(30_000, 3)).toBeCloseTo(1_000_000, 6);
    expect(resolveProjectionThreshold(null, 4)).toBeNull();
    expect(resolveProjectionThreshold(0, 4)).toBeNull();
  });

  it('the run keeps at least 50 years, at most 60', () => {
    expect(resolveRunYears(30)).toBe(50);
    expect(resolveRunYears(55)).toBe(55);
    expect(resolveRunYears(80)).toBe(60);
  });
});

describe('haveProjectionInputsChanged (P11)', () => {
  const market: MonteCarloMarketScenario = { classes: monteCarloClassRecord(() => ({ cagr: 5, volatility: 10 })), inflationRate: 3 };
  const inputs = (overrides: Partial<ProjectionRunInputs> = {}): ProjectionRunInputs => ({
    initialPortfolio: 100_000,
    annualSavings: 12_000,
    savingsYears: 30,
    simulations: 10_000,
    horizon: 30,
    years: 50,
    weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 100 : 0)),
    scenarios: { bear: market, base: market, bull: market },
    correlations: undefined,
    leverageSpread: 2,
    inflows: [],
    ...overrides,
  });

  it('an identical plan is not stale; a shorter horizon inside the run is not either', () => {
    expect(haveProjectionInputsChanged(inputs(), inputs())).toBe(false);
    expect(haveProjectionInputsChanged(inputs(), inputs({ horizon: 45 }))).toBe(false);
    expect(haveProjectionInputsChanged(inputs(), inputs({ horizon: 10 }))).toBe(false);
  });

  it('§ 12: the dated flows make it stale when they change', () => {
    const lump = { id: 'l', label: 'Eredità', kind: 'lumpIn' as const, sigma: 0 as const, indexed: false, amount: 50_000, anchor: 'fixed' as const, start: 5, durationYears: null, inCashflowToday: false };
    const flows = (amount: number) => ({ resolved: [{ ...lump, amount }], planExpensesFromCashflow: true });
    expect(haveProjectionInputsChanged(inputs(), inputs({ datedFlows: flows(50_000) }))).toBe(true);
    expect(haveProjectionInputsChanged(inputs({ datedFlows: flows(50_000) }), inputs({ datedFlows: flows(50_000) }))).toBe(false);
    expect(haveProjectionInputsChanged(inputs({ datedFlows: flows(50_000) }), inputs({ datedFlows: flows(60_000) }))).toBe(true);
  });

  it('a horizon past the run\'s years is stale', () => {
    expect(haveProjectionInputsChanged(inputs(), inputs({ horizon: 55, years: 55 }))).toBe(true);
  });

  it('capital, savings, weights, market and inflows make it stale', () => {
    expect(haveProjectionInputsChanged(inputs(), inputs({ initialPortfolio: 110_000 }))).toBe(true);
    expect(haveProjectionInputsChanged(inputs(), inputs({ annualSavings: 0 }))).toBe(true);
    expect(haveProjectionInputsChanged(inputs(), inputs({ savingsYears: 15 }))).toBe(true);
    expect(haveProjectionInputsChanged(inputs(), inputs({ weights: monteCarloClassRecord((cls) => (cls === 'bonds' ? 100 : 0)) }))).toBe(true);
    expect(haveProjectionInputsChanged(inputs(), inputs({ scenarios: { bear: market, base: { ...market, inflationRate: 4 }, bull: market } }))).toBe(true);
    expect(haveProjectionInputsChanged(inputs(), inputs({ inflows: [{ year: 10, amount: 5_000 }] }))).toBe(true);
  });
});
