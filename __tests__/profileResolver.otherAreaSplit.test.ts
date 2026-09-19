/**
 * `otherAreaSplit` propagation (`doc/weight-optimizer-ate.md` §5.3, O3): when a curated
 * `INDEX_PROFILES` entry supplies both `countries` and `otherAreaSplit`, `profileResolver.ts` must
 * copy the split onto the resolved leg's `otherAreaSplit`, not just its `countries`. A separate file
 * because it needs a synthetic `INDEX_PROFILES` entry — no real curated entry has the field
 * populated yet (`instrumentProfiles.ts`'s header: it stays empty until a factsheet supplies it) —
 * and mocking that module here would otherwise collide with `profileResolver.test.ts`'s real-table
 * assertions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const fetchYahooFundData = vi.fn();
const fetchYahooStockData = vi.fn();
vi.mock('@/lib/server/exposure/yahooSource', () => ({
  fetchYahooFundData: (...args: unknown[]) => fetchYahooFundData(...args),
  fetchYahooStockData: (...args: unknown[]) => fetchYahooStockData(...args),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => undefined }),
        set: async () => undefined,
      }),
    }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

vi.mock('@/lib/constants/instrumentProfiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants/instrumentProfiles')>();
  return {
    ...actual,
    INSTRUMENT_PROFILES: {
      ...actual.INSTRUMENT_PROFILES,
      'TEST-SPLIT.MI': {
        ticker: 'TEST-SPLIT.MI',
        indexId: 'test-index-with-split',
        issuer: 'Test Issuer',
      },
    },
    INDEX_PROFILES: {
      ...actual.INDEX_PROFILES,
      'test-index-with-split': {
        indexId: 'test-index-with-split',
        label: 'Test Index (curated OTHER split)',
        countries: [
          { code: 'US', label: 'Stati Uniti', weight: 0.6 },
          { code: 'OTHER', label: 'Altri paesi', weight: 0.4 },
        ],
        otherAreaSplit: { developedExUs: 0.75, emerging: 0.25 },
        asOf: '2026-09-18',
        sourceUrl: 'https://example.test/factsheet',
      },
    },
  };
});

import { resolveInstrumentProfiles } from '@/lib/server/exposure/profileResolver';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: overrides.ticker ?? 'a',
    userId: 'u1',
    ticker: 'TICK',
    name: 'Asset',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  fetchYahooFundData.mockReset();
  fetchYahooStockData.mockReset();
});

describe('resolveInstrumentProfiles — otherAreaSplit propagation (O3, §5.3)', () => {
  it('copies the curated INDEX_PROFILES otherAreaSplit onto the resolved equity leg', async () => {
    fetchYahooFundData.mockResolvedValue({ holdings: undefined, sectors: undefined, issuerFamily: null });

    const asset = makeAsset({ ticker: 'TEST-SPLIT.MI', name: 'Test Split Fund', quantity: 10, currentPrice: 100 });
    const profiles = await resolveInstrumentProfiles([asset]);

    const profile = profiles.get('TEST-SPLIT.MI')!;
    expect(profile.legs?.equity?.countries).toEqual([
      { key: 'US', label: 'Stati Uniti', weight: 0.6 },
      { key: 'OTHER', label: 'Altri paesi', weight: 0.4 },
    ]);
    expect(profile.legs?.equity?.otherAreaSplit).toEqual({ developedExUs: 0.75, emerging: 0.25 });
  });

  it('never sets otherAreaSplit when the index profile has none', async () => {
    fetchYahooFundData.mockResolvedValue({
      holdings: [{ key: 'AAPL', label: 'Apple', weight: 0.07 }],
      sectors: undefined,
      issuerFamily: 'Amundi Asset Management',
    });

    // CL2.MI (real curated entry) resolves via msci-usa, which has countries but no otherAreaSplit.
    const asset = makeAsset({ ticker: 'CL2.MI', name: 'Amundi MSCI USA 2x', quantity: 150, currentPrice: 31.12 });
    const profiles = await resolveInstrumentProfiles([asset]);

    expect(profiles.get('CL2.MI')?.legs?.equity?.countries).toEqual([{ key: 'US', label: 'Stati Uniti', weight: 1 }]);
    expect(profiles.get('CL2.MI')?.legs?.equity?.otherAreaSplit).toBeUndefined();
  });
});
