/**
 * Unit tests for pensionContributions.ts — per-tax-year rollups of the dedicated
 * `PensionContribution` records by source, including the deductible-only sum (TFR excluded) and the
 * full three-source breakdown.
 */

import { describe, it, expect } from 'vitest';
import {
  derivePensionDeductibleByYear,
  derivePensionContributionsByYearAndNature,
} from '@/lib/utils/pensionContributions';
import type { ContributionSource, PensionContribution } from '@/types/pension';

/** Minimal PensionContribution fixture — only the fields the aggregation reads matter. */
function mkContribution(
  taxYear: number,
  amount: number,
  source: ContributionSource
): PensionContribution {
  return {
    id: `c-${taxYear}-${amount}-${source}`,
    userId: 'u1',
    assetId: 'fund-1',
    source,
    amount,
    date: new Date(`${taxYear}-06-01`),
    taxYear,
    deductible: source !== 'tfr',
    createdAt: new Date(`${taxYear}-06-01`),
  };
}

describe('derivePensionDeductibleByYear', () => {
  it('sums voluntary + employer per tax year and excludes TFR', () => {
    const contributions = [
      mkContribution(2026, 1000, 'employer'),
      mkContribution(2026, 500, 'voluntary'),
      mkContribution(2026, 2000, 'tfr'), // excluded
      mkContribution(2027, 1200, 'employer'),
    ];
    expect(derivePensionDeductibleByYear(contributions)).toEqual({ 2026: 1500, 2027: 1200 });
  });

  it('keys by taxYear, not by the calendar year of the date', () => {
    // A January payment booked to the previous tax year of competence.
    const contribution: PensionContribution = {
      ...mkContribution(2025, 800, 'voluntary'),
      date: new Date('2026-01-15'),
    };
    expect(derivePensionDeductibleByYear([contribution])).toEqual({ 2025: 800 });
  });

  it('returns an empty map when there are no contributions', () => {
    expect(derivePensionDeductibleByYear([])).toEqual({});
  });
});

describe('derivePensionContributionsByYearAndNature', () => {
  it('breaks contributions down per tax year across all three sources', () => {
    const contributions = [
      mkContribution(2026, 1000, 'employer'),
      mkContribution(2026, 500, 'voluntary'),
      mkContribution(2026, 2000, 'tfr'),
      mkContribution(2027, 1200, 'employer'),
    ];
    expect(derivePensionContributionsByYearAndNature(contributions)).toEqual({
      2026: { tfr: 2000, voluntary: 500, employer: 1000 },
      2027: { tfr: 0, voluntary: 0, employer: 1200 },
    });
  });

  it('returns an empty map when there are no contributions', () => {
    expect(derivePensionContributionsByYearAndNature([])).toEqual({});
  });
});
