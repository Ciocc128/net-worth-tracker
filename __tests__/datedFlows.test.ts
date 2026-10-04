/**
 * Dated flows of the FIRE plan (doc/fire-ipotesi/README.md § 12, task F1): RF1–RF6 and RF9.
 *
 * Example of § 12.9: capital 400.000 €, plan expenses 30.000 € from the Cashflow, saving 20.000 € indexed, one
 * scenario g = 7%, π = 2% (r = 4,901961%), SWR 4%, no pension, tax or cost. Reference values: the closed forms of
 * `/mnt/project-files/fire-simulazioni/p4p5-controllo.py`. Tolerance ± 0,01 €.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DatedFlow, FIREProjectionScenarios } from '@/types/assets';
import { buildFlowSchedule, flowsRequirementAdjustment, resolveDatedFlows, type MortgageFlowSource } from '@/lib/utils/datedFlows';
import { validateDatedFlow, validateDatedFlows } from '@/lib/utils/datedFlowValidation';
import { mortgageFlowSchedule } from '@/lib/utils/mortgageSummary';
import { calculateCoastFIREMetrics, calculateCoastFIREProjection, calculateFIREProjection, resolveFireRequirement, type FireFlowsInput } from '@/lib/services/fireService';
import { realReturn } from '@/lib/utils/realReturn';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

const YEAR = 2026;
const G = 7;
const PI = 2;
const R = realReturn(G, PI) / 100;
const SCENARIO = { growthRate: G, inflationRate: PI };
const SCENARIOS: FIREProjectionScenarios = { bear: SCENARIO, base: SCENARIO, bull: SCENARIO };

const flow = (partial: Partial<DatedFlow> & Pick<DatedFlow, 'kind' | 'amount' | 'start'>): DatedFlow => ({
  id: partial.id ?? partial.kind,
  label: partial.label ?? partial.kind,
  indexed: true,
  durationYears: null,
  ...partial,
});
const inYear = (offset: number) => ({ anchor: 'year', year: YEAR + offset }) as const;

const MORTGAGE = flow({ id: 'mortgage', kind: 'expense', amount: 9_600, indexed: false, start: inYear(0), durationYears: 9, inCashflowToday: true });
const INHERITANCE = flow({ id: 'inheritance', kind: 'lumpIn', amount: 100_000, indexed: false, start: inYear(10) });
const PART_TIME = flow({ id: 'part-time', kind: 'income', amount: 9_600, start: { anchor: 'fire', afterYears: 0 }, durationYears: 10 });
const CHILD = flow({ id: 'child', kind: 'expense', amount: 6_000, start: inYear(2), durationYears: 20 });
const RENT = flow({ id: 'rent', kind: 'income', amount: 6_000, start: inYear(0), inCashflowToday: true });
const CAR = flow({ id: 'car', kind: 'lumpOut', amount: 30_000, start: inYear(3) });
const BIG_PART_TIME = flow({ id: 'big', kind: 'income', amount: 40_000, start: { anchor: 'fire', afterYears: 0 }, durationYears: 5 });

const input = (flows: DatedFlow[], planExpensesFromCashflow = true): FireFlowsInput => ({
  resolved: resolveDatedFlows(flows, { currentYear: YEAR }).resolved,
  planExpensesFromCashflow,
});

function requirementToday(flows: DatedFlow[], planExpensesFromCashflow = true): number {
  const schedule = buildFlowSchedule(input(flows, planExpensesFromCashflow).resolved, { inflationRate: PI, planExpensesFromCashflow });
  return resolveFireRequirement({ annualExpenses: 30_000, withdrawalRate: 4, scenario: SCENARIO, yearsElapsed: 0, flows: schedule }).requirement;
}

const walk = (flows?: FireFlowsInput) => calculateFIREProjection(400_000, 30_000, 20_000, 4, SCENARIOS, 50, undefined, undefined, true, flows);
const fireYear = (flows: DatedFlow[], planExpensesFromCashflow = true) => walk(input(flows, planExpensesFromCashflow)).baseYearsToFIRE;

describe('F1 — no flows changes nothing', () => {
  it('should read 750.000 € and year 8 with no flows, whatever way "none" is spelt', () => {
    expect(walk().baseYearsToFIRE).toBe(8);
    expect(requirementToday([])).toBeCloseTo(750_000, 2);
    expect(walk({ resolved: [], planExpensesFromCashflow: true })).toEqual(walk());
  });
});

describe('RF5/RF6 — the requirement and the walk', () => {
  const cases: Array<[string, DatedFlow[], number, number, boolean?]> = [
    ['F2 inheritance 100.000 € fixed at year 10', [INHERITANCE], 750_000 - 100_000 / 1.02 ** 10 / (1 + R) ** 10, 7],
    ['F3 part-time 9.600 € indexed, 10 years from FIRE', [PART_TIME], 675_517.14, 7],
    ['F4 child 6.000 € indexed, years 2–21', [CHILD], 821_875.46, 10],
    ['F5 mortgage 9.600 € fixed, in the Cashflow, last year 8', [MORTGAGE], 581_371.04, 4],
    ['F6 rent 6.000 € indexed forever, in the Cashflow', [RENT], 600_000, 5],
    ['F7 F5 with the plan expenses typed by hand', [MORTGAGE], 807_324.47, 8, false],
    ['F8 part-time 40.000 € x5 (more than the expenses: the surplus is not reinvested)', [BIG_PART_TIME], 619_762.94, 6],
    ['F9 car 30.000 € indexed at year 3', [CAR], 775_987.86, 9],
    ['F10 mortgage + inheritance + part-time + child', [MORTGAGE, INHERITANCE, PART_TIME, CHILD], 541_877.22, 3],
  ];
  it.each(cases)('%s', (_name, flows, requirement, year, fromCashflow = true) => {
    expect(requirementToday(flows, fromCashflow)).toBeCloseTo(requirement, 1);
    expect(fireYear(flows, fromCashflow)).toBe(year);
  });

  it('F2 should match the closed form to the cent', () => {
    expect(requirementToday([INHERITANCE])).toBeCloseTo(699_165.07, 2);
  });

  it('should never lower the requirement for an extra expense (D-F7)', () => {
    expect(requirementToday([CHILD])).toBeGreaterThan(750_000);
    expect(requirementToday([MORTGAGE], false)).toBeGreaterThan(750_000);
  });

  it('F11 should change the saving of the mortgage years as RF3 says', () => {
    const schedule = buildFlowSchedule(input([MORTGAGE]).resolved, { inflationRate: PI, planExpensesFromCashflow: true });
    expect(20_000 * 1.02 ** 4 + schedule.savingsDelta(5)).toBeCloseTo(22_439.99, 2);
    expect(20_000 * 1.02 ** 8 + schedule.savingsDelta(9)).toBeCloseTo(34_681.12, 2);
  });

  it('F6 should leave the saving of every year untouched when the rent is already in the Cashflow', () => {
    const schedule = buildFlowSchedule(input([RENT]).resolved, { inflationRate: PI, planExpensesFromCashflow: true });
    for (const t of [1, 5, 20]) expect(schedule.savingsDelta(t)).toBeCloseTo(0, 6);
  });

  it('F12 should take the car out of the capital of year 3', () => {
    const without = walk().yearlyData[2].baseNetWorth;
    const withCar = walk(input([CAR])).yearlyData[2].baseNetWorth;
    expect(without).toBe(Math.round(400_000 * 1.07 ** 3 + [1, 2, 3].reduce((sum, t) => sum + 20_000 * 1.02 ** (t - 1) * 1.07 ** (3 - t), 0)));
    expect(withCar).toBe(523_715);
    expect(without - withCar).toBeCloseTo(30_000 * 1.02 ** 3, 0);
  });

  it('should start from the lump of the running year', () => {
    const lumpNow = flow({ id: 'now', kind: 'lumpIn', amount: 350_000, start: inYear(0) });
    expect(walk(input([lumpNow])).baseYearsToFIRE).toBe(0);
  });
});

describe('F16 — the surplus of a year is computed after the pension', () => {
  it('should sum δ_j = −30.000 in years 1–11 and −20.000 in years 12–15', () => {
    const resolved = input([flow({ kind: 'income', amount: 40_000, start: { anchor: 'fire', afterYears: 0 }, durationYears: 15 })]).resolved;
    const schedule = buildFlowSchedule(resolved, { inflationRate: PI, planExpensesFromCashflow: true });
    const adjustment = flowsRequirementAdjustment({
      schedule,
      retirementYear: 0,
      expensesAtRetirement: 30_000,
      realReturnRate: R * 100,
      withdrawalRate: 4,
      taxMultiplier: 1,
      pensionNetAt: (j) => (j >= 12 ? 10_000 : 0),
      pensionHorizon: 12,
    });
    let expected = 0;
    for (let j = 1; j <= 15; j++) expected += (j <= 11 ? -30_000 : -20_000) / (1 + R) ** j;
    expect(adjustment).toBeCloseTo(expected, 4);
  });
});

describe('F15 — Coast (RF9)', () => {
  const coast = (flows?: DatedFlow[]) =>
    calculateCoastFIREMetrics(100_000, 30_000, 4, 35, 50, R * 100, PI, [], undefined, new Date(YEAR, 0, 1), undefined, undefined, flows ? input(flows) : undefined).coastFireNumberToday;

  it('should give 365.853,47 € with no flows, and the same through an empty list', () => {
    expect(coast()).toBeCloseTo(365_853.47, 2);
    expect(coast([])).toBeCloseTo(365_853.47, 2);
  });

  it('should take the inheritance of year 10 off the Coast number', () => {
    expect(coast([INHERITANCE])).toBeCloseTo(315_018.54, 2);
  });

  it('should count only the years of the child after the target age', () => {
    expect(coast([CHILD])).toBeCloseTo(380_755.83, 2);
  });

  it('should carry the lump in the portfolio line, so the chart agrees with the number', () => {
    const projection = calculateCoastFIREProjection(100_000, 30_000, 4, 35, 50, SCENARIOS, [], undefined, new Date(YEAR, 0, 1), undefined, undefined, input([INHERITANCE]));
    const last = projection.projectionData.at(-1)!;
    expect(last.basePortfolioValue).toBeCloseTo(100_000 * (1 + R) ** 15 + (100_000 / 1.02 ** 10) * (1 + R) ** 5, 2);
  });
});

describe('RF1 — windows, exclusions, the linked mortgage', () => {
  it('F23 should exclude an age-anchored flow without the age, and say why', () => {
    const atAge = flow({ id: 'age', kind: 'expense', amount: 5_000, start: { anchor: 'age', age: 60 } });
    expect(resolveDatedFlows([atAge], { currentYear: YEAR }).excluded).toEqual([{ id: 'age', label: 'expense', reason: 'manca l\'età', source: undefined }].map(({ id, label, reason }) => ({ id, label, reason })));
    expect(resolveDatedFlows([atAge], { currentYear: YEAR, userAge: 45 }).resolved[0]).toMatchObject({ start: 15, anchor: 'fixed' });
  });

  it('F17 should pay the instalment month by month, year by year', () => {
    const schedule = mortgageFlowSchedule({ instalment: 800, payoff: { kind: 'date', months: 87, date: new Date(2034, 2, 15, 12) } });
    expect(schedule.kind).toBe('schedule');
    if (schedule.kind !== 'schedule') return;
    expect([...schedule.byYear.entries()].sort(([a], [b]) => a - b)).toEqual([[2027, 9_600], [2028, 9_600], [2029, 9_600], [2030, 9_600], [2031, 9_600], [2032, 9_600], [2033, 9_600], [2034, 2_400]]);

    const source: MortgageFlowSource = { propertyName: 'Casa', schedule };
    const linked: DatedFlow = flow({ id: 'link', label: 'Mutuo Casa', kind: 'expense', amount: 1, start: inYear(0), source: { kind: 'mortgage', propertyId: 'casa' } });
    const { resolved } = resolveDatedFlows([linked], { currentYear: YEAR, mortgages: new Map([['casa', source]]) });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ indexed: false, inCashflowToday: true, amount: 9_600 });
    const flows = buildFlowSchedule(resolved, { inflationRate: PI, planExpensesFromCashflow: true });
    expect(flows.horizon(0)).toBe(8);
  });

  it('should exclude a mortgage that never ends or has no instalment, with the reason', () => {
    const linked: DatedFlow = flow({ id: 'link', label: 'Mutuo Casa', kind: 'expense', amount: 1, start: inYear(0), source: { kind: 'mortgage', propertyId: 'casa' } });
    expect(mortgageFlowSchedule({ instalment: 100, payoff: { kind: 'never' } })).toEqual({ kind: 'never' });
    expect(mortgageFlowSchedule({ instalment: null, payoff: null })).toEqual({ kind: 'none' });
    const never = resolveDatedFlows([linked], { currentYear: YEAR, mortgages: new Map([['casa', { propertyName: 'Casa', schedule: { kind: 'never' } }]]) });
    expect(never.excluded[0].reason).toBe('la rata non copre gli interessi: il mutuo non finisce');
    const none = resolveDatedFlows([linked], { currentYear: YEAR, mortgages: new Map() });
    expect(none.excluded[0].reason).toContain('nessuna rata collegata');
  });
});

describe('F22 — validation', () => {
  const ok = flow({ kind: 'expense', amount: 5_000, start: inYear(1), durationYears: 3 });
  it('should accept a sound flow, and an expense that falls (negative)', () => {
    expect(validateDatedFlow(ok, YEAR)).toBeNull();
    expect(validateDatedFlow({ ...ok, amount: -2_000 }, YEAR)).toBeNull();
  });

  it.each<[string, Partial<DatedFlow>]>([
    ['fixed amount without an end', { indexed: false, durationYears: null }],
    ['FIRE anchor on a lump', { kind: 'lumpIn', start: { anchor: 'fire', afterYears: 0 } }],
    ['amount zero', { amount: 0 }],
    ['negative income', { kind: 'income', amount: -100 }],
    ['duration zero', { durationYears: 0 }],
    ['year out of range', { start: { anchor: 'year', year: YEAR + 101 } }],
    ['age out of range', { start: { anchor: 'age', age: 121 } }],
    ['afterYears out of range', { start: { anchor: 'fire', afterYears: 51 } }],
  ])('should reject %s', (_name, patch) => {
    expect(validateDatedFlow({ ...ok, ...patch }, YEAR)).not.toBeNull();
  });

  it('should reject more than 20 flows', () => {
    expect(validateDatedFlows(Array.from({ length: 21 }, (_, index) => ({ ...ok, id: String(index) })), YEAR)).not.toBeNull();
    expect(validateDatedFlows(Array.from({ length: 20 }, (_, index) => ({ ...ok, id: String(index) })), YEAR)).toBeNull();
  });
});
