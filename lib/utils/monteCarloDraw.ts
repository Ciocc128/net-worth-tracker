/**
 * The yearly draw of the Monte Carlo engines — ONE module both engines call (the decumulation
 * run in `monteCarloService.runSingleSimulation` and the Ventaglio's accumulation run), so the
 * two cannot drift apart (doc/montecarlo/README.md § 1.5, § 4.3).
 *
 * Rule R1: the user types a CAGR `g` and a volatility `σa` (the standard deviation of SIMPLE
 * annual returns). The return is lognormal, `ln(1+r) = m + s·z` with `z` standard normal:
 *
 *   k  = σa² / (1+g)²
 *   x  = (1 + √(1 + 4k)) / 2        // x = e^{s²}
 *   s  = √(ln x)                    // std of the log-return
 *   m  = ln(1+g)                    // mean of the log-return: the median of (1+r) is 1+g
 *   μa = (1+g)·√x − 1               // arithmetic mean, shown read-only in Impostazioni
 *
 * Every `r > −100%` by construction. At zero volatility a class returns exactly its CAGR.
 *
 * The seven classes move together through one correlation matrix `C` (T2, README § 6): the
 * independent normals `ε` become `z = L·ε` with `L` the Cholesky factor of `C`, computed ONCE per
 * run in `buildDrawPlan`. Without a matrix (or with the identity) `z = ε`, float for float.
 */
import type { MonteCarloClassParams, MonteCarloMarketScenario } from '@/types/assets';
import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';
import { cholesky, expandUpperTriangle, nearestCorrelation, pairCount, type Matrix } from './correlationMatrix';

export interface LogNormalParams {
  /** Mean of the log-return. */
  m: number;
  /** Standard deviation of the log-return. */
  s: number;
  /** Arithmetic mean of the simple return, decimal (R1's `μa`). */
  arithmeticMean: number;
  /** `1 + g`, the median growth factor. */
  medianGrowth: number;
}

/** R1. `params` in percent, the result in decimals. */
export function toLogNormal(params: MonteCarloClassParams): LogNormalParams {
  const g = params.cagr / 100;
  const sigma = Math.max(0, params.volatility) / 100;
  // A CAGR at or below −100% has no log; the engine never receives one (validation is −50..100),
  // but a stray value must not produce NaN paths.
  const growth = Math.max(1 + g, Number.EPSILON);
  if (sigma === 0) return { m: Math.log(growth), s: 0, arithmeticMean: growth - 1, medianGrowth: growth };
  const k = (sigma * sigma) / (growth * growth);
  const x = (1 + Math.sqrt(1 + 4 * k)) / 2;
  const s = Math.sqrt(Math.log(x));
  return { m: Math.log(growth), s, arithmeticMean: growth * Math.sqrt(x) - 1, medianGrowth: growth };
}

/** R2: the arithmetic mean `μ` and volatility `σ` of the old normal model → the CAGR with the same mean and variance of `1+r`. Percent in, percent out. */
export function cagrFromArithmeticMean(meanPct: number, volatilityPct: number): number {
  const mu = meanPct / 100;
  const sigma = volatilityPct / 100;
  const base = Math.max(1 + mu, Number.EPSILON);
  const x = 1 + (sigma * sigma) / (base * base);
  return (base / Math.sqrt(x) - 1) * 100;
}

export interface DrawPlan {
  /** Per class, in `MONTE_CARLO_CLASSES` order. */
  m: number[];
  s: number[];
  /** `1 + g` per class: what a class with zero volatility returns, exactly. */
  medianGrowth: number[];
  /** Lower Cholesky factor of the correlation matrix; `null` = independent classes (`C = I`). */
  cholesky: Matrix | null;
}

/**
 * The Cholesky factor of the typed correlations, or `null` when there are none (independent draws).
 * A matrix that is not valid is corrected silently (R5): a document written from elsewhere must
 * never make a run fail.
 */
export function buildCorrelationFactor(correlations: readonly number[] | undefined): Matrix | null {
  const n = MONTE_CARLO_CLASSES.length;
  if (!correlations || correlations.length !== pairCount(n)) return null;
  if (correlations.every((value) => value === 0)) return null;
  const matrix = nearestCorrelation(expandUpperTriangle(correlations, n));
  try {
    return cholesky(matrix);
  } catch {
    return null;
  }
}

/** Prepares what a run draws from, once per run. `correlations` is the upper triangle (21 values); absent = independent. */
export function buildDrawPlan(market: MonteCarloMarketScenario, correlations?: readonly number[]): DrawPlan {
  const logNormals = MONTE_CARLO_CLASSES.map((cls) => toLogNormal(market.classes[cls]));
  return {
    m: logNormals.map((entry) => entry.m),
    s: logNormals.map((entry) => entry.s),
    medianGrowth: logNormals.map((entry) => entry.medianGrowth),
    cholesky: buildCorrelationFactor(correlations),
  };
}

/** A standard normal by Box-Muller. */
export function standardNormal(random: () => number): number {
  // log(0) is −∞: a uniform source can return exactly 0 (the seeded one once in 2^32 draws).
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * One year of simple returns (decimals) for the seven classes, in `MONTE_CARLO_CLASSES` order.
 * Always consumes two uniforms per class, whatever the volatility or the correlations — the number
 * of draws per path must not depend on the parameters (a seeded run stays comparable across plans).
 */
export function drawYear(plan: DrawPlan, random: () => number = Math.random): number[] {
  const n = plan.m.length;
  const epsilon = new Array<number>(n);
  for (let i = 0; i < n; i++) epsilon[i] = standardNormal(random);

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let z = epsilon[i];
    if (plan.cholesky) {
      const row = plan.cholesky[i];
      z = 0;
      for (let k = 0; k <= i; k++) z += row[k] * epsilon[k];
    }
    out[i] = plan.s[i] === 0 ? plan.medianGrowth[i] - 1 : Math.exp(plan.m[i] + plan.s[i] * z) - 1;
  }
  return out;
}

/** Index of the Liquidità class in the draw: the funding rate of the leverage reads its return (R4). */
const CASH_INDEX = MONTE_CARLO_CLASSES.indexOf('cash');

/** `W = Σw / 100`, the leverage of a weight vector in percent; 1 when it sums to 100 or less. */
export function weightsLeverage(weightsPct: readonly number[]): number {
  let sum = 0;
  for (const weight of weightsPct) sum += weight;
  return sum > 100 + 1e-9 ? sum / 100 : 1;
}

/**
 * R3 + R4: `1 + r_p = Σ w_i·(1 + r_i) − (W − 1)·(1 + c)` with the weights in percent, `W = Σw/100` and
 * `c` the Liquidità return drawn this year plus `leverageSpreadPct` (percent). The debt term exists only
 * when `W > 1`: at `W ≤ 1` the result is the plain weighted return, float for float (A12).
 * RC4 (doc/fire-ipotesi § 9): `costPct` (percent, TER and stamp duty on the capital) is taken off the year's
 * result, AFTER the return: `(1 + r_p)(1 − c/100) − 1`. Zero = the plain return, float for float (C11).
 * Returns `r_p` as a decimal; `−1` or less means the capital is wiped out (the engines call it «leva»).
 */
export function portfolioReturn(weightsPct: number[], returns: number[], leverageSpreadPct = 0, costPct = 0): number {
  let growth = 0;
  for (let i = 0; i < returns.length; i++) growth += (weightsPct[i] / 100) * (1 + returns[i]);
  const leverage = weightsLeverage(weightsPct);
  if (leverage > 1) growth -= (leverage - 1) * (1 + returns[CASH_INDEX] + leverageSpreadPct / 100);
  if (costPct) growth *= 1 - costPct / 100;
  return growth - 1;
}
