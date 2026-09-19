/**
 * ACCUMULATION PLAN SERVICE (client SDK) — persistence for the PAC (Accumulo) tile.
 *
 * One document per plan in `accumulationPlans`, on the `pensionContributionService.ts` model:
 * client SDK, `db` from `@/lib/firebase/config`, reads filtered by `userId` equality only (no
 * `orderBy`, no composite index — the sort by `createdAt` happens in memory, same reasoning as
 * `getPensionContributions`).
 *
 * A client-SDK transaction can `tx.get()` a specific document ref but never run a query, so D12
 * (at most one plan in `draft`/`active` per account) is enforced with a best-effort pre-read in
 * `createDraftPlan`, not atomically — the same limit every other client-SDK write in this codebase
 * accepts. `updateDraftPlan` and `activatePlan` DO have a `planId`, so their own status guard runs
 * inside a `runTransaction`.
 *
 * Errors meant for the user are thrown with `userFacingError` (`lib/utils/dialogNarrative.ts`), so
 * `describeWriteError` can surface them verbatim instead of a generic Firestore message.
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { toDate } from '@/lib/utils/dateHelpers';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import { userFacingError } from '@/lib/utils/dialogNarrative';
import { accumulationPlanDraftSchema } from '@/lib/utils/accumulationPlanSchema';
import {
  resolvePositionStates,
  computeUsableLiquidity,
  computeTotalPurchases,
  scheduleInstallments,
  buildClassMeasurement,
  type PlanDeps,
  type AllocationCompare,
  type RecalibrationLine,
} from '@/lib/utils/accumulationPlanUtils';
import type {
  AccumulationPlan,
  AccumulationPlanDraft,
  AccumulationPlanStatus,
  ClassMeasurement,
  Installment,
  InstallmentLine,
  InstallmentLineStatus,
  PlanBaseline,
  PlanDisposal,
  PlanLiquidity,
  PlanPosition,
} from '@/types/accumulationPlan';
import type { Asset, AssetAllocationTarget, AssetClass } from '@/types/assets';

export const ACCUMULATION_PLANS_COLLECTION = 'accumulationPlans';

// ---------------------------------------------------------------------------
// Doc → domain (Timestamp → Date at the boundary, like every other service here)
// ---------------------------------------------------------------------------

function toClassMeasurement(data: Record<string, unknown> | undefined): ClassMeasurement | undefined {
  if (!data) return undefined;
  return {
    measuredAt: toDate(data.measuredAt as never),
    classNotionalEur: (data.classNotionalEur ?? {}) as Partial<Record<AssetClass, number>>,
    marketBaseEur: data.marketBaseEur as number,
  };
}

function toInstallment(data: Record<string, unknown>): Installment {
  return {
    index: data.index as number,
    month: data.month as string,
    lines: (data.lines ?? []) as InstallmentLine[],
    carryInEur: (data.carryInEur ?? {}) as Record<string, number>,
    confirmedAt: data.confirmedAt ? toDate(data.confirmedAt as never) : undefined,
    measurement: toClassMeasurement(data.measurement as Record<string, unknown> | undefined),
  };
}

function toPlanBaseline(data: Record<string, unknown> | undefined): PlanBaseline | undefined {
  if (!data) return undefined;
  return {
    capturedAt: toDate(data.capturedAt as never),
    positionValuesEur: (data.positionValuesEur ?? {}) as Record<string, number>,
    sourceCashEur: data.sourceCashEur as number,
    pricesEur: (data.pricesEur ?? {}) as Record<string, number>,
    measurement: toClassMeasurement(data.measurement as Record<string, unknown>)!,
  };
}

function docToAccumulationPlan(id: string, data: Record<string, unknown>): AccumulationPlan {
  return {
    id,
    userId: data.userId as string,
    name: data.name as string,
    status: data.status as AccumulationPlanStatus,
    startMonth: data.startMonth as string,
    months: data.months as number,
    liquidity: data.liquidity as PlanLiquidity,
    positions: (data.positions ?? []) as PlanPosition[],
    disposals: (data.disposals ?? []) as PlanDisposal[],
    baseline: toPlanBaseline(data.baseline as Record<string, unknown> | undefined),
    installments: ((data.installments ?? []) as Record<string, unknown>[]).map(toInstallment),
    residualEur: data.residualEur as number | undefined,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
    activatedAt: data.activatedAt ? toDate(data.activatedAt as never) : undefined,
    closedAt: data.closedAt ? toDate(data.closedAt as never) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** All of an owner's plans, newest first. Sorted in memory — see the module note on query shape. */
export async function getAccumulationPlans(ownerId: string): Promise<AccumulationPlan[]> {
  const snapshot = await getDocs(
    query(collection(db, ACCUMULATION_PLANS_COLLECTION), where('userId', '==', ownerId))
  );
  return snapshot.docs
    .map((snap) => docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Validate the draft's shape and write it as a new `draft` plan with an empty calendar. */
export async function createDraftPlan(ownerId: string, draft: AccumulationPlanDraft): Promise<string> {
  accumulationPlanDraftSchema.parse(draft);

  const existing = await getAccumulationPlans(ownerId);
  if (existing.some((plan) => plan.status === 'draft' || plan.status === 'active')) {
    throw userFacingError(
      'Esiste già un piano di accumulo in bozza o attivo: chiudilo prima di crearne un altro.'
    );
  }

  const now = new Date();
  const payload = removeUndefinedDeep({
    userId: ownerId,
    name: draft.name,
    status: 'draft' as AccumulationPlanStatus,
    startMonth: draft.startMonth,
    months: draft.months,
    liquidity: draft.liquidity,
    positions: draft.positions,
    disposals: draft.disposals,
    installments: [] as Installment[],
    createdAt: now,
    updatedAt: now,
  });
  const docRef = await addDoc(collection(db, ACCUMULATION_PLANS_COLLECTION), payload);
  return docRef.id;
}

/** Replace a draft's editable fields — refused once the plan has left `draft`. */
export async function updateDraftPlan(planId: string, draft: AccumulationPlanDraft): Promise<void> {
  accumulationPlanDraftSchema.parse(draft);
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    if ((snap.data().status as AccumulationPlanStatus) !== 'draft') {
      throw userFacingError('Il piano non è più una bozza: non può essere modificato da qui.');
    }
    tx.update(
      ref,
      removeUndefinedDeep({
        name: draft.name,
        startMonth: draft.startMonth,
        months: draft.months,
        liquidity: draft.liquidity,
        positions: draft.positions,
        disposals: draft.disposals,
        updatedAt: new Date(),
      })
    );
  });
}

export interface ActivatePlanInput {
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
}

/**
 * Turn a draft into the active plan: freeze the disposals' proceeds and the buy prices at today's
 * market, compute the S1 calendar (`scheduleInstallments`) and the baseline measurement (month 0
 * of the trajectory, D11) — all inside one transaction re-reading the plan to confirm it is still
 * a `draft`.
 */
export async function activatePlan(planId: string, input: ActivatePlanInput): Promise<void> {
  const { allAssets, targets, compare, deps, today } = input;
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const data = snap.data() as Record<string, unknown>;
    if ((data.status as AccumulationPlanStatus) !== 'draft') {
      throw userFacingError('Solo una bozza può essere attivata.');
    }
    const plan = docToAccumulationPlan(snap.id, data);

    const disposals: PlanDisposal[] = plan.disposals.map((disposal) => {
      const asset = assetsById.get(disposal.assetId);
      return {
        ...disposal,
        estimatedProceedsEur: asset ? deps.valueOf(asset) : disposal.estimatedProceedsEur,
      };
    });

    const states = resolvePositionStates(plan.positions, assetsById, deps);
    const liquidity = computeUsableLiquidity(plan.liquidity, assetsById, disposals, plan.months, deps);
    const totals = computeTotalPurchases(states, liquidity.L);
    const { installments, residualEur } = scheduleInstallments(totals, states, plan.months, plan.startMonth);

    const positionValuesEur: Record<string, number> = {};
    const pricesEur: Record<string, number> = {};
    for (const state of states) {
      positionValuesEur[state.positionId] = state.currentValueEur;
      if (!state.unpriced) pricesEur[state.buyAssetId] = state.buyPriceEur;
    }

    const baseline: PlanBaseline = {
      capturedAt: today,
      positionValuesEur,
      sourceCashEur: liquidity.sourceCashEur,
      pricesEur,
      measurement: buildClassMeasurement(compare(allAssets, targets), today),
    };

    tx.update(
      ref,
      removeUndefinedDeep({
        status: 'active' as AccumulationPlanStatus,
        disposals,
        installments,
        residualEur,
        baseline,
        activatedAt: today,
        updatedAt: today,
      })
    );
  });
}

export interface SetInstallmentLinePatch {
  status: InstallmentLineStatus;
  transactionIds?: string[];
  executedQuantity?: number;
  executedAmountEur?: number;
}

export interface MeasurementInput {
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  compare: AllocationCompare;
  today: Date;
}

/**
 * Patch one line of an installment (confirm a match, mark it executed by hand, skip it). Once
 * every line of the installment is `executed`/`skipped` it closes: `confirmedAt` is stamped and
 * `measurement` freezes THAT month's point of the trajectory (D11) — the caller supplies
 * `measurementInput` because measuring needs the live portfolio, which this service never reads on
 * its own.
 */
export async function setInstallmentLine(
  planId: string,
  index: number,
  positionId: string,
  patch: SetInstallmentLinePatch,
  measurementInput: MeasurementInput
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const installment = plan.installments.find((i) => i.index === index);
    if (!installment) throw userFacingError('Rata non trovata.');

    const lines = installment.lines.map((line) =>
      line.positionId === positionId ? { ...line, ...patch } : line
    );
    const allClosed = lines.every((line) => line.status === 'executed' || line.status === 'skipped');

    const updatedInstallment: Installment = {
      ...installment,
      lines,
      confirmedAt: allClosed ? measurementInput.today : installment.confirmedAt,
      measurement: allClosed
        ? buildClassMeasurement(
            measurementInput.compare(measurementInput.allAssets, measurementInput.targets),
            measurementInput.today
          )
        : installment.measurement,
    };

    const installments = plan.installments.map((i) => (i.index === index ? updatedInstallment : i));
    tx.update(ref, removeUndefinedDeep({ installments, updatedAt: new Date() }));
  });
}

/** Patch one disposal (confirm the sell match, mark it executed by hand, skip it) — mirrors `setInstallmentLine`. */
export async function setDisposal(
  planId: string,
  assetId: string,
  patch: { status: InstallmentLineStatus; transactionIds?: string[]; executedAmountEur?: number }
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const disposals = plan.disposals.map((disposal) =>
      disposal.assetId === assetId ? { ...disposal, ...patch } : disposal
    );
    tx.update(ref, removeUndefinedDeep({ disposals, updatedAt: new Date() }));
  });
}

/** Replace the `planned` lines of an installment with `recalibrateInstallment`'s suggestion; `executed` lines are untouched. */
export async function applyRecalibration(
  planId: string,
  index: number,
  lines: RecalibrationLine[]
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw userFacingError('Il piano non esiste più.');
    const plan = docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>);
    const installment = plan.installments.find((i) => i.index === index);
    if (!installment) throw userFacingError('Rata non trovata.');

    const executedLines = installment.lines.filter((line) => line.status === 'executed');
    const suggestedLines: InstallmentLine[] = lines
      .filter((line) => line.suggestedQuantity > 0)
      .map((line) => ({
        positionId: line.positionId,
        assetId: line.assetId,
        plannedQuantity: line.suggestedQuantity,
        priceEurAtPlan: line.priceEur,
        plannedAmountEur: line.suggestedAmountEur,
        status: 'planned',
      }));

    const updatedInstallment: Installment = { ...installment, lines: [...executedLines, ...suggestedLines] };
    const installments = plan.installments.map((i) => (i.index === index ? updatedInstallment : i));
    tx.update(ref, removeUndefinedDeep({ installments, updatedAt: new Date() }));
  });
}

/** Close a plan (`completed` or `cancelled`) — no further edits after this. */
export async function closePlan(
  planId: string,
  status: Extract<AccumulationPlanStatus, 'completed' | 'cancelled'>
): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);
  const now = new Date();
  await updateDoc(ref, removeUndefinedDeep({ status, closedAt: now, updatedAt: now }));
}

/** Delete a plan still in `draft` — refused once it has been activated. */
export async function deleteDraftPlan(planId: string): Promise<void> {
  const ref = doc(db, ACCUMULATION_PLANS_COLLECTION, planId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    if ((snap.data().status as AccumulationPlanStatus) !== 'draft') {
      throw userFacingError('Solo una bozza può essere eliminata da qui.');
    }
    tx.delete(ref);
  });
}
