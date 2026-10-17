/**
 * The settings draft (lib/utils/settingsDraft.ts) — the ONE reducer behind Impostazioni's six
 * tabs since 2026-10-08.
 *
 * PERCHÉ ESISTE: the page used to hold 70 `useState`s; splitting it into six views means every
 * field now travels slice → view → patch → compose, and a field that one of those steps forgets
 * is written as a default with a green toast — the bug of 2026-09-25, when «Salva» dropped the
 * allocation sub-targets. So the identity `composeSettingsDocument(sliceSettings(doc), doc)
 * ≡ doc` is pinned on a document that carries EVERY field the page writes, plus the round-trip
 * fixture the service is held to; the dirty check and the focus-across-tabs plumbing are pinned
 * beside it.
 *
 * FORK GATE S1 (tenth realignment, T3, doc/allineamento-upstream/README.md § 5): «Salva» rebuilds the
 * document from the slices, so every field the fork keeps on that document must either have a
 * slice or be carried through from the pre-read — the FIRE plan's, the optimizer's, the Monte
 * Carlo market, the IRPEF brackets, the age. The last describe pins each of them; the same
 * document is then run through the real `setSettings` in `settingsRoundTrip.test.ts`.
 *
 * REGRESSION GUARD, seen red (2026-10-08): `dividendCashAssetId` removed from the dividendi slice
 * and from `composeSettingsDocument` (the identity on both fixtures); `spendingRolesEnabled`
 * removed from the spese slice (idem).
 */
import { describe, expect, it, vi } from 'vitest';

// The IRPEF brackets' draft helpers live in coastFireView, which drags in the Firebase chain
// (fireService → chartService): mocked as every test of that module does.
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

import {
  cleanAllocazioneSlice,
  composeSettingsDocument,
  createSettingsDraft,
  isSliceDirty,
  resolveSimulazioniGold,
  revealTargetProblem,
  settingsDraftReducer,
  sliceSettings,
  targetFieldId,
  type SettingsSlices,
} from '@/lib/utils/settingsDraft';
import type { AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';
import {
  FULL_PAGE_SETTINGS,
  STORED_DATED_FLOWS,
  STORED_IDEAL_ALLOCATION,
  STORED_MONTE_CARLO_MARKET,
  STORED_SETTINGS,
  STORED_TAX_BRACKETS,
} from './fixtures/storedSettings';

/** `getDefaultTargets()` of the service, without the service (its module loads the SDK). */
const DEFAULT_TARGETS: AssetAllocationTarget = {
  equity: { targetPercentage: 60, subCategoryConfig: { enabled: false, categories: [] } },
  bonds: { targetPercentage: 40, subCategoryConfig: { enabled: false, categories: ['Governativi'] } },
  cash: { targetPercentage: 0, useFixedAmount: false, fixedAmount: 0, subCategoryConfig: { enabled: false, categories: ['Conto corrente'] } },
};

/**
 * Every key a CLEAN «Salva» hands to `setSettings` — the write surface of the page, as a checklist.
 * Not here, on purpose: `userAge` (read for the formula, its one editor is FIRE › Il mio piano) and
 * `monteCarloMarket` / `coastFireTaxBrackets` (written only when the Simulazioni tab holds an edit).
 */
const WRITTEN_KEYS = [
  'autoCalculateEquityBonds', 'cashflowHistoryStartYear', 'checkingAccountSubCategory', 'costCentersEnabled',
  'defaultCreditCashAssetId', 'defaultDebitCashAssetId', 'dividendCashAssetId', 'dividendIncomeCategoryId',
  'dividendIncomeSubCategoryId', 'expenseSplitEnabled', 'familyMembers', 'fireCashToInvestPct', 'fireDatedFlows',
  'fireEmergencyFund', 'goalBasedInvestingEnabled',
  'goalDrivenAllocationEnabled', 'idealAllocation', 'includePrimaryResidenceInFIRE', 'laborIncomeCategoryIds', 'monthlyEmailEnabled',
  'monthlyEmailRecipients', 'pensionReturnStartMonth', 'performanceExcludesCash', 'performanceIncludesExcludedAssets',
  'performanceIncludesPensionFunds', 'plannedAnnualExpenses', 'quarterlyEmailEnabled', 'riskFreeRate',
  'semiAnnualEmailEnabled', 'spendingRolesEnabled', 'stampDutyEnabled', 'stampDutyRate', 'targets',
  'transferFeeCategoryId', 'transferFeeSubCategoryId', 'weeklyBudgetEmailEnabled', 'withdrawalRate',
  'yearlyEmailEnabled',
].sort();

/** The context of a «Salva» from a page whose last read is `saved`; Oro by the default rule. */
function contextOf(saved: SettingsSlices, slices: SettingsSlices = saved) {
  return {
    saved,
    effectiveGoldSubCategory: resolveSimulazioniGold(slices.simulazioni, slices.allocazione, undefined).effectiveGoldSubCategory,
  };
}

function composeOk(slices: SettingsSlices, current: AssetAllocationSettings | null = FULL_PAGE_SETTINGS, saved: SettingsSlices = slices) {
  const result = composeSettingsDocument(slices, current, contextOf(saved, slices));
  if (!result.ok) throw new Error(`compose refused: ${result.tab}`);
  return result;
}

/** The document a CLEAN «Salva» writes for `FULL_PAGE_SETTINGS`: all of it but the age, which is read-only here. */
const { userAge: _readOnlyAge, ...FULL_PAGE_DOCUMENT } = FULL_PAGE_SETTINGS;
void _readOnlyAge;

describe('sliceSettings ∘ composeSettingsDocument — the identity', () => {
  it('gives back a document that carries every field the page writes', () => {
    const { document } = composeOk(sliceSettings(FULL_PAGE_SETTINGS, DEFAULT_TARGETS));

    expect(document).toEqual(FULL_PAGE_DOCUMENT);
    expect(Object.keys(document).sort()).toEqual(WRITTEN_KEYS);
  });

  it('keeps every field of the round-trip fixture the page owns', () => {
    const { document } = composeOk(sliceSettings(STORED_SETTINGS, DEFAULT_TARGETS), STORED_SETTINGS);

    const {
      targets, familyMembers, respectPensionLockInFire, pensionInpsRetirementAge, pensionRitaLongUnemployment,
      // Written only by their own tab (Simulazioni) or by FIRE; the S1 describe below pins them.
      monteCarloMarket, coastFireTaxBrackets, coastFireCustomExpenses, ...owned
    } = STORED_SETTINGS;
    void [monteCarloMarket, coastFireTaxBrackets, coastFireCustomExpenses];
    expect(document).toMatchObject(owned);
    // The three RITA fields are FIRE's: declared on the Parametri del piano tile, never written here.
    expect(document).not.toHaveProperty('respectPensionLockInFire');
    expect(document).not.toHaveProperty('pensionInpsRetirementAge');
    expect(document).not.toHaveProperty('pensionRitaLongUnemployment');
    expect(respectPensionLockInFire && pensionInpsRetirementAge && pensionRitaLongUnemployment).toBeTruthy();
    // A sparse class entry comes back with its config filled in, the percentage untouched.
    expect(document.targets.equity.targetPercentage).toBe(targets.equity.targetPercentage);
    expect(document.targets.bonds.targetPercentage).toBe(targets.bonds.targetPercentage);
    expect(document.targets.equity.subCategoryConfig).toEqual({ enabled: false, categories: [] });
    // A member saved without the flag is written with it off (what the form always did).
    expect(document.familyMembers).toEqual([{ ...familyMembers[0], isFirstEmploymentPost2007: false }]);
  });

  it('seeds a brand-new account from the fallback targets and the defaults', () => {
    const slices = sliceSettings(null, DEFAULT_TARGETS);

    expect(slices.allocazione.classes.equity.targetPercentage).toBe(60);
    expect(slices.allocazione.classes.bonds.categories).toEqual(['Governativi']);
    expect(slices.allocazione.classes.crypto).toEqual({ targetPercentage: 0, subCategoryEnabled: false, categories: [], subTargets: [], expanded: false });
    expect(slices.allocazione.autoCalculate).toBe(false);
    expect(slices.generale.stampDutyRate).toBe(0.2);
    expect(slices.generale.cashflowHistoryStartYear).toBe(2025);
    expect(slices.spese.defaultDebitCashAssetId).toBe('__none__');
    expect(slices.dividendi.dividendIncomeCategoryId).toBe('');
  });

  it('derives the auto-calc switch from age and rate when the flag was never saved', () => {
    const { autoCalculateEquityBonds: _flag, ...legacy } = FULL_PAGE_SETTINGS;
    void _flag;
    expect(sliceSettings(legacy, DEFAULT_TARGETS).allocazione.autoCalculate).toBe(true);
    expect(sliceSettings({ ...legacy, riskFreeRate: undefined }, DEFAULT_TARGETS).allocazione.autoCalculate).toBe(false);
  });

  it('settles Azioni and Obbligazioni from the formula when the switch is on', () => {
    // 125 − 41 − 3,25 × 5 = 67,75 of equity; the other classes (5 + 4 + 7,5 + 6 + 2, cash fixed) take 24,5 of it.
    const slices = sliceSettings({ ...FULL_PAGE_SETTINGS, autoCalculateEquityBonds: true }, DEFAULT_TARGETS);

    expect(slices.allocazione.classes.equity.targetPercentage).toBe(43.25);
    expect(slices.allocazione.classes.bonds.targetPercentage).toBe(32.25);
  });

  it('writes an emptied select or input as undefined, never as its sentinel', () => {
    const slices = sliceSettings(FULL_PAGE_SETTINGS, DEFAULT_TARGETS);
    slices.dividendi = { dividendIncomeCategoryId: '', dividendIncomeSubCategoryId: '', dividendCashAssetId: '__none__' };
    slices.spese = { ...slices.spese, defaultDebitCashAssetId: '__none__', transferFeeCategoryId: '' };
    slices.generale = { ...slices.generale, pensionReturnStartMonth: '' };
    slices.allocazione = { ...slices.allocazione, userAge: undefined };

    const { document } = composeOk(slices, FULL_PAGE_SETTINGS, sliceSettings(FULL_PAGE_SETTINGS, DEFAULT_TARGETS));

    expect(document.dividendIncomeCategoryId).toBeUndefined();
    expect(document.dividendCashAssetId).toBeUndefined();
    expect(document.defaultDebitCashAssetId).toBeUndefined();
    expect(document.transferFeeCategoryId).toBeUndefined();
    expect(document.pensionReturnStartMonth).toBeUndefined();
    // The age is never written from here (D-T5): a cleared field cannot clear FIRE › Il mio piano's age either.
    expect('userAge' in document).toBe(false);
    // Present-but-undefined: the service's `'x' in settings` guard needs the KEY to clear the field.
    expect('riskFreeRate' in composeOk({ ...slices, allocazione: { ...slices.allocazione, riskFreeRate: undefined } }).document).toBe(true);
  });
});

describe('composeSettingsDocument — the first broken rule, with its tab', () => {
  it('refuses a group that does not add up and names where it is', () => {
    const slices = sliceSettings(FULL_PAGE_SETTINGS, DEFAULT_TARGETS);
    slices.allocazione.classes.commodity.subTargets[0].percentage = 90;

    const result = composeSettingsDocument(slices, FULL_PAGE_SETTINGS);

    expect(result.ok).toBe(false);
    if (result.ok || result.tab !== 'allocazione') throw new Error('expected a target problem');
    expect(result.problem).toEqual({ kind: 'sub-total', assetClass: 'commodity', total: 90 });
  });

  it('drops an unnamed subcategory row before validating and writing, and hands the cleaned tree back', () => {
    const slices = sliceSettings(FULL_PAGE_SETTINGS, DEFAULT_TARGETS);
    const equity = slices.allocazione.classes.equity;
    equity.subTargets = [...equity.subTargets, { name: '  ', percentage: 15, specificAssetsEnabled: false, specificAssets: [], expanded: false }];

    const result = composeOk(slices);

    expect(result.document.targets.equity.subTargets).toEqual(FULL_PAGE_SETTINGS.targets.equity.subTargets);
    expect(result.cleaned.classes.equity.subTargets).toHaveLength(2);
    expect(result.cleaned.classes.equity.categories).toEqual(['World', 'Small Cap']);
    expect(cleanAllocazioneSlice(result.cleaned)).toBe(result.cleaned);
  });
});

describe('isSliceDirty — the dot on the tab', () => {
  const saved = sliceSettings(FULL_PAGE_SETTINGS, DEFAULT_TARGETS);

  it('is false on the slices as read', () => {
    for (const tab of ['allocazione', 'generale', 'spese', 'dividendi', 'simulazioni'] as const) {
      expect(isSliceDirty(tab, saved, saved), tab).toBe(false);
    }
  });

  it('marks ONLY the tab that edits the field', () => {
    const draft = settingsDraftReducer(
      { slices: saved, saved, loaded: true, pendingFocus: null },
      { type: 'generale/set', patch: { costCentersEnabled: false } }
    ).slices;

    expect(isSliceDirty('generale', draft, saved)).toBe(true);
    expect(isSliceDirty('allocazione', draft, saved)).toBe(false);
    expect(isSliceDirty('spese', draft, saved)).toBe(false);
    expect(isSliceDirty('dividendi', draft, saved)).toBe(false);
    expect(isSliceDirty('simulazioni', draft, saved)).toBe(false);
  });

  it('never calls the age an edit: it is read for the formula and written by FIRE › Il mio piano', () => {
    const draft = settingsDraftReducer(
      { slices: saved, saved, loaded: true, pendingFocus: null },
      { type: 'allocazione/set', patch: { userAge: 52 } }
    ).slices;

    expect(isSliceDirty('allocazione', draft, saved)).toBe(false);
  });

  it('ignores an empty member row, a reordered list, an opened group and float noise', () => {
    const draft: SettingsSlices = {
      ...saved,
      generale: {
        ...saved.generale,
        familyMembers: [...saved.generale.familyMembers, { id: 'new', name: '', grossAnnualIncome: '', isFirstEmploymentPost2007: false, firstEmploymentYear: '' }],
        laborIncomeCategoryIds: [...saved.generale.laborIncomeCategoryIds].reverse(),
      },
      allocazione: {
        ...saved.allocazione,
        classes: {
          ...saved.allocazione.classes,
          equity: { ...saved.allocazione.classes.equity, expanded: true, targetPercentage: 55.5 + 1e-12 },
        },
      },
    };

    expect(isSliceDirty('generale', draft, saved)).toBe(false);
    expect(isSliceDirty('allocazione', draft, saved)).toBe(false);
  });

  it('sees a renamed sub-target and a changed specific asset', () => {
    const equity = saved.allocazione.classes.equity;
    const renamed = { ...saved, allocazione: { ...saved.allocazione, classes: { ...saved.allocazione.classes, equity: { ...equity, subTargets: [{ ...equity.subTargets[1], name: 'Mid Cap' }, equity.subTargets[0]] } } } };
    const asset = { ...saved, allocazione: { ...saved.allocazione, classes: { ...saved.allocazione.classes, equity: { ...equity, subTargets: [{ ...equity.subTargets[0], specificAssets: [{ name: 'SWDA', targetPercentage: 61 }, { name: 'VWCE', targetPercentage: 39 }] }, equity.subTargets[1]] } } } };

    expect(isSliceDirty('allocazione', renamed, saved)).toBe(true);
    expect(isSliceDirty('allocazione', asset, saved)).toBe(true);
  });
});

describe('settingsDraftReducer', () => {
  it('starts unloaded, with nothing dirty', () => {
    const draft = createSettingsDraft();
    expect(draft.loaded).toBe(false);
    expect(isSliceDirty('allocazione', draft.slices, draft.saved)).toBe(false);
  });

  it('reset reads the document into both sides and clears the pending focus', () => {
    const edited = settingsDraftReducer(createSettingsDraft(), { type: 'focus', fieldId: 'crypto' });
    const draft = settingsDraftReducer(edited, { type: 'reset', document: FULL_PAGE_SETTINGS, fallbackTargets: DEFAULT_TARGETS });

    expect(draft.loaded).toBe(true);
    expect(draft.pendingFocus).toBeNull();
    expect(draft.slices).toBe(draft.saved);
    expect(draft.slices.allocazione.classes.crypto.targetPercentage).toBe(7.5);
  });

  it('re-settles the formula pair on every allocation edit while the switch is on', () => {
    const loaded = settingsDraftReducer(createSettingsDraft(), { type: 'reset', document: FULL_PAGE_SETTINGS, fallbackTargets: DEFAULT_TARGETS });
    const on = settingsDraftReducer(loaded, { type: 'allocazione/set', patch: { autoCalculate: true } });
    expect(on.slices.allocazione.classes.equity.targetPercentage).toBe(43.25);

    // Crypto 7,5 → 10 takes 2,5 more out of Azioni; Obbligazioni keep the formula's residual.
    const crypto = settingsDraftReducer(on, { type: 'allocazione/setClass', assetClass: 'crypto', patch: { targetPercentage: 10 } });
    expect(crypto.slices.allocazione.classes.equity.targetPercentage).toBe(40.75);
    expect(crypto.slices.allocazione.classes.bonds.targetPercentage).toBe(32.25);
    // The slices it did not touch keep their identity: a view of another tab sees the same props.
    expect(crypto.slices.generale).toBe(loaded.slices.generale);
  });

  it('saved makes the cleaned tree the new baseline', () => {
    const loaded = settingsDraftReducer(createSettingsDraft(), { type: 'reset', document: FULL_PAGE_SETTINGS, fallbackTargets: DEFAULT_TARGETS });
    const equity = loaded.slices.allocazione.classes.equity;
    const withEmptyRow = settingsDraftReducer(loaded, {
      type: 'allocazione/setClass',
      assetClass: 'equity',
      patch: { subTargets: [...equity.subTargets, { name: '', percentage: 0, specificAssetsEnabled: false, specificAssets: [], expanded: false }] },
    });
    const result = composeOk(withEmptyRow.slices);
    const saved = settingsDraftReducer(withEmptyRow, { type: 'saved', cleaned: result.cleaned });

    expect(saved.slices.allocazione.classes.equity.subTargets).toHaveLength(2);
    expect(isSliceDirty('allocazione', saved.slices, saved.saved)).toBe(false);
  });

  it('replaceTargets puts the factory targets in, the cash pair with them', () => {
    const loaded = settingsDraftReducer(createSettingsDraft(), { type: 'reset', document: FULL_PAGE_SETTINGS, fallbackTargets: DEFAULT_TARGETS });
    const reset = settingsDraftReducer(loaded, { type: 'allocazione/replaceTargets', targets: DEFAULT_TARGETS });

    expect(reset.slices.allocazione.classes.equity.targetPercentage).toBe(60);
    expect(reset.slices.allocazione.cashUseFixedAmount).toBe(false);
    expect(reset.slices.allocazione.cashFixedAmount).toBe(0);
    expect(reset.slices.allocazione.userAge).toBe(41);
    expect(isSliceDirty('allocazione', reset.slices, reset.saved)).toBe(true);
  });

  it('focus is held until the view consumes it', () => {
    const focused = settingsDraftReducer(createSettingsDraft(), { type: 'focus', fieldId: targetFieldId.subPct('equity', 1) });
    expect(focused.pendingFocus).toBe('target-equity-sub-1-pct');
    const consumed = settingsDraftReducer(focused, { type: 'focusConsumed' });
    expect(consumed.pendingFocus).toBeNull();
    expect(settingsDraftReducer(consumed, { type: 'focusConsumed' })).toBe(consumed);
  });
});

describe('revealTargetProblem — where «Salva» takes the reader', () => {
  const slice = sliceSettings(FULL_PAGE_SETTINGS, DEFAULT_TARGETS).allocazione;

  it('opens the class and points at the first row as shown for a group that does not add up', () => {
    const { slice: opened, fieldId } = revealTargetProblem({ kind: 'sub-total', assetClass: 'equity', total: 90 }, slice);

    expect(opened.classes.equity.expanded).toBe(true);
    // Rows are listed by name: «Small Cap» (index 1) comes before «World» (index 0).
    expect(fieldId).toBe('target-equity-sub-1-pct');
    expect(slice.classes.equity.expanded).toBe(false);
  });

  it('opens the subcategory’s asset list too for an asset rule', () => {
    const { slice: opened, fieldId } = revealTargetProblem(
      { kind: 'specific-empty', assetClass: 'equity', subIndex: 0, subName: 'World' },
      slice
    );

    expect(opened.classes.equity.expanded).toBe(true);
    expect(opened.classes.equity.subTargets[0].expanded).toBe(true);
    expect(fieldId).toBe('target-equity-sub-0-asset-add');
  });

  it('points at the first editable class when the total is short', () => {
    expect(revealTargetProblem({ kind: 'total-below-100', total: 80 }, slice).fieldId).toBe('equity');
    expect(revealTargetProblem({ kind: 'total-below-100', total: 80 }, { ...slice, autoCalculate: true }).fieldId).toBe('commodity');
  });
});

// ─── The fork's fields (gate S1) ─────────────────────────────────────────────────────────────

describe('«Salva» keeps the fork’s fields (gate S1)', () => {
  /** The page as it is after the first read of `doc`: draft = saved. */
  const loadedFrom = (doc: AssetAllocationSettings) => sliceSettings(doc, DEFAULT_TARGETS);

  it('carries the FIRE plan’s and the optimizer’s fields through from the document read just before', () => {
    const slices = loadedFrom(STORED_SETTINGS);
    const { document } = composeOk(slices, STORED_SETTINGS as AssetAllocationSettings);

    expect(document).toMatchObject({
      plannedAnnualExpenses: 31_000,
      fireEmergencyFund: 24_000,
      fireCashToInvestPct: 35,
      fireDatedFlows: STORED_DATED_FLOWS,
      idealAllocation: STORED_IDEAL_ALLOCATION,
    });
  });

  it('takes them from the CURRENT document, never from the copy the page loaded', () => {
    const stale = { ...STORED_SETTINGS, fireEmergencyFund: 1_000, fireDatedFlows: [], idealAllocation: undefined } as AssetAllocationSettings;
    const slices = loadedFrom(stale);
    // FIRE › Il mio piano and Allocazione › Accumulo saved while the form was open.
    const { document } = composeOk(slices, STORED_SETTINGS as AssetAllocationSettings);

    expect(document.fireEmergencyFund).toBe(24_000);
    expect(document.fireDatedFlows).toEqual(STORED_DATED_FLOWS);
    expect(document.idealAllocation).toEqual(STORED_IDEAL_ALLOCATION);
  });

  it('writes neither the market nor the brackets from another tab’s save', () => {
    const saved = loadedFrom(STORED_SETTINGS as AssetAllocationSettings);
    const edited = settingsDraftReducer(
      { slices: saved, saved, loaded: true, pendingFocus: null },
      { type: 'generale/set', patch: { costCentersEnabled: false } }
    );
    const result = composeOk(edited.slices, STORED_SETTINGS as AssetAllocationSettings, saved);

    expect('monteCarloMarket' in result.document).toBe(false);
    expect('coastFireTaxBrackets' in result.document).toBe(false);
    expect('userAge' in result.document).toBe(false);
    expect(result.simulazioni).toBeNull();
  });

  it('reads the market and the brackets from the stored document, without altering them', () => {
    const slices = loadedFrom(STORED_SETTINGS as AssetAllocationSettings);

    expect(slices.simulazioni.marketOrigin).toBe('saved');
    expect(slices.simulazioni.market.overrides.inflationRate).toBe(2.5);
    expect(slices.simulazioni.market.overrides.classes.equity).toMatchObject({ cagr: 6.5, uncertainty: 3 });
    expect(slices.simulazioni.market.goldSubCategory).toBeNull();
    expect(slices.simulazioni.market.leverageSpread).toBe(3);
    expect(slices.simulazioni.taxBrackets.map((bracket) => bracket.rate)).toEqual(['23', '43']);
    expect(isSliceDirty('simulazioni', slices, slices)).toBe(false);
  });

  it('writes the market when — and only when — the Simulazioni tab holds an edit', () => {
    const saved = loadedFrom(STORED_SETTINGS as AssetAllocationSettings);
    const edited = settingsDraftReducer(
      { slices: saved, saved, loaded: true, pendingFocus: null },
      {
        type: 'simulazioni/set',
        patch: { market: { ...saved.simulazioni.market, overrides: { ...saved.simulazioni.market.overrides, inflationRate: 3 } } },
      }
    );

    expect(isSliceDirty('simulazioni', edited.slices, saved)).toBe(true);
    expect(isSliceDirty('generale', edited.slices, saved)).toBe(false);
    const result = composeOk(edited.slices, STORED_SETTINGS as AssetAllocationSettings, saved);
    expect(result.document.monteCarloMarket).toMatchObject({ version: 2, inflationRate: 3, goldSubCategory: null, leverageSpread: 3 });
    // What the reader had typed beside the edit travels with it.
    expect((result.document.monteCarloMarket as { classes?: Record<string, unknown> } | undefined)?.classes?.equity).toMatchObject({ cagr: 6.5, uncertainty: 3 });
    expect('coastFireTaxBrackets' in result.document).toBe(false);
    // The slice as written is the new baseline: clean again, the market recorded as saved.
    expect(result.simulazioni?.marketOrigin).toBe('saved');
    const after = settingsDraftReducer(edited, { type: 'saved', cleaned: result.cleaned, simulazioni: result.simulazioni });
    expect(isSliceDirty('simulazioni', after.slices, after.saved)).toBe(false);
  });

  it('writes the brackets only when they were edited', () => {
    const saved = loadedFrom(STORED_SETTINGS as AssetAllocationSettings);
    const edited = settingsDraftReducer(
      { slices: saved, saved, loaded: true, pendingFocus: null },
      { type: 'simulazioni/set', patch: { taxBrackets: saved.simulazioni.taxBrackets.map((bracket, index) => (index === 0 ? { ...bracket, rate: '24' } : bracket)) } }
    );
    const result = composeOk(edited.slices, STORED_SETTINGS as AssetAllocationSettings, saved);

    expect(result.document.coastFireTaxBrackets).toEqual([{ ...STORED_TAX_BRACKETS[0], rate: 24 }, STORED_TAX_BRACKETS[1]]);
    expect('monteCarloMarket' in result.document).toBe(false);
  });

  it('converts a market still in the old format at the first «Salva», even with nothing typed', () => {
    const legacy = {
      ...STORED_SETTINGS,
      monteCarloMarket: undefined,
      monteCarloScenarios: { bear: { equity: { cagr: 7, volatility: 15 }, bonds: { cagr: 3, volatility: 6 }, realEstate: { cagr: 4, volatility: 10 }, commodities: { cagr: 3, volatility: 15 }, inflationRate: 2 }, base: { equity: { cagr: 7, volatility: 15 }, bonds: { cagr: 3, volatility: 6 }, realEstate: { cagr: 4, volatility: 10 }, commodities: { cagr: 3, volatility: 15 }, inflationRate: 2 }, bull: { equity: { cagr: 7, volatility: 15 }, bonds: { cagr: 3, volatility: 6 }, realEstate: { cagr: 4, volatility: 10 }, commodities: { cagr: 3, volatility: 15 }, inflationRate: 2 } },
    } as unknown as AssetAllocationSettings;
    const saved = loadedFrom(legacy);

    expect(saved.simulazioni.marketOrigin).toBe('migrated');
    expect(isSliceDirty('simulazioni', saved, saved)).toBe(true);
    const result = composeOk(saved, legacy, saved);
    expect(result.document.monteCarloMarket).toMatchObject({ version: 2 });
    expect(result.simulazioni?.marketOrigin).toBe('saved');
  });

  it('refuses a figure out of range and names it, before any write', () => {
    const saved = loadedFrom(STORED_SETTINGS as AssetAllocationSettings);
    const draft = settingsDraftReducer(
      { slices: saved, saved, loaded: true, pendingFocus: null },
      {
        type: 'simulazioni/set',
        patch: { market: { ...saved.simulazioni.market, overrides: { ...saved.simulazioni.market.overrides, inflationRate: 80 } } },
      }
    );
    const result = composeSettingsDocument(draft.slices, null, contextOf(saved, draft.slices));

    expect(result.ok).toBe(false);
    if (result.ok || result.tab !== 'simulazioni') throw new Error('expected a market problem');
    expect(result.marketProblems.length).toBeGreaterThan(0);
  });

  it('keeps the stored market identical when a clean save reads it back', () => {
    const slices = loadedFrom(STORED_SETTINGS as AssetAllocationSettings);
    const { market } = slices.simulazioni;
    expect(market.correlations).toEqual(STORED_MONTE_CARLO_MARKET.correlations);
  });
});
