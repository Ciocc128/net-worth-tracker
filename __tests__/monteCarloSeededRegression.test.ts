import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/chartService', () => ({
  formatCurrencyCompact: (value: number) => String(Math.round(value)),
}));

import { runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { getDefaultMonteCarloMarket, getDefaultMonteCarloCorrelations } from '@/lib/constants/monteCarloMarketDefaults';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import type { MonteCarloParams } from '@/types/assets';

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
    expect(digest(runMonteCarloSimulation(plan()))).toMatchSnapshot();
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
    expect(digest(result)).toMatchSnapshot();
  });
  it('fixed withdrawal', () => {
    expect(digest(runMonteCarloSimulation(plan({ withdrawalAdjustment: 'fixed' })))).toMatchSnapshot();
  });
});
