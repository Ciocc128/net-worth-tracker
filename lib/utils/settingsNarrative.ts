/**
 * The words of Impostazioni: the one-line reading under each settings tile.
 *
 * The page has NO verdict — it is a form, not a measurement — but it keeps the tile cadence:
 * every group of settings states its CURRENT state in one rule-generated sentence, and every
 * reading declares the downstream effect of the group («guidano l'auto-calcolo dei target»,
 * «il salvataggio è bloccato»), because a setting the reader cannot place is a setting they
 * will not trust. Each phrasing is pinned by __tests__/settingsNarrative.test.ts.
 *
 * The Narrative Honesty Rule holds: a missing input drops its clause (no risk-free rate → no
 * rate clause, and the sentence says what stalls without it).
 *
 * Percentages go through chartService's it-IT formatter (comma decimals); currency through
 * `cachedFormatCurrencyEUR` (nbsp before €, four-digit amounts ungrouped).
 */

import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import { CHECKING_ACCOUNT_STAMP_DUTY_EUR, CHECKING_ACCOUNT_STAMP_DUTY_THRESHOLD_EUR } from '@/lib/constants/stampDuty';
import type { ExpenseType } from '@/types/expenses';
import type { CategoryClassificationCounts } from '@/lib/utils/spendingRoles';
import type { AssetClass, IdealAllocationSettings, ObjectivePriority } from '@/types/assets';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { INDEX_PROFILES } from '@/lib/constants/instrumentProfiles';
import type { TargetProblem } from '@/lib/utils/allocationTargetValidation';
import type { RiskFreeResolution } from '@/lib/utils/riskFreeRate';
import { formatAnchorDate } from '@/lib/utils/marketAnchors';
import { MONTE_CARLO_DEFAULTS_LAST_YEAR, MONTE_CARLO_FROZEN_ANCHORS, type MonteCarloHedgeSwitches, type MonteCarloHedgeableClass, hedgedClassList } from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASS_LABELS } from '@/lib/constants/monteCarloClasses';
import type { MonteCarloMarketOrigin } from '@/lib/utils/monteCarloMarket';

// ─── Segment helpers ──────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** A whole euro figure, compact (no cents) — settings readings never need cents. */
const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

/** A percentage with only the decimals the value carries: 100 → «100%», 3,5 → «3,5%». */
function pctTrim(value: number): string {
  const decimals = value % 1 === 0 ? 0 : (value * 10) % 1 === 0 ? 1 : 2;
  return formatPercentage(value, decimals);
}

/** A plain number with only the decimals it carries («7,5», «34»). */
function numTrim(value: number): string {
  const decimals = value % 1 === 0 ? 0 : (value * 10) % 1 === 0 ? 1 : 2;
  return formatNumber(value, decimals);
}

/** «X», «X e Y», «X, Y e Z» — the Italian list join. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** 'YYYY-MM' → «novembre 2025». */
function monthYearInSentence(isoMonth: string): string {
  const [year, month] = isoMonth.split('-').map((part) => Number.parseInt(part, 10));
  return `${MONTH_NAMES[month - 1].toLowerCase()} ${year}`;
}

// ─── The page's save state ────────────────────────────────────────────────────

/**
 * The line of the unsaved-changes bar: WHICH tabs hold edits «Salva» has not written, in the
 * tabs' own labels and in the order the tab bar shows them. `null` when nothing is pending — the
 * bar leaves the page instead of saying «tutto salvato», which the absence already says.
 */
export function describeUnsavedChanges(tabLabels: string[]): string | null {
  if (tabLabels.length === 0) return null;
  return `Modifiche non salvate in ${joinNames(tabLabels)}`;
}

// ─── Investimenti, Cashflow, Account, Funzioni ───────────────────────────────────────────────────────────

export interface PerformanceBaseInput {
  includesPensionFunds: boolean;
  includesExcludedAssets: boolean;
  /** «Liquidità fuori dalla base»: the cash accounts leave the metrics, what they pay for is a measured flow. */
  excludesCash?: boolean;
  /** ISO 'YYYY-MM'; empty string = start from the first recorded contribution. */
  pensionReturnStartMonth: string;
}

/** Calcolo dei rendimenti — which capital the metrics measure, and since when the fund's return exists. */
export function describePerformanceBase({
  includesPensionFunds,
  includesExcludedAssets,
  excludesCash = false,
  pensionReturnStartMonth,
}: PerformanceBaseInput): Narrative {
  let base: string;
  if (!includesPensionFunds && !includesExcludedAssets) {
    base = 'Base gestita: fondi pensione e asset esclusi restano fuori';
  } else if (includesPensionFunds && !includesExcludedAssets) {
    base = 'Base allargata ai fondi pensione dal mese tracciato (i versamenti sono flussi, non rendimento); gli asset esclusi restano fuori';
  } else if (!includesPensionFunds && includesExcludedAssets) {
    base = 'Base allargata agli asset esclusi (la casa ferma abbassa la volatilità); i fondi pensione restano fuori';
  } else {
    base = 'Base completa: fondi pensione (dal mese tracciato) e asset esclusi contano nelle metriche';
  }
  const cashClause = excludesCash ? '; la liquidità resta fuori e gli acquisti pagati dai conti sono flussi misurati, non rendimento' : '';
  const monthClause = pensionReturnStartMonth
    ? `; il rendimento del fondo si misura da ${monthYearInSentence(pensionReturnStartMonth)}.`
    : '; il rendimento del fondo si misura dal primo versamento registrato.';
  return [prose(base), prose(cashClause), prose(monthClause)];
}

export interface CostsInput {
  stampDutyEnabled: boolean;
  stampDutyRate: number;
  /** Cash subcategory name, or the '__none__' sentinel / empty when unset. */
  checkingAccountSubCategory: string;
}

/**
 * Costi — the stamp duty, and the checking-account rule: a flat fee above the threshold, never
 * the rate (the rate is the securities'). The sentence names the fee since 2026-09-24, when the
 * calculation was found charging the rate on the balance while this line implied the threshold alone.
 */
export function describeCosts({ stampDutyEnabled, stampDutyRate, checkingAccountSubCategory }: CostsInput): Narrative {
  if (!stampDutyEnabled) {
    return [prose('Imposta di bollo spenta: non entra nel costo annuo del portafoglio.')];
  }
  const hasSubCategory = checkingAccountSubCategory !== '' && checkingAccountSubCategory !== '__none__';
  const head: Narrative = [
    prose('Bollo allo '),
    figure(pctTrim(stampDutyRate)),
    prose(' attivo: entra nel costo annuo del portafoglio; '),
  ];
  if (hasSubCategory) {
    return [
      ...head,
      prose(`per i conti in ${checkingAccountSubCategory} è fisso, `),
      figure(cachedFormatCurrencyEUR(CHECKING_ACCOUNT_STAMP_DUTY_EUR)),
      prose(" l'anno solo oltre "),
      figure(euro(CHECKING_ACCOUNT_STAMP_DUTY_THRESHOLD_EUR)),
      prose('.'),
    ];
  }
  return [
    ...head,
    prose('senza la sottocategoria dei conti correnti, la soglia dei '),
    figure(euro(CHECKING_ACCOUNT_STAMP_DUTY_THRESHOLD_EUR)),
    prose(' e il bollo fisso non si applicano.'),
  ];
}

export interface IncomeHistoryInput {
  laborCategoryNames: string[];
  historyStartYear: number;
  /**
   * The expense categories were NOT read (a failed fetch): an empty `laborCategoryNames` then
   * means «unknown», not «none», and the labor clause says so instead of claiming no category
   * counts (DESIGN.md → The Absence-Has-Three-Names Rule).
   */
  categoriesUnread?: boolean;
}

/** Reddito e storico (Cashflow) — the categories that count as labor income and the history floor. */
export function describeIncomeHistory({ laborCategoryNames, historyStartYear, categoriesUnread = false }: IncomeHistoryInput): Narrative {
  const segments: Narrative = [];
  if (categoriesUnread) {
    segments.push(prose('Le categorie non sono state lette: il reddito da lavoro scelto non si può mostrare'));
  } else if (laborCategoryNames.length === 0) {
    segments.push(prose('Nessuna categoria conta come reddito da lavoro'));
  } else if (laborCategoryNames.length === 1) {
    segments.push(prose(`${laborCategoryNames[0]} conta come reddito da lavoro`));
  } else if (laborCategoryNames.length === 2) {
    segments.push(prose(`${joinNames(laborCategoryNames)} contano come reddito da lavoro`));
  } else {
    const extra = laborCategoryNames.length - 2;
    segments.push(
      prose(`${laborCategoryNames[0]}, ${laborCategoryNames[1]} e `),
      figure(String(extra)),
      prose(` ${extra === 1 ? 'altra contano' : 'altre contano'} come reddito da lavoro`)
    );
  }
  segments.push(prose('; lo storico parte dal '), figure(String(historyStartYear)), prose('.'));
  return segments;
}

export interface FunctionsInput {
  goalBasedInvesting: boolean;
  costCenters: boolean;
  expenseSplit: boolean;
  spendingRoles: boolean;
  // How many people are configured under Famiglia (Account). The split needs two: with fewer, the
  // switch is on and nothing happens, so the reading has to say which input is missing rather than
  // promising a division the page cannot compute.
  familyMemberCount: number;
}

/**
 * Funzioni — which pieces of the app exist. Says what is on and what is off, and — when the
 * Divisione is on without the two people it needs — names the missing input instead of promising a
 * division that cannot be computed (the Narrative Honesty Rule).
 */
export function describeFunctions({ goalBasedInvesting, costCenters, expenseSplit, spendingRoles, familyMemberCount }: FunctionsInput): Narrative {
  const pieces: [string, boolean][] = [
    ['Traguardi di investimento', goalBasedInvesting],
    ['Centri di Costo', costCenters],
    ['Divisione delle spese', expenseSplit],
    ['Ruoli 50/30/20', spendingRoles],
  ];
  const on = pieces.filter(([, enabled]) => enabled).map(([name]) => name);
  const off = pieces.filter(([, enabled]) => !enabled).map(([name]) => name);
  const segments: Narrative = [];
  if (on.length === 0) {
    segments.push(prose('Nessuna funzione accesa: restano le pagine di base.'));
  } else {
    segments.push(prose('Accese: '), figure(String(on.length)), prose(` su ${pieces.length} (${joinNames(on)})`));
    if (off.length > 0) segments.push(prose(`; spente: ${joinNames(off)}`));
    segments.push(prose('.'));
  }
  if (expenseSplit && familyMemberCount === 0) {
    segments.push(prose(' La Divisione è accesa, ma senza nessuno in Famiglia non riparte nulla.'));
  } else if (expenseSplit && familyMemberCount === 1) {
    segments.push(prose(" La Divisione è accesa, ma in Famiglia c'è una persona sola: servono almeno due."));
  }
  return segments;
}

export interface FamilyInput {
  members: { name: string; grossAnnualIncome?: number }[];
}

/** Famiglia — one clause per member, because the IRPEF ceiling is per taxpayer. */
export function describeFamily({ members }: FamilyInput): Narrative {
  if (members.length === 0) {
    return [prose('Nessun membro: i fondi pensione restano in Previdenza senza il calcolo del beneficio fiscale.')];
  }
  const segments: Narrative = [prose('Il beneficio fiscale di Previdenza si calcola per persona: ')];
  members.forEach((member, index) => {
    if (index > 0) segments.push(prose(index === members.length - 1 ? ' e ' : ', '));
    if (member.grossAnnualIncome !== undefined) {
      segments.push(prose(`${member.name} (RAL `), figure(euro(member.grossAnnualIncome)), prose(')'));
    } else {
      segments.push(prose(`${member.name} (senza RAL)`));
    }
  });
  segments.push(prose('.'));
  return segments;
}

export interface EmailsInput {
  monthly: boolean;
  quarterly: boolean;
  semiAnnual: boolean;
  yearly: boolean;
  weeklyBudget: boolean;
  recipientCount: number;
}

/** Email periodiche — which reports go out, to how many inboxes. */
export function describeEmails(input: EmailsInput): Narrative {
  const active: string[] = [];
  if (input.monthly) active.push('mensile');
  if (input.quarterly) active.push('trimestrale');
  if (input.semiAnnual) active.push('semestrale');
  if (input.yearly) active.push('annuale');
  if (input.weeklyBudget) active.push('budget settimanale');
  if (active.length === 0) {
    return [prose('Nessun report attivo: nessuna email in partenza.')];
  }
  const head = `Report ${joinNames(active)} ${active.length === 1 ? 'attivo' : 'attivi'}`;
  if (input.recipientCount === 0) {
    return [prose(`${head}, ma senza destinatari: aggiungi un indirizzo o non parte nulla.`)];
  }
  return [
    prose(`${head}, verso `),
    figure(String(input.recipientCount)),
    prose(` ${input.recipientCount === 1 ? 'destinatario' : 'destinatari'}.`),
  ];
}

// ─── Allocazione ──────────────────────────────────────────────────────────────

/** The words under «Risk-free rate»: where the figure in force comes from, and what the reader can do about it. */
export function describeRiskFreeSource(input: { typed: number | undefined; estimate: RiskFreeResolution }): string {
  const { estimate } = input;
  const estimateWords = (): string =>
    estimate.source === 'ecb' && estimate.date
      ? `tasso AAA a 10 anni della BCE, ${pctTrim(estimate.value)} del ${formatAnchorDate(estimate.date)}`
      : `tasso AAA a 10 anni della BCE, ${pctTrim(estimate.value)} (valore dell’${MONTE_CARLO_FROZEN_ANCHORS.asOf}, in attesa del primo aggiornamento)`;
  if (input.typed === undefined) {
    return `Stima: ${estimateWords()}. Si aggiorna da sola; scrivi un valore per fissarlo. Vale anche per Sharpe e Sortino.`;
  }
  return `Impostato da te. Stima della BCE: ${estimateWords()}. Vale anche per Sharpe e Sortino.`;
}

/**
 * The origin of the risk-free rate in force, in a few words, for the formula's row of Strategia ›
 * Target per classe (RU8): the field lives in Impostazioni › Investimenti, the row only says whose figure it is.
 */
export function describeRiskFreeOrigin(input: { typed: number | undefined; estimate: RiskFreeResolution }): string {
  if (input.typed !== undefined) return 'impostato da te';
  const { estimate } = input;
  return estimate.source === 'ecb' && estimate.date
    ? `stima BCE del ${formatAnchorDate(estimate.date)}`
    : 'stima BCE, in attesa del primo aggiornamento';
}

const classLabel = (assetClass: AssetClass): string => ASSET_CLASS_LABELS[assetClass] ?? assetClass;

/**
 * The first rule the target tree breaks (`findTargetProblem`), as the sentence the reader acts
 * on: WHICH group, and what it adds up to — never «dati non validi». The same words go in the
 * Target per classe reading and in the toast «Salva» raises, so the two cannot disagree.
 */
export function describeTargetProblem(problem: TargetProblem): Narrative {
  switch (problem.kind) {
    case 'total-below-100':
      return [
        prose('Le classi sommano '),
        figure(pctTrim(problem.total)),
        prose(': mancano '),
        figure(numTrim(100 - problem.total)),
        prose(' punti al '),
        figure('100%'),
        prose('.'),
      ];
    case 'sub-total':
      return [
        prose(`Le sottocategorie di ${classLabel(problem.assetClass)} sommano `),
        figure(pctTrim(problem.total)),
        prose(' invece del '),
        figure('100%'),
        prose('.'),
      ];
    case 'sub-name-duplicate':
      return [prose(`Due sottocategorie di ${classLabel(problem.assetClass)} si chiamano «${problem.name}»: i nomi devono essere diversi.`)];
    case 'specific-empty':
      return [
        prose(
          `«${problem.subName}» (${classLabel(problem.assetClass)}) traccia asset specifici ma non ne ha nessuno: aggiungine uno o spegni il tracciamento.`
        ),
      ];
    case 'specific-name-missing':
      return [prose(`Un asset specifico di «${problem.subName}» (${classLabel(problem.assetClass)}) non ha nome.`)];
    case 'specific-out-of-range':
      return [
        prose(`Un asset specifico di «${problem.subName}» (${classLabel(problem.assetClass)}) è fuori dall'intervallo `),
        figure('0–100%'),
        prose('.'),
      ];
    case 'specific-name-duplicate':
      return [
        prose(`Due asset specifici di «${problem.subName}» (${classLabel(problem.assetClass)}) si chiamano «${problem.name}».`),
      ];
    case 'specific-total':
      return [
        prose(`Gli asset specifici di «${problem.subName}» (${classLabel(problem.assetClass)}) sommano `),
        figure(pctTrim(problem.total)),
        prose(' invece del '),
        figure('100%'),
        prose('.'),
      ];
  }
}

export interface StrategiaTargetsInput {
  /** The source chosen in the tile's pill (`resolveTargetSource`). */
  source: 'manual' | 'formula' | 'goals';
  /** Classes with a target above 0, of `classCount`. */
  classesWithTarget: number;
  classCount: number;
  /** Σ class targets in % (the fixed-euro cash out). */
  total: number;
  /** The fixed euro of the cash, when the cash is a fixed amount; else null. */
  cashFixedAmount: number | null;
  /** The formula's inputs and its RESOLVED equity share (after the other classes); absent figures = missing. */
  formula: { userAge?: number; riskFreeRate?: number; equityPct?: number };
  /** Goals that decide the classes (the derivation yields something), 0 when none does. */
  goalCount: number;
  /** The first broken rule of the tree, or null — it replaces the reading while it lasts. */
  problem: TargetProblem | null;
}

/**
 * Strategia › Target per classe (RU8, D-ST4) — ONE sentence: the source and the state of the
 * targets it gives. Replaces the three readings of Impostazioni › Allocazione (the total, the
 * formula, the list); a broken rule wins, with where «Salva i target» takes the reader.
 */
export function describeStrategiaTargets(input: StrategiaTargetsInput): Narrative {
  if (input.problem) {
    return [...describeTargetProblem(input.problem), prose(' «Salva i target» ti porta lì e non scrive nulla finché non è corretto.')];
  }
  if (input.source === 'goals') {
    if (input.goalCount === 0) {
      return [prose('Dai traguardi: nessun traguardo pesa ancora sulle classi, quindi valgono i target a mano.')];
    }
    return [
      prose('Dai traguardi: '),
      figure(String(input.goalCount)),
      prose(input.goalCount === 1 ? ' traguardo attivo decide le classi.' : ' traguardi attivi decidono le classi.'),
    ];
  }
  if (input.source === 'formula') {
    const { userAge, riskFreeRate, equityPct } = input.formula;
    if (userAge === undefined || riskFreeRate === undefined || equityPct === undefined) {
      return [prose("Formula per età: manca l'età, che si scrive in FIRE › Il mio piano; finché non c'è valgono i target a mano.")];
    }
    return [
      prose('Formula per età: con '),
      figure(String(userAge)),
      prose(' anni e '),
      figure(pctTrim(riskFreeRate)),
      prose(' le Azioni sono al '),
      figure(pctTrim(equityPct)),
      prose(', le Obbligazioni prendono il resto.'),
    ];
  }
  const segments: Narrative = [
    prose('A mano: '),
    figure(String(input.classesWithTarget)),
    prose(' classi su '),
    figure(String(input.classCount)),
    prose(', totale '),
    figure(pctTrim(input.total)),
  ];
  if (input.total > 100.005) {
    segments.push(prose(', leva '), figure(`${formatNumber(input.total / 100, 2)}×`));
  } else {
    segments.push(prose(', senza leva'));
  }
  if (input.cashFixedAmount !== null) {
    segments.push(prose('; la liquidità fissa ('), figure(euro(input.cashFixedAmount)), prose(') resta fuori dalle percentuali.'));
  } else {
    segments.push(prose('.'));
  }
  return segments;
}

export const OBJECTIVE_PRIORITY_LABELS: Record<ObjectivePriority, string> = {
  essential: 'essenziale',
  high: 'alta',
  medium: 'media',
  low: 'bassa',
};

export interface IdealAllocationFactorInput {
  /** Italian asset-class label (ASSET_CLASS_LABELS), already resolved by the caller. */
  classLabel: string;
  priority: ObjectivePriority;
}

export interface IdealAllocationInput {
  enabled: boolean;
  classPriority: ObjectivePriority;
  leveragePriority: ObjectivePriority | 'off';
  /** deriveTargetLeverageRatio(targets), the leva target the leverage objective aims at. */
  targetLeverageRatio: number;
  factorObjectives: IdealAllocationFactorInput[];
  geography: { referenceIndexLabel: string; priority: ObjectivePriority } | null;
}

/**
 * The ONE translation of a saved `IdealAllocationSettings` into the words the readings print: class
 * labels from `ASSET_CLASS_LABELS`, the geography reference by its curated NAME. Four surfaces read
 * the objectives (Impostazioni, the PAC's Ottimizzato step, Composizione ideale and its dialog) and
 * each used to build this by hand — the two Allocazione copies printed the raw index id
 * («geografia come wt-global-efficient-core», 2026-09-25).
 */
export function buildIdealAllocationInput(value: IdealAllocationSettings, targetLeverageRatio: number): IdealAllocationInput {
  return {
    enabled: value.enabled,
    classPriority: value.classPriority,
    leveragePriority: value.leveragePriority,
    targetLeverageRatio,
    factorObjectives: value.factorObjectives.map((f) => ({
      classLabel: ASSET_CLASS_LABELS[f.assetClass] ?? f.assetClass,
      priority: f.priority,
    })),
    geography: value.geography?.enabled
      ? {
          referenceIndexLabel: INDEX_PROFILES[value.geography.referenceIndexId]?.label ?? value.geography.referenceIndexId,
          priority: value.geography.priority,
        }
      : null,
  };
}

/** «classi (essenziale)», «leva 1,3× (alta)», … — one entry per objective that is on. */
export function listIdealObjectives({ classPriority, leveragePriority, targetLeverageRatio, factorObjectives, geography }: IdealAllocationInput): string[] {
  const objectiveTexts: string[] = [`classi (${OBJECTIVE_PRIORITY_LABELS[classPriority]})`];

  if (leveragePriority !== 'off') {
    objectiveTexts.push(
      `leva ${numTrim(targetLeverageRatio)}× (${OBJECTIVE_PRIORITY_LABELS[leveragePriority]})`
    );
  }

  if (factorObjectives.length > 0) {
    const factorText = factorObjectives
      .map((f) => `${f.classLabel} (${OBJECTIVE_PRIORITY_LABELS[f.priority]})`)
      .join(', ');
    objectiveTexts.push(`secondo livello di ${factorText}`);
  }

  if (geography) {
    objectiveTexts.push(
      `geografia come ${geography.referenceIndexLabel} (${OBJECTIVE_PRIORITY_LABELS[geography.priority]})`
    );
  }
  return objectiveTexts;
}

/**
 * Allocazione ideale — which objectives the weight optimizer (doc/weight-optimizer-ate.md) can
 * propose PAC weights from, and their priority. Spenta: the PAC's Target step stays manual.
 */
export function describeIdealAllocation(input: IdealAllocationInput): Narrative {
  if (!input.enabled) {
    return [prose('Spenta: nel portafoglio modello e nel PAC i pesi si inseriscono solo a mano.')];
  }
  const objectiveTexts = listIdealObjectives(input);
  const count = objectiveTexts.length;
  return [
    prose(
      `Il portafoglio modello e il PAC possono proporre i pesi da ${count} ${count === 1 ? 'criterio' : 'criteri'}: ${objectiveTexts.join(', ')}.`
    ),
  ];
}

/**
 * Composizione ideale (Allocazione, and its dialog) — the same objectives read as the tile's own
 * answer, «com'è fatto il mio portafoglio ideale, strumento per strumento?», not as what the PAC
 * can do: the tool stands on its own, with or without a plan (owner's wording, 2026-09-25).
 * Called only with the objectives on; the tile says «spenta» with its own sentence.
 */
export function describeIdealComposition(input: IdealAllocationInput): Narrative {
  const objectiveTexts = listIdealObjectives(input);
  const whose = objectiveTexts.length === 1 ? 'il tuo criterio' : `i tuoi ${objectiveTexts.length} criteri`;
  return [prose(`Il portafoglio che rispetta meglio ${whose}, strumento per strumento: ${objectiveTexts.join(', ')}.`)];
}

/**
 * §3.2 — a class with a target > 0 but sub-categories still OFF cannot carry a second-level
 * objective yet; this guided hint (under the tile's "Secondo livello" row) says what to turn on,
 * one sentence per class, so the reader is not left guessing why the checkbox never appears.
 */
export function describeSecondLevelSetupHint(classLabels: string[]): string | null {
  if (classLabels.length === 0) return null;
  return (
    `Per usare un secondo livello su ${classLabels.join(', ')}, attiva le sue sottocategorie nei ` +
    `target qui sopra e assegna a ogni strumento la sua (Patrimonio → Modifica; nei compositi, ogni ` +
    `componente ha la sua).`
  );
}

// ─── Spese ────────────────────────────────────────────────────────────────────

export interface SpendingRolesSettingInput {
  enabled: boolean;
  // From summarizeCategoryClassification — the roles live on the categories, so the reading can
  // only be honest about the Flusso by saying how many of them carry one.
  classification: CategoryClassificationCounts;
  /** The categories were NOT read: their roles are unknown, never «0 classified». */
  categoriesUnread?: boolean;
}

/**
 * Ruoli 50/30/20 (Spese) — whether Analisi's Flusso can be read by role, and how far the
 * classification has got. Names what is still unclassified, because those categories land in
 * «Da classificare» on the Flusso rather than in any of the three roles.
 */
export function describeSpendingRolesSetting({ enabled, classification, categoriesUnread = false }: SpendingRolesSettingInput): Narrative {
  if (!enabled) {
    return [prose('Spenti: il flusso di Analisi si legge solo per tipo di spesa. I ruoli già assegnati restano sulle categorie.')];
  }
  if (categoriesUnread) {
    return [prose('Attivi; i ruoli delle categorie non sono stati letti.')];
  }
  const { spending, classified } = classification;
  if (spending === 0) {
    return [prose('Attivi, ma non c’è ancora nessuna categoria di spesa da classificare.')];
  }
  if (classified === spending) {
    if (spending === 1) return [prose('Attivi: l’unica categoria di spesa ha un ruolo.')];
    return [prose('Attivi: tutte le '), figure(String(spending)), prose(' categorie di spesa hanno un ruolo.')];
  }
  const missing = spending - classified;
  return [
    prose('Attivi: '),
    figure(String(classified)),
    prose(classified === 1 ? ` categoria di spesa su ${spending} ha un ruolo; ` : ` categorie di spesa su ${spending} hanno un ruolo; `),
    figure(String(missing)),
    prose(missing === 1 ? ' finisce in «Da classificare».' : ' finiscono in «Da classificare».'),
  ];
}

export interface DefaultAccountsInput {
  debitName?: string;
  creditName?: string;
}

/** Conti di default — where expenses and income land without a choice. */
export function describeDefaultAccounts({ debitName, creditName }: DefaultAccountsInput): Narrative {
  if (debitName && creditName) {
    if (debitName === creditName) {
      return [prose(`Spese ed entrate passano entrambe da ${debitName}.`)];
    }
    return [prose(`Le spese scalano da ${debitName}, le entrate arrivano su ${creditName}.`)];
  }
  if (debitName) {
    return [prose(`Le spese scalano da ${debitName}; nessun conto di accredito predefinito.`)];
  }
  if (creditName) {
    return [prose(`Le entrate arrivano su ${creditName}; nessun conto di prelievo predefinito.`)];
  }
  return [prose('Nessun conto predefinito: il modulo delle spese parte senza conto.')];
}

export interface TransferFeeCategoryInput {
  /** The chosen category's name; absent when none is chosen (or it no longer exists). */
  categoryName?: string;
  subCategoryName?: string;
}

/**
 * Commissioni bancarie — where the fee typed on any row lands (a transfer's alone until 2026-10-10). Without a category the
 * form's field stays off, and the sentence says so: that is what stalls without the input.
 */
export function describeTransferFeeCategory({ categoryName, subCategoryName }: TransferFeeCategoryInput): Narrative {
  if (!categoryName) {
    return [prose('Senza una categoria, il campo «Commissione» del form spesa resta spento.')];
  }
  const target = subCategoryName ? `${categoryName} › ${subCategoryName}` : categoryName;
  return [prose(`La commissione scritta su una voce diventa una spesa in ${target}, addebitata sul suo conto alla sua data; su una serie, una per ogni voce.`)];
}

export interface ExpenseCategoryCounts {
  income: number;
  fixed: number;
  variable: number;
  debt: number;
  withSubcategories: number;
}

/** Counts the categories by type and how many carry subcategories — the reading's numbers. */
export function summarizeExpenseCategories(
  categories: { type: ExpenseType; subCategories: unknown[] }[]
): ExpenseCategoryCounts {
  const counts: ExpenseCategoryCounts = { income: 0, fixed: 0, variable: 0, debt: 0, withSubcategories: 0 };
  for (const category of categories) {
    // The union carries types the management list does not show (transfers): count only the four.
    if (
      category.type !== 'income' &&
      category.type !== 'fixed' &&
      category.type !== 'variable' &&
      category.type !== 'debt'
    ) {
      continue;
    }
    counts[category.type] += 1;
    if (category.subCategories.length > 0) counts.withSubcategories += 1;
  }
  return counts;
}

/** Categorie — the inventory line over the management list. */
export function describeExpenseCategories(counts: ExpenseCategoryCounts): Narrative {
  const total = counts.income + counts.fixed + counts.variable + counts.debt;
  if (total === 0) {
    return [prose('Nessuna categoria: creane una per dare un nome ai movimenti.')];
  }
  const parts: Narrative[] = [];
  if (counts.income > 0) parts.push([figure(String(counts.income)), prose(' di entrate')]);
  if (counts.fixed > 0) parts.push([figure(String(counts.fixed)), prose(counts.fixed === 1 ? ' fissa' : ' fisse')]);
  if (counts.variable > 0)
    parts.push([figure(String(counts.variable)), prose(counts.variable === 1 ? ' variabile' : ' variabili')]);
  if (counts.debt > 0) parts.push([figure(String(counts.debt)), prose(' di debito')]);

  const segments: Narrative = [figure(String(total)), prose(total === 1 ? ' categoria: ' : ' categorie: ')];
  parts.forEach((part, index) => {
    if (index > 0) segments.push(prose(index === parts.length - 1 ? ' e ' : ', '));
    segments.push(...part);
  });
  if (counts.withSubcategories > 0) {
    segments.push(prose('; '), figure(String(counts.withSubcategories)), prose(' con sottocategorie.'));
  } else {
    segments.push(prose('.'));
  }
  return segments;
}

export type ImportReadingInput =
  | { phase: 'idle' }
  | { phase: 'preview'; fileName: string; validCount: number; skippedCount: number; newCategoriesCount: number }
  | { phase: 'done'; created: number };

/** Import CSV — the promise, the preview's three counts, the undoable outcome. */
export function describeImport(input: ImportReadingInput): Narrative {
  if (input.phase === 'idle') {
    return [
      prose(
        'Carichi un CSV e vedi cosa verrà importato, saltato e creato prima di confermare; ogni import si annulla in un tocco.'
      ),
    ];
  }
  if (input.phase === 'preview') {
    const segments: Narrative = [prose(`Da ${input.fileName}: `)];
    segments.push(
      figure(String(input.validCount)),
      prose(input.validCount === 1 ? ' voce da importare, ' : ' voci da importare, ')
    );
    if (input.skippedCount === 0) {
      segments.push(prose('nessuna riga scartata, '));
    } else {
      segments.push(
        figure(String(input.skippedCount)),
        prose(input.skippedCount === 1 ? ' riga scartata, ' : ' righe scartate, ')
      );
    }
    if (input.newCategoriesCount === 0) {
      segments.push(prose('nessuna categoria da creare.'));
    } else {
      segments.push(
        figure(String(input.newCategoriesCount)),
        prose(input.newCategoriesCount === 1 ? ' categoria da creare.' : ' categorie da creare.')
      );
    }
    return segments;
  }
  if (input.created === 1) {
    return [
      prose('Importata '),
      figure('1'),
      prose(' transazione: la trovi in Cashflow e Analisi; «Annulla import» la rimuove.'),
    ];
  }
  return [
    prose('Importate '),
    figure(String(input.created)),
    prose(' transazioni: le trovi in Cashflow e Analisi; «Annulla import» le rimuove tutte insieme.'),
  ];
}

// ─── Dividendi ────────────────────────────────────────────────────────────────

export interface DividendCategoryInput {
  categoryName?: string;
  subCategoryName?: string;
  /** The default account a payment credits; an instrument's own account wins over it. */
  accountName?: string;
}

/** Entrate da dividendi — where a received dividend lands in the cashflow. */
export function describeDividendCategory({ categoryName, subCategoryName, accountName }: DividendCategoryInput): Narrative {
  if (!categoryName) {
    return [prose('Senza una categoria, gli incassi non diventano entrate nel cashflow.')];
  }
  const target = subCategoryName ? `${categoryName} › ${subCategoryName}` : categoryName;
  const landing = `Ogni incasso registrato diventa un'entrata in ${target}, senza doppioni`;
  // The account clause is dropped without an account (Narrative Honesty Rule): an instrument may
  // still carry its own, so «nessun conto si muove» would be a claim this tile cannot make.
  if (!accountName) return [prose(`${landing}.`)];
  return [prose(`${landing}; dal giorno del pagamento accredita ${accountName}, salvo un conto scelto sullo strumento.`)];
}

// ─── Condivisione e Aspetto ───────────────────────────────────────────────────

export interface SharingInput {
  memberNames: string[];
}

/** Condivisione account — who sees what, in words. */
export function describeSharing({ memberNames }: SharingInput): Narrative {
  if (memberNames.length === 0) {
    return [prose('Nessun accesso condiviso: il tuo account lo vedi solo tu.')];
  }
  if (memberNames.length === 1) {
    return [prose(`${memberNames[0]} vede e modifica tutto — spese, asset, dividendi — con le sue credenziali.`)];
  }
  return [
    prose(`${joinNames(memberNames)} vedono e modificano tutto — spese, asset, dividendi — con le loro credenziali.`),
  ];
}

export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Aspetto — mode (this device) and palette (the account) in ONE sentence (RU9 follow-up): the mode says
 * what it follows, the palette that it is synced; before hydration the mode is not known and the
 * sentence names the palette alone.
 */
export function describeAppearance(mode: ThemeMode | undefined, themeName: string): Narrative {
  const palette = `${themeName} su tutti i dispositivi`;
  if (mode === undefined) return [prose(`${palette}.`)];
  if (mode === 'system') return [prose(`Il tema segue il dispositivo; ${palette}.`)];
  return [prose(`Sempre ${mode === 'dark' ? 'scuro' : 'chiaro'} su questo dispositivo; ${palette}.`)];
}

/** The Fascia tile's reading (doc/fascia/README.md): the band's colour in words, or that there is none. */
export function describeTopBand(label: string | null): Narrative {
  if (label === null) return [prose('Nessuna fascia: la barra in alto è neutra.')];
  return [prose(`La fascia in alto è ${label.toLowerCase()}.`)];
}

// ─── Simulazioni ──────────────────────────────────────────────────────────────

export interface MonteCarloMarketInput {
  /** Where the loaded numbers came from. */
  origin: MonteCarloMarketOrigin;
  /** Classes with at least one written field, in the draft. */
  editedClassCount: number;
  /** The draft differs from what was loaded (a migrated market stops being «da rileggere» once edited). */
  dirty: boolean;
  /** The commodity sub-category read as Oro; null = none. */
  goldSubCategory: string | null;
  /** Only with `origin: 'migrated'`: what the conversion did (RQ8). */
  migration?: { keptCount: number; bearBullDropped: boolean };
  /** The inflation the migrated values were written with, percent (the v1 Base). */
  legacyInflation?: number;
  /** Only with `origin: 'migrated'`: the expected inflation was typed by the reader (it counts in `migration.keptCount`, the sentence names it apart). */
  inflationKept?: boolean;
}

/**
 * «Ipotesi di mercato» — what the Monte Carlo and the Ventaglio will read, in one line: the
 * numbers' origin, then what «Oro» means. No verdict (it is Impostazioni): the effect downstream.
 */
export function describeMonteCarloMarket({ origin, editedClassCount, dirty, goldSubCategory, migration, legacyInflation, inflationKept }: MonteCarloMarketInput): Narrative {
  const out: Narrative = [];
  if (origin === 'migrated' && !dirty) {
    const inflation = legacyInflation?.toLocaleString('it-IT', { maximumFractionDigits: 2 });
    const kept = Math.max(0, (migration?.keptCount ?? 0) - (inflationKept ? 1 : 0));
    out.push({ text: 'Le ipotesi salvate nel vecchio formato sono state convertite in termini reali' });
    if (kept > 0) {
      out.push(
        { text: ': ' },
        { text: kept === 1 ? '1 valore è tuo' : `${kept} valori sono tuoi`, mono: true },
        ...(inflation ? [{ text: ', ricalcolati togliendo l’inflazione del ' }, { text: `${inflation}%`, mono: true }] : [{ text: ', ricalcolati' }]),
        { text: '; gli altri seguono le stime.' },
      );
    } else if (!inflationKept) {
      out.push({ text: ': nessun valore era tuo, ora valgono le stime.' });
    } else {
      out.push({ text: '; gli altri valori seguono le stime.' });
    }
    if (inflationKept && inflation) out.push({ text: ' L’inflazione attesa resta al ' }, { text: `${inflation}%`, mono: true }, { text: ' che avevi scritto.' });
    if (migration?.bearBullDropped) out.push({ text: ' Bear e Bull scritti a mano non servono più: ora si calcolano sul portafoglio.' });
    out.push({ text: ' Premi Salva per fissarle.' });
  } else if (editedClassCount > 0) {
    out.push({ text: 'Sette classi in euro, in termini reali, ' }, { text: `modificate in ${editedClassCount}`, mono: true }, { text: ' rispetto ai predefiniti.' });
  } else {
    out.push(
      { text: 'Sette classi in euro, in termini reali, valori storici fino al ' },
      { text: String(MONTE_CARLO_DEFAULTS_LAST_YEAR), mono: true },
      { text: '; Obbligazioni e Liquidità dai tassi BCE, Trend e Carry come premio sopra la liquidità.' },
    );
  }
  if (goldSubCategory) {
    out.push({ text: ' Oro = sottocategoria ' }, { text: `«${goldSubCategory}»`, mono: true }, { text: '.' });
  } else {
    out.push({ text: " Nessuna sottocategoria dell'oro: tutte le materie prime restano Materie prime." });
  }
  return out;
}

/**
 * «Copertura del cambio» — what the switches mean, in one sentence (Q4, RQ7): nothing hedged is the default of someone
 * who holds dollar instruments unhedged; the Base never changes with the hedge.
 */
export function describeHedgeReading(hedged: MonteCarloHedgeSwitches): string {
  const list = hedgedClassList(hedged);
  const first = list.length === 0
    ? 'Nessuna classe coperta: volatilità e correlazioni di chi tiene strumenti in dollari senza copertura.'
    : `Coperte: ${list.map((cls) => MONTE_CARLO_CLASS_LABELS[cls]).join(', ')}.`;
  return `${first} Il Base non cambia: la copertura costa la differenza fra i tassi a breve in dollari e in euro, nulla in media nel modello.`;
}

/**
 * AL20: the proposal under a hedge switch that is off while most of its class is held in instruments flagged
 * «Coperto dal cambio in EUR». A sentence, never a switch: «Imposta coperto» is the reader's click.
 */
export function describeHedgeProposal(cls: MonteCarloHedgeableClass, share: number): string {
  const subject: Record<MonteCarloHedgeableClass, string> = { equity: 'le azioni sono coperte', gold: "l'oro è coperto", trendFollowing: 'il Trend è coperto', carry: 'il Carry è coperto' };
  return `Nel tuo portafoglio ${subject[cls]} per il ${Math.round(share * 100)}%.`;
}

export interface MonteCarloCorrelationsInput {
  /** Pairs (of 21) whose value differs from the defaults in force (the hedge included), in the draft. */
  editedPairCount: number;
  /** Q4: the hedged classes, by label; empty or absent = none. */
  hedgedLabels?: string[];
  /** Pairs the last Save adapted to keep the matrix valid (R5), still shown. */
  correctedPairCount: number;
}

/**
 * «Correlazioni» — where the 21 pairs come from, in one line: the defaults' source, or how many
 * pairs were edited; after a correction, how many the Save adapted. No verdict (it is Impostazioni).
 */
export function describeMonteCarloCorrelations({ editedPairCount, hedgedLabels = [], correctedPairCount }: MonteCarloCorrelationsInput): Narrative {
  const out: Narrative = [];
  if (editedPairCount === 0) {
    out.push({ text: 'Valori predefiniti: log-rendimenti annui reali in euro, ogni coppia sul suo periodo comune; 0 dove la correlazione non è distinguibile da zero.' });
    if (hedgedLabels.length > 0) out.push({ text: ` Seguono la copertura scelta (${hedgedLabels.join(', ')}).` });
  } else {
    out.push({ text: 'Modificate ' }, { text: `${editedPairCount} coppie su 21`, mono: true }, { text: ' rispetto ai valori predefiniti.' });
    if (hedgedLabels.length > 0) out.push({ text: ' Personalizzate: la copertura non le cambia.' });
  }
  if (correctedPairCount > 0) {
    out.push({ text: ' Il salvataggio ne ha adattate ' }, { text: String(correctedPairCount), mono: true }, { text: ' per rendere la matrice coerente.' });
  } else {
    out.push({ text: ' Una matrice unica per i tre scenari; nelle crisi le correlazioni tendono a salire e qui non salgono.' });
  }
  return out;
}
