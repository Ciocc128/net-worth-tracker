/**
 * Fondo pensione (Italian supplementary pension) — domain types.
 *
 * Scope note: the pension is tracked as a manually-valued asset (like real estate — no price API),
 * kept OUT of the target allocation, and fed into FIRE as locked, illiquid capital. This file holds
 * only the types the tax/deduction layer needs; the pure calculation lives in
 * `lib/utils/pensionDeduction.ts`.
 *
 * TAX RULE (why the "nature" distinction matters):
 * Contributions to a fondo pensione are IRPEF-deductible up to an annual ceiling, BUT only some
 * natures count. The employee's voluntary payments and the employer's contributions are deductible
 * and consume the ceiling; the TFR conferred to the fund is NOT deductible (it flows in tax-suspended
 * and is taxed separately at exit). So the deductible base = voluntary + employer, never TFR.
 */

/**
 * Origin of a single pension contribution. Only `voluntary` and `employer` are IRPEF-deductible and
 * count toward the annual ceiling; `tfr` is excluded from the deduction computation entirely.
 */
export type PensionContributionNature = 'tfr' | 'voluntary' | 'employer';

/** Natures that are IRPEF-deductible and consume the annual ceiling (TFR excluded by law). */
export const DEDUCTIBLE_PENSION_NATURES: readonly PensionContributionNature[] = ['voluntary', 'employer'];

/**
 * Inputs to the yearly deduction/plafond computation for a single target year.
 *
 * `deductibleContribByYear` is the per-year sum of DEDUCTIBLE contributions (voluntary + employer,
 * TFR already excluded upstream). It must span from `enrollmentYear` up to `targetYear` so the
 * multi-year "extra-deducibilità" fold can replay the plafond accrual and drawdown history.
 */
export interface PensionDeductionInput {
  /** Year the estimate is computed for. */
  targetYear: number;
  /** First calendar year of participation in the complementary pension (defines the 5/20-year windows). */
  enrollmentYear: number;
  /**
   * Eligibility for the "extra-deducibilità" recovery regime: reserved for workers whose FIRST
   * employment (mandatory pension contribution) began after 2007-01-01. The app cannot infer this,
   * so it is an explicit user-declared flag.
   */
  isFirstJobPost2007: boolean;
  /** year -> deductible contributions (voluntary + employer) paid that year, in EUR. */
  deductibleContribByYear: Record<number, number>;
}

/**
 * Result of the yearly deduction/plafond computation. All amounts in EUR.
 *
 * The three figures surfaced in the "Previdenza" annual recap map to:
 * - `taxSavingBaseDeducted` → drives the tax-saving figure (benefit = tax(RAL) − tax(RAL − deducted)).
 * - `plafondCreatedThisYear` → "extra plafond built this year" (non-zero only in the first 5 years).
 * - `accruedPlafondResidual` → "recoverable plafond accumulated so far" (net of what's been used).
 */
export interface PensionDeductionState {
  /** Ordinary deduction ceiling for the target year (5.164,57 ≤2025, 5.300 ≥2026). */
  ordinaryCeiling: number;
  /** Deductible contributions (voluntary + employer) paid in the target year. */
  deductibleContributions: number;
  /** Extra plafond created in the target year = max(0, ceiling − contributions); 0 outside the 5-year accrual window. */
  plafondCreatedThisYear: number;
  /** Recoverable plafond still available (accrued minus already used); 0 once the usage window (year 25) has passed. */
  accruedPlafondResidual: number;
  /** Extra deduction headroom usable in the target year = min(residual entering the year, annual cap); 0 outside the usage window. */
  extraAvailableThisYear: number;
  /** Effective ceiling for the year = ordinaryCeiling + extraAvailableThisYear. */
  effectiveCeiling: number;
  /** Amount actually deductible this year = min(contributions, effectiveCeiling). */
  deductedThisYear: number;
  /** True when the target year falls in the first-5-years accrual window. */
  isAccrualYear: boolean;
  /** True when the target year falls in the 20-year usage window (years 6..25). */
  isUsageYear: boolean;
}
