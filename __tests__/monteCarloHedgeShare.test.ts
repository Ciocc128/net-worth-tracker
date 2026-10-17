/**
 * AL20 (D-AL6): the share of each hedgeable class held in instruments flagged «Coperto dal cambio in EUR»,
 * and the proposal the Simulazioni tile makes from it (doc/allineamento/README.md § 9.6).
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
import type { Asset } from '@/types/assets';
import { hedgedShareByClass, proposedHedgeClasses, HEDGE_PROPOSAL_SHARE } from '@/lib/utils/monteCarloHedgeShare';
import { describeHedgeProposal } from '@/lib/utils/settingsNarrative';
import { normalizeHedge } from '@/lib/constants/monteCarloMarketDefaults';

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: overrides.ticker ?? 'a',
    userId: 'u1',
    ticker: 'T',
    name: 'Asset',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('hedgedShareByClass', () => {
  it('measures the flagged market value over the class: 46 of 100 → 0,46', () => {
    const shares = hedgedShareByClass([
      asset({ ticker: 'MFEH', assetClass: 'trendFollowing', currentPrice: 46, currencyHedge: 'EUR' }),
      asset({ ticker: 'DBMFE', assetClass: 'trendFollowing', currentPrice: 54 }),
    ]);
    expect(shares.trendFollowing).toBeCloseTo(0.46, 10);
  });

  it('a class with nothing flagged reads 0, a class not held is absent', () => {
    const shares = hedgedShareByClass([asset({ ticker: 'VWCE', assetClass: 'equity' })]);
    expect(shares.equity).toBe(0);
    expect(shares.gold).toBeUndefined();
  });

  it('ignores the classes with no hedge switch (bonds, cash) and the pension-locked assets', () => {
    const shares = hedgedShareByClass(
      [
        asset({ ticker: 'BND', assetClass: 'bonds', currencyHedge: 'EUR' }),
        asset({ id: 'locked', ticker: 'LCK', assetClass: 'equity', currencyHedge: 'EUR' }),
        asset({ id: 'free', ticker: 'FRE', assetClass: 'equity' }),
      ],
      { lockedAssetIds: new Set(['locked']) }
    );
    expect(Object.keys(shares)).toEqual(['equity']);
    expect(shares.equity).toBe(0);
  });

  it('splits the commodity sub-category read as Oro', () => {
    const shares = hedgedShareByClass(
      [
        asset({ ticker: 'GLD', assetClass: 'commodity', subCategory: 'Oro', currencyHedge: 'EUR' }),
        asset({ ticker: 'OIL', assetClass: 'commodity', subCategory: 'Petrolio' }),
      ],
      { goldSubCategory: 'Oro' }
    );
    expect(shares.gold).toBe(1);
  });
});

describe('proposedHedgeClasses', () => {
  const off = normalizeHedge(undefined);

  it('proposes a class above 50% with its switch off, never at exactly 50%', () => {
    expect(proposedHedgeClasses({ trendFollowing: 0.51, carry: HEDGE_PROPOSAL_SHARE }, off)).toEqual(['trendFollowing']);
  });

  it('proposes nothing when the switch is already on', () => {
    expect(proposedHedgeClasses({ equity: 0.9 }, normalizeHedge({ equity: true }))).toEqual([]);
  });
});

describe('describeHedgeProposal', () => {
  it('says the share in the portfolio, rounded', () => {
    expect(describeHedgeProposal('trendFollowing', 0.46)).toBe('Nel tuo portafoglio il Trend è coperto per il 46%.');
    expect(describeHedgeProposal('equity', 0.6)).toBe('Nel tuo portafoglio le azioni sono coperte per il 60%.');
  });
});
