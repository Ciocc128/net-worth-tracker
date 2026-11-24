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
 * RU8 (2026-11-23): the class targets left this draft for Allocazione › Strategia; their cases moved
 * to `targetsDraft.test.ts`. «Salva» writes NO `targets` (criterion 11 of doc/riordino-ui/ondata-2.md
 * § 10): the merge branch of `setSettings`, so a stale page cannot bring old targets back (M1).
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
  composeSettingsDocument,
  createSettingsDraft,
  isSettingsTabId,
  isSliceDirty,
  resolveSimulazioniGold,
  settingsDraftReducer,
  sliceSettings,
  type SettingsSlices,
} from '@/lib/utils/settingsDraft';
import type { AssetAllocationSettings } from '@/types/assets';
import {
  FULL_PAGE_SETTINGS,
  STORED_DATED_FLOWS,
  STORED_IDEAL_ALLOCATION,
  STORED_MONTE_CARLO_MARKET,
  STORED_SETTINGS,
  STORED_TAX_BRACKETS,
} from './fixtures/storedSettings';

/**
 * Every key a CLEAN «Salva» hands to `setSettings` — the write surface of the page, as a checklist.
 * Not here, on purpose: `userAge` (its one editor is FIRE › Il mio piano), `monteCarloMarket` /
 * `coastFireTaxBrackets` (written only when the Simulazioni tab holds an edit), and since RU8 the
 * targets' fields — `targets`, `autoCalculateEquityBonds`, `goalDrivenAllocationEnabled` (Strategia's;
 * the last written here only to switch it off with the goals).
 */
const WRITTEN_KEYS = [
  'cashflowHistoryStartYear', 'checkingAccountSubCategory', 'costCentersEnabled',
  'defaultCreditCashAssetId', 'defaultDebitCashAssetId', 'dividendCashAssetId', 'dividendIncomeCategoryId',
  'dividendIncomeSubCategoryId', 'expenseSplitEnabled', 'familyMembers', 'fireCashToInvestPct', 'fireDatedFlows',
  'fireEmergencyFund', 'goalBasedInvestingEnabled',
  'idealAllocation', 'includePrimaryResidenceInFIRE', 'laborIncomeCategoryIds', 'monthlyEmailEnabled',
  'monthlyEmailRecipients', 'pensionReturnStartMonth', 'performanceExcludesCash', 'performanceIncludesExcludedAssets',
  'performanceIncludesPensionFunds', 'plannedAnnualExpenses', 'quarterlyEmailEnabled', 'riskFreeRate',
  'semiAnnualEmailEnabled', 'spendingRolesEnabled', 'stampDutyEnabled', 'stampDutyRate',
  'transferFeeCategoryId', 'transferFeeSubCategoryId', 'weeklyBudgetEmailEnabled', 'withdrawalRate',
  'yearlyEmailEnabled',
].sort();

/** The context of a «Salva» from a page whose last read is `saved`; Oro by the default rule. */
function contextOf(saved: SettingsSlices, slices: SettingsSlices = saved) {
  return {
    saved,
    effectiveGoldSubCategory: resolveSimulazioniGold(slices.simulazioni, FULL_PAGE_SETTINGS.targets, undefined).effectiveGoldSubCategory,
  };
}

function composeOk(slices: SettingsSlices, current: AssetAllocationSettings | null = FULL_PAGE_SETTINGS, saved: SettingsSlices = slices) {
  const result = composeSettingsDocument(slices, current, contextOf(saved, slices));
  if (!result.ok) throw new Error(`compose refused: ${result.tab}`);
  return result;
}

/** The document a CLEAN «Salva» writes for `FULL_PAGE_SETTINGS`: all of it but the age and Strategia's fields. */
const {
  userAge: _readOnlyAge,
  targets: _strategiaTargets,
  autoCalculateEquityBonds: _strategiaFormula,
  goalDrivenAllocationEnabled: _strategiaGoals,
  ...FULL_PAGE_DOCUMENT
} = FULL_PAGE_SETTINGS;
void [_readOnlyAge, _strategiaTargets, _strategiaFormula, _strategiaGoals];

describe('sliceSettings ∘ composeSettingsDocument — the identity', () => {
  it('gives back a document that carries every field the page writes', () => {
    const { document } = composeOk(sliceSettings(FULL_PAGE_SETTINGS));

    expect(document).toEqual(FULL_PAGE_DOCUMENT);
    expect(Object.keys(document).sort()).toEqual(WRITTEN_KEYS);
  });

  it('writes no targets, so `setSettings` merges and a stale page cannot bring old targets back (RU8, M1)', () => {
    const { document } = composeOk(sliceSettings(FULL_PAGE_SETTINGS));
    expect('targets' in document).toBe(false);
    expect('autoCalculateEquityBonds' in document).toBe(false);
    expect('goalDrivenAllocationEnabled' in document).toBe(false);
  });

  it('keeps every field of the round-trip fixture the page owns', () => {
    const { document } = composeOk(sliceSettings(STORED_SETTINGS), STORED_SETTINGS);

    const {
      targets, familyMembers, respectPensionLockInFire, pensionInpsRetirementAge, pensionRitaLongUnemployment,
      // Written only by their own tab (Simulazioni) or by FIRE; the S1 describe below pins them.
      monteCarloMarket, coastFireTaxBrackets, coastFireCustomExpenses,
      // Strategia's since RU8.
      autoCalculateEquityBonds, goalDrivenAllocationEnabled, ...owned
    } = STORED_SETTINGS as AssetAllocationSettings;
    void [targets, monteCarloMarket, coastFireTaxBrackets, coastFireCustomExpenses, autoCalculateEquityBonds, goalDrivenAllocationEnabled];
    expect(document).toMatchObject(owned);
    // The three RITA fields are FIRE's: declared on the Parametri del piano tile, never written here.
    expect(document).not.toHaveProperty('respectPensionLockInFire');
    expect(document).not.toHaveProperty('pensionInpsRetirementAge');
    expect(document).not.toHaveProperty('pensionRitaLongUnemployment');
    expect(respectPensionLockInFire && pensionInpsRetirementAge && pensionRitaLongUnemployment).toBeTruthy();
    // A member saved without the flag is written with it off (what the form always did).
    expect(document.familyMembers).toEqual([{ ...familyMembers![0], isFirstEmploymentPost2007: false }]);
  });

  it('seeds a brand-new account from the defaults', () => {
    const slices = sliceSettings(null);

    expect(slices.generale.riskFreeRate).toBeUndefined();
    expect(slices.generale.stampDutyRate).toBe(0.2);
    expect(slices.generale.cashflowHistoryStartYear).toBe(2025);
    expect(slices.spese.defaultDebitCashAssetId).toBe('__none__');
    expect(slices.dividendi.dividendIncomeCategoryId).toBe('');
  });

  it('writes an emptied select or input as undefined, never as its sentinel', () => {
    const slices = sliceSettings(FULL_PAGE_SETTINGS);
    slices.dividendi = { dividendIncomeCategoryId: '', dividendIncomeSubCategoryId: '', dividendCashAssetId: '__none__' };
    slices.spese = { ...slices.spese, defaultDebitCashAssetId: '__none__', transferFeeCategoryId: '' };
    slices.generale = { ...slices.generale, pensionReturnStartMonth: '' };

    const { document } = composeOk(slices, FULL_PAGE_SETTINGS, sliceSettings(FULL_PAGE_SETTINGS));

    expect(document.dividendIncomeCategoryId).toBeUndefined();
    expect(document.dividendCashAssetId).toBeUndefined();
    expect(document.defaultDebitCashAssetId).toBeUndefined();
    expect(document.transferFeeCategoryId).toBeUndefined();
    expect(document.pensionReturnStartMonth).toBeUndefined();
    // The age is never written from here (D-T5): a cleared field cannot clear FIRE › Il mio piano's age either.
    expect('userAge' in document).toBe(false);
    // Present-but-undefined: the service's `'x' in settings` guard needs the KEY to clear the field.
    expect('riskFreeRate' in composeOk({ ...slices, generale: { ...slices.generale, riskFreeRate: undefined } }).document).toBe(true);
  });
});

describe('the goals and the goal-driven targets (RU8)', () => {
  const saved = sliceSettings(FULL_PAGE_SETTINGS);

  it('switching the goals off writes the goal-driven targets off with them', () => {
    // Criterion 13 of doc/riordino-ui/ondata-2.md § 10: goals on → off with goal-driven saved true.
    const draft = { ...saved, generale: { ...saved.generale, goalBasedInvestingEnabled: false } };
    const { document } = composeOk(draft, FULL_PAGE_SETTINGS, saved);
    expect(document.goalBasedInvestingEnabled).toBe(false);
    expect(document.goalDrivenAllocationEnabled).toBe(false);
  });

  it('switching them on, or leaving them as they were, never touches the source Strategia chose', () => {
    const off = sliceSettings({ ...FULL_PAGE_SETTINGS, goalBasedInvestingEnabled: false });
    const on = { ...off, generale: { ...off.generale, goalBasedInvestingEnabled: true } };
    expect('goalDrivenAllocationEnabled' in composeOk(on, FULL_PAGE_SETTINGS, off).document).toBe(false);
    expect('goalDrivenAllocationEnabled' in composeOk(saved, FULL_PAGE_SETTINGS, saved).document).toBe(false);
  });

  it('the risk-free rate is Preferenze’s now: its edit marks that tab', () => {
    const draft = settingsDraftReducer({ slices: saved, saved, loaded: true }, { type: 'generale/set', patch: { riskFreeRate: 4 } }).slices;
    expect(isSliceDirty('generale', draft, saved)).toBe(true);
    expect(composeOk(draft, FULL_PAGE_SETTINGS, saved).document.riskFreeRate).toBe(4);
  });

  it('the old ?tab=allocazione is no tab of the page (it is redirected to Strategia)', () => {
    expect(isSettingsTabId('allocazione')).toBe(false);
    expect(isSettingsTabId('generale')).toBe(true);
  });
});

describe('isSliceDirty — the dot on the tab', () => {
  const saved = sliceSettings(FULL_PAGE_SETTINGS);

  it('is false on the slices as read', () => {
    for (const tab of ['generale', 'spese', 'dividendi', 'simulazioni'] as const) {
      expect(isSliceDirty(tab, saved, saved), tab).toBe(false);
    }
  });

  it('marks ONLY the tab that edits the field', () => {
    const draft = settingsDraftReducer({ slices: saved, saved, loaded: true }, { type: 'generale/set', patch: { costCentersEnabled: false } }).slices;

    expect(isSliceDirty('generale', draft, saved)).toBe(true);
    expect(isSliceDirty('spese', draft, saved)).toBe(false);
    expect(isSliceDirty('dividendi', draft, saved)).toBe(false);
    expect(isSliceDirty('simulazioni', draft, saved)).toBe(false);
  });

  it('ignores an empty member row and a reordered list', () => {
    const draft: SettingsSlices = {
      ...saved,
      generale: {
        ...saved.generale,
        familyMembers: [...saved.generale.familyMembers, { id: 'new', name: '', grossAnnualIncome: '', isFirstEmploymentPost2007: false, firstEmploymentYear: '' }],
        laborIncomeCategoryIds: [...saved.generale.laborIncomeCategoryIds].reverse(),
      },
    };

    expect(isSliceDirty('generale', draft, saved)).toBe(false);
  });
});

describe('settingsDraftReducer', () => {
  it('starts unloaded, with nothing dirty', () => {
    const draft = createSettingsDraft();
    expect(draft.loaded).toBe(false);
    expect(isSliceDirty('generale', draft.slices, draft.saved)).toBe(false);
  });

  it('reset reads the document into both sides', () => {
    const draft = settingsDraftReducer(createSettingsDraft(), { type: 'reset', document: FULL_PAGE_SETTINGS });

    expect(draft.loaded).toBe(true);
    expect(draft.slices).toBe(draft.saved);
    expect(draft.slices.generale.riskFreeRate).toBe(3.25);
  });

  it('an edit keeps the identity of the slices it did not touch', () => {
    const loaded = settingsDraftReducer(createSettingsDraft(), { type: 'reset', document: FULL_PAGE_SETTINGS });
    const edited = settingsDraftReducer(loaded, { type: 'spese/set', patch: { spendingRolesEnabled: false } });
    expect(edited.slices.generale).toBe(loaded.slices.generale);
  });
});

// ─── The fork's fields (gate S1) ─────────────────────────────────────────────────────────────

describe('«Salva» keeps the fork’s fields (gate S1)', () => {
  /** The page as it is after the first read of `doc`: draft = saved. */
  const loadedFrom = (doc: AssetAllocationSettings) => sliceSettings(doc);

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
      { slices: saved, saved, loaded: true },
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
      { slices: saved, saved, loaded: true },
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
    const after = settingsDraftReducer(edited, { type: 'saved', simulazioni: result.simulazioni });
    expect(isSliceDirty('simulazioni', after.slices, after.saved)).toBe(false);
  });

  it('writes the brackets only when they were edited', () => {
    const saved = loadedFrom(STORED_SETTINGS as AssetAllocationSettings);
    const edited = settingsDraftReducer(
      { slices: saved, saved, loaded: true },
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
      { slices: saved, saved, loaded: true },
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
