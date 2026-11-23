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
import { fromZonedTime } from 'date-fns-tz';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/assetAllocationService', () => ({}));

import type { Expense, ExpenseType } from '@/types/expenses';
import type { MonthlySnapshot } from '@/types/assets';
import type { ExpenseTotalsYear } from '@/types/expenseTotals';
import { buildYearTotals, loadExpenseFlows, type ExpenseFlowSource } from '@/lib/utils/expenseTotals';
import { calculateMonthlyRecords, calculateYearlyRecords } from '@/lib/utils/hallOfFameRecords';
import { buildMonthlyGrowthDrivers, buildYearlyGrowthDrivers, type GrowthDriverContext } from '@/lib/utils/growthDrivers';
import { laborWindowsOf, summarizeLaborMetrics } from '@/lib/utils/storicoSummary';
import { prepareMonthlyLaborMetricsData } from '@/lib/services/chartService';
import { buildFIREData, computeAnnualCashflowData } from '@/lib/services/fireService';
import { getCashFlowsFromExpenses } from '@/lib/services/performanceService';
import { buildReturnFlowAdjustments, capAtCutoff, resolveFlowCutoff } from '@/lib/utils/returnFlows';
import { isItalyDayAfter } from '@/lib/utils/dateHelpers';

const italy = (iso: string) => fromZonedTime(iso, 'Europe/Rome');
const pad = (n: number) => String(n).padStart(2, '0');

// ─── The invented history ──────────────────────────────────────────────────

/** A small deterministic generator (mulberry32): the same history on every run. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES: Array<{ id: string; name: string; type: ExpenseType; subs: string[] }> = [
  { id: 'stipendio', name: 'Stipendio', type: 'income', subs: ['', 'tredicesima'] },
  { id: 'regali', name: 'Regali', type: 'income', subs: [''] },
  { id: 'dividendi', name: 'Dividendi', type: 'income', subs: [''] },
  { id: 'spesa', name: 'Spesa', type: 'variable', subs: ['super', 'mercato', ''] },
  { id: 'svago', name: 'Svago', type: 'variable', subs: ['cinema', ''] },
  { id: 'casa', name: 'Casa', type: 'fixed', subs: ['affitto', 'bollette'] },
  { id: 'mutuo', name: 'Mutuo', type: 'debt', subs: [''] },
  { id: 'giroconto', name: 'Giroconto', type: 'transfer', subs: [''] },
];

function history(): Expense[] {
  const random = rng(42);
  const rows: Expense[] = [];
  let n = 0;
  const push = (date: Date, cat: (typeof CATEGORIES)[number], amount: number, extra: Partial<Expense> = {}) => {
    const sub = cat.subs[Math.floor(random() * cat.subs.length)];
    rows.push({
      id: `row-${++n}`,
      userId: 'owner',
      type: cat.type,
      categoryId: cat.id,
      categoryName: cat.name,
      ...(sub ? { subCategoryId: sub, subCategoryName: sub.toUpperCase() } : {}),
      amount,
      currency: 'EUR',
      date,
      createdAt: date,
      updatedAt: date,
      ...extra,
    } as Expense);
  };
  for (let year = 2021; year <= 2026; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 2026 && month > 4) break;
      const day = (d: number, h = 12) => italy(`${year}-${pad(month)}-${pad(Math.min(d, 28))}T${pad(h)}:00:00`);
      push(day(27), CATEGORIES[0], 2500);
      if (month === 12) push(day(20), CATEGORIES[0], 1250);
      if (random() < 0.2) push(day(5 + Math.floor(random() * 20)), CATEGORIES[1], 50 * Math.ceil(random() * 4));
      push(day(10), CATEGORIES[2], 12.34 + month);
      push(day(1), CATEGORIES[5], -800);
      for (let i = 0; i < 70; i++) {
        const cat = CATEGORIES[3 + Math.floor(random() * 2)];
        const refund = random() < 0.05;
        push(day(1 + Math.floor(random() * 28), 8 + Math.floor(random() * 12)), cat, (refund ? 1 : -1) * Math.round(random() * 9000) / 100);
      }
      push(day(15), CATEGORIES[7], 300);
      if (random() < 0.5) push(day(12), CATEGORIES[3], -2.5, { feeOfTradeId: `trade-${year}-${month}` });
      if (random() < 0.1) push(day(14), { ...CATEGORIES[4], type: undefined as unknown as ExpenseType }, -40);
    }
  }
  // A recurring instalment in the calendar until December 2030.
  for (let year = 2024; year <= 2030; year++) {
    for (let month = 1; month <= 12; month++) push(italy(`${year}-${pad(month)}-05T12:00:00`), CATEGORIES[6], -600, { isRecurring: true, recurringParentId: 'mutuo-1', createdAt: italy('2024-01-02T12:00:00'), updatedAt: italy('2024-01-02T12:00:00') });
  }
  return rows;
}

const ROWS = history();

const snapshotsUntil = (last: { year: number; month: number }): MonthlySnapshot[] => {
  const out: MonthlySnapshot[] = [];
  let value = 50_000;
  for (let year = 2021; year <= last.year; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === last.year && month > last.month) break;
      value += 1000 + ((year * 7 + month * 13) % 9) * 250 - 1000;
      out.push({
        id: `owner-${year}-${month}`,
        userId: 'owner',
        year,
        month,
        totalNetWorth: value,
        liquidNetWorth: value,
        illiquidNetWorth: 0,
        byAsset: [],
        createdAt: italy(`${year}-${pad(month)}-28T19:00:00`),
      } as unknown as MonthlySnapshot);
    }
  }
  return out;
};

/** The year documents as the cron leaves them at `builtAt`, from the rows saved by then. */
function totalsAt(rows: Expense[], builtAt: Date): ExpenseTotalsYear[] {
  const saved = rows.filter((r) => r.createdAt <= builtAt);
  const years = [...new Set(saved.map((r) => Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Rome', year: 'numeric' }).format(r.date))))];
  return years.map((year) => buildYearTotals('owner', year, saved, builtAt));
}

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

// ─── Comparing ─────────────────────────────────────────────────────────────

/** Deep equality with numbers within half a cent (D-TM1) and arrays of named rows in any order. */
function expectSame(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected)) return expect(Number.isNaN(actual), path).toBe(true);
    expect(Math.abs(actual - expected), `${path}: ${actual} vs ${expected}`).toBeLessThanOrEqual(0.005);
    return;
  }
  if (expected instanceof Date) {
    expect(actual instanceof Date && actual.getTime(), path).toBe(expected.getTime());
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const a = actual as unknown[];
    expect(a.length, `${path}.length`).toBe(expected.length);
    const keyed = (list: unknown[]) =>
      list.every((x) => x && typeof x === 'object' && ('categoryId' in x || 'subCategoryId' in x))
        ? [...list].sort((x, y) => JSON.stringify([(x as Record<string, unknown>).categoryId, (x as Record<string, unknown>).subCategoryId]).localeCompare(JSON.stringify([(y as Record<string, unknown>).categoryId, (y as Record<string, unknown>).subCategoryId])))
        : list;
    const [sa, se] = [keyed(a), keyed(expected)];
    se.forEach((item, i) => expectSame(sa[i], item, `${path}[${i}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    expect(actual && typeof actual === 'object', path).toBe(true);
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual as object)]);
    for (const key of keys) expectSame((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    return;
  }
  expect(actual, path).toEqual(expected);
}

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
    });
  }

  it('FIRE\'s recent window reads only from January of last year', async () => {
    const now = CLOCKS[0].now;
    const rows = ROWS.filter((r) => r.createdAt <= now);
    const source = sourceOf(rows, totalsAt(rows, CLOCKS[0].builtAt));
    const recent = await loadExpenseFlows('owner', source, { now, from: italy('2025-01-01T00:00:00') });
    expect(recent.every((e) => e.date >= italy('2025-01-01T00:00:00'))).toBe(true);
    expectSame(computeAnnualCashflowData(recent, now), computeAnnualCashflowData(rows, now));
  });
});

describe('CA9 — no totals yet: the readers read the rows, as today', () => {
  it('gives back the rows themselves', async () => {
    const now = CLOCKS[0].now;
    const rows = ROWS.filter((r) => r.createdAt <= now);
    const flows = await loadExpenseFlows('owner', sourceOf(rows, []), { now });
    expect(flows).toHaveLength(rows.length);
    expectSame(readAll(flows, CLOCKS[0].snapshots, now), readAll(rows, CLOCKS[0].snapshots, now));
  });
});
