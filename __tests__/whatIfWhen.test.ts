/**
 * What If «Quando» (doc/fire-ipotesi/README.md § 12, task F3): RF11 and criterion F20.
 *
 * Example of § 12.9: capital 400.000 €, expenses 30.000 €, saving 20.000 € indexed, one scenario g = 7%, π = 2%,
 * SWR 4%. An event of year 0 is the perturbation of before; an event of a later year is laid over the saved flows on
 * the «dopo» side only.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { calculateFIREProjection } from '@/lib/services/fireService';
import {
  buildEventFlows,
  calculateWhatIfImpact,
  maxEventYear,
  parseWhenYear,
  resolveEventYearsAhead,
  WHAT_IF_HORIZON_YEARS,
} from '@/lib/services/whatIfService';
import { resolveDatedFlows, type DatedFlowsInput } from '@/lib/utils/datedFlows';
import { summarizeWhatIfEvent } from '@/lib/utils/whatIfSummary';
import { buildWhatIfVerdict, describeEvent, describeEventFooter } from '@/lib/utils/whatIfNarrative';
import type { DatedFlow, FIREProjectionScenarios } from '@/types/assets';
import type { WhatIfBaseline, WhatIfScenario } from '@/types/whatIf';
import { summarizeWhatIf } from '@/lib/utils/whatIfSummary';
import type { NarrativeSegment } from '@/lib/utils/narrative';

const YEAR = 2026;
const SCENARIO = { growthRate: 7, inflationRate: 2 };
const SCENARIOS: FIREProjectionScenarios = { bear: SCENARIO, base: SCENARIO, bull: SCENARIO };
const plain = (segments: NarrativeSegment[]) => segments.map((segment) => segment.text).join('');

const CHILD: DatedFlow = {
  id: 'child',
  label: 'Figlio',
  kind: 'expense',
  amount: 6_000,
  indexed: true,
  start: { anchor: 'year', year: YEAR + 2 },
  durationYears: 20,
};
const savedFlows = (flows: DatedFlow[]): DatedFlowsInput => ({
  resolved: resolveDatedFlows(flows, { currentYear: YEAR }).resolved,
  planExpensesFromCashflow: true,
});

function makeBaseline(overrides: Partial<WhatIfBaseline> = {}): WhatIfBaseline {
  return {
    netWorth: 400_000,
    liquidNetWorth: 400_000,
    illiquidNetWorth: 0,
    annualExpenses: 30_000,
    annualSavings: 20_000,
    annualIncome: 50_000,
    indexSavings: true,
    withdrawalRate: 4,
    scenarios: SCENARIOS,
    coast: null,
    currentYear: YEAR,
    ...overrides,
  };
}

const jobLoss = (whenYear?: number): WhatIfScenario => ({ eventType: 'jobLoss', monthsWithoutIncome: 6, lostAnnualIncome: 40_000, whenYear });

describe('«Quando» — which year', () => {
  it('should read a typed year as a calendar year, today when blank, past or text, and hold it at the horizon', () => {
    expect(parseWhenYear('', YEAR)).toBeNull();
    expect(parseWhenYear('abc', YEAR)).toBeNull();
    expect(parseWhenYear('2026', YEAR)).toBeNull();
    expect(parseWhenYear('2020', YEAR)).toBeNull();
    expect(parseWhenYear('2029', YEAR)).toBe(2029);
    expect(parseWhenYear('3000', YEAR)).toBe(maxEventYear(YEAR));
  });

  it('should turn the year into years ahead, 0 for today', () => {
    expect(resolveEventYearsAhead({ eventType: 'windfall' }, YEAR)).toBe(0);
    expect(resolveEventYearsAhead({ eventType: 'windfall', whenYear: YEAR }, YEAR)).toBe(0);
    expect(resolveEventYearsAhead({ eventType: 'windfall', whenYear: YEAR + 3 }, YEAR)).toBe(3);
    expect(resolveEventYearsAhead({ eventType: 'windfall', whenYear: YEAR + 500 }, YEAR)).toBe(WHAT_IF_HORIZON_YEARS);
  });
});

describe('F20 — job loss, today against year 3', () => {
  it('should leave a year-0 event exactly as before the task (no «Quando», or the running year)', () => {
    const before = calculateWhatIfImpact(makeBaseline(), jobLoss());
    const sameYear = calculateWhatIfImpact(makeBaseline(), jobLoss(YEAR));
    expect(sameYear).toEqual(before);
    expect(before.yearsAhead).toBe(0);
    // (24000 + 12000) → here 40.000 lost for 6 months = 20.000 out of today's capital.
    expect(before.adjusted.netWorth).toBe(380_000);
  });

  it('should make the «dopo» side the walk with a lump out of 20.000·1,02³ = 21.224,16 € in year 3', () => {
    const impact = calculateWhatIfImpact(makeBaseline(), jobLoss(YEAR + 3));
    expect(impact.yearsAhead).toBe(3);
    // Today's inputs are untouched: the hit has not happened yet.
    expect(impact.adjusted.netWorth).toBe(400_000);

    const hit = [{ id: 'x', label: 'x', kind: 'lumpOut' as const, sigma: 0 as const, indexed: true, amount: 20_000, anchor: 'fixed' as const, start: 3, durationYears: null, inCashflowToday: false }];
    const expected = calculateFIREProjection(400_000, 30_000, 20_000, 4, SCENARIOS, WHAT_IF_HORIZON_YEARS, undefined, undefined, true, { resolved: hit, planExpensesFromCashflow: true });
    expect(impact.projections.after?.yearlyData).toEqual(expected.yearlyData);
    const gap = (impact.projections.before?.yearlyData[2].baseNetWorth ?? 0) - (impact.projections.after?.yearlyData[2].baseNetWorth ?? 0);
    expect(gap).toBeCloseTo(20_000 * 1.02 ** 3, 0);
    expect(buildEventFlows(makeBaseline(), jobLoss(YEAR + 3), 3)[0].amount).toBe(20_000);
  });

  it('should take 30.000 € of a car out of the capital of year 3: 523.715 € against 555.551 € (F12)', () => {
    const impact = calculateWhatIfImpact(makeBaseline(), { eventType: 'majorPurchase', lumpSumAmount: 30_000, whenYear: YEAR + 3 });
    expect(impact.projections.before?.yearlyData[2].baseNetWorth).toBe(555_551);
    expect(impact.projections.after?.yearlyData[2].baseNetWorth).toBe(523_715);
  });

  it('should put a windfall of a later year into the walk, and bring the FIRE year closer', () => {
    const impact = calculateWhatIfImpact(makeBaseline(), { eventType: 'windfall', lumpSumAmount: 100_000, whenYear: YEAR + 5 });
    expect(impact.fire.yearsToFIRE.before).toBe(8);
    expect(impact.fire.yearsToFIRE.after as number).toBeLessThan(8);
  });
});

describe('F20 — cashflow change from a later year', () => {
  it('should lay a saving delta over the saving from that year on, indexed, and leave the earlier years alone (RF3)', () => {
    const impact = calculateWhatIfImpact(makeBaseline(), { eventType: 'cashflowChange', annualSavingsDelta: 5_000, whenYear: YEAR + 2 });
    const before = impact.projections.before?.yearlyData ?? [];
    const after = impact.projections.after?.yearlyData ?? [];
    expect(after[0].baseNetWorth).toBe(before[0].baseNetWorth);
    // Year 2: the delta lands at the end of the year, 5.000·1,02^(2−1).
    expect(after[1].baseNetWorth - before[1].baseNetWorth).toBe(5_100);
    expect(impact.fire.fireNumber.after).toBe(impact.fire.fireNumber.before);
  });

  it('should add an expense delta to the need only, never to the saving (RF4)', () => {
    const impact = calculateWhatIfImpact(makeBaseline(), { eventType: 'cashflowChange', annualExpensesDelta: 6_000, whenYear: YEAR + 2 });
    const before = impact.projections.before?.yearlyData ?? [];
    const after = impact.projections.after?.yearlyData ?? [];
    // Before the FIRE the capital is the same walk: only the requirement moves.
    expect(after[2].baseNetWorth).toBe(before[2].baseNetWorth);
    expect(impact.fire.fireNumber.after as number).toBeGreaterThan(impact.fire.fireNumber.before as number);
    expect(impact.fire.yearsToFIRE.after as number).toBeGreaterThan(impact.fire.yearsToFIRE.before as number);
  });

  it('should build the two flows apart, each with its own scope', () => {
    const flows = buildEventFlows(makeBaseline(), { eventType: 'cashflowChange', annualSavingsDelta: -3_000, annualExpensesDelta: 2_000 }, 4);
    expect(flows.map((flow) => flow.scope)).toEqual(['saving', 'need']);
    expect(buildEventFlows(makeBaseline(), { eventType: 'cashflowChange' }, 4)).toEqual([]);
    expect(buildEventFlows(makeBaseline(), jobLoss(), 0)).toEqual([]);
  });
});

describe('the saved flows are the plan of both sides', () => {
  it('should read the requirement of today with the flows on «prima» (F4: 821.875,46 €) and on «dopo»', () => {
    const baseline = makeBaseline({ flows: savedFlows([CHILD]) });
    const impact = calculateWhatIfImpact(baseline, { eventType: 'windfall', lumpSumAmount: 0 });
    expect(impact.fire.fireNumber.before).toBeCloseTo(821_875.46, 2);
    expect(impact.fire.fireNumber.after).toBeCloseTo(821_875.46, 2);
    expect(impact.fire.yearsToFIRE.before).toBe(10);
  });

  it('should add the later event to the saved flows on the «dopo» side only', () => {
    const baseline = makeBaseline({ flows: savedFlows([CHILD]) });
    const impact = calculateWhatIfImpact(baseline, { eventType: 'majorPurchase', lumpSumAmount: 30_000, whenYear: YEAR + 3 });
    // F9 on top of F4: the car lifts the number of today by 30.000/(1+r)^3.
    const r = 1.07 / 1.02 - 1;
    expect(impact.fire.fireNumber.before).toBeCloseTo(821_875.46, 2);
    expect(impact.fire.fireNumber.after).toBeCloseTo(821_875.46 + 30_000 / (1 + r) ** 3, 2);
  });

  it('should leave the walk without flows byte-identical when none are saved', () => {
    const plainImpact = calculateWhatIfImpact(makeBaseline(), { eventType: 'windfall', lumpSumAmount: 50_000 });
    const emptyImpact = calculateWhatIfImpact(makeBaseline({ flows: { resolved: [], planExpensesFromCashflow: true } }), { eventType: 'windfall', lumpSumAmount: 50_000 });
    expect(emptyImpact).toEqual(plainImpact);
  });

  it('should read the Coast plan with the later event: a windfall before the target age lowers the number of today', () => {
    const coast = { currentAge: 35, retirementAge: 50, annualExpenses: 30_000, realReturnRate: 4.901961, inflationRate: 2, pensions: [], taxBrackets: [] };
    const impact = calculateWhatIfImpact(makeBaseline({ coast }), { eventType: 'windfall', lumpSumAmount: 100_000, whenYear: YEAR + 5 });
    expect(impact.coast?.coastFireNumberToday.after as number).toBeLessThan(impact.coast?.coastFireNumberToday.before as number);
  });
});

describe('«Quando» in the words', () => {
  const baseline = makeBaseline();
  const read = (scenario: WhatIfScenario) => {
    const impact = calculateWhatIfImpact(baseline, scenario);
    const event = summarizeWhatIfEvent(scenario, baseline, impact.adjusted);
    const summary = summarizeWhatIf(impact, baseline, YEAR, WHAT_IF_HORIZON_YEARS);
    return { impact, event, summary };
  };

  it('should state no calendar year for an event of today and the year for a later one', () => {
    expect(read(jobLoss()).event.calendarYear).toBeNull();
    const later = read(jobLoss(YEAR + 3));
    expect(later.event.calendarYear).toBe(YEAR + 3);
    expect(later.event.hitToday).toBe(20_000);
    expect(later.event.netWorthDelta).toBe(0);
  });

  it('should name the year in the verdict only when it is not today', () => {
    const today = read(jobLoss());
    const later = read(jobLoss(YEAR + 3));
    const todayText = plain(buildWhatIfVerdict({ hasBaseline: true, event: today.event, summary: today.summary }).sentence);
    const laterText = plain(buildWhatIfVerdict({ hasBaseline: true, event: later.event, summary: later.summary }).sentence);
    expect(todayText).not.toContain('nel 2029');
    expect(laterText.replace(/\u2019/g, "'").replace(/\u00a0/g, " ")).toContain("6 mesi senza 40.000 € l'anno di entrate (l'80% del reddito) nel 2029");
    // The capital of today does not move for an event of 2029: no «il patrimonio FIRE scende» clause.
    expect(laterText).not.toContain('il patrimonio FIRE scende');
  });

  it('should read the later event in euros of today and say the capital waits', () => {
    const later = read({ eventType: 'majorPurchase', lumpSumAmount: 30_000, whenYear: YEAR + 4 });
    expect(plain(describeEvent(later.event))).toContain('Acquisto importante nel 2030');
    expect(plain(describeEvent(later.event))).toContain('di oggi escono dal patrimonio in quell\'anno');
    expect(plain(describeEventFooter({ kind: 'majorPurchase', calendarYear: 2030, referenceYear: null, isAnnualized: false }))).toBe(
      "L'evento è applicato nel 2030 e non viene salvato: è un'esplorazione.",
    );
  });
});
