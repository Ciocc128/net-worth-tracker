import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/chartService', () => ({
  formatCurrencyCompact: (value: number) => String(Math.round(value)),
}));

import { runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { getDefaultMonteCarloMarket, getDefaultMonteCarloCorrelations } from './legacyMarketFixture';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_PARAMETER_SEED, MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import type { MonteCarloParams } from '@/types/assets';
import expected from './fixtures/monteCarloSeededDigests.json';

/** A stable digest of a run: every figure that depends on the draws or on the ledger, in full float precision. */
function digest(result: ReturnType<typeof runMonteCarloSimulation>) {
  return {
    successRate: result.successRate,
    leverageFailureCount: result.leverageFailureCount,
    medianFinalValue: result.medianFinalValue,
    finalSum: result.simulations.reduce((sum, sim) => sum + sim.finalValue, 0),
    failureYearSum: result.simulations.reduce((sum, sim) => sum + (sim.failureYear ?? 0), 0),
    pathLengthSum: result.simulations.reduce((sum, sim) => sum + sim.path.length, 0),
    p50: result.percentiles.map((p) => p.p50),
  };
}

/**
 * Relative tolerance 1e-9 (doc/montecarlo/README.md § 14.9, AQ22): the run was pinned on Linux and the last digit of a
 * few doubles differs on the Mac, so «float for float» is asserted to the precision the platforms agree on.
 */
function expectClose(actual: unknown, wanted: unknown, path = 'digest'): void {
  if (typeof wanted === 'number') {
    const value = actual as number;
    const scale = Math.max(1, Math.abs(wanted));
    expect(Math.abs(value - wanted) / scale, path).toBeLessThan(1e-9);
  } else if (Array.isArray(wanted)) {
    expect((actual as unknown[]).length, `${path}.length`).toBe(wanted.length);
    wanted.forEach((item, index) => expectClose((actual as unknown[])[index], item, `${path}[${index}]`));
  } else if (wanted && typeof wanted === 'object') {
    for (const [key, item] of Object.entries(wanted)) expectClose((actual as Record<string, unknown>)[key], item, `${path}.${key}`);
  } else {
    expect(actual, path).toEqual(wanted);
  }
}

function plan(overrides: Partial<MonteCarloParams> = {}): MonteCarloParams {
  const market = getDefaultMonteCarloMarket();
  return {
    portfolioSource: 'custom',
    initialPortfolio: 1_000_000,
    retirementYears: 30,
    weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0)),
    annualWithdrawal: 45_000,
    withdrawalAdjustment: 'inflation',
    market: market.scenarios.base,
    correlations: getDefaultMonteCarloCorrelations(),
    numberOfSimulations: 2000,
    random: createSeededRandom(MONTE_CARLO_SEED),
    ...overrides,
  } as MonteCarloParams;
}

describe('S10 — the seeded run is the same float for float', () => {
  it('plain plan', () => {
    expectClose(digest(runMonteCarloSimulation(plan())), expected['plain plan']);
  });
  it('leverage, tax, pensions, inflows and costs together', () => {
    const result = runMonteCarloSimulation(
      plan({
        weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 400 : cls === 'cash' ? -300 : 0)),
        leverageSpread: 2,
        annualCostRate: 0.3,
        withdrawalTax: { basisToday: 600_000, rate: 26 },
        annualInflows: [{ fromYear: 8, annualNetToday: 12_000 }],
        capitalInflows: [{ year: 0, amount: 20_000 }, { year: 5, amount: 50_000 }],
      })
    );
    expectClose(digest(result), expected['leverage, tax, pensions, inflows and costs together']);
  });
  it('fixed withdrawal', () => {
    expectClose(digest(runMonteCarloSimulation(plan({ withdrawalAdjustment: 'fixed' }))), expected['fixed withdrawal']);
  });
  // Q2 (AQ23): the cases above run without the uncertainty and stay the run of before; this one pins the paths' own means.
  it('uncertainty on the parameter', () => {
    const result = runMonteCarloSimulation(
      plan({
        uncertainty: { equity: 2.7, bonds: 0.98, gold: 2.3, commodity: 3.5, cash: 2.37, trendFollowing: 2.5, carry: 2.91 },
        parameterRandom: createSeededRandom(MONTE_CARLO_PARAMETER_SEED),
      })
    );
    expectClose(digest(result), expected['uncertainty on the parameter']);
  });
});
