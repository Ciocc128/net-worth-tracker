'use client';

/**
 * The hypotheses of the FIRE page, read ONCE per tab (doc/fire-ipotesi/README.md § 4.1): the queries
 * are the page's own (`['settings', ownerId]`, `['assets', ownerId]`, `['goalData', ownerId]`), so the
 * tabs share React Query's cache, and the resolution is `resolveFireAssumptions`, memoised.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getGoalData } from '@/lib/services/goalService';
import { resolveFireAssumptions, type FireAssumptions } from '@/lib/utils/fireAssumptions';

export interface UseFireAssumptionsResult {
  assumptions: FireAssumptions | null;
  isLoading: boolean;
  isError: boolean;
}

/** `lockedAssetIds`: the funds the pension lock keeps closed (memoise it in the caller: its identity keys the result). */
export function useFireAssumptions(lockedAssetIds?: ReadonlySet<string>): UseFireAssumptionsResult {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

  const settingsQuery = useQuery({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });
  const assetsQuery = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });
  const settings = settingsQuery.data;
  const goalDriven = !!settings?.goalBasedInvestingEnabled && !!settings?.goalDrivenAllocationEnabled;
  const goalQuery = useQuery({
    queryKey: ['goalData', ownerId],
    queryFn: () => getGoalData(ownerId!),
    enabled: !!user && !!ownerId && goalDriven,
    staleTime: 300000,
  });

  const assets = assetsQuery.data;
  const goalData = goalQuery.data;
  const assumptions = useMemo(
    () => (settingsQuery.isSuccess && assetsQuery.isSuccess ? resolveFireAssumptions({ settings, assets, lockedAssetIds, goalData: goalDriven ? goalData : null }) : null),
    [settingsQuery.isSuccess, assetsQuery.isSuccess, settings, assets, lockedAssetIds, goalDriven, goalData],
  );
  return {
    assumptions,
    isLoading: settingsQuery.isLoading || assetsQuery.isLoading,
    isError: settingsQuery.isError || assetsQuery.isError,
  };
}
