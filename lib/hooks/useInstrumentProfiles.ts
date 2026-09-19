'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { InstrumentProfile } from '@/types/exposure';

interface InstrumentProfilesResponse {
  profiles: Record<string, InstrumentProfile>;
  computedAt: string;
}

async function fetchInstrumentProfiles(ownerId: string, assetIds: string[]): Promise<InstrumentProfilesResponse> {
  const params = new URLSearchParams({ userId: ownerId, assetIds: assetIds.join(',') });
  const response = await authenticatedFetch(`/api/portfolio/instrument-profiles?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch instrument profiles');
  }
  return response.json() as Promise<InstrumentProfilesResponse>;
}

/**
 * Resolves curated/Yahoo instrument profiles for a specific asset set — the weight optimizer's PAC
 * candidates (`doc/weight-optimizer-ate.md` §8.3), fetched only when `OptimizerPanel` asks for them.
 */
export function useInstrumentProfiles(ownerId: string | undefined, assetIds: string[]) {
  return useQuery({
    queryKey: queryKeys.instrumentProfiles.byAssets(ownerId ?? '', assetIds),
    queryFn: () => fetchInstrumentProfiles(ownerId as string, assetIds),
    enabled: !!ownerId && assetIds.length > 0,
    staleTime: 60 * 60 * 1000,
  });
}
