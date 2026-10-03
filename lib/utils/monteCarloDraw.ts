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
 * Until T2 (correlations) the classes are drawn independently.
 */
import type { MonteCarloClassParams, MonteCarloMarketScenario } from '@/types/assets';
import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';

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
}

/** Prepares what a run draws from, once per run. */
export function buildDrawPlan(market: MonteCarloMarketScenario): DrawPlan {
  const logNormals = MONTE_CARLO_CLASSES.map((cls) => toLogNormal(market.classes[cls]));
  return {
    m: logNormals.map((entry) => entry.m),
    s: logNormals.map((entry) => entry.s),
    medianGrowth: logNormals.map((entry) => entry.medianGrowth),
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
 * Always consumes two uniforms per class, whatever the volatility — the number of draws per path
 * must not depend on the parameters (a seeded run stays comparable across plans).
 */
export function drawYear(plan: DrawPlan, random: () => number = Math.random): number[] {
  const out = new Array<number>(plan.m.length);
  for (let i = 0; i < plan.m.length; i++) {
    const z = standardNormal(random);
    out[i] = plan.s[i] === 0 ? plan.medianGrowth[i] - 1 : Math.exp(plan.m[i] + plan.s[i] * z) - 1;
  }
  return out;
}

/** R3: `1 + r_p = Σ w_i·(1 + r_i)` with the weights in percent. Returns `r_p` as a decimal. */
export function portfolioReturn(weightsPct: number[], returns: number[]): number {
  let growth = 0;
  for (let i = 0; i < returns.length; i++) growth += (weightsPct[i] / 100) * (1 + returns[i]);
  return growth - 1;
}
