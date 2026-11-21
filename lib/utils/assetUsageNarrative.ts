/**
 * The words of the delete-an-asset report (doc/cancellazione-strumenti/README.md § 4.6): pure,
 * tested like every modal's narrative. One sentence per reference code of § 4.1.
 */

/** «1 operazione» / «3 operazioni». */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The reading line at the head of the dialog. */
export function describeDeletion(name: string, ledgerCount: number, quantity: number): string {
  const parts: string[] = [];
  if (ledgerCount > 0) parts.push(plural(ledgerCount, 'operazione', 'operazioni'));
  if (quantity > 0) parts.push(plural(quantity, 'quota', 'quote'));
  const inside = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `Elimini ${name}${inside}. Ecco dove è usato.`;
}

/** What the dialog says when there is nothing to report. */
export const NOT_USED_ELSEWHERE = 'Non è usato altrove.';

/** The line of the ledger choice: what staying does. */
export function describeKeepLedger(ledgerCount: number, pensionCount: number): string {
  const parts: string[] = [];
  if (ledgerCount > 0) parts.push(plural(ledgerCount, 'operazione resta', 'operazioni restano'));
  if (pensionCount > 0) parts.push(plural(pensionCount, 'versamento resta', 'versamenti restano'));
  const tail =
    ledgerCount > 0 && pensionCount > 0
      ? 'nelle somme di Rendimenti e nei movimenti del mese; i versamenti escono dal calcolo del plafond di deduzione in Previdenza'
      : ledgerCount > 0
        ? 'nelle somme di Rendimenti e nei movimenti del mese'
        : 'ma escono dal calcolo del plafond di deduzione in Previdenza';
  return `Tieni la storia: ${parts.join(' e ')} ${tail}.`;
}

export function describeDeleteLedger(ledgerCount: number, pensionCount: number): string {
  const parts: string[] = [];
  if (ledgerCount > 0) parts.push(plural(ledgerCount, 'operazione', 'operazioni'));
  if (pensionCount > 0) parts.push(plural(pensionCount, 'versamento', 'versamenti'));
  return `Cancella ${parts.join(' e ')}. Non si può annullare.`;
}

/** The warning when shares are still held (D-CA2b). */
export const SHARES_LEAVE_WARNING =
  'Le quote escono dal patrimonio senza una vendita: non comparirà come realizzato.';

export function describeDividends(future: number, past: number): string | null {
  if (future === 0 && past === 0) return null;
  const parts: string[] = [];
  if (future > 0) parts.push(`${plural(future, 'dividendo futuro viene cancellato', 'dividendi futuri vengono cancellati')}`);
  if (past > 0) parts.push(`${plural(past, 'dividendo passato resta', 'dividendi passati restano')}`);
  return parts.join(', ');
}

export const SENTENCES = {
  R4: (planName: string) => `Il piano «${planName}» usa questo strumento: rivedilo prima in Accumulo.`,
  R6: (pct: number) => `Il portafoglio modello gli dà il ${pct}%: toglilo prima dal modello.`,
  R7: (min?: number, max?: number) => {
    const bounds = [min !== undefined ? `minimo ${min}%` : null, max !== undefined ? `massimo ${max}%` : null].filter(Boolean);
    return `Limite ${bounds.join(' e ') || 'per strumento'} nei Criteri del modello`;
  },
  R8: (label: string, alone: boolean) =>
    alone ? `Il gruppo «${label}» resta senza membri e sparisce` : `Esce dal gruppo «${label}» nei Criteri del modello`,
  R9: (goalName: string) => `Quota del traguardo «${goalName}»`,
  R10: (field: 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId' | 'dividendCashAssetId') =>
    field === 'defaultDebitCashAssetId'
      ? 'Conto predefinito per le uscite: torna «nessun conto»'
      : field === 'defaultCreditCashAssetId'
        ? 'Conto predefinito per le entrate: torna «nessun conto»'
        : 'Conto dei dividendi: torna «nessun conto»',
  R11: (name: string) => `Conto dei dividendi di «${name}»: torna «nessun conto»`,
  R12: (loanName: string) => `Il mutuo «${loanName}» la finanzia: eliminalo prima.`,
  R2: (count: number) => `${plural(count, 'operazione di un altro strumento regola', 'operazioni di altri strumenti regolano')} il denaro su questo conto: restano`,
  R5: (count: number) => `${plural(count, 'piano concluso lo cita', 'piani conclusi lo citano')}: resta col nome salvato`,
  R13: (count: number) => `${plural(count, 'flusso di «Il mio piano» è collegato', 'flussi di «Il mio piano» sono collegati')} a questo immobile: restano, inerti`,
  R14: (count: number) => `${plural(count, 'movimento del cashflow', 'movimenti del cashflow')} restano senza conto`,
  R15: (count: number) => `${plural(count, 'versamento indicava', 'versamenti indicavano')} questo conto come sorgente: restano`,
} as const;

/**
 * Criteri › a group limit whose member is no longer among the instruments (§ 4.7): said under the
 * selector, so a deleted instrument is not a silent hole in the group.
 */
export function describeMissingGroupMembers(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? 'Uno strumento del gruppo non esiste più o non è più negoziabile: toglilo dal gruppo.'
    : `${count} strumenti del gruppo non esistono più o non sono più negoziabili: toglili dal gruppo.`;
}
