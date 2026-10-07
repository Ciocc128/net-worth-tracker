/**
 * Tests for lib/utils/idealAllocationEditor.ts — what the objectives' editor (Allocazione ›
 * Accumulo, doc/pac-ottimizzatore § RV6) reads from the saved targets and the portfolio, and the
 * range checks «Salva gli obiettivi» runs.
 */
import { describe, it, expect } from 'vitest';
import { buildObjectivesEditorContext, findIdealAllocationProblem } from '@/lib/utils/idealAllocationEditor';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

const asset = (overrides: Partial<Asset>): Asset =>
  ({ id: 'a', name: 'VWCE', type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 100, allocationRole: 'tradable', ...overrides }) as Asset;
const valueOf = (a: Asset) => a.quantity * (a.currentPrice ?? 0);

describe('buildObjectivesEditorContext', () => {
  const targets = {
    equity: { targetPercentage: 60, subCategoryConfig: { enabled: true, categories: [{ name: 'Mondo', targetPercentage: 100 }] } },
    bonds: { targetPercentage: 40 },
  } as unknown as AssetAllocationTarget;

  it('splits the classes by whether their sub-categories are on', () => {
    const context = buildObjectivesEditorContext(targets, [asset({})], valueOf);
    expect(context.factorClassOptions.map((c) => c.assetClass)).toEqual(['equity']);
    expect(context.secondLevelReadyClasses.map((c) => c.assetClass)).toEqual(['bonds']);
  });

  it('offers only tradable instruments to the limits', () => {
    const context = buildObjectivesEditorContext(
      targets,
      [asset({ id: 'a', name: 'VWCE' }), asset({ id: 'f', name: 'FONDO', allocationRole: 'frozen' }), asset({ id: 'x', name: 'CASA', allocationRole: 'excluded' })],
      valueOf,
    );
    expect(context.tradableAssets).toEqual([{ id: 'a', label: 'VWCE' }]);
  });
});

describe('findIdealAllocationProblem', () => {
  it('accepts consistent limits', () => {
    expect(findIdealAllocationProblem({ instrumentLimits: [{ minPct: 5, maxPct: 40 }], groupLimits: [{ label: 'Leva', maxPct: 20 }] })).toBeNull();
  });

  it('refuses a minimum above the maximum, a value out of range and a group cap out of range', () => {
    expect(findIdealAllocationProblem({ instrumentLimits: [{ minPct: 50, maxPct: 40 }], groupLimits: [] })).toMatch(/minimo/);
    expect(findIdealAllocationProblem({ instrumentLimits: [{ maxPct: 120 }], groupLimits: [] })).toMatch(/tra 0 e 100/);
    expect(findIdealAllocationProblem({ instrumentLimits: [], groupLimits: [{ label: '', maxPct: -1 }] })).toMatch(/senza etichetta/);
  });
});
