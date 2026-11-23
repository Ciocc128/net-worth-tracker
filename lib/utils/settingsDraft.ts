/**
 * The ONE draft of Impostazioni (2026-10-08).
 *
 * Until then `app/dashboard/settings/page.tsx` held 70 `useState`s in one 4100-line component:
 * every keystroke re-ran the whole function (286 components per key on one machine with the
 * compiler on, 318 on another — the census, doc/guide/velocita.md), and
 * the six tabs could not become components of their own because Radix unmounts an inactive panel
 * — a view with form state of its own would lose it at every tab change, and «Salva» from
 * another tab would never see it. So the page keeps ONE `useReducer(settingsDraftReducer)` and
 * each tab is a controlled view of its SLICE: it receives the slice, emits a patch, holds nothing.
 *
 * This module is pure (no React, no SDK of its own — it imports `coastFireView`, which reaches Firebase, so its tests mock the client) so the three things that must never drift are tested
 * against a fixture:
 *   - `sliceSettings(document)` seeds the slices from the saved document — the `loadTargets`
 *     half of the old page, defaults included;
 *   - `composeSettingsDocument(slices, current)` rebuilds the document «Salva» writes — or names
 *     the first broken target rule and WHERE it is (tab, group, field);
 *   - `isSliceDirty(a, b)` is the per-tab dot and the bar at the bottom (the dirty snapshot of
 *     doc/guide/impostazioni.md § Settings — the FIVE places, now a comparison of two slices).
 * `composeSettingsDocument(sliceSettings(doc), doc)` must equal `doc` on every field the page
 * owns (`__tests__/settingsDraft.test.ts`): the bug this structure can reintroduce is a field
 * that does not come back, and the identity test is where it would show.
 *
 * Which slice a field belongs to is the TAB THAT EDITS IT (the dot must land on that tab): the
 * risk-free rate is Preferenze's (Calcolo dei rendimenti, since RU8), the default accounts and the
 * transfer fee are Spese's.
 *
 * RU8 (2026-11-23, doc/allocazione-strategia/README.md § 5.4, D-ST5): the class targets left this
 * draft for Allocazione › Strategia (lib/utils/targetsDraft.ts). «Salva» writes NO `targets` key —
 * so `setSettings` takes its merge branch, and a «Salva» from a page opened before cannot bring
 * back targets saved in Strategia since (the M1 defect of the data-model review) — nor
 * `autoCalculateEquityBonds`; `goalDrivenAllocationEnabled` only to switch it off with the goals. Condivisione and Aspetto write nothing through «Salva» (the colour
 * theme saves itself, the grants are their own documents), so they have no slice.
 *
 * FORK (tenth realignment, T3): a seventh slice, `simulazioni` — the Monte Carlo market
 * assumptions and the IRPEF brackets of Impostazioni › Simulazioni — and the fields the page
 * only CARRIES THROUGH from the document read just before «Salva» (the FIRE plan's emergency
 * fund and dated flows, the optimizer's objectives). The Simulazioni
 * fields are written only when the tab holds an edit (or a legacy document waits to be
 * converted), so a «Salva» from another tab can never turn defaults into a saved market.
 */

import type { Asset, AssetAllocationSettings, AssetAllocationSettingsWrite, AssetAllocationTarget, FamilyMember, IdealAllocationSettings } from '@/types/assets';
import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';
import {
  buildTaxBracketSnapshotKey,
  parseTaxBracketDrafts,
  toTaxBracketDrafts,
  type CoastFireTaxBracketDraft,
} from '@/lib/utils/coastFireView';
import { changedPairs, correctUpperTriangle } from '@/lib/utils/correlationMatrix';
import {
  collectCommoditySubCategories,
  findDefaultGoldSubCategory,
  resolveMonteCarloMarket,
  toMonteCarloMarketSettings,
  type MonteCarloMarketDraft,
  type MonteCarloMarketOrigin,
} from '@/lib/utils/monteCarloMarket';
import { findMonteCarloMarketProblems, type MonteCarloMarketProblem } from '@/lib/utils/monteCarloMarketValidation';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/utils/weightOptimizer';

// ─── Identifiers ──────────────────────────────────────────────────────────────────────────

export type SettingsTabId = 'generale' | 'spese' | 'dividendi' | 'simulazioni' | 'condivisione' | 'aspetto';

export const SETTINGS_TAB_IDS: readonly SettingsTabId[] = ['generale', 'spese', 'dividendi', 'simulazioni', 'condivisione', 'aspetto'];

export function isSettingsTabId(value: string | null | undefined): value is SettingsTabId {
  return (SETTINGS_TAB_IDS as readonly string[]).includes(value ?? '');
}

/**
 * The old `?tab=allocazione` (D-RU21): the targets live in Allocazione › Strategia since RU8, so a
 * bookmark is replaced by that page, never sent to the default tab.
 */
export const LEGACY_ALLOCAZIONE_TAB = 'allocazione';
export const STRATEGIA_TARGETS_HREF = '/dashboard/allocation?tab=strategia#target';

/** The «none» option of the account and subcategory selects (a Radix Select cannot hold ''). */
export const NO_SELECTION = '__none__';

// ─── Slices ───────────────────────────────────────────────────────────────────────────────

/**
 * Famiglia — string-typed while editing (never fights the reader while typing); a row with no
 * name is one the reader started and left, dropped on write and ignored by the dirty check.
 */
export interface FamilyMemberDraft {
  id: string;
  name: string;
  grossAnnualIncome: string;
  isFirstEmploymentPost2007: boolean;
  firstEmploymentYear: string;
}

export interface GeneraleSlice {
  includePrimaryResidenceInFIRE: boolean;
  goalBasedInvestingEnabled: boolean;
  /**
   * The rate TYPED by the reader (Calcolo dei rendimenti, since RU8; Investimenti with RU9);
   * `undefined` = follow the ECB estimate (the key is then deleted on «Salva»).
   */
  riskFreeRate: number | undefined;
  stampDutyEnabled: boolean;
  stampDutyRate: number;
  checkingAccountSubCategory: string;
  cashflowHistoryStartYear: number;
  laborIncomeCategoryIds: string[];
  costCentersEnabled: boolean;
  expenseSplitEnabled: boolean;
  performanceIncludesPensionFunds: boolean;
  performanceIncludesExcludedAssets: boolean;
  performanceExcludesCash: boolean;
  pensionReturnStartMonth: string;
  monthlyEmailEnabled: boolean;
  quarterlyEmailEnabled: boolean;
  semiAnnualEmailEnabled: boolean;
  yearlyEmailEnabled: boolean;
  weeklyBudgetEmailEnabled: boolean;
  monthlyEmailRecipients: string[];
  familyMembers: FamilyMemberDraft[];
}

export interface SpeseSlice {
  defaultDebitCashAssetId: string;
  defaultCreditCashAssetId: string;
  /** '' = none: the expense form's «Commissione» stays off. */
  transferFeeCategoryId: string;
  transferFeeSubCategoryId: string;
  spendingRolesEnabled: boolean;
}

export interface DividendiSlice {
  dividendIncomeCategoryId: string;
  dividendIncomeSubCategoryId: string;
  dividendCashAssetId: string;
}

/** The pairs the last «Salva» adapted to keep the correlation matrix valid (R5), by pair index; marked until the next write. */
export type CorrelationCorrections = Record<number, { index: number; written: number; used: number }>;

/**
 * Simulazioni (fork) — the Monte Carlo market assumptions as the reader typed them, and the IRPEF
 * brackets the state pensions' net is computed with (RP8). `market` holds ONLY what was typed
 * (an undefined field is the default in force); `marketOrigin` says where the loaded numbers came
 * from (`migrated` = a v1 document converted at read, written as v2 by the first «Salva», RQ8).
 */
export interface SimulazioniSlice {
  market: MonteCarloMarketDraft;
  marketOrigin: MonteCarloMarketOrigin;
  /** What the conversion of an old document did, only while it is still unsaved. */
  marketMigration: { keptCount: number; bearBullDropped: boolean } | null;
  /** The inflation an old document was written with (shown while the conversion is pending). */
  marketLegacyInflation: number | undefined;
  taxBrackets: CoastFireTaxBracketDraft[];
  /** UI only — never written, never part of the dirty check. */
  correlationCorrections: CorrelationCorrections;
}

/**
 * Read-only declarations: fields OWNED by other pages (FIRE › Il mio piano, the Assistant's
 * popover, Allocazione › Strategia). The page reads them for a tile's reading line and never
 * writes them from a control — no dirty check. The ones the FIRE plan and the optimizer own are
 * CARRIED THROUGH `composeSettingsDocument` from the document read just before «Salva» (the
 * write goes through `setSettings`, which replaces the targets and must not lose them).
 */
export interface SettingsDeclarations {
  /** The optimizer's objectives, edited in Allocazione › Strategia; carried through, never shown here. */
  idealAllocation: IdealAllocationSettings;
  planParams: {
    withdrawalRate?: number;
    plannedAnnualExpenses?: number;
    fireEmergencyFund?: number;
    fireCashToInvestPct?: number;
    fireDatedFlowsCount: number;
    pensionInpsRetirementAge?: number;
    pensionRitaLongUnemployment: boolean;
    respectPensionLockInFire: boolean;
  };
  assistantPrefs: {
    responseStyle?: 'balanced' | 'concise' | 'deep';
    memoryEnabled?: boolean;
    macroContextEnabled?: boolean;
  };
}

export interface SettingsSlices {
  generale: GeneraleSlice;
  spese: SpeseSlice;
  dividendi: DividendiSlice;
  simulazioni: SimulazioniSlice;
  declarations: SettingsDeclarations;
}

/** The tabs that have a slice «Salva» writes — the ones that can carry the dot. */
export type WritableTabId = 'generale' | 'spese' | 'dividendi' | 'simulazioni';
export const WRITABLE_TABS: readonly WritableTabId[] = ['generale', 'spese', 'dividendi', 'simulazioni'];

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

const DEFAULT_STAMP_DUTY_RATE = 0.2;
const DEFAULT_HISTORY_START_YEAR = 2025;

export function toFamilyMemberDrafts(members: FamilyMember[] | undefined): FamilyMemberDraft[] {
  return (members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    grossAnnualIncome: member.grossAnnualIncome != null ? String(member.grossAnnualIncome) : '',
    isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
    firstEmploymentYear: member.firstEmploymentYear != null ? String(member.firstEmploymentYear) : '',
  }));
}

/** The members as written: unnamed rows dropped, RAL and year parsed (a blank is `undefined`). */
export function parseFamilyMemberDrafts(drafts: FamilyMemberDraft[]): FamilyMember[] {
  return drafts
    .filter((draft) => draft.name.trim() !== '')
    .map((draft) => {
      const ral = Number.parseFloat(draft.grossAnnualIncome.replace(',', '.'));
      const year = Number.parseInt(draft.firstEmploymentYear, 10);
      return {
        id: draft.id,
        name: draft.name.trim(),
        grossAnnualIncome: Number.isFinite(ral) && ral > 0 ? ral : undefined,
        isFirstEmploymentPost2007: draft.isFirstEmploymentPost2007,
        firstEmploymentYear: Number.isInteger(year) ? year : undefined,
      };
    });
}

// ─── sliceSettings ────────────────────────────────────────────────────────────────────────

/**
 * The slices from the saved document — the seed of the form at open and at «Annulla».
 *
 * @param document - `getSettings`' answer; `null` when the account has no document yet.
 */
export function sliceSettings(document: AssetAllocationSettings | null): SettingsSlices {
  const data = document ?? ({} as Partial<AssetAllocationSettings>);

  const generale: GeneraleSlice = {
    includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE ?? false,
    goalBasedInvestingEnabled: data.goalBasedInvestingEnabled ?? false,
    riskFreeRate: data.riskFreeRate,
    stampDutyEnabled: data.stampDutyEnabled ?? false,
    stampDutyRate: data.stampDutyRate ?? DEFAULT_STAMP_DUTY_RATE,
    checkingAccountSubCategory: data.checkingAccountSubCategory || NO_SELECTION,
    cashflowHistoryStartYear: data.cashflowHistoryStartYear ?? DEFAULT_HISTORY_START_YEAR,
    laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
    costCentersEnabled: data.costCentersEnabled ?? false,
    expenseSplitEnabled: data.expenseSplitEnabled ?? false,
    performanceIncludesPensionFunds: data.performanceIncludesPensionFunds ?? false,
    performanceIncludesExcludedAssets: data.performanceIncludesExcludedAssets ?? false,
    performanceExcludesCash: data.performanceExcludesCash ?? false,
    pensionReturnStartMonth: data.pensionReturnStartMonth ?? '',
    monthlyEmailEnabled: data.monthlyEmailEnabled ?? false,
    quarterlyEmailEnabled: data.quarterlyEmailEnabled ?? false,
    semiAnnualEmailEnabled: data.semiAnnualEmailEnabled ?? false,
    yearlyEmailEnabled: data.yearlyEmailEnabled ?? false,
    weeklyBudgetEmailEnabled: data.weeklyBudgetEmailEnabled ?? false,
    monthlyEmailRecipients: data.monthlyEmailRecipients ?? [],
    familyMembers: toFamilyMemberDrafts(data.familyMembers),
  };

  const spese: SpeseSlice = {
    defaultDebitCashAssetId: data.defaultDebitCashAssetId || NO_SELECTION,
    defaultCreditCashAssetId: data.defaultCreditCashAssetId || NO_SELECTION,
    transferFeeCategoryId: data.transferFeeCategoryId || '',
    transferFeeSubCategoryId: data.transferFeeSubCategoryId || '',
    spendingRolesEnabled: data.spendingRolesEnabled ?? false,
  };

  const dividendi: DividendiSlice = {
    dividendIncomeCategoryId: data.dividendIncomeCategoryId || '',
    dividendIncomeSubCategoryId: data.dividendIncomeSubCategoryId || '',
    dividendCashAssetId: data.dividendCashAssetId || NO_SELECTION,
  };

  // Simulazioni: the market as the Monte Carlo and the Ventaglio will read it (no commodity list
  // here: the Oro choice stays «never chosen» until the reader makes one, RG).
  const resolvedMarket = resolveMonteCarloMarket(data, []);
  const simulazioni: SimulazioniSlice = {
    market: {
      overrides: resolvedMarket.overrides,
      goldSubCategory: data.monteCarloMarket ? data.monteCarloMarket.goldSubCategory : undefined,
      correlations: resolvedMarket.correlations,
      leverageSpread: resolvedMarket.leverageSpread,
    },
    marketOrigin: resolvedMarket.origin,
    marketMigration: resolvedMarket.migration ?? null,
    marketLegacyInflation:
      resolvedMarket.origin === 'migrated'
        ? (data.monteCarloMarket as { scenarios?: { base?: { inflationRate?: number } } } | undefined)?.scenarios?.base?.inflationRate ??
          data.monteCarloScenarios?.base?.inflationRate
        : undefined,
    taxBrackets: toTaxBracketDrafts(data.coastFireTaxBrackets),
    correlationCorrections: {},
  };

  const declarations: SettingsDeclarations = {
    idealAllocation: data.idealAllocation ?? DEFAULT_IDEAL_ALLOCATION,
    planParams: {
      withdrawalRate: data.withdrawalRate,
      plannedAnnualExpenses: data.plannedAnnualExpenses,
      fireEmergencyFund: data.fireEmergencyFund,
      fireCashToInvestPct: data.fireCashToInvestPct,
      fireDatedFlowsCount: data.fireDatedFlows?.length ?? 0,
      pensionInpsRetirementAge: data.pensionInpsRetirementAge,
      pensionRitaLongUnemployment: data.pensionRitaLongUnemployment ?? false,
      respectPensionLockInFire: data.respectPensionLockInFire ?? false,
    },
    assistantPrefs: {
      responseStyle: data.assistantResponseStyle,
      memoryEnabled: data.assistantMemoryEnabled,
      macroContextEnabled: data.assistantMacroContextEnabled,
    },
  };

  return { generale, spese, dividendi, simulazioni, declarations };
}

// ─── composeSettingsDocument ──────────────────────────────────────────────────────────────

export type ComposeResult =
  | {
      ok: true;
      /** No `targets`: `setSettings` takes its merge branch (RU8, criterion 12). */
      document: AssetAllocationSettingsWrite;
      /**
       * The Simulazioni slice as it was written (the correlations corrected, the Oro choice explicit,
       * the legacy format converted) — the new baseline — or `null` when «Salva» wrote none of it.
       */
      simulazioni: SimulazioniSlice | null;
      /** The correlation pairs the write adapted to keep the matrix valid (R5); empty when none. */
      adaptedPairs: { index: number; written: number; used: number }[];
    }
  | { ok: false; marketProblems: MonteCarloMarketProblem[]; tab: 'simulazioni' };

/** What the page knows that the slices do not: the baseline (Simulazioni is written only when it differs) and the Oro in force. */
export interface ComposeContext {
  /** The slices as last read or written. */
  saved: SettingsSlices;
  /** The sub-category read as Oro in force: the draft's choice, else the default rule (`resolveSimulazioniGold`). */
  effectiveGoldSubCategory: string | null;
}

/**
 * The document «Salva» writes, from the slices — or the first market figure out of range.
 *
 * @param slices - The draft as edited.
 * @param current - The document as it is NOW (the pre-read of «Salva»), for the fields the write
 *   carries through unchanged: the FIRE plan's (withdrawal rate, planned expenses, emergency fund,
 *   dated flows) and the optimizer's objectives. Every one of them is owned by another page.
 * @param context - Without it nothing of Simulazioni is written unless a legacy market waits to be converted.
 */
export function composeSettingsDocument(
  slices: SettingsSlices,
  current: AssetAllocationSettings | null,
  context?: ComposeContext
): ComposeResult {
  // Simulazioni: the market only when it holds an edit (or a legacy document to convert), the
  // brackets only when they were edited — a «Salva» from another tab never writes either.
  const saved = context?.saved ?? slices;
  const { market, taxBrackets } = slices.simulazioni;
  const marketPending = isMarketPending(slices.simulazioni, saved.simulazioni);
  const taxBracketsDirty = isTaxBracketsDirty(taxBrackets, saved.simulazioni.taxBrackets);

  let marketPayload: ReturnType<typeof toMonteCarloMarketSettings> | undefined;
  let correctedCorrelations: number[] | undefined;
  if (marketPending) {
    // Out-of-range pairs are reported by name before R5 gets to hide them by correcting. The raw
    // draft is checked, not the normalised document: a typed value out of range is reported, never dropped.
    const marketProblems = findMonteCarloMarketProblems({
      version: 2,
      classes: market.overrides.classes,
      inflationRate: market.overrides.inflationRate,
      correlations: market.correlations,
      leverageSpread: market.leverageSpread,
    });
    if (marketProblems.length > 0) return { ok: false, marketProblems, tab: 'simulazioni' };
    // R5: a matrix that is not valid is replaced by the nearest valid one, at full precision.
    correctedCorrelations = correctUpperTriangle(market.correlations, MONTE_CARLO_CLASSES.length);
    marketPayload = toMonteCarloMarketSettings(
      market.overrides,
      context?.effectiveGoldSubCategory ?? null,
      correctedCorrelations,
      market.leverageSpread
    );
  }
  const taxBracketsPayload = taxBracketsDirty ? parseTaxBracketDrafts(taxBrackets) : undefined;

  const { generale, spese, dividendi } = slices;
  // Switching the goals off switches the goal-driven targets off with them (what the Preferenze
  // tile did until RU8). The flag is Strategia's now, so it is written ONLY on that transition:
  // a «Salva» that leaves the goals as they were never touches the source chosen in Strategia.
  const goalsSwitchedOff = saved.generale.goalBasedInvestingEnabled && !generale.goalBasedInvestingEnabled;
  const document: AssetAllocationSettingsWrite = {
    // `userAge` is NOT written from here (D-T5): the age is typed in FIRE › Il mio piano.
    // Present-but-undefined when it follows the ECB estimate: the service's `'x' in settings` guard deletes it.
    riskFreeRate: generale.riskFreeRate,
    includePrimaryResidenceInFIRE: generale.includePrimaryResidenceInFIRE,
    goalBasedInvestingEnabled: generale.goalBasedInvestingEnabled,
    ...(goalsSwitchedOff ? { goalDrivenAllocationEnabled: false } : {}),
    withdrawalRate: current?.withdrawalRate,
    plannedAnnualExpenses: current?.plannedAnnualExpenses,
    fireEmergencyFund: current?.fireEmergencyFund,
    fireCashToInvestPct: current?.fireCashToInvestPct,
    fireDatedFlows: current?.fireDatedFlows,
    dividendIncomeCategoryId: dividendi.dividendIncomeCategoryId || undefined,
    dividendIncomeSubCategoryId: dividendi.dividendIncomeSubCategoryId || undefined,
    dividendCashAssetId: dividendi.dividendCashAssetId !== NO_SELECTION ? dividendi.dividendCashAssetId : undefined,
    defaultDebitCashAssetId: spese.defaultDebitCashAssetId !== NO_SELECTION ? spese.defaultDebitCashAssetId : undefined,
    defaultCreditCashAssetId: spese.defaultCreditCashAssetId !== NO_SELECTION ? spese.defaultCreditCashAssetId : undefined,
    transferFeeCategoryId: spese.transferFeeCategoryId || undefined,
    transferFeeSubCategoryId: spese.transferFeeSubCategoryId || undefined,
    stampDutyEnabled: generale.stampDutyEnabled,
    stampDutyRate: generale.stampDutyRate,
    checkingAccountSubCategory: generale.checkingAccountSubCategory,
    cashflowHistoryStartYear: generale.cashflowHistoryStartYear,
    laborIncomeCategoryIds: generale.laborIncomeCategoryIds,
    costCentersEnabled: generale.costCentersEnabled,
    expenseSplitEnabled: generale.expenseSplitEnabled,
    spendingRolesEnabled: spese.spendingRolesEnabled,
    performanceIncludesPensionFunds: generale.performanceIncludesPensionFunds,
    performanceIncludesExcludedAssets: generale.performanceIncludesExcludedAssets,
    performanceExcludesCash: generale.performanceExcludesCash,
    // '' = «no month set»: saved as undefined, or pensionReturn would parse it as a date.
    pensionReturnStartMonth: generale.pensionReturnStartMonth || undefined,
    monthlyEmailEnabled: generale.monthlyEmailEnabled,
    quarterlyEmailEnabled: generale.quarterlyEmailEnabled,
    semiAnnualEmailEnabled: generale.semiAnnualEmailEnabled,
    yearlyEmailEnabled: generale.yearlyEmailEnabled,
    weeklyBudgetEmailEnabled: generale.weeklyBudgetEmailEnabled,
    monthlyEmailRecipients: generale.monthlyEmailRecipients,
    familyMembers: parseFamilyMemberDrafts(generale.familyMembers),
    // The optimizer's objectives are not this page's (edited in Allocazione › Strategia): what the
    // document holds NOW goes back, never the copy this page loaded.
    idealAllocation: current?.idealAllocation,
    ...(marketPayload ? { monteCarloMarket: marketPayload } : {}),
    // The IRPEF brackets: written only when the tab holds edits to them, like the market.
    ...(taxBracketsPayload ? { coastFireTaxBrackets: taxBracketsPayload } : {}),
  };

  let simulazioni: SimulazioniSlice | null = null;
  let adaptedPairs: { index: number; written: number; used: number }[] = [];
  if (marketPayload && correctedCorrelations) {
    adaptedPairs = changedPairs(market.correlations, correctedCorrelations);
    simulazioni = {
      ...slices.simulazioni,
      // The Oro choice is now explicit in the document: the draft says so, and stays clean.
      market: {
        overrides: market.overrides,
        goldSubCategory: marketPayload.goldSubCategory,
        correlations: correctedCorrelations,
        leverageSpread: market.leverageSpread,
      },
      marketOrigin: 'saved',
      marketMigration: null,
      correlationCorrections: Object.fromEntries(adaptedPairs.map((pair) => [pair.index, pair])),
    };
  }
  return { ok: true, document, simulazioni, adaptedPairs };
}

// ─── Simulazioni helpers ──────────────────────────────────────────────────────────────────

/**
 * Dirty-state value of the market draft: what the user wrote — normalised exactly as it is saved,
 * so a value typed back to the default is clean again — and the Oro choice (`undefined` = never
 * chosen, kept apart from an explicit «Nessuna» = null).
 */
function marketSnapshotKey(draft: MonteCarloMarketDraft): string {
  return JSON.stringify({
    written: toMonteCarloMarketSettings(draft.overrides, undefined),
    goldSubCategory: draft.goldSubCategory === undefined ? '__auto__' : draft.goldSubCategory,
    correlations: draft.correlations,
    leverageSpread: draft.leverageSpread,
  });
}

function isTaxBracketsDirty(draft: CoastFireTaxBracketDraft[], saved: CoastFireTaxBracketDraft[]): boolean {
  return buildTaxBracketSnapshotKey(parseTaxBracketDrafts(draft)) !== buildTaxBracketSnapshotKey(parseTaxBracketDrafts(saved));
}

/** The market differs from the saved one: the reader typed something (a value typed back to the default is clean again). */
export function isMarketEdited(draft: SimulazioniSlice, saved: SimulazioniSlice): boolean {
  return marketSnapshotKey(draft.market) !== marketSnapshotKey(saved.market);
}

/**
 * The market has something to write: an edit, or a document still in the old format — the first
 * «Salva» rewrites it as v2 even when nothing was typed (RQ8).
 */
export function isMarketPending(draft: SimulazioniSlice, saved: SimulazioniSlice): boolean {
  return isMarketEdited(draft, saved) || draft.marketOrigin === 'migrated';
}

/**
 * The sub-categories that can be named «Oro» (the targets as saved — Strategia owns them — then the portfolio)
 * and the one in force — the draft's choice, else the default rule (doc/montecarlo/README.md, RG).
 */
export function resolveSimulazioniGold(
  slice: SimulazioniSlice,
  targets: AssetAllocationTarget | undefined,
  assets: readonly Asset[] | undefined
): { commoditySubCategories: string[]; effectiveGoldSubCategory: string | null } {
  const fromTargets = Object.keys(targets?.commodity?.subTargets ?? {}).map((name) => name.trim()).filter(Boolean);
  const commoditySubCategories = Array.from(new Set([...fromTargets, ...collectCommoditySubCategories(assets, null)]));
  const effectiveGoldSubCategory =
    slice.market.goldSubCategory === undefined ? findDefaultGoldSubCategory(commoditySubCategories) : slice.market.goldSubCategory;
  return { commoditySubCategories, effectiveGoldSubCategory };
}

// ─── isSliceDirty ─────────────────────────────────────────────────────────────────────────

/**
 * Normalised, order-independent value of a FamilyMember[] — the same function for the saved
 * side and the draft side, so the two are always comparable.
 */
function familyMembersSnapshot(members: FamilyMember[]) {
  return [...members]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((member) => ({
      id: member.id,
      name: member.name,
      grossAnnualIncome: member.grossAnnualIncome !== undefined ? roundToTwoDecimals(member.grossAnnualIncome) : null,
      isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
      firstEmploymentYear: member.firstEmploymentYear ?? null,
    }));
}

/**
 * The persisted content of a slice as a comparable string: percentages at two decimals (what the
 * page writes), lists whose order the UI shuffles sorted, the UI-only flags (`expanded`) left out.
 */
function snapshotSlice(tab: WritableTabId, slices: SettingsSlices): string {
  switch (tab) {
    case 'generale': {
      const { familyMembers, laborIncomeCategoryIds, monthlyEmailRecipients, stampDutyRate, ...rest } = slices.generale;
      return JSON.stringify({
        ...rest,
        stampDutyRate: roundToTwoDecimals(stampDutyRate),
        laborIncomeCategoryIds: [...laborIncomeCategoryIds].sort(),
        monthlyEmailRecipients: [...monthlyEmailRecipients].sort(),
        familyMembers: familyMembersSnapshot(parseFamilyMemberDrafts(familyMembers)),
      });
    }
    case 'spese':
      return JSON.stringify(slices.spese);
    case 'dividendi':
      return JSON.stringify(slices.dividendi);
    case 'simulazioni':
      return JSON.stringify({
        market: marketSnapshotKey(slices.simulazioni.market),
        taxBrackets: buildTaxBracketSnapshotKey(parseTaxBracketDrafts(slices.simulazioni.taxBrackets)),
      });
  }
}

/** Whether a tab holds an edit «Salva» would write — the dot on the tab and the bar at the bottom. */
export function isSliceDirty(tab: WritableTabId, draft: SettingsSlices, saved: SettingsSlices): boolean {
  // A legacy market waiting to be converted is a pending write even though nothing was typed (RQ8).
  if (tab === 'simulazioni' && draft.simulazioni.marketOrigin === 'migrated') return true;
  return snapshotSlice(tab, draft) !== snapshotSlice(tab, saved);
}

// ─── The reducer ──────────────────────────────────────────────────────────────────────────

export interface SettingsDraft {
  /** The slices as edited. */
  slices: SettingsSlices;
  /** The slices as last read or written — the other side of the dirty comparison. */
  saved: SettingsSlices;
  /** `true` once a document has been read: before that nothing can be dirty and nothing is saved. */
  loaded: boolean;
}

export type SettingsDraftAction =
  | { type: 'reset'; document: AssetAllocationSettings | null }
  | { type: 'saved'; simulazioni?: SimulazioniSlice | null }
  | { type: 'generale/set'; patch: Partial<GeneraleSlice> }
  | { type: 'spese/set'; patch: Partial<SpeseSlice> }
  | { type: 'dividendi/set'; patch: Partial<DividendiSlice> }
  | { type: 'simulazioni/set'; patch: Partial<SimulazioniSlice> };

/** The draft before the first read: every slice at its defaults, nothing dirty. */
export function createSettingsDraft(): SettingsDraft {
  const slices = sliceSettings(null);
  return { slices, saved: slices, loaded: false };
}

export function settingsDraftReducer(state: SettingsDraft, action: SettingsDraftAction): SettingsDraft {
  switch (action.type) {
    case 'reset': {
      // A re-read replaces BOTH sides: the form shows the saved document and nothing is dirty.
      const slices = sliceSettings(action.document);
      return { slices, saved: slices, loaded: true };
    }
    case 'saved': {
      // The baseline is what was WRITTEN: Simulazioni's market as it was written (corrected, converted).
      const slices = { ...state.slices, ...(action.simulazioni ? { simulazioni: action.simulazioni } : {}) };
      return { ...state, slices, saved: slices };
    }
    case 'generale/set':
      return { ...state, slices: { ...state.slices, generale: { ...state.slices.generale, ...action.patch } } };
    case 'spese/set':
      return { ...state, slices: { ...state.slices, spese: { ...state.slices.spese, ...action.patch } } };
    case 'dividendi/set':
      return { ...state, slices: { ...state.slices, dividendi: { ...state.slices.dividendi, ...action.patch } } };
    case 'simulazioni/set':
      return { ...state, slices: { ...state.slices, simulazioni: { ...state.slices.simulazioni, ...action.patch } } };
  }
}
