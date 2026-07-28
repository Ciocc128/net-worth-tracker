/**
 * cashFlowMap — l'unico modo di indicizzare i cash flow per mese, in tutta la pipeline di Rendimenti.
 *
 * PERCHÉ ESISTE
 * Ogni formula che neutralizza i flussi (TWR, volatilità, indice dei drawdown, grafico Evoluzione)
 * ha bisogno della stessa cosa: dato un mese, quanto denaro è entrato o uscito. La costruzione della
 * mappa era ricopiata quattro volte, identica riga per riga, in `performanceService.ts` (tre punti)
 * e in `drawdownSeries.ts`. Quattro copie della stessa regola sono quattro occasioni perché una
 * cambi e le altre no — e siccome quelle quattro funzioni devono per forza leggere la STESSA serie
 * (è l'invariante di riconciliazione fra heatmap, Underwater e Max Drawdown), una divergenza qui si
 * manifesterebbe come due grafici che raccontano storie diverse, non come un errore.
 *
 * L'INVARIANTE CHE NESSUNO DICHIARAVA: UN FLUSSO PER MESE
 * Le quattro copie davano per scontato che ci fosse al massimo un `CashFlowData` per mese — vero
 * oggi, perché `getCashFlowsFromExpenses` aggrega per mese a monte — ma nessuna lo verificava: con
 * due elementi sullo stesso mese, `map.set` avrebbe tenuto in silenzio solo l'ultimo, buttando via
 * l'altro senza che niente lo segnalasse. Qui i flussi dello stesso mese si **sommano**, che è
 * l'unica lettura sensata e non può perdere denaro. Sui dati attuali non cambia nulla: cambia solo
 * ciò che succederebbe se l'assunzione a monte venisse meno.
 */

import type { CashFlowData } from '@/types/performance';

/**
 * La chiave `YYYY-MM` di un mese.
 *
 * Un'unica funzione per i due lati della ricerca: chi costruisce la mappa parte da una `Date`, chi
 * la interroga parte dai campi `year`/`month` di uno snapshot. Erano due format string separate, e
 * bastava che una perdesse il padding perché la ricerca fallisse in silenzio restituendo 0 — cioè
 * "nessun cash flow questo mese", il valore più difficile da distinguere da un dato corretto.
 *
 * @param year - Anno completo (es. 2026)
 * @param month - Mese 1-based (1 = gennaio)
 */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** La chiave `YYYY-MM` del mese in cui cade una data. */
export function monthKeyOf(date: Date): string {
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

/**
 * Indicizza i cash flow netti per mese.
 *
 * @param cashFlows - Flussi mensili (contributi/prelievi esterni; i dividendi sono già esclusi da
 *   `netCashFlow` a monte, perché sono rendimento del portafoglio e non capitale che entra)
 * @returns Mappa `YYYY-MM` → cash flow netto del mese, sommato se più elementi cadono nello stesso
 */
export function buildCashFlowMap(cashFlows: CashFlowData[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const cashFlow of cashFlows) {
    const key = monthKeyOf(cashFlow.date);
    map.set(key, (map.get(key) ?? 0) + cashFlow.netCashFlow);
  }
  return map;
}
