/**
 * accumulationNarrative — the words the PAC (Accumulo) feature speaks.
 *
 * Session S1 seeds only `describeDraftIssue`, the one function `accumulationPlanSchema.ts` needs
 * so no Italian string is written inline in the schema module (doc/pac-ate.md §6). The tile/dialog
 * readings (`describeAccumulationNone`, `describeAccumulationActive`, …) land in session S4 along
 * with this file's full test suite.
 */
import { formatPercentageIt } from './formatters';

export type DraftIssueCode =
  | 'weights_sum'
  | 'weight_negative'
  | 'duplicate_asset'
  | 'buy_not_member'
  | 'position_not_tradable'
  | 'source_not_cash'
  | 'unassigned_tradable'
  | 'months_range'
  | 'negative_amount'
  | 'no_positions';

/** What `validateDraftAgainstAssets` knows about a finding — enough to phrase it, not the final `DraftIssue`. */
export type DraftIssueContext =
  | { code: 'weights_sum'; sum: number }
  | { code: 'weight_negative'; label: string }
  | { code: 'duplicate_asset'; label: string }
  | { code: 'buy_not_member'; label: string }
  | { code: 'position_not_tradable'; label: string }
  | { code: 'source_not_cash'; label: string }
  | { code: 'unassigned_tradable'; label: string }
  | { code: 'months_range' }
  | { code: 'negative_amount' }
  | { code: 'no_positions' };

/** One Italian sentence per §6 code. */
export function describeDraftIssue(context: DraftIssueContext): string {
  switch (context.code) {
    case 'weights_sum':
      return `La somma dei pesi delle posizioni è ${formatPercentageIt(context.sum)}: deve essere 100%.`;
    case 'weight_negative':
      return `Il peso di «${context.label}» è negativo: deve essere maggiore o uguale a zero.`;
    case 'duplicate_asset':
      return `«${context.label}» compare in più di una posizione (o anche in una vendita): ogni asset può comparire una sola volta nel piano.`;
    case 'buy_not_member':
      return `Lo strumento d'acquisto di «${context.label}» non fa parte del gruppo: scegli un membro della posizione.`;
    case 'position_not_tradable':
      return `«${context.label}» non è negoziabile: solo gli asset tradable possono entrare nel piano.`;
    case 'source_not_cash':
      return `«${context.label}» non è un conto di liquidità: scegli un conto sorgente di classe Liquidità.`;
    case 'unassigned_tradable':
      return `«${context.label}» ha un valore ma non è né in una posizione né in una vendita: assegnalo o escludilo.`;
    case 'months_range':
      return 'La durata deve essere un numero intero tra 1 e 60 mesi.';
    case 'negative_amount':
      return `La riserva e l'entrata mensile stimata non possono essere negative.`;
    case 'no_positions':
      return 'Il piano non ha nessuna posizione: aggiungine almeno una.';
    default:
      return 'Il piano non è valido.';
  }
}
