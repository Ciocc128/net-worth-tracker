import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * F08 step 2 (doc/rendimenti-misura/README.md § 7, «Passo 2»): the formula of a sub-period.
 * B4 a gap in the snapshots is ONE sub-period with all its flows; B9 the flow sits at mid-period
 * (modified Dietz) with three guards, and the IRR reads the same instants.
 * The figures are the dossier's hand values (invented, round: WORKFLOW.md rule 7).
 */

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/assetAllocationService', () => ({}));
vi.mock('@/lib/services/dividendReceiptsService', () => ({}));

import {
  calculateIRR,
  calculatePerformanceForPeriod,
  calculateTimeWeightedReturn,
  calculateVolatility,
  prepareMonthlyReturnsHeatmap,
} from '@/lib/services/performanceService';
import { buildTwrIndex } from '@/lib/utils/drawdownSeries';
import { describeGapCell } from '@/components/performance/MonthlyReturnsHeatmap';
import { monthlyEquivalentReturn, subPeriodReturn } from '@/lib/utils/cashFlowMap';
import type { MonthlySnapshot } from '@/types/assets';
import type { CashFlowData } from '@/types/performance';
import type { Expense } from '@/types/expenses';

const snap = (year: number, month: number, netWorth: number): MonthlySnapshot =>
  ({ userId: 'u', year, month, totalNetWorth: netWorth, liquidNetWorth: netWorth, illiquidNetWorth: 0, createdAt: new Date(year, month - 1, 28, 19) }) as unknown as MonthlySnapshot;

const flow = (year: number, month: number, amount: number, extra: Partial<CashFlowData> = {}): CashFlowData => ({
  date: new Date(year, month - 1, 1),
  income: Math.max(amount, 0),
  expenses: Math.max(-amount, 0),
  dividendIncome: 0,
  netCashFlow: amount,
  ...extra,
});

const income = (id: string, date: Date, amount: number): Expense =>
  ({ id, userId: 'u', type: 'income', categoryId: 'c', categoryName: 'x', amount, currency: 'EUR', date, createdAt: date, updatedAt: date }) as unknown as Expense;

/** An annualised TWR (%) back to the return of the `months` it spans (%). */
const periodOf = (annualised: number, months: number) => (Math.pow(1 + annualised / 100, months / 12) - 1) * 100;
const cell = (heatmap: ReturnType<typeof prepareMonthlyReturnsHeatmap>, year: number, month: number) =>
  heatmap.find((row) => row.year === year)?.months.find((m) => m.month === month);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T11:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('B9 — the flow at mid-period (modified Dietz)', () => {
  const t1Snapshots = [snap(2025, 12, 10000), snap(2026, 1, 10300), snap(2026, 2, 10100), snap(2026, 3, 10800)];
  const t1Flows = [flow(2026, 1, 200), flow(2026, 2, -100), flow(2026, 3, 500)];

  it('T1 — the three cells: +0,990099%, −0,975610%, +1,932367%', () => {
    const heatmap = prepareMonthlyReturnsHeatmap(t1Snapshots, t1Flows);
    expect(cell(heatmap, 2026, 1)?.return).toBeCloseTo((100 / 10100) * 100, 6);
    expect(cell(heatmap, 2026, 2)?.return).toBeCloseTo((-100 / 10250) * 100, 6);
    expect(cell(heatmap, 2026, 3)?.return).toBeCloseTo((200 / 10350) * 100, 6);
  });

  it('T1 — chained +1,937290%, annualised over 3 months +7,977269%, the cells chain to the TWR', () => {
    const twr = calculateTimeWeightedReturn(t1Snapshots, t1Flows, 3)!;
    expect(twr).toBeCloseTo(7.977269, 5);
    expect(periodOf(twr, 3)).toBeCloseTo(1.93729, 5);
    const heatmap = prepareMonthlyReturnsHeatmap(t1Snapshots, t1Flows);
    const chained = heatmap[0].months.filter((m) => m.return !== null).reduce((product, m) => product * (1 + m.return! / 100), 1);
    expect((chained - 1) * 100).toBeCloseTo(periodOf(twr, 3), 9);
  });

  it('T1 — the drawdown index chains the same cells', () => {
    const index = buildTwrIndex(t1Snapshots, t1Flows);
    expect(index[3].value).toBeCloseTo(100 * 1.0193729, 4);
  });

  it('T1 — volatility annualised 5,139691%', () => {
    expect(calculateVolatility(t1Snapshots, t1Flows)).toBeCloseTo(5.139691, 5);
  });

  it('T2 — IRR: 1.200 € paid in July (t = 6,5): 7,590771%', () => {
    const irr = calculateIRR(10000, 12000, [flow(2026, 7, 1200)], 12, new Date(2026, 0, 1));
    expect(irr).toBeCloseTo(7.590771, 5);
  });

  it('T2b — one month, TWR 1,047619% and IRR 1,047749% agree on the instant', () => {
    const twr = calculateTimeWeightedReturn([snap(2025, 12, 10000), snap(2026, 1, 11110)], [flow(2026, 1, 1000)], 1)!;
    expect(periodOf(twr, 1)).toBeCloseTo((110 / 10500) * 100, 6);
    const irr = calculateIRR(10000, 11110, [flow(2026, 1, 1000)], 1, new Date(2026, 0, 1))!;
    expect(periodOf(irr, 1)).toBeCloseTo(1.047749, 5);
  });

  it('T7 — a large deposit on a small capital: −35,4839%, then +2%; TWR −34,1935%, annualised −91,8790%', () => {
    const snapshots = [snap(2025, 12, 100), snap(2026, 1, 5000), snap(2026, 2, 5100)];
    const flows = [flow(2026, 1, 6000)];
    const heatmap = prepareMonthlyReturnsHeatmap(snapshots, flows);
    expect(cell(heatmap, 2026, 1)?.return).toBeCloseTo((-1100 / 3100) * 100, 4);
    expect(cell(heatmap, 2026, 2)?.return).toBeCloseTo(2, 9);
    const twr = calculateTimeWeightedReturn(snapshots, flows, 2)!;
    expect(periodOf(twr, 2)).toBeCloseTo(-34.1935, 4);
    expect(twr).toBeCloseTo(-91.879, 3);
  });

  it('T7b — guard 3: the cell shows −132,258%, the TWR is null, the index stops at 0', () => {
    const snapshots = [snap(2025, 12, 100), snap(2026, 1, 2000)];
    const flows = [flow(2026, 1, 6000)];
    expect(cell(prepareMonthlyReturnsHeatmap(snapshots, flows), 2026, 1)?.return).toBeCloseTo((-4100 / 3100) * 100, 3);
    expect(calculateTimeWeightedReturn(snapshots, flows, 1)).toBeNull();
    expect(buildTwrIndex(snapshots, flows)[1].value).toBe(0);
  });

  it('T7c — guard 2: V0 + W = −50 €, the sub-period is not measurable and the cell stays empty', () => {
    expect(subPeriodReturn(100, 0, -300)).toBeNull();
    const heatmap = prepareMonthlyReturnsHeatmap([snap(2025, 12, 100), snap(2026, 1, 0)], [flow(2026, 1, -300)]);
    expect(heatmap).toEqual([]);
  });

  it('T9 — the pension funds enter at 5.000 €: weight 0, the month stays neutral (TWR and IRR)', () => {
    const snapshots = [snap(2025, 12, 10000), snap(2026, 1, 15000)];
    const entry = [flow(2026, 1, 0, { pensionFlow: 5000, pensionEntryFlow: 5000 })];
    expect(cell(prepareMonthlyReturnsHeatmap(snapshots, entry), 2026, 1)?.return).toBeCloseTo(0, 9);
    expect(calculateTimeWeightedReturn(snapshots, entry, 1)).toBeCloseTo(0, 9);
    expect(calculateIRR(10000, 15000, entry, 1, new Date(2026, 0, 1))).toBeCloseTo(0, 6);
  });
});

describe('B4 — a gap is one sub-period with all its flows', () => {
  it('T3 — December 10.000 €, March 13.000 €, 1.000 € paid in each month: ROI, IRR and TWR 0%', async () => {
    const snapshots = [snap(2025, 12, 10000), snap(2026, 3, 13000)];
    const expenses = [income('a', new Date(2026, 0, 15, 12), 1000), income('b', new Date(2026, 1, 15, 12), 1000), income('c', new Date(2026, 2, 15, 12), 1000)];
    const metrics = await calculatePerformanceForPeriod('u', snapshots, 'ALL', 2, undefined, undefined, expenses);
    expect(metrics.roi).toBeCloseTo(0, 9);
    expect(metrics.moneyWeightedReturn).toBeCloseTo(0, 6);
    expect(metrics.timeWeightedReturn).toBeCloseTo(0, 9);
    const heatmap = prepareMonthlyReturnsHeatmap(snapshots, metrics.cashFlows);
    expect(cell(heatmap, 2026, 3)).toMatchObject({ return: expect.closeTo(0, 9), spanMonths: 3 });
    expect(cell(heatmap, 2026, 1)).toMatchObject({ return: null, countedIn: { year: 2026, month: 3 } });
    expect(cell(heatmap, 2026, 2)).toMatchObject({ return: null, countedIn: { year: 2026, month: 3 } });
  });

  it('T8 — a gap with no flow: the cell +6,1208%, ONE volatility observation of +2,000%', () => {
    expect(monthlyEquivalentReturn(0.0612080, 3)).toBeCloseTo(0.02, 9);
    // Three steady months at +2%, then a three-month gap at the same pace: one more +2% observation.
    const snapshots = [snap(2025, 9, 9611.69), snap(2025, 10, 9803.9238), snap(2025, 11, 10000.0023), snap(2026, 2, 10612.0824)];
    const heatmap = prepareMonthlyReturnsHeatmap(snapshots, []);
    expect(cell(heatmap, 2026, 2)?.return).toBeCloseTo(6.1208, 3);
    expect(cell(heatmap, 2026, 2)?.spanMonths).toBe(3);
    expect(calculateVolatility(snapshots, [])).toBeCloseTo(0, 2);
  });

  it('a gap that crosses the year opens the row of the year it starts in', () => {
    const heatmap = prepareMonthlyReturnsHeatmap([snap(2025, 10, 10000), snap(2026, 1, 10300)], []);
    expect(heatmap.map((row) => row.year)).toEqual([2025, 2026]);
    expect(cell(heatmap, 2025, 11)?.countedIn).toEqual({ year: 2026, month: 1 });
    expect(cell(heatmap, 2025, 10)?.countedIn).toBeUndefined();
  });
});

describe('the heatmap reading of a gap (§ 9)', () => {
  it('the closing cell says how many months it spans and from when; a gap month points at it', () => {
    expect(describeGapCell({ month: 3, return: 6.1, spanMonths: 3 })).toBe('in 3 mesi (da gennaio)');
    expect(describeGapCell({ month: 1, return: 3, spanMonths: 3 })).toBe('in 3 mesi (da novembre)');
    expect(describeGapCell({ month: 2, return: null, countedIn: { year: 2026, month: 3 } })).toBe('senza snapshot, conta in marzo');
    expect(describeGapCell({ month: 2, return: 1 })).toBeNull();
    expect(describeGapCell({ month: 2, return: null })).toBeNull();
  });
});
