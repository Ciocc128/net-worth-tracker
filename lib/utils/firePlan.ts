/**
 * «Il mio piano» — the FIRE page's one draft, as pure functions (doc/fire-ipotesi/README.md § 15, RP1–RP4).
 *
 * The form edits strings; the tabs want numbers. This module turns the saved settings into the form,
 * the form into an OVERLAY (the valid edits, laid over the saved settings so every tab previews the
 * same plan, RP3) and into the PAYLOAD of the one save (RP4). No Firebase, no React.
 */
import type { CoastFirePensionInput, DatedFlow } from '@/types/assets';
import type { Settings } from '@/types/settings';
import {
  buildPensionDraftIssues,
  buildPensionSnapshotKey,
  isValidAge,
  parseOptionalInteger,
  parsePensionDrafts,
  toPensionDrafts,
  type CoastFirePensionDraft,
  type PensionDraftIssue,
} from '@/lib/utils/coastFireView';
import { normalizeCoastFirePensions } from '@/lib/services/fireService';
import { DEFAULT_INPS_RETIREMENT_AGE } from '@/lib/utils/pensionUnlock';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { validateDatedFlows } from '@/lib/utils/datedFlowValidation';

/** The age the page assumes for stopping when none is saved (Coast FIRE's default). */
export const DEFAULT_FIRE_TARGET_AGE = 60;

/** The fields the page can put in focus from a link (`?piano=<field>`, RP10), and the id of the control each names. */
export const FIRE_PLAN_FIELD_IDS = {
  eta: 'coastCurrentAge',
  'eta-obiettivo': 'targetAge',
  spesa: 'plannedExpenses',
  swr: 'withdrawalRate',
  fondo: 'emergencyFund',
  flussi: 'plan-add-flow',
  pensioni: 'plan-add-pension',
  vincolo: 'respectPensionLockInFire',
} as const;

export type FirePlanField = keyof typeof FIRE_PLAN_FIELD_IDS;

export function isFirePlanField(value: string | null | undefined): value is FirePlanField {
  return value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(FIRE_PLAN_FIELD_IDS, value);
}

/** The five tab names the page reads from `?tab=` (RP10), in the bar's order. */
export const FIRE_TAB_VALUES = ['fire', 'coast', 'whatif', 'montecarlo', 'proiezione', 'goals'] as const;
export type FireTabValue = (typeof FIRE_TAB_VALUES)[number];

export function isFireTab(value: string | null | undefined): value is FireTabValue {
  return value !== null && value !== undefined && (FIRE_TAB_VALUES as readonly string[]).includes(value);
}

/** RP1: «Agisce su», the fixed line under a field — tab names as in the bar. */
export const FIRE_PLAN_AFFECTS = {
  age: 'Agisce su: tutte le schede',
  targetAge: 'Agisce su: Calcolatore, Coast FIRE, What If',
  expenses: 'Agisce su: tutte le schede',
  swr: 'Agisce su: tutte le schede',
  fund: 'Agisce su: tutte le schede',
  flows: 'Agisce su: tutte le schede (negli Obiettivi solo l\'Effetto sul FIRE)',
  pensions: 'Agisce su: Calcolatore, Coast FIRE, What If, Dopo il FIRE (negli Obiettivi solo l\'Effetto sul FIRE)',
  lock: 'Agisce su: tutte le schede',
  rita: 'Agisce su: tutte le schede, con il vincolo attivo',
} as const;

export interface FirePlanForm {
  userAge: string;
  targetAge: string;
  /** The plan's yearly expenses, typed; empty = read from the Cashflow (D5). */
  plannedExpenses: string;
  withdrawalRate: string;
  /** § 14: the emergency fund in euro, typed; empty = none set. */
  emergencyFund: string;
  /** RE5: a legacy share is saved and no fund yet; the field shows the fund derived from it until the user types. */
  fundDerived: boolean;
  datedFlows: DatedFlow[];
  pensions: CoastFirePensionDraft[];
  respectPensionLock: boolean;
  inpsRetirementAge: string;
  ritaLongUnemployment: boolean;
}

/** The saved settings as the form's strings: ONE function, so the seed, «Annulla» and the dirty check cannot drift. */
export function planFormFromSettings(settings: Settings | null | undefined): FirePlanForm {
  return {
    userAge: settings?.userAge !== undefined ? String(settings.userAge) : '',
    targetAge: String(settings?.coastFireRetirementAge ?? DEFAULT_FIRE_TARGET_AGE),
    // The Coast FIRE «spesa personalizzata» of before D5 shows here until the next save moves it.
    plannedExpenses: (settings?.plannedAnnualExpenses ?? settings?.coastFireCustomExpenses)?.toString() ?? '',
    withdrawalRate: (settings?.withdrawalRate ?? 4.0).toString(),
    emergencyFund: settings?.fireEmergencyFund !== undefined ? String(settings.fireEmergencyFund) : '',
    fundDerived: settings?.fireEmergencyFund === undefined && settings?.fireCashToInvestPct !== undefined,
    datedFlows: settings?.fireDatedFlows ?? [],
    pensions: toPensionDrafts(settings?.coastFirePensions, settings?.userAge),
    respectPensionLock: settings?.respectPensionLockInFire ?? false,
    inpsRetirementAge: (settings?.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE).toString(),
    ritaLongUnemployment: settings?.pensionRitaLongUnemployment ?? false,
  };
}

/** The saved values the form edits, as a key: a new document with the same ones must not drop a draft. */
export function planSeedKey(settings: Settings | null | undefined): string {
  return JSON.stringify([
    settings?.userAge ?? null,
    settings?.coastFireRetirementAge ?? null,
    settings?.plannedAnnualExpenses ?? null,
    settings?.coastFireCustomExpenses ?? null,
    settings?.withdrawalRate ?? null,
    settings?.fireEmergencyFund ?? null,
    settings?.fireCashToInvestPct ?? null,
    settings?.fireDatedFlows ?? null,
    buildPensionSnapshotKey(normalizeCoastFirePensions(settings?.coastFirePensions)),
    settings?.respectPensionLockInFire ?? null,
    settings?.pensionInpsRetirementAge ?? null,
    settings?.pensionRitaLongUnemployment ?? null,
  ]);
}

const pensionsKey = (drafts: CoastFirePensionDraft[]) => buildPensionSnapshotKey(parsePensionDrafts(drafts));

/** True when the form differs from the saved one, field by field (pensions by their persisted shape). */
export function isPlanDirty(form: FirePlanForm, seed: FirePlanForm): boolean {
  return (
    form.userAge !== seed.userAge ||
    form.targetAge !== seed.targetAge ||
    form.plannedExpenses !== seed.plannedExpenses ||
    form.withdrawalRate !== seed.withdrawalRate ||
    form.emergencyFund !== seed.emergencyFund ||
    form.fundDerived !== seed.fundDerived ||
    JSON.stringify(form.datedFlows) !== JSON.stringify(seed.datedFlows) ||
    pensionsKey(form.pensions) !== pensionsKey(seed.pensions) ||
    form.respectPensionLock !== seed.respectPensionLock ||
    form.inpsRetirementAge !== seed.inpsRetirementAge ||
    form.ritaLongUnemployment !== seed.ritaLongUnemployment
  );
}

/** What the form says is wrong, field by field — the `aria-invalid` of each control and the message of «Salva». */
export interface FirePlanProblems {
  userAge?: string;
  targetAge?: string;
  plannedExpenses?: string;
  withdrawalRate?: string;
  emergencyFund?: string;
  inpsRetirementAge?: string;
  /** The first problem of the dated flows, for the save toast. */
  flows?: string;
}

/**
 * The same bounds the save enforces (RP4), said AT the field while typing. An empty field is not invalid
 * for the optional ones (spesa, fondo, età attuale); `userAge` is the age bound of `targetAge`.
 */
export function validateFirePlan(form: FirePlanForm, currentYear: number): FirePlanProblems {
  const problems: FirePlanProblems = {};
  const typedAge = parseOptionalInteger(form.userAge);
  const ageOk = isValidAge(typedAge);
  if (form.userAge.trim() !== '' && !ageOk) problems.userAge = "Serve un'età intera tra 18 e 100 anni.";

  const swr = Number.parseFloat(form.withdrawalRate);
  if (!(Number.isFinite(swr) && swr > 0 && swr <= 100)) problems.withdrawalRate = 'Serve un valore sopra 0 e fino a 100.';

  const target = parseOptionalInteger(form.targetAge);
  if (!(isValidAge(target) && (!ageOk || target > typedAge))) {
    problems.targetAge = ageOk ? `Serve un'età sopra la tua (${typedAge}) e fino a 100.` : "Serve un'età tra 18 e 100.";
  }

  if (form.plannedExpenses.trim() !== '') {
    const value = Number.parseFloat(form.plannedExpenses.replace(',', '.'));
    if (!(Number.isFinite(value) && value > 0)) problems.plannedExpenses = 'Serve un importo sopra 0, oppure lascia vuoto.';
  }

  if (!form.fundDerived && form.emergencyFund.trim() !== '') {
    const value = Number.parseFloat(form.emergencyFund.replace(',', '.'));
    if (!(Number.isFinite(value) && value >= 0)) problems.emergencyFund = 'Serve un importo da 0 in su, oppure lascia vuoto.';
  }

  const inps = Number.parseInt(form.inpsRetirementAge, 10);
  if (!(Number.isFinite(inps) && inps >= 60 && inps <= 75)) problems.inpsRetirementAge = "Serve un'età tra 60 e 75 anni.";

  const flowsProblem = validateDatedFlows(form.datedFlows, currentYear);
  if (flowsProblem) problems.flows = flowsProblem;
  return problems;
}

export function planPensionIssues(form: FirePlanForm, now: Date): PensionDraftIssue[] {
  const age = parseOptionalInteger(form.userAge);
  const target = parseOptionalInteger(form.targetAge);
  return buildPensionDraftIssues(form.pensions, isValidAge(age) ? age : null, isValidAge(target) ? target : null, now);
}

/**
 * RP3: the valid edits of the form as settings fields, to lay over the saved ones. Only the fields the user
 * changed enter, and a field that is not valid stays the saved one (the problem is said at the control).
 */
export function buildPlanOverlay(form: FirePlanForm, seed: FirePlanForm): Partial<Settings> {
  const problems = validateFirePlan(form, getItalyYear());
  const overlay: Partial<Settings> = {};
  const changed = <K extends keyof FirePlanForm>(key: K) => form[key] !== seed[key];

  if (changed('userAge') && !problems.userAge) {
    const age = parseOptionalInteger(form.userAge);
    if (isValidAge(age)) overlay.userAge = age;
  }
  if (changed('targetAge') && !problems.targetAge) overlay.coastFireRetirementAge = parseOptionalInteger(form.targetAge) ?? undefined;
  // A typed age that no longer clears the age bound (the age moved above it) keeps the saved target.
  if (changed('withdrawalRate') && !problems.withdrawalRate) overlay.withdrawalRate = Number.parseFloat(form.withdrawalRate);
  if (changed('plannedExpenses') && !problems.plannedExpenses) {
    overlay.plannedAnnualExpenses = form.plannedExpenses.trim() === '' ? undefined : Number.parseFloat(form.plannedExpenses.replace(',', '.'));
    overlay.coastFireCustomExpenses = undefined;
  }
  if ((changed('emergencyFund') || changed('fundDerived')) && !form.fundDerived && !problems.emergencyFund) {
    overlay.fireEmergencyFund = form.emergencyFund.trim() === '' ? undefined : Number.parseFloat(form.emergencyFund.replace(',', '.'));
    overlay.fireCashToInvestPct = undefined;
  }
  if (changed('datedFlows')) overlay.fireDatedFlows = form.datedFlows;
  if (pensionsKey(form.pensions) !== pensionsKey(seed.pensions)) overlay.coastFirePensions = parsePensionDrafts(form.pensions);
  if (changed('respectPensionLock')) overlay.respectPensionLockInFire = form.respectPensionLock;
  if (changed('inpsRetirementAge') && !problems.inpsRetirementAge) overlay.pensionInpsRetirementAge = Number.parseInt(form.inpsRetirementAge, 10);
  if (changed('ritaLongUnemployment')) overlay.pensionRitaLongUnemployment = form.ritaLongUnemployment;
  return overlay;
}

/** The saved settings with the overlay on top; the saved object itself when there is nothing to lay over. */
export function applyPlanOverlay(saved: Settings | null | undefined, overlay: Partial<Settings> | null): Settings | null | undefined {
  if (!overlay) return saved;
  return { ...(saved ?? {}), ...overlay } as Settings;
}

export interface FirePlanPayload {
  withdrawalRate: number;
  userAge: number | undefined;
  coastFireRetirementAge: number;
  plannedAnnualExpenses: number | undefined;
  fireEmergencyFund: number | undefined;
  fireCashToInvestPct: undefined;
  fireDatedFlows: DatedFlow[];
  coastFireCustomExpenses: undefined;
  coastFirePensions: CoastFirePensionInput[];
  respectPensionLockInFire: boolean;
  pensionInpsRetirementAge: number;
  pensionRitaLongUnemployment: boolean;
}

/**
 * RP4: every Piano field, for ONE `setSettings`. Empty = the field is removed (spesa, fondo); a legacy
 * share is converted to euro here (RE5, `derivedFund`); the pensions are normalised. Null with the first problem
 * when the form cannot be saved — the message the toast shows.
 */
export function buildPlanPayload(
  form: FirePlanForm,
  { derivedFund, currentYear }: { derivedFund: number | null | undefined; currentYear: number },
): { payload: FirePlanPayload; problem: null } | { payload: null; problem: string } {
  const problems = validateFirePlan(form, currentYear);
  const age = parseOptionalInteger(form.userAge);
  if (problems.withdrawalRate) return { payload: null, problem: 'Inserisci un SWR valido, sopra 0 e fino a 100' };
  if (problems.inpsRetirementAge) return { payload: null, problem: "Inserisci un'età pensione INPS valida tra 60 e 75" };
  if (problems.userAge) return { payload: null, problem: "Inserisci un'età attuale valida tra 18 e 100 anni" };
  if (problems.plannedExpenses) return { payload: null, problem: 'Inserisci una spesa del piano sopra 0, o lasciala vuota per leggerla dal Cashflow' };
  if (problems.emergencyFund) return { payload: null, problem: 'Inserisci un fondo di emergenza da 0 in su, o lascialo vuoto' };
  if (problems.targetAge) {
    return { payload: null, problem: isValidAge(age) ? `Inserisci un'età obiettivo sopra la tua (${age}) e fino a 100` : "Inserisci un'età obiettivo tra 18 e 100" };
  }
  if (problems.flows) return { payload: null, problem: problems.flows };

  const typedFund = form.emergencyFund.trim();
  const fund = form.fundDerived
    ? derivedFund === null || derivedFund === undefined
      ? undefined
      : Math.round(derivedFund)
    : typedFund === ''
      ? undefined
      : Math.round(Number.parseFloat(typedFund.replace(',', '.')));
  const typedExpenses = form.plannedExpenses.trim();
  return {
    problem: null,
    payload: {
      withdrawalRate: Number.parseFloat(form.withdrawalRate),
      userAge: isValidAge(age) ? age : undefined,
      coastFireRetirementAge: parseOptionalInteger(form.targetAge) as number,
      plannedAnnualExpenses: typedExpenses === '' ? undefined : Number.parseFloat(typedExpenses.replace(',', '.')),
      fireEmergencyFund: fund,
      fireCashToInvestPct: undefined,
      fireDatedFlows: form.datedFlows,
      coastFireCustomExpenses: undefined,
      coastFirePensions: parsePensionDrafts(form.pensions),
      respectPensionLockInFire: form.respectPensionLock,
      pensionInpsRetirementAge: Number.parseInt(form.inpsRetirementAge, 10),
      pensionRitaLongUnemployment: form.ritaLongUnemployment,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The tiles' readings (§ 15 RP2: each tile of the block states its own state)
// ─────────────────────────────────────────────────────────────────────────────

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** «45 anni oggi, obiettivo 60» — or what is missing. */
export function describePlanYou(age: number | null, targetAge: number | null): Narrative {
  if (age === null) return [prose("Scrivi la tua età: da lì il capitale cresce e le pensioni hanno una data.")];
  if (targetAge === null) return [figure(`${age} anni`), prose(' oggi; manca l\'età a cui vuoi smettere.')];
  return [figure(`${age} anni`), prose(' oggi, obiettivo '), figure(String(targetAge))];
}

/** «Spesa 25.200 € l'anno, SWR 4%» — the expense is the plan's own or the Cashflow's. */
export function describePlanSpending(input: { expense: number | null; fromCashflow: boolean; swr: number | null }): Narrative {
  const expense =
    input.expense === null
      ? [prose('Nessuna spesa: scrivila o aggiungi un anno di Cashflow')]
      : input.fromCashflow
        ? [prose('Spesa '), figure(cachedFormatCurrencyEUR(Math.round(input.expense), true)), prose(" l'anno, dal Cashflow")]
        : [prose('Spesa '), figure(cachedFormatCurrencyEUR(Math.round(input.expense), true)), prose(" l'anno, del piano")];
  return input.swr === null ? expense : [...expense, prose(', SWR '), figure(`${input.swr.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`)];
}

/** «4 flussi, 1 escluso» / «Nessun flusso». */
export function describePlanFlows(count: number, excluded: number): Narrative {
  if (count === 0 && excluded === 0) return [prose('Nessun flusso: la spesa e il risparmio restano costanti negli anni.')];
  const head: Narrative = [figure(String(count)), prose(count === 1 ? ' flusso in uso' : ' flussi in uso')];
  return excluded > 0 ? [...head, prose(excluded === 1 ? ', uno escluso: il motivo è sulla riga.' : `, ${excluded} esclusi: il motivo è sulle righe.`)] : [...head, prose('.')];
}
