/**
 * Coast FIRE — the pure layer between `fireService` and the tab's components.
 *
 * Everything here is presentation logic that used to live inside `CoastFireTab.tsx`: draft
 * parsing for the configuration form, and the derivations the redesigned sections read
 * (verdict, basis line, inflow timeline, coverage phases, interpretation).
 *
 * WHY IT IS A MODULE AND NOT A HOOK
 * The redesign splits one 1.6k-line component into five. Every figure they render must be the
 * SAME figure the single component rendered — that is the acceptance criterion of the spec —
 * and the only way to make that testable is to compute it in one place, outside React.
 *
 * NO MATH LIVES HERE. Every number is read off `fireService`'s own result objects; this module
 * only chooses which ones to show, in which order, with which words.
 */

import type { CoastFirePensionInput, CoastFireTaxBracket } from '@/types/assets';
import type {
  CoastFIREPensionBreakdown,
  CoastFIREProjectionResult,
} from '@/lib/services/fireService';
import {
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
} from '@/lib/services/fireService';
// From chartService, NOT from lib/utils/formatters: the two modules declare same-named
// formatters that disagree on percentages — `formatters.formatPercentage` is `toFixed` (a dot
// decimal separator), `chartService`'s is `Intl('it-IT')` (a comma). The components on this tab
// read chartService's, so a string built here has to come from the same one or the page would
// print "40.71%" beside "40,71%". The tests mock the Firebase chain chartService drags in.
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';

/** `fireService` keeps the per-scenario shape internal; this is the only public handle on it. */
export type CoastScenarioMetrics = CoastFIREProjectionResult['scenarios']['base'];

export interface CoastFirePensionDraft {
  id: string;
  label: string;
  grossMonthlyAmount: string;
  monthsPerYear: string;
  startDate: string;
}

export interface CoastFireTaxBracketDraft {
  id: string;
  upTo: string;
  rate: string;
}

export interface PensionDraftIssue {
  pensionId: string;
  severity: 'info' | 'warning' | 'error';
  kind: 'informational' | 'incomplete';
  message: string;
}

export type PensionConfigurationState = 'empty' | 'incomplete' | 'informational' | 'valid';

// ─────────────────────────────────────────────────────────────────────────────
// Draft plumbing — the configuration form edits strings, the model wants numbers
// ─────────────────────────────────────────────────────────────────────────────

export function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidAge(value: number | null): value is number {
  return value !== null && value >= 18 && value <= 100;
}

export function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addYearsToDate(date: Date, years: number): Date {
  const nextDate = new Date(date);
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
}

export function parseDraftDate(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isPensionDraftStarted(draft: CoastFirePensionDraft): boolean {
  return (
    draft.label.trim().length > 0 ||
    draft.grossMonthlyAmount.trim().length > 0 ||
    draft.monthsPerYear.trim().length > 0 ||
    draft.startDate.trim().length > 0
  );
}

/**
 * Receives `now` as an explicit parameter so callers control the reference date.
 * This makes the function pure and easier to test in isolation.
 */
export function buildPensionDraftIssues(
  drafts: CoastFirePensionDraft[],
  currentAge: number | null,
  retirementAge: number | null,
  now: Date
): PensionDraftIssue[] {
  const issues: PensionDraftIssue[] = [];

  drafts.forEach((draft, index) => {
    if (!isPensionDraftStarted(draft)) return;

    const grossMonthlyAmount = Number.parseFloat(draft.grossMonthlyAmount.trim());
    const monthsPerYear = Number.parseInt(draft.monthsPerYear.trim(), 10);
    const startDate = parseDraftDate(draft.startDate);
    const label = draft.label.trim() || `Pensione ${index + 1}`;

    if (!Number.isFinite(grossMonthlyAmount) || grossMonthlyAmount <= 0) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: inserisci un lordo mensile maggiore di zero per includerla nel calcolo.`,
      });
    }

    if (!Number.isFinite(monthsPerYear) || monthsPerYear <= 0) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: le mensilità annue devono essere maggiori di zero.`,
      });
    }

    if (!startDate) {
      issues.push({
        pensionId: draft.id,
        severity: 'warning',
        kind: 'incomplete',
        message: `${label}: aggiungi una data di decorrenza per stimarne l'impatto nel tempo.`,
      });
      return;
    }

    if (startDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      issues.push({
        pensionId: draft.id,
        severity: 'info',
        kind: 'informational',
        message: `${label}: la data di decorrenza è nel passato, verifica che rispecchi la tua stima effettiva.`,
      });
    }

    if (currentAge !== null && retirementAge !== null) {
      const retirementDate = addYearsToDate(now, Math.max(retirementAge - currentAge, 0));
      if (startDate > retirementDate) {
        const bridgeYears = Math.max(
          Math.ceil((startDate.getTime() - retirementDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)),
          1
        );
        issues.push({
          pensionId: draft.id,
          severity: 'info',
          kind: 'informational',
          message: `${label}: decorre ${bridgeYears} ${bridgeYears === 1 ? 'anno' : 'anni'} dopo il target, nel periodo ponte il portafoglio copre ancora il fabbisogno per intero.`,
        });
      }
    }
  });

  return issues;
}

export function getPensionConfigurationState(
  pensions: CoastFirePensionInput[],
  issues: PensionDraftIssue[]
): PensionConfigurationState {
  if (pensions.length === 0) return 'empty';
  if (issues.length === 0) return 'valid';

  const hasIncompleteIssues = issues.some((issue) => issue.kind === 'incomplete');
  if (!hasIncompleteIssues) return 'informational';

  return 'incomplete';
}

export function createPensionDraft(defaultStartDate: string): CoastFirePensionDraft {
  return {
    id: createLocalId('coast-pension'),
    label: '',
    grossMonthlyAmount: '',
    monthsPerYear: '13',
    startDate: defaultStartDate,
  };
}

export function createTaxBracketDraft(bracket: CoastFireTaxBracket): CoastFireTaxBracketDraft {
  return {
    id: bracket.id,
    upTo: bracket.upTo !== null ? String(bracket.upTo) : '',
    rate: String(bracket.rate),
  };
}

export function toPensionDrafts(
  pensions: CoastFirePensionInput[] | undefined,
  currentAge: number | undefined,
  today: Date = new Date()
): CoastFirePensionDraft[] {
  const normalized = normalizeCoastFirePensions(pensions);

  return normalized.map((pension) => ({
    id: pension.id,
    label: pension.label,
    grossMonthlyAmount: pension.grossMonthlyAmount.toString(),
    monthsPerYear: pension.monthsPerYear.toString(),
    startDate:
      pension.startDate ??
      (currentAge !== undefined && pension.startAge !== undefined
        ? addYearsToDate(today, Math.max(pension.startAge - currentAge, 0)).toISOString().slice(0, 10)
        : ''),
  }));
}

export function toTaxBracketDrafts(
  brackets: CoastFireTaxBracket[] | undefined
): CoastFireTaxBracketDraft[] {
  return normalizeCoastFireTaxBrackets(brackets).map(createTaxBracketDraft);
}

export function parsePensionDrafts(drafts: CoastFirePensionDraft[]): CoastFirePensionInput[] {
  return normalizeCoastFirePensions(
    drafts.map((draft, index) => {
      const grossMonthlyAmount = Number.parseFloat(draft.grossMonthlyAmount.trim());
      const monthsPerYear = Number.parseInt(draft.monthsPerYear.trim(), 10);

      return {
        id: draft.id,
        label: draft.label.trim() || `Pensione ${index + 1}`,
        grossMonthlyAmount: Number.isFinite(grossMonthlyAmount) ? grossMonthlyAmount : 0,
        monthsPerYear: Number.isFinite(monthsPerYear) ? monthsPerYear : 0,
        startDate: draft.startDate.trim() || undefined,
      };
    })
  );
}

export function parseTaxBracketDrafts(drafts: CoastFireTaxBracketDraft[]): CoastFireTaxBracket[] {
  return normalizeCoastFireTaxBrackets(
    drafts.map((draft) => {
      const upTo = draft.upTo.trim();
      const rate = Number.parseFloat(draft.rate.trim());

      return {
        id: draft.id,
        upTo: upTo ? Number.parseFloat(upTo) : null,
        rate: Number.isFinite(rate) ? rate : NaN,
      };
    })
  );
}

/**
 * Dirty-state keys: only the persisted fields, so a re-render of equivalent drafts never reads
 * as an unsaved change (AGENTS → *Settings — the FIVE places*).
 */
export function buildPensionSnapshotKey(pensions: CoastFirePensionInput[]): string {
  return JSON.stringify(
    pensions.map((pension) => ({
      id: pension.id,
      label: pension.label,
      grossMonthlyAmount: pension.grossMonthlyAmount,
      monthsPerYear: pension.monthsPerYear,
      startDate: pension.startDate ?? null,
      startAge: pension.startAge ?? null,
    }))
  );
}

export function buildTaxBracketSnapshotKey(brackets: CoastFireTaxBracket[]): string {
  return JSON.stringify(
    brackets.map((bracket) => ({
      id: bracket.id,
      upTo: bracket.upTo,
      rate: bracket.rate,
    }))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared label helpers
// ─────────────────────────────────────────────────────────────────────────────

export function formatCurrencyPerYear(value: number): string {
  return `${formatCurrency(value)} l'anno`;
}

export function formatAgeYears(age: number): string {
  return `${Math.round(age)} anni`;
}

export function formatYearCount(years: number): string {
  return `${years} ${years === 1 ? 'anno' : 'anni'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero verdict — the page's single answer
// ─────────────────────────────────────────────────────────────────────────────

export type CoastVerdictTone = 'positive' | 'neutral' | 'muted';

export interface CoastVerdict {
  /** The dominant token: an amount when the projection exists, "—" when it does not. */
  heroValue: string;
  /** What that amount is, in three or four words. */
  heroQualifier: string | null;
  headline: string;
  detail: string;
  tone: CoastVerdictTone;
}

/**
 * Answers the page's question — "posso smettere di versare?" — before any other number.
 *
 * Both live branches keep a real amount as the dominant value: the shortfall while the target is
 * ahead, the surplus once it is behind. A word ("Sì", "Raggiunto") would read as an answer while
 * carrying no magnitude, and the magnitude is the part the user acts on.
 */
export function buildCoastVerdict(
  baseScenario: CoastScenarioMetrics | null,
  currentNetWorth: number,
  incompleteReason: string | null
): CoastVerdict {
  if (!baseScenario) {
    return {
      heroValue: '—',
      heroQualifier: null,
      headline: 'Coast FIRE non calcolabile.',
      detail: incompleteReason ?? 'Completa la configurazione per ottenere una risposta.',
      tone: 'muted',
    };
  }

  if (baseScenario.isCoastReached) {
    const surplus = Math.max(currentNetWorth - baseScenario.coastFireNumberToday, 0);
    return {
      heroValue: formatCurrency(surplus),
      heroQualifier: 'oltre il Coast FIRE Number',
      headline: 'Sì, puoi smettere di versare.',
      detail: `Il patrimonio FIRE di ${formatCurrency(currentNetWorth)} supera già il Coast FIRE Number di ${formatCurrency(baseScenario.coastFireNumberToday)}: da qui basta la capitalizzazione composta.`,
      tone: 'positive',
    };
  }

  return {
    heroValue: formatCurrency(baseScenario.gapToCoastFI),
    heroQualifier: 'mancano al Coast FIRE Number',
    headline: 'Non ancora: continua a versare.',
    detail: `Il patrimonio FIRE di ${formatCurrency(currentNetWorth)} copre il ${formatPercentage(baseScenario.progressToCoastFI)} del Coast FIRE Number di ${formatCurrency(baseScenario.coastFireNumberToday)}.`,
    tone: 'neutral',
  };
}

/**
 * Hero overflow guard (AGENTS → *Panoramica*): the card width is fixed, the string is not, so
 * the step-down keys off the formatted length rather than a container query.
 */
export function resolveCoastHeroValueClass(heroValue: string): string {
  return heroValue.length > 13
    ? 'text-[32px] desktop:text-[40px]'
    : 'text-[44px] desktop:text-[54px]';
}

// ─────────────────────────────────────────────────────────────────────────────
// Basis line — the assumptions, declared instead of implicit
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastBasisInput {
  currentAge: number | null;
  retirementAge: number | null;
  annualExpenses: number | undefined;
  usesCustomExpenses: boolean;
  withdrawalRate: number;
  baseRealReturn: number | null;
  respectPensionLockIn: boolean;
  /** Calendar year the locked pension capital re-enters, or null when nothing is locked. */
  pensionUnlockCalendarYear: number | null;
}

export function buildCoastBasisParts(input: CoastBasisInput): string[] {
  const parts: string[] = [];

  parts.push(
    input.currentAge !== null && input.retirementAge !== null
      ? `${input.currentAge} anni → target ${input.retirementAge}`
      : 'età da impostare'
  );

  parts.push(
    input.annualExpenses !== undefined && input.annualExpenses > 0
      ? `spese ${formatCurrency(input.annualExpenses)} ${input.usesCustomExpenses ? '(personalizzate)' : "(ultimo anno completo)"}`
      : 'spese non disponibili'
  );

  parts.push(`SWR ${formatPercentage(input.withdrawalRate)}`);

  if (input.baseRealReturn !== null) {
    parts.push(`rendimento reale base ${formatPercentage(input.baseRealReturn)}`);
  }

  parts.push(
    input.respectPensionLockIn
      ? input.pensionUnlockCalendarYear !== null
        ? `fondo pensione bloccato fino al ${input.pensionUnlockCalendarYear}`
        : 'vincolo fondo pensione attivo, nessun fondo bloccato'
      : 'fondo pensione non vincolato'
  );

  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inflow timeline — why the Coast number is lower than a full FIRE number
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastInflowEvent {
  id: string;
  kind: 'statePension' | 'pensionFund';
  /** Calendar year the money starts arriving; drives the ordering. */
  year: number;
  title: string;
  /** Already formatted — the components only place it. */
  amount: string;
  amountCaption: string;
  /** Extra context (decorrenza, età), or null when there is nothing more to say. */
  note: string | null;
}

/**
 * Every event the backward walk ALREADY discounts, in one ordered list: each state pension from
 * its decorrenza, plus the pension fund re-entering at its unlock.
 *
 * Nothing is computed here — the state pensions come from the scenario's own `pensionBreakdown`
 * and the fund from `resolvePensionLockState`'s inflows. The list exists because the drop in the
 * required capital is otherwise unexplained on screen.
 */
export function buildCoastInflowEvents(
  pensionBreakdown: CoastFIREPensionBreakdown[],
  pensionFundInflows: { yearsFromNow: number; amountToday: number }[],
  currentYear: number
): CoastInflowEvent[] {
  const statePensionEvents: CoastInflowEvent[] = pensionBreakdown.map((pension) => ({
    id: pension.id,
    kind: 'statePension',
    year: pension.startDate
      ? toDate(pension.startDate).getFullYear()
      : currentYear + Math.ceil(pension.yearsUntilStart),
    title: pension.label,
    amount: formatCurrency(pension.netAnnualRealAtStart),
    amountCaption: "netti reali l'anno",
    note: pension.startDate
      ? `Decorrenza ${formatDate(toDate(pension.startDate))} · ${formatAgeYears(pension.startAge)}`
      : `Parte a ${formatAgeYears(pension.startAge)}`,
  }));

  const fundEvents: CoastInflowEvent[] = pensionFundInflows.map((inflow, index) => ({
    id: `pension-fund-${index}`,
    kind: 'pensionFund',
    year: currentYear + Math.max(0, Math.round(inflow.yearsFromNow)),
    title: 'Sblocco fondo pensione',
    amount: formatCurrency(inflow.amountToday),
    amountCaption: 'al valore di oggi',
    note: 'Rientra nel capitale spendibile e da lì compone insieme al resto',
  }));

  return [...statePensionEvents, ...fundEvents].sort((left, right) => left.year - right.year);
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage phases and interpretation — the "Dettaglio" prose, unchanged in substance
// ─────────────────────────────────────────────────────────────────────────────

export interface CoastCoverageStep {
  id: string;
  label: string;
  detail: string;
  badge: string;
}

export function buildCoastCoverageSteps(
  baseScenario: CoastScenarioMetrics | null,
  sortedPensionBreakdown: CoastFIREPensionBreakdown[],
  resolvedRetirementAge: number,
  bridgeYears: number
): CoastCoverageStep[] {
  if (!baseScenario) return [];

  return [
    {
      id: 'target',
      label: `A ${resolvedRetirementAge} anni`,
      detail: `Il portafoglio deve sostenere ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)}.`,
      badge: `${formatCurrency(baseScenario.retirementCapitalRequired)} richiesti`,
    },
    ...sortedPensionBreakdown.map((pension, index) => ({
      id: pension.id,
      label: `${pension.label} ${pension.startDate ? `· ${formatDate(toDate(pension.startDate))}` : ''}`.trim(),
      detail:
        pension.isActiveAtRetirement && index === 0
          ? `È già attiva all'età target e copre ${formatCurrency(pension.netAnnualRealAtStart)} netti reali l'anno.`
          : `Da qui aggiunge ${formatCurrency(pension.netAnnualRealAtStart)} netti reali l'anno alla copertura.`,
      badge: pension.isActiveAtRetirement ? 'Già attiva' : `Parte a ${formatAgeYears(pension.startAge)}`,
    })),
    // Show the "a regime" step only when there's a bridge: without it, steady-state
    // and retirement values are essentially the same row, creating redundant reading.
    ...(bridgeYears > 0
      ? [
          {
            id: 'steady-state',
            label: 'A regime',
            detail: `Dopo l'ultima decorrenza il portafoglio deve coprire ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtSteadyState)}.`,
            badge: `${formatCurrency(baseScenario.steadyStatePortfolioNeed)} a regime`,
          },
        ]
      : []),
  ];
}

export function buildBaseScenarioInterpretation(
  baseScenario: CoastScenarioMetrics | null,
  effectiveAnnualExpenses: number | undefined,
  bridgeYears: number,
  resolvedRetirementAge: number
): string[] {
  if (!baseScenario) return [];

  if (baseScenario.pensionBreakdown.length === 0) {
    return [
      'Nessuna pensione configurata: il portafoglio deve sostenere per intero il fabbisogno annuo anche dopo il target Coast FIRE.',
    ];
  }

  const pensionStartsAtTargetCount = baseScenario.pensionBreakdown.filter(
    (pension) => pension.isActiveAtRetirement
  ).length;

  if (baseScenario.pensionBreakdown.length > 1) {
    return [
      `Hai configurato ${baseScenario.pensionBreakdown.length} pensioni con decorrenze diverse. Il calcolo non le somma tutte subito: in ogni fase considera solo quelle già attive.`,
      pensionStartsAtTargetCount > 0
        ? `All'età target risultano attive ${pensionStartsAtTargetCount} pension${pensionStartsAtTargetCount === 1 ? 'e' : 'i'}, mentre le altre entrano più avanti e riducono il fabbisogno del portafoglio in step successivi.`
        : `All'età target non è ancora attiva nessuna pensione, quindi il portafoglio deve coprire l'intero fabbisogno iniziale. Le pensioni ridurranno il fabbisogno solo nelle fasi successive.`,
      bridgeYears > 0
        ? `Per questo vedi un ponte di ${formatYearCount(bridgeYears)} prima del regime stabile finale, cioè prima che l'ultima pensione sia partita.`
        : "Non c'è un ponte significativo prima del regime finale: le pensioni risultano già attive in prossimità dell'età target.",
    ];
  }

  if (baseScenario.totalNetAnnualPensionAtRetirement <= 0 && bridgeYears > 0) {
    return [
      `Nel tuo caso la pensione statale parte dopo il target Coast FIRE, quindi a ${resolvedRetirementAge} anni il portafoglio deve ancora coprire da solo ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)}.`,
      `La pensione entra davvero in gioco solo dal ${baseScenario.latestPensionStartDate ? formatDate(toDate(baseScenario.latestPensionStartDate)) : 'momento di decorrenza'}, per questo vedi un ponte di ${formatYearCount(bridgeYears)} prima del regime stabile.`,
    ];
  }

  if (baseScenario.totalNetAnnualPensionAtRetirement > 0 && bridgeYears > 0) {
    return [
      `Al target Coast FIRE una parte delle tue spese è già coperta dalla pensione statale: il portafoglio deve sostenere ${formatCurrencyPerYear(baseScenario.annualPortfolioNeedAtRetirement)} invece di ${formatCurrencyPerYear(effectiveAnnualExpenses ?? 0)}.`,
      `Hai comunque un ponte di ${formatYearCount(bridgeYears)} prima che tutte le pensioni siano attive, quindi il capitale richiesto a pensione resta più alto del capitale steady-state.`,
    ];
  }

  return [
    `Alla decorrenza pensionistica il tuo fabbisogno annuo scende da ${formatCurrency(effectiveAnnualExpenses ?? 0)} a ${formatCurrency(baseScenario.annualPortfolioNeedAtSteadyState)} grazie alla pensione netta reale stimata di ${formatCurrency(baseScenario.totalNetAnnualPensionAtSteadyState)}.`,
    "In questo caso il capitale richiesto a pensione e il capitale a regime sono molto vicini perché non c'è un lungo periodo ponte da finanziare prima della pensione statale.",
  ];
}

/**
 * Names the ONE missing input, in the order the calculation needs them — an empty state that
 * says "manca qualcosa" is a dead end, one that names the field is an instruction.
 */
export function resolveCoastIncompleteReason(
  currentNetWorth: number,
  effectiveAnnualExpenses: number | undefined,
  currentAge: number | null,
  retirementAge: number | null
): string | null {
  if (currentNetWorth <= 0) {
    return 'Serve un patrimonio FIRE positivo per calcolare il Coast FIRE.';
  }
  if (effectiveAnnualExpenses === undefined || effectiveAnnualExpenses <= 0) {
    return 'Servono le spese annue per stimare il target Coast FIRE.';
  }
  if (currentAge === null) {
    return 'Inserisci la tua età attuale: serve a calcolare quanti anni ha il capitale per crescere fino al target.';
  }
  if (retirementAge === null) {
    return "Inserisci l'età target Coast FIRE: è il momento in cui il capitale deve essere sufficiente.";
  }
  return null;
}
