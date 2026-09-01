/**
 * Portfolio Exposure Service — thin orchestrator (Fase 3 rewrite, 2026-09).
 *
 * Fetches nothing itself: it hands the caller's assets to `profileResolver.ts` (which cascades
 * the curated tables + Yahoo Finance into one `InstrumentProfile` per ticker, each behind its own
 * 30-day `instrument-profile-cache/{ticker}`) and then to the pure `exposureEngine.ts`
 * (`computeExposure`), which does the actual arithmetic. All five views — Titoli · Settori ·
 * Geografia · Valuta · Emittenti — come out of that one call; this file's only remaining job is
 * wiring the cache key and the timestamp.
 */
import { Asset } from '@/types/assets';
import { PortfolioExposureData } from '@/types/exposure';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { computeExposure } from '@/lib/utils/exposureEngine';
import { resolveInstrumentProfiles } from '@/lib/server/exposure/profileResolver';

/**
 * Bumped whenever `computeExposure`'s MATH changes but the inputs (assets) do not — the manual
 * lever, same convention as `CACHE_MATH_VERSION` in performanceService.ts.
 */
export const EXPOSURE_CACHE_MATH_VERSION = 'v2';

/**
 * The ONE cache key builder for `exposure-cache/{userId}` — shared by the service (which writes
 * the cache) and the API route (which reads it), so the two can never drift apart again.
 *
 * Fixed the 2026-09 bug: the route built a 3-segment key (etf count/tickers + rounded total
 * value) to compare against the service's 4-segment key (which also folded in stock tickers),
 * so `cached.cacheKey === expectedCacheKey` was never true and every visit re-hit Yahoo. The key
 * is now built from ticker + quantity + allocation role for every active asset — no rounded
 * total value: a single price tick used to invalidate the cache for no reason.
 */
export function buildExposureCacheKey(assets: Asset[]): string {
  const signature = assets
    .filter((a) => a.quantity > 0)
    .map((a) => `${a.ticker}:${a.quantity}:${resolveAllocationRole(a)}`)
    .sort()
    .join('|');
  return `${EXPOSURE_CACHE_MATH_VERSION}-${signature}`;
}

/**
 * Compute the portfolio's five-dimension exposure breakdown.
 *
 * @param assets - All user assets fetched via Admin SDK
 * @returns The five views (notional-based Titoli/Settori/Geografia, market-value-based
 *   Valuta/Emittenti) plus the coverage breakdown each carries.
 */
export async function computePortfolioExposure(assets: Asset[]): Promise<PortfolioExposureData> {
  const profiles = await resolveInstrumentProfiles(assets);
  const cacheKey = buildExposureCacheKey(assets);
  return computeExposure(assets, profiles, new Date().toISOString(), cacheKey);
}
