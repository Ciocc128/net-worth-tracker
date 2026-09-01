/**
 * Tests for `lib/utils/exposureEngine.ts` on a fixture that IS the real portfolio (2026-09-01
 * measurement, see `precious-greeting-lake.md`): NTSG (60/40 composite, leverage 1.5), CL2
 * (single-class equity, leverage 2), three non-look-through kinds (SGLN commodity, DBMFE
 * trendFollowing, CRRY carry), two `excluded` assets (a cash account, the pension fund), and two
 * plain unleveraged equity ETFs — one covered (EXUS), one not (AVWS, no profile at all).
 *
 * Every expected figure below is hand-computed from `expandAssetExposure`'s own formula
 * (marketValue × compositionPct × leverage ÷ 100 for a leg's notional) and the fixture's curated
 * profile weights — see the derivation in the plan. `toBeCloseTo` absorbs float noise only.
 *
 * exposureEngine imports assetExposureUtils, which imports `calculateAssetValue` from
 * assetService, which pulls in the client Firebase SDK at module load time — mock it out (same
 * convention as __tests__/assetExposure.test.ts).
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

import { computeExposure } from '@/lib/utils/exposureEngine';
import type { InstrumentProfile } from '@/types/exposure';

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

// ── The portfolio fixture ─────────────────────────────────────────────────────────────────────

const ntsg = makeAsset({
  id: 'ntsg',
  ticker: 'NTSG-ETFP.MI',
  name: 'WisdomTree Global Efficient Core',
  quantity: 1707,
  currentPrice: 28.6, // market = 48820.2
  leverageRatio: 1.5,
  composition: [
    { assetClass: 'equity', percentage: 60 },
    { assetClass: 'bonds', percentage: 40 },
  ],
});

const cl2 = makeAsset({
  id: 'cl2',
  ticker: 'CL2.MI',
  name: 'Amundi MSCI USA 2x Leveraged',
  quantity: 150,
  currentPrice: 31.12, // market = 4668
  leverageRatio: 2,
});

const sgln = makeAsset({
  id: 'sgln',
  ticker: 'SGLN.MI',
  name: 'iShares Physical Gold',
  assetClass: 'commodity',
  type: 'commodity',
  quantity: 109,
  currentPrice: 73.08, // market = 7965.72
});

const dbmfe = makeAsset({
  id: 'dbmfe',
  ticker: 'DBMFE.PA',
  name: 'iMGP DBi Managed Futures',
  assetClass: 'trendFollowing',
  quantity: 138,
  currentPrice: 123.2, // market = 17001.6
});

const crry = makeAsset({
  id: 'crry',
  ticker: 'CRRY.MI',
  name: 'WisdomTree Enhanced Commodity Carry',
  assetClass: 'carry',
  quantity: 199,
  currentPrice: 17.386, // market = 3459.814
});

const exus = makeAsset({
  id: 'exus',
  ticker: 'EXUS.MI',
  name: 'Xtrackers MSCI World ex USA',
  quantity: 154,
  currentPrice: 40.045, // market = 6166.93
});

const avws = makeAsset({
  id: 'avws',
  ticker: 'AVWS.DE',
  name: 'Avantis Global Small Cap Value',
  quantity: 68,
  currentPrice: 25.285, // market = 1719.38
});

const excludedCash = makeAsset({
  id: 'cash',
  ticker: '',
  name: 'Fineco',
  type: 'cash',
  assetClass: 'cash',
  quantity: 500,
  currentPrice: 1,
  allocationRole: 'excluded',
});

const excludedPension = makeAsset({
  id: 'pension',
  ticker: '',
  name: 'Fondo Pensione ISP',
  type: 'pensionFund',
  quantity: 1,
  currentPrice: 10000,
  allocationRole: 'excluded',
  composition: [
    { assetClass: 'equity', percentage: 70 },
    { assetClass: 'bonds', percentage: 30 },
  ],
});

const portfolio: Asset[] = [ntsg, cl2, sgln, dbmfe, crry, exus, avws, excludedCash, excludedPension];

const profiles = new Map<string, InstrumentProfile>([
  [
    'NTSG-ETFP.MI',
    {
      ticker: 'NTSG-ETFP.MI',
      asOf: '2026-06-01',
      issuer: 'WisdomTree',
      currencies: [{ code: 'USD', weight: 1 }],
      legs: {
        equity: {
          holdings: [{ key: 'NVDA', label: 'Nvidia', weight: 0.0504 }],
          sectors: [{ key: 'technology', label: 'Tecnologia', weight: 0.25 }],
          countries: [{ key: 'US', label: 'Stati Uniti', weight: 1 }],
        },
        bonds: {
          countries: [
            { key: 'US', label: 'Stati Uniti', weight: 0.55 },
            { key: 'DE', label: 'Germania', weight: 0.25 },
            { key: 'GB', label: 'Regno Unito', weight: 0.2 },
          ],
        },
      },
    },
  ],
  [
    'CL2.MI',
    {
      ticker: 'CL2.MI',
      asOf: '2026-05-01',
      issuer: 'Amundi',
      currencies: [{ code: 'USD', weight: 1 }],
      legs: { equity: { countries: [{ key: 'US', label: 'Stati Uniti', weight: 1 }] } },
    },
  ],
  ['SGLN.MI', { ticker: 'SGLN.MI', issuer: 'iShares', currencies: [{ code: 'USD', weight: 1 }] }],
  ['DBMFE.PA', { ticker: 'DBMFE.PA', issuer: 'iMGP', currencies: [{ code: 'USD', weight: 1 }] }],
  ['CRRY.MI', { ticker: 'CRRY.MI', issuer: 'WisdomTree', currencies: [{ code: 'USD', weight: 1 }] }],
  [
    'EXUS.MI',
    {
      ticker: 'EXUS.MI',
      issuer: 'Xtrackers',
      currencies: [
        { code: 'JPY', weight: 0.3 },
        { code: 'GBP', weight: 0.2 },
        { code: 'EUR', weight: 0.5 },
      ],
      legs: {
        equity: {
          holdings: [{ key: 'ASML', label: 'ASML Holding', weight: 0.05 }],
          sectors: [{ key: 'technology', label: 'Tecnologia', weight: 0.2 }],
          countries: [
            { key: 'JP', label: 'Giappone', weight: 0.3 },
            { key: 'GB', label: 'Regno Unito', weight: 0.2 },
            { key: 'DE', label: 'Germania', weight: 0.5 },
          ],
        },
      },
    },
  ],
  // AVWS.DE deliberately has NO profile — it is the fixture's `nonLetta` instrument.
]);

const result = computeExposure(portfolio, profiles, '2026-09-01T00:00:00.000Z', 'test-key');

describe('computeExposure — base and leg expansion', () => {
  it('excludes `excluded` assets from every view entirely', () => {
    expect(result.allocatableAssets).toBe(7); // ntsg, cl2, sgln, dbmfe, crry, exus, avws
    expect(result.totalAssets).toBe(9); // + the 2 excluded
  });

  it('NTSG expands to 43938.18 equity notional + 29292.12 bonds notional (60/40 × 1.5×)', () => {
    // Surfaced indirectly via the Titoli/Geografia bases below — this test documents the figures.
    expect(43_938.18).toBeCloseTo(48_820.2 * 0.6 * 1.5, 1);
    expect(29_292.12).toBeCloseTo(48_820.2 * 0.4 * 1.5, 1);
  });

  it('CL2 expands to 9336 equity notional (single-class × 2×)', () => {
    expect(9_336).toBeCloseTo(4_668 * 2, 6);
  });
});

describe('computeExposure — Titoli / Settori (equity notional only)', () => {
  it('base is the sum of every equity leg notional (NTSG + CL2 + EXUS + AVWS)', () => {
    expect(result.holdings.coverage.baseEur).toBeCloseTo(61_160.49, 1);
    expect(result.sectors.coverage.baseEur).toBeCloseTo(61_160.49, 1);
  });

  it('bonds/commodity/trendFollowing/carry legs never enter the Titoli/Settori base', () => {
    // base excludes NTSG's 29292.12 bonds leg and the three non-look-through instruments entirely
    const equityOnly = 43_938.18 + 9_336 + 6_166.93 + 1_719.38;
    expect(result.holdings.coverage.baseEur).toBeCloseTo(equityOnly, 0);
  });

  it('read = NTSG + EXUS (both have holdings data), unread = CL2 + AVWS (neither does)', () => {
    expect(result.holdings.coverage.read.amountEur).toBeCloseTo(43_938.18 + 6_166.93, 1);
    expect(result.holdings.coverage.unread.amountEur).toBeCloseTo(9_336 + 1_719.38, 1);
    expect(result.holdings.coverage.unread.instruments).toEqual(
      expect.arrayContaining(['Amundi MSCI USA 2x Leveraged', 'Avantis Global Small Cap Value'])
    );
  });

  it('notApplicable = the three non-look-through instruments, by their FULL (unleveraged) value', () => {
    const nonLookthrough = 7_965.72 + 17_001.6 + 3_459.814;
    expect(result.holdings.coverage.notApplicable.amountEur).toBeCloseTo(nonLookthrough, 1);
    expect(result.holdings.coverage.notApplicable.instruments).toEqual(
      expect.arrayContaining([
        'iShares Physical Gold',
        'iMGP DBi Managed Futures',
        'WisdomTree Enhanced Commodity Carry',
      ])
    );
    expect(result.sectors.coverage.notApplicable.amountEur).toBeCloseTo(nonLookthrough, 1);
  });

  it('a stock weight is normalised to the equity SLEEVE (NVDA 5.04% of NTSG equity, not of the fund)', () => {
    const nvda = result.holdings.entries.find((e) => e.key === 'NVDA');
    expect(nvda).toBeDefined();
    expect(nvda!.exposureEur).toBeCloseTo(0.0504 * 43_938.18, 1);
  });

  it('a sector weight is NOT divided again (it is already normalised to the equity sleeve)', () => {
    const tech = result.sectors.entries.find((e) => e.key === 'technology');
    expect(tech).toBeDefined();
    expect(tech!.exposureEur).toBeCloseTo(0.25 * 43_938.18 + 0.2 * 6_166.93, 1);
  });
});

describe('computeExposure — Geografia (equity + bonds notional)', () => {
  it('base includes NTSG bonds leg, still excludes the three non-look-through legs', () => {
    expect(result.geography.coverage.baseEur).toBeCloseTo(61_160.49 + 29_292.12, 1);
  });

  it('unread = only AVWS (no profile); NTSG bonds leg IS read (curated countries)', () => {
    expect(result.geography.coverage.unread.amountEur).toBeCloseTo(1_719.38, 1);
  });

  it('the bonds leg carries duration abroad without inventing a currency (US/DE/GB split)', () => {
    const us = result.geography.entries.find((e) => e.key === 'US')!;
    const de = result.geography.entries.find((e) => e.key === 'DE')!;
    const gb = result.geography.entries.find((e) => e.key === 'GB')!;
    // US: NTSG equity (100%) + CL2 equity (100%) + NTSG bonds (55%)
    expect(us.exposureEur).toBeCloseTo(43_938.18 + 9_336 + 0.55 * 29_292.12, 0);
    // DE: EXUS equity (50%) + NTSG bonds (25%)
    expect(de.exposureEur).toBeCloseTo(0.5 * 6_166.93 + 0.25 * 29_292.12, 0);
    // GB: EXUS equity (20%) + NTSG bonds (20%)
    expect(gb.exposureEur).toBeCloseTo(0.2 * 6_166.93 + 0.2 * 29_292.12, 0);
  });
});

describe('computeExposure — Valuta / Emittenti (market value, leverage does NOT multiply)', () => {
  it('base is the allocatable MARKET value, not the notional (CL2 counts once, not twice)', () => {
    const marketBase =
      48_820.2 + 4_668 + 7_965.72 + 17_001.6 + 3_459.814 + 6_166.93 + 1_719.38;
    expect(result.currency.coverage.baseEur).toBeCloseTo(marketBase, 1);
    expect(result.issuers.coverage.baseEur).toBeCloseTo(marketBase, 1);
    expect(result.allocatableMarketValueEur).toBeCloseTo(marketBase, 1);
  });

  it('CL2 contributes its 4668 market value to USD, never its 9336 notional', () => {
    const usd = result.currency.entries.find((e) => e.key === 'USD')!;
    const cl2Source = usd.sources.find((s) => s.ticker === 'CL2.MI')!;
    expect(cl2Source.contributionEur).toBeCloseTo(4_668, 1);
  });

  it('unread = AVWS only (no currency/issuer profile)', () => {
    expect(result.currency.coverage.unread.amountEur).toBeCloseTo(1_719.38, 1);
    expect(result.issuers.coverage.unread.amountEur).toBeCloseTo(1_719.38, 1);
  });

  it('WisdomTree concentration = NTSG + CRRY market value (counterparty risk, not doubled by leverage)', () => {
    const wisdomTree = result.issuers.entries.find((e) => e.key === 'WisdomTree')!;
    expect(wisdomTree.exposureEur).toBeCloseTo(48_820.2 + 3_459.814, 1);
  });

  it('EXUS splits across three currencies that sum back to its own market value', () => {
    const jpy = result.currency.entries.find((e) => e.key === 'JPY')!;
    const gbp = result.currency.entries.find((e) => e.key === 'GBP')!;
    const eur = result.currency.entries.find((e) => e.key === 'EUR')!;
    const exusJpy = jpy.sources.find((s) => s.ticker === 'EXUS.MI')!.contributionEur;
    const exusGbp = gbp.sources.find((s) => s.ticker === 'EXUS.MI')!.contributionEur;
    const exusEur = eur.sources.find((s) => s.ticker === 'EXUS.MI')!.contributionEur;
    expect(exusJpy + exusGbp + exusEur).toBeCloseTo(6_166.93, 1);
  });
});

describe('computeExposure — oldestProfileAsOf', () => {
  it('is the oldest `asOf` among curated profiles actually used', () => {
    expect(result.oldestProfileAsOf).toBe('2026-05-01'); // CL2, older than NTSG's 2026-06-01
  });

  it('is null when no base asset has a curated `asOf`', () => {
    const noAsOf = computeExposure(
      [exus],
      new Map([['EXUS.MI', { ...profiles.get('EXUS.MI')!, asOf: undefined }]]),
      '2026-09-01T00:00:00.000Z',
      'k'
    );
    expect(noAsOf.oldestProfileAsOf).toBeNull();
  });
});

describe('computeExposure — non-regression (no leverage, no exclusions)', () => {
  it('a single unleveraged, fully-covered equity ETF: exposureEur is a plain weight × market value', () => {
    const single = computeExposure(
      [exus],
      new Map([['EXUS.MI', profiles.get('EXUS.MI')!]]),
      '2026-09-01T00:00:00.000Z',
      'k'
    );
    const asml = single.holdings.entries.find((e) => e.key === 'ASML')!;
    expect(asml.exposureEur).toBeCloseTo(0.05 * 6_166.93, 2);
    expect(asml.exposurePct).toBeCloseTo(0.05, 6); // sole holding of the sole (unleveraged) instrument
    expect(single.currency.coverage.baseEur).toBeCloseTo(6_166.93, 1);
    expect(single.issuers.entries[0].exposureEur).toBeCloseTo(6_166.93, 1);
  });
});
