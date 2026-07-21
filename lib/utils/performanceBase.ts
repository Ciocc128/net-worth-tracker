/**
 * performanceBase — which capital a performance metric is measured on (spec §8.3).
 *
 * The fondo pensione grows partly from EXTERNAL contributions (TFR / employer) and is valued on a
 * different cadence (monthly NAV), so including it would distort the investment-performance metrics
 * (TWR, Sharpe, volatility, max drawdown) of the portfolio the user actually manages. So for those
 * metrics the pension is EXCLUDED — treated like the primary residence, out of the base.
 *
 * Per the spec's priority constraint this is the MINIMAL, extensible seam: an enum with only the two
 * values needed today — `portfolio` (excludes the pension) and `netWorth` (includes everything) —
 * ready to grow (liquid-only, cash/real-estate exclusions) when the broader performance-base work
 * lands, without rewriting callers.
 *
 * KNOWN LIMITATION (spec "niente di più"): a VOLUNTARY contribution is a transfer from the portfolio
 * (cash) into the excluded pension, so on the portfolio base it looks like a small unneutralized
 * outflow. TFR/employer contributions never touch the portfolio and are unaffected. A full cash-flow
 * treatment belongs to the larger performance-base work that this seam is deliberately decoupled from.
 */

import type { MonthlySnapshot } from '@/types/assets';

export type PerformanceBase = 'portfolio' | 'netWorth';

/**
 * Project snapshots onto the requested performance base. For `netWorth` the snapshots are returned
 * unchanged; for `portfolio` the pension fund value (`byAssetClass.pension`) is removed from
 * `totalNetWorth` (and `illiquidNetWorth`, where the illiquid pension is counted). Snapshots created
 * before the pension feature carry no `pension` bucket and pass through untouched.
 */
export function toPerformanceBaseSnapshots(
  snapshots: MonthlySnapshot[],
  base: PerformanceBase
): MonthlySnapshot[] {
  if (base === 'netWorth') return snapshots;
  return snapshots.map((snapshot) => {
    const pension = snapshot.byAssetClass?.pension ?? 0;
    if (!pension) return snapshot;
    return {
      ...snapshot,
      totalNetWorth: snapshot.totalNetWorth - pension,
      illiquidNetWorth: Math.max(0, snapshot.illiquidNetWorth - pension),
    };
  });
}
