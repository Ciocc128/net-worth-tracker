/**
 * Instrument-aware Versa/Ribilancia planner.
 *
 * `allocationUtils.ts` answers "how many € to move per ASSET CLASS" — it has no notion of
 * which concrete instrument the € goes into, so it silently assumes a plain (1x) purchase:
 * closing a notional gap with a market-value € only works 1:1 if the instrument bought/sold
 * is unleveraged. That assumption breaks once the portfolio holds leveraged/composite ETFs
 * (e.g. a 1.5x fund spanning 60% equity / 40% bonds): buying €1 of it moves MULTIPLE asset
 * classes at once, by more than €1 of notional exposure combined.
 *
 * This module instead reasons over the actual held instruments. Each instrument has an
 * "exposure vector" — the notional € it produces per €1 of market value traded, per asset
 * class (`buildInstrumentExposures`, via `expandAssetExposure`). Trading €x_i of instrument i
 * moves notional exposure by `x_i * exposureVector_i`, and — crucially, given the budget
 * constraint below — this makes the whole problem LINEAR in the trade vector `x`:
 *   - Versa (contribution): Σx_i = amount (fixed), so the new market total is fixed too.
 *   - Ribilancia (rebalance): Σx_i = 0 (no new cash), so the market total doesn't move.
 * With the post-trade market total fixed, both "gap to the notional target" and "resulting
 * leverage ratio" are affine functions of `x`, so minimizing their squared error is a convex
 * QUADRATIC program: sum of squares of affine functions, subject to a budget equality and a
 * box per instrument (can't sell more than you hold; Versa never sells).
 *
 * Objective (see `solve`): target-gap term is DOMINANT (weight 1 per class, in €² — same
 * units `differenceValue` already uses elsewhere), leverage-target term is a soft tie-breaker
 * (`LEVERAGE_TIEBREAKER_WEIGHT`, low weight, euro-scaled so it's comparable rather than
 * arbitrary) — confirmed with the user: never trade a meaningfully better exposure fit for a
 * better leverage fit, only choose between similarly-good exposure fits by leverage.
 *
 * Solved via projected gradient descent with a monotone backtracking line search (halve the
 * step until the objective doesn't increase) — always converges for a convex smooth objective
 * regardless of the initial step size, and needs no eigenvalue/Lipschitz-constant estimate.
 * The projection step (`projectOntoBudgetBox`) is the classic bisection ("water-filling")
 * solution to "closest point to y under Σx=budget, lo≤x≤hi" — f(t)=Σclamp(y_i−t,lo_i,hi_i) is
 * monotonic in t, so the budget-matching t is found by bisection.
 *
 * Scope (confirmed with user): asset-class level only for v1 — sub-category/specific-asset
 * splits keep using the simpler proportional logic in `allocationUtils.ts`.
 */

import type { Asset, AssetClass } from '@/types/assets';
import { expandAssetExposure } from './assetExposureUtils';

/**
 * Weight of the leverage-target tie-breaker relative to a single asset class's target-gap
 * term (weight 1, in €²). Kept low on purpose: the optimizer must never sacrifice a
 * meaningfully better exposure fit for a better leverage fit, only break ties between
 * similarly-good exposure fits. The leverage residual is euro-scaled (see `solve`) so this
 * weight is directly comparable to the class weights, not an arbitrary magic number.
 */
export const LEVERAGE_TIEBREAKER_WEIGHT = 0.1;

/** A held instrument's market value and its notional exposure per €1 traded, per asset class. */
export interface InstrumentExposure {
  assetId: string;
  ticker: string;
  /** User-facing alias (falls back to `ticker`), so trade lists can show the label the user set. */
  displayTicker?: string;
  name: string;
  marketValue: number;
  /** Notional € produced by €1 of market value in this instrument, per class. Values sum to
   *  the instrument's own leverage ratio (1 for a plain unleveraged single-class holding). */
  exposurePerEuro: Partial<Record<AssetClass, number>>;
}

/** Expand every held asset (quantity/value > 0) into its per-class exposure-per-euro vector. */
export function buildInstrumentExposures(assets: Asset[]): InstrumentExposure[] {
  const instruments: InstrumentExposure[] = [];

  for (const asset of assets) {
    // Expand once and derive marketValue from the components' own sum — calling
    // calculateAssetValue(asset) again here would duplicate the work expandAssetExposure
    // already does internally.
    const components = expandAssetExposure(asset);
    const marketValue = components.reduce((sum, c) => sum + c.marketValue, 0);
    if (marketValue <= 0) continue; // fully sold / zero-value holdings aren't tradeable candidates

    const exposurePerEuro: Partial<Record<AssetClass, number>> = {};
    for (const component of components) {
      const assetClass = component.assetClass as AssetClass;
      const perEuro = component.notionalValue / marketValue;
      exposurePerEuro[assetClass] = (exposurePerEuro[assetClass] ?? 0) + perEuro;
    }

    instruments.push({
      assetId: asset.id,
      ticker: asset.ticker,
      displayTicker: asset.displayTicker,
      name: asset.name,
      marketValue,
      exposurePerEuro,
    });
  }

  return instruments;
}

/** One recommended trade against an existing holding. Positive = buy, negative = sell. */
export interface InstrumentTrade {
  assetId: string;
  ticker: string;
  /** User-facing alias (falls back to `ticker`) for display in the trade list. */
  displayTicker?: string;
  name: string;
  amount: number;
}

export interface LeverageAwarePlan {
  trades: InstrumentTrade[];
  resultingNotionalByAssetClass: Record<string, number>;
  resultingMarketTotal: number;
  resultingLeverageRatio: number;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Euclidean projection of `y` onto `{x : Σx = budget, lo_i ≤ x_i ≤ hi_i}` (continuous
 * knapsack / capped-simplex projection), via bisection on the shift `t` in
 * `x_i = clamp(y_i - t, lo_i, hi_i)`. `f(t) = Σx_i(t)` is non-increasing in `t`, ranging from
 * `Σhi_i` (t → -∞) to `Σlo_i` (t → +∞), so the root of `f(t) = budget` is found by bisection.
 * `budget` is clamped into `[Σlo_i, Σhi_i]` first so the projection is always well-defined
 * even if the caller asks for an infeasible budget (e.g. more cash than can be absorbed).
 */
function projectOntoBudgetBox(y: number[], lo: number[], hi: number[], budget: number): number[] {
  const n = y.length;
  if (n === 0) return [];

  const sumLo = lo.reduce((s, v) => s + v, 0);
  const sumHi = hi.reduce((s, v) => s + v, 0);
  const clampedBudget = clamp(budget, sumLo, sumHi);

  const sumAt = (t: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += clamp(y[i] - t, lo[i], hi[i]);
    return s;
  };

  let tLo = Math.min(...y.map((yi, i) => yi - hi[i])) - 1;
  let tHi = Math.max(...y.map((yi, i) => yi - lo[i])) + 1;

  for (let iter = 0; iter < 100; iter++) {
    const tMid = (tLo + tHi) / 2;
    if (sumAt(tMid) > clampedBudget) tLo = tMid;
    else tHi = tMid;
  }

  const t = (tLo + tHi) / 2;
  return y.map((yi, i) => clamp(yi - t, lo[i], hi[i]));
}

interface SolveParams {
  instruments: InstrumentExposure[];
  currentNotionalByAssetClass: Record<string, number>;
  currentNotionalTotal: number;
  currentMarketTotal: number;
  targetPercentageByAssetClass: Record<string, number>;
  budget: number;
  lowerBounds: number[];
  upperBounds: number[];
  targetLeverageRatio?: number;
}

/** Solve the convex QP described in the module doc; returns the trade € per instrument. */
function solve(params: SolveParams): number[] {
  const {
    instruments,
    currentNotionalByAssetClass,
    currentNotionalTotal,
    currentMarketTotal,
    targetPercentageByAssetClass,
    budget,
    lowerBounds,
    upperBounds,
    targetLeverageRatio,
  } = params;

  const n = instruments.length;
  if (n === 0) return [];

  const classes = Object.keys(targetPercentageByAssetClass);
  const targetFraction: Record<string, number> = {};
  for (const assetClass of classes) targetFraction[assetClass] = (targetPercentageByAssetClass[assetClass] ?? 0) / 100;

  // Each instrument's own total leverage = Σ exposure across all classes it touches (1 for
  // an unleveraged single-class holding; the instrument's leverageRatio for a leveraged one).
  const instrumentLeverage = instruments.map((inst) =>
    Object.values(inst.exposurePerEuro).reduce((sum: number, v) => sum + (v ?? 0), 0)
  );

  // Per class c: r_c(x) = classConst[c] + classCoeff[c] . x
  const classCoeff: Record<string, number[]> = {};
  const classConst: Record<string, number> = {};
  for (const assetClass of classes) {
    classCoeff[assetClass] = instruments.map(
      (inst, i) => (inst.exposurePerEuro[assetClass as AssetClass] ?? 0) - targetFraction[assetClass] * instrumentLeverage[i]
    );
    classConst[assetClass] = (currentNotionalByAssetClass[assetClass] ?? 0) - targetFraction[assetClass] * currentNotionalTotal;
  }

  // Leverage residual, euro-scaled so it's comparable to the class residuals above:
  // r_L(x) = NotionalTotal(x) - targetLeverageRatio * marketTotalAfterTrade
  //        = (currentNotionalTotal + leverage . x) - targetLeverageRatio * (currentMarketTotal + budget)
  const hasLeverageTerm = targetLeverageRatio !== undefined && targetLeverageRatio > 0;
  const marketAfterTrade = currentMarketTotal + budget;
  const leverageCoeff = instrumentLeverage;
  const leverageConst = currentNotionalTotal - (targetLeverageRatio ?? 0) * marketAfterTrade;

  const residual = (x: number[], assetClass: string): number => classConst[assetClass] + dot(classCoeff[assetClass], x);
  const residualL = (x: number[]): number => leverageConst + dot(leverageCoeff, x);

  const objective = (x: number[]): number => {
    let j = 0;
    for (const assetClass of classes) {
      const r = residual(x, assetClass);
      j += r * r;
    }
    if (hasLeverageTerm) {
      const rL = residualL(x);
      j += LEVERAGE_TIEBREAKER_WEIGHT * rL * rL;
    }
    return j;
  };

  const gradient = (x: number[]): number[] => {
    const g = new Array(n).fill(0);
    for (const assetClass of classes) {
      const r = residual(x, assetClass);
      const coeff = classCoeff[assetClass];
      for (let i = 0; i < n; i++) g[i] += 2 * r * coeff[i];
    }
    if (hasLeverageTerm) {
      const rL = residualL(x);
      for (let i = 0; i < n; i++) g[i] += 2 * LEVERAGE_TIEBREAKER_WEIGHT * rL * leverageCoeff[i];
    }
    return g;
  };

  let x = projectOntoBudgetBox(new Array(n).fill(budget / n), lowerBounds, upperBounds, budget);
  let fx = objective(x);
  let eta = 1;

  const MAX_ITERATIONS = 300;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const g = gradient(x);
    if (Math.sqrt(dot(g, g)) < 1e-9) break;

    let stepEta = eta * 1.5; // grow slightly each round to recover from an overly-cautious previous step
    let improved = false;

    for (let tries = 0; tries < 40; tries++) {
      const candidate = projectOntoBudgetBox(
        x.map((xi, i) => xi - stepEta * g[i]),
        lowerBounds,
        upperBounds,
        budget
      );
      const fCandidate = objective(candidate);
      if (fCandidate <= fx + 1e-12) {
        x = candidate;
        fx = fCandidate;
        eta = stepEta;
        improved = true;
        break;
      }
      stepEta /= 2;
    }

    if (!improved) break; // no improving step found at any scale — converged
  }

  return x;
}

function buildPlanResult(
  instruments: InstrumentExposure[],
  x: number[],
  currentNotionalByAssetClass: Record<string, number>,
  currentNotionalTotal: number,
  currentMarketTotal: number,
  budget: number
): LeverageAwarePlan {
  const resultingNotionalByAssetClass: Record<string, number> = { ...currentNotionalByAssetClass };
  const trades: InstrumentTrade[] = [];
  let notionalDelta = 0;

  instruments.forEach((inst, i) => {
    const amount = x[i];
    if (Math.abs(amount) < 0.5) return; // ignore sub-50-cent noise from the numerical solve

    trades.push({ assetId: inst.assetId, ticker: inst.ticker, displayTicker: inst.displayTicker, name: inst.name, amount });

    for (const [assetClass, perEuro] of Object.entries(inst.exposurePerEuro)) {
      const delta = amount * (perEuro ?? 0);
      resultingNotionalByAssetClass[assetClass] = (resultingNotionalByAssetClass[assetClass] ?? 0) + delta;
      notionalDelta += delta;
    }
  });

  const resultingMarketTotal = currentMarketTotal + budget;
  const resultingNotionalTotal = currentNotionalTotal + notionalDelta;

  return {
    trades: trades.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    resultingNotionalByAssetClass,
    resultingMarketTotal,
    resultingLeverageRatio: resultingMarketTotal > 0 ? resultingNotionalTotal / resultingMarketTotal : 1,
  };
}

const emptyPlan = (
  currentNotionalByAssetClass: Record<string, number>,
  currentNotionalTotal: number,
  currentMarketTotal: number
): LeverageAwarePlan => ({
  trades: [],
  resultingNotionalByAssetClass: currentNotionalByAssetClass,
  resultingMarketTotal: currentMarketTotal,
  resultingLeverageRatio: currentMarketTotal > 0 ? currentNotionalTotal / currentMarketTotal : 1,
});

/**
 * Versa: split new cash across the instruments already held, toward the notional target,
 * with no selling. Mirrors `allocateContribution` (allocationUtils.ts) but instrument-aware.
 */
export function planInstrumentContribution(
  assets: Asset[],
  currentNotionalByAssetClass: Record<string, number>,
  currentNotionalTotal: number,
  currentMarketTotal: number,
  targetPercentageByAssetClass: Record<string, number>,
  amount: number,
  targetLeverageRatio?: number
): LeverageAwarePlan {
  const instruments = buildInstrumentExposures(assets);
  if (instruments.length === 0 || amount <= 0) {
    return emptyPlan(currentNotionalByAssetClass, currentNotionalTotal, currentMarketTotal);
  }

  const lowerBounds = instruments.map(() => 0);
  const upperBounds = instruments.map(() => amount);

  const x = solve({
    instruments,
    currentNotionalByAssetClass,
    currentNotionalTotal,
    currentMarketTotal,
    targetPercentageByAssetClass,
    budget: amount,
    lowerBounds,
    upperBounds,
    targetLeverageRatio,
  });

  return buildPlanResult(instruments, x, currentNotionalByAssetClass, currentNotionalTotal, currentMarketTotal, amount);
}

/**
 * Ribilancia: trade among the instruments already held (net-zero cash) toward the notional
 * target. Mirrors `buildRebalancePlan` (allocationUtils.ts) but instrument-aware. Sells are
 * bounded by each instrument's current market value (no shorting).
 */
export function planInstrumentRebalance(
  assets: Asset[],
  currentNotionalByAssetClass: Record<string, number>,
  currentNotionalTotal: number,
  currentMarketTotal: number,
  targetPercentageByAssetClass: Record<string, number>,
  targetLeverageRatio?: number
): LeverageAwarePlan {
  const instruments = buildInstrumentExposures(assets);
  if (instruments.length === 0) {
    return emptyPlan(currentNotionalByAssetClass, currentNotionalTotal, currentMarketTotal);
  }

  const lowerBounds = instruments.map((inst) => -inst.marketValue);
  const upperBounds = instruments.map(() => currentMarketTotal);

  const x = solve({
    instruments,
    currentNotionalByAssetClass,
    currentNotionalTotal,
    currentMarketTotal,
    targetPercentageByAssetClass,
    budget: 0,
    lowerBounds,
    upperBounds,
    targetLeverageRatio,
  });

  return buildPlanResult(instruments, x, currentNotionalByAssetClass, currentNotionalTotal, currentMarketTotal, 0);
}
