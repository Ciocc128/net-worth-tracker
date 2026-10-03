import { describe, it, expect, vi } from 'vitest';

// monteCarloService only imports chartService for a currency label; mocking it keeps the
// Firebase client SDK (loaded by chartService at module level) out of the test.
vi.mock('@/lib/services/chartService', () => ({
  formatCurrencyCompact: (value: number) => String(Math.round(value)),
}));

// fireService is imported only for the Ventaglio coherence test below; these two mocks keep its
// Firestore-coupled imports (expense/snapshot fetchers) out of the test, same as fireService.test.ts.
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

import {
  runMonteCarloSimulation,
  runAccumulationSimulation,
  type AccumulationSimulationParams,
} from '@/lib/services/monteCarloService';
import { calculateFIREProjection, getDefaultScenarios, resolveFanFireTargets, resolveFireRequirement } from '@/lib/services/fireService';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import type { MonteCarloMarketScenario, MonteCarloParams } from '@/types/assets';
import { monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';

/** A market where only the equity class has a CAGR/volatility; every other class is flat at 0. */
function flatMarket(equityCagr: number, equityVolatility = 0, inflationRate = 0): MonteCarloMarketScenario {
  return {
    classes: monteCarloClassRecord((cls) => ({ cagr: cls === 'equity' ? equityCagr : 0, volatility: cls === 'equity' ? equityVolatility : 0 })),
    inflationRate,
  };
}

/** Weights that put the whole portfolio in one class. */
function allIn(cls: MonteCarloClass): Record<MonteCarloClass, number> {
  return monteCarloClassRecord((key) => (key === cls ? 100 : 0));
}

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
    weights: allIn('equity'),
    annualWithdrawal: 50_000,
    withdrawalAdjustment: 'fixed',
    market: flatMarket(5),
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

describe('runMonteCarloSimulation — capital inflows', () => {
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

/**
 * Accumulation engine for the FIRE Ventaglio view.
 *
 * Zero volatility makes randomNormal(mean, 0) === mean, so every path is deterministic and can
 * be compared FLOAT-FOR-FLOAT against calculateFIREProjection's base scenario — the spec's key
 * coherence requirement ("a volatilità 0 il ventaglio collassa sulla proiezione deterministica").
 * The comparison deliberately runs WITHOUT capital inflows: the deterministic bridge grows the
 * pension compartment while a Monte Carlo run adds inflows at TODAY's value (doc/guide/fire.md § FIRE, What If and Goals),
 * so identity only holds — and only must hold — on the shared, inflow-free model.
 */
function makeAccumulationParams(
  overrides: Partial<AccumulationSimulationParams> = {}
): AccumulationSimulationParams {
  return {
    initialPortfolio: 100_000,
    annualSavings: 20_000,
    annualExpenses: 30_000,
    withdrawalRate: 4,
    expenseInflationRate: 2.5,
    years: 40,
    weights: allIn('equity'),
    market: flatMarket(7),
    numberOfSimulations: 10,
    ...overrides,
  };
}

describe('runAccumulationSimulation — Ventaglio engine', () => {
  it('is FIRE at year 0 in every path when the portfolio already clears today\'s target', () => {
    // 2M against a 750k target: the deterministic walk says year 0, and so must every path —
    // otherwise the fan's verdict reads «probabilità entro il 2027: 100%» under «Sei già FIRE.».
    const result = runAccumulationSimulation(makeAccumulationParams({ initialPortfolio: 2_000_000, years: 5 }));
    for (const fireYear of result.fireYears) expect(fireYear).toBe(0);
    expect(result.percentiles[0].fireProbability).toBe(100);
    // Reached paths save nothing: year 1 is pure market growth.
    expect(Math.round(result.paths[0][1].value)).toBe(Math.round(2_000_000 * 1.07));
  });

  it('indexed savings (RP7): at zero volatility the paths still collapse onto the indexed deterministic projection', () => {
    // Same capital, same rate, same indexed saving: the fan and the Calcolatore's curve are one walk.
    const scenarios = { bear: { growthRate: 7, inflationRate: 2.5 }, base: { growthRate: 7, inflationRate: 2.5 }, bull: { growthRate: 7, inflationRate: 2.5 } };
    const projection = calculateFIREProjection(100_000, 30_000, 20_000, 4, scenarios, 50, undefined, undefined, true);
    const years = Math.min(projection.yearlyData.length, 40);
    const result = runAccumulationSimulation(makeAccumulationParams({ years, savingsInflationRate: 2.5 }));
    for (const path of result.paths) {
      for (let year = 1; year <= years; year++) {
        expect(Math.round(path[year].value)).toBe(projection.yearlyData[year - 1].baseNetWorth);
      }
    }
    // And it is a different walk from the constant one: the saving of year 2 is 20.500, not 20.000.
    expect(Math.round(result.paths[0][2].value)).toBe(Math.round(Math.round(result.paths[0][1].value) * 1.07 + 20_500));
  });

  it('at zero volatility every path collapses onto the deterministic base projection', () => {
    // Same rates as the engine fixture: base scenario 7% growth / 2.5% inflation.
    const projection = calculateFIREProjection(
      100_000,
      30_000,
      20_000,
      4,
      getDefaultScenarios(),
      50
    );
    const years = Math.min(projection.yearlyData.length, 40);
    const result = runAccumulationSimulation(makeAccumulationParams({ years }));

    expect(result.paths).toHaveLength(10);
    for (const path of result.paths) {
      expect(path).toHaveLength(years + 1);
      expect(path[0].value).toBe(100_000);
      for (let year = 1; year <= years; year++) {
        // yearlyData is 0-indexed from year 1 and stores Math.round of the same float chain.
        expect(Math.round(path[year].value)).toBe(projection.yearlyData[year - 1].baseNetWorth);
      }
    }

    // FIRE year per path === deterministic base FIRE year, savings stop included (the
    // yearlyData series continues past the FIRE year with savings already stopped, so the
    // per-year identity above would break if the engine kept adding them).
    expect(projection.baseYearsToFIRE).not.toBeNull();
    for (const fireYear of result.fireYears) {
      expect(fireYear).toBe(projection.baseYearsToFIRE);
    }

    // The moving FIRE target is the deterministic one (same inflation chain).
    for (let year = 1; year <= years; year++) {
      expect(Math.round(result.percentiles[year].fireTarget)).toBe(
        projection.yearlyData[year - 1].baseFireNumber
      );
    }

    // Cumulative FIRE probability is a step: 0 before the deterministic year, 100 from it on.
    const fireYear = projection.baseYearsToFIRE!;
    expect(result.percentiles[fireYear - 1].fireProbability).toBe(0);
    expect(result.percentiles[fireYear].fireProbability).toBe(100);
  });

  it('keeps percentiles monotone (p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90) under real volatility', () => {
    const result = runAccumulationSimulation(
      makeAccumulationParams({
        years: 25,
        market: flatMarket(7, 18),
        numberOfSimulations: 300,
      })
    );

    expect(result.percentiles).toHaveLength(26);
    for (const point of result.percentiles) {
      expect(point.p10).toBeLessThanOrEqual(point.p25);
      expect(point.p25).toBeLessThanOrEqual(point.p50);
      expect(point.p50).toBeLessThanOrEqual(point.p75);
      expect(point.p75).toBeLessThanOrEqual(point.p90);
    }
  });

  it('keeps the cumulative FIRE probability non-decreasing and within [0, 100]', () => {
    const result = runAccumulationSimulation(
      makeAccumulationParams({
        years: 30,
        market: flatMarket(7, 18),
        numberOfSimulations: 300,
      })
    );

    let previous = 0;
    for (const point of result.percentiles) {
      expect(point.fireProbability).toBeGreaterThanOrEqual(previous);
      expect(point.fireProbability).toBeLessThanOrEqual(100);
      previous = point.fireProbability;
    }
  });

  it('applies a capital inflow at the START of its year, at today\'s value (inflow → return → savings)', () => {
    const withInflow = runAccumulationSimulation(
      makeAccumulationParams({ capitalInflows: [{ year: 3, amount: 100_000 }] })
    );
    const without = runAccumulationSimulation(makeAccumulationParams());

    const path = withInflow.paths[0];
    const basePath = without.paths[0];
    // Years 1-2 untouched.
    expect(path[1].value).toBeCloseTo(basePath[1].value, 6);
    expect(path[2].value).toBeCloseTo(basePath[2].value, 6);
    // Year 3: (previous + 100k)·1.07 + savings — the inflow earns its own year's return.
    expect(path[3].value).toBeCloseTo((path[2].value + 100_000) * 1.07 + 20_000, 6);
  });

  it('folds an inflow at year 0 into the starting portfolio', () => {
    const result = runAccumulationSimulation(
      makeAccumulationParams({ capitalInflows: [{ year: 0, amount: 50_000 }] })
    );

    expect(result.paths[0][0].value).toBe(150_000);
  });

  it('an empty capitalInflows array behaves exactly like omitting it', () => {
    const without = runAccumulationSimulation(makeAccumulationParams());
    const withEmpty = runAccumulationSimulation(makeAccumulationParams({ capitalInflows: [] }));

    expect(withEmpty.paths[0].map((p) => p.value)).toEqual(without.paths[0].map((p) => p.value));
    expect(withEmpty.fireYears).toEqual(without.fireYears);
  });
});

/**
 * The seeded source and the retirement ledger (2026-09-24). The ledger is replicated here
 * independently of the service: the same order the docstring states — inflow → return →
 * withdrawal from the year AFTER the FIRE year, the expenses inflating every year from today.
 */
describe('runAccumulationSimulation — seed and the retirement ledger', () => {
  const volatile = { market: flatMarket(7, 18), numberOfSimulations: 50, years: 20 };

  it('gives the same paths, FIRE years and retirements for the same seed, different ones for another', () => {
    const first = runAccumulationSimulation(makeAccumulationParams({ ...volatile, random: createSeededRandom(7) }));
    const again = runAccumulationSimulation(makeAccumulationParams({ ...volatile, random: createSeededRandom(7) }));
    const other = runAccumulationSimulation(makeAccumulationParams({ ...volatile, random: createSeededRandom(8) }));
    expect(again).toEqual(first);
    expect(other.paths[0].map((p) => p.value)).not.toEqual(first.paths[0].map((p) => p.value));
  });

  it('two seeded runs that differ only in the savings share every shock (common random numbers)', () => {
    // At zero savings the year-1 return is the path's whole year-1 change; with savings the
    // same return shows through as (value − savings) / initial. Identical across the two runs.
    const lean = runAccumulationSimulation(makeAccumulationParams({ ...volatile, annualSavings: 0, random: createSeededRandom(3) }));
    const rich = runAccumulationSimulation(makeAccumulationParams({ ...volatile, annualSavings: 20_000, random: createSeededRandom(3) }));
    for (let sim = 0; sim < 50; sim++) {
      const leanReturn = lean.paths[sim][1].value / 100_000;
      const richReturn = (rich.paths[sim][1].value - 20_000) / 100_000;
      expect(richReturn).toBeCloseTo(leanReturn, 10);
    }
  });

  it('withdraws the inflated expenses from the year after FIRE and records the ruin year', () => {
    // No growth: the ledger is a plain subtraction the test can replay. Expenses of 10.000 € so
    // that 20.000 € a year of savings can still reach the inflating target (year 12).
    const params = makeAccumulationParams({ market: flatMarket(0), annualExpenses: 10_000, years: 40, retirementHorizonYears: 70 });
    const result = runAccumulationSimulation(params);
    const fireYear = result.fireYears[0] as number;
    expect(fireYear).not.toBeNull();

    // Independent replica: accumulate to the FIRE year, then withdraw with zero return.
    const expensesAt = (year: number) => params.annualExpenses * Math.pow(1 + params.expenseInflationRate / 100, year);
    let capital = params.initialPortfolio + params.annualSavings * fireYear;
    let expectedRuin: number | null = null;
    for (let year = fireYear + 1; year <= 70; year++) {
      capital -= expensesAt(year);
      if (capital <= 0) {
        expectedRuin = year;
        break;
      }
    }
    expect(expectedRuin).not.toBeNull();
    expect(result.retirements[0]).toEqual({ fireYear, ruinYear: expectedRuin, finalValue: 0 });
    expect(result.retirementHorizonYears).toBe(70);
    // The accumulation ledger is untouched by the withdrawals: the fan keeps compounding.
    expect(result.paths[0][40].value).toBeCloseTo(params.initialPortfolio + params.annualSavings * fireYear, 6);
  });

  it('keeps the capital positive at the horizon when the return outruns the withdrawals, return before withdrawal', () => {
    const params = makeAccumulationParams({ years: 40, retirementHorizonYears: 60 });
    const result = runAccumulationSimulation(params);
    const outcome = result.retirements[0];
    expect(outcome).not.toBeNull();
    expect(outcome?.ruinYear).toBeNull();
    expect(outcome?.finalValue).toBeGreaterThan(0);

    // Independent replica with growth: the year's return lands BEFORE the year's withdrawal
    // (the decumulation engine's order). Withdrawing first would leave a smaller capital.
    const fireYear = outcome?.fireYear as number;
    const expensesAt = (year: number) => params.annualExpenses * Math.pow(1 + params.expenseInflationRate / 100, year);
    let capital = result.paths[0][fireYear].value;
    for (let year = fireYear + 1; year <= 60; year++) {
      capital *= 1 + params.market.classes.equity.cagr / 100;
      capital -= expensesAt(year);
    }
    expect(outcome?.finalValue).toBeCloseTo(capital, 3);
  });

  it('gives a path that never reaches FIRE no retirement', () => {
    const result = runAccumulationSimulation(makeAccumulationParams({ annualExpenses: 5_000_000, years: 10 }));
    expect(result.fireYears.every((year) => year === null)).toBe(true);
    expect(result.retirements.every((outcome) => outcome === null)).toBe(true);
  });

  it('aims the paths at the targets given, year by year, instead of the expenses ÷ SWR chain', () => {
    // A target of 1 € from year 3 on: every path is FIRE exactly at year 3, whatever its portfolio.
    const targets = [1e12, 1e12, 1e12, 1, 1, 1, 1, 1, 1, 1, 1];
    const result = runAccumulationSimulation(makeAccumulationParams({ years: 10, fireTargets: targets }));
    expect(result.fireYears.every((year) => year === 3)).toBe(true);
    expect(result.percentiles[2].fireTarget).toBe(1e12);
    expect(result.percentiles[3].fireTarget).toBe(1);
    // A shorter array falls back to the chain from where it ends.
    const partial = runAccumulationSimulation(makeAccumulationParams({ years: 10, fireTargets: [1e12, 1e12] }));
    expect(partial.percentiles[1].fireTarget).toBe(1e12);
    expect(Math.round(partial.percentiles[2].fireTarget)).toBe(Math.round((30_000 * 1.025 ** 2) / 0.04));
  });

  it('with the bridge targets, the zero-volatility fan lands on the walk\'s FIRE year before the unlock', () => {
    // The walk under the bridge: free capital 100k, a 50k fund locked for 30 years. The bridge
    // requirement is lower than the standard number, so FIRE lands before the unlock — where the
    // two models agree exactly (after it, the walk merges the GROWN fund and the fan today's value).
    const bridge = { valueToday: 50_000, yearsToUnlock: 30 };
    const projection = calculateFIREProjection(100_000, 30_000, 20_000, 4, getDefaultScenarios(), 50, bridge);
    expect(projection.baseYearsToFIRE).not.toBeNull();
    expect(projection.baseYearsToFIRE as number).toBeLessThan(30);
    const years = Math.min(projection.yearlyData.length, 40);
    // The targets are the walk's own rows (today's requirement first), as the tab hands them.
    const today = resolveFireRequirement({ annualExpenses: 30_000, withdrawalRate: 4, scenario: getDefaultScenarios().base, yearsElapsed: 0, bridge: { compartmentValue: bridge.valueToday, yearsToUnlock: bridge.yearsToUnlock } });
    const targets = resolveFanFireTargets(today.requirement, projection);
    const withBridge = runAccumulationSimulation(makeAccumulationParams({ years, fireTargets: targets }));
    const withoutBridge = runAccumulationSimulation(makeAccumulationParams({ years }));
    expect(withBridge.fireYears[0]).toBe(projection.baseYearsToFIRE);
    // The standard chain reads later: that is the gap the mirror showed under the lock.
    expect(withoutBridge.fireYears[0] as number).toBeGreaterThan(projection.baseYearsToFIRE as number);
    // From the unlock year on the row is the standard chain (rounded to the euro by the walk).
    expect(targets[30]).toBeCloseTo((30_000 * 1.025 ** 30) / 0.04, -1);
    expect(targets[0]).toBeLessThan(30_000 / 0.04);
  });

  it('runs the ledger to `years` by default and only the longer horizon sees a later ruin', () => {
    const short = runAccumulationSimulation(makeAccumulationParams({ market: flatMarket(0), annualExpenses: 10_000, years: 20 }));
    const long = runAccumulationSimulation(makeAccumulationParams({ market: flatMarket(0), annualExpenses: 10_000, years: 20, retirementHorizonYears: 70 }));
    expect(short.retirementHorizonYears).toBe(20);
    expect(short.retirements[0]?.ruinYear).toBeNull();
    expect(long.retirements[0]?.ruinYear).toBeGreaterThan(20);
    // Paths, percentiles and FIRE years do not depend on the retirement horizon at zero volatility.
    expect(long.paths).toEqual(short.paths);
    expect(long.fireYears).toEqual(short.fireYears);
    expect(long.percentiles).toEqual(short.percentiles);
  });
});

/**
 * The honest number's two ingredients inside the engines (2026-09-24): the state pensions taken
 * off what a retired path withdraws, and the tax on the sale that funds each withdrawal.
 */
describe('runAccumulationSimulation — pensions and tax in the retirement ledger', () => {
  it('takes the pensions off the expenses from their start year: the capital lasts longer', () => {
    const params = makeAccumulationParams({ market: flatMarket(0), annualExpenses: 10_000, years: 20, retirementHorizonYears: 70 });
    const bare = runAccumulationSimulation(params);
    const withPension = runAccumulationSimulation({ ...params, retirement: { statePensions: [{ fromYear: 20, annualNetToday: 6_000 }] } });
    const fireYear = bare.fireYears[0] as number;
    expect(fireYear).toBeLessThan(20);
    // Same FIRE year (the pension is not in the target here), later ruin: independent replica
    // of the ledger with zero return — expenses out, the indexed pension in from year 20.
    expect(withPension.fireYears[0]).toBe(fireYear);
    let capital = params.initialPortfolio + params.annualSavings * fireYear;
    let expectedRuin: number | null = null;
    for (let year = fireYear + 1; year <= 70; year++) {
      const index = Math.pow(1 + params.expenseInflationRate / 100, year);
      capital -= Math.max(0, params.annualExpenses * index - (year >= 20 ? 6_000 * index : 0));
      if (capital <= 0) {
        expectedRuin = year;
        break;
      }
    }
    expect(withPension.retirements[0]?.ruinYear).toBe(expectedRuin);
    expect(expectedRuin as number).toBeGreaterThan(bare.retirements[0]?.ruinYear as number);
  });

  it('pays the tax on the sale that funds each withdrawal, so a portfolio with gains ends lower', () => {
    const params = makeAccumulationParams({ years: 30, retirementHorizonYears: 60 });
    const bare = runAccumulationSimulation(params);
    // Today's capital is all basis; the 7% growth builds the gain the sales are taxed on.
    const taxed = runAccumulationSimulation({ ...params, retirement: { withdrawalTax: { basisToday: params.initialPortfolio, rate: 26 } } });
    expect(taxed.fireYears[0]).toBe(bare.fireYears[0]);
    expect(taxed.retirements[0]?.finalValue as number).toBeLessThan(bare.retirements[0]?.finalValue as number);
    // No gain (the basis IS the capital, no growth): the tax changes nothing.
    const flat = makeAccumulationParams({ market: flatMarket(0), annualExpenses: 10_000, years: 20, retirementHorizonYears: 40 });
    const flatTaxed = runAccumulationSimulation({ ...flat, retirement: { withdrawalTax: { basisToday: flat.initialPortfolio, rate: 26 } } });
    expect(flatTaxed.retirements[0]).toEqual(runAccumulationSimulation(flat).retirements[0]);
  });
});

describe('runMonteCarloSimulation — pensions and tax', () => {
  it('takes the annual inflows off the withdrawal from their year, indexed like it', () => {
    const params = makeDeterministicParams({ retirementYears: 6, annualInflows: [{ fromYear: 3, annualNetToday: 20_000 }] });
    const result = runMonteCarloSimulation(params);
    // Fixed withdrawal: 50k until year 2, 30k from year 3 (no indexing on a fixed plan).
    const expected = [1_000_000];
    let capital = 1_000_000;
    for (let year = 1; year <= 6; year++) {
      capital *= 1.05;
      capital -= year >= 3 ? 30_000 : 50_000;
      expected.push(capital);
    }
    expect(pathValues(result).map((v) => Math.round(v))).toEqual(expected.map((v) => Math.round(v)));
  });

  it('sells more than the withdrawal to pay the tax on the gain, and a plan can fail for it', () => {
    const bare = makeDeterministicParams({ retirementYears: 30, initialPortfolio: 1_000_000, annualWithdrawal: 55_000 });
    const taxed = { ...bare, withdrawalTax: { basisToday: 400_000, rate: 26 } };
    const bareResult = runMonteCarloSimulation(bare);
    const taxedResult = runMonteCarloSimulation(taxed);
    expect(taxedResult.simulations[0].finalValue).toBeLessThan(bareResult.simulations[0].finalValue);
    // Year 1 replica: 1M × 1,05 = 1.050.000, gain share 1 − 400k/1.050k, gross = 55k / (1 − share × 0,26).
    const share = 1 - 400_000 / 1_050_000;
    expect(taxedResult.simulations[0].path[1].value).toBeCloseTo(1_050_000 - 55_000 / (1 - share * 0.26), 3);
  });
});

describe('createDistribution (through runMonteCarloSimulation)', () => {
  it('caps the equal-width bins at the 95th percentile and lets the last bin take the tail', () => {
    const results = runMonteCarloSimulation({
      portfolioSource: 'total',
      initialPortfolio: 500000,
      retirementYears: 30,
      weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0)),
      annualWithdrawal: 20000,
      withdrawalAdjustment: 'inflation',
      market: {
        classes: monteCarloClassRecord((cls) => (cls === 'bonds' ? { cagr: 3, volatility: 6 } : { cagr: 7, volatility: 18 })),
        inflationRate: 2.5,
      },
      numberOfSimulations: 600,
    });
    const bins = results.distribution;
    const finals = results.simulations.map((sim) => sim.finalValue).sort((a, b) => a - b);
    const p95 = finals[Math.floor(finals.length * 0.95)];
    const max = finals[finals.length - 1];

    expect(bins).toHaveLength(10);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(600);
    // Nine equal bins up to the 95th percentile, the tenth from there to the maximum.
    expect(bins[8].to).toBeCloseTo(finals[0] + ((p95 - finals[0]) / 10) * 9, 3);
    expect(bins[9].from).toBeCloseTo(bins[8].to, 6);
    expect(bins[9].to).toBe(max);
    for (let i = 1; i < bins.length; i++) expect(bins[i].from).toBeCloseTo(bins[i - 1].to, 6);
    // With a heavy right tail the last bin is the widest — never nine empty bins under one outlier.
    expect(bins[9].to - bins[9].from).toBeGreaterThan(bins[0].to - bins[0].from);
  });
});

describe('seven-class draws (T1)', () => {
  const market: MonteCarloMarketScenario = {
    classes: monteCarloClassRecord((cls) => ({ cagr: cls === 'equity' ? 8 : cls === 'cash' ? 2 : cls === 'gold' ? 6 : 0, volatility: 0 })),
    inflationRate: 0,
  };

  it('at zero volatility the portfolio earns the weighted sum of the class CAGRs, cash included', () => {
    const params = makeDeterministicParams({
      withdrawalAdjustment: 'fixed',
      annualWithdrawal: 0,
      weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 50 : cls === 'cash' ? 30 : cls === 'gold' ? 20 : 0)),
      market,
      retirementYears: 3,
    });
    const growth = 0.5 * 1.08 + 0.3 * 1.02 + 0.2 * 1.06;
    const path = pathValues(runMonteCarloSimulation(params));
    expect(path[3]).toBeCloseTo(1_000_000 * growth ** 3, 3);
  });

  it('the Ventaglio and the decumulation run read the same market: same weights, same growth', () => {
    const weights = monteCarloClassRecord((cls) => (cls === 'equity' ? 50 : cls === 'cash' ? 30 : cls === 'gold' ? 20 : 0));
    const decumulation = pathValues(runMonteCarloSimulation(makeDeterministicParams({ withdrawalAdjustment: 'fixed', annualWithdrawal: 0, weights, market, retirementYears: 4 })));
    const accumulation = runAccumulationSimulation(
      makeAccumulationParams({ initialPortfolio: 1_000_000, annualSavings: 0, annualExpenses: 1, weights, market, years: 4, numberOfSimulations: 1 }),
    );
    accumulation.paths[0].forEach((point, year) => expect(point.value).toBeCloseTo(decumulation[year], 3));
  });

  it('a seeded lognormal run keeps the median compound growth at the CAGR (A5 through the engine)', () => {
    const volatile: MonteCarloMarketScenario = { classes: monteCarloClassRecord(() => ({ cagr: 7, volatility: 18 })), inflationRate: 0 };
    const result = runMonteCarloSimulation(
      makeDeterministicParams({
        withdrawalAdjustment: 'fixed',
        annualWithdrawal: 0,
        weights: allIn('equity'),
        market: volatile,
        retirementYears: 1,
        numberOfSimulations: 20_000,
        random: createSeededRandom(11),
      }),
    );
    const finals = result.simulations.map((sim) => sim.finalValue).sort((a, b) => a - b);
    const medianGrowthPct = (finals[Math.floor(finals.length / 2)] / 1_000_000 - 1) * 100;
    expect(Math.abs(medianGrowthPct - 7)).toBeLessThan(0.5);
  });
});

describe('leverage (T3, rule R4)', () => {
  /** Equity at `equityCagr`, cash at `cashCagr`, everything else flat; no volatility. */
  const market = (equityCagr: number, cashCagr: number): MonteCarloMarketScenario => ({
    classes: monteCarloClassRecord((cls) => ({ cagr: cls === 'equity' ? equityCagr : cls === 'cash' ? cashCagr : 0, volatility: 0 })),
    inflationRate: 0,
  });
  const leveraged = (equity: number): Record<MonteCarloClass, number> => monteCarloClassRecord((cls) => (cls === 'equity' ? equity : 0));

  it('A10: equity 150%, cash 2%, spread 1%, equity 7% → r_p = 1,5·1,07 − 0,5·1,03 − 1 = 9,0%', () => {
    const result = runMonteCarloSimulation(
      makeDeterministicParams({ weights: leveraged(150), market: market(7, 2), leverageSpread: 1, annualWithdrawal: 0, retirementYears: 1 }),
    );
    expect(result.simulations[0].path[1].value).toBeCloseTo(1_090_000, 4);
  });

  it('A11: a year of equity −60% at leverage 2,5 with the debt at 4% wipes the capital out: ruin by leverage in year 1', () => {
    // 1 + r_p = 2,5·0,40 − 1,5·1,04 = −0,56
    const result = runMonteCarloSimulation(
      makeDeterministicParams({ weights: leveraged(250), market: market(-60, 4), annualWithdrawal: 0, retirementYears: 5, numberOfSimulations: 3 }),
    );
    expect(result.successRate).toBe(0);
    expect(result.leverageFailureCount).toBe(3);
    for (const sim of result.simulations) {
      expect(sim.failureCause).toBe('leverage');
      expect(sim.failureYear).toBe(1);
      expect(sim.finalValue).toBe(0);
    }
  });

  it('a path the withdrawals run out is a failure by withdrawals, not by leverage', () => {
    const result = runMonteCarloSimulation(makeDeterministicParams({ initialPortfolio: 100_000, annualWithdrawal: 60_000, retirementYears: 5, market: flatMarket(0) }));
    expect(result.failureCount).toBe(result.simulations.length);
    expect(result.leverageFailureCount).toBe(0);
    expect(result.simulations[0].failureCause).toBe('withdrawals');
  });

  it('A12: at leverage 1 the spread is irrelevant, float for float, on the same seed', () => {
    const base = makeDeterministicParams({
      market: { classes: monteCarloClassRecord(() => ({ cagr: 6, volatility: 15 })), inflationRate: 2 },
      weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 30 : cls === 'cash' ? 10 : 0)),
      numberOfSimulations: 200,
      retirementYears: 20,
    });
    const without = runMonteCarloSimulation({ ...base, random: createSeededRandom(5) });
    const withSpread = runMonteCarloSimulation({ ...base, leverageSpread: 7, random: createSeededRandom(5) });
    expect(withSpread.simulations).toEqual(without.simulations);
    expect(withSpread.successRate).toBe(without.successRate);
  });

  it('A13: every path consumes the same number of uniforms whatever happens to it, so a leveraged run and an unleveraged one meet the same shocks', () => {
    const counted = (weights: Record<MonteCarloClass, number>) => {
      const rng = createSeededRandom(9);
      let calls = 0;
      const random = () => {
        calls++;
        return rng();
      };
      runMonteCarloSimulation(
        makeDeterministicParams({
          weights,
          market: { classes: monteCarloClassRecord(() => ({ cagr: 5, volatility: 40 })), inflationRate: 0 },
          annualWithdrawal: 80_000,
          numberOfSimulations: 50,
          retirementYears: 25,
          random,
        }),
      );
      return calls;
    };
    // 7 classes × 2 uniforms × 25 years × 50 paths, with ruin by leverage, ruin by withdrawals or neither.
    expect(counted(leveraged(100))).toBe(7 * 2 * 25 * 50);
    expect(counted(leveraged(250))).toBe(7 * 2 * 25 * 50);
  });

  it('with the same seed the leveraged and the unleveraged Base differ only by the leverage: scaling the weights back to 100 reproduces the unleveraged run', () => {
    const volatile: MonteCarloMarketScenario = { classes: monteCarloClassRecord(() => ({ cagr: 6, volatility: 18 })), inflationRate: 2 };
    const run = (weights: Record<MonteCarloClass, number>, spread: number) =>
      runMonteCarloSimulation(makeDeterministicParams({ weights, market: volatile, leverageSpread: spread, numberOfSimulations: 500, retirementYears: 30, random: createSeededRandom(21) }));
    const mix = (equity: number, cash: number) => monteCarloClassRecord((cls) => (cls === 'equity' ? equity : cls === 'cash' ? cash : 0));
    const levered = run(mix(150, 0), 2);
    const unlevered = run(mix(100, 0), 2);
    const alsoUnlevered = run(mix(150 / 1.5, 0), 0);
    expect(alsoUnlevered.simulations).toEqual(unlevered.simulations);
    expect(levered.successRate).not.toBe(unlevered.successRate);
  });

  it('is reproducible: the same seed and parameters give the same results', () => {
    const params = makeDeterministicParams({ weights: leveraged(150), market: { classes: monteCarloClassRecord(() => ({ cagr: 6, volatility: 20 })), inflationRate: 0 }, numberOfSimulations: 300, retirementYears: 25, annualWithdrawal: 40_000 });
    const a = runMonteCarloSimulation({ ...params, random: createSeededRandom(3) });
    const b = runMonteCarloSimulation({ ...params, random: createSeededRandom(3) });
    expect(b.successRate).toBe(a.successRate);
    expect(b.percentiles).toEqual(a.percentiles);
  });

  it('the Ventaglio floors a leveraged year at zero and counts it as ruin in the retirement ledger', () => {
    const result = runAccumulationSimulation(
      makeAccumulationParams({
        initialPortfolio: 1_000_000,
        annualSavings: 0,
        annualExpenses: 1,
        withdrawalRate: 4,
        weights: leveraged(250),
        market: market(-60, 4),
        years: 3,
        numberOfSimulations: 2,
      }),
    );
    for (const path of result.paths) path.forEach((point) => expect(point.value).toBeGreaterThanOrEqual(0));
    expect(result.paths[0][1].value).toBe(0);
    expect(result.retirements[0]?.ruinYear).toBe(1);
  });
});
