/**
 * The FIRE requirement with pensions and the locked fund (RN1–RN7, RN9), the dated flows' permanent part (RN6):
 * reference values of doc/fire-ipotesi/README.md § 23.9 (task FC-NF). Figures invented and round (WORKFLOW § 1.7);
 * each expected value is the closed form beside it, never the code's output.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

import {
  calculateCoastFIREMetrics,
  calculateCoastFireNetRealAnnualPension,
  getDefaultCoastFireTaxBrackets,
  resolveFireRequirement,
  type FireRequirementInput,
} from '@/lib/services/fireService';
import { buildFireLedger } from '@/lib/utils/fireBaseLedger';
import { buildFlowSchedule, resolveDatedFlows } from '@/lib/utils/datedFlows';
import type { CoastFirePensionInput, DatedFlow } from '@/types/assets';

const NOW = new Date(2026, 10, 15, 12);
const BRACKETS = getDefaultCoastFireTaxBrackets();
// ρ = 5%: 1,071 / 1,02 − 1.
const S5 = { growthRate: 7.1, inflationRate: 2 };
// ρ = 4,902%: 1,07 / 1,02 − 1.
const S7 = { growthRate: 7, inflationRate: 2 };
const R7 = 1.07 / 1.02 - 1;
const annuity = (rate: number, years: number) => (1 - Math.pow(1 + rate, -years)) / rate;

const pension = (id: string, grossMonthlyAmount: number, startAge: number): CoastFirePensionInput => ({ id, label: id, grossMonthlyAmount, monthsPerYear: 13, startAge });
// PE-2: 1.500 € × 13 = 19.500 € gross, 23% → 15.015 € net.
const PE2 = (startAge = 67) => pension('inps', 1500, startAge);
const honest = (pensions: CoastFirePensionInput[], userAge = 47, withdrawalTax?: { basisToday: number; rate: number }) => ({ userAge, pensions, taxBrackets: BRACKETS, now: NOW, withdrawalTax });
const req = (extra: Partial<FireRequirementInput> = {}, scenario = S5) =>
  resolveFireRequirement({ annualExpenses: 20_000, withdrawalRate: 4, scenario, yearsElapsed: 0, ...extra }).requirement;
const fund = (value: number, yearsToUnlock = 20) => ({ compartmentValue: value, yearsToUnlock });

const flow = (partial: Partial<DatedFlow> & Pick<DatedFlow, 'kind' | 'amount' | 'start'>): DatedFlow => ({ id: partial.kind, label: partial.kind, indexed: true, durationYears: null, ...partial });
const schedule = (flows: DatedFlow[]) =>
  buildFlowSchedule(resolveDatedFlows(flows, { currentYear: 2026, userAge: 40 }).resolved, { inflationRate: 2, planExpensesFromCashflow: false });

describe('RN7 — the pension at today\'s prices (audit H2, PE-1…PE-3)', () => {
  it('PE-1, PE-2: 1.500 € × 13 is 19.500 € gross and 15.015 € net, whatever the start', () => {
    const result = calculateCoastFireNetRealAnnualPension(PE2(67), 47, 2, BRACKETS, NOW);
    expect(result.grossAnnualRealAtStart).toBeCloseTo(19_500, 2);
    expect(result.netAnnualRealAtStart).toBeCloseTo(15_015, 2);
  });

  it('PE-3: the inflation does not move it', () => {
    expect(calculateCoastFireNetRealAnnualPension(PE2(67), 47, 3, BRACKETS, NOW).netAnnualRealAtStart).toBeCloseTo(15_015, 2);
  });
});

describe('RN1–RN5 — the requirement (audit H1, NF-1…NF-14)', () => {
  it('NF-1: no pension, no fund — 500.000', () => {
    expect(req()).toBeCloseTo(500_000, 2);
  });

  it('NF-2: a locked fund of 1 € — 499.999 (was 437.688)', () => {
    expect(req({ bridge: fund(1) })).toBeCloseTo(499_999, 2);
  });

  it('NF-3: a pension of 0,01 € × 13 — 500.000 within 1 €', () => {
    expect(Math.abs(req({ honest: honest([pension('tiny', 0.01, 67)]) }) - 500_000)).toBeLessThan(1);
  });

  it('NF-4: a fund of 1 € at ρ = 2,94% (growth 5%) — 499.999 (was 579.192)', () => {
    expect(req({ bridge: fund(1) }, { growthRate: 5, inflationRate: 2 })).toBeCloseTo(499_999, 2);
  });

  it('NF-5: a fund of 100.000 € — 400.000', () => {
    expect(req({ bridge: fund(100_000) })).toBeCloseTo(400_000, 2);
  });

  it('NF-6: the pension of PE-2 from 20 years — 500.000 − 375.375 ÷ 1,05^20', () => {
    expect(req({ honest: honest([PE2()]) })).toBeCloseTo(500_000 - 375_375 / Math.pow(1.05, 20), 2);
    expect(req({ honest: honest([PE2()]) })).toBeCloseTo(358_525.11, 2);
  });

  it('NF-7: the pension of PE-2 and a fund of 50.000 € — 308.525,11', () => {
    expect(req({ honest: honest([PE2()]), bridge: fund(50_000) })).toBeCloseTo(308_525.11, 2);
  });

  it('NF-8: NF-6 with the tax — gain share 40%, rate 26% (m = 1,116071)', () => {
    const m = 1 / (1 - 0.4 * 0.26);
    const expected = (20_000 * m) / 0.04 - (15_015 * m) / 0.04 / Math.pow(1.05, 20);
    expect(expected).toBeCloseTo(400_139.63, 2);
    expect(req({ honest: honest([PE2()], 47, { basisToday: 1, rate: 26 }), gainShare: 0.4 })).toBeCloseTo(expected, 2);
  });

  it('NF-9: two net pensions, 15.015 € from 20 years and 3.000 € from 25 — 336.377,40', () => {
    // 3.000 net under 23%: 3.000 / 0,77 gross a year, over 13 months.
    const second = pension('second', 3_000 / 0.77 / 13, 72);
    const expected = 500_000 - 15_015 / 0.04 / Math.pow(1.05, 20) - 3_000 / 0.04 / Math.pow(1.05, 25);
    expect(expected).toBeCloseTo(336_377.4, 2);
    expect(req({ honest: honest([PE2(), second]) })).toBeCloseTo(expected, 2);
  });

  it('NF-10: a net pension above the spending (28.930 €) — 500.000 − 500.000 ÷ 1,05^20', () => {
    // 3.000 × 13 = 39.000 gross: 6.440 + 3.630 of tax → 28.930 net.
    const big = pension('big', 3_000, 67);
    expect(calculateCoastFireNetRealAnnualPension(big, 47, 2, BRACKETS, NOW).netAnnualRealAtStart).toBeCloseTo(28_930, 2);
    expect(req({ honest: honest([big]) })).toBeCloseTo(311_555.26, 2);
  });

  it('NF-11: a fund of 600.000 € — the floor of RN3, 20.000 × a(5%, 20)', () => {
    expect(20_000 * annuity(0.05, 20)).toBeCloseTo(249_244.21, 2);
    expect(req({ bridge: fund(600_000) })).toBeCloseTo(249_244.21, 2);
  });

  it('NF-12: a fund of 450.000 € — N = 50.000 is below the floor: 249.244,21', () => {
    expect(req({ bridge: fund(450_000) })).toBeCloseTo(249_244.21, 2);
  });

  it('NF-13: continuity — a year before the unlock and at the unlock, free capital + fund = 500.000', () => {
    expect(req({ bridge: fund(100_000, 1) }) + 100_000).toBeCloseTo(500_000, 2);
    // At the unlock the fund has merged: no bridge, the requirement is on the whole capital.
    expect(req({ bridge: fund(100_000, 0) })).toBeCloseTo(500_000, 2);
  });

  it('NF-14: the Base di calcolo with NF-7 — 500.000 − 141.475 − 50.000 = 308.525, to the euro', () => {
    const ledger = buildFireLedger({ annualExpenses: 20_000, withdrawalRate: 4, scenario: S5, honest: honest([PE2()]), bridge: fund(50_000) });
    expect(ledger.base).toBe(500_000);
    expect(ledger.steps.find((step) => step.key === 'pensions')!.amount).toBe(-141_475);
    expect(ledger.steps.find((step) => step.key === 'bridge')!.amount).toBe(-50_000);
    expect(ledger.total).toBe(308_525);
    expect(ledger.base + ledger.steps.reduce((sum, step) => sum + (step.amount ?? 0), 0)).toBe(ledger.total);
  });
});

describe('Coast with the new rule (NF-15) and the gain share in one unit (RN9, CO-1)', () => {
  it('NF-15: age 40, target 60, the pension of PE-2 at 67, real 4,902% — 231.477,86 at the target, 88.886,81 today', () => {
    const metrics = calculateCoastFIREMetrics(100_000, 20_000, 4, 40, 60, R7 * 100, 2, [PE2(67)], BRACKETS, NOW);
    const atTarget = 500_000 - 15_015 / 0.04 / Math.pow(1 + R7, 7);
    expect(atTarget).toBeCloseTo(231_477.86, 2);
    expect(metrics.fireNumberAtRetirement).toBeCloseTo(atTarget, 2);
    expect(metrics.coastFireNumberToday).toBeCloseTo(88_886.81, 2);
  });

  it('CO-1: 200.000 € on a 150.000 € basis, 20 years at 7% and 2%, 26% — share 80,62%, 632.597,73 at the target', () => {
    const nominal = 200_000 * Math.pow(1.07, 20);
    const share = (nominal - 150_000) / nominal;
    expect(share * 100).toBeCloseTo(80.62, 2);
    const metrics = calculateCoastFIREMetrics(200_000, 20_000, 4, 40, 60, R7 * 100, 2, [], BRACKETS, NOW, undefined, { basisToday: 150_000, rate: 26 });
    expect(metrics.fireNumberAtRetirement).toBeCloseTo(500_000 / (1 - share * 0.26), 2);
    expect(metrics.fireNumberAtRetirement).toBeCloseTo(632_597.73, 2);
  });
});

describe('RN6 — the permanent part of the dated flows (audit H4, FL-1…FL-3, NF-16)', () => {
  it('FL-1: an income of 6.000 € forever from the FIRE — 350.000 (was 351.290)', () => {
    const flows = schedule([flow({ kind: 'income', amount: 6_000, start: { anchor: 'fire', afterYears: 0 } })]);
    expect(req({ flows }, S7)).toBeCloseTo(350_000, 2);
  });

  it('FL-2: an expense of 5.000 € for 10 years from the FIRE — 538.793,16, unchanged', () => {
    const flows = schedule([flow({ kind: 'expense', amount: 5_000, durationYears: 10, start: { anchor: 'fire', afterYears: 0 } })]);
    expect(500_000 + 5_000 * annuity(R7, 10)).toBeCloseTo(538_793.16, 2);
    expect(req({ flows }, S7)).toBeCloseTo(538_793.16, 2);
  });

  it('FL-3: the lumps and the expense over 8 years of the audit — unchanged', () => {
    const out = schedule([flow({ kind: 'lumpOut', amount: 50_000, indexed: false, start: { anchor: 'year', year: 2031 } })]);
    expect(req({ flows: out }, S7)).toBeCloseTo(500_000 + 50_000 / Math.pow(1.07, 5), 2);
    const inflow = schedule([flow({ kind: 'lumpIn', amount: 50_000, start: { anchor: 'year', year: 2031 } })]);
    expect(req({ flows: inflow }, S7)).toBeCloseTo(500_000 - 50_000 / Math.pow(1 + R7, 5), 2);
    const child = schedule([flow({ kind: 'expense', amount: 6_000, durationYears: 8, start: { anchor: 'year', year: 2027 } })]);
    expect(req({ flows: child }, S7)).toBeCloseTo(500_000 + 6_000 * annuity(R7, 8), 2);
  });

  it('NF-16: a net pension of 6.000 € from 10 years after the FIRE and the same income dated forever from then give one requirement', () => {
    // The pension active from step 10 (age 60 for a reader of 50) is the 11th year of withdrawals, as a flow anchored to
    // the FIRE with 10 years after it: both are 6.000 / SWR discounted over 10 years.
    const expected = 500_000 - 6_000 / 0.04 / Math.pow(1.05, 10);
    const viaPension = req({ honest: honest([pension('p', 6_000 / 0.77 / 13, 60)], 50) });
    const viaFlow = req({ flows: schedule([flow({ kind: 'income', amount: 6_000, start: { anchor: 'fire', afterYears: 10 } })]) });
    expect(viaPension).toBeCloseTo(expected, 2);
    expect(viaFlow).toBeCloseTo(expected, 2);
  });
});
