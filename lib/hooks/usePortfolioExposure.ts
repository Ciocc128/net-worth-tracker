'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { PortfolioExposureResponse } from '@/types/exposure';

async function fetchPortfolioExposure(
  force: boolean
): Promise<PortfolioExposureResponse> {
  const url = force
    ? '/api/portfolio/exposure?force=true'
    : '/api/portfolio/exposure';
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch portfolio exposure');
  }
  return response.json() as Promise<PortfolioExposureResponse>;
}

/**
 * Lazily fetches portfolio exposure breakdown (top holdings, sectors, ETF issuers).
 *
 * `enabled` gates the fetch; the Esposizione tile passes true on mount (the server's 24h cache
 * absorbs the Yahoo Finance cost), a caller that renders on demand can pass false until then.
 *
 * The returned `refresh` callback triggers a server-side cache bypass: useful
 * for the "Aggiorna" button when the portfolio composition hasn't changed but
 * the user wants fresh data. Plain `refetch` from React Query alone is not
 * enough because the server returns its Firestore cache when the cacheKey is
 * unchanged.
 */
export function usePortfolioExposure(
  userId: string | undefined,
  enabled: boolean
) {
  // Set to true by `refresh()` and consumed on the next queryFn call.
  // A ref (not state) avoids triggering a re-render when we flip it.
  const forceRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.portfolio.exposure(userId ?? ''),
    queryFn: async () => {
      const force = forceRef.current;
      forceRef.current = false;
      return fetchPortfolioExposure(force);
    },
    enabled: !!userId && enabled,
    // Server cache is 24h; keep client stale for 20 min so navigating away and
    // back within a session doesn't trigger a redundant refetch.
    staleTime: 20 * 60 * 1000,
  });

  const refresh = () => {
    forceRef.current = true;
    return query.refetch();
  };

  return { ...query, refresh };
}

/**
 * What the PAGE needs of the exposure's read without reading it: whether the last attempt failed
 * (the Esposizione row's `failed`, its red eyebrow) and whether a payload was ever read (a failed
 * «Aggiorna» over an exposure already read keeps the tile; a failed first read is an `ErrorNotice`
 * row). An observer on the SAME key as `usePortfolioExposure`'s with `enabled: false` — it
 * downloads nothing by itself, and `refetch()` on it («Riprova») fetches regardless of `enabled`,
 * so the row's hook sees the answer the moment it lands (upstream's `useInstrumentProfilesState`,
 * on the fork's server-side pipeline: D-UP1).
 */
export function usePortfolioExposureState(userId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.portfolio.exposure(userId ?? ''),
    queryFn: () => fetchPortfolioExposure(false),
    enabled: false,
    staleTime: 20 * 60 * 1000,
  });
  return { isError: query.isError, hasProfiles: query.data !== undefined, refetch: query.refetch };
}
