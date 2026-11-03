/**
 * Tests for lib/utils/spendingCalendar.ts: the reference values of doc/calendario-spese/README.md
 * § 10 (fixtures A–D). Pure. Every figure is invented and round (WORKFLOW.md § 1 rule 7).
 */

import { describe, expect, it } from 'vitest';
import type { Expense } from '@/types/expenses';
import type { AnalisiPeriod } from '@/lib/utils/analisiSummary';
import {
  buildSpendingCalendar,
  resolveCalendarWindow,
  summarizeSpendingCalendar,
  weekdayOf,
} from '@/lib/utils/spendingCalendar';
import { summarizePeriodCashflow } from '@/lib/utils/tracciamentoSummary';


function row(overrides: Partial<Expense> & { amount: number; date: Date }): Expense {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    type: 'variable',
    categoryId: 'c',
    categoryName: 'Spesa',
    currency: 'EUR',
    ...overrides,
  } as Expense;
}

const noon = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12);

/** Fixture A (§ 10): amounts are magnitudes, stored negative like a real expense. */
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

describe('fixture A — year 2026, today 15/01/2027', () => {
  const all = buildSpendingCalendar(FIXTURE_A, YEAR_2026, AFTER, 'all')!;

  it('sums a day by cents, excluding transfers, and adds up to the trio', () => {
    expect(cell(all, '2026-03-07').total).toBe(50);
    expect(cell(all, '2026-03-14').total).toBe(1313.3);
    expect(cell(all, '2026-03-20').total).toBe(62);
    const sum = all.days.reduce((acc, d) => acc + d.total, 0);
    expect(Math.round(sum * 100) / 100).toBe(2657.3);
    expect(summarizeSpendingCalendar(all).total).toBe(summarizePeriodCashflow(FIXTURE_A).expenses);
  });

  it('counts 6 spending days over 365', () => {
    const stats = summarizeSpendingCalendar(all);
    expect(stats.spendingDays).toBe(6);
    expect(stats.pastDays).toBe(365);
  });

  it('puts the quartile limits at 50 / 320 / 900 and the steps as the dossier lists', () => {
    expect(all.thresholds).toEqual([50, 320, 900]);
    expect(cell(all, '2026-03-18').step).toBe(1);
    expect(cell(all, '2026-03-07').step).toBe(1);
    expect(cell(all, '2026-03-20').step).toBe(2);
    expect(cell(all, '2026-03-28').step).toBe(2);
    expect(cell(all, '2026-03-01').step).toBe(3);
    expect(cell(all, '2026-03-14').step).toBe(4);
    expect(all.stepsUsed).toEqual([1, 2, 3, 4]);
  });

  it('finds Saturday the heaviest weekday: 52 Saturdays, the mean over all of them', () => {
    const stats = summarizeSpendingCalendar(all);
    expect(stats.heaviestWeekday).toBe(5);
    expect(stats.heaviestMean).toBeCloseTo(1683.3 / 52, 6);
    expect(Math.round(stats.heaviestMean)).toBe(32);
    expect(stats.othersMean).toBeCloseTo(974 / 313, 6);
    expect(Math.round(stats.othersMean)).toBe(3);
    expect(stats.topDay?.date).toBe('2026-03-14');
  });

  it('«Solo variabili» drops fixed and debt rows and keeps the variable fee', () => {
    const variable = buildSpendingCalendar(FIXTURE_A, YEAR_2026, AFTER, 'variable')!;
    expect(cell(variable, '2026-03-20').total).toBe(62);
    expect(cell(variable, '2026-03-01').total).toBe(0);
    expect(cell(variable, '2026-03-28').total).toBe(0);
    expect(summarizeSpendingCalendar(variable).spendingDays).toBe(4);
    expect(variable.hasAnyRows).toBe(true);
  });

  it('keeps the grid whole: the 2026 starts on a Thursday', () => {
    expect(all.days).toHaveLength(365);
    expect(all.startWeekday).toBe(3);
    expect(weekdayOf(2026, 3, 7)).toBe(5);
  });
});

describe('fixture B — current 2026, today 20/03/2026', () => {
  const today = new Date(2026, 2, 20, 12);
  const cal = buildSpendingCalendar(FIXTURE_A, { mode: 'current', year: 2026, month: null }, today, 'all')!;

  it('leaves the 28th out of the scale and the reading, shown as scheduled', () => {
    const d = cell(cal, '2026-03-28');
    expect(d.isFuture).toBe(true);
    expect(d.step).toBe(0);
    expect(d.total).toBe(0);
    expect(d.planned).toBe(320);
    const stats = summarizeSpendingCalendar(cal);
    expect(stats.pastDays).toBe(79);
    expect(stats.planned).toBe(320);
    expect(stats.spendingDays).toBe(5);
  });

  it('keeps the rows of the scheduled day for the popover', () => {
    expect(cell(cal, '2026-03-28').lines).toEqual([expect.objectContaining({ label: 'Rata', amount: 320 })]);
    expect(cell(cal, '2026-03-20').isToday).toBe(true);
  });

  it('«ytd» stops at the end of today\'s month', () => {
    const ytd = buildSpendingCalendar(FIXTURE_A, { mode: 'ytd', year: 2026, month: null }, today, 'all')!;
    expect(ytd.days).toHaveLength(31 + 28 + 31);
  });
});

describe('fixture C — March 2026 picked, today 15/01/2027', () => {
  const cal = buildSpendingCalendar(FIXTURE_A, { mode: 'year', year: 2026, month: 3 }, AFTER, 'all')!;

  it('is a 31-day month calendar whose 1st (a Sunday) is the last column', () => {
    expect(cal.kind).toBe('month');
    expect(cal.days).toHaveLength(31);
    expect(cal.startWeekday).toBe(6);
  });

  it('counts 6 days of 31 and names the 14th', () => {
    const stats = summarizeSpendingCalendar(cal);
    expect(stats.spendingDays).toBe(6);
    expect(stats.pastDays).toBe(31);
    expect(stats.topDay?.day).toBe(14);
    expect(stats.topDay?.total).toBe(1313.3);
  });
});

describe('fixture D — November 2026, today 03/11/2026', () => {
  const rows = [
    row({ date: noon(11, 1), amount: -900, type: 'fixed' }),
    row({ date: noon(11, 2), amount: -90.67 }),
    row({ date: noon(11, 28), amount: -320, type: 'debt' }),
  ];
  const cal = buildSpendingCalendar(rows, { mode: 'year', year: 2026, month: 11 }, new Date(2026, 10, 3, 12), 'all')!;

  it('splits spent from scheduled', () => {
    const stats = summarizeSpendingCalendar(cal);
    expect(stats.total).toBe(990.67);
    expect(stats.spendingDays).toBe(2);
    expect(stats.planned).toBe(320);
    expect(stats.pastDays).toBe(3);
  });
});

describe('edges', () => {
  it('has no window for the history', () => {
    expect(buildSpendingCalendar(FIXTURE_A, { mode: 'history', year: null, month: null }, AFTER, 'all')).toBeNull();
    expect(resolveCalendarWindow({ mode: 'history', year: null, month: null }, { year: 2026, month: 3 })).toBeNull();
  });

  it('flags a period with no spending rows', () => {
    const cal = buildSpendingCalendar([], YEAR_2026, AFTER, 'all')!;
    expect(cal.hasAnyRows).toBe(false);
    expect(cal.thresholds).toBeNull();
    expect(summarizeSpendingCalendar(cal).topDay).toBeNull();
  });

  it('with fewer than four spending days, an unused step has no legend entry', () => {
    const rows = [row({ date: noon(3, 2), amount: -10 }), row({ date: noon(3, 3), amount: -20 })];
    const cal = buildSpendingCalendar(rows, YEAR_2026, AFTER, 'all')!;
    expect(cal.stepsUsed.length).toBeLessThan(4);
  });

  it('reads the Italian day of a row dated just after midnight in Rome', () => {
    // 22:30 UTC on the 6th is 00:30 on the 7th in Rome (CET).
    const rows = [row({ date: new Date(Date.UTC(2026, 2, 6, 23, 30)), amount: -10 })];
    const cal = buildSpendingCalendar(rows, YEAR_2026, AFTER, 'all')!;
    expect(cell(cal, '2026-03-07').total).toBe(10);
  });

});
