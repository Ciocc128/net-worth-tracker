/**
 * FIRE › Monte Carlo — the numbers of the tab, read from the results the service already ran.
 *
 * `runMonteCarloSimulation` produces the success rate, the per-year percentiles, the failure
 * analysis and the final-value histogram; this module turns one run (the base scenario) and the
 * three scenario runs into the shapes the tiles and the narrative read — the horizon dated in
 * calendar years and in age, the year the 10th percentile first touches zero (the «10% peggiore»
 * of the verdict), the final percentiles of ALL simulations (never the survivors-only median),
 * the histogram with the bin holding the median, the scenarios side by side, the Dettaglio's
 * overlay and percentile rows, the plan as typed, and the «changed since the last run» check.
 * Nothing here re-runs a simulation: every figure is one of the run's own.
 *
 * Pure and Firestore-free; `lib/utils/monteCarloNarrative.ts` puts these numbers into words.
 */

import type { MonteCarloCapitalInflow, MonteCarloMarketScenarios, MonteCarloParams, MonteCarloResults, PercentilesData } from '@/types/assets';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_NOUNS, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { weightsLeverage } from '@/lib/utils/monteCarloDraw';
import { datedFlowsSignature } from '@/lib/utils/datedFlows';
import type { VerdictTone } from '@/lib/utils/narrative';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface MonteCarloContext {
  /** Calendar year of the simulation's year 0. */
  startCalendarYear: number;
  /** The saved age, if any — names «fino a 81 anni»; null drops the age clauses. */
  currentAge: number | null;
  /** T5 (RD1): years from today to the year the withdrawals start (`startCalendarYear` and `currentAge` are already those of that year); 0/absent = today. */
  startYears?: number;
  /** T5 (RD6): the inflation of the scenario the run read, percent — every euro figure is shown in today's euros; absent = nominal, as before. */
  inflationRate?: number;
}

/** RD6: the euros of the year `year` of the run in today's euros (the run is already net of the `(1+π)^T` of the start). Zero stays zero. */
export function deflate(value: number, year: number, inflationRate: number | undefined): number {
  if (!inflationRate || year <= 0) return value;
  return value / Math.pow(1 + inflationRate / 100, year);
}

/** RD6: the per-year percentile rows in today's euros (the division is monotone, so the order of the percentiles holds). */
export function deflatePercentiles(percentiles: PercentilesData[], inflationRate: number | undefined): PercentilesData[] {
  if (!inflationRate) return percentiles;
  return percentiles.map((row) => ({
    year: row.year,
    p10: deflate(row.p10, row.year, inflationRate),
    p25: deflate(row.p25, row.year, inflationRate),
    p50: deflate(row.p50, row.year, inflationRate),
    p75: deflate(row.p75, row.year, inflationRate),
    p90: deflate(row.p90, row.year, inflationRate),
  }));
}

// ─── The base run ─────────────────────────────────────────────────────────────

export interface FinalPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

/** One bin of a final-value histogram (the Monte Carlo's distribution). */
export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  sharePct: number;
  /** The bin the median of all simulations falls in — outlined on the chart. */
  containsMedian: boolean;
}

export interface MonteCarloRun {
  successRate: number;
  successCount: number;
  failureCount: number;
  /** Of the failures, those a year's loss above the capital caused (leverage ruin, R4). */
  leverageFailureCount: number;
  /** The leverage of the weights, `Σw / 100`; 1 without. */
  leverage: number;
  simulations: number;
  years: number;
  endCalendarYear: number;
  endAge: number | null;
  /** The median final value of ALL simulations (failed ones count as 0): the last row's p50. */
  medianFinal: number;
  finalPercentiles: FinalPercentiles;
  /** First simulation year (1-based) at which the 10th percentile is zero; null when it never is. */
  p10DepletionYear: number | null;
  p10DepletionCalendarYear: number | null;
  p10DepletionAge: number | null;
  /** Among the failed simulations only — rounded to the year. */
  failureAverageYear: number | null;
  failureAverageCalendarYear: number | null;
  failureMedianYear: number | null;
  failureMedianCalendarYear: number | null;
  /** T5 (RD6): the euros of this run are today's (the context carried an inflation). */
  todayEuros: boolean;
  /** The inflation the euros were deflated with, percent; null when they are nominal. */
  inflationRate: number | null;
  /** T5: calendar year of withdrawal year 0 and the years from today to it. */
  startCalendarYear: number;
  startYears: number;
}

/**
 * The first year (from 1) at which the 10th percentile is zero — i.e. at least one simulation in
 * ten has run out of money by then. Year 0 is the starting capital and is never read.
 */
export function resolveP10DepletionYear(percentiles: PercentilesData[]): number | null {
  const hit = percentiles.find((row) => row.year >= 1 && row.p10 <= 0);
  return hit ? hit.year : null;
}

function calendarOf(year: number | null, ctx: MonteCarloContext): number | null {
  return year === null ? null : ctx.startCalendarYear + year;
}

function ageAt(year: number | null, ctx: MonteCarloContext): number | null {
  return year === null || ctx.currentAge === null ? null : ctx.currentAge + year;
}

export function summarizeMonteCarloRun(results: MonteCarloResults, params: MonteCarloParams, ctx: MonteCarloContext): MonteCarloRun {
  const years = params.retirementYears;
  const lastRow = results.percentiles[results.percentiles.length - 1];
  const finalReal = lastRow ? deflatePercentiles([lastRow], ctx.inflationRate)[0] : null;
  const finalPercentiles: FinalPercentiles = finalReal
    ? { p10: finalReal.p10, p25: finalReal.p25, p50: finalReal.p50, p75: finalReal.p75, p90: finalReal.p90 }
    : { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
  const p10DepletionYear = resolveP10DepletionYear(results.percentiles);
  const failureAverageYear = results.failureAnalysis ? Math.round(results.failureAnalysis.averageFailureYear) : null;
  const failureMedianYear = results.failureAnalysis ? Math.round(results.failureAnalysis.medianFailureYear) : null;
  return {
    successRate: results.successRate,
    successCount: results.successCount,
    failureCount: results.failureCount,
    leverageFailureCount: results.leverageFailureCount,
    leverage: weightsLeverage(MONTE_CARLO_CLASSES.map((cls) => params.weights[cls])),
    simulations: params.numberOfSimulations,
    years,
    endCalendarYear: ctx.startCalendarYear + years,
    endAge: ageAt(years, ctx),
    medianFinal: finalPercentiles.p50,
    finalPercentiles,
    p10DepletionYear,
    p10DepletionCalendarYear: calendarOf(p10DepletionYear, ctx),
    p10DepletionAge: ageAt(p10DepletionYear, ctx),
    failureAverageYear,
    failureAverageCalendarYear: calendarOf(failureAverageYear, ctx),
    failureMedianYear,
    failureMedianCalendarYear: calendarOf(failureMedianYear, ctx),
    todayEuros: ctx.inflationRate !== undefined,
    inflationRate: ctx.inflationRate ?? null,
    startCalendarYear: ctx.startCalendarYear,
    startYears: ctx.startYears ?? 0,
  };
}

// ─── The three scenarios ──────────────────────────────────────────────────────

export type ScenarioKey = 'bear' | 'base' | 'bull';

export interface ScenarioResults {
  bear: MonteCarloResults;
  base: MonteCarloResults;
  bull: MonteCarloResults;
  /** With leverage above 1: the Base run again with the weights scaled to 100, on the same shocks (D11). */
  unleveragedBase?: MonteCarloResults;
}

export interface ScenarioRunSummary {
  key: ScenarioKey;
  successRate: number;
  successCount: number;
  failureCount: number;
  /** Median final value of all simulations (the last row's p50). */
  medianFinal: number;
  p10DepletionCalendarYear: number | null;
  /** The median is in today's euros. */
  todayEuros: boolean;
}

export interface ScenarioComparison {
  /** Bear, base, bull — in that order. */
  rows: ScenarioRunSummary[];
  /** Bull probability minus bear probability, in points. */
  spreadPoints: number;
}

export const SCENARIO_KEYS: ScenarioKey[] = ['bear', 'base', 'bull'];

/** RD6: the inflation of each scenario, percent — the euros of a row are deflated with its OWN scenario's. */
export type ScenarioInflation = Record<ScenarioKey, number>;

export function summarizeScenarios(results: ScenarioResults, params: MonteCarloParams, ctx: MonteCarloContext, inflation?: ScenarioInflation): ScenarioComparison {
  const rows = SCENARIO_KEYS.map((key) => {
    const run = summarizeMonteCarloRun(results[key], params, inflation ? { ...ctx, inflationRate: inflation[key] } : ctx);
    return {
      key,
      successRate: run.successRate,
      successCount: run.successCount,
      failureCount: run.failureCount,
      medianFinal: run.medianFinal,
      p10DepletionCalendarYear: run.p10DepletionCalendarYear,
      todayEuros: run.todayEuros,
    };
  });
  return { rows, spreadPoints: rows[2].successRate - rows[0].successRate };
}

// ─── Dettaglio: the overlay and the percentile rows ──────────────────────────

export interface OverlayPoint {
  calendarYear: number;
  bearP50: number;
  baseP50: number;
  bullP50: number;
  /** The base scenario's 10–90 band, drawn faintly behind the three medians. */
  baseBand: [number, number];
}

/** The three medians and the base band on one calendar axis (the base run sets the length). */
export function buildOverlaySeries(results: ScenarioResults, startCalendarYear: number, inflation?: ScenarioInflation): OverlayPoint[] {
  return results.base.percentiles.map((baseRow, index) => {
    const bear = results.bear.percentiles[index];
    const bull = results.bull.percentiles[index];
    return {
      calendarYear: startCalendarYear + baseRow.year,
      bearP50: bear ? deflate(bear.p50, bear.year, inflation?.bear) : 0,
      baseP50: deflate(baseRow.p50, baseRow.year, inflation?.base),
      bullP50: bull ? deflate(bull.p50, bull.year, inflation?.bull) : 0,
      baseBand: [deflate(baseRow.p10, baseRow.year, inflation?.base), deflate(baseRow.p90, baseRow.year, inflation?.base)],
    };
  });
}

export interface PercentileRow extends FinalPercentiles {
  calendarYear: number;
  /** RD6: the nominal median of the year, the one column that stays in nominal euros. */
  p50Nominal: number;
}

/** Every `step` years from year 0, plus the last year whatever the horizon; in today's euros when `inflationRate` is given (RD6). */
export function buildPercentileRows(percentiles: PercentilesData[], startCalendarYear: number, step = 5, inflationRate?: number): PercentileRow[] {
  const lastIndex = percentiles.length - 1;
  return percentiles
    .filter((row, index) => row.year % step === 0 || index === lastIndex)
    .map((row) => ({
      calendarYear: startCalendarYear + row.year,
      p10: deflate(row.p10, row.year, inflationRate),
      p25: deflate(row.p25, row.year, inflationRate),
      p50: deflate(row.p50, row.year, inflationRate),
      p75: deflate(row.p75, row.year, inflationRate),
      p90: deflate(row.p90, row.year, inflationRate),
      p50Nominal: row.p50,
    }));
}

// ─── The plan as typed ────────────────────────────────────────────────────────

export type AllocationKey = MonteCarloClass;

export interface PlanAllocationEntry {
  key: AllocationKey;
  /** The class as the sentence names it («azioni»). */
  label: string;
  pct: number;
}

export interface PlanInflow {
  yearOffset: number;
  calendarYear: number;
  amount: number;
}

/** A state pension the withdrawal is net of, from its start year (2026-09-24). */
export interface PlanStatePension {
  yearOffset: number;
  calendarYear: number;
  /** Net, at today's value. */
  annualNetToday: number;
}

/** The tax on withdrawals as the plan states it. */
export interface PlanWithdrawalTax {
  /** Percent. */
  rate: number;
  /** The gain share of the starting capital, percent. */
  gainSharePct: number;
}

export interface MonteCarloPlan {
  initialPortfolio: number;
  /** The pension capital the lock keeps out of the starting portfolio (0 without the lock). */
  lockedValue: number;
  annualWithdrawal: number;
  isIndexed: boolean;
  years: number;
  endAge: number | null;
  endCalendarYear: number;
  simulations: number;
  /** Only the classes above 0%, in the model's order. */
  allocation: PlanAllocationEntry[];
  inflows: PlanInflow[];
  /** The state pensions taken off the withdrawal, in start order; empty when none is dated. */
  statePensions: PlanStatePension[];
  /** Null when the tax is not modelled (no cost basis in the portfolio). */
  withdrawalTax: PlanWithdrawalTax | null;
}

export function summarizeMonteCarloPlan(params: MonteCarloParams, inflows: MonteCarloCapitalInflow[], lockedValue: number, ctx: MonteCarloContext): MonteCarloPlan {
  // RD4: from the FIRE year `T` the years of a pension or an unlock are the ones OF THE WITHDRAWAL («dall'anno 22»); what is dated at or before `T` is already in the capital.
  const startYears = ctx.startYears ?? 0;
  return {
    initialPortfolio: params.initialPortfolio,
    lockedValue,
    annualWithdrawal: params.annualWithdrawal,
    isIndexed: params.withdrawalAdjustment === 'inflation',
    years: params.retirementYears,
    endAge: ageAt(params.retirementYears, ctx),
    endCalendarYear: ctx.startCalendarYear + params.retirementYears,
    simulations: params.numberOfSimulations,
    allocation: MONTE_CARLO_CLASSES.map((key) => ({ key, label: MONTE_CARLO_CLASS_NOUNS[key], pct: params.weights[key] })).filter((entry) => entry.pct > 0),
    inflows: inflows
      .filter((inflow) => startYears === 0 || inflow.year > startYears)
      .map((inflow) => ({ yearOffset: inflow.year - startYears, calendarYear: ctx.startCalendarYear + inflow.year - startYears, amount: inflow.amount })),
    statePensions: (params.annualInflows ?? [])
      .map((pension) => {
        const yearOffset = startYears === 0 ? pension.fromYear : Math.max(1, pension.fromYear - startYears);
        return { yearOffset, calendarYear: ctx.startCalendarYear + yearOffset, annualNetToday: pension.annualNetToday };
      })
      .sort((a, b) => a.yearOffset - b.yearOffset),
    withdrawalTax: params.withdrawalTax
      ? { rate: params.withdrawalTax.rate, gainSharePct: params.initialPortfolio > 0 ? Math.max(0, 1 - params.withdrawalTax.basisToday / params.initialPortfolio) * 100 : 0 }
      : null,
  };
}

// ─── Changed since the last run? ──────────────────────────────────────────────

export interface MonteCarloRunInputs {
  params: MonteCarloParams;
  scenarios: MonteCarloMarketScenarios;
  inflows: MonteCarloCapitalInflow[];
  /** RQ6 (Q2): the uncertainty per class (points) the Base drew its paths' means from; absent = none. */
  uncertainty?: Record<MonteCarloClass, number>;
}

/** The plan fields a run reads (the weights are compared class by class below). The `market` on the shared params is NOT among them: the scenarios carry it. */
const PLAN_FIELDS: (keyof MonteCarloParams)[] = [
  'initialPortfolio',
  'retirementYears',
  'annualWithdrawal',
  'withdrawalAdjustment',
  'numberOfSimulations',
  'leverageSpread',
  'startYear',
];

/**
 * True when the typed inputs differ from the ones the shown results were run with — the
 * Parametri footer then says the figures are the last run's until Esegui is pressed.
 */
export function haveRunInputsChanged(last: MonteCarloRunInputs, current: MonteCarloRunInputs): boolean {
  if (PLAN_FIELDS.some((field) => last.params[field] !== current.params[field])) return true;
  if (MONTE_CARLO_CLASSES.some((cls) => last.params.weights[cls] !== current.params.weights[cls])) return true;
  // The RESOLVED market, scenario by scenario: a save in Impostazioni makes the last run stale (The Stale-Run Rule).
  for (const key of SCENARIO_KEYS) {
    const a = last.scenarios[key];
    const b = current.scenarios[key];
    if (a.inflationRate !== b.inflationRate) return true;
    if (MONTE_CARLO_CLASSES.some((cls) => a.classes[cls].cagr !== b.classes[cls].cagr || a.classes[cls].volatility !== b.classes[cls].volatility)) return true;
  }
  if (MONTE_CARLO_CLASSES.some((cls) => (last.uncertainty?.[cls] ?? 0) !== (current.uncertainty?.[cls] ?? 0))) return true;
  // The correlations ride on the shared params: a save in Impostazioni › Simulazioni makes the last run stale too.
  const lastCorrelations = last.params.correlations ?? [];
  const currentCorrelations = current.params.correlations ?? [];
  if (lastCorrelations.length !== currentCorrelations.length || lastCorrelations.some((value, index) => value !== currentCorrelations[index])) return true;
  if (last.inflows.length !== current.inflows.length) return true;
  if (last.inflows.some((inflow, index) => inflow.year !== current.inflows[index].year || inflow.amount !== current.inflows[index].amount)) return true;
  // The pensions and the tax ride on the params (settings-derived): a change is a new plan too.
  const lastPensions = last.params.annualInflows ?? [];
  const currentPensions = current.params.annualInflows ?? [];
  if (lastPensions.length !== currentPensions.length) return true;
  if (lastPensions.some((pension, index) => pension.fromYear !== currentPensions[index].fromYear || pension.annualNetToday !== currentPensions[index].annualNetToday)) return true;
  // § 12: the dated flows ride on the params too — a saved flow (or a mortgage that ended) is a new plan.
  if (datedFlowsSignature(last.params.flows) !== datedFlowsSignature(current.params.flows)) return true;
  const lastTax = last.params.withdrawalTax;
  const currentTax = current.params.withdrawalTax;
  if (!!lastTax !== !!currentTax) return true;
  return !!lastTax && !!currentTax && (lastTax.basisToday !== currentTax.basisToday || lastTax.rate !== currentTax.rate);
}

// ─── Tone ─────────────────────────────────────────────────────────────────────

/** The old hero's thresholds, kept: ≥ 90 solid, 80–89 to watch, below 80 to rework. */
export function resolveSuccessTone(successRate: number): VerdictTone {
  if (successRate >= 90) return 'positive';
  if (successRate >= 80) return 'warning';
  return 'negative';
}

// ─── The form's numbers ───────────────────────────────────────────────────────

/**
 * Parses what the Patrimonio iniziale field holds — an it-IT amount («488.600,00»), a plain
 * number («488600») or a mix — into a number; null when nothing numeric is typed.
 */
export function parseItalianNumber(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '');
  if (cleaned === '') return null;
  // A comma is the decimal separator; dots are thousands separators unless no comma is present
  // and there is exactly one dot followed by 1-2 digits (a plain «12.5» typed by hand).
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : /^-?\d+\.\d{1,2}$/.test(cleaned)
      ? cleaned
      : cleaned.replace(/\./g, '');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

/** «488.600» — how the amount field prints a committed value. */
export function formatInputAmount(value: number): string {
  return Math.round(value).toLocaleString('it-IT');
}
