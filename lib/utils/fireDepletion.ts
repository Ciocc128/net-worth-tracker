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
    const value = point[key] as unknown;
    if (typeof value === 'number' && value <= 0) return point.calendarYear;
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

/**
 * RE3: the rows as the charts draw them. Each listed series is 0 in its depletion year and `null` after it (the line ends); the
 * other fields are untouched. `depletion` names the year per series (null = never). The walk itself is not changed.
 */
export function clipDepletedSeries<T extends { calendarYear: number }, K extends keyof T & string>(
  rows: readonly T[],
  keys: readonly K[],
  startCapital?: Partial<Record<K, number>>
): { rows: Array<Omit<T, K> & Record<K, number | null>>; depletion: Record<K, number | null> } {
  const depletion = {} as Record<K, number | null>;
  for (const key of keys) depletion[key] = findDepletion(rows, key, startCapital?.[key]);
  const clipped = rows.map((row) => {
    const next = { ...row } as Record<string, unknown>;
    for (const key of keys) {
      const year = depletion[key];
      if (year === null) continue;
      next[key] = row.calendarYear > year ? null : row.calendarYear === year ? 0 : row[key];
    }
    return next as Omit<T, K> & Record<K, number | null>;
  });
  return { rows: clipped, depletion };
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
