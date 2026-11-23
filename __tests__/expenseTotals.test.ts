/**
 * The monthly totals' pure layer (doc/totali-mensili/README.md § 4, § 13 CA1–CA4, CA6).
 *
 * The test month is § 13's March 2025 (figures invented and round, WORKFLOW.md rule 7). Every
 * expected value is worked out by hand in the comment above its assertion (rule 9).
 */
import { describe, expect, it, vi } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/expenseService', async (importOriginal) => importOriginal());
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/assetAllocationService', () => ({}));

import type { Expense } from '@/types/expenses';
import type { MonthlySnapshot } from '@/types/assets';
import type { ExpenseTotalsYear } from '@/types/expenseTotals';
import {
  aggregatedRowDate,
  buildMonthTotals,
  buildYearTotals,
  italyMonthEnd,
  italyMonthOf,
  italyMonthStart,
  loadExpenseFlows,
  mergeExpenseFlows,
  monthsToRebuild,
  planExpenseFlows,
  rowCountOf,
  type ExpenseFlowSource,
} from '@/lib/utils/expenseTotals';
import { calculateMonthlyRecords } from '@/lib/utils/hallOfFameRecords';
import { buildMonthlyGrowthDrivers } from '@/lib/utils/growthDrivers';
import { getCashFlowsFromExpenses } from '@/lib/services/performanceService';
import { buildReturnFlowAdjustments } from '@/lib/utils/returnFlows';

const italy = (iso: string) => fromZonedTime(iso, 'Europe/Rome');

function row(id: string, partial: Partial<Expense> & Pick<Expense, 'amount' | 'date'>): Expense {
  return {
    id,
    userId: 'owner',
    type: 'variable',
    categoryId: 'spesa',
    categoryName: 'Spesa',
    currency: 'EUR',
    createdAt: partial.date,
    updatedAt: partial.date,
    ...partial,
  } as Expense;
}

// § 13's March 2025: noon Italian time, except r7 (midnight of the 1st).
const r1 = row('r1', { type: 'income', categoryId: 'stipendio', categoryName: 'Stipendio', amount: 2500, date: italy('2025-03-27T12:00:00') });
const r2 = row('r2', { categoryId: 'spesa', subCategoryId: 'super', subCategoryName: 'Supermercato', amount: -120.4, date: italy('2025-03-10T12:00:00') });
const r3 = row('r3', { categoryId: 'spesa', subCategoryId: 'super', subCategoryName: 'Supermercato', amount: -79.6, date: italy('2025-03-15T12:00:00') });
const r4 = row('r4', { type: 'fixed', categoryId: 'casa', categoryName: 'Casa', subCategoryId: 'affitto', subCategoryName: 'Affitto', amount: -800, date: italy('2025-03-05T12:00:00') });
const r5 = row('r5', { type: 'transfer', categoryId: 'trasf', categoryName: 'Trasferimenti', amount: 300, date: italy('2025-03-20T12:00:00') });
const r6 = row('r6', { categoryId: 'comm', categoryName: 'Commissioni', amount: -2.5, feeOfTradeId: 'trade-1', date: italy('2025-03-12T12:00:00') });
const r7 = row('r7', { type: 'income', categoryId: 'dividendi', categoryName: 'Dividendi', amount: 50, date: italy('2025-03-01T00:00:00') });
const MARCH = [r1, r2, r3, r4, r5, r6, r7];

describe('buildMonthTotals (CA1)', () => {
  it('counts, sums and cells the test month', () => {
    const totals = buildMonthTotals(MARCH);
    // rowCount = 7 rows; amountSum = 2500 − 120,40 − 79,60 − 800 + 300 − 2,50 + 50 = 1847,50
    expect(totals.rowCount).toBe(7);
    expect(totals.amountSum).toBeCloseTo(1847.5, 9);
    const byKey = Object.fromEntries(totals.cells.map((c) => [`${c.type}/${c.categoryId}/${c.subCategoryId ?? ''}/${c.tradeFee ? 'fee' : ''}`, c]));
    expect(totals.cells).toHaveLength(6);
    // r1 alone
    expect(byKey['income/stipendio//']).toMatchObject({ sum: 2500, count: 1, categoryName: 'Stipendio' });
    // r2 + r3 = −120,40 − 79,60 = −200,00 in two rows
    expect(byKey['variable/spesa/super/'].sum).toBeCloseTo(-200, 9);
    expect(byKey['variable/spesa/super/'].count).toBe(2);
    expect(byKey['fixed/casa/affitto/']).toMatchObject({ sum: -800, count: 1 });
    expect(byKey['transfer/trasf//']).toMatchObject({ sum: 300, count: 1 });
    expect(byKey['variable/comm//fee']).toMatchObject({ sum: -2.5, count: 1, tradeFee: true });
    expect(byKey['income/dividendi//']).toMatchObject({ sum: 50, count: 1 });
  });

  it('keeps a refund in its own cell, so the spending stays the sum of the absolute values', () => {
    // −100 purchase and +20 refund in one category: calculateTotalExpenses reads |−100| + |+20| = 120.
    const totals = buildMonthTotals([
      row('a', { amount: -100, date: italy('2025-03-10T12:00:00') }),
      row('b', { amount: 20, date: italy('2025-03-11T12:00:00') }),
    ]);
    expect(totals.cells.map((c) => [c.negative, c.sum])).toEqual([
      [false, 20],
      [true, -100],
    ]);
  });

  it('names a cell after its most recent row and keeps a legacy row without type apart', () => {
    const totals = buildMonthTotals([
      row('old', { categoryName: 'Spesa vecchia', amount: -10, date: italy('2025-03-02T12:00:00') }),
      row('new', { categoryName: 'Spesa', amount: -10, date: italy('2025-03-03T12:00:00') }),
      row('legacy', { type: undefined as unknown as Expense['type'], amount: -5, date: italy('2025-03-03T12:00:00') }),
    ]);
    expect(totals.cells.find((c) => c.type === 'variable')?.categoryName).toBe('Spesa');
    expect(totals.cells.find((c) => c.type === 'unclassified')).toMatchObject({ sum: -5, count: 1 });
  });
});

describe('the Italian month', () => {
  it('opens and closes at Italian midnight, and the aggregated row sits inside it in every calendar', () => {
    const march = { year: 2025, month: 3 };
    // 1 March 2025 00:00 CET = 28 Feb 23:00Z; 31 March 23:59:59.999 CEST = 21:59:59.999Z (DST since 30 March)
    expect(italyMonthStart(march).toISOString()).toBe('2025-02-28T23:00:00.000Z');
    expect(italyMonthEnd(march).toISOString()).toBe('2025-03-31T21:59:59.999Z');
    const aggregated = aggregatedRowDate(march);
    expect(aggregated.getUTCDate()).toBe(15);
    expect(aggregated.getDate()).toBe(15);
    expect(italyMonthOf(r7.date)).toEqual(march);
  });
});

const NOW_MID_APRIL = italy('2025-04-15T12:00:00');

function yearDoc(rows: Expense[], builtAt: Date, year = 2025): ExpenseTotalsYear {
  return buildYearTotals('owner', year, rows, builtAt);
}

describe('planExpenseFlows (§ 4.3)', () => {
  const bounds = { oldest: italy('2025-01-10T12:00:00'), newest: italy('2025-12-10T12:00:00') };

  it('reads the running month from rows, closed and future months from a trustworthy document', () => {
    const plan = planExpenseFlows([yearDoc(MARCH, italy('2025-04-14T19:00:00'))], bounds, NOW_MID_APRIL);
    expect(plan.liveMonths).toEqual([{ year: 2025, month: 4 }]);
    expect(plan.totalsMonths.map((m) => m.month)).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(plan.liveRanges).toEqual([{ from: italyMonthStart({ year: 2025, month: 4 }), to: italyMonthEnd({ year: 2025, month: 4 }) }]);
  });

  it('reads a closed month rebuilt before it ended from its rows (the 1st, before the cron)', () => {
    // Built on 31 March at 19:00: March was still running, so its later rows are not in it.
    const now = italy('2025-04-01T08:00:00');
    const plan = planExpenseFlows([yearDoc(MARCH, italy('2025-03-31T19:00:00'))], bounds, now);
    expect(plan.liveMonths).toEqual([
      { year: 2025, month: 3 },
      { year: 2025, month: 4 },
    ]);
    expect(plan.liveRanges).toHaveLength(1);
  });

  it('reads a year without a document, or with an old schema, from its rows (CU10)', () => {
    const stale = { ...yearDoc(MARCH, NOW_MID_APRIL), schemaVersion: 0 };
    for (const years of [[], [stale]]) {
      const plan = planExpenseFlows(years, bounds, NOW_MID_APRIL);
      expect(plan.totalsMonths).toEqual([]);
      expect(plan.liveRanges).toEqual([{ from: italyMonthStart({ year: 2025, month: 1 }), to: italyMonthEnd({ year: 2025, month: 12 }) }]);
    }
  });

  it('reads nothing on an account with no rows (CU11)', () => {
    expect(planExpenseFlows([], null, NOW_MID_APRIL)).toEqual({ totalsMonths: [], liveMonths: [], liveRanges: [] });
  });

  it('starts at the reader\'s first instant', () => {
    const plan = planExpenseFlows([yearDoc(MARCH, NOW_MID_APRIL)], bounds, NOW_MID_APRIL, italy('2025-03-01T00:00:00'));
    expect(plan.totalsMonths[0]).toEqual({ year: 2025, month: 3 });
  });
});

describe('mergeExpenseFlows', () => {
  it('gives each month either its aggregated rows or its real rows, never both', () => {
    const april = row('apr', { amount: -30, date: italy('2025-04-10T12:00:00') });
    const doc = yearDoc([...MARCH, april], NOW_MID_APRIL);
    const plan = planExpenseFlows([doc], { oldest: r7.date, newest: april.date }, NOW_MID_APRIL);
    // A wide range returned March's rows too: they are dropped, March comes from the totals.
    const merged = mergeExpenseFlows('owner', plan, [doc], [...MARCH, april]);
    const march = merged.filter((e) => italyMonthOf(e.date).month === 3);
    expect(march.every((e) => e.id.startsWith('agg:'))).toBe(true);
    // 7 rows in 6 cells
    expect(march).toHaveLength(6);
    expect(march.reduce((sum, e) => sum + rowCountOf(e), 0)).toBe(7);
    expect(merged.filter((e) => e.id === 'apr')).toHaveLength(1);
  });
});

describe('monthsToRebuild (§ 5.2)', () => {
  it('names every month of the dates except the running one, once, in order', () => {
    const months = monthsToRebuild(
      [italy('2025-05-02T12:00:00'), italy('2025-03-15T12:00:00'), NOW_MID_APRIL, italy('2025-03-01T00:00:00'), null],
      NOW_MID_APRIL,
    );
    expect(months).toEqual([
      { year: 2025, month: 3 },
      { year: 2025, month: 5 },
    ]);
  });
});

describe('CA6 — a row moved from a closed month to another', () => {
  it('rebuilds both months to the hand-worked figures', () => {
    const moved = { ...r3, date: italy('2025-04-15T12:00:00') };
    const rows = [r1, r2, moved, r4, r5, r6, r7];
    const doc = yearDoc(rows, NOW_MID_APRIL);
    // March without r3: 6 rows, 1847,50 + 79,60 = 1927,10; Supermercato −120,40 in one row
    expect(doc.months['03']!.rowCount).toBe(6);
    expect(doc.months['03']!.amountSum).toBeCloseTo(1927.1, 9);
    expect(doc.months['03']!.cells.find((c) => c.subCategoryId === 'super')).toMatchObject({ sum: -120.4, count: 1 });
    // April: Supermercato −79,60 in one row
    expect(doc.months['04']!.cells).toEqual([expect.objectContaining({ subCategoryId: 'super', sum: -79.6, count: 1 })]);
  });
});

// The readers on the test month, from its rows and from its totals.
const snapshot = (year: number, month: number, totalNetWorth: number): MonthlySnapshot =>
  ({ id: `owner-${year}-${month}`, userId: 'owner', year, month, totalNetWorth, liquidNetWorth: totalNetWorth, illiquidNetWorth: 0, byAsset: [], createdAt: italy(`${year}-${String(month).padStart(2, '0')}-28T19:00:00`) } as unknown as MonthlySnapshot);

function sourceOf(rows: Expense[], years: ExpenseTotalsYear[]): ExpenseFlowSource {
  return {
    readBounds: async () => {
      if (rows.length === 0) return null;
      const times = rows.map((r) => r.date.getTime());
      return { oldest: new Date(Math.min(...times)), newest: new Date(Math.max(...times)) };
    },
    readYears: async (wanted) => years.filter((y) => wanted.includes(y.year)),
    readRows: async (from, to) => rows.filter((r) => r.date >= from && r.date <= to),
    readCategoryRows: async (categoryId) => rows.filter((r) => r.categoryId === categoryId),
  };
}

describe('the readers on the test month (CA2–CA4)', () => {
  const doc = yearDoc(MARCH, NOW_MID_APRIL);

  it('CA2 — Hall of Fame: March saves 1547,50 from rows and from totals', async () => {
    const snapshots = [snapshot(2025, 2, 100_000), snapshot(2025, 3, 101_000)];
    const fromTotals = await loadExpenseFlows('owner', sourceOf(MARCH, [doc]), { now: NOW_MID_APRIL });
    expect(fromTotals.every((e) => e.id.startsWith('agg:'))).toBe(true);
    for (const list of [MARCH, fromTotals]) {
      const [record] = calculateMonthlyRecords(snapshots, list);
      // ΔNW 101.000 − 100.000; income r1 + r7 = 2550; spending r2 + r3 + r4 + r6 = 120,40 + 79,60 + 800 + 2,50 = 1002,50
      expect(record.netWorthDiff).toBe(1000);
      expect(record.totalIncome).toBeCloseTo(2550, 9);
      expect(record.totalExpenses).toBeCloseTo(1002.5, 9);
      // savings 2550 − 1002,50 = 1547,50
      expect(record.totalIncome - record.totalExpenses).toBeCloseTo(1547.5, 9);
    }
  });

  it('CA3 — Storico: the month\'s savings are 1547,50 from rows and from totals', async () => {
    const fromTotals = await loadExpenseFlows('owner', sourceOf(MARCH, [doc]), { now: NOW_MID_APRIL });
    const snapshots = [snapshot(2025, 2, 100_000), snapshot(2025, 3, 101_000)];
    for (const list of [MARCH, fromTotals]) {
      const [march] = buildMonthlyGrowthDrivers(snapshots, { expenses: list, transactions: [], assets: [], pension: { contributions: [], startMonth: null }, today: NOW_MID_APRIL });
      // every non-transfer row: 2500 + 50 − 120,40 − 79,60 − 800 − 2,50 = 1547,50
      expect(march.netSavings).toBeCloseTo(1547.5, 9);
    }
  });

  it('CA4 — Rendimenti: the flows of March, r7 in March also under TZ=UTC', async () => {
    const fromTotals = await loadExpenseFlows('owner', sourceOf(MARCH, [doc]), { now: NOW_MID_APRIL, realRowsCategoryId: 'dividendi' });
    // r7 arrives as itself (the dividend category is read from its rows), the rest aggregated.
    expect(fromTotals.find((e) => e.categoryId === 'dividendi')?.id).toBe('r7');
    const start = italy('2025-03-01T00:00:00');
    const end = italy('2025-03-31T23:59:59.999');
    for (const list of [MARCH, fromTotals]) {
      const [flow] = getCashFlowsFromExpenses(list, start, end, 'dividendi');
      // income r1 = 2500; dividends r7 = 50; spending 1002,50; net 2500 − 1002,50 = 1497,50
      expect(flow.income).toBeCloseTo(2500, 9);
      expect(flow.dividendIncome).toBeCloseTo(50, 9);
      expect(flow.expenses).toBeCloseTo(1002.5, 9);
      expect(flow.netCashFlow).toBeCloseTo(1497.5, 9);
      const adjustments = buildReturnFlowAdjustments(list, { dividends: [], trades: [], excludedAssetIds: [] }, 'dividendi', start, end);
      // C_rows +2,50 (r6's fee); r7, named by no record and on no excluded account, −50 measured
      expect(adjustments.get('2025-03')).toEqual({ cashflowAdjustment: 2.5, measuredAdjustment: -50 });
    }
  });
});
