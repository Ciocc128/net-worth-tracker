/**
 * The ECB anchors of the Monte Carlo market (doc/montecarlo/README.md § 14.5 RQ9, Q3): what the cron stores, the
 * limits that keep a bad reading out, and the anchors the resolver is handed. Pure; the network is in
 * `lib/server/marketAnchorsService.ts`, the Firestore read in `lib/hooks/useMarketAnchors.ts`.
 */
import { MONTE_CARLO_FROZEN_ANCHORS, type MonteCarloAnchors } from '@/lib/constants/monteCarloMarketDefaults';

/** `ecb-rate-cache/market-anchors`. Each series is optional: a series never read is simply absent. */
export interface StoredMarketAnchors {
  estr?: { value: number; date: string };
  aaa10y?: { value: number; date: string };
  inflation?: { value: number; period: string };
  /** ISO timestamp of the last refresh. */
  fetchedAt?: string;
}

export type MarketAnchorSeries = 'estr' | 'aaa10y' | 'inflation';

/** RQ9: a value outside is discarded and the series keeps its previous one. */
export const ANCHOR_LIMITS: Record<MarketAnchorSeries, { min: number; max: number }> = {
  estr: { min: -2, max: 15 },
  aaa10y: { min: -2, max: 15 },
  inflation: { min: -2, max: 10 },
};

/** Q3: «non aggiornato dal …» after this many days without a newer observation. */
export const ANCHOR_STALE_DAYS = { rates: 10, inflation: 120 } as const;

export function isAnchorValueInRange(series: MarketAnchorSeries, value: number): boolean {
  return Number.isFinite(value) && value >= ANCHOR_LIMITS[series].min && value <= ANCHOR_LIMITS[series].max;
}

/**
 * The new document: each series takes the fetched observation when there is one and it is in range, else keeps the
 * previous one (RQ9). `fetched` carries null for a series that failed.
 */
export function mergeStoredAnchors(
  previous: StoredMarketAnchors | null | undefined,
  fetched: { estr: { value: number; period: string } | null; aaa10y: { value: number; period: string } | null; inflation: { value: number; period: string } | null },
  nowIso: string,
): StoredMarketAnchors {
  const next: StoredMarketAnchors = { fetchedAt: nowIso };
  if (fetched.estr && isAnchorValueInRange('estr', fetched.estr.value)) next.estr = { value: fetched.estr.value, date: fetched.estr.period };
  else if (previous?.estr) next.estr = previous.estr;
  if (fetched.aaa10y && isAnchorValueInRange('aaa10y', fetched.aaa10y.value)) next.aaa10y = { value: fetched.aaa10y.value, date: fetched.aaa10y.period };
  else if (previous?.aaa10y) next.aaa10y = previous.aaa10y;
  if (fetched.inflation && isAnchorValueInRange('inflation', fetched.inflation.value)) next.inflation = { value: fetched.inflation.value, period: fetched.inflation.period };
  else if (previous?.inflation) next.inflation = previous.inflation;
  return next;
}

/** `2026-10-08` → `08/10/2026`; anything else as it is. */
export function formatAnchorDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** `2026-Q3` → `3° trimestre 2026`; anything else as it is. */
export function formatSpfPeriod(period: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  return match ? `${match[2]}° trimestre ${match[1]}` : period;
}

/**
 * The anchors the resolver reads: the stored series over the frozen ones, series by series (a missing or
 * out-of-range one falls back to its frozen value — RQ9 «documento assente → le ancore congelate»). `asOf` is the
 * most recent rate date, else the frozen date.
 */
export function toMonteCarloAnchors(stored: StoredMarketAnchors | null | undefined): MonteCarloAnchors {
  const frozen = MONTE_CARLO_FROZEN_ANCHORS;
  if (!stored) return { ...frozen };
  const estr = stored.estr && isAnchorValueInRange('estr', stored.estr.value) ? stored.estr : null;
  const aaa10y = stored.aaa10y && isAnchorValueInRange('aaa10y', stored.aaa10y.value) ? stored.aaa10y : null;
  const inflation = stored.inflation && isAnchorValueInRange('inflation', stored.inflation.value) ? stored.inflation : null;
  if (!estr && !aaa10y && !inflation) return { ...frozen };
  const dates = [estr?.date, aaa10y?.date].filter((date): date is string => !!date).sort();
  return {
    estr: estr?.value ?? frozen.estr,
    aaa10y: aaa10y?.value ?? frozen.aaa10y,
    inflation: inflation?.value ?? frozen.inflation,
    asOf: dates.length > 0 ? formatAnchorDate(dates[dates.length - 1]) : frozen.asOf,
    ...(estr ? { estrDate: estr.date } : {}),
    ...(aaa10y ? { aaa10yDate: aaa10y.date } : {}),
    ...(inflation ? { inflationPeriod: inflation.period } : {}),
  };
}

/** Whole days between an ISO date (or the first day of a `YYYY-Qn` quarter, +3 months) and `now`; null when unreadable. */
function daysSince(period: string, now: Date): number | null {
  let start: number;
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) {
    // A quarter's survey is as fresh as the quarter's END is old.
    start = Date.UTC(Number(quarter[1]), Number(quarter[2]) * 3, 1);
  } else {
    start = Date.parse(`${period}T00:00:00Z`);
  }
  if (!Number.isFinite(start)) return null;
  return Math.floor((now.getTime() - start) / 86_400_000);
}

export interface AnchorLines {
  /** Obbligazioni's source line, the AAA yield with its date. */
  aaa10y: string;
  /** Liquidità's source line, the €STR with its date. */
  estr: string;
  /** The expected inflation's source line. */
  inflation: string;
}

/**
 * The words under the tile's rows (Q3): value and date of the last observation, «non aggiornato dal …» when it is
 * older than its limit, «valori dell'08/10/2026» when the series was never read.
 */
export function describeAnchorLines(anchors: MonteCarloAnchors, now: Date, formatPct: (value: number) => string): AnchorLines {
  const rate = (label: string, value: number, date: string | undefined): string => {
    if (!date) return `${label} ${formatPct(value)}%: valori dell’${MONTE_CARLO_FROZEN_ANCHORS.asOf}`;
    const age = daysSince(date, now);
    const stale = age !== null && age > ANCHOR_STALE_DAYS.rates;
    return stale ? `${label} ${formatPct(value)}%, non aggiornato dal ${formatAnchorDate(date)}` : `${label} ${formatPct(value)}% del ${formatAnchorDate(date)}`;
  };
  let inflation: string;
  if (!anchors.inflationPeriod) {
    inflation = `valore dell’${MONTE_CARLO_FROZEN_ANCHORS.asOf}`;
  } else {
    const age = daysSince(anchors.inflationPeriod, now);
    inflation = age !== null && age > ANCHOR_STALE_DAYS.inflation
      ? `SPF BCE, ${formatSpfPeriod(anchors.inflationPeriod)}, non aggiornato`
      : `SPF BCE, ${formatSpfPeriod(anchors.inflationPeriod)}`;
  }
  return {
    aaa10y: rate('dal tasso AAA 10 anni', anchors.aaa10y, anchors.aaa10yDate),
    estr: rate('dall’€STR', anchors.estr, anchors.estrDate),
    inflation,
  };
}
