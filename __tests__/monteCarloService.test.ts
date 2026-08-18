import { describe, it, expect, vi } from 'vitest';

// monteCarloService only imports chartService for a currency label; mocking it keeps the
// Firebase client SDK (loaded by chartService at module level) out of the test.
vi.mock('@/lib/services/chartService', () => ({
  formatCurrencyCompact: (value: number) => String(Math.round(value)),
}));

import { runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import type { MonteCarloParams } from '@/types/assets';

/**
 * Zero-volatility params make every path deterministic (randomNormal(mean, 0) === mean),
 * so the inflow ordering (inflow → market return → withdrawal) can be asserted exactly.
 * There is no seedable RNG in the service, hence structure-by-determinism per the spec.
 */
function makeDeterministicParams(overrides: Partial<MonteCarloParams> = {}): MonteCarloParams {
  return {
    portfolioSource: 'custom',
    initialPortfolio: 1_000_000,
    retirementYears: 5,
    equityPercentage: 100,
    bondsPercentage: 0,
    realEstatePercentage: 0,
    commoditiesPercentage: 0,
    annualWithdrawal: 50_000,
    withdrawalAdjustment: 'fixed',
    equityReturn: 5,
    equityVolatility: 0,
    bondsReturn: 0,
    bondsVolatility: 0,
    realEstateReturn: 0,
    realEstateVolatility: 0,
    commoditiesReturn: 0,
    commoditiesVolatility: 0,
    inflationRate: 0,
    numberOfSimulations: 10,
    ...overrides,
  };
}

function pathValues(result: ReturnType<typeof runMonteCarloSimulation>): number[] {
  return result.simulations[0].path.map((point) => point.value);
}

/**
 * Independent replica of the DOCUMENTED order (inflow at start of year → return → withdrawal),
 * written here so the test does not import anything from the service under test.
 */
function expectedPath(
  initial: number,
  years: number,
  growthRate: number,
  withdrawal: number,
  inflows: { year: number; amount: number }[] = []
): number[] {
  let portfolio = initial + inflows
    .filter((inflow) => inflow.year <= 0)
    .reduce((sum, inflow) => sum + inflow.amount, 0);
  const path = [portfolio];
  for (let year = 1; year <= years; year++) {
    for (const inflow of inflows) {
      if (inflow.year === year) portfolio += inflow.amount;
    }
    portfolio *= 1 + growthRate / 100;
    portfolio -= withdrawal;
    path.push(portfolio);
  }
  return path;
}

describe('runMonteCarloSimulation — capital inflows (Spec 3)', () => {
  it('baseline: at zero volatility the path is deterministic (5% growth, 50k withdrawal)', () => {
    const result = runMonteCarloSimulation(makeDeterministicParams());
    const expected = expectedPath(1_000_000, 5, 5, 50_000);

    expect(result.successRate).toBe(100);
    const actual = pathValues(result);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
    // Sanity on the arithmetic itself: 1M·1.05 − 50k = 1M, the path is flat.
    expect(actual[5]).toBeCloseTo(1_000_000, 4);
  });

  it('regression: an empty capitalInflows array produces the same paths as omitting it', () => {
    const withoutInflows = runMonteCarloSimulation(makeDeterministicParams());
    const withEmpty = runMonteCarloSimulation(makeDeterministicParams({ capitalInflows: [] }));

    expect(pathValues(withEmpty)).toEqual(pathValues(withoutInflows));
    expect(withEmpty.successRate).toBe(withoutInflows.successRate);
  });

  it('applies an inflow at the START of its year: inflow → market return → withdrawal', () => {
    const inflows = [{ year: 3, amount: 100_000 }];
    const result = runMonteCarloSimulation(makeDeterministicParams({ capitalInflows: inflows }));
    const expected = expectedPath(1_000_000, 5, 5, 50_000, inflows);

    // Years 1-2 unchanged; year 3: (1M + 100k)·1.05 − 50k = 1_105_000, then the surplus compounds.
    const actual = pathValues(result);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
    expect(actual[3]).toBeCloseTo(1_105_000, 4);
    expect(actual[4]).toBeCloseTo(1_110_250, 4);
  });

  it('an inflow can rescue an otherwise failing plan (failure year moves later or disappears)', () => {
    const failing = runMonteCarloSimulation(
      makeDeterministicParams({ annualWithdrawal: 120_000, retirementYears: 30 })
    );
    const rescuedLater = runMonteCarloSimulation(
      makeDeterministicParams({
        annualWithdrawal: 120_000,
        retirementYears: 30,
        capitalInflows: [{ year: 5, amount: 500_000 }],
      })
    );

    expect(failing.successRate).toBe(0);
    expect(rescuedLater.simulations[0].failureYear ?? Infinity).toBeGreaterThan(
      failing.simulations[0].failureYear ?? Infinity
    );
  });

  it('treats an inflow at year 0 (or earlier) as part of the initial portfolio', () => {
    const result = runMonteCarloSimulation(
      makeDeterministicParams({ capitalInflows: [{ year: 0, amount: 100_000 }] })
    );

    expect(result.simulations[0].path[0].value).toBe(1_100_000);
    expect(result.simulations[0].path[1].value).toBeCloseTo(1_105_000, 4);
  });
});
