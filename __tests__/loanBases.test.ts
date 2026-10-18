/**
 * R11-S2 / D-R11-2 (doc/allineamento-upstream/undicesimo.md § 9): the two bases of a conto with a debt.
 * Bilanciamento (and the PAC through `compareAllocations`) reads Liquidità NET of a personal loan; the optimizer's
 * candidates, the FIRE capital and the Esposizione base keep the debt out. Figures invented and round (WORKFLOW.md § 1.7).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { compareAllocations } from '@/lib/services/assetAllocationService';
import { buildStandaloneCandidates } from '@/lib/utils/weightOptimizer';
import { resolveFireCapital } from '@/lib/utils/fireCapital';
import { computeExposure } from '@/lib/utils/exposureEngine';

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'a',
    userId: 'u1',
    ticker: 'VWCE',
    name: 'Asset',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const TARGETS = { equity: { targetPercentage: 80 }, cash: { targetPercentage: 20 } };
const valueOf = (asset: Asset): number => asset.quantity * asset.currentPrice * (asset.type === 'loan' ? -1 : 1);

const ETF = makeAsset({ id: 'etf', quantity: 100, currentPrice: 1000 }); // 100.000
const CASH = makeAsset({ id: 'cash', type: 'cash', assetClass: 'cash', ticker: 'CC', quantity: 20000, currentPrice: 1 });
const LOAN = makeAsset({ id: 'loan', type: 'loan', assetClass: 'cash', ticker: 'LOAN', quantity: 5000, currentPrice: 1 }); // -5.000, personal

describe('R11-S2 — a personal loan of 5.000 € over an ETF of 100.000 € and 20.000 € of cash', () => {
  const assets = [ETF, CASH, LOAN];

  it('Bilanciamento reads Liquidità net: 15.000 € on a base of 115.000 €', () => {
    const result = compareAllocations(assets, TARGETS);
    expect(result.byAssetClass.cash.currentValue).toBe(15000);
    expect(result.totalValue).toBe(115000);
  });

  it('the optimizer proposes only the ETF as a candidate and never the cash or the debt', () => {
    const { positions } = buildStandaloneCandidates(assets, 120000, valueOf);
    expect(positions.map((p) => p.buyAssetId)).toEqual(['etf']);
    expect((100000 / 120000) * 100).toBeCloseTo(83.33, 2);
  });

  it('the FIRE capital is what it was without the loan', () => {
    expect(resolveFireCapital(assets, valueOf).portfolio).toBe(resolveFireCapital([ETF, CASH], valueOf).portfolio);
  });

  it('the Esposizione base leaves the loan out', () => {
    const exposure = computeExposure(assets, new Map(), '2026-10-18T00:00:00Z', 'k');
    expect(exposure.allocatableMarketValueEur).toBe(computeExposure([ETF, CASH], new Map(), '2026-10-18T00:00:00Z', 'k').allocatableMarketValueEur);
  });
});

describe('R11-S2 — a mortgage of 120.000 € on a home of 200.000 € EXCLUDED from the allocation', () => {
  const home = makeAsset({ id: 'home', type: 'realestate', assetClass: 'realestate', ticker: 'CASA', quantity: 1, currentPrice: 200000, allocationRole: 'excluded' });
  const mortgage = makeAsset({ id: 'mortgage', type: 'loan', assetClass: 'realestate', ticker: 'MUT', quantity: 120000, currentPrice: 1, financedAssetId: 'home' });

  it('every figure of Bilanciamento, the optimizer and the FIRE is the one without them', () => {
    const base = [ETF, CASH];
    const withHome = [...base, home, mortgage];
    const a = compareAllocations(withHome, TARGETS);
    const b = compareAllocations(base, TARGETS);
    expect(a.totalValue).toBe(b.totalValue);
    expect(a.byAssetClass.cash.currentValue).toBe(b.byAssetClass.cash.currentValue);
    expect(buildStandaloneCandidates(withHome, 120000, valueOf).positions.map((p) => p.buyAssetId)).toEqual(['etf']);
    expect(resolveFireCapital(withHome, valueOf).portfolio).toBe(resolveFireCapital(base, valueOf).portfolio);
  });
});
