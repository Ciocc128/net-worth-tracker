/**
 * FIRE › Monte Carlo's words: the verdict that answers «quanto è probabile?» before any number,
 * and the reading line under each tile of that tab.
 *
 * Same design as the other `*Narrative.ts` modules: every function is pure and returns a
 * `Narrative` (segments flagged `mono`) rendered by `NarrativeText`; the phrasings are pinned by
 * tests, and a sentence never claims what the data cannot support — no saved age drops the age
 * and reads the horizon in years, a 10th percentile that never touches zero reads its floor, a
 * median at zero says the median case runs out (DESIGN.md → The Narrative Honesty Rule).
 *
 * No figure on this page wears a sign token: a probability is not a gain and a projected value
 * is not a loss. The headline's tone follows the success rate through `resolveSuccessTone`.
 *
 * Percentages go through chartService's it-IT formatter (comma decimals), currency through
 * `cachedFormatCurrencyEUR` (no-break space before €) — AGENTS.md → Italian Localization.
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent, startsWithVowel } from '@/lib/utils/patrimonioNarrative';
import type { FireLock } from '@/lib/utils/fireSummary';
import type { ResolvedMonteCarloMarket } from '@/lib/utils/monteCarloMarket';
import type { Narrative, NarrativeSegment, PageVerdictModel } from '@/lib/utils/narrative';
import type { SustainableSpendingSummary, SustainableWithdrawal } from '@/lib/utils/sustainableWithdrawal';
import type { FireStart } from '@/lib/utils/fireStart';
import { resolveSuccessTone, type MonteCarloPlan, type MonteCarloRun, type PlanInflow, type PlanStatePension, type PlanWithdrawalTax, type ScenarioComparison, type ScenarioRunSummary } from '@/lib/utils/monteCarloSummary';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

function formatAmount(value: number): string {
  return cachedFormatCurrencyEUR(Math.round(Math.abs(value)), true);
}

const amount = (value: number): NarrativeSegment => figure(formatAmount(value));
const count = (value: number): NarrativeSegment => figure(value.toLocaleString('it-IT'));
const year = (value: number): NarrativeSegment => figure(String(value));

/** «84,2%», one decimal, or «95%» when the decimal is zero — the way the hero prints it. */
function ratePct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return formatPercentage(rounded, Number.isInteger(rounded) ? 0 : 1);
}

/** «nel 57,3%» / «nell'84,2%» / «nello 0,5%» — the elision follows the printed figure. */
function inThePercent(value: number): string {
  const leading = Math.floor(Math.round(value * 10) / 10);
  if (leading === 0) return 'nello ';
  return startsWithVowel(leading) ? "nell'" : 'nel ';
}

/** «7 anni» / «1 anno». */
function years(value: number): string {
  return `${value} ${value === 1 ? 'anno' : 'anni'}`;
}

/** «a, b e c» — the Italian list, on narratives. */
function joinList(items: Narrative[]): Narrative {
  const out: Narrative = [];
  items.forEach((item, index) => {
    if (index > 0) out.push(prose(index === items.length - 1 ? ' e ' : ', '));
    out.push(...item);
  });
  return out;
}

const SCENARIO_NAMES: Record<ScenarioRunSummary['key'], string> = { bear: 'orso', base: 'base', bull: 'toro' };

// ─── Verdict ──────────────────────────────────────────────────────────────────

export interface MonteCarloVerdictInput {
  /** A positive starting portfolio and a positive withdrawal exist. */
  runnable: boolean;
  run: MonteCarloRun | null;
  scenarios: ScenarioComparison | null;
  lock: FireLock;
  /** With leverage above 1: the Base run again without it, on the same shocks (D11); null otherwise. */
  unleveragedSuccessRate?: number | null;
  /** S1: the Base 90% sustainable withdrawal of the last run and the withdrawal that run was typed with; null = not computed. */
  sustainable?: { base90: SustainableWithdrawal; capital: number; typedWithdrawal: number } | null;
  /** T5: where the withdrawals start and with what capital (today's euros); absent/null = the sentence of before, without the start. */
  start?: MonteCarloVerdictStart | null;
}

/** T5 (§ 12.6): «Smettendo nel 2031 (a 45 anni) con 812.000 € di oggi» / «Smettendo oggi con 700.000 €». */
export interface MonteCarloVerdictStart {
  /** False = the plan starts today. */
  atFire: boolean;
  calendarYear: number;
  age: number | null;
  capital: number;
}

/** «1,5×» / «1,32×»: the leverage as the page prints it, two decimals at most. */
export function formatLeverage(value: number): string {
  return `${value.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}×`;
}

/** « Con leva 1,5× il piano regge nell'87% delle simulazioni; senza leva, sugli stessi rendimenti, nel 94%.» — a comparison carries no tone of its own. */
function leverageSentence(run: MonteCarloRun, unleveragedSuccessRate: number | null | undefined): Narrative {
  if (run.leverage <= 1 || unleveragedSuccessRate === null || unleveragedSuccessRate === undefined) return [];
  return [
    prose(' Con leva '),
    figure(formatLeverage(run.leverage)),
    prose(' il piano regge '),
    prose(inThePercent(run.successRate)),
    figure(ratePct(run.successRate)),
    prose(' delle simulazioni; senza leva, sugli stessi rendimenti, '),
    prose(inThePercent(unleveragedSuccessRate)),
    figure(ratePct(unleveragedSuccessRate)),
    prose('.'),
  ];
}

/** «fino a 81 anni (2061)» with a saved age, «per 35 anni (fino al 2061)» without. */
function horizonClause(run: MonteCarloRun): Narrative {
  if (run.endAge !== null) return [prose('fino a '), figure(years(run.endAge)), prose(' ('), year(run.endCalendarYear), prose(')')];
  return [prose('per '), figure(years(run.years)), prose(' (fino al '), year(run.endCalendarYear), prose(')')];
}

/** «entro il 2053 (73 anni)» / «entro il 2053». */
function depletionClause(calendarYear: number, age: number | null): Narrative {
  const out: Narrative = [prose('entro il '), year(calendarYear)];
  if (age !== null) out.push(prose(' ('), figure(years(age)), prose(')'));
  return out;
}

/** « di oggi» after a euro figure of a run in today's euros (RD6), nothing for a nominal one. */
function todaySuffix(run: Pick<MonteCarloRun, 'todayEuros'>): Narrative {
  return run.todayEuros ? [prose(' di oggi')] : [];
}

/** The median and the worst tenth, as one clause pair after the semicolon. */
function outcomesClause(run: MonteCarloRun): Narrative {
  const medianRunsOut = run.medianFinal <= 0;
  const median: Narrative = medianRunsOut
    ? [prose('nel caso mediano i soldi finiscono prima del '), year(run.endCalendarYear)]
    : [prose('nel caso mediano chiudi con '), amount(run.medianFinal), ...todaySuffix(run)];
  if (run.p10DepletionCalendarYear !== null) {
    return [...median, prose(medianRunsOut ? ', nel 10% peggiore ' : ', nel 10% peggiore i soldi finiscono '), ...depletionClause(run.p10DepletionCalendarYear, run.p10DepletionAge)];
  }
  return [...median, prose(', e anche nel 10% peggiore chiudi con almeno '), amount(run.finalPercentiles.p10), ...todaySuffix(run)];
}

/**
 * S1, three forms and no tone (a proposal, not a judgement): the withdrawal that keeps the plan at 90%.
 *  ≤ W90 → « Per restare al 90% potresti prelevare fino a 43.300 € l'anno di oggi (3.608 € al mese), il 4,3% del capitale.»
 *  > W90 → « Per tornare al 90% il prelievo dovrebbe scendere a 43.300 € l'anno di oggi (il 4,3% del capitale).»
 *  null  → « Con questa leva nessun prelievo arriva al 90%: ...»
 */
function sustainableSentence(input: MonteCarloVerdictInput['sustainable']): Narrative {
  if (!input) return [];
  const { base90, typedWithdrawal } = input;
  if (base90.withdrawal === null || base90.rate === null) {
    return [prose(' Con questa leva nessun prelievo arriva al 90%: in più di una simulazione su dieci la leva azzera il capitale da sola.')];
  }
  if (base90.withdrawal === 0) {
    return [prose(' Nemmeno un prelievo di '), amount(100), prose(" l'anno di oggi arriva al 90%.")];
  }
  const rate: Narrative = [figure(ratePct(base90.rate * 100))];
  if (typedWithdrawal <= base90.withdrawal) {
    return [prose(" Per restare al 90% potresti prelevare fino a "), amount(base90.withdrawal), prose(" l'anno di oggi ("), amount(base90.withdrawal / 12), prose(' al mese), il '), ...rate, prose(' del capitale.')];
  }
  return [prose(' Per tornare al 90% il prelievo dovrebbe scendere a '), amount(base90.withdrawal), prose(" l'anno di oggi (il "), ...rate, prose(' del capitale).')];
}

/** « Nello scenario orso regge nel 61,5% dei casi, nel toro nel 96,8%.» */
function scenariosSentence(scenarios: ScenarioComparison | null): Narrative {
  if (!scenarios) return [];
  const bear = scenarios.rows.find((row) => row.key === 'bear');
  const bull = scenarios.rows.find((row) => row.key === 'bull');
  if (!bear || !bull) return [];
  return [prose(' Nello scenario orso regge '), prose(inThePercent(bear.successRate)), figure(ratePct(bear.successRate)), prose(' dei casi, nel toro '), prose(inThePercent(bull.successRate)), figure(ratePct(bull.successRate)), prose('.')];
}

/** « Numeri con il modello ponte: i 31.400 € del fondo pensione entrano nel 2045 al valore di oggi.» */
function bridgeSentence(lock: FireLock, run?: MonteCarloRun): Narrative {
  if (!lock.active || lock.lockedValue <= 0 || lock.unlockCalendarYear === null) return [];
  // T5 (RD4): a fund that unlocks at or before the FIRE year is already inside the capital the run starts from.
  if (run && run.startYears > 0 && lock.unlockCalendarYear <= run.startCalendarYear) {
    return [prose(' Il fondo pensione ('), amount(lock.lockedValue), prose(") si sblocca nel "), year(lock.unlockCalendarYear), prose(', prima di smettere: è già nel capitale.')];
  }
  return [prose(' Numeri con il modello ponte: i '), amount(lock.lockedValue), prose(' del fondo pensione entrano nel '), year(lock.unlockCalendarYear), prose(' al valore di oggi.')];
}

export function buildMonteCarloVerdict(input: MonteCarloVerdictInput): PageVerdictModel {
  if (!input.runnable) {
    return {
      headline: 'Monte Carlo non calcolabile.',
      tone: 'neutral',
      sentence: [prose('Servono un patrimonio iniziale e un prelievo annuo maggiori di zero: inseriscili nella tessera Parametri.')],
    };
  }
  const run = input.run;
  if (!run) {
    return {
      headline: 'Simulazione non ancora eseguita.',
      tone: 'neutral',
      sentence: [prose('Premi Prova nella tessera Parametri: i tre scenari girano insieme.')],
    };
  }

  const everySimulation = run.successRate >= 99.95;
  const headline = everySimulation ? 'Il piano regge in ogni simulazione.' : `Il piano regge ${inThePercent(run.successRate)}${ratePct(run.successRate)} dei casi.`;
  const start = input.start ?? null;
  const startClause: Narrative = start
    ? [
        prose('Smettendo '),
        ...(start.atFire ? [prose('nel '), year(start.calendarYear), ...(start.age !== null ? [prose(' (a '), figure(years(start.age)), prose(')')] : [])] : [prose('oggi')]),
        prose(' con '),
        amount(start.capital),
        ...(run.todayEuros && start.atFire ? [prose(' di oggi')] : []),
        prose(', '),
      ]
    : [];
  // With the start named the sentence continues in lower case («…, nel 63% delle 10.000 simulazioni…»).
  const lead = (text: string): string => (start ? text.replace(/^N/, 'n').replace(/^I/, 'i') : text);
  const opening: Narrative = everySimulation
    ? [...startClause, prose(lead('In tutte le ')), count(run.simulations), prose(' simulazioni il capitale regge ')]
    : [...startClause, prose(lead(inThePercent(run.successRate).replace(/^n/, 'N'))), figure(ratePct(run.successRate)), prose(' delle '), count(run.simulations), prose(' simulazioni il capitale regge ')];

  return {
    headline,
    tone: resolveSuccessTone(run.successRate),
    sentence: [...opening, ...horizonClause(run), prose('; '), ...outcomesClause(run), prose('.'), ...sustainableSentence(input.sustainable), ...leverageSentence(run, input.unleveragedSuccessRate), ...scenariosSentence(input.scenarios), ...bridgeSentence(input.lock, run)],
  };
}

// ─── Probabilità ──────────────────────────────────────────────────────────────

/**
 * «8.421 simulazioni su 10.000 arrivano al 2061 con capitale positivo; le 1.579 che falliscono
 * esauriscono il capitale in media nell'anno 24 (2050).»
 */
export function describeProbabilita(run: MonteCarloRun): Narrative {
  if (run.failureCount === 0) {
    return [prose('Tutte le '), count(run.simulations), prose(' simulazioni arrivano al '), year(run.endCalendarYear), prose(' con capitale positivo.')];
  }
  const out: Narrative = [count(run.successCount), prose(' simulazioni su '), count(run.simulations), prose(' arrivano al '), year(run.endCalendarYear), prose(' con capitale positivo')];
  if (run.failureAverageYear === null || run.failureAverageCalendarYear === null) return [...out, prose('.')];
  if (run.failureCount === 1) {
    return [...out, prose("; l'unica che fallisce esaurisce il capitale nell'anno "), figure(String(run.failureAverageYear)), prose(' ('), year(run.failureAverageCalendarYear), prose(').')];
  }
  return [
    ...out,
    prose('; le '),
    count(run.failureCount),
    prose(" che falliscono esauriscono il capitale in media nell'anno "),
    figure(String(run.failureAverageYear)),
    prose(' ('),
    year(run.failureAverageCalendarYear),
    prose(').'),
  ];
}

/** «scenario base · 10.000 simulazioni · 35 anni» */
export function describeProbabilitaAside(run: MonteCarloRun): string {
  return `scenario base · ${run.simulations.toLocaleString('it-IT')} simulazioni Monte Carlo · ${years(run.years)}`;
}

/** The fan's legend in words, the pension step when a fund enters, and what the euros are. */
export function describeProbabilitaFooter(run: MonteCarloRun, lock: FireLock): Narrative {
  const out: Narrative = [
    prose('La linea è la mediana delle '),
    figure(run.simulations.toLocaleString('it-IT')),
    prose(' traiettorie, le bande il 25–75 e il 10–90; la tratteggiata in basso è il capitale esaurito.'),
  ];
  if (lock.active && lock.lockedValue > 0 && lock.unlockCalendarYear !== null && lock.unlockCalendarYear <= run.endCalendarYear && (run.startYears === 0 || lock.unlockCalendarYear > run.startCalendarYear)) {
    out.push(prose(' Il gradino nel '), year(lock.unlockCalendarYear), prose(' è il fondo pensione che entra, al valore di oggi.'));
  }
  if (run.todayEuros && run.inflationRate !== null) {
    out.push(prose(' Euro di oggi, inflazione '), figure(formatPercentage(run.inflationRate, 2)), prose(' (Impostazioni › Simulazioni): il prelievo resta costante in potere d\'acquisto.'));
  } else {
    out.push(prose(" Valori nominali: il prelievo cresce con l'inflazione."));
  }
  // R4: with leverage, the failures split by cause; the sentence is absent when none is leverage ruin.
  if (run.leverageFailureCount > 0) {
    out.push(
      prose(' Dei '),
      count(run.failureCount),
      prose(' fallimenti, '),
      count(run.leverageFailureCount),
      prose(' per rovina da leva (una perdita annua oltre il capitale), '),
      count(run.failureCount - run.leverageFailureCount),
      prose(' per prelievi.'),
    );
  }
  return out;
}

// ─── Scenari a confronto ──────────────────────────────────────────────────────

export const SCENARI_ASIDE = 'stesso piano, mercati diversi';

export const SCENARI_FOOTER: Narrative = [
  prose(
    'Le tre esecuzioni condividono patrimonio, prelievo, durata e allocazione; cambiano solo rendimenti, volatilità e inflazione (tessera Parametri). La riga Base è il riferimento delle altre tessere.',
  ),
];

/** «Lo scenario orso regge nel 61,5% dei casi, il toro nel 96,8%: 35 punti di distanza attorno al base.» */
export function describeScenari(comparison: ScenarioComparison): Narrative {
  const bear = comparison.rows.find((row) => row.key === 'bear');
  const bull = comparison.rows.find((row) => row.key === 'bull');
  if (!bear || !bull) return [];
  const spread = Math.round(comparison.spreadPoints);
  const tail: Narrative = Math.abs(comparison.spreadPoints) < 0.5 ? [prose('i tre scenari non si distinguono.')] : [figure(`${spread} ${Math.abs(spread) === 1 ? 'punto' : 'punti'}`), prose(' di distanza attorno al base.')];
  return [prose('Lo scenario orso regge '), prose(inThePercent(bear.successRate)), figure(ratePct(bear.successRate)), prose(' dei casi, il toro '), prose(inThePercent(bull.successRate)), figure(ratePct(bull.successRate)), prose(': '), ...tail];
}

/** «mediana finale 198.000 € · nel 10% peggiore esaurito nel 2045» */
export function describeScenarioNote(row: ScenarioRunSummary): Narrative {
  const median: Narrative = row.medianFinal <= 0 ? [prose('nel caso mediano i soldi finiscono')] : [prose('mediana finale '), amount(row.medianFinal), ...(row.todayEuros ? [prose(' di oggi')] : [])];
  const worst: Narrative = row.p10DepletionCalendarYear !== null ? [prose('nel 10% peggiore esaurito nel '), year(row.p10DepletionCalendarYear)] : [prose('anche il 10% peggiore regge')];
  return [...median, prose(' · '), ...worst];
}

/** The scenario's name as the tiles print it («Orso»). */
export function scenarioLabel(key: ScenarioRunSummary['key']): string {
  const name = SCENARIO_NAMES[key];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── Spesa sostenibile (S1) ───────────────────────────────────────────────────

export const SPESA_ASIDE = "euro di oggi, l'anno";

/** «In 9 simulazioni su 10 il capitale regge 30 anni prelevando fino a 43.300 € l'anno di oggi; nell'orso 33.700 €.» */
export function describeSpesaSostenibile(summary: SustainableSpendingSummary, horizonYears: number): Narrative {
  const row = summary.rows.find((candidate) => candidate.probability === 0.9);
  if (!row) return [];
  if (row.base.withdrawal === null) {
    return [prose('Con questa leva nessun prelievo fa reggere il piano in 9 simulazioni su 10: la leva azzera il capitale da sola.')];
  }
  const bear: Narrative = row.bear.withdrawal === null ? [prose("nell'orso nessun prelievo basta")] : [prose("nell'orso "), amount(row.bear.withdrawal)];
  return [
    prose('In 9 simulazioni su 10 il capitale regge '),
    figure(years(horizonYears)),
    prose(' prelevando fino a '),
    amount(row.base.withdrawal),
    prose(" l'anno di oggi; "),
    ...bear,
    prose('.'),
  ];
}

export const SPESA_FOOTER: Narrative = [
  prose('Prelievo fisso rivalutato con l\'inflazione, sugli stessi percorsi della simulazione: capitale, pesi, pensioni e tasse del piano.'),
];

/** The «Come si calcola» paragraphs. */
export const SPESA_METHOD: string[] = [
  'Per ogni scenario i rendimenti dei percorsi sono quelli della simulazione, estratti una volta: per ogni prelievo provato si rifà solo il conto dei prelievi, anno per anno, con inflazione, pensioni di Stato e tassa del piano.',
  'La cifra è il prelievo più alto, a multipli di 100 €, con cui il capitale arriva alla fine in almeno l\'80, il 90 o il 95% dei percorsi. Il seme è fisso: la cifra è stabile, non esatta, perché con 10.000 simulazioni un altro seme la sposterebbe di circa l\'1–2%.',
  'Se la leva azzera il capitale in più di una simulazione su cinque (all\'80%), dieci (al 90%) o venti (al 95%), nessun prelievo basta per quel livello e la cella dice «nessun prelievo».',
];

/** A cell of the table: «43.300 €» / «nessun prelievo». */
export function describeSpesaCell(cell: SustainableWithdrawal): string {
  return cell.withdrawal === null ? 'nessun prelievo' : formatAmount(cell.withdrawal);
}

/** «3.608 € al mese · 4,3% del capitale» next to the hero. */
export function describeSpesaHeroAside(cell: SustainableWithdrawal): string | null {
  if (cell.withdrawal === null || cell.rate === null) return null;
  return `${formatAmount(cell.withdrawal / 12)} al mese · ${ratePct(cell.rate * 100)} del capitale`;
}

// ─── Parametri ────────────────────────────────────────────────────────────────

export const PARAMETRI_ASIDE = 'una prova, non si salva · le ipotesi di mercato stanno in Impostazioni';

/**
 * «Parti da 488.600 € — il patrimonio senza i 31.400 € del fondo pensione bloccato — e prelevi
 * 22.000 € l'anno, indicizzati all'inflazione, per 35 anni, con il 58% in azioni, …»
 */
export function describeParametri(plan: MonteCarloPlan): Narrative {
  const out: Narrative = [prose('Parti da '), amount(plan.initialPortfolio)];
  if (plan.lockedValue > 0) out.push(prose(' — il patrimonio senza i '), amount(plan.lockedValue), prose(' del fondo pensione bloccato —'));
  out.push(prose(' e prelevi '), amount(plan.annualWithdrawal), prose(plan.isIndexed ? " l'anno, indicizzati all'inflazione, per " : " l'anno, fissi, per "), figure(years(plan.years)));
  if (plan.allocation.length > 0) {
    out.push(prose(', con '));
    out.push(...joinList(plan.allocation.map((entry) => [prose(articleForPercent(entry.pct, 0)), figure(formatPercentage(entry.pct, 0)), prose(` in ${entry.label}`)])));
  }
  out.push(prose('.'));
  return out;
}

/** The two ways the tab can start (§ 12.6): at the Calcolatore's FIRE year, or today. */
export type StartMode = 'fire' | 'today';

export const START_MODE_LABELS: Record<StartMode, (start: FireStart) => string> = {
  fire: (start) => (start.kind === 'fire' ? `Al FIRE (${start.calendarYear})` : 'Al FIRE'),
  today: () => 'Oggi',
};

/**
 * The read-only line under «Quando smetto» (T5, DF2/DF3/DF6): the Calcolatore's FIRE year on the saved plan and the Base capital
 * the run starts from, or why the run starts today. `currentYear` dates the «mai entro 50 anni» case.
 */
export function describeFireStartRow(start: FireStart, mode: StartMode, currentYear: number): Narrative {
  if (start.kind === 'today') {
    switch (start.reason) {
      case 'already':
        return [prose('Sei già FIRE: la simulazione parte da oggi.')];
      case 'never':
        return [prose('Il Calcolatore non trova un anno FIRE entro il '), year(currentYear + 50), prose(': la simulazione parte da oggi.')];
      default:
        return [prose('Il Calcolatore non ha spesa o SWR: la simulazione parte da oggi.')];
    }
  }
  if (mode === 'today') {
    return [prose('La simulazione parte da oggi con il capitale di oggi; il Calcolatore dice FIRE nel '), year(start.calendarYear), prose('.')];
  }
  return [
    prose('Anno FIRE del Calcolatore, scenario Base, sul piano salvato. Capitale al FIRE: '),
    amount(start.capitalToday),
    prose(' di oggi ('),
    amount(start.capitalNominal),
    prose(' nel '),
    year(start.calendarYear),
    prose('). Al FIRE si può arrivare con più o con meno: qui conta la cifra del Base, la stessa per orso, base e toro.'),
  ];
}

export type AllocationTotalState = 'below' | 'plain' | 'leveraged' | 'above';

/** The most leverage the form accepts, as a weights sum in percent («leva oltre 3×»). */
export const MAX_WEIGHTS_SUM = 300;

/** What the sum of the weights means for the run: under 100 it cannot run, above 300 neither, in between it is a plain or a leveraged portfolio. */
export function resolveAllocationTotalState(sum: number): AllocationTotalState {
  if (sum < 100 - 0.01) return 'below';
  if (sum > MAX_WEIGHTS_SUM + 0.01) return 'above';
  return sum > 100.01 ? 'leveraged' : 'plain';
}

/** «Totale 150% · leva 1,5×» / «Totale 100%» / «Totale 85%: deve arrivare ad almeno 100%» / «Totale 340%: leva oltre 3×». */
export function describeAllocationTotal(sum: number): Narrative {
  const total = (value: number) => figure(`Totale ${value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`);
  switch (resolveAllocationTotalState(sum)) {
    case 'below':
      return [total(sum), prose(': deve arrivare ad almeno 100%')];
    case 'above':
      return [total(sum), prose(': '), figure('leva oltre 3×')];
    case 'leveraged':
      return [total(sum), prose(' · leva '), figure(formatLeverage(sum / 100))];
    default:
      return [total(sum)];
  }
}

export type WeightsOrigin = 'targets' | 'holdings' | 'edited';

export interface WeightsSourceInput {
  origin: WeightsOrigin;
  /** The leverage of the weights as they stand (`Σw / 100`). */
  leverage: number;
  /** Allocazione has targets on the modelled classes: «Usa i target» has something to load. */
  hasTargets: boolean;
}

/** Where the weights come from, in one line (R6): the targets, the portfolio of today, or typed by hand. */
export function describeWeightsSource({ origin, leverage, hasTargets }: WeightsSourceInput): Narrative {
  const leverageClause: Narrative = leverage > 1.0005 ? [prose(', leva '), figure(formatLeverage(leverage))] : [];
  if (origin === 'targets') return [prose('Dai target di Allocazione'), ...leverageClause, prose('.')];
  if (origin === 'holdings') {
    return hasTargets ? [prose('Dal portafoglio di oggi'), ...leverageClause, prose('.')] : [prose('Nessun target configurato in Allocazione: parti dal portafoglio di oggi'), ...leverageClause, prose('.')];
  }
  return [prose('Pesi modificati a mano'), ...leverageClause, prose('.')];
}

/** The Declaration-Tile line: where the market assumptions come from (they are edited in Impostazioni, never here). */
export function describeMarketDeclaration(market: Pick<ResolvedMonteCarloMarket, 'origin' | 'editedClasses'> & Partial<Pick<ResolvedMonteCarloMarket, 'correlations' | 'correlationOrigin' | 'leverageSpread'>>, leverage = 1): Narrative {
  const out = describeMarketOrigin(market);
  // T2: the correlations are declared on the same line («correlazioni predefinite» / «personalizzate»).
  if (market.correlationOrigin) {
    out.push(prose(' Correlazioni '), figure(market.correlationOrigin === 'saved' ? 'personalizzate' : 'predefinite'), prose('.'));
  }
  // R4/D9: the debt's price is declared on the same line, only when there is debt.
  if (leverage > 1 && market.leverageSpread !== undefined) {
    out.push(prose(' Il debito costa la liquidità dell’anno più '), figure(`${market.leverageSpread.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`), prose('.'));
  }
  return out;
}

function describeMarketOrigin(market: Pick<ResolvedMonteCarloMarket, 'origin' | 'editedClasses'>): Narrative {
  if (market.origin === 'default') return [prose('Ipotesi di mercato: '), figure('valori predefiniti'), prose(', storici di lungo periodo in dollari.')];
  if (market.origin === 'migrated') {
    return [prose('Ipotesi di mercato: '), figure('migrate dai parametri salvati prima'), prose(' (da media aritmetica a CAGR): rileggile in Impostazioni.')];
  }
  const edited = market.editedClasses.length;
  if (edited === 0) return [prose('Ipotesi di mercato: '), figure('salvate'), prose(', uguali ai valori predefiniti.')];
  return [prose('Ipotesi di mercato: '), figure('salvate'), prose(', modificate in '), figure(String(edited)), prose(edited === 1 ? ' classe.' : ' classi.')];
}

/** «Fondo pensione: +31.400 € aggiunti da soli nell'anno 19 (2045), al valore di oggi.» */
export function describePensionInflowRow(inflow: PlanInflow): Narrative {
  return [prose('Fondo pensione: '), figure(`+${formatAmount(inflow.amount)}`), prose(" aggiunti da soli nell'anno "), figure(String(inflow.yearOffset)), prose(' ('), year(inflow.calendarYear), prose('), al valore di oggi.')];
}

/** «Pensione statale: −13.000 € l'anno tolti dal prelievo dall'anno 34 (2060), netti, al valore di oggi.» */
export function describeStatePensionRow(pension: PlanStatePension): Narrative {
  const from: Narrative = pension.yearOffset <= 0 ? [prose(' tolti dal prelievo da subito')] : [prose(" tolti dal prelievo dall'anno "), figure(String(pension.yearOffset)), prose(' ('), year(pension.calendarYear), prose(')')];
  return [prose('Pensione statale: '), figure(`−${formatAmount(pension.annualNetToday)}`), prose(" l'anno"), ...from, prose(', netti, al valore di oggi.')];
}

/** «Tasse sui prelievi: ogni prelievo vende quanto serve a pagare il 26% sulla plusvalenza (40% del capitale oggi).» */
export function describeWithdrawalTaxRow(tax: PlanWithdrawalTax | null): Narrative {
  if (!tax) return [prose('Tasse sui prelievi: non stimate, nessun PMC in euro nel portafoglio.')];
  return [prose('Tasse sui prelievi: ogni prelievo vende quanto serve a pagare il '), figure(ratePct(tax.rate)), prose(' sulla plusvalenza ('), figure(ratePct(tax.gainSharePct)), prose(' del capitale oggi).')];
}

export interface ParametriFooterInput {
  /** The typed inputs differ from the ones the shown results were run with. */
  stale: boolean;
  simulations: number;
}

export function describeParametriFooter(input: ParametriFooterInput): Narrative {
  if (input.stale) return [prose("I risultati sopra usano i parametri dell'ultima esecuzione: premi Prova per aggiornarli.")];
  return [prose('Ultima esecuzione con questi parametri · '), figure((input.simulations * 3).toLocaleString('it-IT')), prose(' traiettorie, '), figure(input.simulations.toLocaleString('it-IT')), prose(' per scenario.')];
}

// ─── Dettaglio ────────────────────────────────────────────────────────────────

export const DETTAGLIO_DESCRIPTION = 'Traiettorie dei tre scenari in euro di oggi, percentili a passi di 5 anni, come funziona';

/** «Le tre mediane partono dagli stessi 488.600 €; nel 2061 l'orso chiude a 198.000 €, il base a 612.400 €, il toro a 1.420.000 €.» */
export function describeTraiettorie(comparison: ScenarioComparison, plan: MonteCarloPlan): Narrative {
  const out: Narrative = [prose('Le tre mediane partono dagli stessi '), amount(plan.initialPortfolio), prose('; nel '), year(plan.endCalendarYear), prose(' ')];
  // «chiude a» is said once, by the first scenario that closes with money; the next ones read «a».
  let closeSaid = false;
  comparison.rows.forEach((row, index) => {
    const article = row.key === 'bear' ? "l'orso" : `il ${SCENARIO_NAMES[row.key]}`;
    if (index > 0) out.push(prose(', '));
    out.push(prose(article));
    if (row.medianFinal <= 0) {
      out.push(prose(' finisce i soldi'));
      return;
    }
    out.push(prose(closeSaid ? ' a ' : ' chiude a '), amount(row.medianFinal));
    closeSaid = true;
  });
  out.push(prose('.'));
  return out;
}

/** «Il 10° percentile scende a zero dal 2053: da lì in poi almeno una simulazione su dieci ha finito i soldi.» */
export function describePercentili(run: MonteCarloRun): Narrative {
  if (run.p10DepletionCalendarYear !== null) {
    return [prose('Il 10° percentile scende a zero dal '), year(run.p10DepletionCalendarYear), prose(': da lì in poi almeno una simulazione su dieci ha finito i soldi.')];
  }
  return [prose('Nessun percentile tocca zero: anche il 10° chiude il '), year(run.endCalendarYear), prose(' con '), amount(run.finalPercentiles.p10), ...todaySuffix(run), prose('.')];
}

export const EXPLAINER: { title: string; body: string }[] = [
  {
    title: 'La simulazione',
    body: 'Ogni traiettoria parte dal patrimonio iniziale e, anno per anno, incassa gli afflussi previsti, applica un rendimento casuale per ciascuna delle sette classi, estratto da una lognormale con il CAGR e la volatilità dello scenario (il CAGR è la crescita composta mediana, la media aritmetica è un po’ più alta), si toglie la quota di TER e bollo della riga «Ipotesi usate» (dopo il rendimento, prima del prelievo) e poi preleva la spesa annua indicizzata. Immobili e crypto non entrano nel capitale simulato. Se il capitale scende a zero la traiettoria fallisce.',
  },
  {
    title: 'La leva',
    body: "Con pesi che sommano oltre il 100% il portafoglio è a leva: ogni anno il rendimento è la somma dei pesi per i rendimenti delle classi, meno il debito (la leva meno uno) che costa il rendimento della liquidità estratto quell'anno più lo spread di Impostazioni. La leva si ribilancia ogni anno, come un ETF a leva; un conto a margine con debito fisso non è modellato. Se in un anno la perdita supera il capitale la traiettoria fallisce per rovina da leva, contata a parte dai prelievi. Con la leva il Base gira anche senza, sugli stessi rendimenti, per mostrare cosa cambia. Il seme è fisso: due esecuzioni con gli stessi parametri danno lo stesso risultato.",
  },
  {
    title: 'La partenza',
    body: "La simulazione parte dall'anno in cui il Calcolatore, sul piano salvato e nello scenario Base, dice che si arriva al FIRE, con il capitale che il Base ha quell'anno in euro di oggi; con «Oggi» parte dal capitale di oggi. Orso, base e toro partono dallo stesso capitale e dallo stesso anno: gli scenari differiscono solo dopo il FIRE, quindi la probabilità non dice cosa succede se al FIRE si arriva con più o con meno. Pensioni, fondo pensione e flussi sono letti dall'anno FIRE; tutte le cifre sono in euro di oggi, il nominale solo nella colonna «Mediana nominale».",
  },
  {
    title: 'La probabilità',
    body: "È la quota di traiettorie che arrivano alla fine dell'orizzonte con capitale positivo. Sopra il 90% il piano è solido, fra 80 e 90 va tenuto d'occhio, sotto l'80 conviene rivedere prelievo o patrimonio.",
  },
  {
    title: 'I limiti',
    body: 'Rendimenti indipendenti anno per anno, classi correlate con una matrice unica per i tre scenari (le correlazioni nelle crisi tendono a salire e qui non salgono), nessuna sequenza di crisi forzata, fondo pensione al valore di oggi: la simulazione misura la dispersione, non predice il futuro. Con la stessa allocazione il Ventaglio del Calcolatore mostra la fase di accumulo.',
  },
];
