/**
 * The sustainable withdrawal (S1, dossier `doc/fire-ipotesi/README.md` § 10.5, RS3–RS4): the largest
 * annual withdrawal that still lasts the horizon in at least `p` of the simulated paths.
 *
 * Pure: the caller hands over `success(w)`, the share of paths that survive a withdrawal `w`
 * (`countSuccesses` on the factors of a run, so the figure replays the run on screen without
 * drawing again).
 */
import { countSuccesses, runMonteCarloSimulation } from '@/lib/services/monteCarloService';
import { MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import type { MonteCarloScenarioKey } from '@/lib/utils/monteCarloMarket';
import type { MonteCarloMarketScenario, MonteCarloParams } from '@/types/assets';
import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';

/** The three confidence levels of the tile (D-S2); the verdict reads the middle one. */
export const SUSTAINABLE_PROBABILITIES = [0.8, 0.9, 0.95] as const;
export type SustainableProbability = (typeof SUSTAINABLE_PROBABILITIES)[number];
export const SUSTAINABLE_VERDICT_PROBABILITY: SustainableProbability = 0.9;

/** The withdrawal is rounded down to this many euros (RS3). */
const DEFAULT_STEP = 100;
const MAX_DOUBLINGS = 60;

export interface SustainableWithdrawal {
  /** The largest multiple of `step` that keeps `success ≥ probability`; null = not even a zero withdrawal does (ruin by leverage above `1 − p`). */
  withdrawal: number | null;
  /** Share of paths that survive `withdrawal` (0–1); 0 when `withdrawal` is null. */
  successRate: number;
  /** `withdrawal / capital`, as a fraction; null with `withdrawal`. */
  rate: number | null;
}

export interface SolveSustainableWithdrawalInput {
  /** Share (0–1) of the paths that last the horizon when `w` is drawn every year. Non-increasing in `w`. */
  success: (withdrawal: number) => number;
  /** The run's starting capital, the unit of the bisection's first bracket and of `rate`. */
  capital: number;
  /** 0–1. */
  probability: number;
  step?: number;
}

/**
 * RS3: bisection over the multiples of `step` (the figure is rounded down to one anyway, so there is
 * nothing finer to look for), then a check that the printed figure meets the threshold, lowering it
 * if the success curve was not monotone there. Every `success(w)` is evaluated once.
 */
export function solveSustainableWithdrawal({
  success: rawSuccess,
  capital,
  probability,
  step = DEFAULT_STEP,
}: SolveSustainableWithdrawalInput): SustainableWithdrawal {
  const none: SustainableWithdrawal = { withdrawal: null, successRate: 0, rate: null };
  const memo = new Map<number, number>();
  const success = (steps: number): number => {
    let value = memo.get(steps);
    if (value === undefined) {
      value = rawSuccess(steps * step);
      memo.set(steps, value);
    }
    return value;
  };
  if (!(capital > 0) || success(0) < probability) return none;

  // Bracket: double from the capital until the threshold is missed.
  let high = Math.max(1, Math.ceil(capital / step));
  let doublings = 0;
  while (success(high) >= probability) {
    high *= 2;
    if (++doublings > MAX_DOUBLINGS) return none;
  }
  let low = 0;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (success(middle) >= probability) low = middle;
    else high = middle;
  }
  while (low > 0 && success(low) < probability) low--;

  const withdrawal = low * step;
  return { withdrawal, successRate: success(low), rate: withdrawal / capital };
}

/** What `summarizeSustainableSpending` reads of one scenario's last run. */
export interface SustainableRunInput {
  factors: Float64Array;
  params: MonteCarloParams;
}

/** The nine figures (RS4): per probability, the three scenarios. */
export interface SustainableSpendingSummary {
  rows: { probability: SustainableProbability; bear: SustainableWithdrawal; base: SustainableWithdrawal; bull: SustainableWithdrawal }[];
  /** Starting capital of the runs (the «Capitale» of the plan), for the rates. */
  capital: number;
}

export function solveForRun(run: SustainableRunInput, probability: number, step = DEFAULT_STEP): SustainableWithdrawal {
  const n = run.params.numberOfSimulations;
  return solveSustainableWithdrawal({
    success: (withdrawal) => countSuccesses(run.factors, n, run.params, withdrawal) / n,
    capital: run.params.initialPortfolio,
    probability,
    step,
  });
}

export function summarizeSustainableSpending(runs: Record<MonteCarloScenarioKey, SustainableRunInput>): SustainableSpendingSummary {
  return {
    capital: runs.base.params.initialPortfolio,
    rows: SUSTAINABLE_PROBABILITIES.map((probability) => ({
      probability,
      bear: solveForRun(runs.bear, probability),
      base: solveForRun(runs.base, probability),
      bull: solveForRun(runs.bull, probability),
    })),
  };
}

// ─── The personal SWR (E1, RS5) ───────────────────────────────────────────────

/** RS5: the personal SWR is the 90% level, on the Base market, on a pure plan. */
export const PERSONAL_SWR_PROBABILITY = SUSTAINABLE_VERDICT_PROBABILITY;
/** RS5: the personal SWR runs on this many paths (the Monte Carlo tab's default). */
export const PERSONAL_SWR_SIMULATIONS = 10_000;
/** RS5: a rate in the horizon's own bounds — 90 minus the target age, between ten and sixty years. */
export const PERSONAL_SWR_MIN_YEARS = 10;
export const PERSONAL_SWR_MAX_YEARS = 60;
/** The age the plan ends at (RS5). */
export const PERSONAL_SWR_HORIZON_AGE = 90;

/** RS5's horizon: `clamp(90 − target age, 10, 60)`. */
export function resolvePersonalSwrHorizon(targetAge: number): number {
  return Math.min(PERSONAL_SWR_MAX_YEARS, Math.max(PERSONAL_SWR_MIN_YEARS, PERSONAL_SWR_HORIZON_AGE - targetAge));
}

export interface PersonalSwrInput {
  weights: Record<MonteCarloClass, number>;
  /** The Base scenario's market (CAGR + volatility per class). */
  market: MonteCarloMarketScenario;
  correlations?: number[];
  leverageSpread?: number;
  /** RC4: the portfolio's cost, percent a year (`assumptions.cost.total`). */
  costPct?: number;
  horizonYears: number;
  numberOfSimulations?: number;
}

export interface PersonalSwr {
  /** Percent, rounded down to 0,1 points; null = not even a zero withdrawal reaches 90% (ruin by leverage above 10%). */
  rate: number | null;
  horizonYears: number;
}

/**
 * RS5: RS1–RS3 on a PURE plan — capital 1, no inflows, no pensions, no tax (the FIRE number counts
 * those apart; putting them here would count them twice). Without inflows or tax `success` depends
 * on `W/K` alone, so `K = 1` gives the plan's rate for any capital. The bisection steps by 0,001
 * (0,1 points), which is also the rounding down.
 */
export function solvePersonalSwr(input: PersonalSwrInput): PersonalSwr {
  const n = input.numberOfSimulations ?? PERSONAL_SWR_SIMULATIONS;
  const params: MonteCarloParams = {
    portfolioSource: 'custom',
    initialPortfolio: 1,
    retirementYears: input.horizonYears,
    weights: input.weights,
    leverageSpread: input.leverageSpread,
    annualCostRate: input.costPct,
    annualWithdrawal: 0,
    withdrawalAdjustment: 'inflation',
    market: input.market,
    correlations: input.correlations,
    numberOfSimulations: n,
    random: createSeededRandom(MONTE_CARLO_SEED),
  };
  const { factors } = runMonteCarloSimulation(params, { keepFactors: true });
  const solved = solveSustainableWithdrawal({
    success: (withdrawal) => countSuccesses(factors!, n, params, withdrawal) / n,
    capital: 1,
    probability: PERSONAL_SWR_PROBABILITY,
    step: 0.001,
  });
  return { rate: solved.withdrawal === null ? null : Math.round(solved.withdrawal * 1000) / 10, horizonYears: input.horizonYears };
}
