'use client';

/**
 * React Query hook for the dedicated `pensionContributions` collection.
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent calls before auth completes.
 * Optionally scoped to a single fund asset; the query key varies accordingly so per-fund and
 * all-funds views cache independently.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getPensionContributions } from '@/lib/services/pensionContributionService';

export function usePensionContributions(userId: string | undefined, assetId?: string) {
  return useQuery({
    queryKey: assetId
      ? queryKeys.pensionContributions.byAsset(userId || '', assetId)
      : queryKeys.pensionContributions.all(userId || ''),
    queryFn: () => getPensionContributions(userId!, assetId),
    enabled: !!userId,
  });
}
