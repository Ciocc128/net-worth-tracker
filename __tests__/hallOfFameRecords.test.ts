/**
 * Unit tests for hallOfFameRecords.ts — pure record-building + period ranking.
 *
 * These functions power both the in-app Hall of Fame and the periodic email
 * mentions, so the ranking definition must match the in-app one exactly:
 * growth = position among positive-growth periods (desc); decline = position
 * among negative-growth periods (most negative first).
 *
 * expenseService is mocked at the firebase boundary (db) so the pure
 * calculateTotalIncome/Expenses can be imported without a live Firestore.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}));

import {
  calculateMonthlyRecords,
  calculateYearlyRecords,
  rankPeriodByNetWorthGrowth,
} from '@/lib/utils/hallOfFameRecords';
import type { MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';

function snap(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return {
    userId: 'u1',
    year,
    month,
    totalNetWorth,
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 1),
  } as MonthlySnapshot;
}

describe('calculateMonthlyRecords', () => {
  it('builds a record per consecutive snapshot pair (first snapshot has no baseline)', () => {
    const snapshots = [snap(2025, 1, 1000), snap(2025, 2, 1500), snap(2025, 3, 1400)];

    const records = calculateMonthlyRecords(snapshots, []);

    // 3 snapshots → 2 records (Feb vs Jan, Mar vs Feb).
    expect(records.map((r) => r.monthYear)).toEqual(['02/2025', '03/2025']);
    expect(records.map((r) => r.netWorthDiff)).toEqual([500, -100]);
  });

  it('returns no records when there is a single snapshot', () => {
    expect(calculateMonthlyRecords([snap(2025, 1, 1000)], [])).toEqual([]);
  });
});

describe('calculateYearlyRecords', () => {
  it('uses previous December as baseline so January is included in the delta', () => {
    const snapshots = [snap(2024, 12, 1000), snap(2025, 6, 1300), snap(2025, 12, 2000)];

    const records = calculateYearlyRecords(snapshots, []);
    const y2025 = records.find((r) => r.year === 2025)!;

    // 2000 (Dec 2025) − 1000 (Dec 2024 baseline) = 1000.
    expect(y2025.netWorthDiff).toBe(1000);
    expect(y2025.startOfYearNetWorth).toBe(1000);
  });
});

describe('rankPeriodByNetWorthGrowth', () => {
  // Four months with growth deltas 500, 300, 800, -200.
  const records = [
    { year: 2025, month: 1, netWorthDiff: 500 },
    { year: 2025, month: 2, netWorthDiff: 300 },
    { year: 2025, month: 3, netWorthDiff: 800 },
    { year: 2025, month: 4, netWorthDiff: -200 },
  ];

  it('ranks a positive month among growth months, strongest first', () => {
    // 800 (Mar) is #1, 500 (Jan) is #2, 300 (Feb) is #3 — out of 3 growth months.
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 1 })).toEqual({
      rank: 2,
      total: 3,
      trend: 'growth',
    });
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 3 })).toEqual({
      rank: 1,
      total: 3,
      trend: 'growth',
    });
  });

  it('ranks a negative month among decline months', () => {
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 4 })).toEqual({
      rank: 1,
      total: 1,
      trend: 'decline',
    });
  });

  it('returns null for a period with no record (e.g. first month, no baseline)', () => {
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 12 })).toBeNull();
  });

  it('returns null for a flat (zero-change) period — excluded from both rankings', () => {
    const flat = [{ year: 2025, month: 1, netWorthDiff: 0 }];
    expect(rankPeriodByNetWorthGrowth(flat, { year: 2025, month: 1 })).toBeNull();
  });

  it('ranks yearly periods when month is omitted', () => {
    const yearly = [
      { year: 2023, netWorthDiff: 10000 },
      { year: 2024, netWorthDiff: 25000 },
      { year: 2025, netWorthDiff: 18000 },
    ];
    expect(rankPeriodByNetWorthGrowth(yearly, { year: 2025 })).toEqual({
      rank: 2,
      total: 3,
      trend: 'growth',
    });
  });
});
