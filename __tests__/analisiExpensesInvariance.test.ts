/**
 * CA5 for Fase B (doc/totali-mensili/README.md § 6.5, § 13): every builder Analisi runs gives the
 * same result on the whole collection and on the list the page now reads — the period's year as
 * real rows, the comparison month as real rows when compared «agli stessi giorni», every other
 * month from the monthly totals (`composeAnalisiExpenses`). One `expectSame` per row of the table
 * of § 6.5: Periodo and its tiles, Ritmo and categorie che cambiano, Fuori scala, the Scheda, the
 * Dettaglio, the years and the search.
 *
 * The history is Fase A's (helpers/expenseHistoryFixture.ts), invented. Two clocks: mid-March with
 * the totals built the evening before, and the 1st of April before the cron (March read from its
 * rows, rule 3 of § 4.3). Run under `TZ=Europe/Rome` and `TZ=UTC`: in UTC the year's window is a few
 * hours wider than the Italian year, and the rows of the neighbouring month it catches must go.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));

import type { Expense } from '@/types/expenses';
import { loadExpenseFlows } from '@/lib/utils/expenseTotals';
import { analisiMonthWindow, analisiYearWindow } from '@/lib/utils/expenseWindows';
import { composeAnalisiExpenses, resolveAnalisiReads, selectAnalisiPeriodRows } from '@/lib/utils/analisiExpenses';
import {
  buildMonthlySpending,
  buildYearlySpending,
  rankTopExpenses,
  resolveSingleMonth,
  summarizeFlow,
  type AnalisiPeriod,
  type MonthRef,
} from '@/lib/utils/analisiSummary';
import {
  buildExpenseComposition,
  buildIncomeComposition,
  buildSubCategoryComposition,
  detectSpendingAnomalies,
  nearestToAnomaly,
} from '@/lib/utils/cashflowComposition';
import { buildCategoryComparison, computeTotalsPacing, resolveComparisonScope, type ComparisonMonthScope } from '@/lib/utils/comparisonDeltas';
import {
  buildEntityMonthlySeries,
  buildEntitySubCategoryDeltas,
  buildEntityYearRows,
  computeEntityRunRate,
  resolveYearRowWindows,
  type EntityScope,
} from '@/lib/utils/expenseEntityStats';
import { selectExpensesForDrillDown } from '@/lib/utils/expenseGrouping';
import { buildSpendingCalendar, summarizeSpendingCalendar } from '@/lib/utils/spendingCalendar';
import { summarizePeriodCashflow, summarizeScheduled, isScheduledRow } from '@/lib/utils/tracciamentoSummary';
import { buildEntitySearchIndex } from '@/lib/utils/entitySearch';
import { summarizeSpendingRoles } from '@/lib/utils/spendingRoles';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import type { ExpenseCategory } from '@/types/expenses';
import { ROWS, expectSame, italy, sourceOf, totalsAt } from './helpers/expenseHistoryFixture';

/** The collection as `getAllExpenses` returns it: newest first (a series' tied amounts pick their row by this order). */
const byDateDesc = (rows: Expense[]) => [...rows].sort((a, b) => b.date.getTime() - a.date.getTime());

const monthOf = (e: Expense): MonthRef => getItalyMonthYear(e.date);
const dayOf = (e: Expense) => {
  const d = getItalyDate(e.date);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
};

/** A taxonomy for the 50/30/20 view: the roles resolve from the category. */
const TAXONOMY = [
  { id: 'spesa', name: 'Spesa', type: 'variable', spendingRole: 'need', subCategories: [] },
  { id: 'svago', name: 'Svago', type: 'variable', spendingRole: 'want', subCategories: [] },
  { id: 'casa', name: 'Casa', type: 'fixed', spendingRole: 'need', subCategories: [] },
  { id: 'mutuo', name: 'Mutuo', type: 'debt', spendingRole: 'need', subCategories: [] },
] as unknown as ExpenseCategory[];

const SCOPES: EntityScope[] = [
  { category: { expenseType: 'variable', key: 'spesa' } },
  { category: { expenseType: 'variable', key: 'spesa' }, subCategory: { key: 'super' } },
  { category: { expenseType: 'income', key: 'stipendio' } },
  { category: { expenseType: 'debt', key: 'mutuo' } },
  { category: { expenseType: 'fixed', key: 'casa' } },
];

/** ConfrontoAnnualeSection's «Mensile» bars, as the component sums them (the running month cut at today's day). */
function mensile(rows: Expense[], currentYear: number, comparisonYear: number, scope: ComparisonMonthScope) {
  const current = new Map<number, number>();
  const comparison = new Map<number, number>();
  for (const e of rows) {
    if (e.type === 'income' || e.type === 'transfer') continue;
    const { year, month, day } = dayOf(e);
    if (scope.kind === 'singleMonth' && scope.throughDay !== undefined && day > scope.throughDay) continue;
    const target = year === currentYear ? current : year === comparisonYear ? comparison : null;
    if (target) target.set(month, (target.get(month) ?? 0) + Math.abs(e.amount));
  }
  // The months the chart draws: the scope's (a month, January to the cut, or twelve).
  const shown = scope.kind === 'singleMonth' ? [scope.month] : Array.from({ length: scope.kind === 'sameMonths' ? scope.upToMonth : 12 }, (_, i) => i + 1);
  return shown.map((month) => ({ month, current: current.get(month) ?? 0, comparison: comparison.get(month) ?? 0 }));
}

/** Everything AnalisiTab and its disclosures compute from the list, for one period. */
function readAnalisi(all: Expense[], period: AnalisiPeriod, now: Date, floor: number, comparisonYears: number[]) {
  const today = getItalyMonthYear(now);
  const todayDay = getItalyDate(now).getDate();
  const base = all.filter((e) => monthOf(e).year >= floor);
  const periodRows = selectAnalisiPeriodRows(base, period, today);
  const single = resolveSingleMonth(period, today);
  const scope = resolveComparisonScope(period.mode, period.month, today.month, todayDay);
  const years = [...new Set(base.map((e) => monthOf(e).year).filter((y) => y <= today.year))].sort();
  const focusPeriod = { year: period.year, month: period.month, throughMonth: period.mode === 'ytd' && period.month === null ? today.month : period.month };

  return {
    // Periodo, the verdict, Spese maggiori, Composizione, Flusso, ruoli, calendario, «in calendario».
    periodIds: periodRows.map((e) => e.id).sort(),
    totals: summarizePeriodCashflow(periodRows),
    scheduled: summarizeScheduled(periodRows, now),
    top: rankTopExpenses(periodRows, dayOf, 5, (e) => isScheduledRow(e, now)),
    expenseSlices: buildExpenseComposition(periodRows),
    incomeSlices: buildIncomeComposition(periodRows),
    flow: summarizeFlow(periodRows),
    roles: summarizeSpendingRoles(periodRows, TAXONOMY),
    calendar: (() => {
      const cal = buildSpendingCalendar(all, period, now, 'all');
      return cal ? { cal, stats: summarizeSpendingCalendar(cal) } : null;
    })(),
    spendingPoints:
      period.year === null
        ? buildYearlySpending(base, floor, monthOf, today)
        : buildMonthlySpending(base, period.year, period.mode === 'ytd' ? today.month : 12, floor, monthOf, today),
    // Fuori scala.
    anomalies: single ? detectSpendingAnomalies(all, single.year, single.month, monthOf) : [],
    nearest: single ? nearestToAnomaly(all, single.year, single.month, monthOf) : null,
    // Ritmo, categorie che cambiano, Confronto (every comparison year the page or the disclosure can pick).
    comparisons: comparisonYears.map((comparisonYear) =>
      period.year === null || !scope
        ? null
        : {
            pacing: computeTotalsPacing(all, period.year, comparisonYear, scope, dayOf),
            rows: buildCategoryComparison(all, period.year, comparisonYear, scope, dayOf),
            mensile: mensile(all, period.year, comparisonYear, scope),
          },
    ),
    // The Scheda.
    scheda: SCOPES.map((s) => {
      const yearRows = buildEntityYearRows(all, s, floor, today, monthOf);
      return {
        runRate: computeEntityRunRate(all, s, focusPeriod, floor, today, monthOf),
        yearRows,
        series: buildEntityMonthlySeries(all, s, 24, floor, today, monthOf),
        subDeltas: s.subCategory
          ? null
          : yearRows.map((row) => {
              const w = resolveYearRowWindows(row, today.month);
              return buildEntitySubCategoryDeltas(all, s.category, w.current, w.baseline, floor, monthOf);
            }),
        subRows: buildSubCategoryComposition(periodRows, s.category),
        movements: selectExpensesForDrillDown(periodRows, s.category, s.subCategory).map((e) => e.id).sort(),
      };
    }),
    // The years of the selector and the search's names.
    years,
    search: buildEntitySearchIndex([], base).map((item) => `${item.id}|${item.label}`).sort(),
  };
}

const CLOCKS = [
  { name: 'mid-March', now: italy('2026-03-15T12:00:00'), builtAt: italy('2026-03-14T19:00:00') },
  { name: 'the 1st of April before the cron', now: italy('2026-04-01T08:00:00'), builtAt: italy('2026-03-31T19:00:00') },
];

const PERIODS = (today: MonthRef): AnalisiPeriod[] => [
  { mode: 'current', year: today.year, month: null },
  { mode: 'current', year: today.year, month: today.month },
  { mode: 'current', year: today.year, month: 1 },
  { mode: 'ytd', year: today.year, month: null },
  { mode: 'year', year: 2024, month: null },
  { mode: 'year', year: 2024, month: 6 },
  { mode: 'year', year: 2025, month: 3 },
];

/** The page's list for a period: the totals' list, the year's window and the comparison month's. */
async function pageList(rows: Expense[], flows: Expense[], period: AnalisiPeriod, now: Date, otherComparisonYear: number | null) {
  const today = getItalyMonthYear(now);
  const reads = resolveAnalisiReads(period, today, getItalyDate(now).getDate());
  if (reads.kind === 'all') return rows;
  const inWindow = (w: { from: Date; to: Date }) => rows.filter((r) => r.date >= w.from && r.date <= w.to);
  const covers = [{ year: reads.year, rows: inWindow(analisiYearWindow(reads.year)) }];
  if (reads.comparisonMonth) covers.push({ ...reads.comparisonMonth, rows: inWindow(analisiMonthWindow(reads.comparisonMonth.year, reads.comparisonMonth.month)) } as never);
  const page = composeAnalisiExpenses(flows, covers);
  // ConfrontoDisclosure: another comparison year, compared on the same days, reads its month.
  if (otherComparisonYear !== null && reads.comparisonMonth) {
    const m = reads.comparisonMonth.month;
    return composeAnalisiExpenses(page, [{ year: otherComparisonYear, month: m, rows: inWindow(analisiMonthWindow(otherComparisonYear, m)) }]);
  }
  return page;
}

describe('CA5 Fase B — Analisi on its year, the comparison month and the totals gives the figures of the rows', () => {
  for (const clock of CLOCKS) {
    it(clock.name, async () => {
      const rows = byDateDesc(ROWS.filter((r) => r.createdAt <= clock.now));
      const flows = await loadExpenseFlows('owner', sourceOf(rows, totalsAt(rows, clock.builtAt)), { now: clock.now });
      const today = getItalyMonthYear(clock.now);
      for (const floor of [2021, 2023]) {
        for (const period of PERIODS(today)) {
          const label = `${clock.name} · floor ${floor} · ${period.mode} ${period.year}/${period.month ?? '-'}`;
          const page = await pageList(rows, flows, period, clock.now, null);
          // The page reads far less than the collection: the point of it.
          expect(page.length, label).toBeLessThan(rows.length / 2);
          expectSame(readAnalisi(page, period, clock.now, floor, [period.year! - 1]), readAnalisi(rows, period, clock.now, floor, [period.year! - 1]), label);
        }
      }
      // Fourteen periods on two lists of the five-year history: the Italian calendar is slow to resolve.
    }, 120_000);
  }

  it('the Confronto on another year, the running month compared on its first days, reads that month too', async () => {
    const clock = CLOCKS[0];
    const rows = byDateDesc(ROWS.filter((r) => r.createdAt <= clock.now));
    const flows = await loadExpenseFlows('owner', sourceOf(rows, totalsAt(rows, clock.builtAt)), { now: clock.now });
    const period: AnalisiPeriod = { mode: 'current', year: 2026, month: 3 };
    const page = await pageList(rows, flows, period, clock.now, 2023);
    expectSame(readAnalisi(page, period, clock.now, 2021, [2023]).comparisons, readAnalisi(rows, period, clock.now, 2021, [2023]).comparisons);
    // Without that month's rows the cut at the 15th would read March 2023 as its total: the guard is real.
    const without = await pageList(rows, flows, period, clock.now, null);
    expect(readAnalisi(without, period, clock.now, 2021, [2023]).comparisons[0]!.mensile[0].comparison).not.toBeCloseTo(
      readAnalisi(rows, period, clock.now, 2021, [2023]).comparisons[0]!.mensile[0].comparison,
      2,
    );
  });

  it('«Storico» reads the whole collection (D-TM19)', () => {
    expect(resolveAnalisiReads({ mode: 'history', year: null, month: null }, { year: 2026, month: 3 }, 15)).toEqual({ kind: 'all' });
  });
});

describe('resolveAnalisiReads', () => {
  const today = { year: 2026, month: 3 };
  it('a year reads its rows; the running month compared on the same days reads the same month a year before', () => {
    expect(resolveAnalisiReads({ mode: 'current', year: 2026, month: null }, today, 15)).toEqual({ kind: 'year', year: 2026, comparisonMonth: null });
    expect(resolveAnalisiReads({ mode: 'current', year: 2026, month: 3 }, today, 15)).toEqual({ kind: 'year', year: 2026, comparisonMonth: { year: 2025, month: 3 } });
    // A closed month of the running year compares whole months: no day to cut, no month to read.
    expect(resolveAnalisiReads({ mode: 'current', year: 2026, month: 2 }, today, 15)).toEqual({ kind: 'year', year: 2026, comparisonMonth: null });
    expect(resolveAnalisiReads({ mode: 'year', year: 2024, month: 3 }, today, 15)).toEqual({ kind: 'year', year: 2024, comparisonMonth: null });
  });
});

describe('composeAnalisiExpenses', () => {
  const row = (id: string, iso: string, amount = -10): Expense =>
    ({ id, userId: 'u', type: 'variable', categoryId: 'c', categoryName: 'C', amount, currency: 'EUR', date: italy(iso), createdAt: italy(iso), updatedAt: italy(iso) }) as Expense;

  it('replaces the covered months, keeps the others, and drops the neighbouring month a wide window catches', () => {
    // Hand-made: the totals' list holds one aggregated row for December 2024 (−300) and one for
    // January 2025 (−200); the year 2025 is read from its rows: a −120 and a −80 in January, and —
    // caught by a window a few hours wider than the Italian year — the 31 December 2024 row at 23:30.
    const flows = [
      { ...row('agg:2024-12:0', '2024-12-15T12:00:00', -300), aggregateCount: 4 },
      { ...row('agg:2025-01:0', '2025-01-15T12:00:00', -200), aggregateCount: 2 },
    ];
    const year = [row('a', '2025-01-10T12:00:00', -120), row('b', '2025-01-20T12:00:00', -80), row('edge', '2024-12-31T23:30:00', -55)];
    const out = composeAnalisiExpenses(flows, [{ year: 2025, rows: year }]);
    // December 2024 stays the total (−300, one row for four); January 2025 is −120 and −80, its total gone; the edge row is not counted twice.
    expect(out.map((e) => e.id)).toEqual(['b', 'a', 'agg:2024-12:0']);
    expect(out.reduce((s, e) => s + e.amount, 0)).toBe(-500);
  });
});
