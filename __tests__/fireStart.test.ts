import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

/** T5 (doc/montecarlo/README.md § 12): the FIRE year and the capital the «Dopo il FIRE» tab starts from (A-T7, A-T8, A-T9, A-T11). */
import { calculateFIREProjection, getDefaultScenarios, type FireHonestInputs } from '@/lib/services/fireService';
import { defaultWithdrawalYears, resolveFireStart } from '@/lib/utils/fireStart';
import type { FIREProjectionScenarios } from '@/types/assets';

function scenarios(): FIREProjectionScenarios {
  const defaults = getDefaultScenarios();
  return { ...defaults, base: { ...defaults.base, growthRate: 5, inflationRate: 2 } };
}

const projection = (honest?: FireHonestInputs) => calculateFIREProjection(500_000, 30_000, 30_000, 4, scenarios(), 50, undefined, honest, true);

describe('A-T7 — the Base capital at the FIRE year, in today\'s euros', () => {
  const result = projection();
  const start = resolveFireStart({ projection: result, yearsToFIRE: result.baseYearsToFIRE, hasBaseline: true, baseInflationRate: 2, currentYear: 2026, currentAge: 40 });

  it('FIRE in 6 years, 883.981 € nominal, 784.950 € of today (the requirement is 750.000 € of today)', () => {
    expect(result.baseYearsToFIRE).toBe(6);
    expect(start.kind).toBe('fire');
    if (start.kind !== 'fire') return;
    expect(start.years).toBe(6);
    expect(start.capitalNominal).toBe(883_981);
    expect(Math.round(start.capitalToday)).toBe(784_950);
    expect(start.calendarYear).toBe(2032);
    expect(start.ageAtFire).toBe(46);
    expect(start.gainShare).toBeNull();
  });
});

describe('A-T9 — the cost basis rides on the projection only when the tax is modelled', () => {
  it('without the tax the rows carry no baseCostBasis', () => {
    expect(projection().yearlyData.every((row) => row.baseCostBasis === undefined)).toBe(true);
  });

  it('with the tax the Base basis is today\'s plus every euro saved, and the gain share follows (RD3)', () => {
    const honest: FireHonestInputs = { pensions: [], taxBrackets: [], withdrawalTax: { basisToday: 400_000, rate: 26 }, now: new Date(2026, 0, 1, 12) };
    const result = projection(honest);
    const years = result.baseYearsToFIRE as number;
    const row = result.yearlyData.find((entry) => entry.year === years)!;
    expect(row.baseCostBasis).toBeDefined();
    // 400.000 + the savings of years 1…T (30.000 indexed from year 1 at the Base 2%, the last year included).
    let saved = 0;
    for (let year = 1; year <= years; year++) saved += 30_000 * Math.pow(1.02, year - 1);
    expect(row.baseCostBasis).toBe(Math.round(400_000 + saved));
    const start = resolveFireStart({ projection: result, yearsToFIRE: result.baseYearsToFIRE, hasBaseline: true, baseInflationRate: 2, currentYear: 2026, currentAge: null });
    if (start.kind !== 'fire') throw new Error('expected a FIRE start');
    expect(start.gainShare).toBeCloseTo(1 - (row.baseCostBasis as number) / row.baseNetWorth, 10);
    expect(start.ageAtFire).toBeNull();
  });
});

describe('A-T8 — no FIRE year: the run starts today and says why', () => {
  const result = projection();
  const base = { projection: result, hasBaseline: true, baseInflationRate: 2, currentYear: 2026, currentAge: 40 };
  it('already FIRE (T = 0)', () => expect(resolveFireStart({ ...base, yearsToFIRE: 0 })).toEqual({ kind: 'today', reason: 'already' }));
  it('never within the horizon (null)', () => expect(resolveFireStart({ ...base, yearsToFIRE: null })).toEqual({ kind: 'today', reason: 'never' }));
  it('a plan that cannot run (hasBaseline false, or no projection)', () => {
    expect(resolveFireStart({ ...base, hasBaseline: false, yearsToFIRE: 6 })).toEqual({ kind: 'today', reason: 'no-plan' });
    expect(resolveFireStart({ ...base, projection: null, yearsToFIRE: 6 })).toEqual({ kind: 'today', reason: 'no-plan' });
  });
});

describe('A-T11 — the horizon runs to 90 years of age (RD5)', () => {
  it('age 40: 45 years from the FIRE year at 5, 50 from today', () => {
    expect(defaultWithdrawalYears(40, 5)).toBe(45);
    expect(defaultWithdrawalYears(40, 0)).toBe(50);
  });
  it('no saved age: 30 years', () => expect(defaultWithdrawalYears(null, 5)).toBe(30));
  it('age 85, FIRE in 10: one year at least; 20 at 30: capped at 60', () => {
    expect(defaultWithdrawalYears(85, 10)).toBe(1);
    expect(defaultWithdrawalYears(20, 0)).toBe(60);
  });
});
