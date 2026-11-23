/**
 * What Analisi reads, and how the pieces become the ONE list its builders take (totali mensili,
 * Fase B — doc/totali-mensili/README.md § 6.5, D-TM19).
 *
 * Until 2026-11-23 the page read every row of the account. Now, for the three modes on a year
 * («Da inizio anno», «Anno corrente», «Anno»):
 *
 *   - the YEAR the period is about arrives as its REAL rows (`analisiYearWindow`): the tiles of
 *     the period look at a row's day (the calendar, «in calendario», the running month cut at
 *     today), its text (Spese maggiori, the Scheda's movements) and count rows («N spese», the
 *     transfers of the verdict);
 *   - when the running month is compared «agli stessi giorni» (`scope.throughDay`), the comparison
 *     month too arrives as its real rows (`analisiMonthWindow`): the cut reads the day on both sides;
 *   - every other month arrives from the monthly totals (`useExpenseFlows`, the list Storico reads):
 *     aggregated rows for the months with a trusted total, real rows for the running month and for
 *     the months the totals cannot vouch for. Those months feed only builders that SUM by month,
 *     type and category (Fuori scala's six months, the Scheda's years and pace, the Confronto, the
 *     Dettaglio, the search's names), so the figures are the same (D-TM1,
 *     `__tests__/analisiExpensesInvariance.test.ts`).
 *
 * «Storico» reads the whole collection, as before (D-TM19): Spese maggiori ranks a SERIES as one
 * entry worth all its rows, and no total can give that sum. The mode costs what it cost; the three
 * modes on a year — the page's default among them — read a year of rows and the totals.
 */

import type { Expense } from '@/types/expenses';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { resolveComparisonScope } from '@/lib/utils/comparisonDeltas';
import { resolvePeriodThroughMonth, type AnalisiPeriod, type MonthRef } from '@/lib/utils/analisiSummary';

/** What the page needs to read for a period. */
export type AnalisiReads =
  | { kind: 'all' }
  | {
      kind: 'year';
      /** The year read from its rows. */
      year: number;
      /** The month read from its rows besides the year, or null. */
      comparisonMonth: MonthRef | null;
    };

/**
 * The reads of a period. «Storico» reads every row; a year reads its rows, plus — the running month
 * compared on its first days — the same month of the year before.
 *
 * @param period - The period the page shows
 * @param today - Today's Italian month
 * @param todayDay - Today's Italian day of the month
 */
export function resolveAnalisiReads(period: AnalisiPeriod, today: MonthRef, todayDay: number): AnalisiReads {
  if (period.mode === 'history' || period.year === null) return { kind: 'all' };
  const scope = resolveComparisonScope(period.mode, period.month, today.month, todayDay);
  const sameDays = scope !== null && scope.kind === 'singleMonth' && scope.throughDay !== undefined;
  return {
    kind: 'year',
    year: period.year,
    comparisonMonth: sameDays && scope.kind === 'singleMonth' ? { year: period.year - 1, month: scope.month } : null,
  };
}

/** A stable label of the reads: what tells the page the list it holds is the one it asked for. */
export function analisiReadsKey(reads: AnalisiReads): string {
  if (reads.kind === 'all') return 'all';
  const month = reads.comparisonMonth ? `${reads.comparisonMonth.year}-${reads.comparisonMonth.month}` : '-';
  return `year:${reads.year}:${month}`;
}

/** What one read of real rows covers: a whole Italian year, or one Italian month of it. */
export interface RealRowsCover {
  year: number;
  month?: number;
  rows: Expense[];
}

const covers = (cover: Pick<RealRowsCover, 'year' | 'month'>, when: MonthRef): boolean =>
  when.year === cover.year && (cover.month === undefined || when.month === cover.month);

/** Newest first, as `getAllExpenses` orders the rows. */
const byDateDesc = (a: Expense, b: Expense) => b.date.getTime() - a.date.getTime();

/**
 * The list the builders take: `flows` (the totals' list) with every month a cover holds replaced
 * by that cover's real rows. A month is never both (D-TM3). A window read in a browser outside
 * Italy is a few hours wider than the Italian month (lib/utils/expenseWindows.ts): the rows of the
 * neighbouring month it catches are dropped, the flows keep that month.
 *
 * @param flows - The months as the totals give them (`useExpenseFlows`)
 * @param realCovers - The years and months read from their rows
 */
export function composeAnalisiExpenses(flows: Expense[], realCovers: RealRowsCover[]): Expense[] {
  const isCovered = (when: MonthRef) => realCovers.some((cover) => covers(cover, when));
  const out: Expense[] = [];
  const seen = new Set<string>();
  for (const row of flows) {
    if (isCovered(getItalyMonthYear(row.date))) continue;
    out.push(row);
  }
  for (const cover of realCovers) {
    for (const row of cover.rows) {
      if (seen.has(row.id) || !covers(cover, getItalyMonthYear(row.date))) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out.sort(byDateDesc);
}

/**
 * The rows of the period, from the page's floored list. A year is January → December even while it
 * is running (the Tracciamento rule: the calendar's rows are shown, `summarizeScheduled` names
 * them); «Da inizio anno» stops at the end of today's month; the history closes on the CURRENT
 * year, calendar included — not on the last row a plan wrote.
 *
 * Every row it returns is a real one in the three modes on a year (the year is read from its rows);
 * in «Storico» the page reads the whole collection, so there too.
 */
export function selectAnalisiPeriodRows(rows: Expense[], period: AnalisiPeriod, today: MonthRef): Expense[] {
  if (period.year === null) return rows.filter((row) => getItalyMonthYear(row.date).year <= today.year);
  const throughMonth = resolvePeriodThroughMonth(period, today);
  return rows.filter((row) => {
    const when = getItalyMonthYear(row.date);
    if (when.year !== period.year) return false;
    if (throughMonth !== null && when.month > throughMonth) return false;
    return period.month === null || when.month === period.month;
  });
}
