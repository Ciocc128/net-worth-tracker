'use client';

/**
 * The hypotheses of the FIRE page, read ONCE per tab (doc/fire-ipotesi/README.md § 4.1): the queries
 * are the page's own (`queryKeys.settings`, `queryKeys.assets`, `queryKeys.goals`), so the
 * tabs share React Query's cache, and the resolution is `resolveFireAssumptions`, memoised.
 */
import { useMemo } from 'react';
import { useAssets } from '@/lib/hooks/useAssets';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useAnnualCashflow } from '@/lib/hooks/useAnnualCashflow';
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { useGoalData } from '@/lib/hooks/useGoalData';
import { useMarketAnchors } from '@/lib/hooks/useMarketAnchors';
import { resolveFireAssumptions, type FireAssumptions } from '@/lib/utils/fireAssumptions';

export interface UseFireAssumptionsResult {
  assumptions: FireAssumptions | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * `lockedAssetIds`: the funds the pension lock keeps closed (memoise it in the caller: its identity keys the result).
 * `withCashflow`: also read the Cashflow (the SAME recent-expenses window the tabs read, `useAnnualCashflow`), so
 * the result carries the plan's `expenses` (RP6) — the tabs that run a plan ask for it, the Settings tile does not.
 */
export function useFireAssumptions(lockedAssetIds?: ReadonlySet<string>, { withCashflow = false }: { withCashflow?: boolean } = {}): UseFireAssumptionsResult {
  const { ownerId } = useActiveAccount();

  // The saved settings with the plan's draft over them (RP3): a typed fund or expense is previewed here too.
  const settingsQuery = useFireSettings();
  const assetsQuery = useAssets(ownerId);
  const settings = settingsQuery.data;
  const goalDriven = !!settings?.goalBasedInvestingEnabled && !!settings?.goalDrivenAllocationEnabled;
  const goalQuery = useGoalData(ownerId, { enabled: goalDriven });

  const cashflowQuery = useAnnualCashflow(ownerId, { enabled: withCashflow });

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
