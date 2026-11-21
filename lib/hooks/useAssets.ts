'use client';

/**
 * React Query hooks for Asset management
 *
 * Provides:
 * - Data fetching with caching (useAssets)
 * - Mutations with automatic cache invalidation (useDeleteAsset)
 *
 * Cache invalidation strategy: Invalidate all asset queries after mutations
 * to ensure UI reflects latest server state (new/updated/deleted assets).
 */

import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets, deleteAsset, getAssetUsage } from '@/lib/services/assetService';
import type { LedgerChoice } from '@/lib/utils/assetUsage';

/**
 * Fetch all assets for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * `options.enabled` lets a dialog read only while open (`DividendDialog`); read `isLoading`, not
 * `isPending`, on a disabled query.
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with assets data, loading state, and error
 */
export function useAssets(userId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    ...assetsQueryOptions(userId || ''),
    enabled: !!userId && (options?.enabled ?? true), // Only run if userId exists (prevents query before auth)
  });
}

/**
 * The assets query as options, for an imperative `queryClient.fetchQuery` that must share the
 * hook's cache (Rendimenti's base resolution): the same key, the same reader, the global staleTime.
 */
export function assetsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.assets.all(userId),
    queryFn: () => getAllAssets(userId),
  });
}

/**
 * «Dove è usato» of one asset, read when the delete dialog opens (doc/cancellazione-strumenti/README.md
 * § 4.4). Never cached: what a dialog shows must be what the server reads now.
 */
export function useAssetUsage(userId: string | undefined, assetId: string | null) {
  return useQuery({
    queryKey: ['asset-usage', userId, assetId] as const,
    queryFn: () => getAssetUsage(assetId as string, userId as string),
    enabled: !!userId && !!assetId,
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * Every query key a deletion can change: the asset itself plus what the cleanups and the ledger
 * choice touch (held equal to the server's writes by `__tests__/useDeleteAsset.test.ts`).
 */
export function assetDeletionInvalidationKeys(userId: string) {
  return [
    queryKeys.assets.all(userId),
    queryKeys.assetTransactions.all(userId),
    queryKeys.pensionContributions.all(userId),
    queryKeys.dividendReceipts.all(userId),
    queryKeys.accumulationPlans.all(userId),
    queryKeys.modelPortfolio.byOwner(userId),
    queryKeys.settings.all(userId),
    queryKeys.goals.all(userId),
    queryKeys.dashboard.overview(userId),
  ];
}

/**
 * Delete an asset with automatic cache invalidation. `ledger` is the user's choice on the
 * operations (and pension contributions) the asset has; the server refuses with
 * `AssetInUseError` when something still depends on it.
 *
 * @param userId - User ID
 * @returns React Query mutation with mutate function and status
 */
export function useDeleteAsset(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, ledger }: { assetId: string; ledger?: LedgerChoice }) => deleteAsset(assetId, userId, ledger),
    onSuccess: () => {
      for (const queryKey of assetDeletionInvalidationKeys(userId)) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
