/**
 * The ONE binning rule for a distribution of final values (Monte Carlo `createDistribution`, Proiezione).
 *
 * Equal-width bins from the smallest value up to the 95TH PERCENTILE, the last bin taking the tail up to
 * the maximum (2026-08-26): a thirty-year run has a heavy right tail, and bins stretched to an outlier of
 * ten times the median left nine of ten bins empty. The last bin is therefore wider than the others.
 * Half-open bins, the last one closed on its upper bound.
 */

export interface ValueBin {
  from: number;
  to: number;
  count: number;
}

/** `sorted` ascending, non-empty. */
export function binSortedValues(sorted: ArrayLike<number>, bins = 10): ValueBin[] {
  const n = sorted.length;
  if (n === 0) return [];
  const minValue = sorted[0];
  const maxValue = sorted[n - 1];
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  const cap = p95 > minValue ? p95 : maxValue;
  // A flat distribution (every path identical) still needs a positive width.
  const binSize = cap > minValue ? (cap - minValue) / bins : 1;

  const result: ValueBin[] = [];
  for (let i = 0; i < bins; i++) {
    const isLast = i === bins - 1;
    const from = minValue + i * binSize;
    const to = isLast ? Math.max(maxValue, minValue + bins * binSize) : minValue + (i + 1) * binSize;
    let count = 0;
    for (let k = 0; k < n; k++) {
      const value = sorted[k];
      if (value >= from && (isLast ? value <= to : value < to)) count++;
    }
    result.push({ from, to, count });
  }
  return result;
}
