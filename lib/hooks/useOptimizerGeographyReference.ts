'use client';

/**
 * The weight optimizer's geography reference (doc/weight-optimizer-ate.md §5.4) — resolved once
 * per render from `idealAllocation.geography` and shared between `OptimizerPanel` (the PAC's
 * Ottimizzato view) and `IdealCompositionDialog` (Allocazione's standalone tool, §4), instead of
 * each duplicating the same `INDEX_PROFILES` lookup and `areasFromCountries` call.
 */
import { useMemo } from 'react';
import type { IdealAllocationSettings } from '@/types/assets';
import type { GeoArea } from '@/lib/constants/geoAreas';
import { areasFromCountries } from '@/lib/utils/weightOptimizer';
import { INDEX_PROFILES, type CuratedIndexProfile } from '@/lib/constants/instrumentProfiles';

export interface OptimizerGeographyReference {
  geographyProfile: CuratedIndexProfile | undefined;
  referenceCountries: Array<{ key: string; weight: number }> | null;
  referenceAreas: Record<GeoArea, number> | null;
  referenceEstimatedShare: number;
}

export function useOptimizerGeographyReference(
  idealAllocation: IdealAllocationSettings | null
): OptimizerGeographyReference {
  const geographyProfile = idealAllocation?.geography ? INDEX_PROFILES[idealAllocation.geography.referenceIndexId] : undefined;
  const referenceCountries = geographyProfile?.countries?.map((c) => ({ key: c.code, weight: c.weight })) ?? null;

  return useMemo(() => {
    if (!idealAllocation?.geography?.enabled || !referenceCountries) {
      return { geographyProfile, referenceCountries, referenceAreas: null, referenceEstimatedShare: 0 };
    }
    const { areas, estimatedShare } = areasFromCountries(referenceCountries, geographyProfile?.otherAreaSplit, null);
    return { geographyProfile, referenceCountries, referenceAreas: areas, referenceEstimatedShare: estimatedShare };
  }, [idealAllocation?.geography?.enabled, referenceCountries, geographyProfile]);
}
