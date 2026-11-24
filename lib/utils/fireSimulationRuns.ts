/**
 * The two FIRE simulations a tab runs in one go (F12, doc/simulazioni-worker/README.md): «Dopo il FIRE»'s three
 * scenarios plus the sustainable-spending replay, and the Proiezione's three accumulation runs. Pure and free of
 * React: `lib/workers/fireSimulation.worker.ts` runs them off the main thread, `lib/simulation/simulationStore.ts`
 * runs the very same functions on the main thread when no worker is available (RW5), so the figures are identical.
 * Moved here from `MonteCarloTab.tsx` and `ProjectionTab.tsx` unchanged, but for D-SW6 (no per-path results).
 */

import { createSeededRandom } from '@/lib/utils/seededRandom';
import { buildScenarioParams, runAccumulationSimulation, runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import { MONTE_CARLO_PARAMETER_SEED, MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { summarizeSustainableSpending, type SustainableSpendingSummary } from '@/lib/utils/sustainableWithdrawal';
import { weightsLeverage } from '@/lib/utils/monteCarloDraw';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { SCENARIO_KEYS, type MonteCarloRunInputs, type ScenarioResults } from '@/lib/utils/monteCarloSummary';
import type { ProjectionRunData, ProjectionRunInputs } from '@/lib/utils/projectionSummary';
import { buildFlowSchedule } from '@/lib/utils/datedFlows';
import type { MonteCarloParams, MonteCarloResults } from '@/types/assets';

/** A run keeps the inputs it was made with, so the page can tell a stale form from a fresh one. */
export interface MonteCarloRunState {
  results: ScenarioResults;
  inputs: MonteCarloRunInputs;
  /** S1: the withdrawal replayed on the run's own factors, inside the run (the running state covers it). */
  sustainable: SustainableSpendingSummary;
}

/**
 * The three scenarios plus the unleveraged Base and the sustainable-spending replay, pure: the worker
 * and its main-thread fallback run this same function (doc/simulazioni-worker/README.md).
 */
export function computeMonteCarloRun(inputs: MonteCarloRunInputs): MonteCarloRunState {
  // Seeded (T3): each run draws from a fresh generator on the SAME seed, so the three scenarios and the
  // unleveraged Base meet the same shocks and a re-run with the same inputs gives the same figures.
  // RQ6 (Q2): the Base alone draws each path's means, from a fresh generator on its own seed — the leveraged
  // and the unleveraged Base meet the same means too (A13).
  const run = (scenario: keyof typeof inputs.scenarios, params: MonteCarloParams, keepFactors = true): MonteCarloResults =>
    runMonteCarloSimulation(
      {
        ...buildScenarioParams(params, inputs.scenarios[scenario]),
        random: createSeededRandom(MONTE_CARLO_SEED),
        ...(scenario === 'base' && inputs.uncertainty
          ? { uncertainty: inputs.uncertainty, parameterRandom: createSeededRandom(MONTE_CARLO_PARAMETER_SEED) }
          : {}),
      },
      { keepFactors },
    );
  const results: ScenarioResults = {
    bear: run('bear', inputs.params),
    base: run('base', inputs.params),
    bull: run('bull', inputs.params),
  };
  // D11: with leverage the Base runs again without it (weights scaled to 100) on the same shocks.
  const runLeverage = weightsLeverage(MONTE_CARLO_CLASSES.map((cls) => inputs.params.weights[cls]));
  if (runLeverage > 1) {
    results.unleveragedBase = run('base', { ...inputs.params, weights: monteCarloClassRecord((cls) => inputs.params.weights[cls] / runLeverage), leverageSpread: 0 }, false);
  }
  // S1: the nine sustainable figures replay the withdrawal on the three runs' factors; the factors
  // (n × N × 8 bytes a scenario) are dropped afterwards, the results keep what the tiles read.
  const sustainable = summarizeSustainableSpending({
    bear: { factors: results.bear.factors!, params: buildScenarioParams(inputs.params, inputs.scenarios.bear) },
    base: { factors: results.base.factors!, params: buildScenarioParams(inputs.params, inputs.scenarios.base) },
    bull: { factors: results.bull.factors!, params: buildScenarioParams(inputs.params, inputs.scenarios.bull) },
  });
  // D-SW6: the paths one by one (`simulations`) leave too — no figure reads them, and from the worker they would be
  // copied back onto the main thread for nothing (doc/simulazioni-worker/README.md § RW4).
  for (const key of ['bear', 'base', 'bull'] as const) results[key] = { ...results[key], factors: undefined, simulations: [] };
  if (results.unleveragedBase) results.unleveragedBase = { ...results.unleveragedBase, simulations: [] };
  return { results, inputs, sustainable };
}

/** A run keeps the inputs it was made with, and the data its figures read. */
export interface ProjectionRunState {
  data: ProjectionRunData;
  inputs: ProjectionRunInputs;
}

/** The three scenarios' accumulation runs, pure: the worker and its fallback run this same function. */
export function computeProjectionRun(inputs: ProjectionRunInputs): ProjectionRunState {
  const years = inputs.years;
  const snapshotYears = Array.from({ length: years }, (_, index) => index + 1);
  // The lumps of the running year are part of the starting capital (RF6), whatever the scenario's inflation.
  const startingLump = inputs.datedFlows ? buildFlowSchedule(inputs.datedFlows.resolved, { inflationRate: 0, planExpensesFromCashflow: inputs.datedFlows.planExpensesFromCashflow }).lump(0) : 0;
  const startValue = inputs.initialPortfolio + inputs.inflows.filter((inflow) => inflow.year <= 0).reduce((sum, inflow) => sum + inflow.amount, 0) + startingLump;
  const data: ProjectionRunData = {
    scenarios: {} as ProjectionRunData['scenarios'],
    inflation: { bear: 0, base: 0, bull: 0 },
    startValue,
    simulations: inputs.simulations,
    years,
  };
  for (const key of SCENARIO_KEYS) {
    const scenario = inputs.scenarios[key];
    // RV7: a fresh generator on the SAME seed per scenario, so Bear, Base and Bull meet the same shocks.
    const result = runAccumulationSimulation({
      initialPortfolio: inputs.initialPortfolio,
      annualSavings: inputs.annualSavings,
      savingsInflationRate: scenario.inflationRate,
      savingsYears: inputs.savingsYears,
      annualExpenses: 0,
      withdrawalRate: 0,
      expenseInflationRate: scenario.inflationRate,
      years,
      weights: inputs.weights,
      market: scenario,
      correlations: inputs.correlations,
      leverageSpread: inputs.leverageSpread,
      annualCostRate: inputs.costRate,
      numberOfSimulations: inputs.simulations,
      capitalInflows: inputs.inflows.length > 0 ? inputs.inflows : undefined,
      flows: inputs.datedFlows,
      collectPaths: false,
      snapshotYears,
      random: createSeededRandom(MONTE_CARLO_SEED),
      ...(key === 'base' && inputs.uncertainty
        ? { uncertainty: inputs.uncertainty, parameterRandom: createSeededRandom(MONTE_CARLO_PARAMETER_SEED) }
        : {}),
    });
    data.scenarios[key] = { snapshots: result.snapshots ?? {}, leverageZeroedCount: result.leverageZeroedCount ?? 0 };
    data.inflation[key] = scenario.inflationRate;
  }
  return { data, inputs };
}
