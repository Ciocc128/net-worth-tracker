/** «Aggiungi al piano» (doc/fire-ipotesi/README.md § 22): the event as saved dated flows. */
import { describe, expect, it } from 'vitest';
import { eventToDatedFlows } from '@/lib/utils/whatIfToPlan';
import { validateDatedFlows } from '@/lib/utils/datedFlowValidation';
import { resolveDatedFlows } from '@/lib/utils/datedFlows';
import type { WhatIfBaseline, WhatIfScenario } from '@/types/whatIf';

const YEAR = 2026;
const baseline = { annualIncome: 60000, annualExpenses: 30000, annualSavings: 20000 } as WhatIfBaseline;
let n = 0;
const make = (scenario: WhatIfScenario, year = YEAR + 3, fireYear: number | null = null) => eventToDatedFlows(baseline, scenario, year, fireYear, () => `id${n++}`);

describe('eventToDatedFlows', () => {
  it('WP1: a purchase is one lump out at the year', () => {
    const [flow] = make({ eventType: 'majorPurchase', lumpSumAmount: 25000 });
    expect(flow).toMatchObject({ kind: 'lumpOut', amount: 25000, start: { anchor: 'year', year: 2029 } });
  });
  it('WP1: a windfall is a lump in', () => {
    expect(make({ eventType: 'windfall', lumpSumAmount: 10000 })[0]).toMatchObject({ kind: 'lumpIn', amount: 10000 });
  });
  it('WP1: a job loss is the lost income over the months (60.000 × 6/12 = 30.000)', () => {
    expect(make({ eventType: 'jobLoss', monthsWithoutIncome: 6 })[0]).toMatchObject({ kind: 'lumpOut', amount: 30000 });
    expect(make({ eventType: 'jobLoss', monthsWithoutIncome: 6, lostAnnualIncome: 40000 })[0].amount).toBe(20000);
  });
  it('WP2: a cashflow change is up to two recurring flows, indexed, for ever, not in today\'s cashflow', () => {
    const flows = make({ eventType: 'cashflowChange', annualSavingsDelta: 3000, annualExpensesDelta: -1200 });
    expect(flows).toHaveLength(2);
    expect(flows[0]).toMatchObject({ kind: 'income', amount: 3000, indexed: true, durationYears: null, inCashflowToday: false });
    expect(flows[1]).toMatchObject({ kind: 'expense', amount: -1200 });
  });
  it('WP2: a falling savings delta becomes an expense of the same size', () => {
    expect(make({ eventType: 'cashflowChange', annualSavingsDelta: -2000 })[0]).toMatchObject({ kind: 'expense', amount: 2000 });
  });
  it('WP2: the savings voice stops at the FIRE year, the expenses voice does not', () => {
    const flows = make({ eventType: 'cashflowChange', annualSavingsDelta: 3000, annualExpensesDelta: 500 }, YEAR + 3, YEAR + 13);
    expect(flows[0]).toMatchObject({ kind: 'income', durationYears: 10 });
    expect(flows[1]).toMatchObject({ kind: 'expense', durationYears: null });
  });
  it('WP2: an event on or after the FIRE year adds no savings voice', () => {
    expect(make({ eventType: 'cashflowChange', annualSavingsDelta: 3000 }, YEAR + 3, YEAR + 3)).toEqual([]);
    expect(make({ eventType: 'cashflowChange', annualSavingsDelta: 3000, annualExpensesDelta: 500 }, YEAR + 3, YEAR + 2)).toHaveLength(1);
  });
  it('WP3: an event that moves nothing adds nothing', () => {
    expect(make({ eventType: 'majorPurchase', lumpSumAmount: 0 })).toEqual([]);
    expect(make({ eventType: 'cashflowChange', annualSavingsDelta: 0, annualExpensesDelta: 0 })).toEqual([]);
    expect(make({ eventType: 'jobLoss', monthsWithoutIncome: 0 })).toEqual([]);
  });
  it('WP4: every flow passes the plan validation and resolves at the right offset', () => {
    const flows = make({ eventType: 'cashflowChange', annualSavingsDelta: 3000, annualExpensesDelta: 500 }).concat(make({ eventType: 'windfall', lumpSumAmount: 1 }));
    expect(validateDatedFlows(flows, YEAR)).toBeNull();
    const { resolved } = resolveDatedFlows(flows, { currentYear: YEAR, userAge: 40 });
    expect(resolved.map((flow) => flow.start)).toEqual([3, 3, 3]);
  });
});
