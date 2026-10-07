/**
 * accumuloSummary — the numbers of Allocazione's «Accumulo» tab (doc/pac-ottimizzatore § RV2–RV3).
 *
 * Pure: the tab's verdict (`buildAccumuloVerdict`) and the one clause the Bilanciamento verdict
 * borrows from the active plan (`summarizePacMonth`) are read from the SAME open installment, so
 * the two tabs can never name different months or amounts. Words live in `accumulationNarrative.ts`.
 */
import type { Asset, AssetAllocationTarget, AssetClass } from '@/types/assets';
import type { AccumulationPlan, Installment } from '@/types/accumulationPlan';
import type { PageVerdictModel } from './narrative';
import type { LineUiState } from './accumulationPlanMatching';
import type { PacVerdictInput } from './allocazioneNarrative';
import { describeAccumuloVerdict, monthLabelLong } from './accumulationNarrative';
import {
  buildDraftPreview,
  computeTotalPurchases,
  computeUsableLiquidity,
  resolvePositionStates,
  toMonthKey,
  weightsToSeedPositions,
  type AllocationCompare,
  type PlanDeps,
} from './accumulationPlanUtils';
import { toModelWeights } from './modelPortfolio';
import type { ModelPortfolioWeight } from '@/types/modelPortfolio';
import type { RebalanceBand } from './allocationUtils';

/** Every installment fully closed, `late` lines included — the plan has nothing left to do. */
export function isPlanDone(plan: AccumulationPlan, currentIndex: number): boolean {
  if (currentIndex <= plan.months) return false;
  const linesClosed = plan.installments.every((installment) => installment.lines.every((line) => line.status !== 'planned'));
  const disposalsClosed = plan.disposals.every((disposal) => disposal.status !== 'planned');
  return linesClosed && disposalsClosed;
}

/** The installment the tab is about: the one of `currentIndex`, clamped into the plan's range. */
export function findOpenInstallment(plan: AccumulationPlan, currentIndex: number): Installment | undefined {
  const clamped = Math.min(Math.max(currentIndex, 1), plan.months);
  return plan.installments.find((installment) => installment.index === clamped);
}

/**
 * RV2 — the open installment as the Bilanciamento verdict says it: Σ `plannedAmountEur` of the lines
 * not skipped, the positions they buy, and whether none is left to do. `null` unless the plan is
 * active (a draft proposes nothing, D1) and not finished.
 */
export function summarizePacMonth(plan: AccumulationPlan | undefined, currentIndex: number): PacVerdictInput | null {
  if (!plan || plan.status !== 'active') return null;
  if (isPlanDone(plan, currentIndex)) return null;
  const installment = findOpenInstallment(plan, currentIndex);
  if (!installment) return null;
  const lines = installment.lines.filter((line) => line.status !== 'skipped' && (line.plannedQuantity > 0 || line.status !== 'planned'));
  return {
    monthTotalEur: lines.reduce((sum, line) => sum + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur), 0),
    instrumentCount: new Set(lines.map((line) => line.positionId)).size,
    monthLabel: monthLabelLong(installment.month, false),
    allClosed: installment.lines.every((line) => line.status !== 'planned'),
  };
}

export interface AccumuloVerdictContext {
  plan: AccumulationPlan | undefined;
  /** `monthIndexOf(plan, today)`. */
  currentIndex: number;
  /** Σ value of the source cash accounts (none state). */
  sourceCashEur: number;
  /** A saved model portfolio exists (A2); false until then. */
  hasModel: boolean;
  /** The ledger matching's state per `${index}:${positionId}`. */
  lineStates: Record<string, LineUiState>;
  /** Draft: Σ of the whole plan's purchases (`computeTotalPurchases`). */
  draftTotalEur: number;
  /** `describeBandReentry` for the open month, already worded. */
  reentry: string;
}

/** RV3 — the five states of the tab's verdict. */
export function buildAccumuloVerdict(context: AccumuloVerdictContext): PageVerdictModel {
  const { plan, currentIndex } = context;
  if (!plan) return describeAccumuloVerdict({ state: 'none', sourceCashEur: context.sourceCashEur, hasModel: context.hasModel });

  if (plan.status === 'draft') {
    return describeAccumuloVerdict({
      state: 'draft',
      months: plan.months,
      monthlyEur: plan.months > 0 ? context.draftTotalEur / plan.months : 0,
      startMonth: plan.startMonth,
    });
  }

  const executedAmount = (line: { status: string; executedAmountEur?: number; plannedAmountEur: number }) =>
    line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : 0;
  const investedEur = plan.installments.reduce((sum, i) => sum + i.lines.reduce((s, line) => s + executedAmount(line), 0), 0);
  const planTotalEur = plan.installments.reduce((sum, i) => sum + i.lines.reduce((s, line) => s + line.plannedAmountEur, 0), 0);

  if (isPlanDone(plan, currentIndex)) return describeAccumuloVerdict({ state: 'done', investedEur, totalEur: planTotalEur });

  const installment = findOpenInstallment(plan, currentIndex);
  if (!installment) return describeAccumuloVerdict({ state: 'none', sourceCashEur: context.sourceCashEur, hasModel: context.hasModel });

  const lines = installment.lines.filter((line) => line.plannedQuantity > 0 || line.status !== 'planned');
  const toConfirmCount = lines.filter((line) => context.lineStates[`${installment.index}:${line.positionId}`] === 'toConfirm').length;
  const lateCount = plan.installments
    .filter((i) => i.index < currentIndex)
    .reduce((sum, i) => sum + i.lines.filter((line) => line.status === 'planned').length, 0);
  return describeAccumuloVerdict({
    state: 'active',
    monthKey: installment.month,
    installmentTotalEur: lines.reduce((sum, line) => sum + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur), 0),
    lineCount: lines.length,
    executedCount: lines.filter((line) => line.status === 'executed').length,
    toConfirmCount,
    lateCount,
    installmentClosed: installment.lines.every((line) => line.status !== 'planned'),
    installmentIndex: installment.index,
    months: plan.months,
    investedEur,
    planTotalEur,
    reentry: context.reentry,
  });
}

// ─── RV4: the empty state's preview on the reader's own numbers ──────────────

/** The reserve the preview assumes: what the editor proposes first, never typed by the reader here. */
export const PREVIEW_RESERVE_EUR = 10000;
export const PREVIEW_MONTHS = 12;

export interface AccumuloPreview {
  months: number;
  reserveEur: number;
  /** Σ of the purchases over the plan divided by the months — what a month would move. */
  monthlyEur: number;
  /** Where the classes would stand today and at the end of the plan, on today's prices. */
  classes: { assetClass: AssetClass; currentPct: number; targetPct: number; finalPct: number }[];
  /** The saved model portfolio when there is one, else today's holdings (RV4). */
  weightsFrom: 'today' | 'model';
}

/**
 * «Senza piano»: what a plan would do with the cash the reader has, at the default reserve, 12
 * months, no monthly inflow and today's weights over the tradable instruments. `null` when nothing
 * would be left to spend or no instrument can be bought — the tile then says why instead of a figure.
 */
export function buildAccumuloPreview(input: {
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
  /** The saved model's weights: the preview starts from them instead of today's holdings. */
  model?: ModelPortfolioWeight[] | null;
}): AccumuloPreview | null {
  const { allAssets, targets, band, compare, deps, today, model } = input;
  const cashIds = allAssets.filter((asset) => asset.assetClass === 'cash' && asset.type === 'cash').map((asset) => asset.id);
  const cashEur = allAssets.filter((asset) => cashIds.includes(asset.id)).reduce((sum, asset) => sum + deps.valueOf(asset), 0);
  if (cashEur <= PREVIEW_RESERVE_EUR) return null;

  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const useModel = !!model && model.length > 0;
  const proposed = useModel
    ? model.map((weight) => ({ assetId: weight.assetId, pct: weight.targetPercentage })).filter((entry) => entry.pct > 0)
    : allAssets
        .filter((asset) => asset.assetClass !== 'cash' && asset.assetClass !== 'realestate')
        .map((asset) => ({ assetId: asset.id, pct: deps.valueOf(asset) }))
        .filter((entry) => entry.pct > 0);
  const { weights } = toModelWeights(proposed, assetsById);
  if (weights.length === 0) return null;

  let n = 0;
  const positions = weightsToSeedPositions(
    weights.map((weight) => ({ key: weight.assetId, label: assetsById.get(weight.assetId)?.name ?? weight.assetId, proposedPct: weight.pct })),
    () => `preview-${n++}`,
  );
  const preview = buildDraftPreview({
    draft: {
      name: 'Anteprima',
      startMonth: toMonthKey(today),
      months: PREVIEW_MONTHS,
      liquidity: { sourceCashAssetIds: cashIds, reserveEur: PREVIEW_RESERVE_EUR, monthlyInflowEur: 0 },
      positions,
      disposals: [],
    },
    allAssets,
    targets,
    band,
    compare,
    deps,
  });
  const totalEur = Object.values(preview.totals).reduce((sum, value) => sum + value, 0);
  if (totalEur <= 0) return null;

  const first = preview.trajectory[0];
  const last = preview.trajectory[preview.trajectory.length - 1];
  const classes = Object.entries(first?.byClass ?? {}).flatMap(([assetClass, entry]) => {
    const final = last?.byClass[assetClass as AssetClass];
    if (!entry || !final) return [];
    // A class with neither weight nor target is not part of the story (the tile's strip drops it too).
    if (Math.abs(entry.currentPct) < 0.05 && Math.abs(entry.targetPct) < 0.05 && Math.abs(final.currentPct) < 0.05) return [];
    return [{ assetClass: assetClass as AssetClass, currentPct: entry.currentPct, targetPct: entry.targetPct, finalPct: final.currentPct }];
  });
  return { months: PREVIEW_MONTHS, reserveEur: PREVIEW_RESERVE_EUR, monthlyEur: totalEur / PREVIEW_MONTHS, classes, weightsFrom: useModel ? 'model' : 'today' };
}

/** Σ of the purchases a draft would make over its whole length (the verdict's «12 rate da X €»). */
export function summarizeDraftTotal(plan: AccumulationPlan, allAssets: Asset[], deps: PlanDeps): number {
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const liquidity = computeUsableLiquidity(plan.liquidity, assetsById, plan.disposals, plan.months, deps);
  const totals = computeTotalPurchases(resolvePositionStates(plan.positions, assetsById, deps, plan.disposals), liquidity.L);
  return Object.values(totals).reduce((sum, value) => sum + value, 0);
}

/**
 * RV5's cursor: where a key sends the month cursor (a position in the trajectory, 0..length−1),
 * stopping at both ends. `null` for a key the chart does not answer to.
 */
export function stepTrajectoryCursor(position: number, key: string, length: number): number | null {
  const last = Math.max(0, length - 1);
  switch (key) {
    case 'ArrowRight':
      return Math.min(position + 1, last);
    case 'ArrowLeft':
      return Math.max(position - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}
