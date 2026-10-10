/**
 * FIRE › Proiezione's words: the verdict that answers «quanto può valere il portafoglio tra N
 * anni, e con che probabilità?» and the reading line under each tile (doc/montecarlo/README.md § 11.6).
 *
 * Same design as `monteCarloNarrative.ts`: pure functions returning a `Narrative`, phrasings pinned
 * by tests. A projection is not a fact (The Risk-vs-Fact Rule): no figure wears a sign token, and the
 * headline's tone is neutral — except the probability of the DEFAULT threshold (today's FIRE number),
 * which reads through `resolveSuccessTone` like the Monte Carlo's success rate.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, startsWithVowel } from '@/lib/utils/patrimonioNarrative';
import { formatLeverage } from '@/lib/utils/monteCarloNarrative';
import { resolveSuccessTone, type PlanAllocationEntry } from '@/lib/utils/monteCarloSummary';
import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { ProjectionFigures, ProjectionSummary, ScenarioKey } from '@/lib/utils/projectionSummary';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });
const amount = (value: number): NarrativeSegment => figure(cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true));
/** § 21 RE4: a percentile at or under zero reads «esaurito», never a negative (or an unsigned) figure. */
const isDepleted = (value: number): boolean => Math.round(value) <= 0;
const capital = (value: number): NarrativeSegment => (isDepleted(value) ? figure('esaurito') : amount(value));
const count = (value: number): NarrativeSegment => figure(value.toLocaleString('it-IT'));

/** «45%» / «45,2%»: one decimal, or none when it is zero. */
function ratePct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return formatPercentage(rounded, Number.isInteger(rounded) ? 0 : 1);
}

/** «nel 45%» / «nell'11%» / «nello 0,5%» — the elision follows the printed figure. */
function inThePercent(value: number): string {
  const leading = Math.floor(Math.round(value * 10) / 10);
  if (leading === 0) return 'nello ';
  return startsWithVowel(leading) ? "nell'" : 'nel ';
}

function years(value: number): string {
  return `${value} ${value === 1 ? 'anno' : 'anni'}`;
}

export function projectionScenarioLabel(key: ScenarioKey): string {
  return key === 'bear' ? 'Bear' : key === 'base' ? 'Base' : 'Bull';
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface ProjectionVerdictInput {
  /** A positive starting capital exists. */
  runnable: boolean;
  summary: ProjectionSummary | null;
  /** The threshold is the Calcolatore's FIRE number year by year (RN1), not a figure the user typed. */
  thresholdIsFireNumber: boolean;
  /** `Σ weights / 100`, 1 without leverage. */
  leverage: number;
}

/** «Supera il tuo numero FIRE di quell'anno (826.000 € di oggi) nel 45% …» / «Supera la soglia di 1.000.000 € di oggi nel 36% …». */
function thresholdSentence(summary: ProjectionSummary, isFireNumber: boolean): Narrative {
  const probability = summary.scenarios.base.atHorizon.probabilityAtLeast;
  if (summary.threshold === null || probability === null) return [];
  const subject: Narrative = isFireNumber
    ? [prose(" Supera il tuo numero FIRE di quell'anno ("), amount(summary.threshold), prose(' di oggi)')]
    : [prose(' Supera la soglia di '), amount(summary.threshold), prose(' di oggi')];
  return [...subject, prose(' '), prose(inThePercent(probability)), figure(ratePct(probability)), prose(' delle simulazioni.')];
}

/** «Con leva 1,5× il 3% delle simulazioni azzera il capitale almeno una volta.» */
function leverageSentence(summary: ProjectionSummary, leverage: number): Narrative {
  const share = summary.scenarios.base.leverageZeroedShare;
  if (leverage <= 1 || share <= 0) return [];
  return [prose(' Con leva '), figure(formatLeverage(leverage)), prose(' '), prose(articleForShare(share)), figure(ratePct(share)), prose(' delle simulazioni azzera il capitale almeno una volta.')];
}

/** «il 3%» / «l'11%» / «lo 0,5%»: the subject article of the leverage sentence. */
function articleForShare(value: number): string {
  return articleForPercent(value, 1);
}

export function buildProjectionVerdict(input: ProjectionVerdictInput): PageVerdictModel {
  if (!input.runnable) {
    return {
      headline: 'Proiezione non calcolabile.',
      tone: 'neutral',
      sentence: [prose('Serve un capitale di partenza maggiore di zero: scrivilo nella tessera Parametri.')],
    };
  }
  const summary = input.summary;
  if (!summary) {
    return {
      headline: 'Proiezione non ancora eseguita.',
      tone: 'neutral',
      sentence: [prose('Premi Prova nella tessera Parametri: i tre scenari girano insieme.')],
    };
  }

  const base = summary.scenarios.base.atHorizon;
  const probability = base.probabilityAtLeast;
  const tone = input.thresholdIsFireNumber && probability !== null ? resolveSuccessTone(probability) : 'neutral';
  const when: Narrative = [prose('Tra '), figure(years(summary.horizon)), prose(summary.endAge !== null ? ` (a ${summary.endAge} anni, nel ` : ' (nel '), figure(String(summary.endCalendarYear)), prose(')')];

  return {
    headline: isDepleted(base.p50) ? `Tra ${years(summary.horizon)}, il portafoglio è esaurito in mediana.` : `Tra ${years(summary.horizon)}, ${cachedFormatCurrencyEUR(Math.round(base.p50), true)} di oggi in mediana.`,
    tone,
    sentence: [
      ...when,
      ...(isDepleted(base.p50) ? [prose(' il portafoglio è '), capital(base.p50), prose(' in mediana; ')] : [prose(' il portafoglio vale '), amount(base.p50), prose(' di oggi in mediana; ')]),
      ...(isDepleted(base.p10) ? [prose('in nove simulazioni su dieci è '), capital(base.p10)] : [prose('più di '), amount(base.p10), prose(' in nove simulazioni su dieci')]),
      prose(', '),
      ...(isDepleted(base.p90) ? [prose('in una su dieci è '), capital(base.p90)] : [prose('più di '), amount(base.p90), prose(' in una su dieci')]),
      prose('.'),
      ...thresholdSentence(summary, input.thresholdIsFireNumber),
      ...leverageSentence(summary, input.leverage),
    ],
  };
}

// ─── Ventaglio ────────────────────────────────────────────────────────────────

export const VENTAGLIO_ASIDE = 'scenario base · euro di oggi';

/** «La mediana passa da 100.000 € a 714.000 € nel 2056; metà delle simulazioni sta tra 378.000 € e 1.351.000 €.» */
export function describeVentaglio(summary: ProjectionSummary, startValue: number): Narrative {
  const base = summary.scenarios.base.atHorizon;
  return [
    prose('La mediana passa da '),
    amount(startValue),
    prose(' a '),
    capital(base.p50),
    prose(' nel '),
    figure(String(summary.endCalendarYear)),
    prose('; metà delle simulazioni sta tra '),
    amount(base.p25),
    prose(' e '),
    amount(base.p75),
    prose('.'),
  ];
}

/** `costPct`: the yearly TER and stamp duty of the run's weights (RC3), taken off every year (D-C6); 0 = none found. */
export type VentaglioThresholdKind = 'fire' | 'fixed' | 'none';

export function describeVentaglioFooter(inflationPct: number, threshold: VentaglioThresholdKind, costPct = 0): Narrative {
  return [
    prose('Euro di oggi, inflazione '),
    figure(`${inflationPct.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`),
    prose(' (Impostazioni › Simulazioni). Bande 10°–90° e 25°–75° percentile, linea piena la mediana'),
    prose(threshold === 'fire' ? '; la linea tratteggiata è il tuo numero FIRE anno per anno (Calcolatore).' : threshold === 'fixed' ? '; la linea tratteggiata è la soglia.' : '.'),
    ...(costPct > 0
      ? [prose(' Al netto di TER e bollo ('), figure(`${costPct.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`), prose(" l'anno); lordi della tassa sulla vendita.")]
      : [prose(' Nessun costo ricorrente rilevato (TER non inseriti, bollo non attivo); lordi della tassa sulla vendita.')]),
  ];
}

// ─── Scenari a confronto ──────────────────────────────────────────────────────

export const PROJECTION_SCENARI_ASIDE = 'stesso piano, mercati diversi';

/** «Bear 411.000 € · Base 714.000 € · Bull 1.284.000 €: la mediana cresce di 3,1 volte tra bear e bull.» */
export function describeProjectionScenari(summary: ProjectionSummary): Narrative {
  const bear = summary.scenarios.bear.atHorizon.p50;
  const bull = summary.scenarios.bull.atHorizon.p50;
  const out: Narrative = [prose('Mediana '), prose('bear '), capital(bear), prose(', base '), capital(summary.scenarios.base.atHorizon.p50), prose(', bull '), capital(bull)];
  if (bear > 0) out.push(prose(': '), figure(`${(bull / bear).toLocaleString('it-IT', { maximumFractionDigits: 1 })}×`), prose(' tra bear e bull.'));
  else out.push(prose('.'));
  return out;
}

/** «22% sopra la soglia» — the row's note; the median sits on the row already, so only the probability is said. */
export function describeProjectionScenarioNote(figures: ProjectionFigures, hasThreshold: boolean): Narrative {
  const out: Narrative = [];
  if (hasThreshold && figures.probabilityAtLeast !== null) out.push(figure(`${ratePct(figures.probabilityAtLeast)} sopra la soglia`));
  return out;
}

export function projectionScenariFooter(threshold: VentaglioThresholdKind): Narrative {
  const lead = threshold !== 'none' ? 'Mediana in euro di oggi e probabilità di superare la soglia, per ciascuno scenario.' : 'Mediana in euro di oggi per ciascuno scenario.';
  return [
    prose(
      `${lead} Le tre esecuzioni condividono capitale, versamenti, orizzonte e pesi; cambiano rendimenti e volatilità. Bear e Bull sono stress: ogni classe con la media al 15° o all’85° percentile della sua incertezza, tutte insieme.`,
    ),
  ];
}

// ─── Tappe ────────────────────────────────────────────────────────────────────

export const TAPPE_ASIDE = 'euro di oggi · 10° · mediana · 90°';

/** «Tra 20 anni la mediana è 371.000 €, tra 50 anni 2.650.000 €; il 10° percentile a 50 anni è 555.000 €.» */
export function describeTappe(rows: ProjectionFigures[]): Narrative {
  if (rows.length === 0) return [];
  const first = rows[0];
  const last = rows[rows.length - 1];
  // § 21 RE4: «la mediana è esaurita» / «il 10° percentile a 50 anni è esaurito».
  const median = (row: ProjectionFigures): Narrative => (isDepleted(row.p50) ? [prose('la mediana è '), figure('esaurita')] : [prose('la mediana è '), amount(row.p50)]);
  if (first === last) return [prose('Tra '), figure(years(last.year)), prose(' '), ...median(last), prose('.')];
  return [
    prose('Tra '),
    figure(years(first.year)),
    prose(' '),
    ...median(first),
    prose(', tra '),
    figure(years(last.year)),
    prose(' '),
    isDepleted(last.p50) ? figure('esaurita') : amount(last.p50),
    prose('; il 10° percentile a '),
    figure(years(last.year)),
    prose(' è '),
    capital(last.p10),
    prose('.'),
  ];
}

/** `threshold`: 'fire' says the row's own figure sits under each percentage; 'fixed' says the one figure for all rows. */
export function describeTappeFooter(threshold: VentaglioThresholdKind, fixedValue: number | null = null): Narrative {
  const base = 'Anno di calendario ed età (se nota in Impostazioni). In piccolo la mediana nominale, cioè in euro di quell’anno.';
  if (threshold === 'fire') return [prose(`${base} Sotto la percentuale, il numero FIRE di quell’anno in euro di oggi.`)];
  if (threshold === 'fixed' && fixedValue !== null) return [prose(`${base} La soglia è la stessa per ogni riga: `), amount(fixedValue), prose(' di oggi.')];
  return [prose(base)];
}

// ─── Parametri ────────────────────────────────────────────────────────────────

export const PROJECTION_PARAMETRI_ASIDE = 'una prova, non si salva · le ipotesi di mercato stanno in Impostazioni';

export interface ProjectionPlan {
  initialPortfolio: number;
  annualSavings: number;
  savingsYears: number;
  horizon: number;
  simulations: number;
  allocation: PlanAllocationEntry[];
}

/** «Parti da 100.000 € e versi 12.000 € l'anno, cresciuti con l'inflazione, per 15 anni; guardi a 30 anni, con il 100% in azioni.» */
export function describeProjectionParametri(plan: ProjectionPlan): Narrative {
  const out: Narrative = [prose('Parti da '), amount(plan.initialPortfolio)];
  if (plan.annualSavings > 0 && plan.savingsYears > 0) {
    out.push(prose(' e versi '), amount(plan.annualSavings), prose(" l'anno, cresciuti con l'inflazione, per "), figure(years(plan.savingsYears)));
  } else {
    out.push(prose(', senza versamenti'));
  }
  out.push(prose('; guardi a '), figure(years(plan.horizon)));
  if (plan.allocation.length > 0) {
    out.push(prose(', con '));
    plan.allocation.forEach((entry, index) => {
      if (index > 0) out.push(prose(index === plan.allocation.length - 1 ? ' e ' : ', '));
      out.push(prose(articleForPercent(entry.pct, 0)), figure(formatPercentage(entry.pct, 0)), prose(` in ${entry.label}`));
    });
  }
  out.push(prose('.'));
  return out;
}

export interface ProjectionFooterInput {
  stale: boolean;
  simulations: number;
}

export function describeProjectionFooter({ stale, simulations }: ProjectionFooterInput): Narrative {
  if (stale) return [prose("I risultati sopra usano i parametri dell'ultima esecuzione: premi Prova per aggiornarli. Soglia e orizzonte, entro quelli simulati, si aggiornano subito.")];
  return [prose('Ultima esecuzione con questi parametri · '), count(simulations * 3), prose(' traiettorie, '), count(simulations), prose(' per scenario. Il confronto «sotto il capitale di partenza» è con il capitale scritto sopra, non con quanto versi.')];
}

/** The savings field's source line: «dal Cashflow 2025» / «dal Cashflow 2026, annualizzato». */
export function describeSavingsSource(source: { year: number; annualized: boolean } | null): string {
  if (!source) return 'nessun risparmio letto dal Cashflow: scrivilo a mano';
  return `dal Cashflow ${source.year}${source.annualized ? ', annualizzato' : ''} · cresce con l'inflazione`;
}

export const PROJECTION_THRESHOLD_HINT_FIRE = 'il numero FIRE del Calcolatore, anno per anno, in euro di oggi: non segue il capitale e il versamento scritti qui';
export const PROJECTION_THRESHOLD_HINT_FIXED = 'una cifra fissa in euro di oggi';
export const PROJECTION_THRESHOLD_HINT_EMPTY = 'scrivi una soglia in euro di oggi per vedere la probabilità';
/** The seed's placeholder in the empty field: «oggi 606.961 €». */
export function describeFireThresholdPlaceholder(todayFireNumber: number): string {
  return `oggi ${cachedFormatCurrencyEUR(Math.round(todayFireNumber), true)}`;
}

// ─── Dettaglio ────────────────────────────────────────────────────────────────

export const PROJECTION_DETTAGLIO_DESCRIPTION = 'Come si calcola, e cosa la proiezione non dice';

export const PROJECTION_EXPLAINER: { title: string; body: string }[] = [
  {
    title: 'La proiezione',
    body: 'Ogni traiettoria parte dal capitale scritto in Parametri (più i fondi pensione già sbloccati) e, anno per anno, incassa gli afflussi che si sbloccano, applica un rendimento casuale per ciascuna delle sette classi (lognormale con il CAGR reale e la volatilità della classe, portato in nominale con l’inflazione attesa) e aggiunge il versamento dell’anno, cresciuto con l’inflazione, finché dura. Nel Base ogni traiettoria ha la sua media per classe, estratta una volta dalla sua incertezza (le stime di lungo periodo sono incerte: le classi con poca storia, come Trend e Carry, lo sono di più). Nessun prelievo: quello è Dopo il FIRE. Il seme è fisso, quindi le cifre non cambiano tra un’apertura e l’altra.',
  },
  {
    title: 'Percentili e probabilità',
    body: 'Il 10°, il 25°, la mediana, il 75° e il 90° sono i valori di tutte le traiettorie a quell’anno, azzerate comprese. Le cifre sono in euro di oggi (il valore dell’anno diviso per l’inflazione cumulata dello scenario); la probabilità è la quota di traiettorie a o sopra la soglia di quell’anno, o sotto il capitale di partenza in potere d’acquisto. Cambiare soglia o orizzonte (entro quello simulato) non richiede una nuova esecuzione.',
  },
  {
    title: 'La soglia',
    body: 'La soglia è il numero FIRE del Calcolatore ricalcolato ogni anno, in euro di oggi: flussi datati, pensioni, tassa sul prelievo e fondo bloccato lo spostano, e una sola serie vale per i tre scenari. Qui il versamento continua anche dopo il FIRE, nel Calcolatore si ferma. Non segue il capitale, il versamento e i pesi scritti in Parametri: è il numero del piano salvato (o della bozza di «Il mio piano»). Una cifra scritta nel campo è invece una retta, uguale in ogni anno.',
  },
  {
    title: 'La leva',
    body: 'Con pesi oltre il 100% il portafoglio è a leva e il debito costa la liquidità dell’anno più lo spread di Impostazioni. Se in un anno la perdita supera il capitale, la traiettoria si azzera e riparte dai versamenti; la quota di traiettorie azzerate almeno una volta è dichiarata nel verdetto.',
  },
  {
    title: 'I limiti',
    body: 'Al netto di TER e bollo, come li dichiara la riga «Ipotesi usate» (ogni anno, dopo il rendimento, si toglie la loro quota del capitale); lordi della tassa sulla plusvalenza alla vendita, senza costi di transazione. Correlazioni fisse, lognormale senza code grasse (gli anni peggiori delle azioni sono più frequenti di quanto dica la lognormale), tassi fermi al valore di oggi per tutto l’orizzonte, errori sulle stime indipendenti fra classi, costo della copertura del cambio nullo in media, fondo pensione al valore di oggi, versamenti cresciuti con l’inflazione e non con lo stipendio. Crypto e immobili restano fuori dal capitale simulato.',
  },
];
