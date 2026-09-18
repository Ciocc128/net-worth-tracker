/**
 * accumulationNarrative — every word the PAC (Accumulo) feature speaks (doc/pac-ate.md §10.5).
 *
 * Session S1 seeded only `describeDraftIssue` (`accumulationPlanSchema.ts` §6). Session S4 adds
 * everything the tile, its three-step editor and its two secondary modals print — labels, chips,
 * button text, eyebrows and readings alike — so no PAC component carries an Italian literal of its
 * own. Pure: no Firebase, no DOM. Money and percentages go through `formatters.ts` (the Comma
 * Rule — an Italian `Intl`, never `toFixed`); a signed figure always carries the typographic
 * minus «−», never the ASCII hyphen.
 *
 * Session S4 deliberately renders installment/disposal lines on their raw `InstallmentLineStatus`
 * (`planned`/`executed`/`skipped`) with no ledger matching: `matchPlanExecutions` (§9) and its
 * richer `toConfirm`/`late`/`lostLink` states land in S5. A `planned` line whose installment is
 * BEFORE the current month reads as «In ritardo» here — the only extra state S4 needs, derived
 * from the plan's own calendar rather than from the ledger.
 */
import type { MonthKey } from '@/types/accumulationPlan';
import type { Narrative } from './narrative';
import { cachedFormatCurrencyEUR, formatDate, formatNumberIt, formatPercentageIt } from './formatters';

// ─────────────────────────────────────────────────────────────────────────
// Month labels — DESIGN.md: abbreviated lowercase on a label, full name in a reading.
// ─────────────────────────────────────────────────────────────────────────

const MONTH_NAMES_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];
const MONTH_NAMES_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function parseMonthKey(month: MonthKey): { year: number; monthIndex: number } {
  const [yearStr, monthStr] = month.split('-');
  return { year: Number(yearStr), monthIndex: Number(monthStr) - 1 };
}

/** «ott 2026» — the chart/bar label register. */
export function monthLabelShort(month: MonthKey): string {
  const { year, monthIndex } = parseMonthKey(month);
  return `${MONTH_NAMES_SHORT[monthIndex] ?? month} ${year}`;
}

/** «ottobre 2026» (or «ottobre» with `withYear: false`) — the prose/reading register. */
export function monthLabelLong(month: MonthKey, withYear = true): string {
  const { year, monthIndex } = parseMonthKey(month);
  const name = MONTH_NAMES_LONG[monthIndex] ?? month;
  return withYear ? `${name} ${year}` : name;
}

/** «Oggi» for a trajectory's baseline point (index 0 of an active plan), else the short label. */
export function trajectoryPointLabel(point: MonthKey | 'baseline'): string {
  return point === 'baseline' ? 'Oggi' : monthLabelShort(point);
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────
// Signed figures — typographic minus, never the ASCII hyphen.
// ─────────────────────────────────────────────────────────────────────────

/** «+3,4 pp» / «−1,3 pp» / «0,0 pp». */
export function formatSignedPp(value: number, decimals = 1): string {
  const amount = formatNumberIt(Math.abs(value), decimals);
  if (value < -1e-9) return `−${amount} pp`;
  if (value > 1e-9) return `+${amount} pp`;
  return `${amount} pp`;
}

/** «+19,00 €» / «−19,00 €» / «0,00 €». */
export function formatSignedCurrency(value: number): string {
  const amount = cachedFormatCurrencyEUR(Math.abs(value));
  if (value < -0.005) return `−${amount}`;
  if (value > 0.005) return `+${amount}`;
  return amount;
}

/** «X, Y e Z» — the Italian serial list, no Oxford comma (mirrors `dialogNarrative.ts`). */
function listInItalian(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

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

// ─────────────────────────────────────────────────────────────────────────
// Tile chrome — every label that is not a full sentence.
// ─────────────────────────────────────────────────────────────────────────

export const ACCUMULO_TILE_EYEBROW = 'Accumulo';

export const ACCUMULO_ACTION_CREATE_PLAN = 'Crea piano';
export const ACCUMULO_ACTION_DELETE_DRAFT = 'Elimina bozza';
export const ACCUMULO_ACTION_DELETE_DRAFT_VERB = 'eliminare la bozza';
export const ACCUMULO_ACTION_EDIT = 'Modifica';
export const ACCUMULO_ACTION_ACTIVATE = 'Attiva piano';
export const ACCUMULO_ACTION_RECALIBRATE = 'Ricalibra rata';
export const ACCUMULO_ACTION_CALENDAR = 'Calendario';
export const ACCUMULO_ACTION_STOP = 'Interrompi';
export const ACCUMULO_ACTION_STOP_VERB = 'interrompere il piano';
export const ACCUMULO_ACTION_CLOSE = 'Chiudi piano';
export const ACCUMULO_ACTION_CLOSE_VERB = 'chiudere il piano';
export const ACCUMULO_ACTION_SAVE = 'Salva';
export const ACCUMULO_ACTION_CANCEL = 'Annulla';

export const ACCUMULO_DRAFT_BOX_LIQUIDITY = 'Liquidità oggi';
export const ACCUMULO_DRAFT_BOX_DISPOSALS = 'Vendite fuori piano';
export const ACCUMULO_DRAFT_BOX_INFLOWS = 'Entrate stimate';
export const ACCUMULO_DRAFT_BOX_POSITIONS = 'Posizioni';

export const ACCUMULO_DONE_BOX_EXECUTED = 'Eseguite';
export const ACCUMULO_DONE_BOX_RESIDUAL = 'Liquidità residua';
export const ACCUMULO_DONE_BOX_DRIFT = 'Scostamento medio';

/** A line's status as the tile shows it. `late` is S4's own derived state — see the file header. */
export type AccumuloLineChipStatus = 'planned' | 'executed' | 'skipped' | 'late';

export const ACCUMULO_LINE_STATUS_LABEL: Record<AccumuloLineChipStatus, string> = {
  planned: 'Da eseguire',
  executed: 'Eseguita',
  skipped: 'Saltata',
  late: 'In ritardo',
};

export const ACCUMULO_ACTION_MARK_EXECUTED = 'Segna eseguita';
export const ACCUMULO_ACTION_SKIP = 'Salta';
export const ACCUMULO_ACTION_UNDO_EXECUTED = 'Segna da rifare';
export const ACCUMULO_MANUAL_QUANTITY_LABEL = 'Quantità';
export const ACCUMULO_MANUAL_AMOUNT_LABEL = 'Importo (€)';

// ─────────────────────────────────────────────────────────────────────────
// Tile readings
// ─────────────────────────────────────────────────────────────────────────

/** No open plan: names the cash the reader could put to work. */
export function describeAccumulationNone(sourceCashEur: number): Narrative {
  if (sourceCashEur <= 0.005) {
    return [
      {
        text: 'Nessun piano di accumulo. Non hai liquidità nei conti: un piano la ripartisce in rate mensili verso i pesi che scegli, senza vendere ciò che tieni.',
      },
    ];
  }
  return [
    { text: 'Nessun piano di accumulo. Nei conti di liquidità ci sono ' },
    { text: cachedFormatCurrencyEUR(sourceCashEur), mono: true },
    { text: ': un piano li ripartisce in rate mensili verso i pesi che scegli, senza vendere ciò che tieni.' },
  ];
}

export interface AccumulationDraftReading {
  /** Σ of `computeTotalPurchases`, the whole plan's euro. */
  totalEur: number;
  months: number;
  startMonth: MonthKey;
}

/** A `draft` plan: what it would move, from when, and that nothing is proposed yet. */
export function describeAccumulationDraft(input: AccumulationDraftReading): Narrative {
  const monthlyEur = input.months > 0 ? input.totalEur / input.months : 0;
  return [
    { text: 'Bozza: ' },
    { text: cachedFormatCurrencyEUR(input.totalEur), mono: true },
    { text: ' in ' },
    { text: `${input.months}`, mono: true },
    { text: input.months === 1 ? ' rata da ' : ' rate da ' },
    { text: monthLabelLong(input.startMonth) },
    { text: ', ' },
    { text: cachedFormatCurrencyEUR(monthlyEur), mono: true },
    { text: ' al mese. Non è ancora attivo: nessuna rata viene proposta finché non lo attivi.' },
  ];
}

export interface AccumulationActiveReading {
  monthKey: MonthKey;
  /** Σ of the current installment's lines (planned + executed amounts). */
  installmentTotalEur: number;
  /** Lines with a non-zero quantity in the current installment. */
  lineCount: number;
  executedCount: number;
  /** Planned, not yet executed — includes the current month's and any late one. */
  todoCount: number;
  /** The class/position furthest from its plan target right now; absent when nothing is off. */
  furthestDrift: { label: string; deltaPp: number } | null;
}

/** An `active` plan's current month: what moves, how much of it already has, and the drift. */
export function describeAccumulationActive(input: AccumulationActiveReading): Narrative {
  const segments: Narrative = [
    { text: `${capitalize(monthLabelLong(input.monthKey, false))}: ` },
    { text: cachedFormatCurrencyEUR(input.installmentTotalEur), mono: true },
    { text: ' in ' },
    { text: `${input.lineCount}`, mono: true },
    { text: input.lineCount === 1 ? ' acquisto' : ' acquisti' },
  ];

  const clauses: Narrative[] = [];
  if (input.executedCount > 0) {
    clauses.push([
      { text: `${input.executedCount}`, mono: true },
      { text: input.executedCount === 1 ? ' già eseguito' : ' già eseguiti' },
    ]);
  }
  if (input.todoCount > 0) {
    clauses.push([{ text: `${input.todoCount}`, mono: true }, { text: ' da eseguire' }]);
  }
  if (clauses.length === 1) {
    segments.push({ text: ', ' }, ...clauses[0]);
  } else if (clauses.length === 2) {
    segments.push({ text: ', ' }, ...clauses[0], { text: ' e ' }, ...clauses[1]);
  }
  segments.push({ text: '.' });

  if (input.furthestDrift) {
    if (Math.abs(input.furthestDrift.deltaPp) < 0.5) {
      segments.push({ text: ' Sei in linea col calendario.' });
    } else {
      segments.push(
        { text: ' Sei a ' },
        { text: formatSignedPp(input.furthestDrift.deltaPp), mono: true },
        { text: ` dal previsto su ${input.furthestDrift.label}.` },
      );
    }
  }

  return segments;
}

export interface ReserveWarningReading {
  sourceCashEur: number;
  reserveEur: number;
  belowReserve: boolean;
  /** Present only when the recalibration would reduce the upcoming installment. */
  reducedInstallment?: { monthKey: MonthKey; suggestedTotalEur: number };
}

/** `null` when there is nothing to warn about — the caller renders no warning block at all. */
export function describeReserveWarning(input: ReserveWarningReading): Narrative | null {
  if (!input.belowReserve && !input.reducedInstallment) return null;

  const segments: Narrative = [
    { text: 'Liquidità nei conti sorgente ' },
    { text: cachedFormatCurrencyEUR(input.sourceCashEur), mono: true },
    { text: ' contro ' },
    { text: cachedFormatCurrencyEUR(input.reserveEur), mono: true },
    { text: ' di riserva: la riserva non si tocca' },
  ];

  if (input.reducedInstallment) {
    segments.push(
      { text: ', quindi la rata di ' },
      { text: monthLabelLong(input.reducedInstallment.monthKey) },
      { text: ' è ridotta a ' },
      { text: cachedFormatCurrencyEUR(input.reducedInstallment.suggestedTotalEur), mono: true },
      { text: '.' },
    );
  } else {
    segments.push({ text: '.' });
  }

  return segments;
}

export interface AccumulationDoneReading {
  closedCount: number;
  totalInstallments: number;
  investedEur: number;
  totalEur: number;
  maxDrift: { label: string; deltaPp: number } | null;
}

/** A finished `active` plan, before the owner closes it (D8/D11's last word). */
export function describeAccumulationDone(input: AccumulationDoneReading): Narrative {
  const segments: Narrative = [
    { text: 'Piano concluso: ' },
    { text: `${input.closedCount}`, mono: true },
    { text: input.closedCount === 1 ? ' rata su ' : ' rate su ' },
    { text: `${input.totalInstallments}`, mono: true },
    { text: ', ' },
    { text: cachedFormatCurrencyEUR(input.investedEur), mono: true },
    { text: ' investiti su ' },
    { text: cachedFormatCurrencyEUR(input.totalEur), mono: true },
    { text: '.' },
  ];

  if (input.maxDrift) {
    segments.push(
      { text: ' Il peso più lontano dal target è ' },
      { text: input.maxDrift.label },
      { text: ', a ' },
      { text: formatSignedPp(input.maxDrift.deltaPp), mono: true },
      { text: '.' },
    );
  }

  return segments;
}

/** The consequence sentence a failed read of the plan hands to `describeReadFailure`. */
export function describeAccumulationReadFailure(): string {
  return 'Non riesco a leggere il piano di accumulo. Gli altri numeri della pagina non dipendono da questo.';
}

// ─────────────────────────────────────────────────────────────────────────
// Class strip (D11) and the months bar
// ─────────────────────────────────────────────────────────────────────────

export interface ClassStripItemInput {
  label: string;
  targetPct: number;
  currentDriftPp: number;
  finalDriftPp: number;
  outOfBandNow: boolean;
  /** The first month (short label) the class re-enters band, when it currently sits outside it. */
  reentersAt?: string;
}

export interface ClassStripItem {
  /** «Azioni · target 102% — +3,4 pp → +1,3 pp» */
  text: string;
  /** «rientra in banda a giugno», only when `outOfBandNow` and a re-entry month is known. */
  note?: string;
  outOfBandNow: boolean;
}

export function describeClassStripItem(input: ClassStripItemInput): ClassStripItem {
  const text = `${input.label} · target ${formatPercentageIt(input.targetPct, 0)} — ${formatSignedPp(input.currentDriftPp)} → ${formatSignedPp(input.finalDriftPp)}`;
  const note = input.outOfBandNow && input.reentersAt ? `rientra in banda a ${input.reentersAt}` : undefined;
  return { text, note, outOfBandNow: input.outOfBandNow };
}

export interface AccumulationOutcomeFooterInput {
  maxDrift: { label: string; deltaPp: number } | null;
  residualEur: number;
}

/** The tile's pinned footer: the plan's worst projected drift and what is left unspent. */
export function describeAccumulationOutcomeFooter(input: AccumulationOutcomeFooterInput): Narrative {
  const segments: Narrative = [{ text: 'A fine piano: ' }];
  if (input.maxDrift) {
    segments.push(
      { text: 'scostamento massimo ' },
      { text: formatSignedPp(input.maxDrift.deltaPp), mono: true },
      { text: ` su ${input.maxDrift.label}` },
    );
  } else {
    segments.push({ text: 'nessuno scostamento misurabile' });
  }
  segments.push(
    { text: ' · liquidità residua ' },
    { text: cachedFormatCurrencyEUR(input.residualEur), mono: true },
  );
  return segments;
}

export interface MonthsBarCaptionInput {
  startMonth: MonthKey;
  endMonth: MonthKey;
  closedCount: number;
  totalMonths: number;
}

/** «ott 2026 · 2 di 12 rate chiuse · set 2027» under the tile's month bar. */
export function describeMonthsBarCaption(input: MonthsBarCaptionInput): string {
  return `${monthLabelShort(input.startMonth)} · ${input.closedCount} di ${input.totalMonths} rate chiuse · ${monthLabelShort(input.endMonth)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// `ClassDriftChart` (§10.6)
// ─────────────────────────────────────────────────────────────────────────

/** The shaded ±band caption above the chart — named once, since `rule525` varies per class. */
export function describeDriftChartBand(bandPp: number, tightestLabel: string | null): string {
  const pp = formatNumberIt(bandPp, 1);
  return tightestLabel ? `banda ±${pp} pp (più stretta: ${tightestLabel})` : `banda ±${pp} pp`;
}

export interface ClassDriftChartAriaLine {
  label: string;
  startDriftPp: number;
  finalDriftPp: number;
}

/** The chart's `aria-label`: one clause per class, from where it starts to where it lands. */
export function describeClassDriftChartAriaLabel(input: { classLines: ClassDriftChartAriaLine[] }): string {
  if (input.classLines.length === 0) return 'Traiettoria delle classi verso il target.';
  const clauses = input.classLines.map(
    (line) => `${line.label} da ${formatSignedPp(line.startDriftPp)} a ${formatSignedPp(line.finalDriftPp)}`,
  );
  return `Scostamento dal target per classe, da oggi a fine piano: ${listInItalian(clauses)}.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Editor (`AccumulationPlanDialog`) chrome
// ─────────────────────────────────────────────────────────────────────────

export function describeAccumuloDialogEyebrow(step: 1 | 2 | 3): string {
  return `Piano di accumulo · Passo ${step} di 3`;
}

export const ACCUMULO_STEP_TITLES: Record<1 | 2 | 3, string> = {
  1: 'Da dove arriva la liquidità',
  2: 'Dove deve arrivare il portafoglio',
  3: 'Anteprima del piano',
};

export const ACCUMULO_ACTION_BACK = 'Indietro';
export const ACCUMULO_ACTION_NEXT = 'Avanti';
export const ACCUMULO_ACTION_SAVE_DRAFT = 'Salva bozza';

// Step 1 — Liquidità
export const ACCUMULO_STEP1_SOURCE_ACCOUNTS = 'Conti sorgente';
export const ACCUMULO_STEP1_NO_CASH_ACCOUNTS = 'Nessun conto di liquidità disponibile come fonte.';
export const ACCUMULO_STEP1_RESERVE = 'Riserva da non toccare (€)';
export const ACCUMULO_STEP1_INFLOW = 'Entrata mensile stimata (€)';
export const ACCUMULO_STEP1_MONTHS = 'Durata (mesi)';
export const ACCUMULO_STEP1_START_MONTH = 'Prima rata';
export const ACCUMULO_STEP1_L_HEADLINE = 'Liquidità stimata';
export const ACCUMULO_STEP1_L_SOURCE = 'Conti sorgente';
export const ACCUMULO_STEP1_L_RESERVE = '− Riserva';
export const ACCUMULO_STEP1_L_DISPOSALS = '+ Vendite fuori piano';
export const ACCUMULO_STEP1_L_INFLOWS = '+ Entrate stimate (E × N)';
export const ACCUMULO_STEP1_L_MONTHLY = 'Rata mensile (L₀/N + E)';

// Step 2 — Target
export const ACCUMULO_STEP2_COL_INSTRUMENT = 'Strumento';
export const ACCUMULO_STEP2_COL_CURRENT_WEIGHT = 'Peso oggi';
export const ACCUMULO_STEP2_COL_TARGET = 'Target %';
export const ACCUMULO_STEP2_TOGGLE_IN_PLAN = 'Nel piano';
export const ACCUMULO_STEP2_TOGGLE_SELL = 'Da vendere';
export const ACCUMULO_ACTION_GROUP_PROXY = 'Raggruppa come proxy';
export const ACCUMULO_ACTION_UNGROUP = 'Separa';
export const ACCUMULO_STEP2_BUY_ASSET_PROMPT = 'Strumento d’acquisto';
export const ACCUMULO_ACTION_NEW_ASSET = '+ Nuovo asset';
export const ACCUMULO_STEP2_TOTAL_LABEL = 'Totale';
export const ACCUMULO_STEP2_FOOTNOTE = 'Peso di mercato, non esposizione: la leva si vede al passo 3.';
export const ACCUMULO_STEP2_NO_TRADABLE_ASSETS = 'Nessuno strumento negoziabile in portafoglio: aggiungine uno per iniziare.';
export const ACCUMULO_STEP2_PENDING_ASSET_LABEL = 'Nuovo asset';
export const ACCUMULO_STEP2_BUY_ASSET_CONFIRM = 'Conferma gruppo';

/** «Mancano 3,00 punti per arrivare al 100%» / «Hai 2,00 punti in più»; '' when the total is 100. */
export function describeWeightsTotal(sum: number): string {
  const diff = 100 - sum;
  if (Math.abs(diff) <= 0.01) return '';
  return diff > 0
    ? `Mancano ${formatNumberIt(diff, 2)} punti per arrivare al 100%`
    : `Hai ${formatNumberIt(-diff, 2)} punti in più`;
}

// Step 3 — Anteprima
export const ACCUMULO_STEP3_COL_MONTH = 'Mese';
export const ACCUMULO_STEP3_COL_TOTAL = 'Totale €';
export const ACCUMULO_STEP3_SECTION_WEIGHTS = 'Pesi a fine piano';
export const ACCUMULO_STEP3_SECTION_EXPOSURE = 'Esposizione implicita';
export const ACCUMULO_STEP3_SECTION_CLASSES = 'Classi mese per mese';
export const ACCUMULO_ELLIPSIS = '…';

export function describeInsufficientLiquidityWarning(coveragePct: number): string {
  return `La liquidità stimata copre il ${formatPercentageIt(coveragePct, 0)} del piano: alcune posizioni restano sotto target anche a fine piano.`;
}

export function describeUnpricedWarning(labels: string[]): string {
  const who = listInItalian(labels);
  return labels.length === 1
    ? `${who} non ha un prezzo disponibile: non riceve acquisti finché non lo aggiorni.`
    : `${who} non hanno un prezzo disponibile: non ricevono acquisti finché non li aggiorni.`;
}

export function describeAboveTargetWarning(labels: string[]): string {
  const who = listInItalian(labels);
  return labels.length === 1
    ? `${who} è già sopra il target: il piano non la vende, il peso resta più alto del previsto.`
    : `${who} sono già sopra il target: il piano non le vende, i pesi restano più alti del previsto.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Secondary modals
// ─────────────────────────────────────────────────────────────────────────

export function describeAccumuloModalEyebrow(planName: string): string {
  return `Accumulo · ${planName}`;
}

export const ACCUMULO_CALENDAR_TITLE = 'Calendario';

/** «misurato il 10/01» under a closed installment's row. */
export function describeMeasuredOn(date: Date): string {
  return `misurato il ${formatDate(date)}`;
}

export function describeRecalibrateTitle(monthKey: MonthKey): string {
  return `Ricalibra rata di ${monthLabelLong(monthKey, false)}`;
}

export const ACCUMULO_RECALIBRATE_COL_INSTRUMENT = 'Strumento';
export const ACCUMULO_RECALIBRATE_COL_PLANNED = 'Pianificata';
export const ACCUMULO_RECALIBRATE_COL_SUGGESTED = 'Suggerita';
export const ACCUMULO_RECALIBRATE_COL_DELTA = 'Δ quote';
export const ACCUMULO_ACTION_IGNORE = 'Ignora';
export const ACCUMULO_ACTION_APPLY = 'Applica';
export const ACCUMULO_RECALIBRATE_SUBMITTING = 'Applico la ricalibrazione…';

/** «3868,10 € → 3849,10 €» — the recalibration's totals row. */
export function describeRecalibrationTotals(plannedTotalEur: number, suggestedTotalEur: number): string {
  return `${cachedFormatCurrencyEUR(plannedTotalEur)} → ${cachedFormatCurrencyEUR(suggestedTotalEur)}`;
}

export interface RecalibrationLineReading {
  label: string;
  plannedQuantity: number;
  suggestedQuantity: number;
}

export interface RecalibrationReadingInput {
  lines: RecalibrationLineReading[];
  plannedTotalEur: number;
  suggestedTotalEur: number;
}

/** The recalibrate modal's reading: what moved, or why the rata shrank without a mover. */
export function describeRecalibration(input: RecalibrationReadingInput): Narrative {
  const totalDeltaEur = input.suggestedTotalEur - input.plannedTotalEur;
  const deltas = input.lines
    .map((line) => ({ label: line.label, delta: line.suggestedQuantity - line.plannedQuantity }))
    .filter((d) => d.delta !== 0);

  if (deltas.length === 0) {
    return [{ text: 'La rata resta come pianificata.' }];
  }

  const gainers = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta);
  const losers = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta);

  if (gainers.length > 0 && losers.length > 0) {
    const loser = losers[0];
    const gainer = gainers[0];
    return [
      { text: `${loser.label} è salito più del previsto: la rata sposta ` },
      { text: `${gainer.delta}`, mono: true },
      { text: gainer.delta === 1 ? ' quota' : ' quote' },
      { text: ` verso ${gainer.label}. Il totale cambia di ` },
      { text: formatSignedCurrency(totalDeltaEur), mono: true },
      { text: '.' },
    ];
  }

  return [
    { text: 'Le entrate non sono arrivate come previsto: la rata scende di ' },
    { text: formatSignedCurrency(Math.abs(totalDeltaEur)), mono: true },
    { text: '.' },
  ];
}
