import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * F08 step 1 (doc/rendimenti-misura/README.md § 7, «Passo 1»): which movements are flows.
 * B1 a distribution paid inside the base is return; B2 the return is gross of tax and net of trading
 * fees in both branches; B3 the running month's rows stop at the snapshot's capture day.
 * The figures are the dossier's hand values (invented, round: WORKFLOW.md rule 7).
 */

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/assetAllocationService', () => ({}));
vi.mock('@/lib/services/dividendReceiptsService', () => ({}));

import { calculatePerformanceForPeriod } from '@/lib/services/performanceService';
import { resolvePerformanceBase } from '@/lib/utils/performanceBase';
import { attributePeriodReturn, sumDividendsByAsset, type DividendReceipt } from '@/lib/utils/performanceAttribution';
import { buildReturnFlowAdjustments, resolveFlowCutoff, type ReturnFlowContext } from '@/lib/utils/returnFlows';
import { externalFlowOf } from '@/lib/utils/cashFlowMap';
import type { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { PerformanceMetrics } from '@/types/performance';

type Position = { assetId: string; quantity: number; price: number };

const snapshot = (year: number, month: number, positions: Position[], createdAt = new Date(year, month - 1, 28, 19)): MonthlySnapshot =>
  ({
    userId: 'u',
    year,
    month,
    totalNetWorth: positions.reduce((sum, p) => sum + p.quantity * p.price, 0),
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    assetAllocation: {},
    createdAt,
    byAsset: positions.map((p) => ({ assetId: p.assetId, ticker: p.assetId, name: p.assetId, quantity: p.quantity, price: p.price, totalValue: p.quantity * p.price })),
  }) as unknown as MonthlySnapshot;

/** A snapshot with no breakdown: a hand-typed net worth. */
const plain = (year: number, month: number, netWorth: number, createdAt = new Date(year, month - 1, 28, 19)): MonthlySnapshot =>
  ({ userId: 'u', year, month, totalNetWorth: netWorth, liquidNetWorth: netWorth, illiquidNetWorth: 0, createdAt }) as unknown as MonthlySnapshot;

const expense = (id: string, date: Date, type: string, amount: number, extra: Partial<Expense> = {}): Expense =>
  ({ id, userId: 'u', type, categoryId: 'c', categoryName: 'x', amount, currency: 'EUR', date, createdAt: date, updatedAt: date, ...extra }) as unknown as Expense;

const asset = (id: string, extra: Partial<Asset> = {}): Asset =>
  ({ id, userId: 'u', name: id, ticker: id, type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 1, currentPrice: 1, ...extra }) as unknown as Asset;

const ETF = asset('etf');
const CONTO = asset('conto', { type: 'cash', assetClass: 'cash' });
const CASA = asset('casa', { type: 'realestate', assetClass: 'realestate', allocationRole: 'excluded' } as Partial<Asset>);
const HOUSE: Position = { assetId: 'casa', quantity: 1, price: 200000 };
const DIV = 'div';

/** The page's own pipeline: the base, then the period with every flow channel. */
async function measure(input: {
  snapshots: MonthlySnapshot[];
  assets: Asset[];
  expenses: Expense[];
  trades?: AssetTransaction[];
  dividends?: DividendReceipt[];
  settings?: Partial<AssetAllocationSettings> | null;
}): Promise<PerformanceMetrics> {
  const trades = input.trades ?? [];
  const base = resolvePerformanceBase({
    snapshots: input.snapshots,
    assets: input.assets,
    contributions: [],
    settings: (input.settings ?? null) as AssetAllocationSettings | null,
    trades,
  });
  const context: ReturnFlowContext = { dividends: input.dividends ?? [], trades, excludedAssetIds: base.excludedAssetIds };
  return calculatePerformanceForPeriod('u', base.snapshots, 'ALL', 2, undefined, undefined, input.expenses, DIV, base.pensionFlows, base.portfolioFlows, context);
}

const flowOf = (metrics: PerformanceMetrics) => metrics.cashFlows.reduce((sum, cf) => sum + externalFlowOf(cf), 0);
const gainOf = (metrics: PerformanceMetrics) => metrics.endNetWorth - metrics.startNetWorth - flowOf(metrics);

beforeAll(() => {
  vi.useFakeTimers();
  // «Today» is 10 November 2026, noon in Italy.
  vi.setSystemTime(new Date('2026-11-10T11:00:00Z'));
});
afterAll(() => vi.useRealTimers());

describe('B1 — a distribution paid inside the base is return', () => {
  const t5Snapshots = (withHouse: boolean, cashAfter = 1100) => [
    snapshot(2026, 9, [{ assetId: 'etf', quantity: 100, price: 100 }, { assetId: 'conto', quantity: 1000, price: 1 }, ...(withHouse ? [HOUSE] : [])]),
    snapshot(2026, 10, [{ assetId: 'etf', quantity: 100, price: 100 }, { assetId: 'conto', quantity: cashAfter, price: 1 }, ...(withHouse ? [HOUSE] : [])]),
  ];
  const dividendRow = (amount: number, extra: Partial<Expense> = {}) => expense('d', new Date(2026, 9, 15, 12), 'income', amount, { categoryId: DIV, ...extra });

  it('T5 — a dividend row on an account inside a subset base: flow 0, ROI +0,909%', async () => {
    const metrics = await measure({ snapshots: t5Snapshots(true), assets: [ETF, CONTO, CASA], expenses: [dividendRow(100, { linkedCashAssetId: 'conto' })] });
    expect(metrics.flowSource).toBe('portfolio');
    expect(flowOf(metrics)).toBeCloseTo(0, 9);
    expect(metrics.roi).toBeCloseTo((100 / 11000) * 100, 9);
  });

  it('T5 — the same history on the whole net worth (cashflow branch) gives the same +0,909%', async () => {
    const metrics = await measure({ snapshots: t5Snapshots(false), assets: [ETF, CONTO], expenses: [dividendRow(100, { linkedCashAssetId: 'conto' })] });
    expect(metrics.flowSource).toBe('cashflow');
    expect(metrics.roi).toBeCloseTo((100 / 11000) * 100, 9);
  });

  it('T5b — cash out of the base: the dividend leaves as return, flow −100, ROI +1%', async () => {
    const metrics = await measure({
      snapshots: t5Snapshots(false),
      assets: [ETF, CONTO],
      expenses: [dividendRow(100)],
      settings: { performanceExcludesCash: true },
    });
    expect(metrics.startNetWorth).toBe(10000);
    expect(flowOf(metrics)).toBeCloseTo(-100, 9);
    expect(metrics.roi).toBeCloseTo(1, 9);
  });

  it('T5b — the same with a registry record and the row on the excluded account: still return', async () => {
    const metrics = await measure({
      snapshots: t5Snapshots(false),
      assets: [ETF, CONTO],
      expenses: [dividendRow(100, { linkedCashAssetId: 'conto' })],
      dividends: [{ assetId: 'etf', paymentDate: new Date(2026, 9, 15, 12), grossAmount: 100, taxAmount: 0, netAmount: 100, expenseId: 'd' }],
      settings: { performanceExcludesCash: true },
    });
    expect(flowOf(metrics)).toBeCloseTo(-100, 9);
    expect(metrics.roi).toBeCloseTo(1, 9);
  });

  it('T5c — gross 100, tax 26, net 74 credited: flow −26, gain 100, ROI +0,909% in both branches', async () => {
    const record: DividendReceipt = { assetId: 'etf', paymentDate: new Date(2026, 9, 15, 12), grossAmount: 100, taxAmount: 26, netAmount: 74, expenseId: 'd' };
    const row = dividendRow(74, { linkedCashAssetId: 'conto' });
    const subset = await measure({ snapshots: t5Snapshots(true, 1074), assets: [ETF, CONTO, CASA], expenses: [row], dividends: [record] });
    const whole = await measure({ snapshots: t5Snapshots(false, 1074), assets: [ETF, CONTO], expenses: [row], dividends: [record] });
    for (const metrics of [subset, whole]) {
      expect(flowOf(metrics)).toBeCloseTo(-26, 9);
      expect(gainOf(metrics)).toBeCloseTo(100, 9);
      expect(metrics.roi).toBeCloseTo((100 / 11000) * 100, 9);
    }
    expect(subset.flowSource).toBe('portfolio');
    expect(whole.flowSource).toBe('cashflow');
  });

  it('T5c — Attribuzione: the ETF row carries the gross 100 €, «Non attribuito» is 0', async () => {
    const record: DividendReceipt = { assetId: 'etf', paymentDate: new Date(2026, 9, 15, 12), grossAmount: 100, taxAmount: 26, netAmount: 74, expenseId: 'd' };
    const snapshots = t5Snapshots(true, 1074);
    const base = resolvePerformanceBase({ snapshots, assets: [ETF, CONTO, CASA], contributions: [], settings: null, trades: [] });
    const metrics = await measure({ snapshots, assets: [ETF, CONTO, CASA], expenses: [dividendRow(74, { linkedCashAssetId: 'conto' })], dividends: [record] });
    const attribution = attributePeriodReturn({
      snapshots: base.snapshots,
      cashFlows: metrics.cashFlows,
      excludedAssetIds: base.excludedAssetIds,
      pension: { fundIds: [], entryMonth: null, contributions: [] },
      assets: [ETF, CONTO, CASA],
      dividendsByAsset: sumDividendsByAsset([record], metrics.startDate, metrics.dividendEndDate),
    });
    expect(attribution.gain).toBeCloseTo(100, 9);
    expect(attribution.rows.find((row) => row.assetId === 'etf')?.total).toBeCloseTo(100, 9);
    expect(attribution.unattributed).toBeCloseTo(0, 9);
  });

  it('T5d — the payer is outside the base (the house): flow +100, ROI 0%', async () => {
    const metrics = await measure({
      snapshots: t5Snapshots(true),
      assets: [ETF, CONTO, CASA],
      expenses: [dividendRow(100, { linkedCashAssetId: 'conto' })],
      dividends: [{ assetId: 'casa', paymentDate: new Date(2026, 9, 15, 12), grossAmount: 100, taxAmount: 0, netAmount: 100, expenseId: 'd' }],
    });
    expect(flowOf(metrics)).toBeCloseTo(100, 9);
    expect(metrics.roi).toBeCloseTo(0, 9);
  });

  it('an income row outside the dividend category stays a deposit (declared limit)', async () => {
    const metrics = await measure({
      snapshots: t5Snapshots(true),
      assets: [ETF, CONTO, CASA],
      expenses: [expense('i', new Date(2026, 9, 15, 12), 'income', 100, { linkedCashAssetId: 'conto' })],
    });
    expect(flowOf(metrics)).toBeCloseTo(100, 9);
    expect(metrics.roi).toBeCloseTo(0, 9);
  });
});

describe('B2 — gross of tax, net of trading fees, in both branches', () => {
  // 15.000 € (ETF 100 × 100 €, account 5.000 €). September: buy 10 at 100 € + 5 € fee. October:
  // sell 50 at 100 € with 5 € fee and 260 € withheld tax. No price move: 15.000 → 14.995 → 14.730.
  const t6 = (withHouse: boolean) => {
    const house = withHouse ? [HOUSE] : [];
    const snapshots = [
      snapshot(2026, 8, [{ assetId: 'etf', quantity: 100, price: 100 }, { assetId: 'conto', quantity: 5000, price: 1 }, ...house]),
      snapshot(2026, 9, [{ assetId: 'etf', quantity: 110, price: 100 }, { assetId: 'conto', quantity: 3995, price: 1 }, ...house]),
      snapshot(2026, 10, [{ assetId: 'etf', quantity: 60, price: 100 }, { assetId: 'conto', quantity: 8730, price: 1 }, ...house]),
    ];
    const trade = (id: string, type: 'buy' | 'sell', date: Date, quantity: number, extra: Partial<AssetTransaction> = {}) =>
      ({ id, userId: 'u', assetId: 'etf', type, date, quantity, pricePerUnit: 100, priceEur: 100, fees: 5, linkedCashAssetId: 'conto', createdAt: date, updatedAt: date, ...extra }) as AssetTransaction;
    const trades = [
      trade('b0', 'buy', new Date(2026, 7, 1, 12), 100, { isBaseline: true, priceEur: 80, pricePerUnit: 80, fees: 0 }),
      trade('b1', 'buy', new Date(2026, 8, 10, 12), 10),
      trade('s1', 'sell', new Date(2026, 9, 10, 12), 50, { withheldTaxEur: 260 }),
    ];
    const expenses = [
      expense('f1', new Date(2026, 8, 10, 12), 'variable', -5, { feeOfTradeId: 'b1', linkedCashAssetId: 'conto' }),
      expense('f2', new Date(2026, 9, 10, 12), 'variable', -5, { feeOfTradeId: 's1', linkedCashAssetId: 'conto' }),
    ];
    return { snapshots, trades, expenses, assets: withHouse ? [ETF, CONTO, CASA] : [ETF, CONTO] };
  };

  it.each([
    ['whole net worth (cashflow)', false, 'cashflow'],
    ['subset (measured)', true, 'portfolio'],
  ])('T6 — %s: flows 0 and −260, gain −10, ROI −0,067%%', async (_label, withHouse, source) => {
    const metrics = await measure(t6(withHouse));
    expect(metrics.flowSource).toBe(source);
    const byMonth = metrics.cashFlows.map((cf) => externalFlowOf(cf));
    expect(byMonth[0]).toBeCloseTo(0, 9);
    expect(byMonth[1]).toBeCloseTo(-260, 9);
    expect(gainOf(metrics)).toBeCloseTo(-10, 9);
    expect(metrics.roi).toBeCloseTo((-10 / 15000) * 100, 9);
  });

  it('«Contributi netti» keeps the cashflow meaning: the fee rows are still spending there', async () => {
    const metrics = await measure(t6(false));
    expect(metrics.netCashFlow).toBe(-10);
  });

  it('a trade with no fee row has nothing to correct: the fee already weighs', () => {
    const { trades } = t6(false);
    const adjustments = buildReturnFlowAdjustments([], { dividends: [], trades: trades.filter((t) => t.type === 'buy'), excludedAssetIds: [] }, DIV, new Date(2026, 8, 1), new Date(2026, 9, 31, 23, 59));
    expect(adjustments.size).toBe(0);
  });
});

describe('B3 — the running month stops at the capture day', () => {
  it('T4 — a salary in the calendar for the 27th, snapshot of the 10th: ROI 0, TWR 0, contributions 0', async () => {
    const snapshots = [plain(2026, 10, 10000), plain(2026, 11, 10000, new Date('2026-11-10T18:00:00Z'))];
    const salary = expense('s', new Date(2026, 10, 27, 12), 'income', 2000);
    const metrics = await measure({ snapshots, assets: [], expenses: [salary] });
    expect(metrics.roi).toBeCloseTo(0, 9);
    expect(metrics.timeWeightedReturn).toBeCloseTo(0, 9);
    expect(metrics.netCashFlow).toBe(0);
  });

  it('T4 control — the same salary dated the 5th, snapshot at 12.000 €: flow +2.000, ROI 0', async () => {
    const snapshots = [plain(2026, 10, 10000), plain(2026, 11, 12000, new Date('2026-11-10T18:00:00Z'))];
    const salary = expense('s', new Date(2026, 10, 5, 12), 'income', 2000);
    const metrics = await measure({ snapshots, assets: [], expenses: [salary] });
    expect(flowOf(metrics)).toBe(2000);
    expect(metrics.roi).toBeCloseTo(0, 9);
  });

  it('the cap is the capture day, not today: a snapshot left on the 3rd ignores a row of the 5th', async () => {
    const snapshots = [plain(2026, 10, 10000), plain(2026, 11, 10000, new Date('2026-11-03T18:00:00Z'))];
    const metrics = await measure({ snapshots, assets: [], expenses: [expense('s', new Date(2026, 10, 5, 12), 'income', 2000)] });
    expect(metrics.netCashFlow).toBe(0);
    expect(metrics.roi).toBeCloseTo(0, 9);
  });

  it('a closed month counts whole, whenever its snapshot was written', async () => {
    const snapshots = [plain(2026, 9, 10000), plain(2026, 10, 12000, new Date('2026-10-20T18:00:00Z'))];
    const metrics = await measure({ snapshots, assets: [], expenses: [expense('s', new Date(2026, 9, 27, 12), 'income', 2000)] });
    expect(metrics.netCashFlow).toBe(2000);
  });

  it('resolveFlowCutoff: end of the Italian capture day for the running month, null otherwise', () => {
    const running = [plain(2026, 10, 1), plain(2026, 11, 1, new Date('2026-11-10T18:00:00Z'))];
    expect(resolveFlowCutoff(running, new Date())?.toISOString()).toBe('2026-11-10T22:59:59.999Z');
    expect(resolveFlowCutoff([plain(2026, 10, 1)], new Date())).toBeNull();
    // No capture instant: today.
    const noCapture = [{ ...plain(2026, 11, 1), createdAt: undefined } as unknown as MonthlySnapshot];
    expect(resolveFlowCutoff(noCapture, new Date())?.toISOString()).toBe('2026-11-10T22:59:59.999Z');
  });

  it('resolveFlowCutoff reads snapshotCapturedAt (F07 RI4): updatedAt, not the month\'s first createdAt', () => {
    const rewritten = { ...plain(2026, 11, 1, new Date('2026-11-01T18:00:00Z')), updatedAt: new Date('2026-11-09T18:00:00Z') } as MonthlySnapshot;
    expect(resolveFlowCutoff([plain(2026, 10, 1), rewritten], new Date())?.toISOString()).toBe('2026-11-09T22:59:59.999Z');
  });
});

describe('invariant — an account with none of these cases does not move', () => {
  it('no distribution, fee row, withheld tax or future row: same metrics with and without the corrections', async () => {
    const snapshots = [
      snapshot(2026, 7, [{ assetId: 'etf', quantity: 100, price: 100 }, { assetId: 'conto', quantity: 1000, price: 1 }, HOUSE]),
      snapshot(2026, 8, [{ assetId: 'etf', quantity: 100, price: 102 }, { assetId: 'conto', quantity: 1500, price: 1 }, HOUSE]),
      snapshot(2026, 9, [{ assetId: 'etf', quantity: 100, price: 99 }, { assetId: 'conto', quantity: 1400, price: 1 }, HOUSE]),
    ];
    const expenses = [expense('a', new Date(2026, 7, 5, 12), 'income', 600), expense('b', new Date(2026, 8, 5, 12), 'variable', -100)];
    const base = resolvePerformanceBase({ snapshots, assets: [ETF, CONTO, CASA], contributions: [], settings: null, trades: [] });
    const without = await calculatePerformanceForPeriod('u', base.snapshots, 'ALL', 2, undefined, undefined, expenses, DIV, base.pensionFlows, base.portfolioFlows);
    const withCorrections = await measure({ snapshots, assets: [ETF, CONTO, CASA], expenses });
    expect(withCorrections.roi).toBe(without.roi);
    expect(withCorrections.timeWeightedReturn).toBe(without.timeWeightedReturn);
    expect(withCorrections.moneyWeightedReturn).toBe(without.moneyWeightedReturn);
    expect(withCorrections.volatility).toBe(without.volatility);
  });
});
