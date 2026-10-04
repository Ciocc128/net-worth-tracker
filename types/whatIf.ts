import type {
  FIREProjectionScenarios,
  CoastFirePensionInput,
  CoastFireTaxBracket,
} from '@/types/assets';
import type { FIREProjectionResult } from '@/types/assets';
import type { FireHonestInputs, FireProjectionPensionBridge, PensionCapitalInflowToday } from '@/lib/services/fireService';
import type { DatedFlowsInput } from '@/lib/utils/datedFlows';

/**
 * What If Analysis — life-event scenarios applied to the user's FIRE plan.
 *
 * Design: each v1 event is applied "from now" (year 0) and reduces to a perturbation of
 * three baseline inputs — net worth, annual savings, annual expenses. The impact is then
 * computed by re-running the existing deterministic FIRE/Coast functions on the adjusted
 * inputs and diffing against the baseline, so no new projection math is introduced. This
 * is the same pattern the FIRE sensitivity matrix already uses.
 *
 * «Quando» (doc/fire-ipotesi/README.md § 12, RF11): an event can also happen in a future calendar year. With the
 * year of today (the default) nothing changes: it is the year-0 perturbation above. With a later year the event
 * becomes one or two dated flows laid over the saved ones on the «dopo» side only, and the same deterministic
 * functions read them (`flows`), so still no projection math of its own.
 */

export type WhatIfEventType = 'jobLoss' | 'majorPurchase' | 'cashflowChange' | 'windfall';

/**
 * A single What If scenario. Fields are interpreted per `eventType`; fields not relevant to
 * the active event are ignored. Kept as a flat optional shape (rather than a strict
 * discriminated union) so the UI can preserve per-event input state across event switches
 * without remounting.
 */
export interface WhatIfScenario {
  eventType: WhatIfEventType;

  // The calendar year the event happens in; absent (or the running year) = today, year 0.
  whenYear?: number;

  // jobLoss
  monthsWithoutIncome?: number;
  // Annual income (EUR) that disappears during the job-loss window — the sum of the income
  // sources the user selected. When absent, the whole household income is assumed lost
  // (annualExpenses + annualSavings), which preserves the original behaviour.
  lostAnnualIncome?: number;

  // majorPurchase / windfall — positive magnitude of the one-off cash movement
  lumpSumAmount?: number;
  isPrimaryResidence?: boolean; // majorPurchase only; informational in v1

  // cashflowChange — ongoing deltas applied from now onward (negative = reduction)
  annualSavingsDelta?: number;
  annualExpensesDelta?: number;
}

/** Coast-specific baseline; null when the user has not configured Coast FIRE (no age set). */
interface WhatIfCoastBaseline {
  currentAge: number;
  retirementAge: number;
  annualExpenses: number; // Coast retirement expenses (custom override or actual)
  realReturnRate: number; // base scenario, Fisher: (1 + growthRate) / (1 + inflationRate) − 1
  inflationRate: number; // base scenario inflation
  pensions: CoastFirePensionInput[];
  taxBrackets: CoastFireTaxBracket[];
  // Bridge model: locked pension funds (today's value) re-entering the Coast walk at their unlock
  // year, present only when the FIRE lock-in toggle is on (netWorth then excludes them).
  capitalInflowsToday?: PensionCapitalInflowToday[];
}

/** The baseline financial picture that scenarios perturb. Sourced from settings + assets + cashflow. */
export interface WhatIfBaseline {
  netWorth: number; // FIRE net worth (respects includePrimaryResidenceInFIRE)
  liquidNetWorth: number;
  illiquidNetWorth: number;
  annualExpenses: number; // from cashflow (last completed year)
  annualSavings: number;
  // The household income, when it is not `annualExpenses + annualSavings`: the plan's expenses
  // (doc/fire-ipotesi/README.md D5) can differ from the Cashflow's, and the income lost in a job
  // loss is a fact of the Cashflow. Absent → the sum, as before.
  annualIncome?: number;
  // RP7: the savings grow with the scenario's inflation in the walk (the Calcolatore's rule). Absent → constant.
  indexSavings?: boolean;
  withdrawalRate: number;
  scenarios: FIREProjectionScenarios;
  coast: WhatIfCoastBaseline | null;
  // Bridge model (the Calcolatore's): the locked pension fund as a separate compartment that
  // re-enters the FIRE walk at its unlock year, present only when the FIRE lock-in toggle is on
  // (netWorth then excludes it). Absent or null → the plain walk, byte-identical to before.
  pensionBridge?: FireProjectionPensionBridge | null;
  // The honest inputs of the Calcolatore (2026-09-24): the state pensions placed by the age and
  // the tax on withdrawals. Absent or null → the walk and the number of before.
  honest?: FireHonestInputs | null;
  // § 12: the SAVED dated flows (resolved) — the plan both sides run on; the event of a later year is laid over them
  // on the «dopo» side only (RF11). Absent → the plan without flows, byte-identical to before.
  flows?: DatedFlowsInput;
  // The running Italian calendar year, to turn `whenYear` into years ahead; absent → today's.
  currentYear?: number;
}

/** Inputs after applying a scenario. Only the values the impact metrics depend on are tracked. */
export interface WhatIfAdjustedInputs {
  netWorth: number;
  annualSavings: number;
  annualExpenses: number; // drives the FIRE impact
  coastAnnualExpenses: number; // drives the Coast impact
}

/** Before/after pair for a single metric. `delta = after − before` (null when either side is null). */
export interface WhatIfMetricImpact {
  before: number | null;
  after: number | null;
  delta: number | null;
}

export interface WhatIfFireImpact {
  fireNumber: WhatIfMetricImpact;
  progressToFI: WhatIfMetricImpact;
  yearsToFIRE: WhatIfMetricImpact; // base scenario; null = not reached within the projection horizon
  annualAllowance: WhatIfMetricImpact; // sustainable passive income
}

export interface WhatIfCoastImpact {
  coastFireNumberToday: WhatIfMetricImpact;
  progressToCoastFI: WhatIfMetricImpact;
  gapToCoastFI: WhatIfMetricImpact;
  isCoastReachedBefore: boolean;
  isCoastReachedAfter: boolean;
}

/** The two base-scenario walks the impact was read from — the chart draws them overlaid. */
export interface WhatIfProjections {
  before: FIREProjectionResult | null;
  after: FIREProjectionResult | null;
}

export interface WhatIfImpact {
  /** Years from today the event lands in (0 = today, the year-0 perturbation). */
  yearsAhead: number;
  adjusted: WhatIfAdjustedInputs;
  fire: WhatIfFireImpact;
  coast: WhatIfCoastImpact | null; // null when the baseline has no Coast configuration
  projections: WhatIfProjections;
}
