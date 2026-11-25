/**
 * The risk-free rate in force (lib/utils/riskFreeRate.ts) and its draft behaviour — typed in Impostazioni ›
 * Preferenze since RU8, read by the formula of Allocazione › Strategia:
 * a typed value always wins (0 included), nothing typed follows the ECB estimate (the AAA 10-year yield the cron stores,
 * the frozen anchor before its first run), the estimate's arrival is never an edit, and clearing the field returns to it.
 * Figures are invented and round.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

import { MONTE_CARLO_FROZEN_ANCHORS } from '@/lib/constants/monteCarloMarketDefaults';
import { toMonteCarloAnchors } from '@/lib/utils/marketAnchors';
import { resolveRiskFreeEstimate, resolveRiskFreeRate } from '@/lib/utils/riskFreeRate';
import { describeRiskFreeOrigin, describeRiskFreeSource } from '@/lib/utils/settingsNarrative';
import { composeSettingsDocument, createSettingsDraft, isSliceDirty, settingsDraftReducer } from '@/lib/utils/settingsDraft';
import { createTargetsDraft, resolveFormulaSplit, targetsDraftReducer } from '@/lib/utils/targetsDraft';
import type { AssetAllocationSettings } from '@/types/assets';

const liveAnchors = toMonteCarloAnchors({ aaa10y: { value: 3, date: '2026-10-20' }, estr: { value: 2, date: '2026-10-20' } });

describe('resolveRiskFreeRate', () => {
  it('a typed rate wins, a deliberate 0 included', () => {
    expect(resolveRiskFreeRate(4, liveAnchors)).toEqual({ value: 4, source: 'user' });
    expect(resolveRiskFreeRate(0, liveAnchors)).toEqual({ value: 0, source: 'user' });
  });

  it('nothing typed follows the cron AAA 10-year yield, with its date', () => {
    expect(resolveRiskFreeRate(undefined, liveAnchors)).toEqual({ value: 3, source: 'ecb', date: '2026-10-20' });
    expect(resolveRiskFreeRate(null, liveAnchors).source).toBe('ecb');
  });

  it('before the first cron run it is the frozen anchor, never the old 2.5', () => {
    expect(resolveRiskFreeEstimate()).toEqual({ value: MONTE_CARLO_FROZEN_ANCHORS.aaa10y, source: 'frozen' });
    expect(resolveRiskFreeRate(undefined, toMonteCarloAnchors(null)).value).toBe(MONTE_CARLO_FROZEN_ANCHORS.aaa10y);
  });
});

describe('the drafts', () => {
  const doc = (riskFreeRate?: number): AssetAllocationSettings => ({ userAge: 40, riskFreeRate, autoCalculateEquityBonds: true, targets: {} }) as AssetAllocationSettings;
  const loadTargets = (riskFreeRate?: number) => targetsDraftReducer(createTargetsDraft(), { type: 'reset', document: doc(riskFreeRate), fallbackTargets: {} });
  const loadSettings = (riskFreeRate?: number) => settingsDraftReducer(createSettingsDraft(), { type: 'reset', document: doc(riskFreeRate) });

  it('the estimate feeds the formula while nothing is typed; a typed rate overrides it', () => {
    // 125 − 40 − 3 × 5 = 70; with 1 typed: 125 − 40 − 1 × 5 = 80.
    expect(resolveFormulaSplit(targetsDraftReducer(loadTargets(undefined), { type: 'riskFreeEstimate', value: 3 }).slice)?.equityPercentage).toBe(70);
    expect(resolveFormulaSplit(targetsDraftReducer(loadTargets(1), { type: 'riskFreeEstimate', value: 3 }).slice)?.equityPercentage).toBe(80);
  });

  it('a typed rate is an Investimenti edit; clearing it back is not', () => {
    let state = settingsDraftReducer(loadSettings(undefined), { type: 'investimenti/set', patch: { riskFreeRate: 1 } });
    expect(isSliceDirty('investimenti', state.slices, state.saved)).toBe(true);
    state = settingsDraftReducer(state, { type: 'investimenti/set', patch: { riskFreeRate: undefined } });
    expect(isSliceDirty('investimenti', state.slices, state.saved)).toBe(false);
  });

  it('«Salva» writes no value while the rate follows the estimate, and never the estimate itself', () => {
    const state = loadSettings(undefined);
    const composed = composeSettingsDocument(state.slices, doc(2));
    expect(composed.ok).toBe(true);
    if (composed.ok) {
      expect(composed.document.riskFreeRate).toBeUndefined();
      expect(JSON.stringify(composed.document)).not.toContain('riskFreeEstimate');
    }
  });
});

describe('describeRiskFreeSource', () => {
  it('says whose figure it is and how to change it', () => {
    const estimate = resolveRiskFreeEstimate(liveAnchors);
    expect(describeRiskFreeSource({ typed: undefined, estimate })).toContain('Si aggiorna da sola');
    expect(describeRiskFreeSource({ typed: undefined, estimate })).toContain('20/10/2026');
    expect(describeRiskFreeSource({ typed: 4, estimate })).toContain('Impostato da te');
    expect(describeRiskFreeSource({ typed: undefined, estimate: resolveRiskFreeEstimate() })).toContain('in attesa del primo aggiornamento');
  });
});

describe('describeRiskFreeOrigin', () => {
  it('says whose figure the formula reads, in a few words', () => {
    const estimate = resolveRiskFreeEstimate(liveAnchors);
    expect(describeRiskFreeOrigin({ typed: 4, estimate })).toBe('impostato da te');
    expect(describeRiskFreeOrigin({ typed: undefined, estimate })).toBe('stima BCE del 20/10/2026');
    expect(describeRiskFreeOrigin({ typed: undefined, estimate: resolveRiskFreeEstimate() })).toBe('stima BCE, in attesa del primo aggiornamento');
  });
});
