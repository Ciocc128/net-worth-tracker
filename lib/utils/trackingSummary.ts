/**
 * Pure layer behind the Cashflow "Tracciamento" tab redesign.
 *
 * The old tab opened with four co-equal KPIs (Entrate / Spese / Risparmio / Rapporto)
 * and a separate "salute" reading expressed twice (the ratio chip AND the savings-rate
 * subtext). The redesign leads with ONE answer — "come sta andando il mese?" — so this
 * module folds those overlapping signals into a single health verdict the hero renders
 * dominantly.
 *
 * Nothing here touches Firebase: every function is a pure transform over the totals the
 * tab already computes via expenseService (`calculateTotalIncome` / `calculateTotalExpenses`),
 * so the unit tests import it without mocking anything.
 *
 * Sign convention (matches expenseService): `income` and `expenses` are BOTH positive
 * magnitudes. Net savings = income − expenses (can be negative).
 */

/**
 * Qualitative tone of the cashflow health verdict. Maps to a sign-color band in the UI:
 *   excellent / good → positive · even → amber · deficit → destructive · neutral → muted.
 */
export type CashflowHealthTone = 'excellent' | 'good' | 'even' | 'deficit' | 'neutral';

export interface CashflowHealthVerdict {
  tone: CashflowHealthTone;
  /** Short headline, e.g. "Salute ottima". */
  headline: string;
  /**
   * Savings rate as a signed integer percentage of income (net / income).
   * 0 when there is no income in the period.
   */
  savingsRate: number;
  /** One short plain-Italian sentence of context shown under the headline. */
  detail: string;
  /**
   * Coverage ratio income ÷ expenses, or null when there are no expenses.
   * Kept on the verdict so the UI can show "1,3×" without recomputing.
   */
  ratio: number | null;
}

// Coverage-ratio bands — same thresholds the legacy `coverageHealthLabel` used, so the
// verdict reads identically to what users already learned, just unified with savings rate.
const RATIO_EXCELLENT = 2.0;
const RATIO_GOOD = 1.3;
const RATIO_EVEN = 1.0;

/**
 * Fold income/expenses into the tab's single health answer: a tone, a headline, the
 * savings rate, and one line of context. Replaces the old ratio-chip + savings-subtext
 * pair (two readings of the same concept) with one verdict.
 *
 * @param income   Gross income for the period (positive magnitude).
 * @param expenses Gross spending for the period (positive magnitude).
 */
export function summarizeCashflowHealth(income: number, expenses: number): CashflowHealthVerdict {
  const ratio = expenses > 0 ? income / expenses : null;
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

  // No movement at all → there is nothing to judge.
  if (income <= 0 && expenses <= 0) {
    return { tone: 'neutral', headline: 'Nessun dato', savingsRate: 0, detail: 'Nessun movimento nel periodo', ratio };
  }

  // Spending with no income recorded: always a deficit, regardless of ratio (null here).
  if (income <= 0) {
    return {
      tone: 'deficit',
      headline: 'In deficit',
      savingsRate: 0,
      detail: 'Spese senza entrate nel periodo',
      ratio,
    };
  }

  // Income with no expenses: everything was saved.
  if (ratio === null) {
    return {
      tone: 'excellent',
      headline: 'Salute ottima',
      savingsRate,
      detail: 'Nessuna spesa: hai messo da parte tutte le entrate',
      ratio,
    };
  }

  if (ratio >= RATIO_EXCELLENT) {
    return { tone: 'excellent', headline: 'Salute ottima', savingsRate, detail: surplusDetail(savingsRate), ratio };
  }
  if (ratio >= RATIO_GOOD) {
    return { tone: 'good', headline: 'Salute buona', savingsRate, detail: surplusDetail(savingsRate), ratio };
  }
  if (ratio >= RATIO_EVEN) {
    return { tone: 'even', headline: 'In pareggio', savingsRate, detail: 'Entrate e uscite quasi in pareggio', ratio };
  }
  return {
    tone: 'deficit',
    headline: 'In deficit',
    savingsRate,
    detail: 'Hai speso più di quanto hai incassato',
    ratio,
  };
}

/** Context line for a period that closed with a surplus. */
function surplusDetail(savingsRate: number): string {
  return `Hai risparmiato il ${savingsRate}% delle entrate`;
}
