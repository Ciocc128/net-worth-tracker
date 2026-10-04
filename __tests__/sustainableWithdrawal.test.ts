import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/chartService', () => ({
  formatCurrencyCompact: (value: number) => String(Math.round(value)),
}));

import { countSuccesses, runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import { solveSustainableWithdrawal, solveForRun, SUSTAINABLE_PROBABILITIES } from '@/lib/utils/sustainableWithdrawal';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import type { MonteCarloMarketScenario, MonteCarloParams } from '@/types/assets';

function flatMarket(equityCagr: number, inflationRate: number): MonteCarloMarketScenario {
  return {
    classes: monteCarloClassRecord((cls) => ({ cagr: cls === 'equity' ? equityCagr : 0, volatility: 0 })),
    inflationRate,
  };
}

/** Volatility 0: every path is the CAGR exactly, so the closed form of RS3 applies. */
function deterministic(overrides: Partial<MonteCarloParams> = {}): MonteCarloParams {
  return {
    portfolioSource: 'custom',
    initialPortfolio: 1_000_000,
    retirementYears: 30,
    weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 100 : 0)),
    annualWithdrawal: 0,
    withdrawalAdjustment: 'inflation',
    market: flatMarket(10.02, 3.04),
    numberOfSimulations: 10,
    ...overrides,
  };
}

function solveDeterministic(params: MonteCarloParams, probability = 0.9) {
  const result = runMonteCarloSimulation(params, { keepFactors: true });
  return { run: { factors: result.factors!, params }, solved: solveForRun({ factors: result.factors!, params }, probability) };
}

/** RS3's closed form: W* = K / Σ_s ((1+π)^s / Π_{u≤s} f_u), the same for every path at volatility 0. */
function closedForm(capital: number, years: number, growth: number, inflation: number): number {
  let sum = 0;
  for (let s = 1; s <= years; s++) sum += Math.pow(1 + inflation, s) / Math.pow(1 + growth, s);
  return capital / sum;
}

describe('solveSustainableWithdrawal — RS3 on a handwritten success curve', () => {
  it('rounds down to 100 € and the figure meets the threshold', () => {
    const solved = solveSustainableWithdrawal({ success: (w) => (w < 43_377 ? 0.93 : 0.4), capital: 1_000_000, probability: 0.9 });
    expect(solved.withdrawal).toBe(43_300);
    expect(solved.rate).toBeCloseTo(0.0433, 6);
    expect(solved.successRate).toBe(0.93);
  });
  it('null when not even zero reaches the probability (S9)', () => {
    const solved = solveSustainableWithdrawal({ success: (w) => (w === 0 ? 0.8 : 0.5), capital: 1_000_000, probability: 0.9 });
    expect(solved).toEqual({ withdrawal: null, successRate: 0, rate: null });
  });
  it('lowers a figure the monotonic bisection overshot', () => {
    // success dips below the threshold at 200 only inside a pocket the bisection can skip over.
    const success = (w: number) => (w >= 150 && w < 250 ? 0.5 : w < 1000 ? 0.95 : 0.1);
    const solved = solveSustainableWithdrawal({ success, capital: 1_000_000, probability: 0.9 });
    expect(success(solved.withdrawal!)).toBeGreaterThanOrEqual(0.9);
  });
});

describe('S1–S3 — volatility 0, closed form', () => {
  it('S1: 10,02% growth, 30 years → 78.700 € at every level', () => {
    const exact = closedForm(1_000_000, 30, 0.1002, 0.0304);
    expect(exact).toBeCloseTo(78_765.23, 1);
    for (const probability of SUSTAINABLE_PROBABILITIES) {
      const { solved } = solveDeterministic(deterministic(), probability);
      expect(solved.withdrawal).toBe(78_700);
    }
    const { run } = solveDeterministic(deterministic());
    expect(countSuccesses(run.factors, 10, run.params, 78_700)).toBe(10);
    expect(countSuccesses(run.factors, 10, run.params, 78_800)).toBe(0);
  });
  it('S2: cost 0,40% → 75.300 €', () => {
    const { solved } = solveDeterministic(deterministic({ annualCostRate: 0.4 }));
    expect(solved.withdrawal).toBe(75_300);
  });
  it('S3: 40 years → 73.000 €', () => {
    expect(closedForm(1_000_000, 40, 0.1002, 0.0304)).toBeCloseTo(73_049.34, 1);
    const { solved } = solveDeterministic(deterministic({ retirementYears: 40 }));
    expect(solved.withdrawal).toBe(73_000);
  });
});

describe('S7, S8 — pensions and tax', () => {
  const base = () =>
    deterministic({
      initialPortfolio: 500_000,
      market: flatMarket(5, 2),
    });
  it('S7: a net pension of 10.000 € from year 11 lifts the figure to 30.900 €', () => {
    expect(solveDeterministic(base()).solved.withdrawal).toBe(25_300);
    const withPension = base();
    withPension.annualInflows = [{ fromYear: 11, annualNetToday: 10_000 }];
    expect(solveDeterministic(withPension).solved.withdrawal).toBe(30_900);
  });
  it('S8: a 26% tax on a 50% gain share lowers it to 20.500 €', () => {
    const taxed = base();
    taxed.withdrawalTax = { basisToday: 250_000, rate: 26 };
    expect(solveDeterministic(taxed).solved.withdrawal).toBe(20_500);
  });
});

describe('S6 — handwritten factors', () => {
  const params = deterministic({ initialPortfolio: 1_000, retirementYears: 5, numberOfSimulations: 10, market: flatMarket(0, 0), annualWithdrawal: 0 });
  // Ten paths × five years; path i grows at 1 + 0,02·i a year (i = 0…9), no inflation.
  const factors = new Float64Array(50);
  for (let i = 0; i < 10; i++) for (let y = 0; y < 5; y++) factors[i * 5 + y] = 1 + 0.02 * i;
  it('success(W) is the share of paths whose W is under their closed-form W*', () => {
    const limits = Array.from({ length: 10 }, (_, i) => closedForm(1_000, 5, 0.02 * i, 0));
    for (const w of [0, 100, 150, 180, 195, 200, 210, 250]) {
      const expected = limits.filter((limit) => w < limit).length;
      expect(countSuccesses(factors, 10, { ...params, withdrawalAdjustment: 'fixed' }, w)).toBe(expected);
    }
  });
});

describe('S9 — leverage ruin', () => {
  it('two paths in ten with a factor ≤ 0: no withdrawal reaches 90% or 95%, 80% is computed on the other eight', () => {
    const params = deterministic({ initialPortfolio: 1_000_000, retirementYears: 3, market: flatMarket(0, 0), withdrawalAdjustment: 'fixed' });
    const factors = new Float64Array(30).fill(1.05);
    factors[3] = -0.1; // path 1, year 4 index → path 1 (indices 3..5): year 1
    factors[3 * 3 + 1] = 0; // path 3, year 2
    const success = (w: number) => countSuccesses(factors, 10, params, w) / 10;
    expect(success(0)).toBe(0.8);
    expect(solveSustainableWithdrawal({ success, capital: 1_000_000, probability: 0.9 }).withdrawal).toBeNull();
    expect(solveSustainableWithdrawal({ success, capital: 1_000_000, probability: 0.95 }).withdrawal).toBeNull();
    expect(solveSustainableWithdrawal({ success, capital: 1_000_000, probability: 0.8 }).withdrawal).toBeGreaterThan(0);
  });
});
