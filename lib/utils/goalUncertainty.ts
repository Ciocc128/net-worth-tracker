/**
 * Goal uncertainty — «con che probabilità arrivo all'obiettivo?» (doc/fire-ipotesi/README.md § 13, RO4–RO7).
 *
 * A monthly lognormal simulation of the portfolio a goal invests in, on the Base scenario of the page's
 * hypotheses (the goal's own weights, else the target portfolio's, net of the recurring costs):
 *
 *   s² = ln(1 + V/m²)     μ = ln m − s²/2  ( = ln(1 + CAGR) )
 *   month k:  V_k = V_{k−1} · exp(μ/12 + (s/√12)·z_k) + c
 *
 * The value at month k is LINEAR in the contribution `c` once the shocks are fixed — `V_k = A_k + c·B_k`
 * with `A_k = V_0·ΠG` and `B_k = B_{k−1}·G_k + 1` — so one pass over the paths keeps `A` and `B`, and every
 * probability for any contribution (the solver of RO6 included) is a count over those two arrays: the same
 * shocks at every step (common random numbers, a fixed seed per goal and per valuation), no path stored.
 *
 * Pure: no Firestore, no React. Time is injected by the caller (`monthsToDeadline`, the chart's month indices).
 */

import type { AssetClass } from '@/types/assets';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { goalPortfolioMoments, type GoalAssumptions } from '@/lib/utils/goalTrajectory';

export const GOAL_SIMULATION_PATHS = 10_000;
/** RO7: a path that has not reached the target after 50 years is «never». */
export const GOAL_ARRIVAL_MAX_MONTHS = 600;
/** RO6: the contribution is looked for on a grid of 10 €, up to this cap. */
export const GOAL_CONTRIBUTION_STEP = 10;
export const GOAL_CONTRIBUTION_CAP = 1_000_000;
/** «In 9 casi su 10». */
export const GOAL_CONFIDENCE = 0.9;
/** The verdict's tolerance (`computeGoalTrajectory`): at zero volatility `P = 100%` ⇔ `onTrack`. */
const TARGET_TOLERANCE = 0.999;

// ─── RO4: the lognormal of the portfolio ──────────────────────────────────────

export interface GoalLogNormal {
  /** `m = 1 + arithmetic mean`. */
  m: number;
  /** Volatility of the yearly factor, as a decimal. */
  volatility: number;
  /** σ of the yearly log factor. */
  s: number;
  /** Mean of the yearly log factor, `ln(1 + CAGR)`. */
  mu: number;
}

/** `arithmeticMeanPct` and `volatilityPct` in percent; null when the mean factor is not positive (no lognormal). */
export function logNormalFromMoments(arithmeticMeanPct: number, volatilityPct: number): GoalLogNormal | null {
  const m = 1 + arithmeticMeanPct / 100;
  const volatility = Math.max(0, volatilityPct) / 100;
  if (!(m > 0) || !Number.isFinite(volatility)) return null;
  const s2 = Math.log(1 + (volatility * volatility) / (m * m));
  return { m, volatility, s: Math.sqrt(s2), mu: Math.log(m) - s2 / 2 };
}

export interface GoalMethod {
  paths: number;
  /** Compound return, percent a year. */
  cagr: number;
  /** Volatility, percent a year. */
  volatility: number;
  /** True when the recurring costs are taken out of the return. */
  netOfCosts: boolean;
}

/** The goal's portfolio on the Base scenario as a lognormal; null when the page holds none or its mean is not positive. */
export function goalLogNormal(
  allocation: Partial<Record<AssetClass, number>> | undefined,
  assumptions: GoalAssumptions,
): { logNormal: GoalLogNormal; method: GoalMethod } | null {
  const moments = goalPortfolioMoments(allocation, assumptions);
  if (!moments) return null;
  const logNormal = logNormalFromMoments(moments.arithmeticMean, moments.volatility);
  if (!logNormal) return null;
  const netOfCosts = assumptions.costs != null;
  return { logNormal, method: { paths: GOAL_SIMULATION_PATHS, cagr: moments.cagr, volatility: moments.volatility, netOfCosts } };
}

// ─── RO4–RO5: the simulation ──────────────────────────────────────────────────

/**
 * A standard normal source that spends one Box-Muller transform on two draws (cos, then sin): a goal path
 * is up to 600 monthly shocks, and the cost of the page's list is the cost of those draws.
 */
function pairedNormals(random: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return z;
    }
    // log(0) is −∞: a uniform source can return exactly 0.
    const radius = Math.sqrt(-2 * Math.log(Math.max(random(), Number.EPSILON)));
    const angle = 2 * Math.PI * random();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/** `floor(n·p)` on the ascending values, like the percentiles of the Proiezione (RV4). */
export function percentileOf(sorted: ArrayLike<number>, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
}

export interface GoalSimulationInput {
  logNormal: GoalLogNormal;
  /** Today's value of the goal (`calculateGoalProgress`). */
  currentValue: number;
  target: number;
  /** `monthsToDeadline` of the trajectory, never recomputed here. */
  months: number;
  /** The monthly contribution of today. */
  contribution: number;
  /** Months whose 10th/50th/90th percentile are wanted (the chart's `monthIndex`); empty = probability only. */
  sampleMonths?: readonly number[];
  paths?: number;
}

export interface GoalPercentiles {
  monthIndex: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface GoalSimulation {
  paths: number;
  /** RO5: the share of paths with `V_M ≥ 0,999·target` when the contribution is `contribution`. */
  probability(contribution: number): number;
  /** The percentiles at each sample month, with the contribution of today. */
  percentiles: GoalPercentiles[];
}

export function simulateGoal(input: GoalSimulationInput): GoalSimulation {
  const { logNormal, currentValue, target, months, contribution } = input;
  const n = input.paths ?? GOAL_SIMULATION_PATHS;
  const sampleMonths = input.sampleMonths ?? [];
  const horizon = Math.max(0, Math.floor(months));
  const normal = pairedNormals(createSeededRandom(MONTE_CARLO_SEED));
  const drift = logNormal.mu / 12;
  const vol = logNormal.s / Math.sqrt(12);

  const base = new Float64Array(n);
  const annuity = new Float64Array(n);
  const sampleSlot = new Int32Array(horizon + 1).fill(-1);
  sampleMonths.forEach((month, slot) => {
    if (month >= 0 && month <= horizon) sampleSlot[month] = slot;
  });
  const samples = sampleMonths.map(() => new Float64Array(n));

  for (let path = 0; path < n; path++) {
    let a = currentValue;
    let b = 0;
    if (sampleSlot[0] >= 0) samples[sampleSlot[0]][path] = a;
    for (let k = 1; k <= horizon; k++) {
      const growth = Math.exp(drift + vol * normal());
      a *= growth;
      b = b * growth + 1;
      const slot = sampleSlot[k];
      if (slot >= 0) samples[slot][path] = a + contribution * b;
    }
    base[path] = a;
    annuity[path] = b;
  }

  const threshold = TARGET_TOLERANCE * target;
  const percentiles = sampleMonths.map((monthIndex, slot): GoalPercentiles => {
    const sorted = samples[slot].slice().sort();
    return { monthIndex, p10: percentileOf(sorted, 0.1), p50: percentileOf(sorted, 0.5), p90: percentileOf(sorted, 0.9) };
  });

  return {
    paths: n,
    probability: (c) => {
      let hits = 0;
      for (let path = 0; path < n; path++) if (base[path] + c * annuity[path] >= threshold) hits++;
      return hits / n;
    },
    percentiles,
  };
}

// ─── RO6: the contribution for 9 cases in 10 ──────────────────────────────────

export type GoalContributionReading =
  /** `P(today's pace) ≥ 90%`: no solver. */
  | { kind: 'enough' }
  | { kind: 'amount'; value: number }
  /** Even `GOAL_CONTRIBUTION_CAP` a month does not reach 90%. */
  | { kind: 'over' };

/**
 * The smallest contribution on the 10 € grid with `P ≥ 90%`. Exact on the grid because `P` grows with the
 * contribution path by path (the shocks are the same at every step).
 */
export function solveGoalContribution(simulation: Pick<GoalSimulation, 'probability'>, current: number, required: number): GoalContributionReading {
  if (simulation.probability(current) >= GOAL_CONFIDENCE) return { kind: 'enough' };
  const enough = (k: number) => simulation.probability(k * GOAL_CONTRIBUTION_STEP) >= GOAL_CONFIDENCE;
  if (enough(0)) return { kind: 'amount', value: 0 };
  const cap = Math.floor(GOAL_CONTRIBUTION_CAP / GOAL_CONTRIBUTION_STEP);
  let hi = Math.max(1, Math.ceil(Math.max(0, required) / GOAL_CONTRIBUTION_STEP));
  while (!enough(hi)) {
    if (hi >= cap) return { kind: 'over' };
    hi = Math.min(cap, hi * 2);
  }
  let lo = 0; // `enough(lo)` is false
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (enough(mid)) hi = mid;
    else lo = mid;
  }
  return { kind: 'amount', value: hi * GOAL_CONTRIBUTION_STEP };
}

// ─── RO7: a goal with an amount and no deadline ───────────────────────────────

export interface GoalArrival {
  /** Months to reach the target in half of the cases; null = not within 50 years. */
  medianMonths: number | null;
  /** …in 9 cases in 10. */
  p90Months: number | null;
}

export function simulateGoalArrival(input: Pick<GoalSimulationInput, 'logNormal' | 'currentValue' | 'target' | 'contribution' | 'paths'>): GoalArrival {
  const { logNormal, currentValue, target, contribution } = input;
  const n = input.paths ?? GOAL_SIMULATION_PATHS;
  const normal = pairedNormals(createSeededRandom(MONTE_CARLO_SEED));
  const drift = logNormal.mu / 12;
  const vol = logNormal.s / Math.sqrt(12);
  const never = GOAL_ARRIVAL_MAX_MONTHS + 1;
  const first = new Float64Array(n);
  for (let path = 0; path < n; path++) {
    let v = currentValue;
    let reached = never;
    for (let k = 1; k <= GOAL_ARRIVAL_MAX_MONTHS; k++) {
      v = v * Math.exp(drift + vol * normal()) + contribution;
      if (v >= target) {
        reached = k;
        break;
      }
    }
    first[path] = reached;
  }
  first.sort();
  const read = (p: number) => {
    const months = percentileOf(first, p);
    return months > GOAL_ARRIVAL_MAX_MONTHS ? null : months;
  };
  return { medianMonths: read(0.5), p90Months: read(GOAL_CONFIDENCE) };
}

// ─── What a goal shows ────────────────────────────────────────────────────────

export type GoalUncertainty =
  | {
      kind: 'dated';
      probability: number;
      method: GoalMethod;
      /** Present in the full reading only (the selected goal): the band for the chart and the contribution for 9 in 10. */
      detail: { percentiles: GoalPercentiles[]; atDeadline: GoalPercentiles | null; contribution: GoalContributionReading } | null;
    }
  | { kind: 'arrival'; arrival: GoalArrival; method: GoalMethod }
  /** The goal's portfolio has no defined return (RO4). */
  | { kind: 'unavailable' };

export interface GoalUncertaintyInput {
  allocation: Partial<Record<AssetClass, number>> | undefined;
  assumptions: GoalAssumptions;
  currentValue: number;
  target: number;
  /** `trajectory.monthsToDeadline`, null without a deadline. */
  monthsToDeadline: number | null;
  contribution: number;
  /** `trajectory.requiredMonthlyContribution`: where the solver starts. */
  requiredMonthly: number | null;
  /** The chart's month indices: with them (the selected goal) the reading is full — band and solver. */
  sampleMonths?: readonly number[];
}

/**
 * RO5–RO7 for one goal. Null where nothing applies: no target, already reached, or a deadline already
 * passed. A deadline gives the probability (and, with `sampleMonths`, the band and the contribution);
 * no deadline gives the arrival months.
 */
export function computeGoalUncertainty(input: GoalUncertaintyInput): GoalUncertainty | null {
  const { target, currentValue, monthsToDeadline } = input;
  if (!(target > 0) || currentValue >= target) return null;
  if (monthsToDeadline === 0) return null;
  const resolved = goalLogNormal(input.allocation, input.assumptions);
  if (!resolved) return { kind: 'unavailable' };
  const { logNormal, method } = resolved;

  if (monthsToDeadline === null) {
    return { kind: 'arrival', arrival: simulateGoalArrival({ logNormal, currentValue, target, contribution: input.contribution }), method };
  }

  const full = input.sampleMonths != null;
  const simulation = simulateGoal({ logNormal, currentValue, target, months: monthsToDeadline, contribution: input.contribution, sampleMonths: input.sampleMonths });
  return {
    kind: 'dated',
    probability: simulation.probability(input.contribution),
    method,
    detail: full
      ? {
          percentiles: simulation.percentiles,
          atDeadline: simulation.percentiles.find((p) => p.monthIndex === monthsToDeadline) ?? simulation.percentiles[simulation.percentiles.length - 1] ?? null,
          contribution: solveGoalContribution(simulation, input.contribution, input.requiredMonthly ?? 0),
        }
      : null,
  };
}
