/**
 * FIRE › Proiezione's numbers: the pure layer over what `runAccumulationSimulation` keeps
 * (doc/montecarlo/README.md § 11, RV1–RV7). The run hands back, per scenario and per year, the
 * NOMINAL values of every path sorted ascending; everything the tab shows is a reading of those
 * arrays — percentiles (RV4, index floor(n × p)), probabilities (RV5), today's euros (RV3).
 *
 * Reading, not running: a new threshold or a shorter horizon costs a binary search, never a run
 * (the declared exception to The Stale-Run Rule, § 11.6).
 */

import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';
import type { MonteCarloCapitalInflow, MonteCarloMarketSettings } from '@/types/assets';
import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { binSortedValues } from '@/lib/utils/valueHistogram';
import { datedFlowsSignature, type DatedFlowsInput } from '@/lib/utils/datedFlows';
import { SCENARIO_KEYS, type HistogramBin, type MonteCarloContext, type ScenarioKey } from '@/lib/utils/monteCarloSummary';

export type { ScenarioKey };

/** Years the Tappe table names, when they fit the run. */
export const PROJECTION_MILESTONES = [10, 20, 30, 40, 50] as const;
/** The horizon of a run is at least this: the Tappe table reaches 50 years without a second run (§ 11.7.2). */
export const PROJECTION_MIN_RUN_YEARS = 50;
export const PROJECTION_MAX_YEARS = 60;
export const DEFAULT_PROJECTION_HORIZON = 30;

/** What one scenario's run keeps: sorted nominal values per year (1…H) and the leveraged-wipe-out count. */
export interface ProjectionScenarioRun {
  snapshots: Record<number, Float64Array>;
  leverageZeroedCount: number;
}

export interface ProjectionRunData {
  scenarios: Record<ScenarioKey, ProjectionScenarioRun>;
  /** Inflation π of each scenario, percent (RP3). */
  inflation: Record<ScenarioKey, number>;
  /** Value at year 0: the capital plus the inflows already due (RV1). */
  startValue: number;
  simulations: number;
  /** H: the last year the run kept. */
  years: number;
}

/** The run's horizon `H`: at least 50 years, or the chosen horizon when it is longer (§ 11.7.2). */
export function resolveRunYears(horizon: number): number {
  return Math.min(PROJECTION_MAX_YEARS, Math.max(PROJECTION_MIN_RUN_YEARS, Math.floor(horizon)));
}

// ─── Reading a sorted array ───────────────────────────────────────────────────

/** RV4: the value at index floor(n × p) of the ascending values. */
export function percentileOf(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** How many of the ascending `sorted` values are at least `x` (binary search). */
export function countAtLeast(sorted: ArrayLike<number>, x: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid] >= x) high = mid;
    else low = mid + 1;
  }
  return sorted.length - low;
}

/** RV3: `(1 + π)^t`, π in percent. */
export function inflationFactor(inflationPct: number, years: number): number {
  return Math.pow(1 + inflationPct / 100, years);
}

/** RV6: today's FIRE number, `expenses ÷ SWR`; null when there are no expenses (the field stays empty). */
export function resolveProjectionThreshold(annualExpenses: number | null | undefined, swrPct: number | null | undefined): number | null {
  if (!annualExpenses || !(annualExpenses > 0)) return null;
  const swr = swrPct && swrPct > 0 ? swrPct : 4;
  return annualExpenses / (swr / 100);
}

// ─── The summary ──────────────────────────────────────────────────────────────

export interface ProjectionPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

/** One year of the fan, in today's euros. */
export interface ProjectionYearPoint extends ProjectionPercentiles {
  year: number;
  calendarYear: number;
  /** The median in the euros of that year (RV3: the same percentile, not deflated). */
  p50Nominal: number;
}

export interface ProjectionFigures extends ProjectionPercentiles {
  year: number;
  calendarYear: number;
  age: number | null;
  p50Nominal: number;
  /** RV5: share (0–100) of paths at or above the threshold in today's euros; null with no threshold. */
  probabilityAtLeast: number | null;
  /** RV5: share (0–100) of paths below the starting capital in today's purchasing power. */
  probabilityBelowStart: number;
}

export interface ScenarioProjection {
  key: ScenarioKey;
  series: ProjectionYearPoint[];
  atHorizon: ProjectionFigures;
  /** The Tappe rows: the milestones that fit, plus the chosen horizon. */
  milestones: ProjectionFigures[];
  /** RV2: share (0–100) of the paths wiped out at least once by a leveraged year. */
  leverageZeroedShare: number;
  leverageZeroedCount: number;
}

export interface ProjectionSummary {
  horizon: number;
  endCalendarYear: number;
  endAge: number | null;
  simulations: number;
  threshold: number | null;
  startingCapital: number;
  scenarios: Record<ScenarioKey, ScenarioProjection>;
  /** The base scenario's real values at the horizon, in the Monte Carlo's bins (the shared rule). */
  histogram: HistogramBin[];
  /** Upper bound of the equal-width range / of the last bin, as the footer of the tile says. */
  histogramCap: number;
  histogramMax: number;
}

export interface SummarizeProjectionOptions {
  horizon: number;
  threshold: number | null;
  /** `K`: the capital RV5's «below the start» compares with (not `K` plus what is saved). */
  startingCapital: number;
  ctx: MonteCarloContext;
}

function ageAt(year: number, ctx: MonteCarloContext): number | null {
  return ctx.currentAge === null ? null : ctx.currentAge + year;
}

function figuresAt(
  snapshot: Float64Array,
  year: number,
  inflationPct: number,
  options: SummarizeProjectionOptions,
): ProjectionFigures {
  const factor = inflationFactor(inflationPct, year);
  const real = (p: number) => percentileOf(snapshot, p) / factor;
  const n = snapshot.length;
  const atLeast = options.threshold !== null && n > 0 ? (countAtLeast(snapshot, options.threshold * factor) / n) * 100 : null;
  const belowStart = n > 0 ? ((n - countAtLeast(snapshot, options.startingCapital * factor)) / n) * 100 : 0;
  return {
    year,
    calendarYear: options.ctx.startCalendarYear + year,
    age: ageAt(year, options.ctx),
    p10: real(0.1),
    p25: real(0.25),
    p50: real(0.5),
    p75: real(0.75),
    p90: real(0.9),
    p50Nominal: percentileOf(snapshot, 0.5),
    probabilityAtLeast: atLeast,
    probabilityBelowStart: belowStart,
  };
}

/** Which years the Tappe table lists: the milestones within the horizon of the run, plus the chosen horizon. */
export function resolveMilestoneYears(horizon: number, runYears: number): number[] {
  const years = new Set<number>(PROJECTION_MILESTONES.filter((year) => year <= runYears));
  years.add(horizon);
  return [...years].sort((a, b) => a - b);
}

export function summarizeProjection(data: ProjectionRunData, options: SummarizeProjectionOptions): ProjectionSummary {
  const horizon = Math.min(data.years, Math.max(1, Math.floor(options.horizon)));
  const milestoneYears = resolveMilestoneYears(horizon, data.years);

  const scenarios = {} as Record<ScenarioKey, ScenarioProjection>;
  for (const key of SCENARIO_KEYS) {
    const run = data.scenarios[key];
    const inflation = data.inflation[key];
    const series: ProjectionYearPoint[] = [
      {
        year: 0,
        calendarYear: options.ctx.startCalendarYear,
        p10: data.startValue,
        p25: data.startValue,
        p50: data.startValue,
        p75: data.startValue,
        p90: data.startValue,
        p50Nominal: data.startValue,
      },
    ];
    for (let year = 1; year <= data.years; year++) {
      const snapshot = run.snapshots[year];
      if (!snapshot) continue;
      const factor = inflationFactor(inflation, year);
      series.push({
        year,
        calendarYear: options.ctx.startCalendarYear + year,
        p10: percentileOf(snapshot, 0.1) / factor,
        p25: percentileOf(snapshot, 0.25) / factor,
        p50: percentileOf(snapshot, 0.5) / factor,
        p75: percentileOf(snapshot, 0.75) / factor,
        p90: percentileOf(snapshot, 0.9) / factor,
        p50Nominal: percentileOf(snapshot, 0.5),
      });
    }
    scenarios[key] = {
      key,
      series,
      atHorizon: figuresAt(run.snapshots[horizon], horizon, inflation, options),
      milestones: milestoneYears.filter((year) => run.snapshots[year]).map((year) => figuresAt(run.snapshots[year], year, inflation, options)),
      leverageZeroedCount: run.leverageZeroedCount,
      leverageZeroedShare: data.simulations > 0 ? (run.leverageZeroedCount / data.simulations) * 100 : 0,
    };
  }

  // The histogram of the base scenario's values in today's euros: dividing by one factor keeps them sorted.
  const baseSnapshot = data.scenarios.base.snapshots[horizon];
  const baseFactor = inflationFactor(data.inflation.base, horizon);
  const realValues = Float64Array.from(baseSnapshot, (value) => value / baseFactor);
  const median = percentileOf(realValues, 0.5);
  const bins = binSortedValues(realValues, 10);
  const last = bins.length - 1;
  const histogram: HistogramBin[] = bins.map((bin, index) => ({
    from: bin.from,
    to: bin.to,
    count: bin.count,
    sharePct: (bin.count / realValues.length) * 100,
    containsMedian: index === last ? median >= bin.from && median <= bin.to : median >= bin.from && median < bin.to,
  }));

  return {
    horizon,
    endCalendarYear: options.ctx.startCalendarYear + horizon,
    endAge: ageAt(horizon, options.ctx),
    simulations: data.simulations,
    threshold: options.threshold,
    startingCapital: options.startingCapital,
    scenarios,
    histogram,
    histogramCap: histogram.length > 1 ? histogram[histogram.length - 2].to : histogram.length === 1 ? histogram[0].to : 0,
    histogramMax: histogram.length > 0 ? histogram[histogram.length - 1].to : 0,
  };
}

// ─── Changed since the last run? ──────────────────────────────────────────────

export interface ProjectionRunInputs {
  initialPortfolio: number;
  /** Today's annual saving, before the indexing (RV1's `S`). */
  annualSavings: number;
  /** `N_v`: years the saving is paid. */
  savingsYears: number;
  simulations: number;
  /** The chosen horizon (a reading while it fits in the run, § 11.6). */
  horizon: number;
  /** `H` the run kept (current: what a run made now would keep). */
  years: number;
  weights: Record<MonteCarloClass, number>;
  scenarios: MonteCarloMarketSettings['scenarios'];
  correlations: number[] | undefined;
  leverageSpread: number | undefined;
  /** RC3 on the run's weights: percent a year of TER and stamp duty (absent = 0). */
  costRate?: number;
  inflows: MonteCarloCapitalInflow[];
  /** § 12 (RF10): the dated flows the run read; absent = none. */
  datedFlows?: DatedFlowsInput;
}

/**
 * True when the typed plan differs from the one the figures were run with. The threshold is not an
 * input; the horizon is one only when it reaches past the years the run kept (P11).
 */
export function haveProjectionInputsChanged(last: ProjectionRunInputs, current: ProjectionRunInputs): boolean {
  if (current.horizon > last.years) return true;
  if (last.initialPortfolio !== current.initialPortfolio || last.annualSavings !== current.annualSavings || last.savingsYears !== current.savingsYears) return true;
  if (last.simulations !== current.simulations || last.leverageSpread !== current.leverageSpread || (last.costRate ?? 0) !== (current.costRate ?? 0)) return true;
  if (MONTE_CARLO_CLASSES.some((cls) => last.weights[cls] !== current.weights[cls])) return true;
  for (const key of SCENARIO_KEYS) {
    const a = last.scenarios[key];
    const b = current.scenarios[key];
    if (a.inflationRate !== b.inflationRate) return true;
    if (MONTE_CARLO_CLASSES.some((cls) => a.classes[cls].cagr !== b.classes[cls].cagr || a.classes[cls].volatility !== b.classes[cls].volatility)) return true;
  }
  const lastCorrelations = last.correlations ?? [];
  const currentCorrelations = current.correlations ?? [];
  if (lastCorrelations.length !== currentCorrelations.length || lastCorrelations.some((value, index) => value !== currentCorrelations[index])) return true;
  if (last.inflows.length !== current.inflows.length) return true;
  if (datedFlowsSignature(last.datedFlows) !== datedFlowsSignature(current.datedFlows)) return true;
  return last.inflows.some((inflow, index) => inflow.year !== current.inflows[index].year || inflow.amount !== current.inflows[index].amount);
}
