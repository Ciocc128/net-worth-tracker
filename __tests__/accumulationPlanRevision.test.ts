/**
 * A3 — the PAC's partial sales (RP2), «Rivedi il piano» (RP4) and the recalibration proposal (RP3),
 * on the dossier's fixture F (doc/pac-ottimizzatore/README.md § 8, PP1–PP7).
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AccumulationPlan, PlanDisposal, PlanLiquidity, PlanPosition } from '@/types/accumulationPlan';
import { unitPriceEur } from '@/lib/utils/costBasisEur';
import {
  buildRevisedPlan,
  computeTotalPurchases,
  computeUsableLiquidity,
  findFirstIntactInstallment,
  proceedsOfDisposal,
  recalibrateInstallment,
  resolvePositionStates,
  scheduleInstallments,
  seedDisposalsFromSale,
  shouldProposeRecalibration,
  recalibrationQuantities,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `a${seq}`, userId: 'u1', ticker: 'X', name: 'X', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 0, lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  };
}

const deps: PlanDeps = { valueOf: (a) => a.quantity * unitPriceEur(a), priceOf: (a) => unitPriceEur(a) };
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));

const vwce = (quantity = 100) => makeAsset({ id: 'vwce', name: 'VWCE', quantity, currentPrice: 120 });
const xdem = (quantity = 200) => makeAsset({ id: 'xdem', name: 'XDEM', quantity, currentPrice: 60 });
const conto = (value = 30000) => makeAsset({ id: 'conto', name: 'CONTO', type: 'cash', assetClass: 'cash', quantity: value, currentPrice: 1 });

const positions: PlanPosition[] = [
  { id: 'pv', label: 'VWCE', targetPercentage: 70, memberAssetIds: ['vwce'], buyAssetId: 'vwce' },
  { id: 'px', label: 'XDEM', targetPercentage: 30, memberAssetIds: ['xdem'], buyAssetId: 'xdem' },
];
const liquidity: PlanLiquidity = { sourceCashAssetIds: ['conto'], reserveEur: 10000, monthlyInflowEur: 500 };
const sale = (overrides: Partial<PlanDisposal> = {}): PlanDisposal => ({
  assetId: 'xdem', quantity: 100, monthIndex: 1, estimatedProceedsEur: 6000, status: 'planned', ...overrides,
});

function planOnF() {
  const assets = byId(vwce(), xdem(), conto());
  const disposals = [sale()];
  const liq = computeUsableLiquidity(liquidity, assets, disposals, 10, deps);
  const states = resolvePositionStates(positions, assets, deps, disposals);
  const totals = computeTotalPurchases(states, liq.L);
  const schedule = scheduleInstallments(totals, states, 10, '2026-11');
  const plan: AccumulationPlan = {
    id: 'p', userId: 'u1', name: 'PAC', status: 'active', startMonth: '2026-11', months: 10, liquidity, positions,
    disposals, installments: schedule.installments, residualEur: schedule.residualEur,
    createdAt: new Date(0), updatedAt: new Date(0),
  };
  return { assets, liq, totals, schedule, plan };
}

const qty = (plan: AccumulationPlan, index: number, positionId: string) =>
  plan.installments.find((i) => i.index === index)?.lines.find((l) => l.positionId === positionId)?.plannedQuantity ?? 0;

describe('RP2 — partial sales (PP1)', () => {
  it('PP1: L0 26.000, L 31.000, purchases 22.300 / 8.700, the calendar and the 100 € residual', () => {
    const { liq, totals, schedule } = planOnF();
    expect(liq.L0).toBeCloseTo(26000, 2);
    expect(liq.L).toBeCloseTo(31000, 2);
    expect(totals.pv).toBeCloseTo(22300, 2);
    expect(totals.px).toBeCloseTo(8700, 2);
    const rows = (id: string) => schedule.installments.map((i) => i.lines.find((l) => l.positionId === id)?.plannedQuantity ?? 0);
    expect(rows('pv')).toEqual([18, 19, 18, 19, 18, 19, 19, 18, 19, 18]);
    expect(rows('px')).toEqual([14, 15, 14, 15, 14, 15, 14, 15, 14, 15]);
    expect(schedule.residualEur).toBeCloseTo(100, 2);
  });

  it('without the sale netted out, the purchases would be 26.500 / 4.500', () => {
    const assets = byId(vwce(), xdem(), conto());
    const liq = computeUsableLiquidity(liquidity, assets, [sale()], 10, deps);
    const totals = computeTotalPurchases(resolvePositionStates(positions, assets, deps), liq.L);
    expect(totals.pv).toBeCloseTo(26500, 2);
    expect(totals.px).toBeCloseTo(4500, 2);
  });

  it('an executed sale no longer comes off the position (it already left the ledger)', () => {
    const states = resolvePositionStates(positions, byId(vwce(), xdem(100), conto()), deps, [sale({ status: 'executed' })]);
    expect(states[1].currentValueEur).toBeCloseTo(6000, 2);
  });

  it('proceedsOfDisposal: quantity × price, capped at the held shares, whole value when absent', () => {
    expect(proceedsOfDisposal(sale(), xdem(), deps)).toBe(6000);
    expect(proceedsOfDisposal(sale({ quantity: 500 }), xdem(), deps)).toBe(12000);
    expect(proceedsOfDisposal(sale({ quantity: undefined }), xdem(), deps)).toBe(12000);
  });
});

describe('RP4 — «Rivedi il piano» (PP2–PP4)', () => {
  function afterThreeRates() {
    const { plan } = planOnF();
    for (const installment of plan.installments.filter((i) => i.index <= 3)) {
      installment.lines.forEach((l) => { l.status = 'executed'; l.transactionIds = ['t']; });
    }
    plan.disposals = [sale({ status: 'executed' })];
    const assets = byId(vwce(155), xdem(143), conto(28320));
    return { plan, assets };
  }
  const revision = (plan: AccumulationPlan, overrides = {}) => ({
    monthlyInflowEur: 800, reserveEur: 10000, remainingMonths: 7, positions: plan.positions, disposals: [], ...overrides,
  });

  it('PP2: k = 4, L0 18.320, L 23.920, purchases 17.170 / 6.750, calendar, residual 40, months 10, one revision', () => {
    const { plan, assets } = afterThreeRates();
    const before = JSON.stringify(plan.installments.filter((i) => i.index <= 3));
    const result = buildRevisedPlan(plan, revision(plan), assets, deps, new Date('2026-12-01'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.firstIndex).toBe(4);
    expect(result.liquidity.L0).toBeCloseTo(18320, 2);
    expect(result.liquidity.L).toBeCloseTo(23920, 2);
    const revised = result.plan;
    expect(JSON.stringify(revised.installments.filter((i) => i.index <= 3))).toBe(before);
    expect(revised.installments.map((i) => i.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(revised.installments[3].month).toBe('2027-02');
    expect([4, 5, 6, 7, 8, 9, 10].map((i) => qty(revised, i, 'pv'))).toEqual([20, 20, 21, 20, 21, 20, 21]);
    expect([4, 5, 6, 7, 8, 9, 10].map((i) => qty(revised, i, 'px'))).toEqual([16, 16, 16, 16, 16, 16, 16]);
    expect(revised.residualEur).toBeCloseTo(40, 2);
    expect(revised.months).toBe(10);
    expect(revised.revisions).toHaveLength(1);
    expect(revised.revisions![0]).toMatchObject({ fromIndex: 4, before: { monthlyInflowEur: 500, months: 10 } });
  });

  it('PP3: 10 months remaining → 13; 58 → months_range', () => {
    const { plan, assets } = afterThreeRates();
    const ok = buildRevisedPlan(plan, revision(plan, { remainingMonths: 10 }), assets, deps, new Date());
    expect(ok.ok && ok.plan.months).toBe(13);
    const bad = buildRevisedPlan(plan, revision(plan, { remainingMonths: 58 }), assets, deps, new Date());
    expect(bad).toEqual({ ok: false, issue: 'months_range' });
  });

  it('PP4: an installment with an executed line is not revised, k moves to the next', () => {
    const { plan, assets } = afterThreeRates();
    plan.installments[3].lines[0].status = 'executed';
    expect(findFirstIntactInstallment(plan)?.index).toBe(5);
    const result = buildRevisedPlan(plan, revision(plan, { remainingMonths: 6 }), assets, deps, new Date());
    expect(result.ok && result.firstIndex).toBe(5);
  });

  it('nothing to revise when every installment is touched', () => {
    const { plan, assets } = afterThreeRates();
    for (const i of plan.installments) i.lines.forEach((l) => { l.status = 'skipped'; });
    expect(buildRevisedPlan(plan, revision(plan), assets, deps, new Date())).toEqual({ ok: false, issue: 'nothing_to_revise' });
  });
});

describe('RP2 — validation (PP5) and seeding from the targeted sale (PP6)', () => {
  const draft = (disposals: PlanDisposal[]) => ({
    name: 'P', startMonth: '2026-11', months: 10, liquidity, positions, disposals,
  });

  it('PP5: a total sale of a position member is refused; a fractional quantity too', () => {
    const assets = byId(vwce(), xdem(), conto());
    const total = validateDraftAgainstAssets(draft([sale({ quantity: undefined })]), assets);
    expect(total.some((i) => i.code === 'disposal_full_on_position')).toBe(true);
    const all = validateDraftAgainstAssets(draft([sale({ quantity: 200 })]), assets);
    expect(all.some((i) => i.code === 'disposal_full_on_position')).toBe(true);
    const frac = validateDraftAgainstAssets(draft([sale({ quantity: 2.5 })]), assets);
    expect(frac.some((i) => i.code === 'disposal_quantity')).toBe(true);
    const partial = validateDraftAgainstAssets(draft([sale()]), assets);
    expect(partial).toEqual([]);
  });

  it('PP6: 6.916 € of XDEM at 60 € sells 115 shares (6.900 €); weight 0 is a total sale', () => {
    const assets = byId(vwce(), xdem(), conto());
    const kept = new Set(['vwce', 'xdem']);
    const [partial] = seedDisposalsFromSale([{ key: 'xdem', soldEur: 6916 }], kept, assets, deps);
    expect(partial).toMatchObject({ assetId: 'xdem', quantity: 115, estimatedProceedsEur: 6900 });
    const [whole] = seedDisposalsFromSale([{ key: 'xdem', soldEur: 6916 }], new Set(['vwce']), assets, deps);
    expect(whole.quantity).toBeUndefined();
    expect(whole.estimatedProceedsEur).toBe(12000);
    expect(seedDisposalsFromSale([{ key: 'xdem', soldEur: 30 }], kept, assets, deps)).toEqual([]);
  });
});

describe('RP3 — the recalibration proposal (PP7)', () => {
  it('absent when nothing moves, present when a line goes 18 → 17, quiet after «Lascia così»', () => {
    const { plan, assets } = planOnF();
    const calm = recalibrateInstallment(plan, 1, assets, deps);
    expect(shouldProposeRecalibration(calm)).toBe(false);

    // A price rise on VWCE moves the first line down by a share.
    const moved = recalibrateInstallment(plan, 1, byId({ ...vwce(), currentPrice: 130 }, xdem(), conto()), deps);
    const changed = moved.lines.some((l) => Math.abs(l.suggestedQuantity - l.plannedQuantity) >= 1);
    expect(changed).toBe(true);
    expect(shouldProposeRecalibration(moved)).toBe(true);

    const dismissed = { quantities: recalibrationQuantities(moved) };
    expect(shouldProposeRecalibration(moved, dismissed)).toBe(false);

    const again = recalibrateInstallment(plan, 1, byId({ ...vwce(), currentPrice: 140 }, xdem(), conto()), deps);
    expect(shouldProposeRecalibration(again, dismissed)).toBe(true);
  });
});
