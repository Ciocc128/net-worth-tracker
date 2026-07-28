/**
 * Tests for `resolveDisplayAssetClass` (lib/utils/assetDisplayClass.ts): la classe PREVALENTE
 * di un asset composito, per la sola visualizzazione. Modulo puro, nessun mock Firebase.
 */
import { describe, it, expect } from 'vitest';
import type { Asset, AssetComposition } from '@/types/assets';
import { resolveDisplayAssetClass } from '@/lib/utils/assetDisplayClass';

function makeAsset(overrides: Partial<Asset> = {}): Pick<Asset, 'assetClass' | 'composition'> {
  return {
    assetClass: 'equity',
    ...overrides,
  };
}

describe('resolveDisplayAssetClass', () => {
  it('returns the largest composition leg (70/30 → the 70% class)', () => {
    const composition: AssetComposition[] = [
      { assetClass: 'bonds', percentage: 70 },
      { assetClass: 'equity', percentage: 30 },
    ];
    const asset = makeAsset({ assetClass: 'equity', composition });
    expect(resolveDisplayAssetClass(asset)).toBe('bonds');
  });

  it('falls back to assetClass when composition is absent', () => {
    const asset = makeAsset({ assetClass: 'bonds', composition: undefined });
    expect(resolveDisplayAssetClass(asset)).toBe('bonds');
  });

  it('falls back to assetClass when composition is an empty array', () => {
    const asset = makeAsset({ assetClass: 'crypto', composition: [] });
    expect(resolveDisplayAssetClass(asset)).toBe('crypto');
  });

  it('on a 50/50 tie, returns the first leg in insertion order', () => {
    const composition: AssetComposition[] = [
      { assetClass: 'equity', percentage: 50 },
      { assetClass: 'bonds', percentage: 50 },
    ];
    const asset = makeAsset({ assetClass: 'equity', composition });
    expect(resolveDisplayAssetClass(asset)).toBe('equity');

    // Reversing insertion order flips the winner — proves the tie-break is positional, not
    // an alphabetical/enum artifact.
    const reversed: AssetComposition[] = [
      { assetClass: 'bonds', percentage: 50 },
      { assetClass: 'equity', percentage: 50 },
    ];
    expect(resolveDisplayAssetClass(makeAsset({ composition: reversed }))).toBe('bonds');
  });

  it('still ranks correctly when percentages do not sum to 100', () => {
    const composition: AssetComposition[] = [
      { assetClass: 'equity', percentage: 40 },
      { assetClass: 'commodity', percentage: 45 },
    ];
    const asset = makeAsset({ assetClass: 'equity', composition });
    expect(resolveDisplayAssetClass(asset)).toBe('commodity');
  });

  it('handles a three-leg composition, picking the true plurality', () => {
    const composition: AssetComposition[] = [
      { assetClass: 'equity', percentage: 20 },
      { assetClass: 'bonds', percentage: 50 },
      { assetClass: 'cash', percentage: 30 },
    ];
    const asset = makeAsset({ assetClass: 'equity', composition });
    expect(resolveDisplayAssetClass(asset)).toBe('bonds');
  });
});
