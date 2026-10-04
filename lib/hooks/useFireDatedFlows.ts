'use client';

/**
 * The dated flows of the FIRE plan, resolved for the page (doc/fire-ipotesi/README.md § 12, RF1): the saved list (or the
 * Calcolatore's unsaved `draft`, the PREVIEW until «Salva»), placed on the calendar with the user's age and the mortgages
 * of Patrimonio. The queries are the page's own (`['settings', ownerId]`, `['assets', ownerId]`) plus the instalments
 * the «Mutuo» tile reads, so the tabs share React Query's cache.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { useMortgageInstalments } from '@/lib/hooks/useMortgageInstalments';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { resolveDatedFlows, type ExcludedFlow, type MortgageFlowSource, type ResolvedFlow } from '@/lib/utils/datedFlows';
import { mortgageFlowSchedule, summarizeMortgage } from '@/lib/utils/mortgageSummary';
import type { DatedFlow } from '@/types/assets';

/** A property with linked instalments, offered by «Collega un mutuo». */
export interface MortgageOption {
  propertyId: string;
  propertyName: string;
  source: MortgageFlowSource;
}

export interface UseFireDatedFlowsResult {
  /** The list in use: the draft if given, else the saved one. */
  flows: DatedFlow[];
  resolved: ResolvedFlow[];
  excluded: ExcludedFlow[];
  mortgages: MortgageOption[];
  isLoading: boolean;
}

export function useFireDatedFlows(draft?: readonly DatedFlow[]): UseFireDatedFlowsResult {
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
  const assets = assetsQuery.data;
  const propertyIds = useMemo(() => (assets ?? []).filter((asset) => asset.type === 'realestate' && asset.assetClass === 'realestate').map((asset) => asset.id), [assets]);
  const instalmentsQuery = useMortgageInstalments(ownerId, propertyIds);
  const instalments = instalmentsQuery.data;

  const mortgages = useMemo<MortgageOption[]>(() => {
    if (!assets || !instalments) return [];
    const now = new Date();
    return assets
      .filter((asset) => propertyIds.includes(asset.id))
      .map((property) => ({ property, rows: instalments.filter((row) => row.debtAssetId === property.id) }))
      .filter(({ rows }) => rows.length > 0)
      .map(({ property, rows }) => {
        const summary = summarizeMortgage(property, rows, now);
        return { propertyId: property.id, propertyName: property.name, source: { propertyName: property.name, schedule: mortgageFlowSchedule(summary) } };
      });
  }, [assets, instalments, propertyIds]);

  const savedFlows = settingsQuery.data?.fireDatedFlows;
  const userAge = settingsQuery.data?.userAge;
  const flows = useMemo<DatedFlow[]>(() => [...(draft ?? savedFlows ?? [])], [draft, savedFlows]);
  const { resolved, excluded } = useMemo(() => {
    const map = new Map(mortgages.map((option) => [option.propertyId, option.source]));
    return resolveDatedFlows(flows, { currentYear: getItalyYear(), userAge, mortgages: map });
  }, [flows, userAge, mortgages]);

  return {
    flows,
    resolved,
    excluded,
    mortgages,
    isLoading: settingsQuery.isLoading || assetsQuery.isLoading || instalmentsQuery.isLoading,
  };
}
