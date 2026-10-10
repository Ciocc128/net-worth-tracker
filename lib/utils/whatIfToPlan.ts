/**
 * «Aggiungi al piano» (doc/fire-ipotesi/README.md § 22, WP1–WP5): the What If's event written as the plan's dated flows.
 * Pure: the page puts the result in «Il mio piano»'s draft (`flows` of `useFirePlan().onFormChange`), nothing is saved here.
 */
import { MAX_FLOW_LABEL_LENGTH } from '@/lib/utils/datedFlowValidation';
import type { DatedFlow } from '@/types/assets';
import type { WhatIfBaseline, WhatIfScenario } from '@/types/whatIf';

const nonNegative = (value: number): number => (value > 0 ? value : 0);

/**
 * The scenario as saved flows, anchored to `calendarYear` (the event's «Quando», or this year for an event of today).
 * A lump is one voice; a cashflow change is up to two recurring voices, indexed and for ever. A savings delta that
 * falls is written as an expense of the same size (an income can't be negative), the same figure by σ. The savings voice
 * is a salary: it runs up to the FIRE year of the Base (`fireYear`, before the event), not for ever; with no FIRE year it
 * runs for ever, and when the event lands on or after the FIRE year there are no savings to change.
 * Empty when the event moves nothing.
 */
export function eventToDatedFlows(baseline: WhatIfBaseline, scenario: WhatIfScenario, calendarYear: number, fireYear: number | null = null, newId: () => string = () => crypto.randomUUID()): DatedFlow[] {
  const start = { anchor: 'year', year: calendarYear } as const;
  const lump = (kind: 'lumpIn' | 'lumpOut', label: string, amount: number): DatedFlow[] =>
    amount > 0 ? [{ id: newId(), label: label.slice(0, MAX_FLOW_LABEL_LENGTH), kind, amount, indexed: true, start, durationYears: null }] : [];
  switch (scenario.eventType) {
    case 'jobLoss': {
      const months = nonNegative(scenario.monthsWithoutIncome ?? 0);
      const lost = nonNegative(scenario.lostAnnualIncome ?? baseline.annualIncome ?? baseline.annualExpenses + baseline.annualSavings);
      return lump('lumpOut', 'Perdita di lavoro', (lost * months) / 12);
    }
    case 'majorPurchase':
      return lump('lumpOut', 'Acquisto importante', nonNegative(scenario.lumpSumAmount ?? 0));
    case 'windfall':
      return lump('lumpIn', 'Entrata straordinaria', nonNegative(scenario.lumpSumAmount ?? 0));
    case 'cashflowChange': {
      const out: DatedFlow[] = [];
      const savings = scenario.annualSavingsDelta ?? 0;
      const expenses = scenario.annualExpensesDelta ?? 0;
      const recurring = (kind: 'expense' | 'income', label: string, amount: number, durationYears: number | null = null): DatedFlow => ({ id: newId(), label, kind, amount, indexed: true, start, durationYears, inCashflowToday: false });
      const savingsYears = fireYear === null ? null : fireYear - calendarYear;
      if (savingsYears === null || savingsYears >= 1) {
        if (savings > 0) out.push(recurring('income', 'Più risparmio', savings, savingsYears));
        if (savings < 0) out.push(recurring('expense', 'Meno risparmio', -savings, savingsYears));
      }
      if (expenses !== 0) out.push(recurring('expense', expenses > 0 ? 'Più spese' : 'Meno spese', expenses));
      return out;
    }
  }
}
