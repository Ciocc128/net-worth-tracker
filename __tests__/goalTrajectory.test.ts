/**
 * Unit tests for the goal trajectory pure layer (Obiettivi redesign).
 * Pure math + derivation — no Firebase, no React. Time is injected via `now`.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (asset: { quantity: number; currentPrice: number }) => asset.quantity * asset.currentPrice,
}));

import { GOAL_TEST_ASSUMPTIONS as ASSUMPTIONS } from './goalAssumptionsFixture';
import {
  goalAnnualReturn,
  futureValue,
  monthlyRate,
  requiredMonthlyContribution,
  monthsToReach,
  computeGoalTrajectory,
  buildGoalProjectionSeries,
  allocateContributionAcrossGoals,
  sortGoalRowsByUrgency,
  type GoalRow,
} from '@/lib/utils/goalTrajectory';
import { resolveClassCosts } from '@/lib/utils/fireCosts';
import type { Asset } from '@/types/assets';
import { InvestmentGoal, GoalProgress } from '@/types/goals';

const NOW = new Date('2026-01-01T00:00:00Z');
// ~5 years out.
const dateInMonths = (months: number) =>
  new Date(NOW.getTime() + months * 1000 * 60 * 60 * 24 * 30.44).toISOString();

// ==================== goalAnnualReturn (D8, A14–A16) ====================

describe('goalAnnualReturn', () => {
  it('without an allocation it is the target portfolio\'s Base return (A3: 60/40 → 6,6218%, nominale)', () => {
    const r = goalAnnualReturn(undefined, ASSUMPTIONS);
    expect(r.origin).toBe('portfolio');
    expect(r.rate).toBeCloseTo(6.6218, 3);
    expect(goalAnnualReturn({}, ASSUMPTIONS).origin).toBe('portfolio');
  });

  it('a single class returns exactly its Base CAGR (A1)', () => {
    expect(goalAnnualReturn({ equity: 100 }, ASSUMPTIONS).rate).toBeCloseTo(7.893818, 4);
  });

  it('A14: 80% equity + 20% bonds, Base → 7,3309%', () => {
    const r = goalAnnualReturn({ equity: 80, bonds: 20 }, ASSUMPTIONS);
    expect(r.origin).toBe('allocation');
    expect(r.rate).toBeCloseTo(7.3309, 3);
  });

  it('A15: 20% equity + 70% bonds + 10% cash, Base → 4,6272%', () => {
    expect(goalAnnualReturn({ equity: 20, bonds: 70, cash: 10 }, ASSUMPTIONS).rate).toBeCloseTo(4.6272, 3);
  });

  it('A16: 90% equity + 10% crypto → equity rescaled to 100 (7,8938%), crypto declared outside', () => {
    const r = goalAnnualReturn({ equity: 90, crypto: 10 }, ASSUMPTIONS);
    expect(r.rate).toBeCloseTo(7.893818, 4);
    expect(r.outside).toEqual(['crypto']);
  });

  it('normalises weights that do not sum to 100', () => {
    expect(goalAnnualReturn({ equity: 40, bonds: 10 }, ASSUMPTIONS).rate).toBeCloseTo(goalAnnualReturn({ equity: 80, bonds: 20 }, ASSUMPTIONS).rate, 8);
  });

  it('an allocation made only of crypto and real estate falls back to the portfolio', () => {
    const r = goalAnnualReturn({ crypto: 60, realestate: 40 }, ASSUMPTIONS);
    expect(r.origin).toBe('portfolio');
    expect(r.rate).toBeCloseTo(6.6218, 3);
  });
});

// ==================== futureValue ====================

describe('futureValue', () => {
  it('returns the present value at zero months', () => {
    expect(futureValue(1000, 100, 7, 0)).toBe(1000);
  });

  it('handles zero rate as simple accumulation', () => {
    expect(futureValue(1000, 100, 0, 12)).toBe(1000 + 100 * 12);
  });

  it('compounds the starting balance and contributions', () => {
    // PV 10000 @ 6%/yr for 12 months, no contribution → exactly 6% (RO3, the equivalent monthly rate).
    const expected = 10000 * Math.pow(1 + monthlyRate(6), 12);
    expect(futureValue(10000, 0, 6, 12)).toBeCloseTo(expected, 4);
    expect(expected).toBeCloseTo(10600, 6);
  });
});

// ==================== requiredMonthlyContribution ====================

describe('requiredMonthlyContribution', () => {
  it('zero rate splits the gap evenly', () => {
    // need 1200 more over 12 months → 100/month
    expect(requiredMonthlyContribution(0, 1200, 0, 12)).toBeCloseTo(100, 5);
  });

  it('returns 0 when growth alone reaches the target', () => {
    // huge PV already overshoots
    expect(requiredMonthlyContribution(100000, 50000, 7, 12)).toBe(0);
  });

  it('round-trips with futureValue', () => {
    const c = requiredMonthlyContribution(5000, 20000, 5, 36);
    const fv = futureValue(5000, c, 5, 36);
    expect(fv).toBeCloseTo(20000, 2);
  });

  it('clamps months to at least 1 (past deadline)', () => {
    const c = requiredMonthlyContribution(0, 1000, 0, 0);
    expect(c).toBeCloseTo(1000, 5);
  });
});

// ==================== monthsToReach ====================

describe('monthsToReach', () => {
  it('returns 0 when already at target', () => {
    expect(monthsToReach(1000, 1000, 0, 5)).toBe(0);
    expect(monthsToReach(1500, 1000, 0, 5)).toBe(0);
  });

  it('returns null when never reachable (no rate, no contribution)', () => {
    expect(monthsToReach(500, 1000, 0, 0)).toBeNull();
  });

  it('zero rate divides the gap by the contribution', () => {
    expect(monthsToReach(0, 1000, 100, 0)).toBe(10);
  });

  it('round-trips: futureValue at monthsToReach covers the target', () => {
    const m = monthsToReach(5000, 20000, 300, 6)!;
    expect(m).toBeGreaterThan(0);
    expect(futureValue(5000, 300, 6, m)).toBeGreaterThanOrEqual(20000);
  });
});

// ==================== computeGoalTrajectory ====================

describe('computeGoalTrajectory', () => {
  it('open-ended goal → noTarget verdict', () => {
    const t = computeGoalTrajectory({ assumptions: ASSUMPTIONS, currentValue: 5000, now: NOW });
    expect(t.verdict).toBe('noTarget');
    expect(t.requiredMonthlyContribution).toBeNull();
  });

  it('reached when current value meets the target', () => {
    const t = computeGoalTrajectory({ assumptions: ASSUMPTIONS,
      currentValue: 12000,
      targetAmount: 10000,
      targetDate: dateInMonths(24),
      now: NOW,
    });
    expect(t.verdict).toBe('reached');
  });

  it('target without a date → noDeadline', () => {
    const t = computeGoalTrajectory({ assumptions: ASSUMPTIONS,
      currentValue: 1000,
      targetAmount: 10000,
      now: NOW,
    });
    expect(t.verdict).toBe('noDeadline');
    expect(t.requiredMonthlyContribution).toBeNull();
  });

  it('off track when contribution is too low for the deadline', () => {
    const t = computeGoalTrajectory({ assumptions: ASSUMPTIONS,
      currentValue: 0,
      targetAmount: 12000,
      targetDate: dateInMonths(12),
      monthlyContribution: 100, // need ~1000/month
      annualReturn: 0,
      now: NOW,
    });
    expect(t.verdict).toBe('offTrack');
    expect(t.requiredMonthlyContribution).toBeCloseTo(1000, 0);
  });

  it('on track when contribution meets the required pace', () => {
    const t = computeGoalTrajectory({ assumptions: ASSUMPTIONS,
      currentValue: 0,
      targetAmount: 12000,
      targetDate: dateInMonths(12),
      monthlyContribution: 1000,
      annualReturn: 0,
      now: NOW,
    });
    expect(t.verdict).toBe('onTrack');
    expect(t.projectedValueAtDeadline).toBeCloseTo(12000, 0);
  });

  it('derives the return from the recommended allocation when not overridden', () => {
    const t = computeGoalTrajectory({ assumptions: ASSUMPTIONS,
      currentValue: 0,
      targetAmount: 10000,
      recommendedAllocation: { equity: 100 },
      now: NOW,
    });
    expect(t.annualReturn).toBeCloseTo(7.893818, 4);
    expect(t.returnOrigin).toBe('allocation');
  });

  it('produces a projected date when a contribution is set', () => {
    const t = computeGoalTrajectory({ assumptions: ASSUMPTIONS,
      currentValue: 0,
      targetAmount: 1200,
      monthlyContribution: 100,
      annualReturn: 0,
      now: NOW,
    });
    expect(t.monthsToTarget).toBe(12);
    expect(t.projectedDate).not.toBeNull();
  });
});

// ==================== buildGoalProjectionSeries ====================

describe('buildGoalProjectionSeries', () => {
  it('starts at the current value and ends at/above the deadline horizon', () => {
    const series = buildGoalProjectionSeries({
      currentValue: 1000,
      targetAmount: 13000,
      targetDate: dateInMonths(12),
      monthlyContribution: 1000,
      annualReturn: 0,
      now: NOW,
    });
    expect(series.length).toBeGreaterThan(1);
    expect(series[0].value).toBe(1000);
    expect(series[0].monthIndex).toBe(0);
    expect(series[series.length - 1].monthIndex).toBe(12);
    expect(series.every((p) => p.target === 13000)).toBe(true);
  });

  it('caps the number of points', () => {
    const series = buildGoalProjectionSeries(
      {
        currentValue: 0,
        targetAmount: 100000,
        targetDate: dateInMonths(480), // 40 years
        monthlyContribution: 200,
        annualReturn: 5,
        now: NOW,
      },
      48
    );
    expect(series.length).toBeLessThanOrEqual(50);
  });
});

// ==================== allocateContributionAcrossGoals ====================

const mkGoal = (over: Partial<InvestmentGoal>): InvestmentGoal => ({
  id: 'g',
  name: 'Goal',
  priority: 'media',
  color: '#000',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const mkProgress = (goalId: string, currentValue: number): GoalProgress => ({
  goalId,
  goalName: goalId,
  goalColor: '#000',
  currentValue,
  actualAllocation: {},
});

describe('allocateContributionAcrossGoals', () => {
  it('returns empty for non-positive amounts', () => {
    expect(allocateContributionAcrossGoals([], [], 0)).toEqual([]);
  });

  it('skips fully-funded and open-ended goals', () => {
    const goals = [
      mkGoal({ id: 'full', targetAmount: 1000 }),
      mkGoal({ id: 'open' }), // no target
      mkGoal({ id: 'active', targetAmount: 5000, priority: 'media' }),
    ];
    const progress = [
      mkProgress('full', 1000),
      mkProgress('open', 0),
      mkProgress('active', 1000),
    ];
    const slices = allocateContributionAcrossGoals(goals, progress, 1000);
    expect(slices).toHaveLength(1);
    expect(slices[0].goalId).toBe('active');
  });

  it('weights by gap × priority and never exceeds the gap', () => {
    const goals = [
      mkGoal({ id: 'a', targetAmount: 10000, priority: 'alta' }), // gap 10000 × 3
      mkGoal({ id: 'b', targetAmount: 10000, priority: 'bassa' }), // gap 10000 × 1
    ];
    const progress = [mkProgress('a', 0), mkProgress('b', 0)];
    const slices = allocateContributionAcrossGoals(goals, progress, 4000);
    const a = slices.find((s) => s.goalId === 'a')!;
    const b = slices.find((s) => s.goalId === 'b')!;
    // 3:1 split of 4000 → 3000 / 1000
    expect(a.add).toBeCloseTo(3000, 2);
    expect(b.add).toBeCloseTo(1000, 2);
    expect(a.add).toBeLessThanOrEqual(a.gap);
  });
});

// ==================== ordering + summary ====================

function mkRow(
  id: string,
  verdict: GoalRow['trajectory']['verdict'],
  monthsToDeadline: number | null,
  required: number | null = 0
): GoalRow {
  return {
    goal: mkGoal({ id, name: id, color: '#123' }),
    progress: mkProgress(id, 0),
    trajectory: {
      verdict,
      annualReturn: 5,
      returnOrigin: 'portfolio',
      returnOutside: [],
      monthsToDeadline,
      requiredMonthlyContribution: required,
      currentMonthlyContribution: 0,
      projectedDate: null,
      monthsToTarget: null,
      projectedValueAtDeadline: null,
    },
  };
}

describe('sortGoalRowsByUrgency', () => {
  it('orders off-track first and reached last, nearest deadline within a tier', () => {
    const rows = [
      mkRow('reached', 'reached', 6),
      mkRow('onTrackFar', 'onTrack', 60),
      mkRow('offTrackNear', 'offTrack', 6),
      mkRow('offTrackFar', 'offTrack', 48),
    ];
    const sorted = sortGoalRowsByUrgency(rows).map((r) => r.goal.id);
    expect(sorted).toEqual(['offTrackNear', 'offTrackFar', 'onTrackFar', 'reached']);
  });
});

describe('goalAnnualReturn — recurring costs (RC5, C10)', () => {
  const costs = resolveClassCosts(
    [
      { id: 'e', name: 'e', type: 'etf', assetClass: 'equity', currentPrice: 100_000, quantity: 1, totalExpenseRatio: 0.2 },
      { id: 'b', name: 'b', type: 'etf', assetClass: 'bonds', currentPrice: 50_000, quantity: 1, totalExpenseRatio: 0.1 },
      { id: 'cc', name: 'cc', type: 'cash', assetClass: 'cash', subCategory: 'Conto corrente', currentPrice: 20_000, quantity: 1 },
      { id: 'cd', name: 'cd', type: 'cash', assetClass: 'cash', subCategory: 'Conto deposito', currentPrice: 10_000, quantity: 1 },
    ] as Asset[],
    { stampDutyEnabled: true, stampDutyRate: 0.2, checkingAccountSubCategory: 'Conto corrente' },
  );

  it('C10: 80% equity + 20% bonds → c 0,38%, Base (1,073309 · 0,9962) − 1 = 6,9230% (gross 7,3309%)', () => {
    expect(goalAnnualReturn({ equity: 80, bonds: 20 }, { ...ASSUMPTIONS, costs }).rate).toBeCloseTo(6.923, 3);
  });

  it('without costs the return is the gross one (A14)', () => {
    expect(goalAnnualReturn({ equity: 80, bonds: 20 }, ASSUMPTIONS).rate).toBeCloseTo(7.3309, 3);
  });
});

// ==================== RO3: the equivalent monthly rate (G9) ====================

describe('RO3 — tasso mensile equivalente (G9)', () => {
  it('twelve months earn exactly the declared annual return', () => {
    expect(futureValue(10_000, 0, 6, 12)).toBeCloseTo(10_600, 2);
  });

  it('futureValue(20.000, 600, 5%, 36) = 46.366,08', () => {
    expect(futureValue(20_000, 600, 5, 36)).toBeCloseTo(46_366.08, 2);
  });

  it('requiredMonthlyContribution(20.000 → 50.000, 5%, 36) = 693,93', () => {
    expect(requiredMonthlyContribution(20_000, 50_000, 5, 36)).toBeCloseTo(693.93, 2);
  });

  it('monthsToReach(20.000 → 50.000, 600, 5%) = 41', () => {
    expect(monthsToReach(20_000, 50_000, 600, 5)).toBe(41);
  });

  it('a zero return is unchanged', () => {
    expect(futureValue(1_000, 100, 0, 10)).toBe(2_000);
    expect(requiredMonthlyContribution(1_000, 2_000, 0, 10)).toBe(100);
  });

  it('the chart series and the future value agree', () => {
    const series = buildGoalProjectionSeries({ currentValue: 20_000, targetAmount: 50_000, monthlyContribution: 600, annualReturn: 5, targetDate: dateInMonths(36), now: NOW });
    expect(series[series.length - 1].value).toBe(Math.round(futureValue(20_000, 600, 5, series[series.length - 1].monthIndex)));
  });
});
