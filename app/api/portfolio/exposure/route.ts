import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { computePortfolioExposure, buildExposureCacheKey } from '@/lib/server/portfolioExposureService';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { PortfolioExposureData, PortfolioExposureResponse } from '@/types/exposure';

const EXPOSURE_CACHE_COLLECTION = 'exposure-cache';
// Cache ETF holdings for 24h — fund compositions change rarely (typically monthly).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/portfolio/exposure
 *
 * Returns the user's five-dimension exposure breakdown — Titoli · Settori · Geografia (notional,
 * leverage-aware) and Valuta · Emittenti (market value, leverage does NOT multiply) — computed by
 * `lib/server/portfolioExposureService.ts` (curated tables cascaded with Yahoo Finance, see
 * `lib/server/exposure/profileResolver.ts` and the pure `lib/utils/exposureEngine.ts`).
 *
 * Cached in Firestore `exposure-cache/{userId}` for 24h (Admin SDK write only) — the cache key
 * (`buildExposureCacheKey`) is ticker + quantity + allocation role for every active asset, so it
 * auto-invalidates on a trade or a role change but NOT on a mere price tick.
 *
 * Auth: authenticated user — returns only their own exposure data.
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = decodedToken.uid;

    // Force refresh bypasses the Firestore cache read but still writes the
    // recomputed result back. Used by the "Aggiorna" button in the UI when the
    // user explicitly wants fresh data even though the portfolio composition
    // hasn't changed.
    const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';

    const assets = await getUserAssetsAdmin(userId);

    // Build the expected cache key before reading cache, so we can validate staleness — the
    // SAME function the service uses to write it (see buildExposureCacheKey's doc comment for
    // the bug this fixed: two independently-built keys that could never match).
    const expectedCacheKey = buildExposureCacheKey(assets);

    // Attempt to serve from cache (skipped on force refresh)
    if (!forceRefresh) {
      const cacheRef = adminDb.collection(EXPOSURE_CACHE_COLLECTION).doc(userId);
      const cacheSnap = await cacheRef.get();

      if (cacheSnap.exists) {
        const cached = cacheSnap.data()!;
        const cachedAt: Timestamp = cached.cachedAt;
        const ageMs = Date.now() - cachedAt.toMillis();

        if (ageMs < CACHE_TTL_MS && cached.cacheKey === expectedCacheKey) {
          const response: PortfolioExposureResponse = {
            exposure: cached.exposure as PortfolioExposureData,
            cached: true,
          };
          return NextResponse.json(response);
        }
      }
    }

    // Cache miss, stale, or force refresh — recompute from Yahoo Finance
    const exposure = await computePortfolioExposure(assets);

    // Persist to Firestore (fire-and-forget — cache failure must never break the response)
    adminDb.collection(EXPOSURE_CACHE_COLLECTION).doc(userId).set({
      cachedAt: Timestamp.now(),
      cacheKey: exposure.cacheKey,
      exposure,
    }).catch((err: unknown) => {
      console.error('[exposure] Failed to write cache for', userId, err);
    });

    const response: PortfolioExposureResponse = { exposure, cached: false };
    return NextResponse.json(response);

  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[exposure] Error computing portfolio exposure:', error);
    return NextResponse.json(
      { error: 'Failed to compute portfolio exposure' },
      { status: 500 }
    );
  }
}
