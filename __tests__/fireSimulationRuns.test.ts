/**
 * F12 (doc/simulazioni-worker/README.md § 5): the FIRE simulations moved to a worker give the SAME figures.
 *
 * - CA1: what the worker answers, once copied across the boundary (`structuredClone`, the browser's own algorithm),
 *   is equal to the run on the main thread, float for float; and the Base's figures are exactly those of the engine
 *   called by hand with the seeds the tabs always used — the move changed no number.
 * - D-SW6: the paths one by one (`simulations`) are gone from the result.
 * - RW1: the key tells a mortgage's yearly Map apart, and the owner.
 *
 * - The worker's import graph stays free of Firebase: this file mocks nothing, and `lib/firebase/config` throws
 *   at import without its keys — the reason `formatCurrencyCompact` left `chartService` for `lib/utils/currencyCompact.ts`.
 *
 * Figures invented and round (WORKFLOW § 1.7); 200 paths to keep it fast — the engine is linear in them.
 */

import { describe, expect, it } from 'vitest';
import { computeMonteCarloRun, computeProjectionRun } from '@/lib/utils/fireSimulationRuns';
import { collectTransferables, handleSimulationRequest, simulationKey } from '@/lib/simulation/simulationProtocol';
import { buildScenarioParams, runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { MONTE_CARLO_PARAMETER_SEED, MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { marketUncertainty, resolveMonteCarloMarket } from '@/lib/utils/monteCarloMarket';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import type { MonteCarloRunInputs } from '@/lib/utils/monteCarloSummary';
import type { ProjectionRunInputs } from '@/lib/utils/projectionSummary';
import type { ResolvedFlow } from '@/lib/utils/datedFlows';
import type { MonteCarloParams } from '@/types/assets';

const market = resolveMonteCarloMarket(null);
const uncertainty = marketUncertainty(market);

const lump: ResolvedFlow = { id: 'lump', label: 'Fenicottero', kind: 'lumpIn', sigma: 0, indexed: false, amount: 50_000, anchor: 'fixed', start: 5, durationYears: null, inCashflowToday: false };
const mortgage: ResolvedFlow = {
  id: 'mortgage',
  label: 'Ornitorinco',
  kind: 'expense',
  sigma: 1,
  indexed: false,
  amount: 6_000,
  yearly: new Map([
    [1, 6_000],
    [2, 6_000],
    [3, 6_000],
  ]),
  anchor: 'fixed',
  start: 1,
  durationYears: 3,
  inCashflowToday: false,
};

function monteCarloInputs(overrides: Partial<MonteCarloParams> = {}): MonteCarloRunInputs {
  const params: MonteCarloParams = {
    portfolioSource: 'total',
    initialPortfolio: 500_000,
    retirementYears: 20,
    // 120: leveraged, so the unleveraged Base runs too (D11).
    weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 80 : cls === 'bonds' ? 40 : 0)),
    annualWithdrawal: 20_000,
    withdrawalAdjustment: 'inflation',
    market: market.scenarios.base,
    correlations: market.correlations,
    leverageSpread: market.leverageSpread,
    annualCostRate: 0.2,
    numberOfSimulations: 200,
    capitalInflows: [{ year: 10, amount: 30_000 }],
    annualInflows: [{ fromYear: 15, annualNetToday: 10_000 }],
    flows: { resolved: [lump, mortgage], planExpensesFromCashflow: true },
    ...overrides,
  };
  return { params, scenarios: market.scenarios, inflows: [{ year: 10, amount: 30_000 }], uncertainty };
}

function projectionInputs(): ProjectionRunInputs {
  return {
    initialPortfolio: 100_000,
    annualSavings: 12_000,
    savingsYears: 20,
    simulations: 200,
    horizon: 30,
    years: 50,
    weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 70 : cls === 'bonds' ? 30 : 0)),
    scenarios: market.scenarios,
    correlations: market.correlations,
    leverageSpread: market.leverageSpread,
    costRate: 0.2,
    inflows: [{ year: 8, amount: 20_000 }],
    datedFlows: { resolved: [lump], planExpensesFromCashflow: true },
    uncertainty,
  };
}

describe('F12 · the worker gives the same figures (CA1)', () => {
  it('Dopo il FIRE: the answer copied across the boundary equals the main-thread run, float for float', () => {
    const inputs = monteCarloInputs();
    const response = handleSimulationRequest({ id: 7, kind: 'montecarlo', inputs });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const crossed = structuredClone(response, { transfer: collectTransferables(response) });
    expect(crossed.id).toBe(7);
    expect(crossed.result).toEqual(computeMonteCarloRun(inputs));
  });

  it('Dopo il FIRE: the Base figures are exactly the engine run by hand with the tabs’ seeds', () => {
    const inputs = monteCarloInputs();
    const { results } = computeMonteCarloRun(inputs);
    const byHand = runMonteCarloSimulation(
      {
        ...buildScenarioParams(inputs.params, inputs.scenarios.base),
        random: createSeededRandom(MONTE_CARLO_SEED),
        uncertainty,
        parameterRandom: createSeededRandom(MONTE_CARLO_PARAMETER_SEED),
      },
      { keepFactors: true },
    );
    expect(results.base.percentiles).toEqual(byHand.percentiles);
    expect(results.base.successCount).toBe(byHand.successCount);
    expect(results.base.medianFinalValue).toBe(byHand.medianFinalValue);
    expect(results.base.distribution).toEqual(byHand.distribution);
    // 80 + 40 = 120 > 100: the leveraged plan carries its unleveraged Base (D11).
    expect(results.unleveragedBase).toBeDefined();
  });

  it('D-SW6: no path one by one and no factors leave the run', () => {
    const { results } = computeMonteCarloRun(monteCarloInputs());
    for (const run of [results.bear, results.base, results.bull, results.unleveragedBase!]) {
      expect(run.simulations).toEqual([]);
      expect(run.factors).toBeUndefined();
    }
  });

  it('Proiezione: the answer with its snapshots handed over equals the main-thread run', () => {
    const inputs = projectionInputs();
    const response = handleSimulationRequest({ id: 3, kind: 'projection', inputs });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const transfer = collectTransferables(response);
    // 3 scenarios × 50 kept years, each its own buffer of 200 values.
    expect(transfer).toHaveLength(150);
    const crossed = structuredClone(response, { transfer });
    expect(crossed.result).toEqual(computeProjectionRun(inputs));
  });

  it('a failing run answers with its message instead of throwing in the worker', () => {
    const inputs = { ...projectionInputs(), scenarios: undefined } as unknown as ProjectionRunInputs;
    const response = handleSimulationRequest({ id: 9, kind: 'projection', inputs });
    expect(response).toMatchObject({ id: 9, ok: false });
  });

  it('Monte Carlo hands nothing over: its factors are dropped inside the run', () => {
    const response = handleSimulationRequest({ id: 1, kind: 'montecarlo', inputs: monteCarloInputs({ numberOfSimulations: 50 }) });
    expect(collectTransferables(response)).toEqual([]);
  });
});

describe('F12 · RW1, the key of a run', () => {
  it('is the same for equal inputs and different for another owner or kind', () => {
    const a = simulationKey('montecarlo', 'owner-a', monteCarloInputs());
    expect(simulationKey('montecarlo', 'owner-a', monteCarloInputs())).toBe(a);
    expect(simulationKey('montecarlo', 'owner-b', monteCarloInputs())).not.toBe(a);
    expect(simulationKey('projection', 'owner-a', monteCarloInputs())).not.toBe(a);
  });

  it('sees a change inside a mortgage’s yearly Map, which plain JSON would write as {}', () => {
    const other: ResolvedFlow = { ...mortgage, yearly: new Map([[1, 6_000], [2, 6_000], [3, 6_500]]) };
    const a = simulationKey('montecarlo', 'owner-a', monteCarloInputs());
    const b = simulationKey('montecarlo', 'owner-a', monteCarloInputs({ flows: { resolved: [lump, other], planExpensesFromCashflow: true } }));
    expect(b).not.toBe(a);
  });

  it('sees one cent of difference', () => {
    const a = simulationKey('montecarlo', null, monteCarloInputs({ annualWithdrawal: 20_000 }));
    expect(simulationKey('montecarlo', null, monteCarloInputs({ annualWithdrawal: 20_000.01 }))).not.toBe(a);
  });
});
