/**
 * Integration tests for `lib/server/exposure/profileResolver.ts` — the cascade that turns
 * (curated table + Yahoo Finance) into the `InstrumentProfile` map `exposureEngine.ts` consumes.
 * Yahoo and Firestore are both mocked: this tests the RESOLUTION LOGIC (aliasing, normalisation
 * pass-through, currency precedence, the instrument-profile cache), not network I/O.
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

// In-memory fake for adminDb.collection('instrument-profile-cache').doc(ticker).get()/.set()
const fakeCacheStore = new Map<string, { cachedAt: { toMillis: () => number }; profile: unknown }>();
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (ticker: string) => ({
        get: async () => {
          const entry = fakeCacheStore.get(ticker);
          return { exists: !!entry, data: () => entry };
        },
        set: async (value: { cachedAt: { toMillis: () => number }; profile: unknown }) => {
          fakeCacheStore.set(ticker, value);
        },
      }),
    }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

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
  fakeCacheStore.clear();
  fetchYahooFundData.mockReset();
  fetchYahooStockData.mockReset();
});

describe('resolveInstrumentProfiles — curated aliasing', () => {
  it('NTSG-ETFP.MI queries Yahoo via its NTSG.MI alias, not its own (unlisted) ticker', async () => {
    fetchYahooFundData.mockResolvedValue({
      holdings: [{ key: 'NVDA', label: 'Nvidia', weight: 0.05 }],
      sectors: [{ key: 'technology', label: 'Tecnologia', weight: 0.25 }],
      issuerFamily: 'WisdomTree Management Limited',
    });

    const ntsg = makeAsset({
      ticker: 'NTSG-ETFP.MI',
      name: 'WisdomTree Global Efficient Core',
      quantity: 1707,
      currentPrice: 28.6,
      leverageRatio: 1.5,
      composition: [
        { assetClass: 'equity', percentage: 60 },
        { assetClass: 'bonds', percentage: 40 },
      ],
    });

    const profiles = await resolveInstrumentProfiles([ntsg]);

    expect(fetchYahooFundData).toHaveBeenCalledWith('NTSG.MI');
    const profile = profiles.get('NTSG-ETFP.MI')!;
    expect(profile.issuer).toBe('WisdomTree'); // curated override, not the raw Yahoo family
    expect(profile.currencies).toEqual([{ code: 'USD', weight: 1 }]); // curated rule, not derived
    expect(profile.legs?.equity?.holdings).toEqual([{ key: 'NVDA', label: 'Nvidia', weight: 0.05 }]);
    expect(profile.legs?.bonds).toBeUndefined(); // no curated bond-sleeve geography yet — declared gap
  });

  it('CL2.MI queries Yahoo via its CSUS.MI proxy and derives US/USD from the curated msci-usa index', async () => {
    fetchYahooFundData.mockResolvedValue({
      holdings: [{ key: 'AAPL', label: 'Apple', weight: 0.07 }],
      sectors: [{ key: 'technology', label: 'Tecnologia', weight: 0.3 }],
      issuerFamily: 'Amundi Asset Management',
    });

    const cl2 = makeAsset({ ticker: 'CL2.MI', name: 'Amundi MSCI USA 2x', quantity: 150, currentPrice: 31.12, leverageRatio: 2 });

    const profiles = await resolveInstrumentProfiles([cl2]);

    expect(fetchYahooFundData).toHaveBeenCalledWith('CSUS.MI');
    const profile = profiles.get('CL2.MI')!;
    expect(profile.issuer).toBe('Amundi');
    expect(profile.legs?.equity?.countries).toEqual([{ key: 'US', label: 'Stati Uniti', weight: 1 }]);
    expect(profile.currencies).toEqual([{ code: 'USD', weight: 1 }]); // derived from msci-usa's countries
  });
});

describe('resolveInstrumentProfiles — kind instruments (no look-through)', () => {
  it('a commodity/trendFollowing/carry instrument gets NO holdings/sectors call, only fundProfile for the issuer', async () => {
    fetchYahooFundData.mockResolvedValue({ holdings: undefined, sectors: undefined, issuerFamily: 'BlackRock (Switzerland)' });

    const sgln = makeAsset({ ticker: 'SGLN.MI', name: 'iShares Physical Gold', assetClass: 'commodity', type: 'commodity', quantity: 109, currentPrice: 73.08 });

    const profiles = await resolveInstrumentProfiles([sgln]);

    const profile = profiles.get('SGLN.MI')!;
    expect(profile.issuer).toBe('iShares'); // curated override
    expect(profile.currencies).toEqual([{ code: 'USD', weight: 1 }]); // USD-by-convention rule
    expect(profile.legs).toBeUndefined(); // no equity/bonds leg exists for a commodity asset
  });
});

describe('resolveInstrumentProfiles — direct stocks', () => {
  it('resolves a stock generically: self-holding, assetProfile sector/country, own name as issuer, asset.currency', async () => {
    fetchYahooStockData.mockResolvedValue({
      sector: { key: 'technology', label: 'Tecnologia', weight: 1 },
      country: { code: 'IT', label: 'Italy', weight: 1 },
    });

    const bsp = makeAsset({ ticker: 'BSP', name: 'Bending Spoons', type: 'stock', currency: 'USD', quantity: 50, currentPrice: 41.35 });

    const profiles = await resolveInstrumentProfiles([bsp]);

    expect(fetchYahooStockData).toHaveBeenCalledWith('BSP');
    const profile = profiles.get('BSP')!;
    expect(profile.issuer).toBe('Bending Spoons');
    expect(profile.currencies).toEqual([{ code: 'USD', weight: 1 }]); // asset.currency, no override needed
    expect(profile.legs?.equity?.holdings).toEqual([{ key: 'BSP', label: 'Bending Spoons', weight: 1 }]);
    expect(profile.legs?.equity?.sectors).toEqual([{ key: 'technology', label: 'Tecnologia', weight: 1 }]);
    expect(profile.legs?.equity?.countries).toEqual([{ key: 'IT', label: 'Italy', weight: 1 }]);
  });
});

describe('resolveInstrumentProfiles — scope and dedup', () => {
  it('never resolves an `excluded` asset (no Yahoo call at all)', async () => {
    const cash = makeAsset({ ticker: 'XEON.DE', type: 'etf', allocationRole: 'excluded', quantity: 2.5, currentPrice: 150 });
    await resolveInstrumentProfiles([cash]);
    expect(fetchYahooFundData).not.toHaveBeenCalled();
  });

  it('resolves a repeated ticker exactly once', async () => {
    fetchYahooFundData.mockResolvedValue({ holdings: undefined, sectors: undefined, issuerFamily: 'X' });
    const a = makeAsset({ id: 'a', ticker: 'EXUS.MI', quantity: 10, currentPrice: 40 });
    const b = makeAsset({ id: 'b', ticker: 'EXUS.MI', quantity: 5, currentPrice: 40 });
    await resolveInstrumentProfiles([a, b]);
    expect(fetchYahooFundData).toHaveBeenCalledTimes(1);
  });
});

describe('resolveInstrumentProfiles — the 30-day instrument-profile cache', () => {
  it('a fresh cache entry serves without calling Yahoo again', async () => {
    fetchYahooFundData.mockResolvedValue({ holdings: undefined, sectors: undefined, issuerFamily: 'X' });
    const asset = makeAsset({ ticker: 'EXUS.MI', quantity: 10, currentPrice: 40 });

    await resolveInstrumentProfiles([asset]); // first call: cache miss, writes cache
    expect(fetchYahooFundData).toHaveBeenCalledTimes(1);

    await resolveInstrumentProfiles([asset]); // second call: fresh cache, no Yahoo call
    expect(fetchYahooFundData).toHaveBeenCalledTimes(1);
  });

  it('a stale-but-usable cache is used as a fallback when a fresh resolution comes back empty', async () => {
    const ticker = 'EXUS.MI';
    fakeCacheStore.set(ticker, {
      cachedAt: { toMillis: () => Date.now() - 40 * 24 * 60 * 60 * 1000 }, // 40 days old — past the 30-day TTL
      profile: { ticker, issuer: 'Xtrackers', legs: { equity: { holdings: [{ key: 'ASML', label: 'ASML', weight: 0.05 }] } } },
    });
    // Simulates a Yahoo outage: nothing usable comes back.
    fetchYahooFundData.mockResolvedValue({ holdings: undefined, sectors: undefined, issuerFamily: null });

    const asset = makeAsset({ ticker, quantity: 10, currentPrice: 40 });
    const profiles = await resolveInstrumentProfiles([asset]);

    expect(profiles.get(ticker)?.issuer).toBe('Xtrackers'); // fell back to the stale-but-usable cache
  });
});
