/**
 * The sustainable withdrawal (S1, dossier `doc/fire-ipotesi/README.md` § 10.5, RS3–RS4): the largest
 * annual withdrawal that still lasts the horizon in at least `p` of the simulated paths.
 *
 * Pure: the caller hands over `success(w)`, the share of paths that survive a withdrawal `w`
 * (`countSuccesses` on the factors of a run, so the figure replays the run on screen without
 * drawing again).
 */
import { countSuccesses } from '@/lib/services/monteCarloService';
import type { MonteCarloScenarioKey } from '@/lib/utils/monteCarloMarket';
import type { MonteCarloParams } from '@/types/assets';

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

/** RS3: bisection on `[0, hi]`, rounded down to `step`, then verified (and lowered) so the printed figure meets the threshold. */
export function solveSustainableWithdrawal({
  success,
  capital,
  probability,
  step = DEFAULT_STEP,
}: SolveSustainableWithdrawalInput): SustainableWithdrawal {
  const none: SustainableWithdrawal = { withdrawal: null, successRate: 0, rate: null };
  if (!(capital > 0) || success(0) < probability) return none;

  // Bracket: double from the capital until the threshold is missed.
  let high = capital;
  let doublings = 0;
  while (success(high) >= probability) {
    high *= 2;
    if (++doublings > MAX_DOUBLINGS) return none;
  }
  let low = 0;
  const tolerance = step / 100;
  while (high - low > tolerance) {
    const middle = (low + high) / 2;
    if (success(middle) >= probability) low = middle;
    else high = middle;
  }

  let steps = Math.floor(low / step + 1e-9);
  while (steps > 0 && success(steps * step) < probability) steps--;
  const withdrawal = steps * step;
  return { withdrawal, successRate: success(withdrawal), rate: withdrawal / capital };
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
