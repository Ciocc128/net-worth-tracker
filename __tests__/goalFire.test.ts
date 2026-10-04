/**
 * Goals inside the FIRE plan (doc/fire-ipotesi/README.md § 13, task O1): RO1 (the goal as a dated flow), RO2 (its effect on
 * the FIRE year). Criteria G1–G7 on the common example of § 12.9: capital 400.000 €, plan expenses 30.000 € from the Cashflow,
 * saving 20.000 € indexed, g = 7%, π = 2% (r = 4,901961%), SWR 4%, year 2026. Reference values:
 * `/mnt/project-files/fire-simulazioni/p8-controllo.py`. Tolerance ± 0,01 €.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Asset, FIREProjectionScenarios } from '@/types/assets';
import type { GoalAssetAssignment, InvestmentGoal } from '@/types/goals';
import type { WhatIfBaseline } from '@/types/whatIf';
import { assetInsideShare, buildFlowSchedule, resolveGoalFlows, type DatedFlowsInput, type ResolveGoalFlowsContext } from '@/lib/utils/datedFlows';
import { goalFireEffect, goalFireNarrative } from '@/lib/utils/goalFire';
import { calculateCoastFIREMetrics, calculateFIREProjection, resolveFireRequirement } from '@/lib/services/fireService';
import { realReturn } from '@/lib/utils/realReturn';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

const YEAR = 2026;
const G = 7;
const PI = 2;
const SCENARIO = { growthRate: G, inflationRate: PI };
const SCENARIOS: FIREProjectionScenarios = { bear: SCENARIO, base: SCENARIO, bull: SCENARIO };

const goal = (partial: Partial<InvestmentGoal> & Pick<InvestmentGoal, 'id'>): InvestmentGoal => ({
  name: partial.id,
  priority: 'alta',
  color: '#3B82F6',
  countsInFire: true,
  createdAt: new Date(YEAR, 0, 1),
  updatedAt: new Date(YEAR, 0, 1),
  ...partial,
});
const HOUSE = goal({ id: 'house', name: 'Acquisto Casa', targetAmount: 50_000, targetDate: '2029-06-30' });
const CAR = goal({ id: 'car', name: 'Auto', targetAmount: 30_000, targetDate: '2028-03-15' });

const context = (overrides: Partial<ResolveGoalFlowsContext> = {}): ResolveGoalFlowsContext => ({ currentYear: YEAR, assetValue: () => null, ...overrides });
const resolve = (goals: InvestmentGoal[], assignments: GoalAssetAssignment[] = [], ctx = context()) => resolveGoalFlows(goals, assignments, ctx);

const requirement = (flows: DatedFlowsInput['resolved']): number =>
  resolveFireRequirement({
    annualExpenses: 30_000,
    withdrawalRate: 4,
    scenario: SCENARIO,
    yearsElapsed: 0,
    flows: buildFlowSchedule(flows, { inflationRate: PI, planExpensesFromCashflow: true }),
  }).requirement;
const fireYear = (flows: DatedFlowsInput['resolved'], netWorth = 400_000) =>
  calculateFIREProjection(netWorth, 30_000, 20_000, 4, SCENARIOS, 50, undefined, undefined, true, { resolved: flows, planExpensesFromCashflow: true }).baseYearsToFIRE;

const baseline = (flows?: DatedFlowsInput): WhatIfBaseline => ({
  netWorth: 400_000,
  liquidNetWorth: 400_000,
  illiquidNetWorth: 0,
  annualExpenses: 30_000,
  annualSavings: 20_000,
  indexSavings: true,
  withdrawalRate: 4,
  scenarios: SCENARIOS,
  coast: null,
  flows,
  currentYear: YEAR,
});

describe('G1 — a goal that does not count changes nothing', () => {
  it('should give no flow for a goal with the switch off or absent', () => {
    expect(resolve([{ ...HOUSE, countsInFire: false }, { ...CAR, countsInFire: undefined }])).toEqual({ resolved: [], excluded: [] });
    expect(requirement([])).toBeCloseTo(750_000, 2);
    expect(fireYear([])).toBe(8);
  });
});

describe('G2–G5 — RO1: the goal as a lump out', () => {
  it('G2: the house of 50.000 € in June 2029 is a fixed lump at year 3; requirement 790.814,89 €, FIRE 2035', () => {
    const { resolved } = resolve([HOUSE]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ kind: 'lumpOut', sigma: 0, indexed: false, amount: 50_000, anchor: 'fixed', start: 3, durationYears: null, inCashflowToday: false, source: { kind: 'goal', goalId: 'house' }, label: 'Acquisto Casa' });
    expect(requirement(resolved)).toBeCloseTo(790_814.89, 2);
    expect(YEAR + (fireYear(resolved) as number)).toBe(2035);
  });

  it('G3: 20.000 € of the house sit outside the capital: A = 30.000, requirement 774.488,94 €, FIRE 2035', () => {
    const asset = { id: 'conto' } as Asset;
    const outside = resolve([HOUSE], [{ goalId: 'house', assetId: 'conto', percentage: 100 }], context({ assetValue: () => 20_000, insideShare: () => 0 }));
    expect(outside.resolved[0].amount).toBeCloseTo(30_000, 2);
    expect(requirement(outside.resolved)).toBeCloseTo(774_488.94, 2);
    expect(YEAR + (fireYear(outside.resolved) as number)).toBe(2035);
    // A half-inside instrument and an assignment of 50% of it.
    const half = resolve([HOUSE], [{ goalId: 'house', assetId: asset.id, percentage: 50 }], context({ assetValue: () => 40_000, insideShare: () => 0.5 }));
    expect(half.resolved[0].amount).toBeCloseTo(50_000 - 40_000 * 0.5 * 0.5, 2);
  });

  it('G4: a deadline in the running year takes the lump out of the starting capital: 350.000 € and FIRE 2035', () => {
    const { resolved } = resolve([{ ...HOUSE, targetDate: '2026-11-01' }]);
    expect(resolved[0].start).toBe(0);
    expect(requirement(resolved)).toBeCloseTo(750_000, 2);
    expect(YEAR + (fireYear(resolved) as number)).toBe(2035);
    // The same capital as «350.000 € and no flow»: the lump of year 0 leaves before the walk starts.
    expect(fireYear([], 350_000)).toBe(fireYear(resolved));
  });

  it('G5: the car of 30.000 € in 2028 and the house in 2029: requirement 817.018,06 €, FIRE 2036', () => {
    const { resolved } = resolve([CAR, HOUSE]);
    const R = realReturn(G, PI) / 100;
    expect(requirement(resolved)).toBeCloseTo(750_000 + 30_000 / 1.02 ** 2 / (1 + R) ** 2 + 50_000 / 1.02 ** 3 / (1 + R) ** 3, 2);
    expect(requirement(resolved)).toBeCloseTo(817_018.06, 2);
    expect(YEAR + (fireYear(resolved) as number)).toBe(2036);
  });
});

describe('G6 — RO1: the goals that cannot be placed say why', () => {
  it('should exclude with the reason of each case', () => {
    const result = resolve([
      { ...HOUSE, id: 'past', targetDate: '2025-12-31' },
      { ...HOUSE, id: 'nodate', targetDate: undefined },
      { ...HOUSE, id: 'noamount', targetAmount: undefined },
      { ...HOUSE, id: 'allout' },
      { ...HOUSE, id: 'off', countsInFire: false },
    ], [{ goalId: 'allout', assetId: 'a', percentage: 100 }], context({ assetValue: () => 80_000, insideShare: () => 0 }));
    expect(result.resolved).toEqual([]);
    expect(Object.fromEntries(result.excluded.map((entry) => [entry.id, entry.reason]))).toEqual({
      past: 'scadenza passata',
      nodate: 'manca la scadenza',
      noamount: "manca l'importo",
      allout: 'tutto fuori dal capitale FIRE',
    });
  });

  it('should read the share of an instrument inside the capital from its legs', () => {
    const legShare = (_asset: Asset, index: number) => (index === 0 ? 1 : 0);
    const composite = { id: 'mix', composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'realestate', percentage: 40 }] } as unknown as Asset;
    expect(assetInsideShare(composite, 1_000, legShare)).toBeCloseTo(0.6, 10);
    expect(assetInsideShare({ id: 'one' } as Asset, 1_000, () => 0.25)).toBe(0.25);
    expect(assetInsideShare({ id: 'zero' } as Asset, 0, () => 1)).toBe(0);
  });
});

describe('G7 — Coast reads the goal as a lump before the target age', () => {
  it('should take the Coast number of today from 365.853,47 € to 406.668,36 € with the house of G2', () => {
    const { resolved } = resolve([HOUSE]);
    const coast = (flows?: DatedFlowsInput) => calculateCoastFIREMetrics(100_000, 30_000, 4, 35, 50, realReturn(G, PI), PI, [], undefined, new Date(YEAR, 0, 1), undefined, undefined, flows).coastFireNumberToday;
    expect(coast()).toBeCloseTo(365_853.47, 2);
    expect(coast({ resolved, planExpensesFromCashflow: true })).toBeCloseTo(406_668.36, 2);
  });
});

describe('RO2 — the effect on the FIRE year', () => {
  const house = (overrides: Partial<InvestmentGoal> = {}) => goalFireEffect({ goal: { ...HOUSE, ...overrides }, assignments: [], goalContext: context(), baseline: baseline(), hasPlan: true });

  it('a goal that does not count: «Se la contassi nel FIRE: 2035 invece che 2034», the plan untouched', () => {
    const effect = house({ countsInFire: false });
    expect(effect).toMatchObject({ kind: 'effect', counted: false, yearWith: 2035, yearWithout: 2034 });
    expect(goalFireNarrative(effect!)).toBe('Se la contassi nel FIRE: 2035 invece che 2034.');
  });

  it('a goal that counts, on a plan that already carries it: 2035 against 2034', () => {
    const { resolved } = resolve([HOUSE]);
    const effect = goalFireEffect({ goal: HOUSE, assignments: [], goalContext: context(), baseline: baseline({ resolved, planExpensesFromCashflow: true }), hasPlan: true });
    expect(effect).toMatchObject({ kind: 'effect', counted: true, yearWith: 2035, yearWithout: 2034 });
    expect(goalFireNarrative(effect!)).toBe('Con questa spesa il FIRE è nel 2035 invece che nel 2034 (scenario Base).');
  });

  it('a spend that does not move the year says so', () => {
    const effect = house({ targetAmount: 100, countsInFire: false });
    expect(goalFireNarrative(effect!)).toBe('Se la contassi nel FIRE l’anno non cambierebbe (2034).');
    const { resolved } = resolve([{ ...HOUSE, targetAmount: 100 }]);
    const counted = goalFireEffect({ goal: { ...HOUSE, targetAmount: 100 }, assignments: [], goalContext: context(), baseline: baseline({ resolved, planExpensesFromCashflow: true }), hasPlan: true });
    expect(goalFireNarrative(counted!)).toBe('Questa spesa non sposta l’anno FIRE (2034, scenario Base).');
  });

  it('the plan\'s other flows stay in both runs', () => {
    // The car counts and the plan carries it; the house does not count yet: with it, G5's 2036; without it, the car alone.
    const car = resolve([CAR]).resolved;
    const notCounted = goalFireEffect({ goal: { ...HOUSE, countsInFire: false }, assignments: [], goalContext: context(), baseline: baseline({ resolved: car, planExpensesFromCashflow: true }), hasPlan: true });
    expect(notCounted).toMatchObject({ kind: 'effect', counted: false, yearWith: 2036, yearWithout: YEAR + (fireYear(car) as number) });
    // The house counts and the plan carries both: removing it leaves the car, the same figure.
    const both = resolve([CAR, HOUSE]).resolved;
    const counted = goalFireEffect({ goal: HOUSE, assignments: [], goalContext: context(), baseline: baseline({ resolved: both, planExpensesFromCashflow: true }), hasPlan: true });
    expect(counted).toMatchObject({ kind: 'effect', counted: true, yearWith: 2036, yearWithout: YEAR + (fireYear(car) as number) });
  });

  it('an excluded goal gives its reason, no plan gives no figure, a goal without amount or deadline that does not count gives nothing', () => {
    expect(goalFArea(house({ targetDate: '2024-01-01' }))).toBe('Non conta nel FIRE: scadenza passata.');
    expect(goalFireEffect({ goal: HOUSE, assignments: [], goalContext: context(), baseline: baseline(), hasPlan: false })).toEqual({ kind: 'noPlan' });
    expect(goalFireNarrative({ kind: 'noPlan' })).toBe('Per l’effetto sul FIRE servono spesa e SWR nel Calcolatore.');
    expect(house({ countsInFire: false, targetDate: undefined })).toBeNull();
    expect(house({ countsInFire: true, targetDate: undefined })).toEqual({ kind: 'excluded', reason: 'manca la scadenza' });
  });

  it('a year beyond the horizon reads «oltre il 2076»', () => {
    expect(goalFireNarrative({ kind: 'effect', counted: true, yearWith: null, yearWithout: 2034, horizonYear: 2076 })).toBe('Con questa spesa il FIRE è oltre il 2076 invece che nel 2034 (scenario Base).');
  });
});

function goalFArea(effect: ReturnType<typeof goalFireEffect>): string {
  return goalFireNarrative(effect!);
}
