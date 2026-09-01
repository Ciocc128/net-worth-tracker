import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import { resolveIssuer } from '@/lib/server/exposure/issuerResolver';

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

describe('resolveIssuer', () => {
  it('a curated override always wins, even over a resolvable Yahoo family', () => {
    const asset = makeAsset({ ticker: 'NTSG-ETFP.MI', name: 'WisdomTree Global Efficient Core' });
    expect(resolveIssuer(asset, 'WisdomTree Management Limited', 'WisdomTree')).toBe('WisdomTree');
  });

  it('merges two different Yahoo family strings for the same real issuer via the override', () => {
    const ntsg = makeAsset({ ticker: 'NTSG-ETFP.MI' });
    const crry = makeAsset({ ticker: 'CRRY.MI' });
    expect(resolveIssuer(ntsg, 'WisdomTree Management Limited', 'WisdomTree')).toBe(
      resolveIssuer(crry, 'WisdomTree Multi Asset Issuer PLC', 'WisdomTree')
    );
  });

  it('a direct stock resolves to its own company name, never a Yahoo fund family', () => {
    const stock = makeAsset({ ticker: 'BRK-B', name: 'Berkshire Hathaway Inc.', type: 'stock' });
    expect(resolveIssuer(stock, null, undefined)).toBe('Berkshire Hathaway Inc.');
  });

  it('a stock ignores a curated override absence and Yahoo family both — its name always wins', () => {
    const stock = makeAsset({ ticker: 'BSP', name: 'Bending Spoons', type: 'stock' });
    expect(resolveIssuer(stock, 'Some Fund Family', undefined)).toBe('Bending Spoons');
  });

  it('a fund with no override falls back to the raw Yahoo family', () => {
    const asset = makeAsset({ ticker: 'AVWS.DE' });
    expect(resolveIssuer(asset, 'Avantis Investors', undefined)).toBe('Avantis Investors');
  });

  it('a fund with neither an override nor a Yahoo family is unread (null), never "Altro"', () => {
    const asset = makeAsset({ ticker: 'UNKNOWN.XX' });
    expect(resolveIssuer(asset, null, undefined)).toBeNull();
  });
});
