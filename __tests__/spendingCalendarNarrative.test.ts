/**
 * Tests for the Calendario delle spese's sentences (analisiNarrative.ts): doc/calendario-spese/README.md
 * § 5.5 and § 10 criteria 4, 9, 10. Pure; chartService's Firebase chain is mocked like
 * __tests__/analisiNarrative.test.ts. Every figure is invented and round (WORKFLOW.md § 1 rule 7).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import type { Expense } from '@/types/expenses';
import type { AnalisiPeriod } from '@/lib/utils/analisiSummary';
import { buildSpendingCalendar, summarizeSpendingCalendar } from '@/lib/utils/spendingCalendar';
import { describeCalendarAnswer, describeCalendarCell, describeSpendingCalendar } from '@/lib/utils/analisiNarrative';
import { narrativeToText as rawText, type Narrative } from '@/lib/utils/narrative';

const narrativeToText = (narrative: Narrative) => rawText(narrative).replace(/[\u00a0\u202f]/g, ' ');

function row(overrides: Partial<Expense> & { amount: number; date: Date }): Expense {
  return { id: crypto.randomUUID(), userId: 'u1', type: 'variable', categoryId: 'c', categoryName: 'Spesa', currency: 'EUR', ...overrides } as Expense;
}
const noon = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12);
const FIXTURE_A: Expense[] = [
  row({ date: noon(3, 1), amount: -900, type: 'fixed', categoryName: 'Affitto' }),
  row({ date: noon(3, 7), amount: -40.5 }),
  row({ date: noon(3, 7), amount: -9.5, categoryName: 'Bar' }),
  row({ date: noon(3, 14), amount: -1240, categoryName: 'Officina' }),
  row({ date: noon(3, 14), amount: -73.3, categoryName: 'Ristorante' }),
  row({ date: noon(3, 18), amount: -12, categoryName: 'Farmacia' }),
  row({ date: noon(3, 20), amount: 500, type: 'transfer' }),
  row({ date: noon(3, 20), amount: -60 }),
  row({ date: noon(3, 20), amount: -2, categoryName: 'Commissioni', feeOfTransferId: 'x' }),
  row({ date: noon(3, 28), amount: -320, type: 'debt', categoryName: 'Rata' }),
];
const YEAR_2026: AnalisiPeriod = { mode: 'year', year: 2026, month: null };
const AFTER = new Date(2027, 0, 15, 12);
const cell = (cal: NonNullable<ReturnType<typeof buildSpendingCalendar>>, iso: string) => cal.days.find((d) => d.date === iso)!;

describe('the sentences (§ 5.5, § 10 criteria 4, 9, 10)', () => {
  const text = (n: Narrative) => narrativeToText(n).replace(/[  ]/g, ' ');
  const today = { year: 2027, month: 1, day: 15 };

  it('reads the year', () => {
    const cal = buildSpendingCalendar(FIXTURE_A, YEAR_2026, AFTER, 'all')!;
    expect(text(describeSpendingCalendar(cal, summarizeSpendingCalendar(cal), 'all', today))).toBe(
      'Nel 2026 hai speso in 6 giorni su 365; il sabato è il giorno più caro, in media 32 € contro 3 € degli altri giorni. Il giorno più caro è stato il 14 marzo, 1313,30 €.',
    );
  });

  it('says «spese variabili» under the filter', () => {
    const cal = buildSpendingCalendar(FIXTURE_A, YEAR_2026, AFTER, 'variable')!;
    expect(text(describeSpendingCalendar(cal, summarizeSpendingCalendar(cal), 'variable', today))).toContain('hai fatto spese variabili in 4 giorni su 365');
  });

  it('reads a past month', () => {
    const cal = buildSpendingCalendar(FIXTURE_A, { mode: 'year', year: 2026, month: 3 }, AFTER, 'all')!;
    expect(text(describeSpendingCalendar(cal, summarizeSpendingCalendar(cal), 'all', today))).toBe(
      'A marzo hai speso in 6 giorni su 31; il più caro è il 14, 1313,30 €.',
    );
  });

  it('reads the running month with what is still scheduled', () => {
    const rows = [
      row({ date: noon(11, 1), amount: -900, type: 'fixed' }),
      row({ date: noon(11, 2), amount: -90.67 }),
      row({ date: noon(11, 28), amount: -320, type: 'debt' }),
    ];
    const now = new Date(2026, 10, 3, 12);
    const cal = buildSpendingCalendar(rows, { mode: 'year', year: 2026, month: 11 }, now, 'all')!;
    expect(text(describeSpendingCalendar(cal, summarizeSpendingCalendar(cal), 'all', { year: 2026, month: 11, day: 3 }))).toBe(
      'Al 3 novembre hai speso 990,67 € in 2 giorni; in calendario ci sono ancora 320,00 €.',
    );
  });

  it('reads a month that has not started, and drops the second clause of the sentence of the year when the means print alike', () => {
    const rows = [row({ date: noon(12, 1), amount: -900, type: 'fixed' })];
    const now = new Date(2026, 10, 3, 12);
    const cal = buildSpendingCalendar(rows, { mode: 'year', year: 2026, month: 12 }, now, 'all')!;
    expect(text(describeSpendingCalendar(cal, summarizeSpendingCalendar(cal), 'all', { year: 2026, month: 11, day: 3 }))).toBe(
      'A dicembre ci sono già 900,00 € di spese in calendario.',
    );
  });

  it('answers «il sabato» in the index, none on a month', () => {
    const year = buildSpendingCalendar(FIXTURE_A, YEAR_2026, AFTER, 'all')!;
    expect(text(describeCalendarAnswer(year, summarizeSpendingCalendar(year))!)).toBe('il sabato');
    const month = buildSpendingCalendar(FIXTURE_A, { mode: 'year', year: 2026, month: 3 }, AFTER, 'all')!;
    expect(describeCalendarAnswer(month, summarizeSpendingCalendar(month))).toBeNull();
  });

  it('names the cell with its cents', () => {
    const cal = buildSpendingCalendar(FIXTURE_A, YEAR_2026, AFTER, 'all')!;
    expect(describeCalendarCell(cell(cal, '2026-03-14'))).toContain('14 marzo: 1313,30');
    expect(describeCalendarCell(cell(cal, '2026-03-15'))).toBe('15 marzo: nessuna spesa');
  });
});
