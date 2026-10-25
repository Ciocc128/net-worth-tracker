'use client';

/**
 * The ECB anchors of the Monte Carlo market (Q3, doc/montecarlo/README.md § 14.5 RQ9): the document the daily cron
 * writes, read ONCE per page by React Query (global data: the key has no owner). No document, no read permission
 * or a failed read = the frozen anchors, so a failure here changes no figure.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { MonteCarloAnchors } from '@/lib/constants/monteCarloMarketDefaults';
import { toMonteCarloAnchors } from '@/lib/utils/marketAnchors';
import { getStoredMarketAnchors } from '@/lib/services/marketAnchorsReadService';

/** The anchors and whether the read has settled (answered or failed): a figure that must not print twice waits for it. */
export function useMarketAnchorsState(): { anchors: MonteCarloAnchors; ready: boolean } {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['market-anchors'],
    queryFn: getStoredMarketAnchors,
    enabled: !!user,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const anchors = useMemo(() => toMonteCarloAnchors(query.data), [query.data]);
  return { anchors, ready: !query.isPending };
}

export function useMarketAnchors(): MonteCarloAnchors {
  return useMarketAnchorsState().anchors;
}
