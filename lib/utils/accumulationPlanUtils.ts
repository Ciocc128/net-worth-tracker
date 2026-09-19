/**
 * accumulationPlanUtils — the pure engine of the PAC (Accumulo) tile (doc/pac-ate.md §5).
 *
 * Zero Firebase/service imports on purpose, so the unit suite never mocks `@/lib/firebase/config`:
 * every dependency on live data (an asset's EUR value, its unit price, `compareAllocations`) is
 * injected (`PlanDeps`, `AllocationCompare`) rather than imported. No `Date.now()` inside any
 * function — "today" always arrives as a parameter.
 */
import type { Asset, AssetAllocationTarget, AssetClass, AllocationResult } from '@/types/assets';
import type {
  AccumulationPlan,
  AccumulationPlanDraft,
  ClassMeasurement,
  Installment,
  InstallmentLine,
  MonthKey,
  PlanDisposal,
  PlanLiquidity,
  PlanPosition,
} from '@/types/accumulationPlan';
import { splitTowardTarget, bandForTarget, type RebalanceBand } from './allocationUtils';
import { unitPriceEur } from './costBasisEur';
import { getItalyMonthYear } from './dateHelpers';

// ---------------------------------------------------------------------------
// 5.1 Month helpers
// ---------------------------------------------------------------------------

/** 'YYYY-MM' in Italy time. */
export function toMonthKey(date: Date): MonthKey {
  const { year, month } = getItalyMonthYear(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Add `n` months to a MonthKey (n may be negative or zero); handles year rollover. */
export function addMonths(month: MonthKey, n: number): MonthKey {
  const [yearStr, monthStr] = month.split('-');
  const zeroBased = Number(monthStr) - 1 + n;
  const year = Number(yearStr) + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return `${year}-${String(newMonth).padStart(2, '0')}`;
}

/** 1..N inside the plan, 0 before startMonth, N+1 after the last month. */
export function monthIndexOf(
  plan: Pick<AccumulationPlan, 'startMonth' | 'months'>,
  month: MonthKey
): number {
  const toOrdinal = (key: MonthKey): number => {
    const [y, m] = key.split('-').map(Number);
    return y * 12 + (m - 1);
  };
  const diff = toOrdinal(month) - toOrdinal(plan.startMonth);
  const index = diff + 1;
  if (index < 1) return 0;
  if (index > plan.months) return plan.months + 1;
  return index;
}

// ---------------------------------------------------------------------------
// 5.2 Exposure per euro (no service import — mirrors expandAssetExposure's rule)
// ---------------------------------------------------------------------------

/** Notional € per €1 of market value, per asset class — mirrors expandAssetExposure's rule. */
export function exposurePerEuro(asset: Asset): Partial<Record<AssetClass, number>> {
  const leverage = asset.leverageRatio ?? 1;
  if (!asset.composition || asset.composition.length === 0) {
    return { [asset.assetClass]: leverage };
  }
  const result: Partial<Record<AssetClass, number>> = {};
  for (const component of asset.composition) {
    const contribution = (component.percentage / 100) * leverage;
    result[component.assetClass] = (result[component.assetClass] ?? 0) + contribution;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 5.3 resolvePositionStates
// ---------------------------------------------------------------------------

export interface PlanDeps {
  valueOf: (asset: Asset) => number;    // calculateAssetValue
  priceOf: (asset: Asset) => number;    // unitPriceEur
}

export interface PositionState {
  positionId: string;
  label: string;
  targetPercentage: number;
  currentValueEur: number;   // Σ valueOf(member) over memberAssetIds
  buyAssetId: string;
  buyPriceEur: number;       // priceOf(buy asset)
  unpriced: boolean;         // buyPriceEur <= 0 or buy asset missing
}

export function resolvePositionStates(
  positions: PlanPosition[],
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): PositionState[] {
  return positions.map((position) => {
    let currentValueEur = 0;
    for (const memberId of position.memberAssetIds) {
      const member = assetsById.get(memberId);
      if (member) currentValueEur += deps.valueOf(member);
    }
    const buyAsset = assetsById.get(position.buyAssetId);
    const buyPriceEur = buyAsset ? deps.priceOf(buyAsset) : 0;
    return {
      positionId: position.id,
      label: position.label,
      targetPercentage: position.targetPercentage,
      currentValueEur,
      buyAssetId: position.buyAssetId,
      buyPriceEur,
      unpriced: !buyAsset || buyPriceEur <= 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 5.4 computeUsableLiquidity
// ---------------------------------------------------------------------------

export interface UsableLiquidity {
  sourceCashEur: number;        // Σ valueOf(source cash assets)
  availableNowEur: number;      // max(0, sourceCashEur − reserveEur)
  disposalProceedsEur: number;  // Σ estimatedProceedsEur of disposals not yet executed/skipped
  inflowTotalEur: number;       // monthlyInflowEur × monthsRemaining
  L0: number;                   // availableNowEur + disposalProceedsEur
  L: number;                    // L0 + inflowTotalEur
  belowReserve: boolean;        // sourceCashEur < reserveEur
}

export function computeUsableLiquidity(
  liquidity: PlanLiquidity,
  assetsById: Map<string, Asset>,
  disposals: PlanDisposal[],
  monthsRemaining: number,
  deps: PlanDeps
): UsableLiquidity {
  let sourceCashEur = 0;
  for (const id of liquidity.sourceCashAssetIds) {
    const asset = assetsById.get(id);
    if (asset) sourceCashEur += deps.valueOf(asset);
  }
  const availableNowEur = Math.max(0, sourceCashEur - liquidity.reserveEur);
  const disposalProceedsEur = disposals
    .filter((d) => d.status !== 'executed' && d.status !== 'skipped')
    .reduce((sum, d) => sum + d.estimatedProceedsEur, 0);
  const inflowTotalEur = liquidity.monthlyInflowEur * monthsRemaining;
  const L0 = availableNowEur + disposalProceedsEur;
  const L = L0 + inflowTotalEur;
  return {
    sourceCashEur,
    availableNowEur,
    disposalProceedsEur,
    inflowTotalEur,
    L0,
    L,
    belowReserve: sourceCashEur < liquidity.reserveEur,
  };
}

// ---------------------------------------------------------------------------
// 5.5 computeTotalPurchases (Passo 1)
// ---------------------------------------------------------------------------

export function computeTotalPurchases(
  states: PositionState[],
  L: number
): Record<string, number> {
  const priced = states.filter((s) => !s.unpriced);
  const items = priced.map((s) => ({
    key: s.positionId,
    currentValue: s.currentValueEur,
    targetPercentage: s.targetPercentage,
  }));
  const B = states.reduce((sum, s) => sum + s.currentValueEur, 0) + L;
  const split = splitTowardTarget(items, L, B);
  const result: Record<string, number> = {};
  for (const s of states) result[s.positionId] = split[s.positionId] ?? 0;
  return result;
}

// ---------------------------------------------------------------------------
// 5.6 scheduleInstallments (S1, D8, D9)
// ---------------------------------------------------------------------------

export interface ScheduleResult {
  installments: Installment[];
  residualEur: number;
}

export function scheduleInstallments(
  totals: Record<string, number>,
  states: PositionState[],
  months: number,
  startMonth: MonthKey
): ScheduleResult {
  const pricedStates = states.filter((s) => !s.unpriced);
  const carry: Record<string, number> = {};
  const spentByPosition: Record<string, number> = {};
  for (const s of states) {
    carry[s.positionId] = 0;
    spentByPosition[s.positionId] = 0;
  }

  const installments: Installment[] = [];
  let residualEur = 0;

  for (let m = 1; m <= months; m++) {
    const carryInEur: Record<string, number> = {};
    for (const s of states) carryInEur[s.positionId] = carry[s.positionId];

    const lines: InstallmentLine[] = [];
    const lineByPosition: Record<string, InstallmentLine> = {};

    for (const s of pricedStates) {
      const total = totals[s.positionId] ?? 0;
      const budget = total / months + carry[s.positionId];
      const q = Math.floor(budget / s.buyPriceEur + 1e-9);
      const spend = q * s.buyPriceEur;
      carry[s.positionId] = budget - spend;
      if (q > 0) {
        const line: InstallmentLine = {
          positionId: s.positionId,
          assetId: s.buyAssetId,
          plannedQuantity: q,
          priceEurAtPlan: s.buyPriceEur,
          plannedAmountEur: spend,
          status: 'planned',
        };
        lines.push(line);
        lineByPosition[s.positionId] = line;
        spentByPosition[s.positionId] += spend;
      }
    }

    if (m === months) {
      let pool = Object.values(carry).reduce((sum, c) => sum + c, 0);
      const remainingDeficit: Record<string, number> = {};
      for (const s of pricedStates) {
        remainingDeficit[s.positionId] = (totals[s.positionId] ?? 0) - spentByPosition[s.positionId];
      }

      for (;;) {
        const candidates = pricedStates.filter(
          (s) => remainingDeficit[s.positionId] > 1e-9 && s.buyPriceEur <= pool
        );
        if (candidates.length === 0) break;
        candidates.sort((a, b) => {
          const byDeficit = remainingDeficit[b.positionId] - remainingDeficit[a.positionId];
          if (byDeficit !== 0) return byDeficit;
          const byPrice = a.buyPriceEur - b.buyPriceEur;
          if (byPrice !== 0) return byPrice;
          return a.positionId.localeCompare(b.positionId);
        });
        const picked = candidates[0];
        let line = lineByPosition[picked.positionId];
        if (!line) {
          line = {
            positionId: picked.positionId,
            assetId: picked.buyAssetId,
            plannedQuantity: 0,
            priceEurAtPlan: picked.buyPriceEur,
            plannedAmountEur: 0,
            status: 'planned',
          };
          lines.push(line);
          lineByPosition[picked.positionId] = line;
        }
        line.plannedQuantity += 1;
        line.plannedAmountEur += picked.buyPriceEur;
        spentByPosition[picked.positionId] += picked.buyPriceEur;
        pool -= picked.buyPriceEur;
        remainingDeficit[picked.positionId] -= picked.buyPriceEur;
      }

      residualEur = pool;
    }

    installments.push({ index: m, month: addMonths(startMonth, m - 1), lines, carryInEur });
  }

  return { installments, residualEur };
}

// ---------------------------------------------------------------------------
// 5.7 recalibrateInstallment (S3)
// ---------------------------------------------------------------------------

export interface RecalibrationLine {
  positionId: string;
  assetId: string;
  plannedQuantity: number;     // from the saved calendar (0 if no line)
  suggestedQuantity: number;
  priceEur: number;            // current priceOf(buy asset)
  suggestedAmountEur: number;
}

export interface RecalibrationResult {
  index: number;
  lines: RecalibrationLine[];
  plannedTotalEur: number;
  suggestedTotalEur: number;
  liquidity: UsableLiquidity;  // computed with monthsRemaining = N − index + 1
}

export function recalibrateInstallment(
  plan: AccumulationPlan,
  index: number,
  assetsById: Map<string, Asset>,
  deps: PlanDeps
): RecalibrationResult {
  const monthsRemaining = plan.months - index + 1;
  const liquidity = computeUsableLiquidity(
    plan.liquidity,
    assetsById,
    plan.disposals,
    monthsRemaining,
    deps
  );
  const states = resolvePositionStates(plan.positions, assetsById, deps);
  const totals = computeTotalPurchases(states, liquidity.L);
  const pricedStates = states.filter((s) => !s.unpriced);
  const cashCeiling = liquidity.availableNowEur + liquidity.disposalProceedsEur;

  const budgets: Record<string, number> = {};
  for (const s of pricedStates) budgets[s.positionId] = (totals[s.positionId] ?? 0) / monthsRemaining;

  const floorQuantities = (): Record<string, number> => {
    const quantities: Record<string, number> = {};
    for (const s of pricedStates) {
      quantities[s.positionId] = Math.floor(budgets[s.positionId] / s.buyPriceEur + 1e-9);
    }
    return quantities;
  };

  let quantities = floorQuantities();
  const sumAmounts = pricedStates.reduce((sum, s) => sum + quantities[s.positionId] * s.buyPriceEur, 0);

  if (sumAmounts > cashCeiling) {
    const sumBudgets = Object.values(budgets).reduce((sum, v) => sum + v, 0);
    const ratio = sumBudgets > 0 ? cashCeiling / sumBudgets : 0;
    for (const key of Object.keys(budgets)) budgets[key] *= ratio;
    quantities = floorQuantities();
  }

  const plannedByPosition: Record<string, number> = {};
  const installment = plan.installments.find((i) => i.index === index);
  for (const line of installment?.lines ?? []) {
    plannedByPosition[line.positionId] = (plannedByPosition[line.positionId] ?? 0) + line.plannedQuantity;
  }

  const lines: RecalibrationLine[] = pricedStates.map((s) => {
    const suggestedQuantity = quantities[s.positionId];
    return {
      positionId: s.positionId,
      assetId: s.buyAssetId,
      plannedQuantity: plannedByPosition[s.positionId] ?? 0,
      suggestedQuantity,
      priceEur: s.buyPriceEur,
      suggestedAmountEur: suggestedQuantity * s.buyPriceEur,
    };
  });

  return {
    index,
    lines,
    plannedTotalEur: lines.reduce((sum, l) => sum + l.plannedQuantity * l.priceEur, 0),
    suggestedTotalEur: lines.reduce((sum, l) => sum + l.suggestedAmountEur, 0),
    liquidity,
  };
}

// ---------------------------------------------------------------------------
// 5.8 projectPlanOutcome
// ---------------------------------------------------------------------------

export interface PositionOutcome {
  positionId: string;
  label: string;
  targetPercentage: number;
  finalValueEur: number;
  finalWeightPct: number;      // finalValueEur / Σ finalValueEur × 100
  driftPp: number;             // finalWeightPct − targetPercentage
}

export interface PlanOutcome {
  positions: PositionOutcome[];
  maxAbsDriftPp: number;
  maxDriftPositionId: string | null;
  residualEur: number;
  implicitClassPct: Partial<Record<AssetClass, number>>; // notional / final market total × 100
  leverageRatio: number;                                  // Σ notional / Σ market
}

export function projectPlanOutcome(
  states: PositionState[],
  installments: Installment[],
  residualEur: number,
  assetsById: Map<string, Asset>,
  positions: PlanPosition[],
  deps: PlanDeps
): PlanOutcome {
  const purchasedByPosition: Record<string, number> = {};
  for (const installment of installments) {
    for (const line of installment.lines) {
      purchasedByPosition[line.positionId] =
        (purchasedByPosition[line.positionId] ?? 0) + line.plannedAmountEur;
    }
  }

  const outcomePositions: PositionOutcome[] = states.map((s) => ({
    positionId: s.positionId,
    label: s.label,
    targetPercentage: s.targetPercentage,
    finalValueEur: s.currentValueEur + (purchasedByPosition[s.positionId] ?? 0),
    finalWeightPct: 0,
    driftPp: 0,
  }));

  const totalFinal = outcomePositions.reduce((sum, p) => sum + p.finalValueEur, 0);
  for (const p of outcomePositions) {
    p.finalWeightPct = totalFinal > 0 ? (p.finalValueEur / totalFinal) * 100 : 0;
    p.driftPp = p.finalWeightPct - p.targetPercentage;
  }

  let maxAbsDriftPp = 0;
  let maxDriftPositionId: string | null = null;
  for (const p of outcomePositions) {
    if (Math.abs(p.driftPp) > maxAbsDriftPp) {
      maxAbsDriftPp = Math.abs(p.driftPp);
      maxDriftPositionId = p.positionId;
    }
  }

  const implicitNotionalByClass: Partial<Record<AssetClass, number>> = {};
  let totalNotional = 0;
  let totalMarket = 0;

  for (const position of positions) {
    const purchases = purchasedByPosition[position.id] ?? 0;
    for (const memberId of position.memberAssetIds) {
      const member = assetsById.get(memberId);
      if (!member) continue;
      const baseValue = deps.valueOf(member);
      const memberMarketValue = memberId === position.buyAssetId ? baseValue + purchases : baseValue;
      totalMarket += memberMarketValue;
      const exposure = exposurePerEuro(member);
      for (const [assetClass, perEuro] of Object.entries(exposure) as Array<[AssetClass, number]>) {
        const notional = memberMarketValue * perEuro;
        implicitNotionalByClass[assetClass] = (implicitNotionalByClass[assetClass] ?? 0) + notional;
        totalNotional += notional;
      }
    }
  }

  const implicitClassPct: Partial<Record<AssetClass, number>> = {};
  for (const [assetClass, notional] of Object.entries(implicitNotionalByClass) as Array<[AssetClass, number]>) {
    implicitClassPct[assetClass] = totalFinal > 0 ? (notional / totalFinal) * 100 : 0;
  }

  return {
    positions: outcomePositions,
    maxAbsDriftPp,
    maxDriftPositionId,
    residualEur,
    implicitClassPct,
    leverageRatio: totalMarket > 0 ? totalNotional / totalMarket : 1,
  };
}

// ---------------------------------------------------------------------------
// 5.9 projectClassTrajectory (D11)
// ---------------------------------------------------------------------------

export type AllocationCompare = (assets: Asset[], targets: AssetAllocationTarget | null) => AllocationResult;

export interface ClassTrajectoryPoint {
  index: number;                 // 0..N
  month: MonthKey | 'baseline';
  source: 'measured' | 'projected';
  measuredAt?: Date;
  byClass: Partial<Record<AssetClass, {
    currentPct: number;          // notional % on the market base, as Allocazione shows it
    targetPct: number;           // EFFECTIVE target % (from AllocationResult.byAssetClass)
    driftPp: number;             // currentPct − targetPct
    outOfBand: boolean;          // |driftPp| > bandForTarget(band, targetPct)
  }>>;
}

/**
 * Effective target % for a MEASURED point (no live `compare()` call to read it from — see
 * `classPointFromEntries` below for the projected branch, which reads the target straight off its
 * own `compare()` result instead). Mirrors `compareAllocations`' own fixed-cash-amount scaling
 * (`assetAllocationService.ts` `toLegacyAllocationResult`, lines ~838-864): with a fixed-amount
 * cash target, the reserved € is carved out of the market base BEFORE every other class's target
 * applies, so a non-cash class's effective target is its raw config % scaled by
 * `(marketBaseEur − fixedAmount) / marketBaseEur` — not just cash. Every percentage here is scaled
 * to THIS point's own `marketBaseEur`, never the baseline's (PR #4 review, rilievo 1): the raw
 * config in `targets` never changes point to point, but the scaling factor does whenever the
 * market base does.
 */
function resolveTargetPct(
  assetClass: AssetClass,
  targets: AssetAllocationTarget,
  marketBaseEur: number
): number {
  if (marketBaseEur <= 0) return 0;
  const rawTargetPercentage = targets[assetClass]?.targetPercentage ?? 0;
  const useCashFixedAmount = targets.cash?.useFixedAmount ?? false;
  if (assetClass === 'cash' && useCashFixedAmount) {
    return ((targets.cash?.fixedAmount ?? 0) / marketBaseEur) * 100;
  }
  if (!useCashFixedAmount) return rawTargetPercentage;
  const fixedAmount = targets.cash?.fixedAmount ?? 0;
  const targetBase = Math.max(0, marketBaseEur - fixedAmount);
  return rawTargetPercentage * (targetBase / marketBaseEur);
}

function classPointFromEntries(
  index: number,
  month: MonthKey | 'baseline',
  source: 'measured' | 'projected',
  measuredAt: Date | undefined,
  entries: Array<[string, number]>,
  currentPctOf: (notionalOrValue: number) => number,
  targetPctOf: (assetClass: AssetClass) => number,
  band: RebalanceBand
): ClassTrajectoryPoint {
  const byClass: ClassTrajectoryPoint['byClass'] = {};
  for (const [key, value] of entries) {
    const assetClass = key as AssetClass;
    const currentPct = currentPctOf(value);
    const targetPct = targetPctOf(assetClass);
    const driftPp = currentPct - targetPct;
    byClass[assetClass] = {
      currentPct,
      targetPct,
      driftPp,
      outOfBand: Math.abs(driftPp) > bandForTarget(band, targetPct),
    };
  }
  return { index, month, source, measuredAt, byClass };
}

/**
 * Clone `allAssets`, projecting the effect of the plan through calendar month `index`: not-yet-
 * executed buys/disposals move quantities as before, and — since PR #4's review, rilievo 2 — the
 * plan's own cash moves too, instead of sitting untouched while the buy side grows the market base
 * out of nowhere. `cassa(m) = cassa₀ − Σ acquisti pianificati fino a m + E × m + Σ ricavi delle
 * vendite non eseguite (dal mese 1)` (doc/pac-ate.md §5.9), split pro-rata over the LIVE balances of
 * `liquidity.sourceCashAssetIds` — never over the user's `allocationRole`: an `excluded` source
 * account is dropped by `compare()`'s market base regardless of its projected balance, so moving it
 * here changes nothing about the trajectory (verified). An `executed` line/disposal is skipped on
 * both the quantity and the cash side, same as before: its real ledger trade already moved both the
 * position and the cash account it settled from.
 */
function buildProjectedAssets(
  allAssets: Asset[],
  installments: Installment[],
  disposals: PlanDisposal[],
  liquidity: PlanLiquidity,
  index: number
): Asset[] {
  const clonesById = new Map<string, Asset>();
  for (const asset of allAssets) clonesById.set(asset.id, { ...asset });

  let spentEur = 0;
  for (const installment of installments) {
    if (installment.index > index) continue;
    for (const line of installment.lines) {
      if (line.status === 'executed') continue;
      const clone = clonesById.get(line.assetId);
      if (clone) clone.quantity = clone.quantity + line.plannedQuantity;
      spentEur += line.plannedAmountEur;
    }
  }

  let disposalProceedsEur = 0;
  if (index >= 1) {
    for (const disposal of disposals) {
      if (disposal.status === 'executed') continue;
      const clone = clonesById.get(disposal.assetId);
      if (clone) clone.quantity = 0;
      disposalProceedsEur += disposal.estimatedProceedsEur;
    }
  }

  const inflowEur = liquidity.monthlyInflowEur * index;
  const cashDeltaEur = inflowEur + disposalProceedsEur - spentEur;

  if (cashDeltaEur !== 0) {
    const sourceCashClones = liquidity.sourceCashAssetIds
      .map((id) => clonesById.get(id))
      .filter((asset): asset is Asset => !!asset);
    const totalSourceCashEur = sourceCashClones.reduce(
      (sum, asset) => sum + asset.quantity * unitPriceEur(asset),
      0
    );
    for (const clone of sourceCashClones) {
      const currentValueEur = clone.quantity * unitPriceEur(clone);
      // Weight by the live balance when there is one to weight by; an even split only when every
      // source account happens to be at zero (never silently dropping the delta).
      const share = totalSourceCashEur > 0 ? currentValueEur / totalSourceCashEur : 1 / sourceCashClones.length;
      const price = unitPriceEur(clone);
      if (price > 0) clone.quantity = clone.quantity + (cashDeltaEur * share) / price;
    }
  }

  return Array.from(clonesById.values());
}

export function projectClassTrajectory(input: {
  plan: AccumulationPlan;                       // active or draft preview
  allAssets: Asset[];                           // the page's full asset list
  installments: Installment[];                  // plan.installments, or the draft preview schedule
  targets: AssetAllocationTarget;               // the page's EFFECTIVE targets
  band: RebalanceBand;                          // the page's current band
  compare: AllocationCompare;                   // compareAllocations, injected
  currentIndex: number;                         // 0 for a draft; the open installment for active
}): ClassTrajectoryPoint[] {
  const { plan, allAssets, installments, targets, band, compare, currentIndex } = input;

  const points: ClassTrajectoryPoint[] = [];

  for (let index = 0; index <= plan.months; index++) {
    const month: MonthKey | 'baseline' = index === 0 ? 'baseline' : addMonths(plan.startMonth, index - 1);

    if (index < currentIndex) {
      const measurement: ClassMeasurement | undefined =
        index === 0 ? plan.baseline?.measurement : installments.find((i) => i.index === index)?.measurement;
      if (measurement) {
        points.push(
          classPointFromEntries(
            index,
            month,
            'measured',
            measurement.measuredAt,
            Object.entries(measurement.classNotionalEur) as Array<[string, number]>,
            (notional) => (measurement.marketBaseEur > 0 ? (notional / measurement.marketBaseEur) * 100 : 0),
            (assetClass) => resolveTargetPct(assetClass, targets, measurement.marketBaseEur),
            band
          )
        );
        continue;
      }
    }

    const projectedAssets = buildProjectedAssets(allAssets, installments, plan.disposals, plan.liquidity, index);
    const allocation = compare(projectedAssets, targets);
    points.push(
      classPointFromEntries(
        index,
        month,
        'projected',
        undefined,
        Object.entries(allocation.byAssetClass).map(([k, d]) => [k, d.currentPercentage]),
        (pct) => pct,
        (assetClass) => allocation.byAssetClass[assetClass]?.targetPercentage ?? 0,
        band
      )
    );
  }

  return points;
}

// ---------------------------------------------------------------------------
// 5.10 buildClassMeasurement
// ---------------------------------------------------------------------------

export function buildClassMeasurement(result: AllocationResult, measuredAt: Date): ClassMeasurement {
  const classNotionalEur: Partial<Record<AssetClass, number>> = {};
  for (const [assetClass, data] of Object.entries(result.byAssetClass)) {
    classNotionalEur[assetClass as AssetClass] = data.currentValue;
  }
  return { measuredAt, classNotionalEur, marketBaseEur: result.marketValue };
}

// ---------------------------------------------------------------------------
// 5.11 buildDraftPreview
// ---------------------------------------------------------------------------

export function buildDraftPreview(input: {
  draft: AccumulationPlanDraft;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  compare: AllocationCompare;
  deps: PlanDeps;
}): {
  liquidity: UsableLiquidity;
  totals: Record<string, number>;
  schedule: ScheduleResult;
  outcome: PlanOutcome;
  trajectory: ClassTrajectoryPoint[];
  unpricedPositionIds: string[];
} {
  const { draft, allAssets, targets, band, compare, deps } = input;
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));

  // Live, not the draft's own stored figure — a disposal's proceeds track the CURRENT market value.
  const liveDisposals: PlanDisposal[] = draft.disposals.map((disposal) => {
    const asset = assetsById.get(disposal.assetId);
    return { ...disposal, estimatedProceedsEur: asset ? deps.valueOf(asset) : disposal.estimatedProceedsEur };
  });

  const states = resolvePositionStates(draft.positions, assetsById, deps);
  const liquidity = computeUsableLiquidity(draft.liquidity, assetsById, liveDisposals, draft.months, deps);
  const totals = computeTotalPurchases(states, liquidity.L);
  const schedule = scheduleInstallments(totals, states, draft.months, draft.startMonth);
  const outcome = projectPlanOutcome(
    states,
    schedule.installments,
    schedule.residualEur,
    assetsById,
    draft.positions,
    deps
  );

  const draftPlan: AccumulationPlan = {
    id: 'draft-preview',
    userId: '',
    name: draft.name,
    status: 'draft',
    startMonth: draft.startMonth,
    months: draft.months,
    liquidity: draft.liquidity,
    positions: draft.positions,
    disposals: liveDisposals,
    installments: schedule.installments,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  const trajectory = projectClassTrajectory({
    plan: draftPlan,
    allAssets,
    installments: schedule.installments,
    targets,
    band,
    compare,
    currentIndex: 0,
  });

  return {
    liquidity,
    totals,
    schedule,
    outcome,
    trajectory,
    unpricedPositionIds: states.filter((s) => s.unpriced).map((s) => s.positionId),
  };
}

// Re-exported so a caller of this module never needs to import unitPriceEur from costBasisEur
// separately for a `PlanDeps.priceOf` implementation.
export { unitPriceEur };
