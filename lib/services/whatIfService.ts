/**
 * What If Analysis service.
 *
 * Pure functions that translate a life-event scenario into adjusted FIRE inputs and then
 * compute the before/after impact on both the traditional FIRE plan and the Coast FIRE
 * plan. All heavy lifting is delegated to the existing deterministic functions in
 * fireService — this module only perturbs the baseline and diffs the results, so it stays
 * trivially testable and adds no new projection math.
 *
 * The pension bridge (the Calcolatore's model) rides along on the baseline: when the FIRE
 * lock-in toggle is on, the locked fund is a compartment that re-enters the walk at its unlock
 * year and the FIRE number is the bridge number — the same functions the Calcolatore calls, so
 * the «prima» side of this tab agrees with that tab's year. Without a bridge the walk and the
 * metrics are byte-identical to the plain model.
 *
 * «Quando» (doc/fire-ipotesi/README.md § 12, RF11): an event of year 0 perturbs the baseline as always; an event of
 * a later year leaves the baseline untouched and becomes dated flows (`buildEventFlows`) laid over the saved ones
 * on the «dopo» side, read by the same walk, requirement and Coast functions that read the saved flows.
 *
 * See `types/whatIf.ts` for the modelling rationale.
 */

import {
  calculateFIREMetrics,
  calculateFIREProjection,
  calculateCoastFIREMetrics,
  resolveFireRequirement,
  type FIREMetrics,
  type FireHonestInputs,
} from './fireService';
import { resolveGainShare } from '@/lib/utils/withdrawalTax';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { buildFlowSchedule, type DatedFlowsInput, type ResolvedFlow } from '@/lib/utils/datedFlows';
import type { FIREProjectionResult } from '@/types/assets';
import type {
  WhatIfAdjustedInputs,
  WhatIfBaseline,
  WhatIfCoastImpact,
  WhatIfFireImpact,
  WhatIfImpact,
  WhatIfMetricImpact,
  WhatIfScenario,
} from '@/types/whatIf';

/** The deterministic walk's horizon — the Calcolatore's, so the two tabs agree on «oltre N anni». */
export const WHAT_IF_HORIZON_YEARS = 50;

/** How far ahead the event can be placed: the walk's horizon (an event beyond it could never matter). */
export function maxEventYear(currentYear: number): number {
  return currentYear + WHAT_IF_HORIZON_YEARS;
}

/**
 * The «Quando» input read as a calendar year: a whole year from the running one to the horizon, else null (= today).
 * Blank, a past year or text mean today (the default); a year past the horizon is held at it.
 */
export function parseWhenYear(value: string, currentYear: number): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= currentYear) return null;
  return Math.min(parsed, maxEventYear(currentYear));
}

/** Years from today the scenario's event lands in: 0 = today (the year-0 perturbation), else ≥ 1. */
export function resolveEventYearsAhead(scenario: WhatIfScenario, currentYear: number): number {
  const year = scenario.whenYear;
  if (year === undefined || !Number.isFinite(year)) return 0;
  return Math.min(Math.max(0, Math.round(year) - currentYear), WHAT_IF_HORIZON_YEARS);
}

/** Money and counts can never go below zero after a perturbation. */
function clampNonNegative(value: number): number {
  return value > 0 ? value : 0;
}

function buildMetricImpact(before: number | null, after: number | null): WhatIfMetricImpact {
  const delta = before !== null && after !== null ? after - before : null;
  return { before, after, delta };
}

/**
 * Apply a What If scenario to the baseline, producing the adjusted inputs.
 *
 * Modelling (all immediate / year 0; with a later `whenYear` the inputs are returned as they are, RF11):
 * - jobLoss: net worth drops by the lost income over the window, (lostAnnualIncome × months/12).
 *   This is exact even when only part of the household income stops: the retained income still
 *   covers part of the expenses, so the gap versus the baseline trajectory is exactly the lost
 *   income. When no specific sources are selected, the whole income (expenses + savings) is lost,
 *   which reproduces the original "all income stops" behaviour.
 * - majorPurchase / windfall: a one-off cash movement out of / into net worth.
 * - cashflowChange: ongoing changes to annual savings and expenses from now onward; the
 *   expense delta also flows into Coast retirement expenses.
 */
export function applyScenarioToBaseline(
  baseline: WhatIfBaseline,
  scenario: WhatIfScenario
): WhatIfAdjustedInputs {
  let netWorthDelta = 0;
  let savingsDelta = 0;
  let expensesDelta = 0;

  // RF11: an event of a later year does not perturb today's inputs — it is laid over the flows instead.
  const later = resolveEventYearsAhead(scenario, baseline.currentYear ?? getItalyYear()) >= 1;

  switch (later ? null : scenario.eventType) {
    case 'jobLoss': {
      const months = clampNonNegative(scenario.monthsWithoutIncome ?? 0);
      // Default to the whole household income when no specific sources are selected.
      const lostAnnualIncome = clampNonNegative(
        scenario.lostAnnualIncome ?? baseline.annualIncome ?? baseline.annualExpenses + baseline.annualSavings
      );
      netWorthDelta = -(lostAnnualIncome * months) / 12;
      break;
    }
    case 'majorPurchase': {
      netWorthDelta = -clampNonNegative(scenario.lumpSumAmount ?? 0);
      break;
    }
    case 'windfall': {
      netWorthDelta = clampNonNegative(scenario.lumpSumAmount ?? 0);
      break;
    }
    case 'cashflowChange': {
      savingsDelta = scenario.annualSavingsDelta ?? 0;
      expensesDelta = scenario.annualExpensesDelta ?? 0;
      break;
    }
  }

  const coastBaselineExpenses = baseline.coast?.annualExpenses ?? baseline.annualExpenses;

  return {
    netWorth: clampNonNegative(baseline.netWorth + netWorthDelta),
    annualSavings: clampNonNegative(baseline.annualSavings + savingsDelta),
    annualExpenses: clampNonNegative(baseline.annualExpenses + expensesDelta),
    coastAnnualExpenses: clampNonNegative(coastBaselineExpenses + expensesDelta),
  };
}

/**
 * RF11: the event of year `yearsAhead ≥ 1` as dated flows, to lay over the saved ones. All amounts are today's euro,
 * indexed with the scenario's inflation — the way the year-0 event is an amount of today.
 * - jobLoss: a lump out of `lost income × months / 12` (the same figure the year-0 hit is);
 * - majorPurchase / windfall: a lump out / in;
 * - cashflowChange: a yearly saving delta from that year on (RF3, `scope: 'saving'`) and a yearly expense delta from
 *   that year on, forever, in the need (RF4, `scope: 'need'`) — two flows, so neither touches the other figure twice.
 */
export function buildEventFlows(baseline: WhatIfBaseline, scenario: WhatIfScenario, yearsAhead: number): ResolvedFlow[] {
  if (yearsAhead < 1) return [];
  const flow = (id: string, label: string, parts: Partial<ResolvedFlow> & Pick<ResolvedFlow, 'kind' | 'amount'>): ResolvedFlow => ({
    id,
    label,
    sigma: 0,
    indexed: true,
    anchor: 'fixed',
    start: yearsAhead,
    durationYears: null,
    inCashflowToday: false,
    ...parts,
  });
  switch (scenario.eventType) {
    case 'jobLoss': {
      const months = clampNonNegative(scenario.monthsWithoutIncome ?? 0);
      const lost = clampNonNegative(scenario.lostAnnualIncome ?? baseline.annualIncome ?? baseline.annualExpenses + baseline.annualSavings);
      const hit = (lost * months) / 12;
      return hit > 0 ? [flow('whatif-job-loss', 'Perdita di lavoro', { kind: 'lumpOut', amount: hit })] : [];
    }
    case 'majorPurchase': {
      const amount = clampNonNegative(scenario.lumpSumAmount ?? 0);
      return amount > 0 ? [flow('whatif-purchase', 'Acquisto importante', { kind: 'lumpOut', amount })] : [];
    }
    case 'windfall': {
      const amount = clampNonNegative(scenario.lumpSumAmount ?? 0);
      return amount > 0 ? [flow('whatif-windfall', 'Entrata straordinaria', { kind: 'lumpIn', amount })] : [];
    }
    case 'cashflowChange': {
      const out: ResolvedFlow[] = [];
      const savings = scenario.annualSavingsDelta ?? 0;
      const expenses = scenario.annualExpensesDelta ?? 0;
      if (savings !== 0) out.push(flow('whatif-savings', 'Variazione del risparmio', { kind: 'income', sigma: -1, amount: savings, scope: 'saving' }));
      if (expenses !== 0) out.push(flow('whatif-expenses', 'Variazione delle spese', { kind: 'expense', sigma: 1, amount: expenses, scope: 'need' }));
      return out;
    }
  }
}

/** The saved flows with the event's laid over them; the saved ones alone (the same object) when the event adds none. */
function flowsWithEvent(saved: DatedFlowsInput | undefined, eventFlows: ResolvedFlow[]): DatedFlowsInput | undefined {
  if (eventFlows.length === 0) return saved;
  return { resolved: [...(saved?.resolved ?? []), ...eventFlows], planExpensesFromCashflow: saved?.planExpensesFromCashflow ?? true };
}

/** The bridge as the walk accepts it: undefined unless something is locked for some years. */
function resolveBridge(baseline: WhatIfBaseline) {
  const bridge = baseline.pensionBridge;
  if (!bridge || bridge.valueToday <= 0 || bridge.yearsToUnlock <= 0) return undefined;
  return bridge;
}

/**
 * The honest inputs for a perturbed net worth: money that ARRIVES (a windfall) is basis, money
 * that LEAVES (a purchase, the months without income) is sold at the portfolio's own gain
 * share, so the basis shrinks in proportion — the What If perturbs free capital, and the tax
 * must read the capital it perturbed. Without a tax profile the inputs pass through untouched.
 */
function honestFor(baseline: WhatIfBaseline, netWorth: number): FireHonestInputs | undefined {
  const honest = baseline.honest ?? undefined;
  if (!honest?.withdrawalTax) return honest;
  const delta = netWorth - baseline.netWorth;
  const basisToday =
    delta >= 0
      ? honest.withdrawalTax.basisToday + delta
      : baseline.netWorth > 0
        ? honest.withdrawalTax.basisToday * (netWorth / baseline.netWorth)
        : honest.withdrawalTax.basisToday;
  return { ...honest, withdrawalTax: { ...honest.withdrawalTax, basisToday } };
}

/**
 * The FIRE metrics for one input set — with the requirement of today when the baseline carries
 * a locked fund, the state pensions or the withdrawal tax (`resolveFireRequirement`, the
 * Calcolatore's `displayedFireMetrics`: same function, same figure) — and with the dated flows (RF5) when there are any.
 */
function resolveFireMetrics(baseline: WhatIfBaseline, netWorth: number, annualExpenses: number, flows: DatedFlowsInput | undefined): FIREMetrics {
  const metrics = calculateFIREMetrics(netWorth, annualExpenses, baseline.withdrawalRate);
  const bridge = resolveBridge(baseline);
  const honest = honestFor(baseline, netWorth);
  const schedule = flows && flows.resolved.length > 0
    ? buildFlowSchedule(flows.resolved, { inflationRate: baseline.scenarios.base.inflationRate, planExpensesFromCashflow: flows.planExpensesFromCashflow })
    : undefined;
  if ((!bridge && !honest && !schedule) || annualExpenses <= 0) return metrics;

  const { requirement } = resolveFireRequirement({
    annualExpenses,
    withdrawalRate: baseline.withdrawalRate,
    scenario: baseline.scenarios.base,
    yearsElapsed: 0,
    honest,
    bridge: bridge ? { compartmentValue: bridge.valueToday, yearsToUnlock: bridge.yearsToUnlock } : undefined,
    gainShare: honest?.withdrawalTax ? resolveGainShare(netWorth, honest.withdrawalTax.basisToday) : 0,
    flows: schedule,
  });
  return {
    ...metrics,
    fireNumber: requirement,
    progressToFI: requirement > 0 ? (netWorth / requirement) * 100 : 0,
  };
}

/**
 * The base-scenario walk for one input set, or null when it cannot run (no expenses, no
 * withdrawal rate). A net worth of zero still walks: the savings alone may reach the target.
 */
function runBaseProjection(
  baseline: WhatIfBaseline,
  netWorth: number,
  annualExpenses: number,
  annualSavings: number,
  flows: DatedFlowsInput | undefined
): FIREProjectionResult | null {
  if (netWorth < 0 || annualExpenses <= 0 || baseline.withdrawalRate <= 0) return null;
  return calculateFIREProjection(
    netWorth,
    annualExpenses,
    annualSavings,
    baseline.withdrawalRate,
    baseline.scenarios,
    WHAT_IF_HORIZON_YEARS,
    resolveBridge(baseline),
    honestFor(baseline, netWorth),
    baseline.indexSavings ?? false,
    flows
  );
}

/**
 * Years until FIRE in the base scenario: 0 when already financially independent today (on the
 * bridge number when the bridge is on), null when the walk cannot run or never gets there.
 */
function resolveYearsToFIRE(metrics: FIREMetrics, projection: FIREProjectionResult | null, hasFlows: boolean): number | null {
  if (!projection) return null;
  // With flows the walk's own year-0 test decides: it starts from the capital plus the lumps of the running year (RF6).
  if (!hasFlows && metrics.fireNumber > 0 && metrics.currentNetWorth >= metrics.fireNumber) return 0;
  return projection.baseYearsToFIRE;
}

/**
 * The Base FIRE year (years from today) of the baseline's plan run on `flows` instead of its own: the walk and the
 * requirement are the very ones `calculateWhatIfImpact` reads, so the figure agrees with the What If's «prima». 0 = already
 * independent, null = never within the horizon or the plan cannot run. The Obiettivi's «Effetto sul FIRE» (RO2) calls it twice.
 */
export function baseYearsToFIREWithFlows(baseline: WhatIfBaseline, flows: DatedFlowsInput | undefined): number | null {
  const used = flows && flows.resolved.length > 0 ? flows : undefined;
  const metrics = resolveFireMetrics(baseline, baseline.netWorth, baseline.annualExpenses, used);
  const projection = runBaseProjection(baseline, baseline.netWorth, baseline.annualExpenses, baseline.annualSavings, used);
  return resolveYearsToFIRE(metrics, projection, !!used);
}

/**
 * Compute the before/after impact of a scenario on the traditional FIRE plan and, when
 * Coast FIRE is configured, on the Coast FIRE plan. The two walks it runs are returned as
 * `projections`, so the chart draws the same series the years were read from.
 */
export function calculateWhatIfImpact(
  baseline: WhatIfBaseline,
  scenario: WhatIfScenario
): WhatIfImpact {
  const adjusted = applyScenarioToBaseline(baseline, scenario);
  // RF11: «prima» is the plan with the saved flows; «dopo» adds the event's own when it lands in a later year.
  const yearsAhead = resolveEventYearsAhead(scenario, baseline.currentYear ?? getItalyYear());
  const flowsBefore = baseline.flows && baseline.flows.resolved.length > 0 ? baseline.flows : undefined;
  const flowsAfter = flowsWithEvent(flowsBefore, buildEventFlows(baseline, scenario, yearsAhead));

  // --- Traditional FIRE ---
  const fireBefore = resolveFireMetrics(baseline, baseline.netWorth, baseline.annualExpenses, flowsBefore);
  const fireAfter = resolveFireMetrics(baseline, adjusted.netWorth, adjusted.annualExpenses, flowsAfter);

  const projectionBefore = runBaseProjection(baseline, baseline.netWorth, baseline.annualExpenses, baseline.annualSavings, flowsBefore);
  const projectionAfter = runBaseProjection(baseline, adjusted.netWorth, adjusted.annualExpenses, adjusted.annualSavings, flowsAfter);

  const fire: WhatIfFireImpact = {
    fireNumber: buildMetricImpact(fireBefore.fireNumber, fireAfter.fireNumber),
    progressToFI: buildMetricImpact(fireBefore.progressToFI, fireAfter.progressToFI),
    yearsToFIRE: buildMetricImpact(resolveYearsToFIRE(fireBefore, projectionBefore, !!flowsBefore), resolveYearsToFIRE(fireAfter, projectionAfter, !!flowsAfter)),
    annualAllowance: buildMetricImpact(fireBefore.annualAllowance, fireAfter.annualAllowance),
  };

  // --- Coast FIRE (only when configured) ---
  let coast: WhatIfCoastImpact | null = null;
  if (baseline.coast) {
    const c = baseline.coast;
    // `undefined` currentDate keeps the function's own default; the inflows ride along
    // unchanged on both sides — a life event perturbs free capital, not the locked fund.
    const coastBefore = calculateCoastFIREMetrics(
      baseline.netWorth,
      c.annualExpenses,
      baseline.withdrawalRate,
      c.currentAge,
      c.retirementAge,
      c.realReturnRate,
      c.inflationRate,
      c.pensions,
      c.taxBrackets,
      undefined,
      c.capitalInflowsToday,
      // The tax on withdrawals, as the Coast tab passes it (fireService.ts, the three scenarios): without it the
      // «Numero Coast oggi» here read lower than the Coast tab's own (collaudo 2026-10-05).
      honestFor(baseline, baseline.netWorth)?.withdrawalTax,
      flowsBefore
    );
    const coastAfter = calculateCoastFIREMetrics(
      adjusted.netWorth,
      adjusted.coastAnnualExpenses,
      baseline.withdrawalRate,
      c.currentAge,
      c.retirementAge,
      c.realReturnRate,
      c.inflationRate,
      c.pensions,
      c.taxBrackets,
      undefined,
      c.capitalInflowsToday,
      honestFor(baseline, adjusted.netWorth)?.withdrawalTax,
      flowsAfter
    );

    coast = {
      coastFireNumberToday: buildMetricImpact(
        coastBefore.coastFireNumberToday,
        coastAfter.coastFireNumberToday
      ),
      progressToCoastFI: buildMetricImpact(
        coastBefore.progressToCoastFI,
        coastAfter.progressToCoastFI
      ),
      gapToCoastFI: buildMetricImpact(coastBefore.gapToCoastFI, coastAfter.gapToCoastFI),
      isCoastReachedBefore: coastBefore.isCoastReached,
      isCoastReachedAfter: coastAfter.isCoastReached,
    };
  }

  return { yearsAhead, adjusted, fire, coast, projections: { before: projectionBefore, after: projectionAfter } };
}
