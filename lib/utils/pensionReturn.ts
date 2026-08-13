/**
 * pensionReturn — quanto sta rendendo il fondo pensione, con i numeri tenuti separati.
 *
 * PERCHÉ NON UN NUMERO SOLO
 * Il valore di un fondo pensione cresce per tre motivi diversi, e sommarli in un'unica percentuale
 * produce una cifra che non risponde a nessuna domanda:
 *
 *  - **Versamenti tuoi** (volontario + TFR): capitale in ingresso. Il TFR è salario differito, cioè
 *    soldi tuoi che avresti comunque; entrambi stanno al DENOMINATORE, mai al numeratore.
 *  - **Contributo datoriale**: è un guadagno reale, ma è retribuzione, non rendimento del capitale.
 *    Contarlo nel TWR farebbe risultare il fondo al +15/20% annuo, un numero non confrontabile con
 *    nessun mercato. Esce dal TWR e rientra nel "ritorno sul tuo capitale".
 *  - **Andamento di mercato**: l'unica componente che è davvero rendimento.
 *
 * Da qui due misure, entrambe vere, ciascuna etichettata per la domanda a cui risponde:
 *  1. `twr` / `annualizedTwr` — come sta andando la gestione del fondo, confrontabile con un ETF.
 *  2. `personalReturn` — quanto ti rende avere il fondo, contando anche il regalo del datore di lavoro.
 *
 * Il risparmio IRPEF è la terza componente economica, ma vive già nella card "Beneficio fiscale"
 * (per contribuente e per anno d'imposta, via `computePensionTaxRecap`): mescolarlo qui, dove la
 * finestra è mensile e aggregata su tutti i fondi, darebbe un numero che non quadra con quello.
 *
 * COPERTURA DEI DATI — il vincolo che governa tutto
 * Il TWR mensile regge solo se OGNI versamento dentro la finestra è registrato. Chi ha aggiornato
 * il valore del fondo a mano per anni senza registrare i movimenti ha una storia in cui i
 * versamenti sono indistinguibili dal rendimento, e ogni percentuale calcolata su quel periodo è
 * inventata. Per questo la finestra parte da `startMonth` (impostazione utente
 * `pensionReturnStartMonth`) oppure, in sua assenza, dal primo versamento registrato — mai
 * dall'inizio degli snapshot. `isCoverageSuspicious` segnala comunque il caso residuo in cui la
 * finestra è configurata ma i versamenti al suo interno mancano: un rendimento annualizzato oltre
 * `SUSPICIOUS_ANNUAL_RETURN` non è un fondo pensione brillante, sono versamenti non registrati.
 *
 * Zero import Firebase: funzione pura dei suoi input (invariante #4).
 */

import type { MonthlySnapshot } from '@/types/assets';
import type { PensionContribution, PensionContributionNature } from '@/types/pension';
import { hasAssetBreakdown } from '@/lib/utils/snapshotAssetBreakdown';

/**
 * Soglia oltre la quale un rendimento annualizzato del fondo si spiega meglio con versamenti non
 * registrati che con il mercato. I comparti azionari dei fondi pensione italiani viaggiano su
 * medie a una cifra; il 20% è largo apposta, per segnalare solo i casi grossolani.
 */
const SUSPICIOUS_ANNUAL_RETURN = 20;

/** Sotto questa soglia annualizzare amplifica il rumore invece di informare. */
const MIN_MONTHS_TO_ANNUALIZE = 3;

/**
 * Sotto un centesimo non c'è movimento: è la stessa risoluzione a cui il valore viene mostrato, e
 * un residuo in virgola mobile non deve trasformare una finestra ferma in una che ha "reso".
 */
const MOVEMENT_EPSILON_EUR = 0.01;

/** Valore complessivo dei fondi pensione in un dato mese, congelato nello snapshot. */
export interface PensionValuePoint {
  year: number;
  /** 1-12 */
  month: number;
  value: number;
}

/** Versato nella finestra, per natura. `total` è la somma delle tre. */
interface ContributionsByNature {
  tfr: number;
  voluntary: number;
  employer: number;
  total: number;
}

export interface PensionReturnResult {
  /** Primo e ultimo mese effettivamente usati, come 'YYYY-MM'. */
  windowStart: string;
  windowEnd: string;
  /** Numero di rendimenti mensili calcolati (= punti − 1). */
  monthsCovered: number;
  startValue: number;
  endValue: number;
  /** `endValue − startValue`: quanto è cresciuto il fondo, versamenti inclusi. */
  valueGrowth: number;
  contributions: ContributionsByNature;
  /** `valueGrowth − contributi`: la parte che il mercato ha davvero prodotto. */
  marketGain: number;
  /** Rendimento cumulato della finestra, in %. */
  twr: number;
  /** TWR annualizzato; `null` sotto i 3 mesi di copertura. */
  annualizedTwr: number | null;
  /**
   * `(guadagno di mercato + contributo datoriale) / (valore iniziale + volontario + TFR)`, in %.
   * Non confrontabile con un rendimento di mercato — include il contributo del datore di lavoro.
   */
  personalReturn: number | null;
  /** Il rendimento è troppo alto per essere vero: mancano versamenti nella finestra. */
  isCoverageSuspicious: boolean;
  /**
   * La finestra è aperta ma non è ancora successo nulla dentro: né il valore si è mosso, né sono
   * stati registrati versamenti. Il `twr` vale allora 0 per ASSENZA di dati, non perché il fondo
   * abbia reso zero — e presentare "+0,00%" come misura sarebbe la stessa bugia che
   * `isCoverageSuspicious` evita dal lato opposto.
   */
  hasNoMovement: boolean;
}

/**
 * Il rendimento di questa finestra è una MISURA, o solo un numero che il calcolo ha prodotto?
 *
 * I due stati che dicono di no — `isCoverageSuspicious` e `hasNoMovement` — hanno cause opposte ma
 * la stessa conseguenza sullo schermo: la percentuale va sostituita da una spiegazione, e con essa
 * TUTTA la scomposizione in euro che la spiegherebbe. «Guadagno di mercato» stampato sotto un avviso
 * che dice «quella differenza non è rendimento di mercato» contraddice l'avviso a quaranta pixel di
 * distanza — ed è il numero, non il testo, che l'occhio legge per primo.
 *
 * Vive qui e non nel componente perché è una proprietà del risultato, non del layout: la card di
 * riepilogo e il blocco di scomposizione devono decidere sullo STESSO predicato, e finché erano due
 * espressioni separate sono divergite (la card guardava entrambi i flag, il blocco solo uno).
 */
export function isPensionReturnMeasurable(result: PensionReturnResult): boolean {
  return !result.isCoverageSuspicious && !result.hasNoMovement;
}

/** Chiave mensile 'YYYY-MM'. */
function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Il mese in cui il versamento ha MOSSO IL VALORE del fondo — che non è il mese della sua data.
 *
 * `pensionContributionService` alza il valore del fondo nel momento in cui il versamento viene
 * registrato (`createdAt`), e uno snapshot mensile è una fotografia congelata: solo il mese corrente
 * viene riaggiornato dal cron. Un versamento datato 30 giugno ma registrato il 24 luglio non entra
 * mai nello snapshot di giugno — compare in quello di luglio. Attribuirlo a giugno lo farebbe
 * sparire dai versamenti del periodo e la crescita di luglio verrebbe letta come guadagno di
 * mercato (bug osservato: 382,86 € di TFR contati come rendimento).
 *
 * `date` resta la data contabile — è quella che decide l'anno d'imposta e da quando l'utente ha
 * iniziato a registrare (`resolvePensionReturnStart`). Domande diverse, campi diversi.
 * Fallback su `date` per i documenti senza `createdAt`.
 */
function valueEffectMonth(contribution: PensionContribution): string {
  const effectDate = contribution.createdAt ?? contribution.date;
  return monthKey(effectDate.getFullYear(), effectDate.getMonth() + 1);
}

/**
 * Serie mensile del valore complessivo dei fondi pensione, letta dagli snapshot.
 *
 * Solo i mesi con un breakdown per strumento sono utilizzabili: prima di `byAsset` il valore del
 * singolo fondo non è ricostruibile dallo snapshot. I mesi con breakdown ma senza nessuno dei fondi
 * sono esclusi — il fondo non esisteva ancora, non valeva zero.
 *
 * @param snapshots - Snapshot dell'account, in qualsiasi ordine
 * @param fundIds - Gli `assetId` dei fondi pensione da sommare
 * @returns Punti ordinati cronologicamente
 */
export function buildPensionValueSeries(
  snapshots: MonthlySnapshot[],
  fundIds: string[]
): PensionValuePoint[] {
  if (fundIds.length === 0) return [];
  const ids = new Set(fundIds);

  return snapshots
    .filter(hasAssetBreakdown)
    .map((snapshot) => ({
      year: snapshot.year,
      month: snapshot.month,
      value: snapshot.byAsset.reduce(
        (sum, entry) => (ids.has(entry.assetId) ? sum + entry.totalValue : sum),
        0
      ),
    }))
    .filter((point) => point.value > 0)
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}

/**
 * Chiude la serie sul valore VIVO del fondo, al posto dello snapshot del mese corrente.
 *
 * Un versamento alza l'asset nel momento in cui viene registrato, ma lo snapshot del mese
 * corrente viene riscritto solo dal cron serale: finché i due divergono,
 * `computePensionReturn` sottrarrebbe il versamento da un valore di chiusura che non lo
 * contiene ancora — il TWR calerebbe esattamente dell'importo versato — mentre l'hero
 * mostra già il valore vivo. Sostituire (o aggiungere, se il cron non ha ancora scritto il
 * mese) il punto del mese corrente con il valore vivo chiude la finestra su numeri
 * coerenti: hero e card del rendimento concordano per costruzione, con qualsiasi schedule
 * del cron.
 *
 * `value <= 0` lascia la serie intatta — stessa regola di `buildPensionValueSeries`: un
 * fondo a zero non esiste, non vale zero. La serie in ingresso non viene mutata.
 */
export function overlayLivePensionValue(
  series: PensionValuePoint[],
  live: PensionValuePoint
): PensionValuePoint[] {
  if (live.value <= 0) return series;

  const liveKey = monthKey(live.year, live.month);
  return [...series.filter((point) => monthKey(point.year, point.month) !== liveKey), live].sort(
    (a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month)
  );
}

/**
 * Il mese da cui la serie è affidabile, come 'YYYY-MM'.
 *
 * `configuredStartMonth` (impostazione utente) vince sempre: è l'utente a sapere da quando ha
 * iniziato a registrare i movimenti. Senza impostazione si parte dal primo versamento registrato,
 * perché prima di quello il fondo cresceva per versamenti invisibili. Senza nemmeno un versamento
 * non c'è nessuna finestra affidabile e la funzione restituisce `null`.
 *
 * Qui si usa `date` (data contabile) e non `createdAt`: la domanda è "da quando questa storia è
 * tracciata", non "quando il valore si è mosso" — quella è di `valueEffectMonth`. Partire dal
 * `createdAt` di un versamento retrodatato taglierebbe via i mesi che quel versamento descrive.
 */
export function resolvePensionReturnStart(
  contributions: PensionContribution[],
  configuredStartMonth?: string
): string | null {
  if (configuredStartMonth) return configuredStartMonth;
  if (contributions.length === 0) return null;

  return contributions
    .map((contribution) => monthKey(contribution.date.getFullYear(), contribution.date.getMonth() + 1))
    .sort()[0];
}

/** Somma i versamenti per natura, con il totale già calcolato. */
function sumByNature(contributions: PensionContribution[]): ContributionsByNature {
  const byNature: Record<PensionContributionNature, number> = { tfr: 0, voluntary: 0, employer: 0 };
  for (const contribution of contributions) {
    byNature[contribution.source] += Math.abs(contribution.amount);
  }
  return { ...byNature, total: byNature.tfr + byNature.voluntary + byNature.employer };
}

/**
 * Rendimento del fondo sulla finestra affidabile.
 *
 * Il TWR concatena `r_i = (V_i − versamenti_i) / V_{i-1} − 1`, la stessa forma usata per il
 * portafoglio in `lib/utils/drawdownSeries.ts`: un versamento sposta il valore, non il rendimento.
 *
 * @param series - Da `buildPensionValueSeries`
 * @param contributions - Versamenti dei fondi considerati (qualsiasi periodo; filtrati qui)
 * @param startMonth - Inizio finestra 'YYYY-MM'; da `resolvePensionReturnStart`
 * @returns `null` quando la finestra non contiene almeno due mesi di valori
 */
export function computePensionReturn(
  series: PensionValuePoint[],
  contributions: PensionContribution[],
  startMonth: string | null
): PensionReturnResult | null {
  const windowPoints = startMonth
    ? series.filter((point) => monthKey(point.year, point.month) >= startMonth)
    : series;
  if (windowPoints.length < 2) return null;

  const firstKey = monthKey(windowPoints[0].year, windowPoints[0].month);
  const lastKey = monthKey(
    windowPoints[windowPoints.length - 1].year,
    windowPoints[windowPoints.length - 1].month
  );

  // Chiave: il mese in cui il valore si è mosso (vedi `valueEffectMonth`), non la data contabile.
  // I versamenti già dentro il valore di apertura sono esclusi — contarli sottrarrebbe due volte.
  const contributionsByMonth = new Map<string, PensionContribution[]>();
  for (const contribution of contributions) {
    const key = valueEffectMonth(contribution);
    if (key <= firstKey || key > lastKey) continue;
    contributionsByMonth.set(key, [...(contributionsByMonth.get(key) ?? []), contribution]);
  }

  let index = 1;
  for (let i = 1; i < windowPoints.length; i++) {
    const startValue = windowPoints[i - 1].value;
    if (startValue === 0) continue;
    const key = monthKey(windowPoints[i].year, windowPoints[i].month);
    const paidIn = sumByNature(contributionsByMonth.get(key) ?? []).total;
    index *= (windowPoints[i].value - paidIn) / startValue;
  }

  const startValue = windowPoints[0].value;
  const endValue = windowPoints[windowPoints.length - 1].value;
  const contributionsInWindow = sumByNature([...contributionsByMonth.values()].flat());
  const monthsCovered = windowPoints.length - 1;

  const twr = (index - 1) * 100;
  const annualizedTwr =
    monthsCovered >= MIN_MONTHS_TO_ANNUALIZE
      ? (Math.pow(index, 12 / monthsCovered) - 1) * 100
      : null;

  const marketGain = endValue - startValue - contributionsInWindow.total;
  const ownCapital = startValue + contributionsInWindow.voluntary + contributionsInWindow.tfr;

  return {
    windowStart: firstKey,
    windowEnd: lastKey,
    monthsCovered,
    startValue,
    endValue,
    valueGrowth: endValue - startValue,
    contributions: contributionsInWindow,
    marketGain,
    twr,
    annualizedTwr,
    personalReturn:
      ownCapital > 0 ? ((marketGain + contributionsInWindow.employer) / ownCapital) * 100 : null,
    isCoverageSuspicious:
      annualizedTwr !== null && annualizedTwr > SUSPICIOUS_ANNUAL_RETURN,
    hasNoMovement:
      Math.abs(endValue - startValue) < MOVEMENT_EPSILON_EUR &&
      contributionsInWindow.total < MOVEMENT_EPSILON_EUR,
  };
}
