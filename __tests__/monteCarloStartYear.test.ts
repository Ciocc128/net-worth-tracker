import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/chartService', () => ({
  formatCurrencyCompact: (value: number) => String(Math.round(value)),
}));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

/**
 * T5 «Dopo il FIRE» (doc/montecarlo/README.md § 12): `startYear` restarts the run's clock at the FIRE year, in today's euros
 * (RD4). Zero volatility makes every path deterministic, so the figures are the hand-computed ones of § 12.11 (A-T1…A-T6).
 */
import { runMonteCarloSimulation, countSuccesses } from '@/lib/services/monteCarloService';
import type { MonteCarloMarketScenario, MonteCarloParams } from '@/types/assets';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import type { ResolvedFlow } from '@/lib/utils/datedFlows';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';

function market(cagr: number, inflationRate: number): MonteCarloMarketScenario {
  return { classes: monteCarloClassRecord((cls) => ({ cagr: cls === 'equity' ? cagr : 0, volatility: 0 })), inflationRate };
}

function params(overrides: Partial<MonteCarloParams> = {}): MonteCarloParams {
  return {
    portfolioSource: 'custom',
    initialPortfolio: 1_000_000,
    retirementYears: 3,
    weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 100 : 0)),
    annualWithdrawal: 40_000,
    withdrawalAdjustment: 'inflation',
    market: market(5, 2),
    numberOfSimulations: 4,
    ...overrides,
  };
}

const path = (p: MonteCarloParams): number[] => runMonteCarloSimulation(p).simulations[0].path.map((point) => point.value);

describe('A-T1 — startYear absent or 0 is the run of before', () => {
  it('the same seeded run, float for float, with and without startYear: 0', () => {
    const base = params({ market: getDefaultMonteCarloMarket().scenarios.base, weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0)), numberOfSimulations: 300, retirementYears: 30 });
    const a = runMonteCarloSimulation({ ...base, random: createSeededRandom(MONTE_CARLO_SEED) });
    const b = runMonteCarloSimulation({ ...base, startYear: 0, random: createSeededRandom(MONTE_CARLO_SEED) });
    expect(b.successCount).toBe(a.successCount);
    expect(b.percentiles).toEqual(a.percentiles);
    expect(b.simulations.map((s) => s.finalValue)).toEqual(a.simulations.map((s) => s.finalValue));
  });

  it('S5: countSuccesses on the kept factors equals a fresh run, with a startYear and a pension', () => {
    const base = params({
      market: getDefaultMonteCarloMarket().scenarios.base,
      retirementYears: 25,
      numberOfSimulations: 400,
      annualInflows: [{ fromYear: 12, annualNetToday: 12_000 }],
      capitalInflows: [{ year: 9, amount: 60_000 }],
      startYear: 5,
      random: createSeededRandom(MONTE_CARLO_SEED),
    });
    const run = runMonteCarloSimulation(base, { keepFactors: true });
    const replay = countSuccesses(run.factors!, base.numberOfSimulations, { ...base }, base.annualWithdrawal);
    expect(replay).toBe(run.successCount);
  });
});

describe('A-T2 — the ledger at zero volatility, startYear 5', () => {
  it('ends year 1, 2 and 3 at 1.009.200, 1.018.044 and 1.026.497,88 (as startYear 0)', () => {
    const values = path(params({ startYear: 5 }));
    expect(values[1]).toBeCloseTo(1_009_200, 2);
    expect(values[2]).toBeCloseTo(1_018_044, 2);
    expect(values[3]).toBeCloseTo(1_026_497.88, 2);
    expect(path(params())).toEqual(values);
  });
});

describe('A-T4 — a state pension dated from today is read at T + s', () => {
  const pension = { annualInflows: [{ fromYear: 7, annualNetToday: 10_000 }] };
  it('startYear 5: active from s = 2 (10.404 € and 10.612,08 €)', () => {
    const values = path(params({ startYear: 5, ...pension }));
    expect(values[1]).toBeCloseTo(1_009_200, 2);
    expect(values[2]).toBeCloseTo(1_028_448, 2);
    expect(values[3]).toBeCloseTo(1_048_034.16, 2);
  });
  it('startYear 0: the pension is beyond the horizon, as A-T2', () => {
    expect(path(params(pension))[3]).toBeCloseTo(1_026_497.88, 2);
  });
});

describe('A-T5 — a locked fund unlocking at u enters at s = u − T, at today\'s value', () => {
  it('two inflows of 50.000 at years 6 and 4, startYear 5: the first enters at s = 1 for 45.286,54, the second is already in the capital', () => {
    const values = path(params({ startYear: 5, capitalInflows: [{ year: 6, amount: 50_000 }, { year: 4, amount: 50_000 }] }));
    expect(values[1]).toBeCloseTo(1_056_750.87, 2);
    expect(values[2]).toBeCloseTo(1_067_972.41, 2);
    expect(values[3]).toBeCloseTo(1_078_922.71, 2);
  });
});

describe('A-T6 — dated flows: «dal FIRE» starts at the FIRE year, read at T + s and brought to today\'s euros', () => {
  const fireExpense: ResolvedFlow = {
    id: 'f1',
    label: 'Spesa dal FIRE',
    kind: 'expense',
    sigma: 1,
    indexed: false,
    amount: 5_000,
    anchor: 'fire',
    start: 0,
    durationYears: 2,
    inCashflowToday: false,
  };
  const flows = { resolved: [fireExpense], planExpensesFromCashflow: false };

  it('startYear 5: 5.000 € ÷ 1,02⁵ the years s = 1 and 2, nothing at s = 3', () => {
    const need = 5_000 / Math.pow(1.02, 5);
    const values = path(params({ startYear: 5, flows }));
    let expected = 1_000_000;
    const expectedPath = [expected];
    for (let s = 1; s <= 3; s++) {
      expected = expected * 1.05 - 40_000 * Math.pow(1.02, s) - (s <= 2 ? need : 0);
      expectedPath.push(expected);
    }
    values.forEach((value, index) => expect(value).toBeCloseTo(expectedPath[index], 4));
  });

  it('startYear 0: the flow opens in year 1 + afterYears from today, as before', () => {
    const values = path(params({ flows }));
    let expected = 1_000_000;
    for (let s = 1; s <= 3; s++) expected = expected * 1.05 - 40_000 * Math.pow(1.02, s) - (s <= 2 ? 5_000 : 0);
    expect(values[3]).toBeCloseTo(expected, 4);
  });
});
