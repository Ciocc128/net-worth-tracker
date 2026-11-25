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
 * risk-free rate is Investimenti's (Calcolo dei rendimenti), the default accounts, the transfer fee
 * and the dividends' landing are Cashflow's. RU9 (2026-11-26, doc/riordino-ui/ondata-2.md § 5.2):
 * five tabs by «whose adjustment it is» — Account, Funzioni, Cashflow, Investimenti, Avanzate — and
 * five slices of the same names; the read-only declarations are gone (a field another surface
 * owns is a «Si regola altrove» line, never a copy), and what the write carries through comes from
 * the document read just before «Salva».
 *
 * RU8 (2026-11-23, doc/allocazione-strategia/README.md § 5.4, D-ST5): the class targets left this
 * draft for Allocazione › Strategia (lib/utils/targetsDraft.ts). «Salva» writes NO `targets` key —
 * so `setSettings` takes its merge branch, and a «Salva» from a page opened before cannot bring
 * back targets saved in Strategia since (the M1 defect of the data-model review) — nor
 * `autoCalculateEquityBonds`; `goalDrivenAllocationEnabled` only to switch it off with the goals. The colour theme and the mode save themselves and the grants are their own
 * documents, so they are in no slice.
 *
 * FORK (tenth realignment, T3): a slice for the Monte Carlo market assumptions and the IRPEF
 * brackets (`avanzate` since RU9, `simulazioni` before it) — and the fields the page
 * only CARRIES THROUGH from the document read just before «Salva» (the FIRE plan's emergency
 * fund and dated flows, the optimizer's objectives). The Avanzate
 * fields are written only when the tab holds an edit (or a legacy document waits to be
 * converted), so a «Salva» from another tab can never turn defaults into a saved market.
 */

import type { Asset, AssetAllocationSettings, AssetAllocationSettingsWrite, AssetAllocationTarget, FamilyMember } from '@/types/assets';
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

// ─── Identifiers ──────────────────────────────────────────────────────────────────────────

export type SettingsTabId = 'account' | 'funzioni' | 'cashflow' | 'investimenti' | 'avanzate';

/** The tab bar's order; the first is the default (D-RU21). */
export const SETTINGS_TAB_IDS: readonly SettingsTabId[] = ['account', 'funzioni', 'cashflow', 'investimenti', 'avanzate'];
export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'account';

export function isSettingsTabId(value: string | null | undefined): value is SettingsTabId {
  return (SETTINGS_TAB_IDS as readonly string[]).includes(value ?? '');
}

/**
 * The old `?tab=` ids (RU9, D-RU21): bookmarks and the links of other pages. `dividendi` lands on
 * Cashflow with the focus on the Dividendi tile; `allocazione` is not a tab at all any more (below).
 */
const LEGACY_TAB_ALIASES: Record<string, SettingsTabId> = {
  generale: 'account',
  condivisione: 'account',
  aspetto: 'account',
  spese: 'cashflow',
  dividendi: 'cashflow',
  simulazioni: 'avanzate',
};

/**
 * The old `?tab=allocazione` (D-RU21): the targets live in Allocazione › Strategia since RU8, so a
 * bookmark is replaced by that page, never sent to the default tab.
 */
export const LEGACY_ALLOCAZIONE_TAB = 'allocazione';
export const STRATEGIA_TARGETS_HREF = '/dashboard/allocation?tab=strategia#target';

/** The id of the Dividendi tile in Cashflow: what `focus=dividendi` lands on. */
export const DIVIDENDI_TILE_ID = 'dividendi';
/** Where the gear of Cashflow › Dividendi and the old `?tab=dividendi` land (D-RU21). */
export const DIVIDENDI_SETTINGS_HREF = `/dashboard/settings?tab=cashflow&focus=${DIVIDENDI_TILE_ID}`;

export type RequestedSettingsTab =
  | { kind: 'tab'; tab: SettingsTabId; /** The URL does not say the tab the page opens on: it is replaced by the canonical one. */ canonical: boolean; focusDividendi: boolean }
  | { kind: 'redirect'; href: string };

/** What a `?tab=` asks for: a tab (an old id translated), or another page. Absent or unknown = the default tab. */
export function resolveRequestedTab(value: string | null | undefined): RequestedSettingsTab {
  if (value === LEGACY_ALLOCAZIONE_TAB) return { kind: 'redirect', href: STRATEGIA_TARGETS_HREF };
  if (isSettingsTabId(value)) return { kind: 'tab', tab: value, canonical: true, focusDividendi: false };
  const alias = value ? LEGACY_TAB_ALIASES[value] : undefined;
  if (alias) return { kind: 'tab', tab: alias, canonical: false, focusDividendi: value === 'dividendi' };
  return { kind: 'tab', tab: DEFAULT_SETTINGS_TAB, canonical: false, focusDividendi: false };
}

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

/** Account — the household and the periodic emails (the colour theme and the mode save themselves). */
export interface AccountSlice {
  monthlyEmailEnabled: boolean;
  quarterlyEmailEnabled: boolean;
  semiAnnualEmailEnabled: boolean;
  yearlyEmailEnabled: boolean;
  weeklyBudgetEmailEnabled: boolean;
  monthlyEmailRecipients: string[];
  familyMembers: FamilyMemberDraft[];
}

/** Funzioni — one switch per piece of the app that can exist or not (D-RU19: the stamp duty is a calculation, not a piece). */
export interface FunzioniSlice {
  goalBasedInvestingEnabled: boolean;
  costCentersEnabled: boolean;
  expenseSplitEnabled: boolean;
  spendingRolesEnabled: boolean;
}

/** Cashflow — the rules of the movements: accounts, the fee's category, labor income, the history floor, the dividends' landing. */
export interface CashflowSlice {
  defaultDebitCashAssetId: string;
  defaultCreditCashAssetId: string;
  /** '' = none: the expense form's «Commissione» stays off. */
  transferFeeCategoryId: string;
  transferFeeSubCategoryId: string;
  laborIncomeCategoryIds: string[];
  cashflowHistoryStartYear: number;
  dividendIncomeCategoryId: string;
  dividendIncomeSubCategoryId: string;
  dividendCashAssetId: string;
}

/** Investimenti — how the wealth is measured: the returns' base, the risk-free rate, the stamp duty, the house in the FIRE. */
export interface InvestimentiSlice {
  performanceIncludesPensionFunds: boolean;
  performanceIncludesExcludedAssets: boolean;
  performanceExcludesCash: boolean;
  pensionReturnStartMonth: string;
  /**
   * The rate TYPED by the reader (Calcolo dei rendimenti); `undefined` = follow the ECB estimate
   * (the key is then deleted on «Salva»).
   */
  riskFreeRate: number | undefined;
  stampDutyEnabled: boolean;
  stampDutyRate: number;
  checkingAccountSubCategory: string;
  includePrimaryResidenceInFIRE: boolean;
}

/** The pairs the last «Salva» adapted to keep the correlation matrix valid (R5), by pair index; marked until the next write. */
export type CorrelationCorrections = Record<number, { index: number; written: number; used: number }>;

/**
 * Avanzate (fork) — the Monte Carlo market assumptions both engines read and the IRPEF brackets the
 * state pensions' net is computed with (RP8). `market` holds ONLY what was typed
 * (an undefined field is the default in force); `marketOrigin` says where the loaded numbers came
 * from (`migrated` = a v1 document converted at read, written as v2 by the first «Salva», RQ8).
 */
export interface AvanzateSlice {
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

export interface SettingsSlices {
  account: AccountSlice;
  funzioni: FunzioniSlice;
  cashflow: CashflowSlice;
  investimenti: InvestimentiSlice;
  avanzate: AvanzateSlice;
}

/** The tabs that have a slice «Salva» writes — all five, so every one can carry the dot. */
export type WritableTabId = SettingsTabId;
export const WRITABLE_TABS: readonly WritableTabId[] = SETTINGS_TAB_IDS;

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

  const account: AccountSlice = {
    monthlyEmailEnabled: data.monthlyEmailEnabled ?? false,
    quarterlyEmailEnabled: data.quarterlyEmailEnabled ?? false,
    semiAnnualEmailEnabled: data.semiAnnualEmailEnabled ?? false,
    yearlyEmailEnabled: data.yearlyEmailEnabled ?? false,
    weeklyBudgetEmailEnabled: data.weeklyBudgetEmailEnabled ?? false,
    monthlyEmailRecipients: data.monthlyEmailRecipients ?? [],
    familyMembers: toFamilyMemberDrafts(data.familyMembers),
  };

  const funzioni: FunzioniSlice = {
    goalBasedInvestingEnabled: data.goalBasedInvestingEnabled ?? false,
    costCentersEnabled: data.costCentersEnabled ?? false,
    expenseSplitEnabled: data.expenseSplitEnabled ?? false,
    spendingRolesEnabled: data.spendingRolesEnabled ?? false,
  };

  const cashflow: CashflowSlice = {
    defaultDebitCashAssetId: data.defaultDebitCashAssetId || NO_SELECTION,
    defaultCreditCashAssetId: data.defaultCreditCashAssetId || NO_SELECTION,
    transferFeeCategoryId: data.transferFeeCategoryId || '',
    transferFeeSubCategoryId: data.transferFeeSubCategoryId || '',
    laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
    cashflowHistoryStartYear: data.cashflowHistoryStartYear ?? DEFAULT_HISTORY_START_YEAR,
    dividendIncomeCategoryId: data.dividendIncomeCategoryId || '',
    dividendIncomeSubCategoryId: data.dividendIncomeSubCategoryId || '',
    dividendCashAssetId: data.dividendCashAssetId || NO_SELECTION,
  };

  const investimenti: InvestimentiSlice = {
    performanceIncludesPensionFunds: data.performanceIncludesPensionFunds ?? false,
    performanceIncludesExcludedAssets: data.performanceIncludesExcludedAssets ?? false,
    performanceExcludesCash: data.performanceExcludesCash ?? false,
    pensionReturnStartMonth: data.pensionReturnStartMonth ?? '',
    riskFreeRate: data.riskFreeRate,
    stampDutyEnabled: data.stampDutyEnabled ?? false,
    stampDutyRate: data.stampDutyRate ?? DEFAULT_STAMP_DUTY_RATE,
    checkingAccountSubCategory: data.checkingAccountSubCategory || NO_SELECTION,
    includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE ?? false,
  };

  // Avanzate: the market as the Monte Carlo and the Ventaglio will read it (no commodity list
  // here: the Oro choice stays «never chosen» until the reader makes one, RG).
  const resolvedMarket = resolveMonteCarloMarket(data, []);
  const avanzate: AvanzateSlice = {
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

  return { account, funzioni, cashflow, investimenti, avanzate };
}

// ─── composeSettingsDocument ──────────────────────────────────────────────────────────────

export type ComposeResult =
  | {
      ok: true;
      /** No `targets`: `setSettings` takes its merge branch (RU8, criterion 12). */
      document: AssetAllocationSettingsWrite;
      /**
       * The Avanzate slice as it was written (the correlations corrected, the Oro choice explicit,
       * the legacy format converted) — the new baseline — or `null` when «Salva» wrote none of it.
       */
      avanzate: AvanzateSlice | null;
      /** The correlation pairs the write adapted to keep the matrix valid (R5); empty when none. */
      adaptedPairs: { index: number; written: number; used: number }[];
    }
  | { ok: false; marketProblems: MonteCarloMarketProblem[]; tab: 'avanzate' };

/** What the page knows that the slices do not: the baseline (Avanzate is written only when it differs) and the Oro in force. */
export interface ComposeContext {
  /** The slices as last read or written. */
  saved: SettingsSlices;
  /** The sub-category read as Oro in force: the draft's choice, else the default rule (`resolveAvanzateGold`). */
  effectiveGoldSubCategory: string | null;
}

/**
 * The document «Salva» writes, from the slices — or the first market figure out of range.
 *
 * @param slices - The draft as edited.
 * @param current - The document as it is NOW (the pre-read of «Salva»), for the fields the write
 *   carries through unchanged: the FIRE plan's (withdrawal rate, planned expenses, emergency fund,
 *   dated flows) and the optimizer's objectives. Every one of them is owned by another page.
 * @param context - Without it nothing of Avanzate is written unless a legacy market waits to be converted.
 */
export function composeSettingsDocument(
  slices: SettingsSlices,
  current: AssetAllocationSettings | null,
  context?: ComposeContext
): ComposeResult {
  // Avanzate: the market only when it holds an edit (or a legacy document to convert), the
  // brackets only when they were edited — a «Salva» from another tab never writes either.
  const saved = context?.saved ?? slices;
  const { market, taxBrackets } = slices.avanzate;
  const marketPending = isMarketPending(slices.avanzate, saved.avanzate);
  const taxBracketsDirty = isTaxBracketsDirty(taxBrackets, saved.avanzate.taxBrackets);

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
    if (marketProblems.length > 0) return { ok: false, marketProblems, tab: 'avanzate' };
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

  const { account, funzioni, cashflow, investimenti } = slices;
  // Switching the goals off switches the goal-driven targets off with them (what the Preferenze
  // tile did until RU8). The flag is Strategia's now, so it is written ONLY on that transition:
  // a «Salva» that leaves the goals as they were never touches the source chosen in Strategia
  // (criterion 13: on → off writes both, off → on writes the first alone).
  const goalsSwitchedOff = saved.funzioni.goalBasedInvestingEnabled && !funzioni.goalBasedInvestingEnabled;
  const document: AssetAllocationSettingsWrite = {
    // `userAge` is NOT written from here (D-T5): the age is typed in FIRE › Il mio piano.
    // Present-but-undefined when it follows the ECB estimate: the service's `'x' in settings` guard deletes it.
    riskFreeRate: investimenti.riskFreeRate,
    includePrimaryResidenceInFIRE: investimenti.includePrimaryResidenceInFIRE,
    goalBasedInvestingEnabled: funzioni.goalBasedInvestingEnabled,
    ...(goalsSwitchedOff ? { goalDrivenAllocationEnabled: false } : {}),
    withdrawalRate: current?.withdrawalRate,
    plannedAnnualExpenses: current?.plannedAnnualExpenses,
    fireEmergencyFund: current?.fireEmergencyFund,
    fireCashToInvestPct: current?.fireCashToInvestPct,
    fireDatedFlows: current?.fireDatedFlows,
    dividendIncomeCategoryId: cashflow.dividendIncomeCategoryId || undefined,
    dividendIncomeSubCategoryId: cashflow.dividendIncomeSubCategoryId || undefined,
    dividendCashAssetId: cashflow.dividendCashAssetId !== NO_SELECTION ? cashflow.dividendCashAssetId : undefined,
    defaultDebitCashAssetId: cashflow.defaultDebitCashAssetId !== NO_SELECTION ? cashflow.defaultDebitCashAssetId : undefined,
    defaultCreditCashAssetId: cashflow.defaultCreditCashAssetId !== NO_SELECTION ? cashflow.defaultCreditCashAssetId : undefined,
    transferFeeCategoryId: cashflow.transferFeeCategoryId || undefined,
    transferFeeSubCategoryId: cashflow.transferFeeSubCategoryId || undefined,
    stampDutyEnabled: investimenti.stampDutyEnabled,
    stampDutyRate: investimenti.stampDutyRate,
    checkingAccountSubCategory: investimenti.checkingAccountSubCategory,
    cashflowHistoryStartYear: cashflow.cashflowHistoryStartYear,
    laborIncomeCategoryIds: cashflow.laborIncomeCategoryIds,
    costCentersEnabled: funzioni.costCentersEnabled,
    expenseSplitEnabled: funzioni.expenseSplitEnabled,
    spendingRolesEnabled: funzioni.spendingRolesEnabled,
    performanceIncludesPensionFunds: investimenti.performanceIncludesPensionFunds,
    performanceIncludesExcludedAssets: investimenti.performanceIncludesExcludedAssets,
    performanceExcludesCash: investimenti.performanceExcludesCash,
    // '' = «no month set»: saved as undefined, or pensionReturn would parse it as a date.
    pensionReturnStartMonth: investimenti.pensionReturnStartMonth || undefined,
    monthlyEmailEnabled: account.monthlyEmailEnabled,
    quarterlyEmailEnabled: account.quarterlyEmailEnabled,
    semiAnnualEmailEnabled: account.semiAnnualEmailEnabled,
    yearlyEmailEnabled: account.yearlyEmailEnabled,
    weeklyBudgetEmailEnabled: account.weeklyBudgetEmailEnabled,
    monthlyEmailRecipients: account.monthlyEmailRecipients,
    familyMembers: parseFamilyMemberDrafts(account.familyMembers),
    // The optimizer's objectives are not this page's (edited in Allocazione › Strategia): what the
    // document holds NOW goes back, never the copy this page loaded.
    idealAllocation: current?.idealAllocation,
    ...(marketPayload ? { monteCarloMarket: marketPayload } : {}),
    // The IRPEF brackets: written only when the tab holds edits to them, like the market.
    ...(taxBracketsPayload ? { coastFireTaxBrackets: taxBracketsPayload } : {}),
  };

  let avanzate: AvanzateSlice | null = null;
  let adaptedPairs: { index: number; written: number; used: number }[] = [];
  if (marketPayload && correctedCorrelations) {
    adaptedPairs = changedPairs(market.correlations, correctedCorrelations);
    avanzate = {
      ...slices.avanzate,
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
  return { ok: true, document, avanzate, adaptedPairs };
}

// ─── Avanzate helpers ───────────────────────────────────────────────────────────────────

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
export function isMarketEdited(draft: AvanzateSlice, saved: AvanzateSlice): boolean {
  return marketSnapshotKey(draft.market) !== marketSnapshotKey(saved.market);
}

/**
 * The market has something to write: an edit, or a document still in the old format — the first
 * «Salva» rewrites it as v2 even when nothing was typed (RQ8).
 */
export function isMarketPending(draft: AvanzateSlice, saved: AvanzateSlice): boolean {
  return isMarketEdited(draft, saved) || draft.marketOrigin === 'migrated';
}

/**
 * The sub-categories that can be named «Oro» (the targets as saved — Strategia owns them — then the portfolio)
 * and the one in force — the draft's choice, else the default rule (doc/montecarlo/README.md, RG).
 */
export function resolveAvanzateGold(
  slice: AvanzateSlice,
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
    case 'account': {
      const { familyMembers, monthlyEmailRecipients, ...rest } = slices.account;
      return JSON.stringify({
        ...rest,
        monthlyEmailRecipients: [...monthlyEmailRecipients].sort(),
        familyMembers: familyMembersSnapshot(parseFamilyMemberDrafts(familyMembers)),
      });
    }
    case 'funzioni':
      return JSON.stringify(slices.funzioni);
    case 'cashflow': {
      const { laborIncomeCategoryIds, ...rest } = slices.cashflow;
      return JSON.stringify({ ...rest, laborIncomeCategoryIds: [...laborIncomeCategoryIds].sort() });
    }
    case 'investimenti': {
      const { stampDutyRate, ...rest } = slices.investimenti;
      return JSON.stringify({ ...rest, stampDutyRate: roundToTwoDecimals(stampDutyRate) });
    }
    case 'avanzate':
      return JSON.stringify({
        market: marketSnapshotKey(slices.avanzate.market),
        taxBrackets: buildTaxBracketSnapshotKey(parseTaxBracketDrafts(slices.avanzate.taxBrackets)),
      });
  }
}

/** Whether a tab holds an edit «Salva» would write — the dot on the tab and the bar at the bottom. */
export function isSliceDirty(tab: WritableTabId, draft: SettingsSlices, saved: SettingsSlices): boolean {
  // A legacy market waiting to be converted is a pending write even though nothing was typed (RQ8).
  if (tab === 'avanzate' && draft.avanzate.marketOrigin === 'migrated') return true;
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
  | { type: 'saved'; avanzate?: AvanzateSlice | null }
  | { type: 'account/set'; patch: Partial<AccountSlice> }
  | { type: 'funzioni/set'; patch: Partial<FunzioniSlice> }
  | { type: 'cashflow/set'; patch: Partial<CashflowSlice> }
  | { type: 'investimenti/set'; patch: Partial<InvestimentiSlice> }
  | { type: 'avanzate/set'; patch: Partial<AvanzateSlice> };

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
      // The baseline is what was WRITTEN: Avanzate's market as it was written (corrected, converted).
      const slices = { ...state.slices, ...(action.avanzate ? { avanzate: action.avanzate } : {}) };
      return { ...state, slices, saved: slices };
    }
    case 'account/set':
      return { ...state, slices: { ...state.slices, account: { ...state.slices.account, ...action.patch } } };
    case 'funzioni/set':
      return { ...state, slices: { ...state.slices, funzioni: { ...state.slices.funzioni, ...action.patch } } };
    case 'cashflow/set':
      return { ...state, slices: { ...state.slices, cashflow: { ...state.slices.cashflow, ...action.patch } } };
    case 'investimenti/set':
      return { ...state, slices: { ...state.slices, investimenti: { ...state.slices.investimenti, ...action.patch } } };
    case 'avanzate/set':
      return { ...state, slices: { ...state.slices, avanzate: { ...state.slices.avanzate, ...action.patch } } };
  }
}
