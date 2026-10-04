/**
 * Tests for lib/utils/fireTargetAge.ts — «Età obiettivo» (E1, doc/fire-ipotesi/README.md § 10.5, RS6–RS9),
 * on the Calcolatore's own deterministic walk. Reference values: § 10.8 E1–E5.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/chartService', () => ({ formatCurrencyCompact: (value: number) => String(Math.round(value)) }));

import { calculateFIREProjection } from '@/lib/services/fireService';
import { resolveLeverCap, solveSavingsForTail } from '@/lib/utils/fireDistribution';
import { solveMaxPlanExpenses, solveSavingsForTargetYear, summarizeTargetAge, yearsToTargetAge, type FireWalk } from '@/lib/utils/fireTargetAge';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { runAccumulationSimulation } from '@/lib/services/monteCarloService';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import type { FIREProjectionScenarios } from '@/types/assets';

const SCENARIOS: FIREProjectionScenarios = {
  bear: { growthRate: 7, inflationRate: 2 },
  base: { growthRate: 7, inflationRate: 2 },
  bull: { growthRate: 7, inflationRate: 2 },
};

/** The Calcolatore's walk with the scenarios of § 10.8 E1, SWR 4%, no bridge, pension or tax. */
function walkFor(capital: number): FireWalk {
  return (savings, expenses) => calculateFIREProjection(capital, expenses, savings, 4, SCENARIOS, 50, undefined, undefined, true).baseYearsToFIRE;
}

describe('RS6 — yearsToTargetAge', () => {
  it('E5: no age, no figure', () => {
    expect(yearsToTargetAge(50, undefined)).toEqual({ kind: 'no-age' });
  });
  it('E5: a target age not ahead of today is «passed»', () => {
    expect(yearsToTargetAge(50, 50)).toEqual({ kind: 'passed', targetAge: 50 });
    expect(yearsToTargetAge(45, 50)).toEqual({ kind: 'passed', targetAge: 45 });
  });
  it('whole years otherwise', () => {
    expect(yearsToTargetAge(50, 35)).toEqual({ kind: 'years', targetAge: 50, years: 15 });
  });
});

describe('RS7 — the saving the Base needs (E1, E3)', () => {
  it('E1: T = 15 → 26.000 € (25.900 € reaches FIRE in 16 years)', () => {
    const walk = walkFor(100_000);
    expect(walk(25_900, 30_000)).toBe(16);
    expect(walk(26_000, 30_000)).toBeLessThanOrEqual(15);
    expect(solveSavingsForTargetYear(walk, 30_000, 15).amount).toBe(26_000);
  });
  it('E1: T = 10 → 48.000 €, T = 20 → 15.300 €', () => {
    const walk = walkFor(100_000);
    expect(solveSavingsForTargetYear(walk, 30_000, 10).amount).toBe(48_000);
    expect(solveSavingsForTargetYear(walk, 30_000, 20).amount).toBe(15_300);
  });
  it('E3: K = 370.000 € is already enough: 0 («il capitale di oggi basta»)', () => {
    expect(solveSavingsForTargetYear(walkFor(370_000), 30_000, 15).amount).toBe(0);
    expect(solveSavingsForTargetYear(walkFor(360_000), 30_000, 15).amount).toBeGreaterThan(0);
  });
  it('null when not even the cap (twenty times the expenses) is enough', () => {
    const solved = solveSavingsForTargetYear(walkFor(1_000), 30_000, 1);
    expect(solved.amount).toBeNull();
    expect(solved.cap).toBe(600_000);
  });
  it('the printed figure meets the target and 100 € less does not', () => {
    const walk = walkFor(100_000);
    for (const target of [8, 12, 15, 18, 25]) {
      const amount = solveSavingsForTargetYear(walk, 30_000, target).amount!;
      expect(walk(amount, 30_000)!).toBeLessThanOrEqual(target);
      if (amount > 0) expect(walk(amount - 100, 30_000) === null || walk(amount - 100, 30_000)! > target).toBe(true);
    }
  });
});

describe('RS9 — the plan\'s expenses the target age allows (E2)', () => {
  it('E2: T = 15, saving 24.000 € → 28.300 € (28.400 € reaches FIRE in 16 years)', () => {
    const walk = walkFor(100_000);
    expect(walk(24_000, 28_400)).toBe(16);
    expect(solveMaxPlanExpenses(walk, 24_000, 30_000, 15)).toBe(28_300);
  });
  it('starts from expenses below the plan\'s own when the plan\'s are out of reach, and above when they are easy', () => {
    const walk = walkFor(100_000);
    expect(solveMaxPlanExpenses(walk, 24_000, 100_000, 15)).toBe(28_300);
    expect(solveMaxPlanExpenses(walk, 24_000, 5_000, 15)).toBe(28_300);
  });
});

describe('summarizeTargetAge', () => {
  const walk = walkFor(100_000);
  const base = { userAge: 35, targetAge: 50, currentYear: 2026, annualSavings: 18_000, planExpenses: 30_000, walk, tail: null };
  it('E5: no age / age behind', () => {
    expect(summarizeTargetAge({ ...base, userAge: undefined, baseYearsToFire: 20 })).toEqual({ kind: 'no-age' });
    expect(summarizeTargetAge({ ...base, targetAge: 35, baseYearsToFire: 20 })).toEqual({ kind: 'passed', targetAge: 35 });
  });
  it('already FIRE today: no figures', () => {
    expect(summarizeTargetAge({ ...base, baseYearsToFire: 0 })).toEqual({ kind: 'already-fire' });
  });
  it('use case 6: the three figures, the calendar year of the target and the Ventaglio\'s total', () => {
    const summary = summarizeTargetAge({
      ...base,
      baseYearsToFire: 20,
      tail: { targetYears: 15, percentile: 0.9, extraCap: 54_000, tailYearsBefore: 19, luckyYearsBefore: 12, extraAnnualSavings: 16_500, tailYearsAfter: 15, luckyYearsAfter: 10 },
    });
    expect(summary).toMatchObject({ kind: 'figures', years: 15, calendarYear: 2041, baseCalendarYear: 2046, onTrack: false, annualSavings: 18_000 });
    if (summary.kind !== 'figures') throw new Error('figures expected');
    expect(summary.required.amount).toBe(26_000);
    expect(summary.tail).toEqual({ kind: 'total', amount: 34_500, extra: 16_500 });
    expect(summary.maxExpenses).not.toBeNull();
  });
  it('use case 7: already on track → the saving that would do is smaller than today\'s', () => {
    const savings = 40_000;
    const baseYearsToFire = walk(savings, 30_000);
    expect(baseYearsToFire).toBeLessThan(15);
    const summary = summarizeTargetAge({ ...base, annualSavings: savings, baseYearsToFire });
    if (summary.kind !== 'figures') throw new Error('figures expected');
    expect(summary.onTrack).toBe(true);
    expect(summary.baseCalendarYear).toBe(2026 + baseYearsToFire!);
    expect(summary.required.amount!).toBeLessThan(savings);
    expect(summary.required.amount!).toBe(26_000);
  });
  it('use case 8: Coast — the capital alone is enough', () => {
    const summary = summarizeTargetAge({ ...base, baseYearsToFire: 5, walk: walkFor(400_000) });
    if (summary.kind !== 'figures') throw new Error('figures expected');
    expect(summary.required.amount).toBe(0);
  });
  it('the Ventaglio\'s «unreachable» and «unavailable» are carried', () => {
    const lever = { targetYears: 15, percentile: 0.9, extraCap: 54_000, tailYearsBefore: null, luckyYearsBefore: null, extraAnnualSavings: null, tailYearsAfter: null, luckyYearsAfter: null };
    const unreachable = summarizeTargetAge({ ...base, baseYearsToFire: 20, tail: lever });
    const unavailable = summarizeTargetAge({ ...base, baseYearsToFire: 20 });
    if (unreachable.kind !== 'figures' || unavailable.kind !== 'figures') throw new Error('figures expected');
    expect(unreachable.tail).toEqual({ kind: 'unreachable', cap: 54_000 });
    expect(unavailable.tail).toEqual({ kind: 'unavailable' });
  });
});

describe('E4 — RS7 and RS8 agree at volatility 0', () => {
  it('today\'s saving + the lever\'s extra = the Base\'s required saving', () => {
    // Every path IS the Base: Azioni 100%, volatility 0, the same 7% / 2% as the walk (no costs, pensions, tax).
    const market = { classes: monteCarloClassRecord((cls) => ({ cagr: cls === 'equity' ? 7 : 0, volatility: 0 })), inflationRate: 2 };
    const weights = monteCarloClassRecord((cls) => (cls === 'equity' ? 100 : 0));
    const years = 25;
    const walk = walkFor(100_000);
    const fireNumber = (t: number) => (30_000 * Math.pow(1.02, t)) / 0.04;
    const fireTargets = Array.from({ length: years + 1 }, (_, t) => fireNumber(t));
    const run = (annualSavings: number) =>
      runAccumulationSimulation({
        initialPortfolio: 100_000,
        annualSavings,
        savingsInflationRate: 2,
        annualExpenses: 30_000,
        withdrawalRate: 4,
        expenseInflationRate: 2,
        weights,
        market,
        numberOfSimulations: 50,
        years,
        retirementHorizonYears: 30,
        fireTargets,
        random: createSeededRandom(1),
      } as Parameters<typeof runAccumulationSimulation>[0]);
    const savings = 20_000;
    const lever = solveSavingsForTail({ baseResult: run(savings), run, baseAnnualSavings: savings, targetYears: 15, extraCap: resolveLeverCap(savings, 30_000) });
    const required = solveSavingsForTargetYear(walk, 30_000, 15).amount!;
    expect(lever.extraAnnualSavings).not.toBeNull();
    expect(savings + lever.extraAnnualSavings!).toBe(required);
  });
});
