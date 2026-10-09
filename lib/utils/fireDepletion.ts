/**
 * Capitale esaurito e FIRE fuori orizzonte (doc/fire-ipotesi/README.md § 21, RE1–RE5). Pure: the walk is untouched (RF6), these
 * helpers only change what the page reads from the same figures.
 */
import type { ResolvedFlow } from '@/lib/utils/datedFlows';

/**
 * RE1: the calendar year the series first reaches zero or less (rows are `t ≥ 1`); null when it never does or when the starting
 * capital is already zero or less (that is «no capital», not a depletion).
 */
export function findDepletion<T extends { calendarYear: number }>(points: readonly T[], key: keyof T & string, startCapital?: number): number | null {
  if (startCapital !== undefined && startCapital <= 0) return null;
  for (const point of points) {
    if ((point[key] as unknown as number) <= 0) return point.calendarYear;
  }
  return null;
}

/** RE2: the biggest fixed-year lump outflow that falls in the depletion year; null = a generic cause. */
export function depletionCause(
  resolved: readonly ResolvedFlow[] | undefined,
  depletionYear: number,
  currentYear: number
): { label: string; amount: number } | null {
  let best: ResolvedFlow | null = null;
  for (const flow of resolved ?? []) {
    if (flow.kind !== 'lumpOut' || flow.anchor !== 'fixed' || currentYear + flow.start !== depletionYear) continue;
    if (best === null || flow.amount > best.amount) best = flow;
  }
  return best ? { label: best.label, amount: best.amount } : null;
}

/** RE3: the series as the charts draw it — 0 in the depletion year, no points after. */
export function clipAtDepletion<T extends { calendarYear: number }>(value: number, point: T, depletionYear: number | null): number | null {
  if (depletionYear === null) return value;
  if (point.calendarYear > depletionYear) return null;
  if (point.calendarYear === depletionYear) return 0;
  return value;
}

/** The years to the target age for § 21 (RE5): null without an age or when the target age is not ahead. */
export function targetYearsOf(targetAge: number | undefined, userAge: number | undefined): number | null {
  if (targetAge === undefined || userAge === undefined || !Number.isFinite(targetAge) || !Number.isFinite(userAge)) return null;
  const years = Math.round(targetAge) - Math.round(userAge);
  return years >= 1 ? years : null;
}

type ProjectionKey = 'base' | 'bear' | 'bull';

interface QuotaProjection {
  yearlyData: ReadonlyArray<{
    year: number;
    bearNetWorth: number;
    baseNetWorth: number;
    bullNetWorth: number;
    bearFireNumber: number;
    baseFireNumber: number;
    bullFireNumber: number;
  }>;
}

/** RE5: `max(0, W_T) / N_T` on one series; null when `T` is missing or beyond the walk. */
export function quotaAtTarget(projection: QuotaProjection | null | undefined, targetYears: number | null | undefined, key: ProjectionKey = 'base'): number | null {
  if (!projection || targetYears === null || targetYears === undefined || targetYears < 1) return null;
  const row = projection.yearlyData.find((entry) => entry.year === targetYears);
  if (!row) return null;
  const capital = key === 'bear' ? row.bearNetWorth : key === 'bull' ? row.bullNetWorth : row.baseNetWorth;
  const requirement = key === 'bear' ? row.bearFireNumber : key === 'bull' ? row.bullFireNumber : row.baseFireNumber;
  if (!(requirement > 0)) return null;
  return Math.max(0, capital) / requirement;
}

/** RE5, D-CG8: whole percent, truncated; «100%+» when the series reaches the FIRE within `T`. */
export function formatQuota(quota: number, reached = false): string {
  if (reached) return '100%+';
  return `${Math.floor(quota * 100 + 1e-9)}%`;
}
