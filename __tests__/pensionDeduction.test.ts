/**
 * Unit tests for pensionDeduction.ts — ordinary deduction, the multi-year extra-deducibilità fold
 * (accrual → drawdown → expiry), and the injected-tax benefit helper.
 *
 * All functions are pure. The benefit test wires the real progressive-tax engine to confirm the
 * `taxOf` injection matches production behaviour, including a deduction that straddles two brackets.
 */

import { describe, it, expect, vi } from 'vitest';

// fireService transitively imports Firebase-coupled services; stub them so importing its pure
// tax helpers doesn't boot Firebase (mirrors __tests__/fireService.test.ts).
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

import {
  computePensionDeductionState,
  computePensionTaxBenefit,
  computePensionTaxRecap,
  deriveBenefitTaxRate,
  getPensionDeductionCeiling,
  getPensionExtraDeductionCap,
  PENSION_DEDUCTION_CEILING_LEGACY,
  PENSION_DEDUCTION_CEILING_2026,
} from '@/lib/utils/pensionDeduction';
import { calculateProgressiveTax, getDefaultCoastFireTaxBrackets } from '@/lib/services/fireService';

describe('getPensionDeductionCeiling', () => {
  it('uses the legacy ceiling through 2025 and the reformed ceiling from 2026', () => {
    expect(getPensionDeductionCeiling(2024)).toBe(PENSION_DEDUCTION_CEILING_LEGACY);
    expect(getPensionDeductionCeiling(2025)).toBe(PENSION_DEDUCTION_CEILING_LEGACY);
    expect(getPensionDeductionCeiling(2026)).toBe(PENSION_DEDUCTION_CEILING_2026);
    expect(getPensionDeductionCeiling(2030)).toBe(PENSION_DEDUCTION_CEILING_2026);
  });

  it('sets the annual extra cap at half the ordinary ceiling', () => {
    expect(getPensionExtraDeductionCap(2026)).toBe(2650);
    expect(getPensionExtraDeductionCap(2024)).toBeCloseTo(2582.285, 3);
  });
});

describe('computePensionDeductionState — ordinary deduction', () => {
  it('deducts contributions up to the ordinary ceiling for an ineligible worker', () => {
    const state = computePensionDeductionState({
      targetYear: 2030,
      enrollmentYear: 2026,
      isFirstJobPost2007: false,
      deductibleContribByYear: { 2030: 3000 },
    });
    expect(state.ordinaryCeiling).toBe(5300);
    expect(state.deductedThisYear).toBe(3000);
    expect(state.extraAvailableThisYear).toBe(0);
    expect(state.accruedPlafondResidual).toBe(0);
    expect(state.plafondCreatedThisYear).toBe(0);
  });

  it('caps the deduction at the ceiling when contributions exceed it', () => {
    const state = computePensionDeductionState({
      targetYear: 2030,
      enrollmentYear: 2026,
      isFirstJobPost2007: false,
      deductibleContribByYear: { 2030: 8000 },
    });
    expect(state.deductedThisYear).toBe(5300);
  });

  it('uses the legacy ceiling for years before 2026', () => {
    const state = computePensionDeductionState({
      targetYear: 2024,
      enrollmentYear: 2020,
      isFirstJobPost2007: false,
      deductibleContribByYear: { 2024: 6000 },
    });
    expect(state.deductedThisYear).toBeCloseTo(5164.57, 2);
  });

  it('returns the ordinary-only base for a year before enrollment', () => {
    const state = computePensionDeductionState({
      targetYear: 2025,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { 2025: 2000 },
    });
    expect(state.isAccrualYear).toBe(false);
    expect(state.plafondCreatedThisYear).toBe(0);
    expect(state.deductedThisYear).toBe(2000);
  });
});

describe('computePensionDeductionState — extra-deducibilità accrual (first 5 years)', () => {
  // Giorgio's plan: enroll 2026, contribute only the employer share (€1.000/yr) → bank the rest.
  const employerOnly = { 2026: 1000, 2027: 1000, 2028: 1000, 2029: 1000, 2030: 1000 };

  it('creates plafond equal to the unused ceiling in the first year', () => {
    const state = computePensionDeductionState({
      targetYear: 2026,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: employerOnly,
    });
    expect(state.isAccrualYear).toBe(true);
    expect(state.plafondCreatedThisYear).toBe(4300); // 5300 − 1000
    expect(state.accruedPlafondResidual).toBe(4300);
    expect(state.extraAvailableThisYear).toBe(0); // no recovery during accrual
    expect(state.deductedThisYear).toBe(1000);
  });

  it('accumulates the bank across accrual years', () => {
    const state = computePensionDeductionState({
      targetYear: 2028,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: employerOnly,
    });
    // 2026 + 2027 banked (2 × 4300) entering 2028, plus 4300 created in 2028.
    expect(state.accruedPlafondResidual).toBe(12900);
    expect(state.plafondCreatedThisYear).toBe(4300);
  });
});

describe('computePensionDeductionState — extra-deducibilità usage (years 6..25)', () => {
  const employerOnly5y = { 2026: 1000, 2027: 1000, 2028: 1000, 2029: 1000, 2030: 1000 };

  it('exposes extra headroom capped at half the ceiling and draws the bank down when used', () => {
    const state = computePensionDeductionState({
      targetYear: 2031, // first usage year (enroll 2026 → accrual 2026..2030)
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { ...employerOnly5y, 2031: 7950 },
    });
    expect(state.isUsageYear).toBe(true);
    expect(state.extraAvailableThisYear).toBe(2650); // min(21500 bank, 2650 cap)
    expect(state.effectiveCeiling).toBe(7950); // 5300 + 2650
    expect(state.deductedThisYear).toBe(7950);
    expect(state.accruedPlafondResidual).toBe(18850); // 21500 − 2650 used
  });

  it('shows headroom but does not consume the bank when contributions stay under the ordinary ceiling', () => {
    const state = computePensionDeductionState({
      targetYear: 2031,
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { ...employerOnly5y, 2031: 3000 },
    });
    expect(state.extraAvailableThisYear).toBe(2650);
    expect(state.deductedThisYear).toBe(3000); // below ordinary ceiling → no extra needed
    expect(state.accruedPlafondResidual).toBe(21500); // untouched
  });

  it('expires any residual bank after the 25-year usage window', () => {
    const state = computePensionDeductionState({
      targetYear: 2051, // usageEnd = 2050 for enrollment 2026
      enrollmentYear: 2026,
      isFirstJobPost2007: true,
      deductibleContribByYear: { ...employerOnly5y, 2051: 4000 },
    });
    expect(state.isUsageYear).toBe(false);
    expect(state.accruedPlafondResidual).toBe(0);
    expect(state.extraAvailableThisYear).toBe(0);
    expect(state.deductedThisYear).toBe(4000);
  });
});

describe('computePensionTaxBenefit', () => {
  const brackets = getDefaultCoastFireTaxBrackets();
  const taxOf = (income: number) => calculateProgressiveTax(income, brackets);

  it('returns zero for a non-positive deduction or income', () => {
    expect(computePensionTaxBenefit(0, 40000, taxOf)).toBe(0);
    expect(computePensionTaxBenefit(4000, 0, taxOf)).toBe(0);
  });

  it('equals deduction × marginal rate when the deduction stays in one bracket', () => {
    // RAL 40.000 and RAL−4.000 both sit in the 35% band (28k..50k).
    expect(computePensionTaxBenefit(4000, 40000, taxOf)).toBeCloseTo(1400, 6);
  });

  it('blends the two rates when the deduction straddles a bracket boundary', () => {
    // RAL 30.000: 2.000 at 35% (above 28k) + 2.000 at 25% (below 28k) = 1.200.
    expect(computePensionTaxBenefit(4000, 30000, taxOf)).toBeCloseTo(1200, 6);
  });

  it('matches a flat injected tax function', () => {
    const flat = (income: number) => income * 0.35;
    expect(computePensionTaxBenefit(4000, 40000, flat)).toBeCloseTo(1400, 6);
  });
});

describe('deriveBenefitTaxRate', () => {
  it('stays at 15% through the first 15 years of participation', () => {
    expect(deriveBenefitTaxRate(0)).toBe(15);
    expect(deriveBenefitTaxRate(15)).toBe(15);
  });

  it('drops 0.30 points per year beyond the 15th', () => {
    expect(deriveBenefitTaxRate(16)).toBeCloseTo(14.7, 6);
    expect(deriveBenefitTaxRate(20)).toBeCloseTo(13.5, 6);
  });

  it('floors at 9% (reached at 35 years) and never goes below', () => {
    expect(deriveBenefitTaxRate(35)).toBeCloseTo(9, 6);
    expect(deriveBenefitTaxRate(50)).toBe(9);
  });
});

describe('computePensionTaxRecap', () => {
  const taxOf = (income: number) => calculateProgressiveTax(income, getDefaultCoastFireTaxBrackets());

  it('returns the deduction state and the euro tax saving together', () => {
    const recap = computePensionTaxRecap(
      {
        targetYear: 2026,
        enrollmentYear: 2026,
        isFirstJobPost2007: false,
        deductibleContribByYear: { 2026: 4000 },
      },
      40000,
      taxOf
    );
    expect(recap.state.deductedThisYear).toBe(4000);
    // RAL 40.000 and RAL−4.000 both sit in the 35% band → 4.000 × 35% = 1.400.
    expect(recap.taxSaving).toBeCloseTo(1400, 6);
  });

  it('still computes the plafond state when RAL is 0 (saving is 0)', () => {
    const recap = computePensionTaxRecap(
      {
        targetYear: 2026,
        enrollmentYear: 2026,
        isFirstJobPost2007: true,
        deductibleContribByYear: { 2026: 1000 }, // under the ceiling → banks plafond
      },
      0,
      taxOf
    );
    expect(recap.taxSaving).toBe(0);
    expect(recap.state.plafondCreatedThisYear).toBeCloseTo(PENSION_DEDUCTION_CEILING_2026 - 1000, 6);
  });
});
