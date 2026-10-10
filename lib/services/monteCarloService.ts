import {
  MonteCarloParams,
  MonteCarloResults,
  MonteCarloCapitalInflow,
  SingleSimulationResult,
  PercentilesData,
  MonteCarloMarketScenario,
} from '@/types/assets';
import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';
import { buildDrawPlan, drawPathMeans, drawYear, portfolioReturn, type DrawPlan } from '@/lib/utils/monteCarloDraw';
import { formatCurrencyCompact } from './chartService';
import { withdrawGross } from '@/lib/utils/withdrawalTax';
import { binSortedValues } from '@/lib/utils/valueHistogram';
import { buildFlowSchedule, buildFlowYearTables, type DatedFlowsInput, type FlowYearTables } from '@/lib/utils/datedFlows';

/** A net annual amount that arrives every year from `fromYear` on, at today's value. */
export interface AnnualInflow {
  fromYear: number;
  annualNetToday: number;
}

/** The tax on withdrawals as the engines take it (`lib/utils/withdrawalTax.ts`). */
export interface WithdrawalTaxInput {
  basisToday: number;
  /** Percent. */
  rate: number;
}

/** The net pensions active at `year`, indexed with `inflationRate` from today (nominal at that year). */
function activeAnnualInflows(inflows: AnnualInflow[] | undefined, year: number, inflationRate: number, startYear = 0): number {
  if (!inflows || inflows.length === 0) return 0;
  const index = Math.pow(1 + inflationRate / 100, year);
  // RD4: the clock restarts at the FIRE year `startYear`, a pension dated `fromYear` from today being active from the withdrawal year `fromYear − startYear` (the amount keeps indexing from the FIRE year).
  return inflows.reduce((sum, inflow) => (inflow.fromYear <= startYear + year ? sum + inflow.annualNetToday * index : sum), 0);
}

/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * RS1 — the gross factor of the capital in each year of ONE path (`1 + portfolioReturn`, before
 * inflows and withdrawals), written to `out[offset … offset + retirementYears − 1]`. A factor ≤ 0 is
 * ruin by leverage. Every year is drawn whatever the ledger later does to the path, so two runs on
 * one seed — with and without leverage, or the three scenarios — meet the same shocks in the same
 * years (A13), and the factors do not depend on the withdrawal: a withdrawal can be replayed on them.
 */
function drawPathFactors(
  params: MonteCarloParams,
  plan: DrawPlan,
  weights: number[],
  random: () => number,
  out: Float64Array,
  offset: number
): void {
  const spread = params.leverageSpread ?? 0;
  const costRate = params.annualCostRate ?? 0;
  // RQ6: the path's own means first, from the parameter generator (none without uncertainty).
  const means = drawPathMeans(plan, params.parameterRandom ?? Math.random);
  // One lognormal draw per class (rule R1), weighted into the portfolio's return (R3), the debt
  // of a leveraged portfolio taken off it at the drawn Liquidità return plus the spread (R4).
  for (let year = 0; year < params.retirementYears; year++) {
    out[offset + year] = 1 + portfolioReturn(weights, drawYear(plan, random, means), spread, costRate);
  }
}

/** What the ledger reads of the plan for each year, computed once per `params` object: the replay runs it thousands of times. */
interface LedgerSchedule {
  /** `(1 + π)^year` for an inflation-adjusted withdrawal, 1 for a fixed one; index = year. */
  withdrawalIndex: Float64Array;
  /** The net pensions active in the year, indexed as `activeAnnualInflows` does; index = year. */
  pensions: Float64Array;
  /** The capital inflows of each year in their given order (separate additions keep the floats identical); index = year. */
  inflowsByYear: number[][];
  /** The inflows already available at the start (year <= 0, in their given order): none once the run starts at the FIRE year (they are in its capital). */
  startInflows: number[];
  /** RF8: the dated flows' tables (the need's change, the lumps), built from this scenario's inflation; absent without flows, and then the ledger is the one of before. */
  flows?: { need: Float64Array; lumpIn: Float64Array; lumpOut: Float64Array; start: number };
}

/** The schedule a stochastic engine reads of the dated flows: this scenario's inflation, `null` when there are none. */
function flowTablesFor(flows: DatedFlowsInput | undefined, inflationRate: number, years: number): FlowYearTables | null {
  if (!flows || flows.resolved.length === 0) return null;
  return buildFlowYearTables(buildFlowSchedule(flows.resolved, { inflationRate, planExpensesFromCashflow: flows.planExpensesFromCashflow }), years);
}

const scheduleCache = new WeakMap<MonteCarloParams, LedgerSchedule>();

function ledgerSchedule(params: MonteCarloParams): LedgerSchedule {
  const cached = scheduleCache.get(params);
  if (cached) return cached;
  const years = params.retirementYears;
  const adjusts = params.withdrawalAdjustment === 'inflation';
  const withdrawalIndex = new Float64Array(years + 1).fill(1);
  const pensions = new Float64Array(years + 1);
  const inflowsByYear: number[][] = Array.from({ length: years + 1 }, () => []);
  // RD1/RD4: with `startYear` T > 0 the run starts at the FIRE year, in today's euros: every amount the engine read at year `y` from today it reads at `T + s` and divides by `(1 + π)^T`.
  const startYear = params.startYear && params.startYear > 0 ? Math.floor(params.startYear) : 0;
  const inflationRate = adjusts ? params.market.inflationRate : 0;
  const rebase = startYear > 0 ? Math.pow(1 + inflationRate / 100, startYear) : 1;
  for (let year = 1; year <= years; year++) {
    if (adjusts) withdrawalIndex[year] = Math.pow(1 + params.market.inflationRate / 100, year);
    pensions[year] = activeAnnualInflows(params.annualInflows, year, inflationRate, startYear);
  }
  const startInflows: number[] = [];
  for (const inflow of params.capitalInflows ?? []) {
    if (startYear === 0) {
      if (inflow.year <= 0) startInflows.push(inflow.amount);
      else if (inflow.year <= years) inflowsByYear[inflow.year].push(inflow.amount);
    } else {
      // An unlock at or before the FIRE year is already inside the capital the run starts from.
      const year = inflow.year - startYear;
      if (year >= 1 && year <= years) inflowsByYear[year].push(inflow.amount / rebase);
    }
  }
  const schedule: LedgerSchedule = { withdrawalIndex, pensions, inflowsByYear, startInflows };
  // RF8: «if I stop at T» — a FIRE anchor opens in year 1 + afterYears from T. The flows move with the plan's own indexing
  // (the pensions' rule): a plan that does not adjust for inflation sees them at 0%.
  const tables = flowTablesFor(params.flows, inflationRate, startYear + years);
  if (tables && startYear === 0) {
    schedule.flows = { need: tables.needFor(0), lumpIn: tables.lumpInflow, lumpOut: tables.lumpOutflow, start: tables.lumpNet[0] };
  } else if (tables) {
    // RD4: the tables are read at `T + s` and brought to today's euros; the lumps up to the FIRE year are in the capital (no `start`).
    const need = tables.needFor(startYear);
    const shift = (table: Float64Array) => Float64Array.from({ length: years + 1 }, (_, year) => (year === 0 ? 0 : table[startYear + year] / rebase));
    schedule.flows = { need: shift(need), lumpIn: shift(tables.lumpInflow), lumpOut: shift(tables.lumpOutflow), start: 0 };
  }
  scheduleCache.set(params, schedule);
  return schedule;
}

interface LedgerOutcome {
  success: boolean;
  failureYear?: number;
  failureCause?: 'withdrawals' | 'leverage';
  finalValue: number;
}

/**
 * RS2 — the withdrawal ledger of one path on its factors (`factors[offset + year − 1]`), for an
 * annual withdrawal of `annualWithdrawal` (today's euros when the plan adjusts for inflation).
 * Defined order: inflow → market return → withdrawal, so an inflow earns its own year's return
 * before that year's withdrawal. Inflows at year <= 0 are simply part of the starting portfolio.
 * `path`, when given, receives the capital at the end of every year the path survives.
 */
function runWithdrawalLedger(
  factors: ArrayLike<number>,
  offset: number,
  params: MonteCarloParams,
  annualWithdrawal: number,
  path?: { year: number; value: number }[]
): LedgerOutcome {
  const schedule = ledgerSchedule(params);
  let portfolio = params.initialPortfolio;
  for (const amount of schedule.startInflows) portfolio += amount;
  // The cost basis the withdrawal tax reads (2026-09-24): today's, plus every inflow as it lands.
  const tax = params.withdrawalTax;
  let basis = (tax?.basisToday ?? 0) + schedule.startInflows.reduce((sum, amount) => sum + amount, 0);
  // RF6/RF8: the lumps of the running year are part of the starting capital (the walk's own rule: an inflow is basis, an outflow leaves it as it is).
  const flows = schedule.flows;
  if (flows && flows.start !== 0) {
    portfolio += flows.start;
    basis += Math.max(0, flows.start);
  }
  path?.push({ year: 0, value: portfolio });

  const taxRate = tax?.rate ?? 0;

  for (let year = 1; year <= params.retirementYears; year++) {
    // Add the inflows landing this year BEFORE applying the market return
    for (const amount of schedule.inflowsByYear[year]) {
      portfolio += amount;
      basis += amount;
    }

    // Apply return to portfolio
    portfolio *= factors[offset + year - 1];

    // A year's loss above the capital wipes it out (R4): ruin by leverage, whatever the withdrawal.
    if (portfolio <= 0) return { success: false, failureYear: year, failureCause: 'leverage', finalValue: 0 };

    // RF8: the lumps coming in land after the return (and are basis); the ones going out leave with the withdrawal below.
    if (flows && flows.lumpIn[year] !== 0) {
      portfolio += flows.lumpIn[year];
      basis += flows.lumpIn[year];
    }

    // Calculate withdrawal (adjusted for inflation if needed), net of the pensions active this
    // year (indexed the same way), then grossed up for the tax on the sale that funds it.
    let withdrawal = annualWithdrawal * schedule.withdrawalIndex[year];
    // RF8: the withdrawal replaces the plan's expenses in RF4, so the flows change the NEED around it; a lump out is added after the floor.
    const netWithdrawal = flows
      ? Math.max(0, withdrawal + flows.need[year] - schedule.pensions[year]) + flows.lumpOut[year]
      : Math.max(0, withdrawal - schedule.pensions[year]);
    if (tax) {
      const sale = withdrawGross(portfolio, basis, netWithdrawal, taxRate);
      withdrawal = sale.gross;
      basis = sale.basisAfter;
    } else {
      withdrawal = netWithdrawal;
    }

    // Subtract withdrawal
    portfolio -= withdrawal;

    // Check for failure
    if (portfolio <= 0) return { success: false, failureYear: year, failureCause: 'withdrawals', finalValue: 0 };

    path?.push({ year, value: portfolio });
  }

  return { success: true, finalValue: portfolio };
}

/**
 * How many of the `n` paths in `factors` (row per path, `retirementYears` columns) reach the end of
 * the horizon when `annualWithdrawal` is drawn — RS2 without recording the paths. The count of an
 * `runMonteCarloSimulation` at that withdrawal on the same seed, exactly.
 */
export function countSuccesses(
  factors: Float64Array,
  n: number,
  params: MonteCarloParams,
  annualWithdrawal: number
): number {
  let successes = 0;
  for (let i = 0; i < n; i++) {
    if (runWithdrawalLedger(factors, i * params.retirementYears, params, annualWithdrawal).success) successes++;
  }
  return successes;
}

/**
 * Run a single Monte Carlo simulation: draw the path's factors, then play the withdrawal ledger on them.
 */
function runSingleSimulation(
  params: MonteCarloParams,
  plan: DrawPlan,
  weights: number[],
  simulationId: number,
  factors: Float64Array,
  offset: number
): SingleSimulationResult {
  drawPathFactors(params, plan, weights, params.random ?? Math.random, factors, offset);
  const path: { year: number; value: number }[] = [];
  const outcome = runWithdrawalLedger(factors, offset, params, params.annualWithdrawal, path);
  if (!outcome.success) {
    return { simulationId, success: false, failureYear: outcome.failureYear, failureCause: outcome.failureCause, finalValue: 0, path };
  }
  return { simulationId, success: true, finalValue: outcome.finalValue, path };
}

/**
 * Calculate percentiles for each year across all simulations
 */
function calculatePercentiles(
  simulations: SingleSimulationResult[],
  years: number
): PercentilesData[] {
  const percentiles: PercentilesData[] = [];

  for (let year = 0; year <= years; year++) {
    const valuesAtYear: number[] = simulations
      .map((sim) => {
        // Find value at this year, or use 0 if simulation failed before this year
        const pathEntry = sim.path.find((p) => p.year === year);
        return pathEntry ? pathEntry.value : 0;
      })
      .sort((a, b) => a - b);

    const p10Index = Math.floor(valuesAtYear.length * 0.1);
    const p25Index = Math.floor(valuesAtYear.length * 0.25);
    const p50Index = Math.floor(valuesAtYear.length * 0.5);
    const p75Index = Math.floor(valuesAtYear.length * 0.75);
    const p90Index = Math.floor(valuesAtYear.length * 0.9);

    percentiles.push({
      year,
      p10: valuesAtYear[p10Index],
      p25: valuesAtYear[p25Index],
      p50: valuesAtYear[p50Index],
      p75: valuesAtYear[p75Index],
      p90: valuesAtYear[p90Index],
    });
  }

  return percentiles;
}

/**
 * Create distribution bins for final portfolio values.
 *
 * Equal-width bins from the smallest final value up to the 95TH PERCENTILE, the last bin taking
 * the tail up to the maximum (2026-08-26): a thirty-year run has a heavy right tail, and bins
 * stretched to an outlier of ten times the median left nine of ten bins empty. The last bin is
 * therefore wider than the others and the surface says so (the Distribuzione footer).
 */
function createDistribution(
  simulations: SingleSimulationResult[],
  bins: number = 10
): MonteCarloResults['distribution'] {
  const sorted = simulations.map((sim) => sim.finalValue).sort((a, b) => a - b);
  return binSortedValues(sorted, bins).map(({ from, to, count }) => ({
    range: from === 0 && to === 0 ? '€0' : `${formatCurrencyCompact(from)}-${formatCurrencyCompact(to)}`,
    count,
    percentage: (count / simulations.length) * 100,
    from,
    to,
  }));
}

/**
 * Run Monte Carlo simulation with given parameters
 *
 * Performs multiple simulations of portfolio performance over retirement years.
 * Each simulation:
 * 1. Draws lognormal returns for the seven classes (CAGR and volatility of the scenario)
 * 2. Applies weighted portfolio returns
 * 3. Withdraws annual amount (optionally adjusted for inflation)
 * 4. Tracks success/failure and portfolio path
 *
 * @param params - Simulation parameters (portfolio size, allocation, withdrawal, returns, etc.)
 * @returns Aggregated results with success rate, percentiles, and distribution
 */
export function runMonteCarloSimulation(
  params: MonteCarloParams,
  options: { keepFactors?: boolean } = {}
): MonteCarloResults {
  const simulations: SingleSimulationResult[] = [];
  // RS1: the factors of every path, row per path — `n × N × 8` bytes, kept only when asked (S1).
  const factors = new Float64Array(params.numberOfSimulations * params.retirementYears);
  const plan = buildDrawPlan(params.market, params.correlations, params.uncertainty);
  const weights = MONTE_CARLO_CLASSES.map((cls) => params.weights[cls]);

  // Run all simulations
  for (let i = 0; i < params.numberOfSimulations; i++) {
    simulations.push(runSingleSimulation(params, plan, weights, i, factors, i * params.retirementYears));
  }

  // Analyze results
  const successfulSims = simulations.filter((sim) => sim.success);
  const failedSims = simulations.filter((sim) => !sim.success);

  const successRate = (successfulSims.length / simulations.length) * 100;

  // Calculate median final value (only from successful simulations)
  const finalValues = successfulSims.map((sim) => sim.finalValue).sort((a, b) => a - b);
  const medianFinalValue =
    finalValues.length > 0
      ? finalValues[Math.floor(finalValues.length / 2)]
      : 0;

  // Calculate failure analysis
  let failureAnalysis = null;
  if (failedSims.length > 0) {
    const failureYears = failedSims.map((sim) => sim.failureYear || 0);
    const avgFailureYear = mean(failureYears);
    const sortedFailureYears = [...failureYears].sort((a, b) => a - b);
    const medianFailureYear = sortedFailureYears[Math.floor(sortedFailureYears.length / 2)];

    failureAnalysis = {
      averageFailureYear: avgFailureYear,
      medianFailureYear,
    };
  }

  // Calculate percentiles
  const percentiles = calculatePercentiles(simulations, params.retirementYears);

  // Create distribution
  const distribution = createDistribution(simulations, 10);

  return {
    successRate,
    successCount: successfulSims.length,
    failureCount: failedSims.length,
    leverageFailureCount: failedSims.filter((sim) => sim.failureCause === 'leverage').length,
    medianFinalValue,
    percentiles,
    failureAnalysis,
    distribution,
    simulations,
    ...(options.keepFactors ? { factors } : {}),
  };
}

// ===== Accumulation simulation (Ventaglio view on the FIRE tab) =====

export interface AccumulationSimulationParams {
  initialPortfolio: number;
  /** Added each year until that path reaches FIRE — same rule as calculateFIREProjection. */
  annualSavings: number;
  /** RP7: % a year the saving grows by — year t saves `annualSavings · (1 + rate)^(t−1)`. Absent/0 = constant, as before. */
  savingsInflationRate?: number;
  /** Today's annual expenses; inflated each year to build the moving FIRE target. */
  annualExpenses: number;
  withdrawalRate: number; // %
  /** % — the moving target's inflation, matching the deterministic base scenario's. */
  expenseInflationRate: number;
  /** Simulation horizon in years (the caller caps it — the Ventaglio uses min(deterministic, 40)). */
  years: number;

  // Weights per Monte Carlo class (summing to 100) + the market assumptions, as in MonteCarloParams.
  weights: Record<MonteCarloClass, number>;
  market: MonteCarloMarketScenario;
  /** Correlations of the log-returns (upper triangle, 21 values); absent = independent classes. */
  correlations?: number[];
  /** Percent added to the Liquidità return to price the debt of a leveraged portfolio (weights summing above 100, R4). */
  leverageSpread?: number;
  /** Percent of the capital taken off every year after the return: TER and stamp duty (RC4); absent = 0 = gross. */
  annualCostRate?: number;

  numberOfSimulations: number;

  // Pension inflows at TODAY's value (no deterministic fund growth inside a stochastic
  // run — doc/guide/fire.md § FIRE, What If and Goals). Order per year: inflow → return → savings.
  capitalInflows?: MonteCarloCapitalInflow[];

  /**
   * The uniform source of the draws, `Math.random` by default. A seeded source
   * (`createSeededRandom`) makes the run reproducible and lets two runs share their shocks,
   * which is what a comparison between two plans needs (`lib/utils/fireDistribution.ts`).
   */
  random?: () => number;
  /** RQ6 (Q2): per class, the uncertainty on the mean (points), as in `MonteCarloParams`; absent = none. */
  uncertainty?: Record<MonteCarloClass, number>;
  /** The uniform source of the paths' means, separate from `random`; `Math.random` by default. */
  parameterRandom?: () => number;
  /**
   * How far the retirement ledger runs, in years from today (at least `years`, the default).
   * After its own FIRE year a path stops saving and withdraws the inflated expenses instead;
   * the ledger records the year that capital runs out, if it does. Extending it past `years`
   * draws more returns per path, so a seeded run with a different horizon is a different run.
   */
  retirementHorizonYears?: number;
  /**
   * The moving FIRE target per year (index 0 = today), replacing the inflated-expenses ÷ SWR
   * chain: the Calcolatore hands the deterministic walk's own requirement (`resolveFanFireTargets`
   * — the bridge, the pensions and the tax in), or the paths aim at a number the verdict never
   * names (seen on the mirror, 2026-09-24). Entries past `years` are ignored; a shorter array
   * falls back to the chain from where it ends.
   */
  fireTargets?: number[];
  /**
   * What the retirement ledger withdraws against (2026-09-24): the state pensions, net and at
   * today's value, indexed with the expense inflation from their start year, and the tax on
   * withdrawals — today's basis, grown by every euro saved and by the inflows, and the rate.
   * Absent → the ledger withdraws the bare inflated expenses.
   */
  retirement?: {
    statePensions?: AnnualInflow[];
    withdrawalTax?: WithdrawalTaxInput;
  };
  /**
   * T4 (Proiezione, RV1): the saving of year t enters only while `t ≤ savingsYears`. Absent = every year of
   * the horizon, as before — the Calcolatore never passes it.
   */
  savingsYears?: number;
  /**
   * T4: `false` keeps no path objects (`paths` stays empty) — a 10.000 × 60 run would hold 600.000 of them. The
   * percentiles and `snapshots` are then built from one typed array per year. Default `true`.
   */
  collectPaths?: boolean;
  /**
   * T4: the years (1…`years`) whose nominal values come back sorted ascending, one per path, in `snapshots`.
   * Only read with `collectPaths: false`.
   */
  snapshotYears?: number[];
  /**
   * § 12 — the dated flows (RF7, RF10). In the accumulation each path adds `Δs_t` to the saving (while it saves) and the
   * lumps `L_t` (always); in the retirement ledger a FIRE-anchored flow starts from THAT path's FIRE year, the lumps coming
   * in land after the return and the ones going out leave with the withdrawal. The schedule is built from `expenseInflationRate`.
   * Absent (or empty) → the engine of before, float for float.
   */
  flows?: DatedFlowsInput;
}

export interface AccumulationPercentilePoint extends PercentilesData {
  /** Moving FIRE number at this year (deterministic — inflation only, no randomness). */
  fireTarget: number;
  /** Cumulative % of paths that have reached FIRE by this year. */
  fireProbability: number;
}

/** What happens to a path after its FIRE year, on the same returns it accumulated with. */
export interface RetirementOutcome {
  /** The path's FIRE year: the last year it saves, the year before it starts withdrawing. */
  fireYear: number;
  /** The first year (from today) the withdrawing capital falls to zero; null = still positive at the horizon. */
  ruinYear: number | null;
  /** The capital at the retirement horizon, 0 once ruined. */
  finalValue: number;
}

export interface AccumulationSimulationResult {
  /** One full path per simulation, year 0..years — no path ever fails (accumulation only). */
  paths: { year: number; value: number }[][];
  percentiles: AccumulationPercentilePoint[];
  /** Per path, the first year its portfolio met the moving FIRE target (null = never). */
  fireYears: (number | null)[];
  /** Per path, its retirement on the same returns; null for a path that never reaches FIRE within `years`. */
  retirements: (RetirementOutcome | null)[];
  /** The retirement ledger's horizon, in years from today. */
  retirementHorizonYears: number;
  /** T4: the nominal values of the `snapshotYears`, sorted ascending (RV4: the index is floor(n × p)). */
  snapshots?: Record<number, Float64Array>;
  /** T4 (RV2): the paths with at least one year whose return wiped the capital out (`1 + r ≤ 0`), within `years`. */
  leverageZeroedCount?: number;
}

/**
 * Accumulation-phase Monte Carlo for the FIRE Ventaglio view.
 *
 * Per year, per path: capital inflows land first (at today's value), the portfolio takes one
 * random weighted market return, savings are added while the path has not yet reached FIRE,
 * expenses inflate, and the path is checked against the moving FIRE target
 * (inflatedExpenses ÷ withdrawalRate) — the same formula as the deterministic projection.
 * At zero volatility every step degenerates to calculateFIREProjection's base-scenario float
 * chain, which is the coherence property the tests pin.
 *
 * `paths` never withdraw and never fail: past its FIRE year a path keeps compounding without
 * savings, which is what the fan draws. The RETIREMENT LEDGER is a second book on the SAME
 * returns (`retirements`): from the year after its FIRE year a path withdraws that year's
 * inflated expenses (inflow → return → withdrawal, the decumulation engine's order) and the
 * ledger records the year the capital runs out — «dal FIRE in poi», the tail the Distribuzione
 * view reads. One draw per path per year up to the retirement horizon, made whether or not any
 * ledger still needs it, so a seeded run gives every plan the same shocks.
 *
 * The new number this engine adds is `fireProbability`: the cumulative share of paths that
 * have reached FIRE by each year, which the deterministic projection cannot express.
 */
export function runAccumulationSimulation(
  params: AccumulationSimulationParams
): AccumulationSimulationResult {
  const wrDecimal = params.withdrawalRate / 100;
  const random = params.random ?? Math.random;
  const plan = buildDrawPlan(params.market, params.correlations, params.uncertainty);
  const weights = MONTE_CARLO_CLASSES.map((cls) => params.weights[cls]);
  const spread = params.leverageSpread ?? 0;
  const costRate = params.annualCostRate ?? 0;
  const horizon = Math.max(params.years, Math.floor(params.retirementHorizonYears ?? params.years));
  const inflows = params.capitalInflows ?? [];
  const startingInflow = inflows
    .filter((inflow) => inflow.year <= 0)
    .reduce((sum, inflow) => sum + inflow.amount, 0);

  // The expenses and the moving target are deterministic (inflation only) — computed once to
  // the retirement horizon, shared by all paths. A caller-given target wins where it exists.
  const givenTargets = params.fireTargets ?? [];
  const expensesByYear: number[] = [params.annualExpenses];
  const fireTargets: number[] = [givenTargets[0] ?? (wrDecimal > 0 ? params.annualExpenses / wrDecimal : 0)];
  for (let year = 1; year <= horizon; year++) {
    const expenses = expensesByYear[year - 1] * (1 + params.expenseInflationRate / 100);
    expensesByYear.push(expenses);
    fireTargets.push(givenTargets[year] ?? (wrDecimal > 0 ? expenses / wrDecimal : 0));
  }

  // RP7: the saving of year t, indexed (1 + π)^(t−1) when asked; the same figure for every path.
  const savingsGrowth = 1 + (params.savingsInflationRate ?? 0) / 100;
  const savingsByYear = [0, ...Array.from({ length: horizon }, (_, index) => params.annualSavings * Math.pow(savingsGrowth, index))];
  // RF7: the flows' tables, once for all paths; the lumps of the running year join the starting capital (RF6).
  const flowTables = flowTablesFor(params.flows, params.expenseInflationRate, horizon);
  const startingLump = flowTables ? flowTables.lumpNet[0] : 0;

  const paths: { year: number; value: number }[][] = [];
  const fireYears: (number | null)[] = [];
  const retirements: (RetirementOutcome | null)[] = [];

  // T4: without path objects, one typed array per year (index = the simulation).
  const collectPaths = params.collectPaths ?? true;
  const savingsYears = params.savingsYears ?? Infinity;
  const byYear: Float64Array[] = collectPaths ? [] : Array.from({ length: params.years + 1 }, () => new Float64Array(params.numberOfSimulations));
  let leverageZeroedCount = 0;

  const parameterRandom = params.parameterRandom ?? Math.random;

  for (let sim = 0; sim < params.numberOfSimulations; sim++) {
    // RQ6: the path's own means, before its years (none without uncertainty: the run of before).
    const means = drawPathMeans(plan, parameterRandom);
    let portfolio = params.initialPortfolio + startingInflow + startingLump;
    const path: { year: number; value: number }[] = collectPaths ? [{ year: 0, value: portfolio }] : [];
    if (!collectPaths) byYear[0][sim] = portfolio;
    let zeroed = false;
    // Year 0 is tested like every other year (mirrors calculateFIREProjection): a portfolio
    // already past today's target is FIRE at year 0 in every path, and saves nothing from year 1.
    let fireYear: number | null = wrDecimal > 0 && portfolio >= fireTargets[0] ? 0 : null;
    // The retirement ledger equals the accumulation ledger through the FIRE year, then forks.
    let retirementCapital = portfolio;
    let ruinYear: number | null = null;
    // The basis behind it: today's, every euro saved, every inflow — consumed by the sales.
    const retirementTax = params.retirement?.withdrawalTax;
    let basis = (retirementTax?.basisToday ?? 0) + startingInflow + Math.max(0, startingLump);

    for (let year = 1; year <= horizon; year++) {
      // R4: a leveraged year can lose more than the capital. The fan floors the growth at zero
      // (a path never fails here); the retirement ledger below counts it as ruin.
      const rawGrowth = 1 + portfolioReturn(weights, drawYear(plan, random, means), spread, costRate);
      const growth = Math.max(0, rawGrowth);
      if (rawGrowth <= 0 && year <= params.years) zeroed = true;
      const inflowThisYear = inflows.reduce((sum, inflow) => (inflow.year === year ? sum + inflow.amount : sum), 0);

      // The accumulation ledger, inside the fan's horizon only.
      if (year <= params.years) {
        portfolio += inflowThisYear;
        portfolio *= growth;

        // Savings stop once the path retires — same rule as the deterministic projection.
        if (flowTables) {
          // RF7: ONE move per year, summed the way the deterministic walk sums it (saving + Δs, then the lump), so at zero
          // volatility the path is that walk's float chain. The lumps come in every year; the retirement ledger's basis
          // follows only while it still shares the accumulation (fireYear unset).
          const saving = fireYear === null && year <= savingsYears ? savingsByYear[year] + flowTables.savingsDelta[year] : 0;
          const move = saving + flowTables.lumpNet[year];
          if (move !== 0) {
            const before = portfolio;
            portfolio += move;
            if (fireYear === null) basis = move >= 0 ? basis + move : before > 0 ? basis * Math.max(0, 1 - -move / before) : basis;
          }
        } else if (fireYear === null && year <= savingsYears) {
          const savings = savingsByYear[year];
          portfolio += savings;
          basis += savings;
        }

        if (fireYear === null && wrDecimal > 0 && portfolio >= fireTargets[year]) {
          fireYear = year;
        }

        if (collectPaths) path.push({ year, value: portfolio });
        else byYear[year][sim] = portfolio;
      }

      // The retirement ledger: the same capital until the FIRE year (savings included), then
      // this year's expenses out instead of savings in — net of the pensions active that year,
      // grossed up for the tax on the sale — until it runs out.
      if (ruinYear !== null) continue;
      if (fireYear !== null && year > fireYear) {
        retirementCapital += inflowThisYear;
        basis += inflowThisYear;
        retirementCapital *= growth;
        if (rawGrowth <= 0) {
          retirementCapital = 0;
          ruinYear = year;
          continue;
        }
        // RF7: a lump coming in lands after the return (and is basis); the need moves with the flows from THIS path's FIRE year, a lump out is added after the floor.
        if (flowTables && flowTables.lumpInflow[year] !== 0) {
          retirementCapital += flowTables.lumpInflow[year];
          basis += flowTables.lumpInflow[year];
        }
        const pensionNow = activeAnnualInflows(params.retirement?.statePensions, year, params.expenseInflationRate);
        const netNeed = flowTables
          ? Math.max(0, expensesByYear[year] - pensionNow + flowTables.needFor(fireYear)[year]) + flowTables.lumpOutflow[year]
          : Math.max(0, expensesByYear[year] - pensionNow);
        if (retirementTax) {
          const sale = withdrawGross(retirementCapital, basis, netNeed, retirementTax.rate);
          retirementCapital -= sale.gross;
          basis = sale.basisAfter;
        } else {
          retirementCapital -= netNeed;
        }
        if (retirementCapital <= 0) {
          retirementCapital = 0;
          ruinYear = year;
        }
      } else if (year <= params.years) {
        retirementCapital = portfolio;
        basis += inflowThisYear;
      }
    }

    if (zeroed) leverageZeroedCount++;
    if (collectPaths) paths.push(path);
    fireYears.push(fireYear);
    retirements.push(fireYear !== null ? { fireYear, ruinYear, finalValue: retirementCapital } : null);
  }

  // Percentiles per year. Every path has full length, so the values array is always complete
  // and the sort makes p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 hold by construction.
  const percentiles: AccumulationPercentilePoint[] = [];
  const snapshots: Record<number, Float64Array> = {};
  const wanted = new Set(params.snapshotYears ?? []);
  const simulationCount = params.numberOfSimulations;
  for (let year = 0; year <= params.years; year++) {
    let valuesAtYear: ArrayLike<number>;
    if (collectPaths) {
      valuesAtYear = paths.map((path) => path[year].value).sort((a, b) => a - b);
    } else {
      byYear[year].sort();
      valuesAtYear = byYear[year];
      if (wanted.has(year)) snapshots[year] = byYear[year];
    }
    const at = (fraction: number) => valuesAtYear[Math.floor(valuesAtYear.length * fraction)];
    const reachedCount = fireYears.filter(
      (fireYear) => fireYear !== null && fireYear <= year
    ).length;

    percentiles.push({
      year,
      p10: at(0.1),
      p25: at(0.25),
      p50: at(0.5),
      p75: at(0.75),
      p90: at(0.9),
      fireTarget: fireTargets[year],
      fireProbability: (reachedCount / simulationCount) * 100,
    });
  }

  return { paths, percentiles, fireYears, retirements, retirementHorizonYears: horizon, snapshots, leverageZeroedCount };
}

/**
 * Build the full MonteCarloParams of one scenario from the plan's shared inputs and the market
 * assumptions of that scenario (CAGR + volatility per class, inflation).
 */
export function buildScenarioParams(
  baseParams: Omit<MonteCarloParams, 'market'>,
  market: MonteCarloMarketScenario
): MonteCarloParams {
  return { ...baseParams, market };
}
