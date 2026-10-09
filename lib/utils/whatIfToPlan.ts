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
 * falls is written as an expense of the same size (an income can't be negative), the same figure by σ.
 * Empty when the event moves nothing.
 */
export function eventToDatedFlows(baseline: WhatIfBaseline, scenario: WhatIfScenario, calendarYear: number, newId: () => string = () => crypto.randomUUID()): DatedFlow[] {
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
      const recurring = (kind: 'expense' | 'income', label: string, amount: number): DatedFlow => ({ id: newId(), label, kind, amount, indexed: true, start, durationYears: null, inCashflowToday: false });
      if (savings > 0) out.push(recurring('income', 'Più risparmio', savings));
      if (savings < 0) out.push(recurring('expense', 'Meno risparmio', -savings));
      if (expenses !== 0) out.push(recurring('expense', expenses > 0 ? 'Più spese' : 'Meno spese', expenses));
      return out;
    }
  }
}
