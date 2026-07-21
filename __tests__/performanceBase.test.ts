/**
 * Unit tests for performanceBase.ts — projecting snapshots onto the portfolio vs net-worth base
 * (spec §8.3). Portfolio excludes the pension fund value; net worth includes everything.
 */

import { describe, it, expect } from 'vitest';
import { toPerformanceBaseSnapshots } from '@/lib/utils/performanceBase';
import type { MonthlySnapshot } from '@/types/assets';

function mkSnapshot(overrides: Partial<MonthlySnapshot>): MonthlySnapshot {
  return {
    userId: 'u',
    year: 2026,
    month: 6,
    totalNetWorth: 100000,
    liquidNetWorth: 60000,
    illiquidNetWorth: 40000,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe('toPerformanceBaseSnapshots', () => {
  it('returns snapshots unchanged for the netWorth base', () => {
    const snapshots = [mkSnapshot({ byAssetClass: { equity: 70000, pension: 30000 } })];
    expect(toPerformanceBaseSnapshots(snapshots, 'netWorth')).toBe(snapshots);
  });

  it('removes the pension value from total and illiquid net worth for the portfolio base', () => {
    const snapshots = [
      mkSnapshot({
        totalNetWorth: 100000,
        illiquidNetWorth: 40000,
        byAssetClass: { equity: 70000, pension: 30000 },
      }),
    ];
    const [projected] = toPerformanceBaseSnapshots(snapshots, 'portfolio');
    expect(projected.totalNetWorth).toBe(70000);
    expect(projected.illiquidNetWorth).toBe(10000);
  });

  it('passes through snapshots without a pension bucket', () => {
    const snapshots = [mkSnapshot({ byAssetClass: { equity: 100000 } })];
    const result = toPerformanceBaseSnapshots(snapshots, 'portfolio');
    expect(result[0].totalNetWorth).toBe(100000);
    expect(result[0]).toBe(snapshots[0]); // unchanged reference when nothing to strip
  });
});
