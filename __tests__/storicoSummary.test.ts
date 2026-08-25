/**
 * Tests for lib/utils/storicoSummary.ts — the numbers behind Storico's verdict and tiles: the
 * growth since the first snapshot (wealth growth, contributions INCLUDED), the best and worst
 * month, the all-time high, the pace of the last twelve months against the lifetime average,
 * and the next-doubling projection at that pace. Pure: no Firebase, no clock.
 */

import { describe, expect, it } from 'vitest';
import type { DoublingMilestone, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import {
  addMonths,
  CAGR_MIN_MONTHS,
  monthSpan,
  PACE_MIN_HISTORY_MONTHS,
  projectNextDoubling,
  resolveDriverShares,
  resolveFeaturedDriverYear,
  runningSinceMonth,
  selectDriverYears,
  selectTrailingMonths,
  summarizeAllTimeHigh,
  summarizeGrowth,
  summarizeGrowthPace,
  summarizeMonthlyMoves,
  sumDriverYears,
  summarizeLaborMetrics,
  withMonthDeltas,
} from '@/lib/utils/storicoSummary';

/** A minimal snapshot: only the fields the module reads. */
function snap(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return {
    userId: 'u',
    year,
    month,
    totalNetWorth,
    liquidNetWorth: totalNetWorth,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28, 12),
  };
}

/** `count` consecutive months from (year, month), values from `values` or a linear ramp. */
function series(year: number, month: number, values: number[]): MonthlySnapshot[] {
  return values.map((v, i) => {
    const m = month - 1 + i;
    return snap(year + Math.floor(m / 12), (m % 12) + 1, v);
  });
}

describe('monthSpan / addMonths', () => {
  it('should count calendar months between two periods', () => {
    expect(monthSpan({ year: 2019, month: 9 }, { year: 2026, month: 7 })).toBe(82);
    expect(monthSpan({ year: 2024, month: 3 }, { year: 2024, month: 3 })).toBe(0);
  });

  it('should add months across a year boundary', () => {
    expect(addMonths({ year: 2026, month: 7 }, 18)).toEqual({ year: 2028, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('summarizeGrowth', () => {
  it('should return null without snapshots', () => {
    expect(summarizeGrowth([])).toBeNull();
  });

  it('should measure the growth from the first to the latest snapshot, unsorted input included', () => {
    const shuffled = [snap(2026, 7, 248900), snap(2019, 9, 74000), snap(2022, 10, 149600)];
    const growth = summarizeGrowth(shuffled)!;
    expect(growth.first).toEqual({ year: 2019, month: 9, value: 74000 });
    expect(growth.latest).toEqual({ year: 2026, month: 7, value: 248900 });
    expect(growth.snapshotCount).toBe(3);
    expect(growth.monthsElapsed).toBe(82);
    expect(growth.delta).toBe(174900);
    expect(growth.growthPct).toBeCloseTo(236.35, 1);
    // Wealth CAGR: (248900 / 74000) ^ (12 / 82) − 1 — contributions included, NOT Rendimenti's.
    expect(growth.cagr).toBeCloseTo(19.4, 0);
  });

  it(`should give no CAGR below ${CAGR_MIN_MONTHS} months`, () => {
    const growth = summarizeGrowth(series(2026, 1, [100, 110, 120, 130, 140, 150]))!;
    expect(growth.monthsElapsed).toBe(5);
    expect(growth.cagr).toBeNull();
    expect(growth.growthPct).toBeCloseTo(50, 5);
  });

  it('should give no percentage nor CAGR when the first snapshot is not positive', () => {
    const growth = summarizeGrowth(series(2024, 1, [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]))!;
    expect(growth.growthPct).toBeNull();
    expect(growth.cagr).toBeNull();
    expect(growth.delta).toBe(1200);
  });

  it('should report a single snapshot with zero months elapsed', () => {
    const growth = summarizeGrowth([snap(2026, 3, 50000)])!;
    expect(growth.snapshotCount).toBe(1);
    expect(growth.monthsElapsed).toBe(0);
    expect(growth.delta).toBe(0);
    expect(growth.cagr).toBeNull();
  });
});

describe('summarizeMonthlyMoves', () => {
  it('should measure only consecutive calendar months and pick the best and worst', () => {
    const moves = summarizeMonthlyMoves([
      snap(2024, 1, 100),
      snap(2024, 2, 110), // +10
      snap(2024, 3, 105), // −5
      snap(2024, 5, 200), // gap: April is missing, not a month
      snap(2024, 6, 200), // 0: neither rising nor falling
      snap(2024, 7, 215), // +15
    ]);
    expect(moves.measuredMonths).toBe(4);
    expect(moves.risingMonths).toBe(2);
    expect(moves.best).toEqual({ year: 2024, month: 7, value: 215, delta: 15 });
    expect(moves.worst).toEqual({ year: 2024, month: 3, value: 105, delta: -5 });
  });

  it('should leave best and worst null when no month rose or fell', () => {
    expect(summarizeMonthlyMoves([snap(2024, 1, 100)])).toEqual({ best: null, worst: null, risingMonths: 0, measuredMonths: 0 });
    const flat = summarizeMonthlyMoves(series(2024, 1, [100, 100, 100]));
    expect(flat.best).toBeNull();
    expect(flat.worst).toBeNull();
    expect(flat.measuredMonths).toBe(2);
  });
});

describe('summarizeAllTimeHigh', () => {
  it('should say the latest snapshot is the high when nothing was higher', () => {
    const ath = summarizeAllTimeHigh(series(2024, 1, [100, 120, 110, 130]))!;
    expect(ath.peak).toEqual({ year: 2024, month: 4, value: 130 });
    expect(ath.isAtHigh).toBe(true);
    expect(ath.gap).toBe(0);
  });

  it('should measure the gap below an earlier peak, as a negative amount and percentage', () => {
    const ath = summarizeAllTimeHigh(series(2024, 1, [100, 150, 120, 140]))!;
    expect(ath.peak).toEqual({ year: 2024, month: 2, value: 150 });
    expect(ath.isAtHigh).toBe(false);
    expect(ath.gap).toBe(-10);
    expect(ath.gapPct).toBeCloseTo(-6.67, 1);
  });

  it('should treat a latest snapshot equal to the peak as at the high (the first occurrence is the peak)', () => {
    const ath = summarizeAllTimeHigh(series(2024, 1, [100, 150, 150]))!;
    expect(ath.isAtHigh).toBe(true);
    expect(ath.peak).toEqual({ year: 2024, month: 2, value: 150 });
  });

  it('should return null without snapshots', () => {
    expect(summarizeAllTimeHigh([])).toBeNull();
  });
});

describe('summarizeGrowthPace', () => {
  /** 36 months: +1000/month for two years, then +2000/month — clearly accelerating. */
  const accelerating = series(2023, 8, Array.from({ length: 37 }, (_, i) => 100000 + (i <= 24 ? i * 1000 : 24000 + (i - 24) * 2000)));

  it('should compare the last twelve months with the lifetime monthly average', () => {
    const pace = summarizeGrowthPace(accelerating);
    expect(pace.trailingDelta).toBe(24000);
    expect(pace.trailingPct).toBeCloseTo((24000 / 124000) * 100, 5);
    expect(pace.trailingMonthly).toBe(2000);
    expect(pace.lifetimeMonthly).toBeCloseTo(48000 / 36, 5);
    expect(pace.verdict).toBe('accelerating');
  });

  it('should call a pace within ten percent of the average steady', () => {
    const steady = series(2023, 1, Array.from({ length: 37 }, (_, i) => 100000 + i * 1000));
    expect(summarizeGrowthPace(steady).verdict).toBe('steady');
  });

  it('should call a rising last year accelerating even when the whole history fell', () => {
    const fallThenRecover = series(2022, 1, Array.from({ length: 37 }, (_, i) => (i <= 24 ? 100000 - i * (40000 / 24) : 60000 + (i - 24) * (20000 / 12))));
    const pace = summarizeGrowthPace(fallThenRecover);
    expect(pace.lifetimeMonthly).toBeLessThan(0);
    expect(pace.trailingDelta).toBeCloseTo(20000, 3);
    expect(pace.verdict).toBe('accelerating');
  });

  it('should call a slower last year slowing, and a negative one losing', () => {
    const slowing = series(2023, 1, Array.from({ length: 37 }, (_, i) => 100000 + (i <= 24 ? i * 2000 : 48000 + (i - 24) * 500)));
    expect(summarizeGrowthPace(slowing).verdict).toBe('slowing');
    const losing = series(2023, 1, Array.from({ length: 37 }, (_, i) => 100000 + (i <= 24 ? i * 2000 : 48000 - (i - 24) * 500)));
    const pace = summarizeGrowthPace(losing);
    expect(pace.trailingDelta).toBe(-6000);
    expect(pace.verdict).toBe('losing');
  });

  it(`should give no verdict below ${PACE_MIN_HISTORY_MONTHS} months of history, but still the trailing figures`, () => {
    const short = series(2025, 1, Array.from({ length: 19 }, (_, i) => 100000 + i * 1000));
    const pace = summarizeGrowthPace(short);
    expect(pace.trailingDelta).toBe(12000);
    expect(pace.verdict).toBeNull();
  });

  it('should give no trailing figure when the snapshot twelve months earlier is missing', () => {
    const withGap = accelerating.filter((s) => !(s.year === 2025 && s.month === 8));
    const pace = summarizeGrowthPace(withGap);
    expect(pace.trailingDelta).toBeNull();
    expect(pace.trailingMonthly).toBeNull();
    expect(pace.verdict).toBeNull();
    expect(pace.lifetimeMonthly).not.toBeNull();
  });

  it('should return all-null on an empty history', () => {
    expect(summarizeGrowthPace([])).toEqual({ trailingDelta: null, trailingPct: null, trailingMonthly: null, lifetimeMonthly: null, verdict: null });
  });
});

describe('withMonthDeltas', () => {
  it("should attach each month's change, null on the first point and after a gap", () => {
    const points = withMonthDeltas([
      { year: 2024, month: 3, totalNetWorth: 105 },
      { year: 2024, month: 1, totalNetWorth: 100 },
      { year: 2024, month: 2, totalNetWorth: 110 },
      { year: 2024, month: 5, totalNetWorth: 120 },
    ]);
    expect(points.map((p) => p.month)).toEqual([1, 2, 3, 5]);
    expect(points.map((p) => p.delta)).toEqual([null, 10, -5, null]);
  });
});

describe('projectNextDoubling', () => {
  const inProgress: DoublingMilestone = {
    milestoneNumber: 2,
    startValue: 149600,
    endValue: 299200,
    startDate: { year: 2022, month: 10 },
    endDate: { year: 2026, month: 7 },
    durationMonths: 45,
    periodLabel: '10/22 - 07/26 - In corso',
    isComplete: false,
    progressPercentage: 66,
    milestoneType: 'geometric',
  };
  const latest = { year: 2026, month: 7, value: 248900 };

  it('should project the target at the monthly pace, linearly, rounding the months up', () => {
    const projection = projectNextDoubling(inProgress, latest, 34000 / 12)!;
    expect(projection.target).toBe(299200);
    expect(projection.remaining).toBe(50300);
    expect(projection.monthsToTarget).toBe(18); // 50300 / 2833.3 = 17.75 → 18
    expect(projection.eta).toEqual({ year: 2028, month: 1 });
  });

  it('should give no projection without a milestone in progress, without a pace, or with a non-positive one', () => {
    expect(projectNextDoubling(null, latest, 2000)).toBeNull();
    expect(projectNextDoubling(inProgress, latest, null)).toBeNull();
    expect(projectNextDoubling(inProgress, latest, 0)).toBeNull();
    expect(projectNextDoubling(inProgress, latest, -500)).toBeNull();
  });

  it('should give no projection beyond fifty years — a pace that never gets there is not a date', () => {
    expect(projectNextDoubling(inProgress, latest, 10)).toBeNull();
  });

  it('should give no projection when the target is already reached', () => {
    expect(projectNextDoubling({ ...inProgress, endValue: 200000 }, latest, 2000)).toBeNull();
  });
});

describe('driver helpers', () => {
  const rows = [
    { year: '2023', netSavings: 9000, investmentGrowth: 3000, netWorthGrowth: 12000, growthPct: 12, latest: { year: 2023, month: 12 } },
    { year: '2024', netSavings: 12000, investmentGrowth: -1000, netWorthGrowth: 11000, growthPct: 9.8, latest: { year: 2024, month: 12 } },
    { year: '2025', netSavings: 22800, investmentGrowth: 6900, netWorthGrowth: 29700, growthPct: 24.1, latest: { year: 2025, month: 12 } },
    { year: '2026', netSavings: 14100, investmentGrowth: 7300, netWorthGrowth: 21400, growthPct: 14, latest: { year: 2026, month: 8 } },
  ];

  it('should split a year between its drivers as shares that sum to 100, or refuse a mixed-sign split', () => {
    expect(resolveDriverShares(rows[2])).toEqual({ savings: 77, market: 23 });
    expect(resolveDriverShares({ netSavings: 23678, investmentGrowth: 21288 })).toEqual({ savings: 53, market: 47 });
    expect(resolveDriverShares(rows[1])).toBeNull();
    expect(resolveDriverShares({ netSavings: 0, investmentGrowth: 0 })).toBeNull();
    expect(resolveDriverShares({ netSavings: 0, investmentGrowth: 500 })).toEqual({ savings: 0, market: 100 });
  });

  it('should keep only the years from the cashflow floor, newest first', () => {
    expect(selectDriverYears(rows, 2025).map((r) => r.year)).toEqual(['2026', '2025']);
    expect(selectDriverYears(rows, 2030)).toEqual([]);
  });

  it('should sum the selected years, and give null for none', () => {
    expect(sumDriverYears(selectDriverYears(rows, 2025))).toEqual({ netSavings: 36900, investmentGrowth: 14200, netWorthGrowth: 51100 });
    expect(sumDriverYears([])).toBeNull();
  });

  it('should feature the running year when present, else the newest closed one', () => {
    expect(resolveFeaturedDriverYear(selectDriverYears(rows, 2025), 2026)).toEqual({ row: rows[3], isRunning: true });
    expect(resolveFeaturedDriverYear(selectDriverYears(rows, 2025), 2027)).toEqual({ row: rows[3], isRunning: false });
    expect(resolveFeaturedDriverYear([], 2026)).toBeNull();
  });

  it('should take the rows inside the last N CALENDAR months, chronological, a missing month staying a gap', () => {
    const months = Array.from({ length: 15 }, (_, i) => ({ year: 2025 + Math.floor(i / 12), month: (i % 12) + 1, v: i }));
    const last = selectTrailingMonths(months, 12);
    expect(last).toHaveLength(12);
    expect(last[0]).toMatchObject({ year: 2025, month: 4 });
    expect(last[11]).toMatchObject({ year: 2026, month: 3 });
    expect(selectTrailingMonths(months.slice(0, 3), 12)).toHaveLength(3);
    const withGap = months.filter((m) => !(m.year === 2025 && m.month === 10));
    const trailing = selectTrailingMonths([...withGap].reverse(), 12);
    expect(trailing).toHaveLength(11);
    expect(trailing[0]).toMatchObject({ year: 2025, month: 4 });
    expect(selectTrailingMonths([], 12)).toEqual([]);
  });

  it('should name the month a running year is measured from', () => {
    expect(runningSinceMonth({ baseline: { year: 2025, month: 12 } })).toBe(1);
    expect(runningSinceMonth({ baseline: { year: 2026, month: 3 } })).toBe(4);
    expect(runningSinceMonth({})).toBe(1);
  });
});

describe('summarizeLaborMetrics', () => {
  const expense = (id: string, type: Expense['type'], categoryId: string, amount: number, year: number): Expense =>
    ({ id, userId: 'u', type, categoryId, categoryName: categoryId, amount, currency: 'EUR', date: new Date(year, 5, 5, 12), createdAt: new Date(), updatedAt: new Date() }) as Expense;
  const snapshots = [snap(2024, 12, 100000), snap(2025, 6, 120000), snap(2026, 6, 151100)];
  const expenses = [
    expense('a', 'income', 'stipendio', 78400, 2025),
    expense('b', 'income', 'dividendi', 1000, 2025),
    expense('c', 'fixed', 'casa', -41500, 2025),
    expense('d', 'transfer', 'giroconto', 10000, 2025),
    expense('e', 'income', 'stipendio', 50000, 2023), // before the floor
  ];

  it('should read labor income, savings and the market share since the floor, skipping transfers', () => {
    const m = summarizeLaborMetrics(snapshots, expenses, ['stipendio'], 2025, 2300)!;
    expect(m).toEqual({
      startYear: 2025,
      totalLaborIncome: 78400,
      totalSavedFromWork: 36900,
      totalExpensesSum: -41500,
      // 151100 − 100000 − (79400 − 41500) = 13200: the transfer changes nothing.
      totalInvestmentGrowthGross: 13200,
      totalInvestmentGrowthNet: 10900,
    });
    expect(summarizeLaborMetrics(snapshots, expenses.filter((e) => e.type !== 'transfer'), ['stipendio'], 2025, 2300)).toEqual(m);
  });

  it('should fall back to the floor\'s first snapshot without a prior December, and give null without categories or expenses', () => {
    const m = summarizeLaborMetrics(snapshots.slice(1), expenses, ['stipendio'], 2025, 0)!;
    expect(m.totalInvestmentGrowthGross).toBe(151100 - 120000 - (79400 - 41500));
    expect(summarizeLaborMetrics(snapshots, expenses, [], 2025, 0)).toBeNull();
    expect(summarizeLaborMetrics(snapshots, [], ['stipendio'], 2025, 0)).toBeNull();
  });
});
