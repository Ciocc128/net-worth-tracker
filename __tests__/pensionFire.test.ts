/**
 * Unit tests for pensionFire.ts — the locked-capital helper that removes not-yet-unlocked pension
 * funds from the FIRE-eligible net worth (spec §5.3).
 */

import { describe, it, expect } from 'vitest';
import { calculatePensionLockedValue } from '@/lib/utils/pensionFire';
import type { Asset } from '@/types/assets';

/** Minimal Asset fixture — only the fields the helper reads matter; value is carried in `quantity`. */
function mkAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'a',
    userId: 'u',
    ticker: '',
    name: 'Fondo',
    type: 'pension',
    assetClass: 'pension',
    currency: 'EUR',
    quantity: 0,
    currentPrice: 1,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Asset;
}

const valueOf = (a: Asset) => a.quantity; // manual pension: value lives in quantity

describe('calculatePensionLockedValue', () => {
  const now = new Date('2026-07-21');

  it('sums pension funds whose unlock date is in the future', () => {
    const assets = [
      mkAsset({ quantity: 10000, pensionFundDetails: { provider: 'A', unlockDate: '2040-01-01' } }),
      mkAsset({ quantity: 5000, pensionFundDetails: { provider: 'B', unlockDate: '2050-06-01' } }),
    ];
    expect(calculatePensionLockedValue(assets, now, valueOf)).toBe(15000);
  });

  it('excludes funds already unlocked at the valuation date', () => {
    const assets = [
      mkAsset({ quantity: 10000, pensionFundDetails: { provider: 'A', unlockDate: '2020-01-01' } }),
      mkAsset({ quantity: 5000, pensionFundDetails: { provider: 'B', unlockDate: '2040-01-01' } }),
    ];
    expect(calculatePensionLockedValue(assets, now, valueOf)).toBe(5000);
  });

  it('treats a fund without an unlock date as not locked', () => {
    const assets = [mkAsset({ quantity: 10000, pensionFundDetails: { provider: 'A' } })];
    expect(calculatePensionLockedValue(assets, now, valueOf)).toBe(0);
  });

  it('ignores non-pension assets', () => {
    const assets = [
      mkAsset({ type: 'etf', assetClass: 'equity', quantity: 99999 }),
      mkAsset({ quantity: 3000, pensionFundDetails: { provider: 'A', unlockDate: '2045-01-01' } }),
    ];
    expect(calculatePensionLockedValue(assets, now, valueOf)).toBe(3000);
  });
});
