/**
 * Tests for `calculateStampDuty` (lib/services/assetService.ts) — spec
 * docs/specs/6-asset-class-selection.md decision 4: the checking-account flat-fee rule (34,20€
 * above 5.000€) applies only to a TRUE conto corrente (`type === 'cash' && assetClass === 'cash'`),
 * never to a money-market ETF that merely carries `assetClass: 'cash'` for allocation purposes.
 *
 * assetService.ts imports the client Firebase SDK at module load time — mock it out so the suite
 * doesn't need real Firebase env vars (same convention as __tests__/assetExposure.test.ts).
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
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

import { calculateStampDuty } from '@/lib/services/assetService';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'AST',
    name: 'Asset',
    type: 'stock',
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

const CHECKING_SUBCATEGORY = 'Conto Corrente';

describe('calculateStampDuty', () => {
  it('applies the flat checking-account rule only above 5.000€ for a real conto (type+class cash)', () => {
    const below = makeAsset({
      id: 'below',
      type: 'cash',
      assetClass: 'cash',
      subCategory: CHECKING_SUBCATEGORY,
      quantity: 4000,
      currentPrice: 1,
    });
    const above = makeAsset({
      id: 'above',
      type: 'cash',
      assetClass: 'cash',
      subCategory: CHECKING_SUBCATEGORY,
      quantity: 6000,
      currentPrice: 1,
    });

    expect(calculateStampDuty([below], 0.2, CHECKING_SUBCATEGORY)).toBe(0);
    expect(calculateStampDuty([above], 0.2, CHECKING_SUBCATEGORY)).toBeCloseTo(6000 * 0.002, 5);
  });

  it('taxes a money-market ETF (type etf, assetClass cash) at 0,2% even under 5.000€, never the flat rule', () => {
    const xeon = makeAsset({
      id: 'xeon',
      type: 'etf',
      assetClass: 'cash',
      subCategory: CHECKING_SUBCATEGORY,
      quantity: 40,
      currentPrice: 100, // 4000€ — under the 5.000€ checking-account threshold
    });

    expect(calculateStampDuty([xeon], 0.2, CHECKING_SUBCATEGORY)).toBeCloseTo(4000 * 0.002, 5);
  });

  it('taxes a normal security (type+class stock/equity) at 0,2%', () => {
    const stock = makeAsset({
      id: 'stock',
      type: 'stock',
      assetClass: 'equity',
      quantity: 20,
      currentPrice: 50, // 1000€
    });

    expect(calculateStampDuty([stock], 0.2)).toBeCloseTo(1000 * 0.002, 5);
  });

  it('excludes sold assets (quantity=0) and stampDutyExempt assets', () => {
    const sold = makeAsset({ id: 'sold', quantity: 0, currentPrice: 100 });
    const exempt = makeAsset({ id: 'exempt', quantity: 10, currentPrice: 100, stampDutyExempt: true });

    expect(calculateStampDuty([sold, exempt], 0.2)).toBe(0);
  });
});
