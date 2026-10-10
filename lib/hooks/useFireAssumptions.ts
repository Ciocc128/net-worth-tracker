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
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { getAnnualCashflowData } from '@/lib/services/fireService';
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { getGoalData } from '@/lib/services/goalService';
import { useMarketAnchors } from '@/lib/hooks/useMarketAnchors';
import { resolveFireAssumptions, type FireAssumptions } from '@/lib/utils/fireAssumptions';

export interface UseFireAssumptionsResult {
  assumptions: FireAssumptions | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * `lockedAssetIds`: the funds the pension lock keeps closed (memoise it in the caller: its identity keys the result).
 * `withCashflow`: also read the Cashflow (the SAME `['annualCashflowData', ownerId]` query the tabs make), so
 * the result carries the plan's `expenses` (RP6) — the tabs that run a plan ask for it, the Settings tile does not.
 */
export function useFireAssumptions(lockedAssetIds?: ReadonlySet<string>, { withCashflow = false }: { withCashflow?: boolean } = {}): UseFireAssumptionsResult {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

  // The saved settings with the plan's draft over them (RP3): a typed fund or expense is previewed here too.
  const settingsQuery = useFireSettings();
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

  const cashflowQuery = useQuery({
    queryKey: ['annualCashflowData', ownerId],
    queryFn: () => getAnnualCashflowData(ownerId!),
    enabled: !!user && !!ownerId && withCashflow,
    staleTime: 300000,
  });

  const anchors = useMarketAnchors();
  const assets = assetsQuery.data;
  const goalData = goalQuery.data;
  const cashflowData = withCashflow ? cashflowQuery.data : undefined;
  const ready = !settingsQuery.isLoading && !settingsQuery.isError && assetsQuery.isSuccess && (!withCashflow || cashflowQuery.isSuccess);
  const assumptions = useMemo(
    () => (ready ? resolveFireAssumptions({ settings, assets, lockedAssetIds, goalData: goalDriven ? goalData : null, assetValue: calculateAssetValue, cashflowData, anchors }) : null),
    [ready, settings, assets, lockedAssetIds, goalDriven, goalData, cashflowData, anchors],
  );
  return {
    assumptions,
    isLoading: settingsQuery.isLoading || assetsQuery.isLoading || (withCashflow && cashflowQuery.isLoading),
    isError: settingsQuery.isError || assetsQuery.isError || (withCashflow && cashflowQuery.isError),
  };
}
