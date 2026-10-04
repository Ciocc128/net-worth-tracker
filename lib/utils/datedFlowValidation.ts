/**
 * Validation of a dated flow (doc/fire-ipotesi/README.md § 12.5), shared by the dialog and the save so
 * the rules cannot drift. Errors are the Italian sentences the user reads; `null` = valid.
 */
import type { DatedFlow } from '@/types/assets';

export const MAX_DATED_FLOWS = 20;
export const MAX_FLOW_LABEL_LENGTH = 60;

const isWhole = (value: number): boolean => Number.isInteger(value);

/** The first broken rule of one flow, or null. `currentYear` bounds the calendar year (−50 / +100). */
export function validateDatedFlow(flow: DatedFlow, currentYear: number): string | null {
  const recurring = flow.kind === 'expense' || flow.kind === 'income';
  if (flow.label.trim().length === 0) return 'Scrivi un nome per il flusso.';
  if (flow.label.length > MAX_FLOW_LABEL_LENGTH) return `Il nome può avere al massimo ${MAX_FLOW_LABEL_LENGTH} caratteri.`;
  if (!Number.isFinite(flow.amount) || flow.amount === 0) return 'L\'importo deve essere diverso da zero.';
  if (flow.amount < 0 && flow.kind !== 'expense') return 'L\'importo deve essere positivo: il tipo dice se entra o esce.';
  if (recurring) {
    if (flow.durationYears !== null && (!Number.isFinite(flow.durationYears) || !isWhole(flow.durationYears) || flow.durationYears < 1)) {
      return 'La durata è un numero intero di anni, da 1 in su, oppure "per sempre".';
    }
    if (!flow.indexed && flow.durationYears === null) return 'Un importo fisso, non rivalutato, ha bisogno di una fine: scrivi per quanti anni dura.';
  }
  const { start } = flow;
  if (start.anchor === 'fire') {
    if (!recurring) return 'Una voce una tantum non può essere legata al FIRE: indica un anno o un\'età.';
    if (!Number.isFinite(start.afterYears) || !isWhole(start.afterYears) || start.afterYears < 0 || start.afterYears > 50) {
      return 'Gli anni dopo il FIRE sono un numero intero da 0 a 50.';
    }
  } else if (start.anchor === 'year') {
    if (!Number.isFinite(start.year) || !isWhole(start.year) || start.year < currentYear - 50 || start.year > currentYear + 100) {
      return `L'anno deve stare tra ${currentYear - 50} e ${currentYear + 100}.`;
    }
  } else if (!Number.isFinite(start.age) || !isWhole(start.age) || start.age < 0 || start.age > 120) {
    return 'L\'età deve stare tra 0 e 120 anni.';
  }
  return null;
}

/** The first broken rule of the whole list (count included), or null. A mortgage-linked flow derives its figures, so only its name is checked. */
export function validateDatedFlows(flows: readonly DatedFlow[], currentYear: number): string | null {
  if (flows.length > MAX_DATED_FLOWS) return `Al massimo ${MAX_DATED_FLOWS} flussi.`;
  for (const flow of flows) {
    if (flow.source?.kind === 'mortgage') {
      if (flow.label.trim().length === 0 || flow.label.length > MAX_FLOW_LABEL_LENGTH) return validateDatedFlow({ ...flow, amount: 1, indexed: true, start: { anchor: 'year', year: currentYear }, durationYears: null }, currentYear);
      continue;
    }
    const problem = validateDatedFlow(flow, currentYear);
    if (problem) return `${flow.label || 'Flusso'}: ${problem}`;
  }
  return null;
}
