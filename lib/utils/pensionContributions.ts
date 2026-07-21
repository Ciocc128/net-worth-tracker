/**
 * Pension contributions — pure aggregation over the dedicated `PensionContribution` records.
 *
 * Contributions live in their own collection (spec §2.2), keyed by tax year of competence
 * (`taxYear`). This module rolls them up per year, bridging the stored facts and the tax layer:
 *   - `derivePensionDeductibleByYear` feeds `computePensionDeductionState` (only voluntary +
 *     employer are deductible; TFR is excluded by law).
 *   - `derivePensionContributionsByYearAndNature` powers the "Previdenza" recap breakdown.
 *
 * Amounts are already stored as positive magnitudes, so no sign handling is needed.
 */

import {
  DEDUCTIBLE_PENSION_NATURES,
  type ContributionSource,
  type PensionContribution,
} from '@/types/pension';

/**
 * Sum the DEDUCTIBLE pension contributions (voluntary + employer, TFR excluded) per tax year.
 * Returns a `year -> EUR` map ready for `computePensionDeductionState`.
 */
export function derivePensionDeductibleByYear(
  contributions: PensionContribution[]
): Record<number, number> {
  const byYear: Record<number, number> = {};
  for (const contribution of contributions) {
    if (!DEDUCTIBLE_PENSION_NATURES.includes(contribution.source)) continue;
    byYear[contribution.taxYear] = (byYear[contribution.taxYear] ?? 0) + Math.abs(contribution.amount);
  }
  return byYear;
}

/**
 * Break contributions down per tax year AND per source (all three natures, including TFR).
 * Returns `year -> { tfr, voluntary, employer }`, each defaulting to 0. Useful for the recap that
 * shows the composition of the year's contributions.
 */
export function derivePensionContributionsByYearAndNature(
  contributions: PensionContribution[]
): Record<number, Record<ContributionSource, number>> {
  const byYear: Record<number, Record<ContributionSource, number>> = {};
  for (const contribution of contributions) {
    const year = contribution.taxYear;
    if (!byYear[year]) {
      byYear[year] = { tfr: 0, voluntary: 0, employer: 0 };
    }
    byYear[year][contribution.source] += Math.abs(contribution.amount);
  }
  return byYear;
}
