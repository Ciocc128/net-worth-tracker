/**
 * Dated flows in the stochastic engines (doc/fire-ipotesi/README.md § 12, task F2): RF7 (Ventaglio), RF8 (Monte Carlo and
 * Spesa sostenibile), RF10 (Proiezione). Criteria F13, F14, F18, F19, F21 and the regression «no flows = the engine of before».
 * Reference values: `/mnt/project-files/fire-simulazioni/p4p5-controllo.py` (closed forms), tolerance ± 0,01 €.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/chartService', () => ({ formatCurrencyCompact: (value: number) => String(Math.round(value)) }));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

import { countSuccesses, runAccumulationSimulation, runMonteCarloSimulation, type AccumulationSimulationParams } from '@/lib/services/monteCarloService';
import { calculateFIREProjection, resolveFanFireTargets, resolveFireRequirement } from '@/lib/services/fireService';
import { buildFlowSchedule, buildFlowYearTables, datedFlowsSignature, resolveDatedFlows, resolveGoalFlows, type DatedFlowsInput } from '@/lib/utils/datedFlows';
import { solveForRun } from '@/lib/utils/sustainableWithdrawal';
import { MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { getDefaultMonteCarloMarket, getDefaultMonteCarloCorrelations } from '@/lib/constants/monteCarloMarketDefaults';
import { monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import type { DatedFlow, FIREProjectionScenarios, MonteCarloMarketScenario, MonteCarloParams } from '@/types/assets';

const YEAR = 2026;

const flatMarket = (cagr: number, volatility = 0, inflationRate = 0): MonteCarloMarketScenario => ({
  classes: monteCarloClassRecord((cls) => ({ cagr: cls === 'equity' ? cagr : 0, volatility: cls === 'equity' ? volatility : 0 })),
  inflationRate,
});
const allIn = (cls: MonteCarloClass): Record<MonteCarloClass, number> => monteCarloClassRecord((key) => (key === cls ? 100 : 0));

const flow = (partial: Partial<DatedFlow> & Pick<DatedFlow, 'kind' | 'amount' | 'start'>): DatedFlow => ({
  id: partial.id ?? partial.kind,
  label: partial.label ?? partial.kind,
  indexed: true,
  durationYears: null,
  ...partial,
});
const inYear = (offset: number) => ({ anchor: 'year', year: YEAR + offset }) as const;
const flowsOf = (list: DatedFlow[], planExpensesFromCashflow = true): DatedFlowsInput => ({
  resolved: resolveDatedFlows(list, { currentYear: YEAR }).resolved,
  planExpensesFromCashflow,
});

const MORTGAGE = flow({ id: 'mortgage', kind: 'expense', amount: 9_600, indexed: false, start: inYear(0), durationYears: 9, inCashflowToday: true });
const INHERITANCE = flow({ id: 'inheritance', kind: 'lumpIn', amount: 100_000, indexed: false, start: inYear(10) });
const PART_TIME = flow({ id: 'part-time', kind: 'income', amount: 9_600, start: { anchor: 'fire', afterYears: 0 }, durationYears: 10 });
const CHILD = flow({ id: 'child', kind: 'expense', amount: 6_000, start: inYear(2), durationYears: 20 });

describe('RF8 — Monte Carlo «if I stop today» with flows (F13, F14)', () => {
  // K = 1.000.000 €, N = 30, Azioni g = 5% with zero volatility, π = 2%, the withdrawal indexed.
  const params = (flows: DatedFlow[], overrides: Partial<MonteCarloParams> = {}, annualWithdrawal = 50_000): MonteCarloParams => ({
    portfolioSource: 'custom',
    initialPortfolio: 1_000_000,
    retirementYears: 30,
    weights: allIn('equity'),
    annualWithdrawal,
    withdrawalAdjustment: 'inflation',
    market: flatMarket(5, 0, 2),
    numberOfSimulations: 10,
    flows: flows.length > 0 ? flowsOf(flows) : undefined,
    ...overrides,
  });
  const annuity = (years: number) => {
    let sum = 0;
    for (let s = 1; s <= years; s++) sum += (1.02 / 1.05) ** s;
    return sum;
  };
  const succeeds = (flows: DatedFlow[], withdrawal: number) => runMonteCarloSimulation(params(flows, {}, withdrawal)).successRate === 100;

  it('F13: a part-time of 10.000 € indexed from the FIRE for 10 years lifts the largest withdrawal from 50.632,09 to 54.964,10 €', () => {
    const noFlows = 1_000_000 / annuity(30);
    expect(noFlows).toBeCloseTo(50_632.09, 2);
    const exact = (1_000_000 + 10_000 * annuity(10)) / annuity(30);
    expect(exact).toBeCloseTo(54_964.1, 2);
    const partTime = flow({ kind: 'income', amount: 10_000, start: { anchor: 'fire', afterYears: 0 }, durationYears: 10 });
    // The engine lasts the horizon at the exact figure (a hair below: the last euro would land on zero) and not above it.
    expect(succeeds([partTime], exact - 0.5)).toBe(true);
    expect(succeeds([partTime], exact + 0.5)).toBe(false);
    // Without flows the same engine still stops at 50.632,09.
    expect(succeeds([], noFlows - 0.5)).toBe(true);
    expect(succeeds([], noFlows + 0.5)).toBe(false);
  });

  it('F13: the Spesa sostenibile prints 54.900 € (RS3) on the flows seeded', () => {
    const partTime = flow({ kind: 'income', amount: 10_000, start: { anchor: 'fire', afterYears: 0 }, durationYears: 10 });
    const p = params([partTime]);
    const run = runMonteCarloSimulation({ ...p, random: createSeededRandom(MONTE_CARLO_SEED) }, { keepFactors: true });
    expect(solveForRun({ factors: run.factors!, params: p }, 0.9).withdrawal).toBe(54_900);
  });

  it('F14: an inheritance of 200.000 € fixed at year 15 gives 55.503,07 € (it lands after that year\'s return)', () => {
    const inheritance = flow({ kind: 'lumpIn', amount: 200_000, indexed: false, start: inYear(15) });
    const exact = (1_000_000 + 200_000 / 1.05 ** 15) / annuity(30);
    expect(exact).toBeCloseTo(55_503.07, 2);
    expect(succeeds([inheritance], exact - 0.5)).toBe(true);
    expect(succeeds([inheritance], exact + 0.5)).toBe(false);
    const p = params([inheritance]);
    const run = runMonteCarloSimulation({ ...p, random: createSeededRandom(MONTE_CARLO_SEED) }, { keepFactors: true });
    expect(solveForRun({ factors: run.factors!, params: p }, 0.9).withdrawal).toBe(55_500);
  });

  it('a lump out leaves with the withdrawal of its year', () => {
    const car = flow({ kind: 'lumpOut', amount: 10_000, indexed: false, start: inYear(2) });
    const result = runMonteCarloSimulation(params([car], { retirementYears: 3, withdrawalAdjustment: 'fixed' }, 50_000));
    const path = result.simulations[0].path.map((point) => point.value);
    // 1.000.000 → 1.050.000 − 50.000 = 1.000.000 → year 2: 1.050.000 − 50.000 − 10.000 = 990.000.
    expect(path[1]).toBeCloseTo(1_000_000, 6);
    expect(path[2]).toBeCloseTo(990_000, 6);
  });

  it('a lump of the running year is part of the starting capital', () => {
    const today = flow({ kind: 'lumpIn', amount: 100_000, indexed: false, start: inYear(0) });
    const path = runMonteCarloSimulation(params([today], { retirementYears: 1, withdrawalAdjustment: 'fixed' }, 50_000)).simulations[0].path;
    expect(path[0].value).toBe(1_100_000);
  });

  it('S5 / F19: the success rate the ledger replays on the factors is the one a run at that withdrawal reads, exactly', () => {
    const flows = [flow({ kind: 'income', amount: 10_000, start: { anchor: 'fire', afterYears: 0 }, durationYears: 10 }), INHERITANCE, flow({ kind: 'lumpOut', amount: 40_000, start: inYear(4) })];
    const market = getDefaultMonteCarloMarket().scenarios.base;
    const stochastic = (withdrawal: number): MonteCarloParams =>
      params(flows, {
        weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0)),
        market,
        correlations: getDefaultMonteCarloCorrelations(),
        numberOfSimulations: 1_000,
        random: createSeededRandom(MONTE_CARLO_SEED),
      }, withdrawal);
    const seeded = runMonteCarloSimulation(stochastic(40_000), { keepFactors: true });
    for (const withdrawal of [30_000, 52_300, 61_000]) {
      const replayed = countSuccesses(seeded.factors!, 1_000, stochastic(withdrawal), withdrawal);
      const fresh = runMonteCarloSimulation(stochastic(withdrawal));
      expect(replayed).toBe(fresh.successCount);
    }
  });

  it('no flows, or an empty list: the engine of before, path for path', () => {
    const seeded = { market: flatMarket(5, 10, 2) };
    const plain = runMonteCarloSimulation(params([], { ...seeded, random: createSeededRandom(3) }));
    const empty = runMonteCarloSimulation(params([], { ...seeded, random: createSeededRandom(3), flows: { resolved: [], planExpensesFromCashflow: true } }));
    expect(empty.simulations.map((sim) => sim.path)).toEqual(plain.simulations.map((sim) => sim.path));
    expect(empty.successRate).toBe(plain.successRate);
  });
});

describe('RF7 — Ventaglio with flows (F18)', () => {
  const G = 7;
  const PI = 2;
  const SCENARIO = { growthRate: G, inflationRate: PI };
  const SCENARIOS: FIREProjectionScenarios = { bear: SCENARIO, base: SCENARIO, bull: SCENARIO };
  const LIST = [MORTGAGE, INHERITANCE, PART_TIME, CHILD];

  it('at zero volatility every path is the deterministic Base curve of F10, and all of them are FIRE at year 3', () => {
    const flows = flowsOf(LIST);
    const projection = calculateFIREProjection(400_000, 30_000, 20_000, 4, SCENARIOS, 50, undefined, undefined, true, flows);
    expect(projection.baseYearsToFIRE).toBe(3);
    const schedule = buildFlowSchedule(flows.resolved, { inflationRate: PI, planExpensesFromCashflow: true });
    const today = resolveFireRequirement({ annualExpenses: 30_000, withdrawalRate: 4, scenario: SCENARIO, yearsElapsed: 0, flows: schedule }).requirement;
    const years = Math.min(projection.yearlyData.length, 40);
    const result = runAccumulationSimulation({
      initialPortfolio: 400_000,
      annualSavings: 20_000,
      savingsInflationRate: PI,
      annualExpenses: 30_000,
      withdrawalRate: 4,
      expenseInflationRate: PI,
      years,
      weights: allIn('equity'),
      market: flatMarket(G, 0, PI),
      numberOfSimulations: 10,
      fireTargets: resolveFanFireTargets(today, projection),
      flows,
    });
    for (const path of result.paths) {
      for (let year = 1; year <= years; year++) expect(Math.round(path[year].value)).toBe(projection.yearlyData[year - 1].baseNetWorth);
    }
    for (const fireYear of result.fireYears) expect(fireYear).toBe(3);
    expect(result.percentiles[2].fireProbability).toBe(0);
    expect(result.percentiles[3].fireProbability).toBe(100);
  });

  it('F12: the car of F9 takes 30.000 € indexed out of the capital of year 3', () => {
    const car = flow({ kind: 'lumpOut', amount: 30_000, start: inYear(3) });
    const run = (list: DatedFlow[]) =>
      runAccumulationSimulation({
        initialPortfolio: 400_000,
        annualSavings: 20_000,
        savingsInflationRate: PI,
        annualExpenses: 30_000,
        withdrawalRate: 0,
        expenseInflationRate: PI,
        years: 3,
        weights: allIn('equity'),
        market: flatMarket(G, 0, PI),
        numberOfSimulations: 1,
        flows: list.length > 0 ? flowsOf(list) : undefined,
      }).paths[0][3].value;
    expect(run([])).toBeCloseTo(555_551.2, 1);
    expect(run([car])).toBeCloseTo(523_714.96, 1);
  });

  it('a FIRE-anchored flow starts from each path\'s own FIRE year in the retirement ledger', () => {
    // Zero volatility: the replica of «after the FIRE year T the need is E·(1+π)^s − 9.600·(1+π)^s for 10 years».
    const make = (list: DatedFlow[]): AccumulationSimulationParams => ({
      initialPortfolio: 400_000,
      annualSavings: 20_000,
      savingsInflationRate: PI,
      annualExpenses: 30_000,
      withdrawalRate: 4,
      expenseInflationRate: PI,
      years: 12,
      retirementHorizonYears: 30,
      weights: allIn('equity'),
      market: flatMarket(G, 0, PI),
      numberOfSimulations: 1,
      flows: list.length > 0 ? flowsOf(list) : undefined,
    });
    const without = runAccumulationSimulation(make([]));
    const withPartTime = runAccumulationSimulation(make([PART_TIME]));
    expect(withPartTime.fireYears[0]).toBe(without.fireYears[0]); // the accumulation does not read a FIRE-anchored flow
    const fire = without.fireYears[0]!;
    const replica = (partTime: boolean): number => {
      let capital = without.paths[0][fire].value;
      for (let s = fire + 1; s <= 30; s++) {
        const need = 30_000 * 1.02 ** s - (partTime && s <= fire + 10 ? 9_600 * 1.02 ** s : 0);
        capital = capital * 1.07 - need;
      }
      return capital;
    };
    expect(without.retirements[0]!.finalValue).toBeCloseTo(replica(false), 4);
    expect(withPartTime.retirements[0]!.finalValue).toBeCloseTo(replica(true), 4);
    expect(withPartTime.retirements[0]!.finalValue).toBeGreaterThan(without.retirements[0]!.finalValue);
  });

  it('no flows, or an empty list: the engine of before, path for path', () => {
    const base: AccumulationSimulationParams = {
      initialPortfolio: 100_000,
      annualSavings: 20_000,
      savingsInflationRate: 2,
      annualExpenses: 30_000,
      withdrawalRate: 4,
      expenseInflationRate: 2,
      years: 20,
      weights: allIn('equity'),
      market: flatMarket(7, 15, 2),
      numberOfSimulations: 50,
      random: createSeededRandom(7),
    };
    const plain = runAccumulationSimulation(base);
    const empty = runAccumulationSimulation({ ...base, random: createSeededRandom(7), flows: { resolved: [], planExpensesFromCashflow: true } });
    expect(empty.paths).toEqual(plain.paths);
    expect(empty.fireYears).toEqual(plain.fireYears);
    expect(empty.retirements).toEqual(plain.retirements);
  });
});

describe('RF10 — Proiezione with flows (F21)', () => {
  const run = (list: DatedFlow[], overrides: Partial<AccumulationSimulationParams> = {}) =>
    runAccumulationSimulation({
      initialPortfolio: 100_000,
      annualSavings: 0,
      annualExpenses: 0,
      withdrawalRate: 0,
      expenseInflationRate: 0,
      years: 10,
      weights: allIn('equity'),
      market: flatMarket(5),
      numberOfSimulations: 4,
      collectPaths: false,
      snapshotYears: [5, 10],
      flows: list.length > 0 ? flowsOf(list) : undefined,
      ...overrides,
    });

  it('F21: an inheritance of 50.000 € fixed at year 5 is worth 100.000·1,05^10 + 50.000·1,05^5 = 226.703,54 € at year 10', () => {
    const inheritance = flow({ kind: 'lumpIn', amount: 50_000, indexed: false, start: inYear(5) });
    const result = run([inheritance]);
    expect(result.snapshots![10][0]).toBeCloseTo(226_703.54, 2);
    expect(run([]).snapshots![10][0]).toBeCloseTo(100_000 * 1.05 ** 10, 2);
  });

  it('RF10: a recurring flow changes the saving only while it is paid (t ≤ savingsYears); the lumps come in every year', () => {
    // Saving 10.000 €/year for 3 years, a child of 4.000 €/year from year 1 (Δs = −4.000): 6.000 saved a year, nothing after year 3.
    const child = flow({ kind: 'expense', amount: 4_000, indexed: false, start: inYear(1), durationYears: 8 });
    const lump = flow({ kind: 'lumpOut', amount: 1_000, indexed: false, start: inYear(6) });
    const result = run([child, lump], { annualSavings: 10_000, savingsYears: 3 });
    let value = 100_000;
    for (let year = 1; year <= 10; year++) value = value * 1.05 + (year <= 3 ? 6_000 : 0) - (year === 6 ? 1_000 : 0);
    expect(result.snapshots![10][0]).toBeCloseTo(value, 4);
  });

  it('RF10: a flow anchored to the FIRE does not exist in the Proiezione (D-F10)', () => {
    const result = run([PART_TIME]);
    expect(result.snapshots![10][0]).toBeCloseTo(100_000 * 1.05 ** 10, 4);
  });

  it('the lumps of the running year join the starting capital', () => {
    const today = flow({ kind: 'lumpIn', amount: 20_000, indexed: false, start: inYear(0) });
    expect(run([today]).paths).toEqual([]);
    expect(run([today]).snapshots![5][0]).toBeCloseTo(120_000 * 1.05 ** 5, 4);
  });
});

describe('the year tables of a schedule', () => {
  it('give exactly what the schedule answers year by year', () => {
    const schedule = buildFlowSchedule(flowsOf([MORTGAGE, INHERITANCE, PART_TIME, CHILD, flow({ kind: 'lumpOut', amount: 5_000, start: inYear(10) })]).resolved, { inflationRate: 2, planExpensesFromCashflow: true });
    const tables = buildFlowYearTables(schedule, 30);
    for (let year = 0; year <= 30; year++) {
      expect(tables.lumpNet[year]).toBe(schedule.lump(year));
      expect(tables.lumpInflow[year] - tables.lumpOutflow[year]).toBeCloseTo(schedule.lump(year), 8);
      if (year >= 1) expect(tables.savingsDelta[year]).toBe(schedule.savingsDelta(year));
    }
    const need = tables.needFor(4);
    expect(need).toBe(tables.needFor(4)); // memoised
    for (let year = 5; year <= 30; year++) expect(need[year]).toBe(schedule.needDelta(year, 4));
  });

  it('a signature tells two lists apart, the mortgage\'s year map included', () => {
    expect(datedFlowsSignature(undefined)).toBe('');
    expect(datedFlowsSignature({ resolved: [], planExpensesFromCashflow: true })).toBe('');
    const a = flowsOf([MORTGAGE]);
    expect(datedFlowsSignature(a)).toBe(datedFlowsSignature(flowsOf([MORTGAGE])));
    expect(datedFlowsSignature(a)).not.toBe(datedFlowsSignature(flowsOf([MORTGAGE], false)));
    expect(datedFlowsSignature(a)).not.toBe(datedFlowsSignature(flowsOf([{ ...MORTGAGE, amount: 10_000 }])));
    const withMap = { resolved: [{ ...a.resolved[0], yearly: new Map([[1, 100]]) }], planExpensesFromCashflow: true };
    const withOtherMap = { resolved: [{ ...a.resolved[0], yearly: new Map([[1, 200]]) }], planExpensesFromCashflow: true };
    expect(datedFlowsSignature(withMap)).not.toBe(datedFlowsSignature(withOtherMap));
  });
});


describe('G8 — Monte Carlo reads a goal that counts (doc/fire-ipotesi/README.md § 13, O1)', () => {
  // K = 1.000.000 €, g = 5% with zero volatility, π = 2%, N = 30, the house of 50.000 € in 2029 (year 3) as a fixed lump out.
  const house = resolveGoalFlows(
    [{ id: 'house', name: 'Acquisto Casa', priority: 'alta', color: '#3B82F6', countsInFire: true, targetAmount: 50_000, targetDate: '2029-06-30', createdAt: new Date(), updatedAt: new Date() }],
    [],
    { currentYear: YEAR, assetValue: () => null },
  ).resolved;
  const succeeds = (withdrawal: number, flows: typeof house) =>
    runMonteCarloSimulation({
      portfolioSource: 'custom',
      initialPortfolio: 1_000_000,
      retirementYears: 30,
      weights: allIn('equity'),
      annualWithdrawal: withdrawal,
      withdrawalAdjustment: 'inflation',
      market: flatMarket(5, 0, 2),
      numberOfSimulations: 10,
      flows: flows.length > 0 ? { resolved: flows, planExpensesFromCashflow: true } : undefined,
    }).successRate === 100;

  it('should lower the largest withdrawal from 50.632,09 to 48.445,19 €', () => {
    let annuity = 0;
    for (let s = 1; s <= 30; s++) annuity += (1.02 / 1.05) ** s;
    const exact = (1_000_000 - 50_000 / 1.05 ** 3) / annuity;
    expect(exact).toBeCloseTo(48_445.19, 2);
    expect(succeeds(exact - 0.5, house)).toBe(true);
    expect(succeeds(exact + 0.5, house)).toBe(false);
    expect(succeeds(1_000_000 / annuity - 0.5, [])).toBe(true);
  });
});
