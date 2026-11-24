/**
 * The draft of the class targets — Allocazione › Strategia › Target per classe (RU8, 2026-11-23;
 * doc/allocazione-strategia/README.md § 5.4, D-ST5).
 *
 * Until RU8 the targets were the `allocazione` slice of Impostazioni's ONE draft
 * (lib/utils/settingsDraft.ts). They moved to the page that reads them: the draft is held by
 * Allocazione (`useTargetsDraft`), not by the Strategia tab — Radix unmounts an inactive panel, and
 * a draft inside the tab would be lost by a visit to Bilanciamento. The reducer and its helpers are
 * the old slice's, unchanged in behaviour: the formula settles Azioni/Obbligazioni at every action,
 * an unnamed sub-category row is dropped before validating, the first broken rule names its field.
 *
 * What changed with the move:
 *   - the SOURCE of the targets is one choice (D-ST4): A mano · Formula per età · Dai traguardi. It
 *     writes the two fields of before, `autoCalculateEquityBonds` and `goalDrivenAllocationEnabled`;
 *     no new field (`resolveTargetSource`, `applyTargetSource`);
 *   - the age and the risk-free rate are READ here, never written: the age's editor is FIRE › Il mio
 *     piano (D-T5), the rate's is Impostazioni (Preferenze › Calcolo dei rendimenti until RU9);
 *   - the write is the targets' own (`composeTargetsWrite`): `targets` plus the two source fields.
 *     With `targets` present `setSettings` takes its replace branch, which re-reads the document
 *     just before writing: every other field stays the server's, never this page's copy.
 *
 * Pure: no React, no SDK.
 */

import type { AssetAllocationSettings, AssetAllocationTarget, AssetClass, SubCategoryTarget } from '@/types/assets';
import {
  dropUnnamedSubTargets,
  findTargetProblem,
  type ClassTargetDraft,
  type TargetProblem,
} from '@/lib/utils/allocationTargetValidation';
import { calculateFormulaEquityPercentage, resolveAutoEquityBondsSplit } from '@/lib/utils/equityBondsAutoTargets';

// ─── Identifiers ──────────────────────────────────────────────────────────────────────────

/**
 * The class rows in the order the Target per classe tile prints them — Azioni → Obbligazioni →
 * Commodities → Immobili → Liquidità → Crypto → Trend Following → Carry. Not `ASSET_CLASS_SEQUENCE`
 * (Bilanciamento's order): the two have differed since the editor was written in Impostazioni.
 */
export const TARGET_CLASS_ORDER: readonly AssetClass[] = [
  'equity', 'bonds', 'commodity', 'realestate', 'cash', 'crypto', 'trendFollowing', 'carry',
];

/**
 * Ids of the target fields «Salva i target» can send the focus to (see `revealTargetProblem`). A
 * class's own input keeps the bare class id, which its `aria-label` already names.
 */
export const targetFieldId = {
  classPct: (assetClass: AssetClass) => assetClass,
  subToggle: (assetClass: AssetClass) => `toggle-${assetClass}`,
  subName: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-name`,
  subPct: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-pct`,
  assetName: (assetClass: AssetClass, subIndex: number, assetIndex: number) =>
    `target-${assetClass}-sub-${subIndex}-asset-${assetIndex}-name`,
  assetPct: (assetClass: AssetClass, subIndex: number, assetIndex: number) =>
    `target-${assetClass}-sub-${subIndex}-asset-${assetIndex}-pct`,
  assetAdd: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-asset-add`,
};

/** Where the targets come from (D-ST4): the pill in the tile's aside. */
export type TargetSource = 'manual' | 'formula' | 'goals';

// ─── The slice ────────────────────────────────────────────────────────────────────────────

export interface SpecificAssetDraft {
  name: string;
  targetPercentage: number;
}

export interface SubTargetDraft {
  name: string;
  percentage: number;
  specificAssetsEnabled: boolean;
  specificAssets: SpecificAssetDraft[];
  /** UI only — the asset list open under this row. Never written, never part of the dirty check. */
  expanded: boolean;
}

export interface AssetClassDraft {
  targetPercentage: number;
  subCategoryEnabled: boolean;
  /** The subcategory names, kept equal to the named `subTargets` (the datalist and the Costi select read it). */
  categories: string[];
  subTargets: SubTargetDraft[];
  /** UI only — the class's group open in the tile. */
  expanded: boolean;
}

export interface TargetsSlice {
  /** Read for the formula, never written (its one editor is FIRE › Il mio piano, D-T5). */
  userAge: number | undefined;
  /** The rate TYPED in Impostazioni, read for the formula and never written here; `undefined` = the ECB estimate. */
  riskFreeRate: number | undefined;
  /** The ECB estimate in force (`resolveRiskFreeEstimate`), handed in by the page; never written, never dirty. */
  riskFreeEstimate?: number;
  autoCalculate: boolean;
  goalDrivenAllocationEnabled: boolean;
  cashUseFixedAmount: boolean;
  cashFixedAmount: number;
  classes: Record<AssetClass, AssetClassDraft>;
}

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

/** A class's rows from its saved target entry, in both saved shapes (number, SubCategoryTarget). */
function toSubTargetDrafts(subTargets: AssetAllocationTarget[string]['subTargets']): SubTargetDraft[] {
  if (!subTargets) return [];
  return Object.entries(subTargets).map(([name, value]) =>
    typeof value === 'number'
      ? { name, percentage: value, specificAssetsEnabled: false, specificAssets: [], expanded: false }
      : {
          name,
          percentage: value.targetPercentage,
          specificAssetsEnabled: value.specificAssetsEnabled || false,
          specificAssets: (value.specificAssets || []).map((asset) => ({
            name: asset.name,
            targetPercentage: asset.targetPercentage,
          })),
          expanded: false,
        }
  );
}

/** Every class row from a targets map; a class the map does not name is a 0% row with no rows. */
export function targetsToClassDrafts(targets: AssetAllocationTarget): Record<AssetClass, AssetClassDraft> {
  const classes = {} as Record<AssetClass, AssetClassDraft>;
  for (const assetClass of TARGET_CLASS_ORDER) {
    const entry = targets[assetClass];
    classes[assetClass] = {
      targetPercentage: entry?.targetPercentage || 0,
      subCategoryEnabled: entry?.subCategoryConfig?.enabled || false,
      categories: entry?.subCategoryConfig?.categories || [],
      subTargets: toSubTargetDrafts(entry?.subTargets),
      expanded: false,
    };
  }
  return classes;
}

/**
 * Sum of every class target OUTSIDE the auto-calculated Azioni/Obbligazioni pair. Cash drops out
 * when it is a fixed euro amount: it then lives outside the percentage budget entirely.
 */
export function sumOtherClassTargets(slice: Pick<TargetsSlice, 'classes' | 'cashUseFixedAmount'>): number {
  return TARGET_CLASS_ORDER
    .filter((assetClass) => assetClass !== 'equity' && assetClass !== 'bonds')
    .filter((assetClass) => !(assetClass === 'cash' && slice.cashUseFixedAmount))
    .reduce((sum, assetClass) => sum + (slice.classes[assetClass]?.targetPercentage || 0), 0);
}

/** Σ of the class targets, cash excluded when it is a fixed amount — the tile's big number. */
export function sumClassTargets(slice: Pick<TargetsSlice, 'classes' | 'cashUseFixedAmount'>): number {
  return TARGET_CLASS_ORDER.reduce((sum, assetClass) => {
    if (assetClass === 'cash' && slice.cashUseFixedAmount) return sum;
    return sum + (slice.classes[assetClass]?.targetPercentage || 0);
  }, 0);
}

/** The rate the formula reads: the typed one, else the ECB estimate; `undefined` until one exists. */
export function effectiveRiskFreeRate(slice: Pick<TargetsSlice, 'riskFreeRate' | 'riskFreeEstimate'>): number | undefined {
  return slice.riskFreeRate ?? slice.riskFreeEstimate;
}

/** The formula's pair for the slice, or `null` while an input is missing. */
export function resolveFormulaSplit(slice: TargetsSlice): { equityPercentage: number; bondsPercentage: number } | null {
  const riskFreeRate = effectiveRiskFreeRate(slice);
  if (slice.userAge === undefined || riskFreeRate === undefined) return null;
  return resolveAutoEquityBondsSplit(calculateFormulaEquityPercentage(slice.userAge, riskFreeRate), sumOtherClassTargets(slice));
}

/**
 * With the formula on, Azioni and Obbligazioni are a function of age, risk-free rate and the other
 * classes: every change to the slice settles the pair here, in the reducer, so the view never holds
 * a frame where the inputs moved and the pair did not (under «Dai traguardi» too, as the Impostazioni
 * slice did: the flag is kept and read again when the goals stop ruling). Same object when nothing moved.
 */
function settleAutoCalculatedPair(slice: TargetsSlice): TargetsSlice {
  if (!slice.autoCalculate) return slice;
  const split = resolveFormulaSplit(slice);
  if (!split) return slice;
  const { equity, bonds } = slice.classes;
  if (equity.targetPercentage === split.equityPercentage && bonds.targetPercentage === split.bondsPercentage) return slice;
  return {
    ...slice,
    classes: {
      ...slice.classes,
      equity: { ...equity, targetPercentage: split.equityPercentage },
      bonds: { ...bonds, targetPercentage: split.bondsPercentage },
    },
  };
}

/** The target tree as the validation module sees it. */
export function toClassTargetDrafts(slice: TargetsSlice): ClassTargetDraft[] {
  return TARGET_CLASS_ORDER.map((assetClass) => ({
    assetClass,
    subCategoryEnabled: slice.classes[assetClass]?.subCategoryEnabled ?? false,
    subTargets: slice.classes[assetClass]?.subTargets ?? [],
  }));
}

/** The first rule «Salva i target» would refuse on the slice as it would be written. */
export function findSliceTargetProblem(slice: TargetsSlice): TargetProblem | null {
  return findTargetProblem(sumClassTargets(slice), dropUnnamedSubTargets(toClassTargetDrafts(slice)));
}

// ─── The source (D-ST4) ───────────────────────────────────────────────────────────────────

/**
 * The source the two saved fields name. «Dai traguardi» only while the goals exist
 * (`goalBasedInvestingEnabled`): with the goals off `resolveEffectiveTargets` ignores the flag too.
 */
export function resolveTargetSource(slice: Pick<TargetsSlice, 'autoCalculate' | 'goalDrivenAllocationEnabled'>, goalsEnabled: boolean): TargetSource {
  if (goalsEnabled && slice.goalDrivenAllocationEnabled) return 'goals';
  return slice.autoCalculate ? 'formula' : 'manual';
}

/**
 * The two fields a choice of the pill writes: A mano = both off; Formula = the formula on, the goals
 * off; Dai traguardi = the goals on and the formula's flag as it was (not read while the goals rule).
 */
export function applyTargetSource(slice: TargetsSlice, source: TargetSource): TargetsSlice {
  if (source === 'manual') return { ...slice, autoCalculate: false, goalDrivenAllocationEnabled: false };
  if (source === 'formula') return { ...slice, autoCalculate: true, goalDrivenAllocationEnabled: false };
  return { ...slice, goalDrivenAllocationEnabled: true };
}

// ─── Read and write ───────────────────────────────────────────────────────────────────────

/**
 * The slice from the saved document — the seed at open and at «Annulla».
 *
 * @param document - `getSettings`' answer; `null` when the account has no document yet.
 * @param fallbackTargets - The targets a document without them starts from (`getDefaultTargets()`,
 *   handed in so this module stays SDK-free).
 */
export function sliceTargets(document: AssetAllocationSettings | null, fallbackTargets: AssetAllocationTarget): TargetsSlice {
  const data = document ?? ({} as Partial<AssetAllocationSettings>);
  const targets = data.targets || fallbackTargets;
  const cashTarget = targets['cash'];
  return settleAutoCalculatedPair({
    userAge: data.userAge,
    riskFreeRate: data.riskFreeRate,
    // The explicit flag when saved; otherwise the presence of both inputs, for accounts that never
    // toggled the switch (the old form's backward-compat rule).
    autoCalculate: data.autoCalculateEquityBonds ?? (data.userAge !== undefined && data.riskFreeRate !== undefined),
    goalDrivenAllocationEnabled: data.goalDrivenAllocationEnabled ?? false,
    cashUseFixedAmount: cashTarget?.useFixedAmount || false,
    cashFixedAmount: cashTarget?.fixedAmount || 0,
    classes: targetsToClassDrafts(targets),
  });
}

/**
 * The slice as «Salva i target» writes it: a subcategory row with no name is one the reader started
 * and left, so it is dropped (and the class's `categories` follow). Same object when nothing went.
 */
export function cleanTargetsSlice(slice: TargetsSlice): TargetsSlice {
  let changed = false;
  const classes = { ...slice.classes };
  for (const assetClass of TARGET_CLASS_ORDER) {
    const draft = slice.classes[assetClass];
    if (!draft?.subCategoryEnabled) continue;
    const kept = draft.subTargets.filter((target) => target.name.trim() !== '');
    if (kept.length === draft.subTargets.length) continue;
    changed = true;
    classes[assetClass] = { ...draft, subTargets: kept, categories: kept.map((target) => target.name) };
  }
  return changed ? { ...slice, classes } : slice;
}

/** The targets map from the (cleaned) slice — both saved shapes, as the Impostazioni form wrote them. */
export function composeTargets(slice: TargetsSlice): AssetAllocationTarget {
  const targets: AssetAllocationTarget = {};
  for (const assetClass of TARGET_CLASS_ORDER) {
    const draft = slice.classes[assetClass];
    targets[assetClass] = {
      targetPercentage: draft.targetPercentage,
      ...(assetClass === 'cash' && {
        useFixedAmount: slice.cashUseFixedAmount,
        fixedAmount: slice.cashFixedAmount,
      }),
      subCategoryConfig: {
        enabled: draft.subCategoryEnabled,
        // Always derived from the rows: a renamed or deleted row never survives in `categories`.
        categories: draft.subCategoryEnabled ? draft.subTargets.map((target) => target.name).filter((name) => name !== '') : [],
      },
    };
    if (draft.subCategoryEnabled && draft.subTargets.length > 0) {
      // Rebuilt from scratch so a deleted or renamed row is gone from the document too.
      targets[assetClass].subTargets = draft.subTargets.reduce<Record<string, number | SubCategoryTarget>>((acc, target) => {
        acc[target.name] =
          target.specificAssetsEnabled && target.specificAssets.length > 0
            ? {
                targetPercentage: target.percentage,
                specificAssetsEnabled: true,
                specificAssets: target.specificAssets.map((asset) => ({ name: asset.name, targetPercentage: asset.targetPercentage })),
              }
            : target.percentage;
        return acc;
      }, {});
    }
  }
  return targets;
}

/** What «Salva i target» hands to `setSettings`: the targets and the two source fields, nothing else. */
export type TargetsWrite = Required<Pick<AssetAllocationSettings, 'targets' | 'autoCalculateEquityBonds' | 'goalDrivenAllocationEnabled'>>;

export type TargetsComposeResult =
  | { ok: true; write: TargetsWrite; cleaned: TargetsSlice }
  | { ok: false; problem: TargetProblem; cleaned: TargetsSlice };

/** The write of «Salva i target» — or the first broken rule. Never the age nor the rate (owned elsewhere). */
export function composeTargetsWrite(slice: TargetsSlice): TargetsComposeResult {
  const cleaned = cleanTargetsSlice(slice);
  const problem = findTargetProblem(sumClassTargets(cleaned), toClassTargetDrafts(cleaned));
  if (problem) return { ok: false, problem, cleaned };
  return {
    ok: true,
    cleaned,
    write: {
      targets: composeTargets(cleaned),
      // Stored explicitly so «A mano» survives a reload (derived from age + rate it could not be chosen).
      autoCalculateEquityBonds: cleaned.autoCalculate,
      goalDrivenAllocationEnabled: cleaned.goalDrivenAllocationEnabled,
    },
  };
}

// ─── The dirty check ──────────────────────────────────────────────────────────────────────

/**
 * The persisted content of the slice as a comparable string: percentages at two decimals (what is
 * written), the UI-only flags (`expanded`) and the read-only inputs (age, rate) left out.
 */
function snapshotTargets(slice: TargetsSlice): string {
  return JSON.stringify({
    autoCalculate: slice.autoCalculate,
    goalDrivenAllocationEnabled: slice.goalDrivenAllocationEnabled,
    cashUseFixedAmount: slice.cashUseFixedAmount,
    cashFixedAmount: roundToTwoDecimals(slice.cashFixedAmount),
    classes: TARGET_CLASS_ORDER.map((assetClass) => {
      const draft = slice.classes[assetClass];
      return {
        assetClass,
        targetPercentage: roundToTwoDecimals(draft?.targetPercentage || 0),
        subCategoryEnabled: draft?.subCategoryEnabled || false,
        categories: draft?.categories || [],
        subTargets: (draft?.subTargets || []).map((target) => ({
          name: target.name,
          percentage: roundToTwoDecimals(target.percentage),
          specificAssetsEnabled: target.specificAssetsEnabled,
          specificAssets: target.specificAssets.map((asset) => ({
            name: asset.name,
            targetPercentage: roundToTwoDecimals(asset.targetPercentage),
          })),
        })),
      };
    }),
  });
}

/** Whether the draft holds an edit «Salva i target» would write — the dot on Strategia and the bar. */
export function isTargetsDirty(draft: TargetsSlice, saved: TargetsSlice): boolean {
  return snapshotTargets(draft) !== snapshotTargets(saved);
}

// ─── revealTargetProblem ──────────────────────────────────────────────────────────────────

/**
 * Where «Salva i target» takes the reader for a broken rule: the class's group opened (and the
 * subcategory's asset list, for an asset rule) in the returned slice, and the id of the field to
 * focus. The page dispatches the slice, shows Strategia and sets the pending focus; the tile
 * consumes it once mounted.
 */
export function revealTargetProblem(problem: TargetProblem, slice: TargetsSlice): { slice: TargetsSlice; fieldId: string } {
  if (problem.kind === 'total-below-100') {
    // The first class the reader can type into (the formula owns Azioni/Obbligazioni when on).
    const editable = TARGET_CLASS_ORDER.find((assetClass) => !(slice.autoCalculate && (assetClass === 'equity' || assetClass === 'bonds')));
    return { slice, fieldId: targetFieldId.classPct(editable ?? TARGET_CLASS_ORDER[0]) };
  }

  const { assetClass } = problem;
  const draft = slice.classes[assetClass];
  const subTargets = [...draft.subTargets];
  let fieldId: string;
  if (problem.kind === 'sub-total') {
    // The first row as the list shows it (sorted by name), so the focus lands at the top.
    const firstShown = subTargets
      .map((target, index) => ({ name: target.name, index }))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    fieldId = firstShown ? targetFieldId.subPct(assetClass, firstShown.index) : targetFieldId.subToggle(assetClass);
  } else if (problem.kind === 'sub-name-duplicate') {
    fieldId = targetFieldId.subName(assetClass, problem.subIndex);
  } else {
    subTargets[problem.subIndex] = { ...subTargets[problem.subIndex], expanded: true };
    fieldId =
      problem.kind === 'specific-empty'
        ? targetFieldId.assetAdd(assetClass, problem.subIndex)
        : problem.kind === 'specific-total'
          ? targetFieldId.assetPct(assetClass, problem.subIndex, 0)
          : problem.kind === 'specific-out-of-range'
            ? targetFieldId.assetPct(assetClass, problem.subIndex, problem.assetIndex)
            : targetFieldId.assetName(assetClass, problem.subIndex, problem.assetIndex);
  }
  return {
    slice: { ...slice, classes: { ...slice.classes, [assetClass]: { ...draft, expanded: true, subTargets } } },
    fieldId,
  };
}

// ─── The reducer ──────────────────────────────────────────────────────────────────────────

export interface TargetsDraft {
  /** The slice as edited. */
  slice: TargetsSlice;
  /** The slice as last read or written — the other side of the dirty comparison. */
  saved: TargetsSlice;
  /** `true` once a document has been read: before that nothing can be dirty and nothing is saved. */
  loaded: boolean;
  /** A field id «Salva i target» wants focused; the tile consumes it once mounted. */
  pendingFocus: string | null;
}

export type TargetsDraftAction =
  | { type: 'reset'; document: AssetAllocationSettings | null; fallbackTargets: AssetAllocationTarget }
  | { type: 'saved'; cleaned: TargetsSlice }
  | { type: 'set'; patch: Partial<Pick<TargetsSlice, 'cashUseFixedAmount' | 'cashFixedAmount'>> }
  | { type: 'setSource'; source: TargetSource }
  | { type: 'setClass'; assetClass: AssetClass; patch: Partial<AssetClassDraft> }
  | { type: 'replace'; slice: TargetsSlice }
  /** «Ripristina default»: the FACTORY targets into the draft, not saved. */
  | { type: 'replaceTargets'; targets: AssetAllocationTarget }
  /** The ECB estimate arrived or moved: both sides take it, so it is never an edit. */
  | { type: 'riskFreeEstimate'; value: number }
  | { type: 'focus'; fieldId: string }
  | { type: 'focusConsumed' };

/** The draft before the first read: defaults, nothing dirty, nothing to focus. */
export function createTargetsDraft(): TargetsDraft {
  const slice = sliceTargets(null, {});
  return { slice, saved: slice, loaded: false, pendingFocus: null };
}

function withSlice(state: TargetsDraft, slice: TargetsSlice): TargetsDraft {
  const settled = settleAutoCalculatedPair(slice);
  return settled === state.slice ? state : { ...state, slice: settled };
}

export function targetsDraftReducer(state: TargetsDraft, action: TargetsDraftAction): TargetsDraft {
  switch (action.type) {
    case 'reset': {
      // A re-read replaces BOTH sides: the tile shows the saved document and nothing is dirty.
      const fresh = sliceTargets(action.document, action.fallbackTargets);
      // The estimate is not in the document: a re-read keeps the one the page already handed in.
      const estimate = state.slice.riskFreeEstimate;
      const slice = estimate === undefined ? fresh : settleAutoCalculatedPair({ ...fresh, riskFreeEstimate: estimate });
      return { slice, saved: slice, loaded: true, pendingFocus: null };
    }
    case 'saved':
      // The baseline is what was WRITTEN (the cleaned tree), so a dropped empty row leaves nothing unsaved.
      return { ...state, slice: action.cleaned, saved: action.cleaned };
    case 'set':
      return withSlice(state, { ...state.slice, ...action.patch });
    case 'setSource':
      return withSlice(state, applyTargetSource(state.slice, action.source));
    case 'setClass': {
      const { classes } = state.slice;
      return withSlice(state, { ...state.slice, classes: { ...classes, [action.assetClass]: { ...classes[action.assetClass], ...action.patch } } });
    }
    case 'replace':
      return withSlice(state, action.slice);
    case 'replaceTargets': {
      // The FACTORY targets — the cash fixed-amount pair follows them.
      const cash = action.targets['cash'];
      return withSlice(state, {
        ...state.slice,
        cashUseFixedAmount: cash?.useFixedAmount || false,
        cashFixedAmount: cash?.fixedAmount || 0,
        classes: targetsToClassDrafts(action.targets),
      });
    }
    case 'riskFreeEstimate': {
      if (state.slice.riskFreeEstimate === action.value && state.saved.riskFreeEstimate === action.value) return state;
      return {
        ...state,
        slice: settleAutoCalculatedPair({ ...state.slice, riskFreeEstimate: action.value }),
        saved: settleAutoCalculatedPair({ ...state.saved, riskFreeEstimate: action.value }),
      };
    }
    case 'focus':
      return { ...state, pendingFocus: action.fieldId };
    case 'focusConsumed':
      return state.pendingFocus === null ? state : { ...state, pendingFocus: null };
  }
}
