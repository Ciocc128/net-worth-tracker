/**
 * Coast — the Traguardo's three stages and the Afflussi's dated flows (doc/fire-ipotesi/README.md § 17, task CO1):
 * reference values CO1–CO11 of § 17.8. Example of § 12.9: 1 January 2026, age 35, target 50 (`T` = 15), g = 7%, π = 2%,
 * spending 30.000 €, SWR 4%, no tax, one «Pensione INPS» of 1.500 € gross × 13 from 1 January 2058. Tolerance ± 0,01 €.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));

import type { DatedFlow, FIREProjectionScenarios } from '@/types/assets';
import { resolveDatedFlows } from '@/lib/utils/datedFlows';
import {
  buildCoastInflowEvents,
  buildCoastVerdict,
  describeCoastInflows,
  describeCoastRegimeMethod,
  describeCoastTargetCaption,
  describeCoastTargetFooter,
  summarizeCoastPensions,
  summarizeCoastTarget,
  type CoastDatedFlowsInput,
} from '@/lib/utils/coastFireView';
import { INACTIVE_LOCK } from '@/lib/utils/fireSummary';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import { calculateCoastFIREMetrics, calculateCoastFIREProjection, getDefaultCoastFireTaxBrackets, type FireFlowsInput } from '@/lib/services/fireService';
import { realReturn } from '@/lib/utils/realReturn';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

const YEAR = 2026;
const G = 7;
const PI = 2;
const RATE = realReturn(G, PI);
const SCENARIO = { growthRate: G, inflationRate: PI };
const SCENARIOS: FIREProjectionScenarios = { bear: SCENARIO, base: SCENARIO, bull: SCENARIO };
const START = new Date(YEAR, 0, 1);
const PENSION = [{ id: 'inps', label: 'Pensione INPS', grossMonthlyAmount: 1500, monthsPerYear: 13, startDate: '2058-01-01' }];
const BRACKETS = getDefaultCoastFireTaxBrackets();

const flow = (partial: Partial<DatedFlow> & Pick<DatedFlow, 'kind' | 'amount' | 'start'>): DatedFlow => ({
  id: partial.id ?? partial.kind,
  label: partial.label ?? partial.kind,
  indexed: true,
  durationYears: null,
  ...partial,
});
const inYear = (offset: number) => ({ anchor: 'year', year: YEAR + offset }) as const;
const INHERITANCE = flow({ id: 'inheritance', label: 'Eredità', kind: 'lumpIn', amount: 100_000, indexed: false, start: inYear(10) });
const RENT = flow({ id: 'rent', label: 'Affitto', kind: 'income', amount: 6_000, start: { anchor: 'fire', afterYears: 0 } });
const CHILD = flow({ id: 'child', label: 'Figlio', kind: 'expense', amount: 6_000, start: inYear(2), durationYears: 20 });
const CAR = flow({ id: 'car', label: 'Auto', kind: 'lumpOut', amount: 30_000, indexed: false, start: inYear(3) });
const MORTGAGE = flow({ id: 'mortgage', label: 'Mutuo', kind: 'expense', amount: 9_600, indexed: false, start: inYear(0), durationYears: 9, inCashflowToday: true });

const flowsInput = (flows: DatedFlow[]): FireFlowsInput => ({ resolved: resolveDatedFlows(flows, { currentYear: YEAR }).resolved, planExpensesFromCashflow: true });

function run(netWorth: number, options: { pensions?: typeof PENSION; flows?: DatedFlow[]; fund?: { yearsFromNow: number; amountToday: number }[] } = {}) {
  const pensions = options.pensions ?? PENSION;
  const flows = options.flows ? flowsInput(options.flows) : undefined;
  const metrics = calculateCoastFIREMetrics(netWorth, 30_000, 4, 35, 50, RATE, PI, pensions, BRACKETS, START, options.fund, undefined, flows, RATE);
  const projection = calculateCoastFIREProjection(netWorth, 30_000, 4, 35, 50, SCENARIOS, pensions, BRACKETS, START, options.fund, undefined, flows);
  return { metrics, projection, flows };
}

const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');
const euro = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true).replace(/ /g, ' ');

describe('CO1–CO3 — the stages', () => {
  it('CO1 should give the three stages of a plan that is not there yet', () => {
    const { metrics, projection } = run(200_000);
    expect(metrics.coastFireNumberToday).toBeCloseTo(285_306.37, 2);
    expect(metrics.retirementCapitalRequired).toBeCloseTo(584_878.37, 2);
    expect(metrics.capitalAtRetirementOnCourse).toBeCloseTo(410_000.22, 2);
    expect(metrics.capitalAtRetirementOnCourse).toBeCloseTo(metrics.futureValueAtRetirementWithoutNewContributions, 6);
    expect(metrics.regimeYears).toBe(17);
    expect(metrics.regimeCapitalRequired).toBeCloseTo(550_816.12, 2);
    expect(metrics.regimeCapitalRequired).toBeCloseTo(metrics.steadyStatePortfolioNeed, 6);
    expect(metrics.capitalAtRegimeOnCourse).toBeCloseTo(156_307.16, 2);
    // The chart's own Base series at the target age is the stage's figure.
    expect(projection.scenarios.base.capitalAtRetirementOnCourse).toBeCloseTo(projection.projectionData.at(-1)!.basePortfolioValue, 2);

    const target = summarizeCoastTarget(metrics as never, { currentNetWorth: 200_000, liquidNetWorth: 0, currentAge: 35, retirementAge: 50, isBridge: false, currentYear: YEAR, withdrawalRate: 4 });
    expect(target.stages.map((stage) => stage.label)).toEqual(['Oggi', 'A 50 anni · 2041', 'A regime · dal 2058']);
    expect(target.stages.map((stage) => Math.round(stage.shortfall * 100) / 100)).toEqual([85_306.37, 174_878.16, 394_508.96]);
    expect(target.stages.every((stage) => !stage.enough)).toBe(true);
  });

  it('CO2 should be the same capital as running 410.000,22 € forward, paying 30.000 € at each year-end', () => {
    let capital = 410_000.22;
    for (let year = 0; year < 17; year++) capital = capital * (1 + RATE / 100) - 30_000;
    expect(capital).toBeCloseTo(run(200_000).metrics.capitalAtRegimeOnCourse, 1);
  });

  it('CO3 should say «basta» three times with 300.000 €', () => {
    const { metrics } = run(300_000);
    expect(metrics.capitalAtRetirementOnCourse).toBeCloseTo(615_000.32, 2);
    expect(metrics.capitalAtRegimeOnCourse).toBeCloseTo(618_768.45, 2);
    const target = summarizeCoastTarget(metrics as never, { currentNetWorth: 300_000, liquidNetWorth: 0, currentAge: 35, retirementAge: 50, isBridge: false, currentYear: YEAR });
    expect(target.stages.every((stage) => stage.enough)).toBe(true);
  });

  it('CO4 should read the inheritance in the stage, the chart and the verdict alike', () => {
    const { metrics, projection } = run(200_000, { flows: [INHERITANCE] });
    expect(metrics.coastFireNumberToday).toBeCloseTo(234_471.44, 2);
    expect(metrics.capitalAtRetirementOnCourse).toBeCloseTo(514_211.87, 2);
    expect(projection.scenarios.base.capitalAtRetirementOnCourse).toBeCloseTo(projection.projectionData.at(-1)!.basePortfolioValue, 2);
    expect(metrics.regimeCapitalRequired).toBeCloseTo(550_816.12, 2);
    expect(metrics.capitalAtRegimeOnCourse).toBeCloseTo(391_399.03, 2);

    const target = summarizeCoastTarget(projection.scenarios.base, { currentNetWorth: 200_000, liquidNetWorth: 0, currentAge: 35, retirementAge: 50, isBridge: false, currentYear: YEAR });
    const verdict = buildCoastVerdict({ target, incompleteReason: null, pace: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).toContain(`arriveresti a 50 anni con ${euro(514_211.87)} di oggi`);
  });

  it('CO5 should read a rent after the target into the steady-state stage', () => {
    const { metrics } = run(200_000, { flows: [RENT] });
    expect(metrics.coastFireNumberToday).toBeCloseTo(219_631.02, 2);
    expect(metrics.retirementCapitalRequired).toBeCloseTo(450_243.83, 2);
    expect(metrics.capitalAtRetirementOnCourse).toBeCloseTo(410_000.22, 2);
    expect(metrics.regimeCapitalRequired).toBeCloseTo(402_105.84, 2);
    expect(metrics.capitalAtRegimeOnCourse).toBeCloseTo(311_319.96, 2);
  });

  it('CO6 should leave the numbers of the locked fund as they were and keep H at 17', () => {
    const { metrics } = run(200_000, { fund: [{ yearsFromNow: 25, amountToday: 40_000 }] });
    expect(metrics.coastFireNumberToday).toBeCloseTo(245_306.37, 2);
    expect(metrics.retirementCapitalRequired).toBeCloseTo(502_878.33, 2);
    expect(metrics.regimeYears).toBe(17);
  });

  it('CO7 should have no steady-state stage and no event without pensions, fund or flows', () => {
    const { metrics, projection } = run(200_000, { pensions: [] as never });
    expect(metrics.regimeYears).toBe(0);
    const target = summarizeCoastTarget(projection.scenarios.base, { currentNetWorth: 200_000, liquidNetWorth: 0, currentAge: 35, retirementAge: 50, isBridge: false, currentYear: YEAR });
    expect(target.stages.map((stage) => stage.key)).toEqual(['today', 'target']);
    expect(buildCoastInflowEvents([], [], YEAR, 35)).toEqual([]);
    const footer = describeCoastTargetFooter({ retirementAge: 50, requiredNet: 1, lastTargetOnPlot: 1, lock: INACTIVE_LOCK, lastProjectedYear: 2041, pace: null, noInflows: true });
    expect(plain(footer)).toMatch(/ Nessun afflusso dopo il target: il portafoglio sostiene da solo tutta la spesa anche dopo i 50 anni\.$/);
  });

  it('CO8 should draw no strip at the target age with no bridge', () => {
    const projection = calculateCoastFIREProjection(500_000, 30_000, 4, 50, 50, SCENARIOS, [], BRACKETS, START);
    const target = summarizeCoastTarget(projection.scenarios.base, { currentNetWorth: 500_000, liquidNetWorth: 0, currentAge: 50, retirementAge: 50, isBridge: false, currentYear: YEAR });
    expect(target.stages).toHaveLength(1);
  });

  it('should caption the chip with the liquid read alone, and the method line say what «a regime» is', () => {
    const { projection } = run(200_000);
    const target = summarizeCoastTarget(projection.scenarios.base, { currentNetWorth: 200_000, liquidNetWorth: 100_000, currentAge: 35, retirementAge: 50, isBridge: false, currentYear: YEAR, withdrawalRate: 4 });
    expect(plain(describeCoastTargetCaption(target))).toMatch(/^[\d,]+% con i soli liquidi$/);
    expect(plain(describeCoastRegimeMethod(target))).toBe("A regime: spesa meno tutte le pensioni, diviso lo SWR del 4%, nel 2058. Non è il numero FIRE del Calcolatore, che vale all'anno FIRE.");
    expect(plain(describeCoastRegimeMethod({ ...target, hasDatedFlows: true }))).toContain(', più i flussi datati dopo il 2058.');
  });
});

describe('CO9–CO10 — the events the number counts', () => {
  const datedInput = (flows: DatedFlow[]): CoastDatedFlowsInput => ({
    resolved: resolveDatedFlows(flows, { currentYear: YEAR }).resolved,
    inflationRate: PI,
    retirementYears: 15,
    retirementAge: 50,
  });

  it('CO9 should list lumps from next year and each recurring flow from the first year counted, signed, in today\'s euro', () => {
    const events = buildCoastInflowEvents([], [], YEAR, 35, datedInput([INHERITANCE, RENT, CHILD, CAR]));
    expect(events.map((event) => [event.title, event.year])).toEqual([
      ['Auto', 2029],
      ['Eredità', 2036],
      ['Affitto', 2042],
      ['Figlio', 2042],
    ]);
    const by = Object.fromEntries(events.map((event) => [event.title, event]));
    expect(by['Eredità'].amountValue).toBeCloseTo(82_034.83, 2);
    expect(by['Eredità'].sign).toBe(1);
    expect(by['Auto'].amountValue).toBeCloseTo(28_269.67, 2);
    expect(by['Auto'].amount.startsWith('−')).toBe(true);
    expect(by['Figlio']).toMatchObject({ kind: 'datedOut', amountValue: 6_000, amountCaption: "l'anno", note: 'conta da 51 anni · fino al 2047' });
    expect(by['Affitto']).toMatchObject({ kind: 'datedIn', amountValue: 6_000, note: 'per sempre' });
    expect(by['Affitto'].amount.startsWith('+')).toBe(true);
  });

  it('CO10 should leave out a recurring flow that ends before the target', () => {
    expect(buildCoastInflowEvents([], [], YEAR, 35, datedInput([MORTGAGE]))).toEqual([]);
  });

  it('should read the dated flows into the sentence after the pensions', () => {
    const { projection } = run(200_000, { flows: [INHERITANCE, RENT] });
    const base = projection.scenarios.base;
    const events = buildCoastInflowEvents(base.pensionBreakdown, [], YEAR, 35, datedInput([INHERITANCE, RENT]));
    const sentence = plain(describeCoastInflows(events, summarizeCoastPensions(base, YEAR), 50));
    expect(sentence).toMatch(/^3 voci già contate: dal 2058 la Pensione INPS copre .* netti l'anno; flussi datati: Eredità nel 2036 \(\+82\.035\s€\), Affitto dal 2042 \(\+6\.?000\s€ l'anno\)\.$/);
  });
});

describe('CO11 — no dated flows, nothing existing moves', () => {
  it('should give the same existing fields through an empty list as without one', () => {
    const plainRun = run(200_000);
    const emptyRun = calculateCoastFIREMetrics(200_000, 30_000, 4, 35, 50, RATE, PI, PENSION, BRACKETS, START, undefined, undefined, { resolved: [], planExpensesFromCashflow: true }, RATE);
    expect(emptyRun).toEqual(plainRun.metrics);
    expect(plainRun.metrics.coastFireNumberToday).toBeCloseTo(285_306.37, 2);
  });
});
