/**
 * «Età obiettivo» (E1, dossier `doc/fire-ipotesi/README.md` § 10.5, RS6–RS9): what it takes to
 * stop at a chosen age, read on the Calcolatore's own deterministic walk.
 *
 * Pure: the caller hands over `walk(savings, expenses)`, a closure over `calculateFIREProjection`
 * with the Calcolatore's own arguments (capital, SWR, scenarios, bridge, pensions, tax), returning
 * the Base scenario's years to FIRE (null = not within the horizon). Only the saving (RS7) or the
 * plan's expenses (RS9) change from one call to the next, so the figures sit on the same number
 * the verdict names. The third figure (RS8, the saving that lets 9 paths in 10 arrive) is the
 * Ventaglio's `solveSavingsForTail`, called with the target in years; this module only reads it.
 */

import type { TailLever } from '@/lib/utils/fireDistribution';

/** RS7/RS9 round to this many euros a year. */
const STEP = 100;
/** RS7's ceiling: twenty times the plan's expenses. */
const SAVINGS_CAP_MULTIPLE = 20;
const MAX_DOUBLINGS = 40;

/** The deterministic Base walk: years to FIRE for a yearly saving and plan expenses (euros of today). */
export type FireWalk = (annualSavings: number, annualExpenses: number) => number | null;

// ─── RS6 — years to the target age ────────────────────────────────────────────

export type TargetAgeYears =
  | { kind: 'no-age' }
  | { kind: 'passed'; targetAge: number }
  | { kind: 'years'; targetAge: number; years: number };

/** RS6: whole years from today's age to the target age; none without the age, none when it is not ahead. */
export function yearsToTargetAge(targetAge: number, userAge: number | undefined): TargetAgeYears {
  if (userAge === undefined || !Number.isFinite(userAge)) return { kind: 'no-age' };
  const years = Math.round(targetAge) - Math.round(userAge);
  if (years <= 0) return { kind: 'passed', targetAge };
  return { kind: 'years', targetAge, years };
}

// ─── RS7 — the saving the Base needs ──────────────────────────────────────────

const meetsTarget = (years: number | null, targetYears: number): boolean => years !== null && years <= targetYears;

export interface RequiredSavings {
  /** The smallest multiple of 100 € a year with the Base FIRE within the target; 0 = today's capital is enough; null = not even `cap`. */
  amount: number | null;
  /** The ceiling tried, for «più di X € l'anno». */
  cap: number;
}

/**
 * RS7: bisection over the multiples of 100 € on `[0, cap]`, rounded UP and verified. More saving never
 * delays the Base (the same returns on a larger portfolio), so «within the target» is monotone.
 */
export function solveSavingsForTargetYear(walk: FireWalk, annualExpenses: number, targetYears: number, cap = SAVINGS_CAP_MULTIPLE * annualExpenses): RequiredSavings {
  const meets = (savings: number) => meetsTarget(walk(savings, annualExpenses), targetYears);
  if (meets(0)) return { amount: 0, cap };
  let high = Math.ceil(cap / STEP);
  if (!meets(high * STEP)) return { amount: null, cap: high * STEP };
  let low = 0; // does not meet; `high` does
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (meets(middle * STEP)) high = middle;
    else low = middle;
  }
  return { amount: high * STEP, cap: Math.ceil(cap / STEP) * STEP };
}

// ─── RS9 — the plan's expenses the target age allows ──────────────────────────

/**
 * RS9: the largest multiple of 100 € a year of plan expenses with the Base FIRE within the target, at
 * today's saving. Less expense never delays the walk (a lower requirement), so «within the target» is
 * monotone in the expenses. null = even the highest bracket tried is reached (nothing binds), or the
 * lowest is not.
 */
export function solveMaxPlanExpenses(walk: FireWalk, annualSavings: number, planExpenses: number, targetYears: number): number | null {
  const meets = (expenses: number) => meetsTarget(walk(annualSavings, expenses), targetYears);
  let high = Math.max(1, Math.ceil(planExpenses / STEP));
  let doublings = 0;
  while (meets(high * STEP)) {
    high *= 2;
    if (++doublings > MAX_DOUBLINGS) return null;
  }
  let low = 0; // treated as reachable
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (meets(middle * STEP)) low = middle;
    else high = middle;
  }
  while (low > 0 && !meets(low * STEP)) low--;
  return low * STEP;
}

// ─── The tile's summary ───────────────────────────────────────────────────────

export interface TargetAgeInput {
  /** The page's age (Coast › Ipotesi), undefined when never written. */
  userAge: number | undefined;
  targetAge: number;
  currentYear: number;
  /** Today's yearly saving from the Cashflow. */
  annualSavings: number;
  /** The plan's expenses, euros of today. */
  planExpenses: number;
  /** The Base walk's years to FIRE at today's saving (the verdict's own number). */
  baseYearsToFire: number | null;
  walk: FireWalk;
  /**
   * RS8: the Ventaglio's lever run on the target in years; null when the Ventaglio cannot run (no
   * assets, or the target lies beyond its horizon).
   */
  tail: TailLever | null;
}

export type TargetAgeSummary =
  | { kind: 'no-age' }
  | { kind: 'passed'; targetAge: number }
  | { kind: 'already-fire' }
  | {
      kind: 'figures';
      targetAge: number;
      years: number;
      calendarYear: number;
      /** The calendar year the Base reaches FIRE at today's saving; null beyond the walk's horizon. */
      baseCalendarYear: number | null;
      /** True when that year is within the target already. */
      onTrack: boolean;
      annualSavings: number;
      required: RequiredSavings;
      /** RS8 total (today's saving + the lever's extra); `unreachable` = not even with the cap; `unavailable` = no Ventaglio. */
      tail:
        | { kind: 'total'; amount: number; extra: number }
        | { kind: 'unreachable'; cap: number }
        | { kind: 'unavailable' };
      planExpenses: number;
      maxExpenses: number | null;
    };

export function summarizeTargetAge(input: TargetAgeInput): TargetAgeSummary {
  const span = yearsToTargetAge(input.targetAge, input.userAge);
  if (span.kind === 'no-age') return { kind: 'no-age' };
  if (span.kind === 'passed') return { kind: 'passed', targetAge: span.targetAge };
  if (input.baseYearsToFire === 0) return { kind: 'already-fire' };

  const { years } = span;
  const required = solveSavingsForTargetYear(input.walk, input.planExpenses, years);
  const tail: Extract<TargetAgeSummary, { kind: 'figures' }>['tail'] = !input.tail
    ? { kind: 'unavailable' }
    : input.tail.extraAnnualSavings === null
      ? { kind: 'unreachable', cap: input.tail.extraCap }
      : { kind: 'total', amount: input.annualSavings + input.tail.extraAnnualSavings, extra: input.tail.extraAnnualSavings };
  return {
    kind: 'figures',
    targetAge: input.targetAge,
    years,
    calendarYear: input.currentYear + years,
    baseCalendarYear: input.baseYearsToFire === null ? null : input.currentYear + input.baseYearsToFire,
    onTrack: input.baseYearsToFire !== null && input.baseYearsToFire <= years,
    annualSavings: input.annualSavings,
    required,
    tail,
    planExpenses: input.planExpenses,
    maxExpenses: solveMaxPlanExpenses(input.walk, input.annualSavings, input.planExpenses, years),
  };
}
