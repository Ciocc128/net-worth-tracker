/**
 * Tests for lib/utils/spendingTrend.ts and its sentences (cashflowNarrative.ts): the reference
 * values of doc/andamento-spese/README.md § 10, today = 25/10/2026, period October 2026. Pure.
 * Every fixture figure is invented and round (WORKFLOW.md § 1 rule 7).
 */

import { describe, expect, it } from 'vitest';
import type { Expense } from '@/types/expenses';
import type { Period } from '@/lib/utils/period';
import {
  buildSpendingTrend,
  cumulativeByDay,
  parseTrendChoice,
  readSpendingTrend,
  resolveTrendComparison,
  type TrendMonthPeriod,
} from '@/lib/utils/spendingTrend';
import {
  filterExpensesByPeriod,
  settleTotals,
  summarizePeriodCashflow,
  summarizeScheduled,
  previousComparisonWindow,
  currentComparisonWindow,
} from '@/lib/utils/tracciamentoSummary';
import { describeSpendingTrend, describeTrackingClosedAnswers } from '@/lib/utils/cashflowNarrative';
import { narrativeToText as rawText, type Narrative } from '@/lib/utils/narrative';

/** The sentence as typed: the euro sign's no-break space read as a space. */
const narrativeToText = (narrative: Narrative) => rawText(narrative).replace(/[\u00a0\u202f]/g, ' ');

function row(overrides: Partial<Expense> & { amount: number; date: Date }): Expense {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    type: 'variable',
    categoryId: 'c',
    categoryName: 'Spesa',
    currency: 'EUR',
    ...overrides,
    createdAt: overrides.date,
    updatedAt: overrides.date,
  } as Expense;
}

/** Noon, twelve hours clear of any DST edge in every zone the suite runs in. */
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

const OCTOBER: TrendMonthPeriod = { kind: 'month', year: 2026, month: 10 };
const NOW = at(2026, 10, 25);

const AUGUST_ROWS = [
  row({ type: 'fixed', amount: -900, date: at(2026, 8, 1) }),
  row({ amount: -300, date: at(2026, 8, 5) }),
];
const SEPTEMBER_ROWS = [
  row({ type: 'fixed', amount: -900, date: at(2026, 9, 1) }),
  row({ amount: -250, date: at(2026, 9, 18) }),
  row({ amount: -100, date: at(2026, 9, 30) }),
];
const OCTOBER_ROWS = [
  row({ type: 'fixed', amount: -900, date: at(2026, 10, 1) }),
  row({ amount: -140, date: at(2026, 10, 10) }),
  row({ amount: -30, date: at(2026, 10, 12), excludeFromBudget: true }),
  row({ type: 'transfer', amount: 500, date: at(2026, 10, 15) }),
  row({ amount: -60, date: at(2026, 10, 20) }),
  row({ amount: -2, date: at(2026, 10, 20), feeOfTransferId: 'x' }),
  row({ amount: -50, date: at(2026, 10, 25) }),
  row({ type: 'debt', amount: -320, date: at(2026, 10, 28) }),
];

const A = [...AUGUST_ROWS, ...SEPTEMBER_ROWS, ...OCTOBER_ROWS];
const B = [row({ amount: -802, date: at(2026, 6, 1) }), ...A];
const C = [...SEPTEMBER_ROWS, ...OCTOBER_ROWS];
const D = OCTOBER_ROWS;

const last = (series: number[]) => series[series.length - 1];
const option = (trend: ReturnType<typeof buildSpendingTrend>, id: string) => trend.comparisons.find((c) => c.id === id)!;

describe('cumulativeByDay', () => {
  it('should add the rows day by day, counting every spending type and no transfer or income', () => {
    const c = cumulativeByDay(OCTOBER_ROWS, 2026, 10);
    expect(c).toHaveLength(31);
    expect(c[0]).toBe(900);
    expect(c[9]).toBe(1040);
    expect(c[11]).toBe(1070);
    expect(c[14]).toBe(1070); // the transfer on the 15th is not spending
    expect(c[19]).toBe(1132); // 60 + the fee row of 2
    expect(c[27]).toBe(1502);
  });

  it('should count a negative-amount and a positive-amount spending row alike, as a magnitude', () => {
    expect(last(cumulativeByDay([row({ amount: 40, date: at(2026, 10, 3) }), row({ amount: -10, date: at(2026, 10, 3) })], 2026, 10))).toBe(50);
  });
});

describe('buildSpendingTrend — fixture A', () => {
  const trend = buildSpendingTrend(A, OCTOBER, NOW);

  it('should reach 1182 € today and 1502 € at the last day, the two identities of the trio', () => {
    const month = filterExpensesByPeriod(A, OCTOBER);
    const totals = summarizePeriodCashflow(month);
    expect(trend.relation).toBe('current');
    expect(trend.today).toBe(25);
    expect(last(trend.spent)).toBe(1182);
    expect(last(trend.spent)).toBe(settleTotals(totals, summarizeScheduled(month, NOW)).expenses);
    expect(last(trend.withCalendar)).toBe(1502);
    expect(last(trend.withCalendar)).toBe(totals.expenses);
    expect(trend.scheduledTotal).toBe(320);
    expect(trend.withCalendar[26]).toBe(1182);
    expect(trend.withCalendar[27]).toBe(1502);
  });

  it('should compare with last month at 1150 € on the 25th and 1250 € flat after its last day', () => {
    const previous = option(trend, 'precedente');
    expect(previous.series?.[24]).toBe(1150);
    expect(previous.series?.[30]).toBe(1250);
    expect(previous.total).toBe(1250);
    expect(previous.label).toBe('Settembre');
  });

  it('should give last month the same delta as the trio on the same windows (+32 €)', () => {
    const spend = (window: Period) => summarizePeriodCashflow(filterExpensesByPeriod(A, window)).expenses;
    const trio = spend(currentComparisonWindow(OCTOBER as Period, NOW)!) - spend(previousComparisonWindow(OCTOBER as Period, NOW)!);
    const reading = readSpendingTrend(trend, option(trend, 'precedente'));
    expect(reading.comparison?.delta).toBe(32);
    expect(trio).toBe(32);
  });

  it('should average two closed months: 1175 € on the 25th, closing at 1225 €, +7 €', () => {
    const media = option(trend, 'media');
    expect(media.available).toBe(true);
    expect(media.months).toBe(2);
    expect(media.label).toBe('Media 2 mesi');
    expect(media.series?.[24]).toBe(1175);
    expect(media.total).toBe(1225);
    expect(readSpendingTrend(trend, media).comparison?.delta).toBe(7);
  });

  it('should switch off a year ago, with the reason, and default to the mean', () => {
    const yearAgo = option(trend, 'annoPrima');
    expect(yearAgo.available).toBe(false);
    expect(yearAgo.label).toBe('Ottobre 2025');
    expect(yearAgo.reason).toBe('Nessun movimento a ottobre 2025');
    expect(resolveTrendComparison(trend, null)?.id).toBe('media');
    expect(resolveTrendComparison(trend, 'annoPrima')?.id).toBe('media');
    expect(resolveTrendComparison(trend, 'precedente')?.id).toBe('precedente');
  });

  it('should write the reference sentence', () => {
    const reading = readSpendingTrend(trend, resolveTrendComparison(trend, null));
    expect(narrativeToText(describeSpendingTrend(reading))).toBe(
      'Al 25 ottobre hai speso 1182 €, 7 € in più della media degli ultimi 2 mesi agli stessi giorni. La media chiude il mese a 1225 €.',
    );
  });

  it('should colour a spending excess as a loss and a saving as a gain', () => {
    const more = describeSpendingTrend(readSpendingTrend(trend, option(trend, 'precedente')));
    expect(more.find((s) => s.sign)?.sign).toBe('negative');
    const lighter = [row({ amount: -100, date: at(2026, 9, 5) }), row({ amount: -100, date: at(2026, 8, 5) }), row({ amount: -40, date: at(2026, 10, 5) })];
    const less = buildSpendingTrend(lighter, OCTOBER, NOW);
    const lessSentence = describeSpendingTrend(readSpendingTrend(less, option(less, 'precedente')));
    expect(lessSentence.find((s) => s.sign)?.sign).toBe('positive');
    expect(narrativeToText(lessSentence)).toContain('60 € in meno di settembre');
  });

  it('should say «come» when the difference prints as zero euro', () => {
    const flat = [row({ amount: -100, date: at(2026, 9, 5) }), row({ amount: -100, date: at(2026, 8, 5) }), row({ amount: -100, date: at(2026, 10, 5) })];
    const t = buildSpendingTrend(flat, OCTOBER, NOW);
    expect(narrativeToText(describeSpendingTrend(readSpendingTrend(t, option(t, 'precedente'))))).toBe(
      'Al 25 ottobre hai speso 100 €, come settembre agli stessi giorni. Settembre ha chiuso a 100 €.',
    );
  });

  it('should answer the landscape index with the difference and the comparison', () => {
    const reading = readSpendingTrend(trend, option(trend, 'media'));
    const answers = describeTrackingClosedAnswers({
      expenseRanking: { rows: [], total: 0, remainder: null },
      incomeRanking: { rows: [], total: 0, remainder: null },
      savingsHistory: { months: [], ongoing: null, closedCount: 0, average: null, best: null, worst: null, deficitMonths: [], measuredCount: 0 },
      spendingTrend: reading,
    });
    const text = (answers['trk-andamento'] ?? []).map((s) => s.text).join(' ').replace(/[\u00a0\u202f]/g, ' ');
    expect(text).toBe('7 € sopra la media');
  });
});

describe('buildSpendingTrend — the other histories', () => {
  it('fixture B: four months with an empty July count as zero (788 €, +394 €)', () => {
    const trend = buildSpendingTrend(B, OCTOBER, NOW);
    const media = option(trend, 'media');
    expect(media.months).toBe(4);
    expect(media.label).toBe('Media 4 mesi');
    expect(media.series?.[24]).toBe(788);
    expect(readSpendingTrend(trend, media).comparison?.delta).toBe(394);
  });

  it('fixture C: the mean is off for want of two closed months, last month is the default', () => {
    const trend = buildSpendingTrend(C, OCTOBER, NOW);
    expect(option(trend, 'media').available).toBe(false);
    expect(option(trend, 'media').reason).toBe('Servono almeno 2 mesi chiusi');
    const chosen = resolveTrendComparison(trend, null);
    expect(chosen?.id).toBe('precedente');
    expect(narrativeToText(describeSpendingTrend(readSpendingTrend(trend, chosen)))).toContain('32 € in più di settembre');
  });

  it('fixture D: every comparison is off and the sentence says there is nothing to compare', () => {
    const trend = buildSpendingTrend(D, OCTOBER, NOW);
    expect(trend.comparisons.every((c) => !c.available)).toBe(true);
    expect(resolveTrendComparison(trend, 'media')).toBeNull();
    expect(narrativeToText(describeSpendingTrend(readSpendingTrend(trend, null)))).toBe('Al 25 ottobre hai speso 1182 €. Nessun mese prima da confrontare.');
  });

  it('fixture E: a past February is judged whole against a longer January', () => {
    const rows = [row({ amount: -900, date: at(2027, 1, 1) }), row({ amount: -100, date: at(2027, 1, 29) }), row({ amount: -900, date: at(2027, 2, 1) })];
    const february: TrendMonthPeriod = { kind: 'month', year: 2027, month: 2 };
    const trend = buildSpendingTrend(rows, february, at(2027, 3, 15));
    expect(trend.relation).toBe('past');
    expect(trend.daysInMonth).toBe(28);
    const previous = option(trend, 'precedente');
    expect(previous.series).toHaveLength(28);
    expect(previous.series?.[27]).toBe(900); // the 29th is past the axis
    expect(previous.total).toBe(1000);
    expect(narrativeToText(describeSpendingTrend(readSpendingTrend(trend, previous)))).toBe(
      "A febbraio hai speso 900 €, 100 € in meno di gennaio sull'intero mese.",
    );
  });

  it('should carry the year in the name of a month that is not the period\'s year', () => {
    const rows = [row({ amount: -100, date: at(2025, 12, 5) }), row({ amount: -100, date: at(2026, 1, 5) })];
    const january: TrendMonthPeriod = { kind: 'month', year: 2026, month: 1 };
    const trend = buildSpendingTrend(rows, january, at(2026, 1, 20));
    expect(option(trend, 'precedente').label).toBe('Dicembre 2025');
    expect(option(trend, 'precedente').phrases.than).toBe('di dicembre 2025');
  });

  it('should show a future month as the calendar alone, with no difference', () => {
    const rows = [...A, row({ type: 'debt', amount: -320, date: at(2026, 11, 3) })];
    const november: TrendMonthPeriod = { kind: 'month', year: 2026, month: 11 };
    const trend = buildSpendingTrend(rows, november, NOW);
    expect(trend.relation).toBe('future');
    expect(trend.spent).toEqual([]);
    expect(trend.scheduledTotal).toBe(320);
    const reading = readSpendingTrend(trend, option(trend, 'media'));
    expect(reading.comparison?.delta).toBeNull();
    expect(narrativeToText(describeSpendingTrend(reading))).toBe('A novembre ci sono già 320 € di spese in calendario. La media chiude il mese a 1225 €.');
  });

  it('should spell the day the way it is spoken', () => {
    const t = (day: number) => buildSpendingTrend(D, OCTOBER, at(2026, 10, day));
    const start = (day: number) => narrativeToText(describeSpendingTrend(readSpendingTrend(t(day), null))).slice(0, 16);
    expect(start(1)).toContain("Al 1° ottobre");
    expect(start(8)).toContain("All'8 ottobre");
    expect(start(11)).toContain("All'11 ottobre");
  });
});

describe('parseTrendChoice', () => {
  it('should accept only the three ids', () => {
    expect(parseTrendChoice('media')).toBe('media');
    expect(parseTrendChoice('annoPrima')).toBe('annoPrima');
    expect(parseTrendChoice('altro')).toBeNull();
    expect(parseTrendChoice(null)).toBeNull();
  });
});
