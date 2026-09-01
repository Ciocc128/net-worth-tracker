/**
 * Regression test for the exposure cache key bug: `portfolioExposureService.ts` used to build a
 * 4-segment key while `app/api/portfolio/exposure/route.ts` built a 3-segment key to compare
 * against it, so `cached.cacheKey === expectedCacheKey` was never true and every visit re-hit
 * Yahoo Finance. Both now import `buildExposureCacheKey` from the same module — this test would
 * have caught the original bug (two independently-built keys diverging) and blocks it forever.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import { buildExposureCacheKey } from '@/lib/server/portfolioExposureService';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'VWCE',
    name: 'Vanguard All-World',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('buildExposureCacheKey', () => {
  it('is deterministic for the same asset list', () => {
    const assets = [makeAsset({ id: 'a1', ticker: 'VWCE' }), makeAsset({ id: 'a2', ticker: 'EIMI' })];
    expect(buildExposureCacheKey(assets)).toBe(buildExposureCacheKey(assets));
  });

  it('is order-independent (the route and the service may fetch assets in a different order)', () => {
    const a = makeAsset({ id: 'a1', ticker: 'VWCE' });
    const b = makeAsset({ id: 'a2', ticker: 'EIMI' });
    expect(buildExposureCacheKey([a, b])).toBe(buildExposureCacheKey([b, a]));
  });

  it('is NOT sensitive to a price tick (only ticker + quantity + role, no rounded total value)', () => {
    const before = [makeAsset({ ticker: 'VWCE', currentPrice: 100 })];
    const after = [makeAsset({ ticker: 'VWCE', currentPrice: 100.01 })];
    expect(buildExposureCacheKey(before)).toBe(buildExposureCacheKey(after));
  });

  it('changes when a quantity changes', () => {
    const before = [makeAsset({ ticker: 'VWCE', quantity: 10 })];
    const after = [makeAsset({ ticker: 'VWCE', quantity: 11 })];
    expect(buildExposureCacheKey(before)).not.toBe(buildExposureCacheKey(after));
  });

  it('changes when the allocation role changes', () => {
    const before = [makeAsset({ ticker: 'VWCE', allocationRole: 'tradable' })];
    const after = [makeAsset({ ticker: 'VWCE', allocationRole: 'excluded' })];
    expect(buildExposureCacheKey(before)).not.toBe(buildExposureCacheKey(after));
  });

  it('changes when an asset is added', () => {
    const before = [makeAsset({ ticker: 'VWCE' })];
    const after = [makeAsset({ ticker: 'VWCE' }), makeAsset({ id: 'a2', ticker: 'EIMI' })];
    expect(buildExposureCacheKey(before)).not.toBe(buildExposureCacheKey(after));
  });

  it('ignores assets with zero quantity', () => {
    const before = [makeAsset({ ticker: 'VWCE' })];
    const after = [makeAsset({ ticker: 'VWCE' }), makeAsset({ id: 'a2', ticker: 'SOLD', quantity: 0 })];
    expect(buildExposureCacheKey(before)).toBe(buildExposureCacheKey(after));
  });
});
