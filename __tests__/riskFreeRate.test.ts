/**
 * The risk-free rate in force (lib/utils/riskFreeRate.ts) and its draft behaviour in Impostazioni › Allocazione:
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
import { describeRiskFreeSource } from '@/lib/utils/settingsNarrative';
import { composeSettingsDocument, createSettingsDraft, isSliceDirty, resolveFormulaSplit, settingsDraftReducer } from '@/lib/utils/settingsDraft';
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

describe('the draft', () => {
  const doc = (riskFreeRate?: number): AssetAllocationSettings => ({ userAge: 40, riskFreeRate, autoCalculateEquityBonds: true, targets: {} }) as AssetAllocationSettings;
  const load = (riskFreeRate?: number) => settingsDraftReducer(createSettingsDraft(), { type: 'reset', document: doc(riskFreeRate), fallbackTargets: {} });

  it('the estimate arriving is not an edit and feeds the formula', () => {
    const next = settingsDraftReducer(load(undefined), { type: 'riskFreeEstimate', value: 3 });
    expect(isSliceDirty('allocazione', next.slices, next.saved)).toBe(false);
    // 125 − 40 − 3 × 5 = 70
    expect(resolveFormulaSplit(next.slices.allocazione)?.equityPercentage).toBe(70);
  });

  it('a typed rate overrides the estimate; clearing it returns to the estimate and is an edit to save', () => {
    let state = settingsDraftReducer(load(undefined), { type: 'riskFreeEstimate', value: 3 });
    state = settingsDraftReducer(state, { type: 'allocazione/set', patch: { riskFreeRate: 1 } });
    expect(resolveFormulaSplit(state.slices.allocazione)?.equityPercentage).toBe(80);
    expect(isSliceDirty('allocazione', state.slices, state.saved)).toBe(true);
    state = settingsDraftReducer(state, { type: 'allocazione/set', patch: { riskFreeRate: undefined } });
    expect(isSliceDirty('allocazione', state.slices, state.saved)).toBe(false);
    expect(resolveFormulaSplit(state.slices.allocazione)?.equityPercentage).toBe(70);
  });

  it('a saved rate stays typed after the estimate moves, and a re-read keeps the estimate', () => {
    let state = settingsDraftReducer(load(2), { type: 'riskFreeEstimate', value: 3 });
    expect(state.slices.allocazione.riskFreeRate).toBe(2);
    state = settingsDraftReducer(state, { type: 'reset', document: doc(undefined), fallbackTargets: {} });
    expect(state.slices.allocazione.riskFreeEstimate).toBe(3);
  });

  it('«Salva» writes no key while the rate follows the estimate, and never the estimate itself', () => {
    const state = settingsDraftReducer(load(undefined), { type: 'riskFreeEstimate', value: 3 });
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
