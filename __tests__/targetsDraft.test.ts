/**
 * The class targets' draft (lib/utils/targetsDraft.ts) — Allocazione › Strategia since RU8
 * (doc/allocazione-strategia/README.md § 5.4, D-ST4, D-ST5).
 *
 * PERCHÉ ESISTE: the targets left Impostazioni's ONE draft for a draft of their own, held by the
 * Allocazione page. The cases that pinned the old `allocazione` slice in `settingsDraft.test.ts`
 * moved here with the same fixture (`FULL_PAGE_SETTINGS`): `composeTargets ∘ sliceTargets ≡ targets`,
 * the formula settled at every action, the cleaned tree as the new baseline, the focus on the
 * broken field. New with RU8: the source of the targets is ONE choice that writes the two fields of
 * before (D-ST4), and the write carries ONLY the targets and those two fields — never the age nor the
 * risk-free rate, whose editors are elsewhere.
 *
 * Figures are the fixture's, invented and round (WORKFLOW.md rule 7).
 */
import { describe, expect, it } from 'vitest';

import {
  applyTargetSource,
  cleanTargetsSlice,
  composeTargetsWrite,
  createTargetsDraft,
  isTargetsDirty,
  resolveFormulaSplit,
  resolveTargetSource,
  revealTargetProblem,
  sliceTargets,
  targetFieldId,
  targetsDraftReducer,
  type TargetsDraft,
} from '@/lib/utils/targetsDraft';
import type { AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';
import { FULL_PAGE_SETTINGS } from './fixtures/storedSettings';

/** `getDefaultTargets()` of the service, without the service (its module loads the SDK). */
const DEFAULT_TARGETS: AssetAllocationTarget = {
  equity: { targetPercentage: 60, subCategoryConfig: { enabled: false, categories: [] } },
  bonds: { targetPercentage: 40, subCategoryConfig: { enabled: false, categories: ['Governativi'] } },
  cash: { targetPercentage: 0, useFixedAmount: false, fixedAmount: 0, subCategoryConfig: { enabled: false, categories: ['Conto corrente'] } },
};

const loaded = (document: AssetAllocationSettings | null = FULL_PAGE_SETTINGS): TargetsDraft =>
  targetsDraftReducer(createTargetsDraft(), { type: 'reset', document, fallbackTargets: DEFAULT_TARGETS });

function writeOf(draft: TargetsDraft) {
  const result = composeTargetsWrite(draft.slice);
  if (!result.ok) throw new Error(`refused: ${result.problem.kind}`);
  return result;
}

describe('sliceTargets ∘ composeTargetsWrite — the identity', () => {
  it('gives back the saved targets and the two source fields, nothing else', () => {
    const { write } = writeOf(loaded());

    expect(write.targets).toEqual(FULL_PAGE_SETTINGS.targets);
    expect(write.autoCalculateEquityBonds).toBe(false);
    expect(write.goalDrivenAllocationEnabled).toBe(true);
    // The age is FIRE › Il mio piano's, the rate Impostazioni's: read here, never written.
    expect(Object.keys(write).sort()).toEqual(['autoCalculateEquityBonds', 'goalDrivenAllocationEnabled', 'targets']);
  });

  it('seeds a brand-new account from the fallback targets', () => {
    const { slice } = loaded(null);
    expect(slice.classes.equity.targetPercentage).toBe(60);
    expect(slice.classes.bonds.categories).toEqual(['Governativi']);
    expect(slice.classes.crypto).toEqual({ targetPercentage: 0, subCategoryEnabled: false, categories: [], subTargets: [], expanded: false });
    expect(slice.autoCalculate).toBe(false);
    expect(slice.goalDrivenAllocationEnabled).toBe(false);
  });

  it('derives the formula flag from age and rate when it was never saved', () => {
    const { autoCalculateEquityBonds: _flag, ...legacy } = FULL_PAGE_SETTINGS;
    void _flag;
    expect(sliceTargets(legacy, DEFAULT_TARGETS).autoCalculate).toBe(true);
    expect(sliceTargets({ ...legacy, riskFreeRate: undefined }, DEFAULT_TARGETS).autoCalculate).toBe(false);
  });
});

describe('the formula', () => {
  it('settles Azioni and Obbligazioni when the source is the formula', () => {
    // 125 − 41 − 3,25 × 5 = 67,75 of equity; the other classes (5 + 4 + 7,5 + 6 + 2, cash fixed) take 24,5 of it.
    const slice = sliceTargets({ ...FULL_PAGE_SETTINGS, autoCalculateEquityBonds: true, goalDrivenAllocationEnabled: false }, DEFAULT_TARGETS);
    expect(slice.classes.equity.targetPercentage).toBe(43.25);
    expect(slice.classes.bonds.targetPercentage).toBe(32.25);
  });

  it('re-settles the pair on every edit, and the slice moves only what it must', () => {
    const on = targetsDraftReducer(loaded(), { type: 'setSource', source: 'formula' });
    expect(on.slice.classes.equity.targetPercentage).toBe(43.25);

    // Crypto 7,5 → 10 takes 2,5 more out of Azioni; Obbligazioni keep the formula's residual.
    const crypto = targetsDraftReducer(on, { type: 'setClass', assetClass: 'crypto', patch: { targetPercentage: 10 } });
    expect(crypto.slice.classes.equity.targetPercentage).toBe(40.75);
    expect(crypto.slice.classes.bonds.targetPercentage).toBe(32.25);
  });

  it('follows the ECB estimate while no rate is typed, and its arrival is not an edit', () => {
    const doc = { userAge: 40, autoCalculateEquityBonds: true, targets: {} } as AssetAllocationSettings;
    const next = targetsDraftReducer(loaded(doc), { type: 'riskFreeEstimate', value: 3 });
    expect(isTargetsDirty(next.slice, next.saved)).toBe(false);
    // 125 − 40 − 3 × 5 = 70
    expect(resolveFormulaSplit(next.slice)?.equityPercentage).toBe(70);
    // A re-read keeps the estimate the page handed in.
    const reread = targetsDraftReducer(next, { type: 'reset', document: doc, fallbackTargets: {} });
    expect(reread.slice.riskFreeEstimate).toBe(3);
  });
});

describe('the source (D-ST4)', () => {
  it('reads the two saved fields as one choice; «Dai traguardi» only with the goals on', () => {
    expect(resolveTargetSource({ autoCalculate: false, goalDrivenAllocationEnabled: false }, true)).toBe('manual');
    expect(resolveTargetSource({ autoCalculate: true, goalDrivenAllocationEnabled: false }, true)).toBe('formula');
    expect(resolveTargetSource({ autoCalculate: true, goalDrivenAllocationEnabled: true }, true)).toBe('goals');
    // Goals off: the flag is not read (resolveEffectiveTargets ignores it too).
    expect(resolveTargetSource({ autoCalculate: false, goalDrivenAllocationEnabled: true }, false)).toBe('manual');
  });

  it('writes the fields of before: manual both off, formula on with goals off, goals on with the formula as it was', () => {
    const { slice } = loaded();
    expect(applyTargetSource(slice, 'manual')).toMatchObject({ autoCalculate: false, goalDrivenAllocationEnabled: false });
    expect(applyTargetSource(slice, 'formula')).toMatchObject({ autoCalculate: true, goalDrivenAllocationEnabled: false });
    expect(applyTargetSource({ ...slice, autoCalculate: true, goalDrivenAllocationEnabled: false }, 'goals')).toMatchObject({
      autoCalculate: true,
      goalDrivenAllocationEnabled: true,
    });
  });

  it('criterion 10: «Formula per età» saved writes autoCalculateEquityBonds true', () => {
    const formula = targetsDraftReducer(loaded(), { type: 'setSource', source: 'formula' });
    expect(isTargetsDirty(formula.slice, formula.saved)).toBe(true);
    const { write } = writeOf(formula);
    expect(write.autoCalculateEquityBonds).toBe(true);
    expect(write.goalDrivenAllocationEnabled).toBe(false);
  });
});

describe('composeTargetsWrite — the first broken rule', () => {
  it('refuses a group that does not add up', () => {
    const draft = loaded();
    const commodity = draft.slice.classes.commodity;
    const edited = targetsDraftReducer(draft, {
      type: 'setClass',
      assetClass: 'commodity',
      patch: { subTargets: [{ ...commodity.subTargets[0], percentage: 90 }] },
    });
    const result = composeTargetsWrite(edited.slice);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toEqual({ kind: 'sub-total', assetClass: 'commodity', total: 90 });
  });

  it('criterion 8: a total of 95 is refused before any write', () => {
    // 55,5 + 20 + 5 + 4 + 7,5 + 6 + 2 = 100 (cash fixed); crypto 7,5 → 2,5 leaves 95.
    const edited = targetsDraftReducer(loaded(), { type: 'setClass', assetClass: 'crypto', patch: { targetPercentage: 2.5 } });
    const result = composeTargetsWrite(edited.slice);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toEqual({ kind: 'total-below-100', total: 95 });
  });

  it('drops an unnamed sub-category row and hands the cleaned tree back as the new baseline', () => {
    const draft = loaded();
    const equity = draft.slice.classes.equity;
    const withEmptyRow = targetsDraftReducer(draft, {
      type: 'setClass',
      assetClass: 'equity',
      patch: { subTargets: [...equity.subTargets, { name: '  ', percentage: 0, specificAssetsEnabled: false, specificAssets: [], expanded: false }] },
    });
    const result = writeOf(withEmptyRow);

    expect(result.write.targets.equity.subTargets).toEqual(FULL_PAGE_SETTINGS.targets.equity.subTargets);
    expect(result.cleaned.classes.equity.subTargets).toHaveLength(2);
    expect(cleanTargetsSlice(result.cleaned)).toBe(result.cleaned);
    const saved = targetsDraftReducer(withEmptyRow, { type: 'saved', cleaned: result.cleaned });
    expect(isTargetsDirty(saved.slice, saved.saved)).toBe(false);
  });
});

describe('isTargetsDirty — the dot on Strategia', () => {
  it('is false as read, and ignores an opened group and float noise', () => {
    const draft = loaded();
    expect(isTargetsDirty(draft.slice, draft.saved)).toBe(false);
    const opened = targetsDraftReducer(draft, { type: 'setClass', assetClass: 'equity', patch: { expanded: true, targetPercentage: 55.5 + 1e-12 } });
    expect(isTargetsDirty(opened.slice, opened.saved)).toBe(false);
  });

  it('sees a renamed sub-target and a changed specific asset', () => {
    const draft = loaded();
    const equity = draft.slice.classes.equity;
    const renamed = targetsDraftReducer(draft, { type: 'setClass', assetClass: 'equity', patch: { subTargets: [{ ...equity.subTargets[1], name: 'Mid Cap' }, equity.subTargets[0]] } });
    const asset = targetsDraftReducer(draft, {
      type: 'setClass',
      assetClass: 'equity',
      patch: { subTargets: [{ ...equity.subTargets[0], specificAssets: [{ name: 'SWDA', targetPercentage: 61 }, { name: 'VWCE', targetPercentage: 39 }] }, equity.subTargets[1]] },
    });
    expect(isTargetsDirty(renamed.slice, renamed.saved)).toBe(true);
    expect(isTargetsDirty(asset.slice, asset.saved)).toBe(true);
  });

  it('criterion 9: «Ripristina default» puts the factory targets in the draft, the cash pair with them, unsaved', () => {
    const reset = targetsDraftReducer(loaded(), { type: 'replaceTargets', targets: DEFAULT_TARGETS });
    expect(reset.slice.classes.equity.targetPercentage).toBe(60);
    expect(reset.slice.cashUseFixedAmount).toBe(false);
    expect(reset.slice.cashFixedAmount).toBe(0);
    expect(reset.slice.userAge).toBe(41);
    expect(isTargetsDirty(reset.slice, reset.saved)).toBe(true);
  });
});

describe('revealTargetProblem — where «Salva i target» takes the reader', () => {
  const { slice } = loaded();

  it('opens the class and points at the first row as shown for a group that does not add up', () => {
    const { slice: opened, fieldId } = revealTargetProblem({ kind: 'sub-total', assetClass: 'equity', total: 90 }, slice);
    expect(opened.classes.equity.expanded).toBe(true);
    // Rows are listed by name: «Small Cap» (index 1) comes before «World» (index 0).
    expect(fieldId).toBe('target-equity-sub-1-pct');
    expect(slice.classes.equity.expanded).toBe(false);
  });

  it('opens the sub-category’s asset list too for an asset rule', () => {
    const { slice: opened, fieldId } = revealTargetProblem({ kind: 'specific-empty', assetClass: 'equity', subIndex: 0, subName: 'World' }, slice);
    expect(opened.classes.equity.subTargets[0].expanded).toBe(true);
    expect(fieldId).toBe('target-equity-sub-0-asset-add');
  });

  it('points at the first editable class when the total is short', () => {
    expect(revealTargetProblem({ kind: 'total-below-100', total: 80 }, slice).fieldId).toBe('equity');
    expect(revealTargetProblem({ kind: 'total-below-100', total: 80 }, { ...slice, autoCalculate: true }).fieldId).toBe('commodity');
  });

  it('holds the focus until the tile consumes it', () => {
    const focused = targetsDraftReducer(createTargetsDraft(), { type: 'focus', fieldId: targetFieldId.subPct('equity', 1) });
    expect(focused.pendingFocus).toBe('target-equity-sub-1-pct');
    const consumed = targetsDraftReducer(focused, { type: 'focusConsumed' });
    expect(consumed.pendingFocus).toBeNull();
    expect(targetsDraftReducer(consumed, { type: 'focusConsumed' })).toBe(consumed);
  });
});
