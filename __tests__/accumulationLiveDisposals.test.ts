/**
 * D-A9 (doc/pac-ottimizzatore/README.md): a plan sale still to do is worth TODAY's proceeds in the
 * recalibration (RP3), the revision (RP4) and the tile — never the figure frozen at activation.
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AccumulationPlan, PlanDisposal } from '@/types/accumulationPlan';
import { unitPriceEur } from '@/lib/utils/costBasisEur';
import {
  buildRevisedPlan,
  computeUsableLiquidity,
  displayedProceedsOfDisposal,
  recalibrateInstallment,
  shouldProposeRecalibration,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';

function makeAsset(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    userId: 'u1',
    ticker: overrides.id.toUpperCase(),
    name: overrides.id.toUpperCase(),
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 0,
    currentPrice: 0,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const deps: PlanDeps = {
  valueOf: (a) => a.quantity * unitPriceEur(a),
  priceOf: (a) => unitPriceEur(a),
};

const VWCE = makeAsset({ id: 'vwce', quantity: 0, currentPrice: 120 });
// Saved at 5100 € (150 × 34), worth 150 × 33,1867 = 4978,005 € today.
const EIMI = makeAsset({ id: 'eimi', quantity: 150, currentPrice: 33.1867 });
const CASH = makeAsset({ id: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 1000 });

function byId(...assets: Asset[]): Map<string, Asset> {
  return new Map(assets.map((a) => [a.id, a]));
}

function buildPlan(disposal: Partial<PlanDisposal> = {}): AccumulationPlan {
  return {
    id: 'plan1',
    userId: 'u1',
    name: 'Piano',
    status: 'active',
    startMonth: '2026-10',
    months: 4,
    liquidity: { sourceCashAssetIds: ['cash'], reserveEur: 0, monthlyInflowEur: 1000 },
    positions: [{ id: 'p1', label: 'VWCE', targetPercentage: 100, memberAssetIds: ['vwce'], buyAssetId: 'vwce' }],
    disposals: [{ assetId: 'eimi', estimatedProceedsEur: 5100, status: 'planned', monthIndex: 1, ...disposal }],
    installments: [1, 2, 3, 4].map((index) => ({
      index,
      month: `2026-${String(9 + index).padStart(2, '0')}`,
      lines: [
        {
          positionId: 'p1',
          assetId: 'vwce',
          plannedQuantity: 25,
          priceEurAtPlan: 120,
          plannedAmountEur: 3000,
          status: index === 1 ? ('skipped' as const) : ('planned' as const),
        },
      ],
      carryInEur: { p1: 0 },
    })),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe('D-A9 — a sale still to do at today’s proceeds', () => {
  it('the liquidity counts today’s 4978 €, not the 5100 € saved at activation', () => {
    const plan = buildPlan();
    const liquidity = computeUsableLiquidity(plan.liquidity, byId(VWCE, EIMI, CASH), plan.disposals, 3, deps);
    expect(liquidity.disposalProceedsEur).toBeCloseTo(4978.005, 6);
    expect(liquidity.L).toBeCloseTo(1000 + 4978.005 + 3000, 6);
  });

  it('the recalibration of month 2 suggests 24 shares (8978 € / 3 = 2992,67 €) and is proposed', () => {
    const plan = buildPlan();
    const result = recalibrateInstallment(plan, 2, byId(VWCE, EIMI, CASH), deps);
    const line = result.lines.find((l) => l.positionId === 'p1')!;
    expect(line.plannedQuantity).toBe(25);
    expect(line.suggestedQuantity).toBe(24);
    expect(shouldProposeRecalibration(result)).toBe(true);
  });

  it('a partial sale is valued at its shares × today’s price', () => {
    const plan = buildPlan({ quantity: 100, estimatedProceedsEur: 3400 });
    const liquidity = computeUsableLiquidity(plan.liquidity, byId(VWCE, EIMI, CASH), plan.disposals, 3, deps);
    expect(liquidity.disposalProceedsEur).toBeCloseTo(3318.67, 6);
  });

  it('shares already sold off the ledger without a link count 0 (their cash is in the accounts)', () => {
    const plan = buildPlan();
    const sold = makeAsset({ id: 'eimi', quantity: 0, currentPrice: 33.1867 });
    const liquidity = computeUsableLiquidity(plan.liquidity, byId(VWCE, sold, CASH), plan.disposals, 3, deps);
    expect(liquidity.disposalProceedsEur).toBe(0);
  });

  it('an executed or skipped sale stays out of the liquidity', () => {
    for (const status of ['executed', 'skipped'] as const) {
      const plan = buildPlan({ status, executedAmountEur: 5050 });
      const liquidity = computeUsableLiquidity(plan.liquidity, byId(VWCE, EIMI, CASH), plan.disposals, 3, deps);
      expect(liquidity.disposalProceedsEur).toBe(0);
    }
  });

  it('«Rivedi il piano» counts the kept open sale at today’s proceeds and saves that figure', () => {
    const plan = buildPlan();
    const result = buildRevisedPlan(
      plan,
      { monthlyInflowEur: 1000, reserveEur: 0, remainingMonths: 3, positions: plan.positions, disposals: [] },
      byId(VWCE, EIMI, CASH),
      deps,
      new Date('2026-11-01T12:00:00Z')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.firstIndex).toBe(2);
    expect(result.liquidity.disposalProceedsEur).toBeCloseTo(4978.005, 6);
    expect(result.plan.disposals[0].estimatedProceedsEur).toBeCloseTo(4978.005, 6);
    expect(result.plan.disposals[0].monthIndex).toBe(1);
    // 8978 € over 3 months at 120 € (2992,67 € a month, the carry rolling): 24 + 25 + 25 = 74 shares;
    // at the frozen 5100 € (9100 €) it was 25 + 25 + 25 = 75.
    expect(result.plan.installments.filter((i) => i.index >= 2).map((i) => i.lines[0]?.plannedQuantity)).toEqual([24, 25, 25]);
  });

  it('«Rivedi il piano» leaves an executed sale’s saved figures as they are', () => {
    const plan = buildPlan({ status: 'executed', executedAmountEur: 5050, transactionIds: ['t1'] });
    const result = buildRevisedPlan(
      plan,
      { monthlyInflowEur: 1000, reserveEur: 0, remainingMonths: 3, positions: plan.positions, disposals: [] },
      byId(VWCE, EIMI, CASH),
      deps,
      new Date('2026-11-01T12:00:00Z')
    );
    expect(result.ok && result.plan.disposals[0]).toEqual(plan.disposals[0]);
  });

  it('the tile shows today’s proceeds while to do, the registered amount once executed', () => {
    const assets = byId(VWCE, EIMI, CASH);
    expect(displayedProceedsOfDisposal(buildPlan().disposals[0], assets.get('eimi'), deps)).toBeCloseTo(4978.005, 6);
    const executed = buildPlan({ status: 'executed', executedAmountEur: 5050 }).disposals[0];
    expect(displayedProceedsOfDisposal(executed, assets.get('eimi'), deps)).toBe(5050);
    const skipped = buildPlan({ status: 'skipped' }).disposals[0];
    expect(displayedProceedsOfDisposal(skipped, assets.get('eimi'), deps)).toBe(5100);
    const sold = makeAsset({ id: 'eimi', quantity: 0, currentPrice: 33.1867 });
    expect(displayedProceedsOfDisposal(buildPlan().disposals[0], sold, deps)).toBe(5100);
  });
});
