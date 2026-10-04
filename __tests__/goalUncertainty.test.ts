/**
 * RO4–RO7 of doc/fire-ipotesi/README.md § 13: the monthly lognormal simulation of a goal, the probability,
 * the band, the contribution for 9 cases in 10 and the arrival months. Reference values: G10–G14
 * (`/mnt/project-files/fire-simulations/p8-controllo.py`).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (asset: { quantity: number; currentPrice: number }) => asset.quantity * asset.currentPrice,
}));

import { GOAL_TEST_ASSUMPTIONS as ASSUMPTIONS } from './goalAssumptionsFixture';
import {
  computeGoalUncertainty,
  goalLogNormal,
  logNormalFromMoments,
  simulateGoal,
  simulateGoalArrival,
  solveGoalContribution,
} from '@/lib/utils/goalUncertainty';
import { goalAnnualReturn } from '@/lib/utils/goalTrajectory';

const ZERO_VOL = logNormalFromMoments(5.127_16, 0)!; // m such that CAGR = 5% … replaced below
const FIVE_PERCENT = logNormalFromMoments(5, 0)!;
const SIX_TEN = logNormalFromMoments(6, 10)!;

function phi(x: number): number {
  // Abramowitz–Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? erf : -erf));
}

describe('G10 — RO4 moments', () => {
  it('m 1,06 and volatility 10%: s = 0,0941307, mu = ln(1,0553143)', () => {
    expect(SIX_TEN.s).toBeCloseTo(0.0941307, 6);
    expect(SIX_TEN.mu).toBeCloseTo(0.0538386, 6);
    expect(SIX_TEN.mu).toBeCloseTo(Math.log(1.0553143), 6);
  });

  it('a mean factor that is not positive has no lognormal', () => {
    expect(logNormalFromMoments(-100, 10)).toBeNull();
    expect(logNormalFromMoments(-150, 10)).toBeNull();
  });

  it('zero volatility: mu is ln(1 + mean)', () => {
    expect(ZERO_VOL.s).toBe(0);
    expect(FIVE_PERCENT.mu).toBeCloseTo(Math.log(1.05), 12);
  });

  it('the goal\'s lognormal has the CAGR the Traiettoria uses', () => {
    const alloc = { equity: 80, bonds: 20 };
    const resolved = goalLogNormal(alloc, ASSUMPTIONS)!;
    expect(resolved.method.cagr).toBeCloseTo(goalAnnualReturn(alloc, ASSUMPTIONS).rate, 8);
    expect(Math.exp(resolved.logNormal.mu) - 1).toBeCloseTo(resolved.method.cagr / 100, 8);
  });

  it('without an allocation it reads the target portfolio (the page weights)', () => {
    const withWeights = { ...ASSUMPTIONS, weights: { equity: 60, bonds: 40 } as never };
    const resolved = goalLogNormal(undefined, withWeights as never);
    expect(resolved).not.toBeNull();
    expect(resolved!.method.cagr).toBeCloseTo(ASSUMPTIONS.scenarios.base.growthRate, 6);
    expect(goalLogNormal(undefined, ASSUMPTIONS)).toBeNull();
  });
});

describe('G11 — RO5 probability and percentiles', () => {
  const sim = simulateGoal({ logNormal: SIX_TEN, currentValue: 40_000, target: 50_000, months: 36, contribution: 0, sampleMonths: [0, 36] });
  const closed = phi((Math.log(40_000 / (0.999 * 50_000)) + 3 * SIX_TEN.mu) / (SIX_TEN.s * Math.sqrt(3)));

  it('closed form P = 35,50%', () => {
    expect(closed).toBeCloseTo(0.355, 3);
  });

  it('the seeded simulation is within 1,5 points of it', () => {
    expect(Math.abs(sim.probability(0) - closed)).toBeLessThan(0.015);
  });

  it('percentiles at maturity 38.147 / 47.012 / 57.936 within 1%', () => {
    const end = sim.percentiles.find((p) => p.monthIndex === 36)!;
    expect(end.p10 / 38_147).toBeCloseTo(1, 1);
    expect(Math.abs(end.p10 / 38_147 - 1)).toBeLessThan(0.01);
    expect(Math.abs(end.p50 / 47_012 - 1)).toBeLessThan(0.01);
    expect(Math.abs(end.p90 / 57_936 - 1)).toBeLessThan(0.01);
  });

  it('month 0 is today\'s value in every percentile', () => {
    const start = sim.percentiles.find((p) => p.monthIndex === 0)!;
    expect([start.p10, start.p50, start.p90]).toEqual([40_000, 40_000, 40_000]);
  });
});

describe('G12 — RO4–RO6 at zero volatility', () => {
  const input = { logNormal: FIVE_PERCENT, currentValue: 20_000, target: 50_000, months: 36, contribution: 600 };

  it('every path is 46.366,08 € and P = 0%', () => {
    const sim = simulateGoal({ ...input, sampleMonths: [36] });
    const end = sim.percentiles[0];
    expect(end.p10).toBeCloseTo(46_366.08, 2);
    expect(end.p90).toBeCloseTo(46_366.08, 2);
    expect(sim.probability(600)).toBe(0);
  });

  it('c* = 700 € on the 10 € grid (693,93 required), and with 700 there is no solver', () => {
    const sim = simulateGoal(input);
    expect(solveGoalContribution(sim, 600, 693.93)).toEqual({ kind: 'amount', value: 700 });
    expect(sim.probability(700)).toBe(1);
    expect(solveGoalContribution(sim, 700, 693.93)).toEqual({ kind: 'enough' });
  });

  it('an out-of-reach target says «over»', () => {
    const sim = simulateGoal({ ...input, target: 1e12 });
    expect(solveGoalContribution(sim, 600, 1e9)).toEqual({ kind: 'over' });
  });

  it('a goal grown enough alone needs no contribution (c* = 0)', () => {
    const sim = simulateGoal({ ...input, currentValue: 49_000, target: 50_000, contribution: 0 });
    expect(solveGoalContribution(sim, 0, 0)).toEqual({ kind: 'enough' });
  });

  it('the probability grows with the contribution, path for path', () => {
    const sim = simulateGoal({ logNormal: SIX_TEN, currentValue: 20_000, target: 50_000, months: 36, contribution: 0 });
    let last = -1;
    for (let c = 0; c <= 1500; c += 100) {
      const p = sim.probability(c);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it('with volatility the solver lands on the first grid step reaching 90%', () => {
    const sim = simulateGoal({ logNormal: SIX_TEN, currentValue: 20_000, target: 50_000, months: 36, contribution: 0 });
    const reading = solveGoalContribution(sim, 0, 600);
    expect(reading.kind).toBe('amount');
    if (reading.kind === 'amount') {
      expect(sim.probability(reading.value)).toBeGreaterThanOrEqual(0.9);
      expect(reading.value % 10).toBe(0);
      expect(reading.value === 0 || sim.probability(reading.value - 10) < 0.9).toBe(true);
    }
  });
});

describe('G13 — RO7 arrival months', () => {
  it('at zero volatility both are monthsToReach = 41', () => {
    expect(simulateGoalArrival({ logNormal: FIVE_PERCENT, currentValue: 20_000, target: 50_000, contribution: 600 })).toEqual({ medianMonths: 41, p90Months: 41 });
  });

  it('with volatility the 9-in-10 month is not earlier than the median', () => {
    const a = simulateGoalArrival({ logNormal: SIX_TEN, currentValue: 20_000, target: 50_000, contribution: 600 });
    expect(a.medianMonths).not.toBeNull();
    expect(a.p90Months).not.toBeNull();
    expect(a.p90Months!).toBeGreaterThanOrEqual(a.medianMonths!);
  });

  it('never within 50 years is null', () => {
    expect(simulateGoalArrival({ logNormal: logNormalFromMoments(0, 0)!, currentValue: 100, target: 1e9, contribution: 0 })).toEqual({ medianMonths: null, p90Months: null });
  });
});

describe('G14 — reproducibility', () => {
  it('two calls with the same inputs give the same numbers', () => {
    const run = () => simulateGoal({ logNormal: SIX_TEN, currentValue: 40_000, target: 50_000, months: 36, contribution: 100, sampleMonths: [12, 36] });
    const a = run();
    const b = run();
    expect(a.probability(100)).toBe(b.probability(100));
    expect(a.percentiles).toEqual(b.percentiles);
  });

  it('a goal does not change when another is computed in between', () => {
    const first = simulateGoal({ logNormal: SIX_TEN, currentValue: 40_000, target: 50_000, months: 36, contribution: 0 }).probability(0);
    simulateGoal({ logNormal: logNormalFromMoments(9, 18)!, currentValue: 1_000, target: 9_000, months: 60, contribution: 50 });
    const again = simulateGoal({ logNormal: SIX_TEN, currentValue: 40_000, target: 50_000, months: 36, contribution: 0 }).probability(0);
    expect(again).toBe(first);
  });
});

describe('computeGoalUncertainty', () => {
  const base = { allocation: { equity: 60, bonds: 40 }, assumptions: ASSUMPTIONS, currentValue: 20_000, target: 50_000, contribution: 600, requiredMonthly: 700 };

  it('no reading without a target, when reached, or past the deadline', () => {
    expect(computeGoalUncertainty({ ...base, target: 0, monthsToDeadline: 36 })).toBeNull();
    expect(computeGoalUncertainty({ ...base, currentValue: 60_000, monthsToDeadline: 36 })).toBeNull();
    expect(computeGoalUncertainty({ ...base, monthsToDeadline: 0 })).toBeNull();
  });

  it('dated: the probability alone is light, with the sample months it is full', () => {
    const light = computeGoalUncertainty({ ...base, monthsToDeadline: 36 });
    expect(light?.kind).toBe('dated');
    if (light?.kind === 'dated') expect(light.detail).toBeNull();
    const full = computeGoalUncertainty({ ...base, monthsToDeadline: 36, sampleMonths: [0, 12, 24, 36] });
    expect(full?.kind).toBe('dated');
    if (full?.kind === 'dated' && light?.kind === 'dated') {
      expect(full.probability).toBe(light.probability);
      expect(full.detail?.percentiles).toHaveLength(4);
      expect(full.detail?.atDeadline?.monthIndex).toBe(36);
      expect(full.detail?.contribution.kind).toBeDefined();
    }
  });

  it('no deadline: the arrival months', () => {
    expect(computeGoalUncertainty({ ...base, monthsToDeadline: null })?.kind).toBe('arrival');
  });

  it('a portfolio without a defined return says so', () => {
    expect(computeGoalUncertainty({ ...base, allocation: undefined, monthsToDeadline: 36 })).toEqual({ kind: 'unavailable' });
  });

  it('measures the cost of a full reading (10 goals, one with the solver)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 9; i++) computeGoalUncertainty({ ...base, monthsToDeadline: 36 });
    computeGoalUncertainty({ ...base, monthsToDeadline: 36, sampleMonths: Array.from({ length: 37 }, (_, i) => i) });
    const elapsed = performance.now() - t0;
    console.info(`goalUncertainty: 10 goals, one full: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(2000);
  });
});
