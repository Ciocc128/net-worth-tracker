/**
 * CA5 and CA9 (doc/totali-mensili/README.md § 13): every reader of Fase A gives the same figures on
 * the real rows and on the list `loadExpenseFlows` builds from the monthly totals (D-TM1).
 *
 * The history is invented (WORKFLOW.md rule 7): five years and a quarter of ~80 rows a month, a
 * recurring instalment in the calendar until 2030, refunds, rows without `type`, transfers, trade
 * fees and dividends. Run under `TZ=Europe/Rome` and `TZ=UTC` (the package scripts do both).
 *
 * Three clocks: mid-March with the totals built the evening before; the 1st of April before the
 * cron (March was last rebuilt on 31 March at 19:00, and a row saved at 21:00 is not in it — rule 3
 * of § 4.3 reads March from its rows); and no totals at all (CA9, the lazy migration).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/assetAllocationService', () => ({}));

import type { Expense } from '@/types/expenses';
import type { MonthlySnapshot } from '@/types/assets';
import { loadExpenseFlows } from '@/lib/utils/expenseTotals';
import { ROWS, expectSame, italy, snapshotsUntil, sourceOf, totalsAt } from './helpers/expenseHistoryFixture';
import { calculateMonthlyRecords, calculateYearlyRecords } from '@/lib/utils/hallOfFameRecords';
import { buildMonthlyGrowthDrivers, buildYearlyGrowthDrivers, type GrowthDriverContext } from '@/lib/utils/growthDrivers';
import { laborWindowsOf, summarizeLaborMetrics } from '@/lib/utils/storicoSummary';
import { prepareMonthlyLaborMetricsData } from '@/lib/services/chartService';
import { buildFIREData, computeAnnualCashflowData } from '@/lib/services/fireService';
import { getCashFlowsFromExpenses } from '@/lib/services/performanceService';
import { buildReturnFlowAdjustments, capAtCutoff, resolveFlowCutoff } from '@/lib/utils/returnFlows';
import { isItalyDayAfter } from '@/lib/utils/dateHelpers';

// ─── The readers ───────────────────────────────────────────────────────────

const LABOR = ['stipendio'];

function readAll(rows: Expense[], snapshots: MonthlySnapshot[], now: Date) {
  const context: GrowthDriverContext = { expenses: rows, transactions: [], assets: [], pension: { contributions: [], startMonth: null }, today: now };
  const yearly = buildYearlyGrowthDrivers(snapshots, context);
  const lived = rows.filter((e) => !isItalyDayAfter(e.date, now));
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const start = new Date(first.year, first.month, 1);
  const end = new Date(last.year, last.month, 0, 23, 59, 59, 999);
  const flowEnd = capAtCutoff(end, resolveFlowCutoff(snapshots, now));
  const context2 = { dividends: [{ assetId: 'etf', paymentDate: italy('2024-06-10T12:00:00'), netAmount: 20, grossAmount: 25, taxAmount: 5 }], trades: [], excludedAssetIds: [] };
  return {
    monthlyRecords: calculateMonthlyRecords(snapshots, rows),
    yearlyRecords: calculateYearlyRecords(snapshots, rows),
    yearlyDrivers: yearly,
    monthlyDrivers: buildMonthlyGrowthDrivers(snapshots, context),
    labor: summarizeLaborMetrics(snapshots, lived, LABOR, 2021, laborWindowsOf(yearly), 0, null),
    laborChart: prepareMonthlyLaborMetricsData(snapshots, lived, LABOR, 2021),
    annualCashflow: computeAnnualCashflowData(rows, now),
    fire: buildFIREData(snapshots, rows, 200_000, 4, false, now),
    cashFlows: getCashFlowsFromExpenses(rows, start, flowEnd, 'dividendi'),
    adjustments: Object.fromEntries(buildReturnFlowAdjustments(rows, context2, 'dividendi', start, flowEnd)),
  };
}

const CLOCKS = [
  {
    name: 'mid-March, totals built the evening before',
    now: italy('2026-03-15T12:00:00'),
    builtAt: italy('2026-03-14T19:00:00'),
    snapshots: snapshotsUntil({ year: 2026, month: 3 }),
    lateRow: null as Expense | null,
  },
  {
    name: 'the 1st of April before the cron, a row saved after the last run of March',
    now: italy('2026-04-01T08:00:00'),
    builtAt: italy('2026-03-31T19:00:00'),
    snapshots: snapshotsUntil({ year: 2026, month: 3 }),
    lateRow: {
      id: 'late',
      userId: 'owner',
      type: 'variable',
      categoryId: 'svago',
      categoryName: 'Svago',
      amount: -45,
      currency: 'EUR',
      date: italy('2026-03-31T20:30:00'),
      createdAt: italy('2026-03-31T21:00:00'),
      updatedAt: italy('2026-03-31T21:00:00'),
    } as Expense,
  },
];

describe('CA5 — every reader of Fase A on the totals gives the figures of the rows', () => {
  for (const clock of CLOCKS) {
    it(clock.name, async () => {
      // The rows that exist at `now`: every one saved by then (the instalments were saved in 2024).
      const rows = [...ROWS, ...(clock.lateRow ? [clock.lateRow] : [])].filter((r) => r.createdAt <= clock.now);
      const years = totalsAt(rows, clock.builtAt);
      const source = sourceOf(rows, years);
      const flows = await loadExpenseFlows('owner', source, { now: clock.now });
      const rendimenti = await loadExpenseFlows('owner', source, { now: clock.now, realRowsCategoryId: 'dividendi' });

      // The list is mostly aggregated: the point of it.
      expect(flows.length).toBeLessThan(rows.length / 3);
      if (clock.lateRow) expect(flows.some((e) => e.id === 'late')).toBe(true);

      const expected = readAll(rows, clock.snapshots, clock.now);
      const actual = readAll(flows, clock.snapshots, clock.now);
      // Rendimenti's two readers are compared on the list read with the dividend category's real rows, below.
      const withoutPerformance = (r: ReturnType<typeof readAll>) => ({ ...r, cashFlows: undefined, adjustments: undefined });
      expectSame(withoutPerformance(actual), withoutPerformance(expected));
      const performance = readAll(rendimenti, clock.snapshots, clock.now);
      expectSame(performance.cashFlows, expected.cashFlows, 'cashFlows');
      expectSame(performance.adjustments, expected.adjustments, 'adjustments');
      // Full readings of the five-year history: past the default 5 s when the suite runs in parallel.
    }, 60_000);
  }

  it('FIRE\'s recent window reads only from January of last year', async () => {
    const now = CLOCKS[0].now;
    const rows = ROWS.filter((r) => r.createdAt <= now);
    const source = sourceOf(rows, totalsAt(rows, CLOCKS[0].builtAt));
    const recent = await loadExpenseFlows('owner', source, { now, from: italy('2025-01-01T00:00:00') });
    expect(recent.every((e) => e.date >= italy('2025-01-01T00:00:00'))).toBe(true);
    expectSame(computeAnnualCashflowData(recent, now), computeAnnualCashflowData(rows, now));
  }, 60_000);
});

describe('CA9 — no totals yet: the readers read the rows, as today', () => {
  it('gives back the rows themselves', async () => {
    const now = CLOCKS[0].now;
    const rows = ROWS.filter((r) => r.createdAt <= now);
    const flows = await loadExpenseFlows('owner', sourceOf(rows, []), { now });
    expect(flows).toHaveLength(rows.length);
    expectSame(readAll(flows, CLOCKS[0].snapshots, now), readAll(rows, CLOCKS[0].snapshots, now));
    // Two full readings of the five-year history: past the default 5 s when the suite runs in parallel.
  }, 60_000);
});
