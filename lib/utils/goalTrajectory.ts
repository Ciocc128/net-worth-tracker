/**
 * Goal trajectory — the pure layer behind the "Obiettivi" redesign.
 *
 * Turns a goal's static target/date into the decision metrics the page exists for:
 *   - required monthly contribution to hit the target by its date (annuity formula),
 *   - projected completion date at the current contribution + expected return,
 *   - an on-track / off-track / reached verdict.
 *
 * Plus the derivations for the redesign's new features:
 *   - goalAnnualReturn() from a goal's recommended allocation on the page's common hypotheses (B1, D8),
 *   - buildGoalProjectionSeries() glide-path points for the mini chart (B2),
 *   - allocateContributionAcrossGoals() weighted split of new cash (B3),
 *   - sortGoalRowsByUrgency() for the list order (the page summary lives in goalsSummary.ts).
 *
 * Everything is pure and time-injectable (`now`) so it can be unit-tested. No Firestore,
 * no React. The component layer only fetches, memoizes, and renders.
 *
 * Return assumptions are nominal and indicative, NOT financial advice — surfaced as such
 * in the UI copy.
 */

import { AssetClass } from '@/types/assets';
import {
  InvestmentGoal,
  GoalProgress,
  GoalPriority,
} from '@/types/goals';
import { monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { portfolioCompoundReturn, type FireAssumptions, type PortfolioReturn } from '@/lib/utils/fireAssumptions';
import { portfolioCost } from '@/lib/utils/fireCosts';

/** The slice of the page's hypotheses a goal needs: the market of Impostazioni › Simulazioni and the target portfolio's scenarios. */
export type GoalAssumptions = Pick<FireAssumptions, 'scenarios' | 'market'> & Partial<Pick<FireAssumptions, 'costs' | 'weights'>>;

// Priority multipliers for the cross-goal contribution split. Mirrors the
// weighting used by deriveTargetAllocationFromGoals so the two planners agree.
const GOAL_PRIORITY_WEIGHTS: Record<GoalPriority, number> = {
  alta: 3,
  media: 2,
  bassa: 1,
};

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export type GoalVerdict =
  | 'reached' // currentValue >= target
  | 'onTrack' // dated goal, current pace reaches target by the deadline
  | 'offTrack' // dated goal, current pace falls short
  | 'noDeadline' // target set but no date — timing can't be judged
  | 'noTarget'; // open-ended goal

export interface GoalTrajectory {
  verdict: GoalVerdict;
  /** Expected nominal annual return used for this goal (%). */
  annualReturn: number;
  /** Where that return comes from (D8): the goal's own allocation or the target portfolio. */
  returnOrigin: GoalReturn['origin'];
  /** Classes of the goal's allocation left out of the return (crypto, real estate). */
  returnOutside: GoalReturn['outside'];
  /** Months from `now` to the target date (>= 0), null if no date. */
  monthsToDeadline: number | null;
  /** Monthly contribution needed to hit the target by its date, null if not computable. */
  requiredMonthlyContribution: number | null;
  /** The contribution currently planned for this goal (0 if unset). */
  currentMonthlyContribution: number;
  /** Projected completion date at the current pace, null if never reached (or no target). */
  projectedDate: Date | null;
  /** Months to reach the target at the current pace, null if never / not applicable. */
  monthsToTarget: number | null;
  /** Projected value at the deadline at the current pace (only for dated goals). */
  projectedValueAtDeadline: number | null;
}

export interface GoalTrajectoryInput {
  currentValue: number;
  targetAmount?: number;
  targetDate?: string; // ISO
  monthlyContribution?: number;
  /** Override the derived return (mainly for tests). */
  annualReturn?: number;
  recommendedAllocation?: Partial<Record<AssetClass, number>>;
  /** The page's common hypotheses (`resolveFireAssumptions`): the return is derived from them. */
  assumptions: GoalAssumptions;
  now?: Date;
}

/** The `AssetClass` values the Monte Carlo classes are made of (gold is a commodity sub-category, a goal's allocation has no such level). */
const GOAL_SIMULATED_CLASSES: readonly AssetClass[] = ['equity', 'bonds', 'cash', 'commodity', 'trendFollowing', 'carry'];
const GOAL_OUTSIDE_CLASSES = ['crypto', 'realestate'] as const;

export interface GoalReturn {
  /** Nominal compound annual return, percent. */
  rate: number;
  /** `allocation`: the goal's own recommended allocation; `portfolio`: the target portfolio's Base scenario. */
  origin: 'allocation' | 'portfolio';
  /** Classes of the allocation the hypotheses do not simulate (crypto, real estate): taken out, the rest rescaled to 100. */
  outside: (typeof GOAL_OUTSIDE_CLASSES)[number][];
}

/**
 * D8: the return of a goal is RP1 on the Base scenario of Impostazioni › Simulazioni. With a
 * recommended allocation, that allocation (crypto and real estate out, the rest rescaled to 100);
 * without a usable one, the target portfolio's own Base return — the figure every other FIRE tab uses.
 * Both are net of the recurring costs (TER, stamp duty) when `assumptions.costs` is there (RC5).
 */
export function goalAnnualReturn(
  allocation: Partial<Record<AssetClass, number>> | undefined,
  assumptions: GoalAssumptions
): GoalReturn {
  const portfolio: GoalReturn = { rate: assumptions.scenarios.base.growthRate, origin: 'portfolio', outside: [] };
  const own = goalAllocationWeights(allocation);
  if (!own) return portfolio;
  const { market } = assumptions;
  // RC5: the costs of the goal's own weights, on the same per-class costs as the page; none = gross.
  const { cagr } = portfolioCompoundReturn(own.weights, market.scenarios.base, market.correlations, market.leverageSpread, portfolioCost(own.weights, assumptions.costs).total);
  return { rate: cagr, origin: 'allocation', outside: own.outside };
}

/** A goal's recommended allocation as Monte Carlo weights (crypto and real estate out, the rest rescaled to 100); null without a usable one. */
function goalAllocationWeights(allocation: Partial<Record<AssetClass, number>> | undefined): { weights: Record<MonteCarloClass, number>; outside: GoalReturn['outside'] } | null {
  if (!allocation) return null;
  const weights = monteCarloClassRecord<number>(() => 0);
  let total = 0;
  for (const cls of GOAL_SIMULATED_CLASSES) {
    const pct = Math.max(0, allocation[cls] || 0);
    weights[cls as MonteCarloClass] = pct;
    total += pct;
  }
  if (total <= 0) return null;
  for (const cls of GOAL_SIMULATED_CLASSES) weights[cls as MonteCarloClass] = (weights[cls as MonteCarloClass] * 100) / total;
  return { weights, outside: GOAL_OUTSIDE_CLASSES.filter((cls) => (allocation[cls] || 0) > 0) };
}

/**
 * RO4: the Base-scenario moments of the portfolio a goal invests in — the goal's own weights (D8), else
 * the target portfolio's — net of the recurring costs like `goalAnnualReturn`. Null when the page holds no weights.
 */
export function goalPortfolioMoments(
  allocation: Partial<Record<AssetClass, number>> | undefined,
  assumptions: GoalAssumptions
): PortfolioReturn | null {
  const own = goalAllocationWeights(allocation);
  const weights = own?.weights ?? assumptions.weights;
  if (!weights) return null;
  const { market } = assumptions;
  return portfolioCompoundReturn(weights, market.scenarios.base, market.correlations, market.leverageSpread, portfolioCost(weights, assumptions.costs).total);
}

/** The date a number of months from `now`, on the same 30,44-day month the projected dates use. */
export function addGoalMonths(now: Date, months: number): Date {
  return new Date(now.getTime() + months * MS_PER_MONTH);
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / MS_PER_MONTH));
}

/**
 * RO3 (D-G6): the monthly rate that compounds to the declared annual return over twelve months
 * (6% → 0,4868%/month, so a year earns exactly 6%, not the 6,17% of R/12). `annualReturn` in percent.
 */
export function monthlyRate(annualReturn: number): number {
  return Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
}

/**
 * Future value of a starting balance plus a fixed monthly contribution,
 * compounded monthly at the equivalent monthly rate. Handles the zero-rate case.
 */
export function futureValue(
  presentValue: number,
  monthlyContribution: number,
  annualReturn: number,
  months: number
): number {
  if (months <= 0) return presentValue;
  const r = monthlyRate(annualReturn);
  if (r === 0) return presentValue + monthlyContribution * months;
  const growth = Math.pow(1 + r, months);
  return presentValue * growth + monthlyContribution * ((growth - 1) / r);
}

/**
 * Monthly contribution required to reach `target` in `months`, starting from
 * `presentValue` and compounding at `annualReturn`. Returns 0 when growth alone
 * already gets there. `months` is clamped to >= 1.
 */
export function requiredMonthlyContribution(
  presentValue: number,
  target: number,
  annualReturn: number,
  months: number
): number {
  const n = Math.max(1, months);
  const r = monthlyRate(annualReturn);
  if (r === 0) {
    return Math.max(0, (target - presentValue) / n);
  }
  const growth = Math.pow(1 + r, n);
  const grownPv = presentValue * growth;
  if (grownPv >= target) return 0;
  return (target - grownPv) / ((growth - 1) / r);
}

/**
 * Months needed to reach `target` from `presentValue` at the given monthly
 * contribution and return. Returns null when the target is never reached.
 */
export function monthsToReach(
  presentValue: number,
  target: number,
  monthlyContribution: number,
  annualReturn: number
): number | null {
  if (presentValue >= target) return 0;
  const r = monthlyRate(annualReturn);
  if (r === 0) {
    if (monthlyContribution <= 0) return null;
    return Math.ceil((target - presentValue) / monthlyContribution);
  }
  // x = (1+r)^n ; PV*x + (c/r)(x-1) = T  →  x = (T + c/r) / (PV + c/r)
  const base = presentValue + monthlyContribution / r;
  if (base <= 0) return null;
  const x = (target + monthlyContribution / r) / base;
  if (x <= 1) return 0;
  const n = Math.log(x) / Math.log(1 + r);
  if (!isFinite(n) || n <= 0) return null;
  return Math.ceil(n);
}

export function computeGoalTrajectory(input: GoalTrajectoryInput): GoalTrajectory {
  const now = input.now ?? new Date();
  const derived = goalAnnualReturn(input.recommendedAllocation, input.assumptions);
  const annualReturn = input.annualReturn ?? derived.rate;
  const currentMonthlyContribution = Math.max(0, input.monthlyContribution ?? 0);
  const currentValue = Math.max(0, input.currentValue);
  const hasTarget = input.targetAmount != null && input.targetAmount > 0;
  const target = input.targetAmount ?? 0;

  const monthsToDeadline = input.targetDate
    ? monthsBetween(now, new Date(input.targetDate))
    : null;

  // Months / projected date at the current pace.
  const monthsToTarget = hasTarget
    ? monthsToReach(currentValue, target, currentMonthlyContribution, annualReturn)
    : null;
  const projectedDate =
    monthsToTarget != null
      ? new Date(now.getTime() + monthsToTarget * MS_PER_MONTH)
      : null;

  // Required contribution + value-at-deadline only make sense for dated goals.
  let required: number | null = null;
  let projectedValueAtDeadline: number | null = null;
  if (hasTarget && monthsToDeadline != null) {
    required = requiredMonthlyContribution(currentValue, target, annualReturn, monthsToDeadline);
    projectedValueAtDeadline = futureValue(
      currentValue,
      currentMonthlyContribution,
      annualReturn,
      monthsToDeadline
    );
  }

  // Verdict.
  let verdict: GoalVerdict;
  if (!hasTarget) {
    verdict = 'noTarget';
  } else if (currentValue >= target) {
    verdict = 'reached';
  } else if (monthsToDeadline == null) {
    verdict = 'noDeadline';
  } else {
    // On track if the projected value at the deadline covers the target
    // (1% tolerance to avoid flapping on rounding).
    const onTrack =
      projectedValueAtDeadline != null && projectedValueAtDeadline >= target * 0.999;
    verdict = onTrack ? 'onTrack' : 'offTrack';
  }

  return {
    verdict,
    annualReturn,
    returnOrigin: derived.origin,
    returnOutside: derived.outside,
    monthsToDeadline,
    requiredMonthlyContribution: required,
    currentMonthlyContribution,
    projectedDate,
    monthsToTarget,
    projectedValueAtDeadline,
  };
}

/**
 * Glide-path points for the per-goal projection chart (B2). Produces at most
 * ~`maxPoints` samples from now to the horizon (the deadline if dated, otherwise
 * the projected completion, capped at 50 years). Each point carries the projected
 * value and the flat target line.
 */
export interface GoalProjectionPoint {
  monthIndex: number;
  /** Epoch ms — the component formats the label. */
  timestamp: number;
  value: number;
  target: number;
  /** RO5: the simulated 10th, 50th and 90th percentile at this month, set by the Traiettoria once the simulation ran. */
  p10?: number;
  p50?: number;
  p90?: number;
  /** `[p10, p90]`: what the chart fills as the band. */
  band?: [number, number];
}

export function buildGoalProjectionSeries(
  input: Omit<GoalTrajectoryInput, 'assumptions' | 'recommendedAllocation' | 'annualReturn'> & { targetAmount: number; annualReturn: number },
  maxPoints = 48
): GoalProjectionPoint[] {
  const now = input.now ?? new Date();
  const annualReturn = input.annualReturn;
  const contribution = Math.max(0, input.monthlyContribution ?? 0);
  const currentValue = Math.max(0, input.currentValue);
  const target = input.targetAmount;

  const deadlineMonths = input.targetDate
    ? monthsBetween(now, new Date(input.targetDate))
    : null;
  const reachMonths = monthsToReach(currentValue, target, contribution, annualReturn);

  // Horizon: prefer the deadline; otherwise the projected reach; cap at 600 months.
  let horizon = deadlineMonths ?? reachMonths ?? 0;
  if (horizon <= 0) horizon = Math.max(reachMonths ?? 12, 12);
  horizon = Math.min(Math.max(horizon, 1), 600);

  const step = Math.max(1, Math.ceil(horizon / maxPoints));
  const points: GoalProjectionPoint[] = [];
  for (let m = 0; m <= horizon; m += step) {
    points.push({
      monthIndex: m,
      timestamp: now.getTime() + m * MS_PER_MONTH,
      value: Math.round(futureValue(currentValue, contribution, annualReturn, m)),
      target,
    });
  }
  // Ensure the final horizon point is included.
  if (points[points.length - 1]?.monthIndex !== horizon) {
    points.push({
      monthIndex: horizon,
      timestamp: now.getTime() + horizon * MS_PER_MONTH,
      value: Math.round(futureValue(currentValue, contribution, annualReturn, horizon)),
      target,
    });
  }
  return points;
}

/**
 * Split a new contribution across goals (B3), weighted by remaining gap × priority.
 * Mirrors deriveTargetAllocationFromGoals' weighting. Only goals with an unfilled
 * money gap participate; fully-funded and open-ended goals are skipped.
 */
export interface GoalContributionSlice {
  goalId: string;
  goalName: string;
  color: string;
  add: number;
  gap: number;
  priority: GoalPriority;
}

export function allocateContributionAcrossGoals(
  goals: InvestmentGoal[],
  progressList: GoalProgress[],
  amount: number
): GoalContributionSlice[] {
  if (amount <= 0) return [];
  const progressById = new Map(progressList.map((p) => [p.goalId, p]));

  const weighted = goals
    .map((goal) => {
      const progress = progressById.get(goal.id);
      if (!progress || goal.targetAmount == null || goal.targetAmount <= 0) return null;
      const gap = Math.max(0, goal.targetAmount - progress.currentValue);
      if (gap <= 0) return null;
      const weight = gap * (GOAL_PRIORITY_WEIGHTS[goal.priority] ?? 1);
      return { goal, gap, weight };
    })
    .filter((e): e is { goal: InvestmentGoal; gap: number; weight: number } => e != null);

  const totalWeight = weighted.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) return [];

  return weighted
    .map(({ goal, gap, weight }) => ({
      goalId: goal.id,
      goalName: goal.name,
      color: goal.color,
      // Never propose adding more than the remaining gap.
      add: Math.min(gap, (amount * weight) / totalWeight),
      gap,
      priority: goal.priority,
    }))
    .sort((a, b) => b.add - a.add);
}

// ==================== List ordering ====================

export interface GoalRow {
  goal: InvestmentGoal;
  progress: GoalProgress;
  trajectory: GoalTrajectory;
}

// Lower rank = higher in the list. Off-track first (most urgent), reached last.
const VERDICT_RANK: Record<GoalVerdict, number> = {
  offTrack: 0,
  onTrack: 1,
  noDeadline: 2,
  noTarget: 3,
  reached: 4,
};

export function sortGoalRowsByUrgency(rows: GoalRow[]): GoalRow[] {
  return [...rows].sort((a, b) => {
    const rankDiff = VERDICT_RANK[a.trajectory.verdict] - VERDICT_RANK[b.trajectory.verdict];
    if (rankDiff !== 0) return rankDiff;
    // Within the same verdict, the nearest deadline first; undated sink below dated.
    const am = a.trajectory.monthsToDeadline;
    const bm = b.trajectory.monthsToDeadline;
    if (am != null && bm != null) return am - bm;
    if (am != null) return -1;
    if (bm != null) return 1;
    return 0;
  });
}
