/**
 * accumuloSummary — the numbers of Allocazione's «Accumulo» tab (doc/pac-ottimizzatore § RV2–RV3).
 *
 * Pure: the tab's verdict (`buildAccumuloVerdict`) and the one clause the Bilanciamento verdict
 * borrows from the active plan (`summarizePacMonth`) are read from the SAME open installment, so
 * the two tabs can never name different months or amounts. Words live in `accumulationNarrative.ts`.
 */
import type { AccumulationPlan, Installment } from '@/types/accumulationPlan';
import type { PageVerdictModel } from './narrative';
import type { LineUiState } from './accumulationPlanMatching';
import type { PacVerdictInput } from './allocazioneNarrative';
import { describeAccumuloVerdict, monthLabelLong } from './accumulationNarrative';

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
