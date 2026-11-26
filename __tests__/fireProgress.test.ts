/**
 * «Verso il FIRE» (ES2, doc/essenziale/README.md § 5.7, acceptance 8–9): the tile's reading and the condition that
 * mounts it. The figures come from the Calculator's own engine, so the number the tile prints is the Calculator's.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));

import { describeFireProgress, isFirePlanFilled } from '@/lib/utils/fireProgress';
import { getDefaultScenarios, resolveFireRequirement } from '@/lib/services/fireService';
import { describeOverviewAsides, describeOverviewClosedAnswers, OVERVIEW_SECTION_IDS } from '@/lib/utils/overviewSummary';

describe('isFirePlanFilled', () => {
  it('needs the age and the withdrawal rate saved', () => {
    expect(isFirePlanFilled({ userAge: 40, withdrawalRate: 4 })).toBe(true);
    expect(isFirePlanFilled({ userAge: 40 })).toBe(false);
    expect(isFirePlanFilled({ withdrawalRate: 4 })).toBe(false);
    expect(isFirePlanFilled({ userAge: 0, withdrawalRate: 4 })).toBe(false);
    expect(isFirePlanFilled({ userAge: 40, withdrawalRate: 0 })).toBe(false);
    expect(isFirePlanFilled(null)).toBe(false);
    expect(isFirePlanFilled(undefined)).toBe(false);
  });
});

describe('describeFireProgress', () => {
  it('prints 25% for 150.000 € of a 600.000 € number (spec acceptance 8)', () => {
    // The requirement is the engine's: 24.000 € a year at 4% with no flows, pensions, fund or tax = 600.000 €.
    const { requirement } = resolveFireRequirement({
      annualExpenses: 24_000,
      withdrawalRate: 4,
      scenario: getDefaultScenarios().base,
      yearsElapsed: 0,
      honest: { userAge: 40, pensions: [], taxBrackets: [], now: new Date(2026, 10, 26, 12) },
      gainShare: 0,
    });
    expect(requirement).toBeCloseTo(600_000, 0);

    const reading = describeFireProgress({ capital: 150_000, fireNumber: requirement, baseYearsToFIRE: 12, currentYear: 2026 });
    expect(reading?.percent).toBe(25);
    expect(reading?.amounts).toMatch(/150\.000/);
    expect(reading?.amounts).toMatch(/600\.000/);
    expect(reading?.forecast).toBe('FIRE previsto nel 2038');
    expect(reading?.fill).toBe(25);
  });

  it('says «oltre l\'orizzonte» without a Base year and «già raggiunto» at year zero', () => {
    expect(describeFireProgress({ capital: 10_000, fireNumber: 600_000, baseYearsToFIRE: null, currentYear: 2026 })?.forecast).toBe("FIRE oltre l'orizzonte");
    const reached = describeFireProgress({ capital: 700_000, fireNumber: 600_000, baseYearsToFIRE: 0, currentYear: 2026 });
    expect(reached?.forecast).toBe('FIRE già raggiunto');
    expect(reached?.percent).toBe(117);
    expect(reached?.fill).toBe(100);
  });

  it('has nothing to measure against without a requirement', () => {
    expect(describeFireProgress({ capital: 1, fireNumber: 0, baseYearsToFIRE: null, currentYear: 2026 })).toBeNull();
  });
});

describe('the closed row', () => {
  it('has an aside in words and keeps the answer for the tile (the figures are the hook\'s, not the payload\'s)', () => {
    expect(OVERVIEW_SECTION_IDS.fire).toBe('panoramica-fire');
    const overview = { expenseStats: null, charts: { assetClassData: [] }, metrics: {}, flags: {}, topAssets: [] } as never;
    expect(describeOverviewAsides(overview)[OVERVIEW_SECTION_IDS.fire]).toBe('a che punto sono');
    expect(describeOverviewClosedAnswers(overview, { dayOfMonth: 10, daysInMonth: 30 })[OVERVIEW_SECTION_IDS.fire]).toBeNull();
  });
});
