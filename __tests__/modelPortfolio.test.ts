import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import { toModelWeights, describeModelExclusions } from '@/lib/utils/modelPortfolio';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    userId: 'u1',
    ticker: id,
    name: id,
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

const VWCE = makeAsset('VWCE');
const XDEM = makeAsset('XDEM');
const FONDO = makeAsset('FONDO', { allocationRole: 'frozen' });
const CONTO = makeAsset('CONTO', { type: 'cash', assetClass: 'cash' });
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));

describe('toModelWeights (RM2)', () => {
  it('PA1/PZ1: drops the frozen asset and the cash account, rescales to 100', () => {
    const r = toModelWeights(
      [
        { assetId: 'VWCE', pct: 50 },
        { assetId: 'XDEM', pct: 25 },
        { assetId: 'FONDO', pct: 15 },
        { assetId: 'CONTO', pct: 10 },
      ],
      byId(VWCE, XDEM, FONDO, CONTO),
    );
    expect(r.weights).toEqual([
      { assetId: 'VWCE', pct: 66.67 },
      { assetId: 'XDEM', pct: 33.33 },
    ]);
    expect(r.excluded).toEqual([
      { assetId: 'FONDO', reason: 'frozen' },
      { assetId: 'CONTO', reason: 'cashAccount' },
    ]);
    expect(describeModelExclusions(r.excluded, (id) => id)).toBe(
      'FONDO resta fuori: bloccato in Impostazioni. CONTO resta fuori: è un conto di liquidità.',
    );
  });

  it('PZ2: three equal thirds put the leftover cent on the first of the largest', () => {
    const third = 100 / 3;
    const c = makeAsset('C');
    const r = toModelWeights(
      [{ assetId: 'VWCE', pct: third }, { assetId: 'XDEM', pct: third }, { assetId: 'C', pct: third }],
      byId(VWCE, XDEM, c),
    );
    expect(r.weights.map((w) => w.pct)).toEqual([33.34, 33.33, 33.33]);
  });

  it('keeps a money-market fund (cash class, not an account)', () => {
    const mm = makeAsset('MM', { assetClass: 'cash' });
    const r = toModelWeights([{ assetId: 'MM', pct: 100 }], byId(mm));
    expect(r.weights).toEqual([{ assetId: 'MM', pct: 100 }]);
  });

  it('returns no weights when nothing tradable is left', () => {
    const r = toModelWeights([{ assetId: 'CONTO', pct: 100 }], byId(CONTO));
    expect(r.weights).toEqual([]);
  });
});
