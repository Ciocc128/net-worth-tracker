'use client';

/**
 * The ECB anchors of the Monte Carlo market (Q3, doc/montecarlo/README.md § 14.5 RQ9): the document the daily cron
 * writes, read ONCE per page by React Query (global data: the key has no owner). No document, no read permission
 * or a failed read = the frozen anchors, so a failure here changes no figure.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import type { MonteCarloAnchors } from '@/lib/constants/monteCarloMarketDefaults';
import { toMonteCarloAnchors, type StoredMarketAnchors } from '@/lib/utils/marketAnchors';

async function getStoredMarketAnchors(): Promise<StoredMarketAnchors | null> {
  const snap = await getDoc(doc(db, 'ecb-rate-cache', 'market-anchors'));
  return snap.exists() ? (snap.data() as StoredMarketAnchors) : null;
}

export function useMarketAnchors(): MonteCarloAnchors {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['market-anchors'],
    queryFn: getStoredMarketAnchors,
    enabled: !!user,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  return useMemo(() => toMonteCarloAnchors(query.data), [query.data]);
}
