/**
 * What a goal does to the FIRE year (doc/fire-ipotesi/README.md § 13, RO2): the same plan of today — the What If's baseline —
 * run once with the goal's outflow among the dated flows and once without it, on the Base scenario. Pure: the baseline,
 * the goal and its assignments come from the caller; the walk is `baseYearsToFIREWithFlows`.
 */
import type { GoalAssetAssignment, InvestmentGoal } from '@/types/goals';
import type { WhatIfBaseline } from '@/types/whatIf';
import { baseQuotaAtTargetWithFlows, baseYearsToFIREWithFlows, WHAT_IF_HORIZON_YEARS } from '@/lib/services/whatIfService';
import { formatQuota } from '@/lib/utils/fireDepletion';
import { resolveGoalFlows, type DatedFlowsInput, type ResolveGoalFlowsContext } from '@/lib/utils/datedFlows';

export type GoalFireEffect =
  /** The plan with and without the goal's outflow: calendar years, null = beyond the horizon. */
  | {
      kind: 'effect';
      counted: boolean;
      yearWith: number | null;
      yearWithout: number | null;
      horizonYear: number;
      /** § 21 RE10: both years beyond the horizon and the target age known — the Base share of the FIRE number at that age. */
      quotaWith?: number;
      quotaWithout?: number;
      targetCalendarYear?: number;
    }
  /** The goal cannot be placed on the calendar or has nothing inside the capital (RO1's reason). */
  | { kind: 'excluded'; reason: string }
  /** The plan has no capital, expenses or SWR: no figure. */
  | { kind: 'noPlan' };

export interface GoalFireEffectInput {
  goal: InvestmentGoal;
  assignments: readonly GoalAssetAssignment[];
  goalContext: ResolveGoalFlowsContext;
  /** The baseline with the flows the pages read (the saved ones and the goals that count). */
  baseline: WhatIfBaseline;
  hasPlan: boolean;
  /** § 21 RE10: the years to the target age, null without a saved one. */
  targetYears?: number | null;
}

/** RO2; null when there is nothing to say (a goal that does not count and has no amount or no deadline). */
export function goalFireEffect({ goal, assignments, goalContext, baseline, hasPlan, targetYears }: GoalFireEffectInput): GoalFireEffect | null {
  const counted = goal.countsInFire === true;
  const { resolved, excluded } = resolveGoalFlows([{ ...goal, countsInFire: true }], assignments, goalContext);
  const flow = resolved[0];
  if (!flow) {
    const reason = excluded[0]?.reason;
    if (!reason) return null;
    if (!counted && (reason === "manca l'importo" || reason === 'manca la scadenza')) return null;
    return { kind: 'excluded', reason };
  }
  if (!hasPlan) return { kind: 'noPlan' };
  const plan = baseline.flows?.resolved ?? [];
  const isThis = (entry: { source?: { kind: string; goalId?: string } }) => entry.source?.kind === 'goal' && entry.source.goalId === goal.id;
  const planExpensesFromCashflow = baseline.flows?.planExpensesFromCashflow ?? true;
  const input = (list: DatedFlowsInput['resolved']): DatedFlowsInput => ({ resolved: list, planExpensesFromCashflow });
  const withGoal = counted ? plan : [...plan, flow];
  const withoutGoal = counted ? plan.filter((entry) => !isThis(entry)) : plan;
  const currentYear = goalContext.currentYear;
  const toYear = (years: number | null) => (years === null ? null : currentYear + years);
  const yearWith = toYear(baseYearsToFIREWithFlows(baseline, input(withGoal)));
  const yearWithout = toYear(baseYearsToFIREWithFlows(baseline, input(withoutGoal)));
  const quotaWith = yearWith === null && yearWithout === null && targetYears ? baseQuotaAtTargetWithFlows(baseline, input(withGoal), targetYears) : null;
  const quotaWithout = quotaWith === null ? null : baseQuotaAtTargetWithFlows(baseline, input(withoutGoal), targetYears as number);
  return {
    kind: 'effect',
    counted,
    yearWith,
    yearWithout,
    horizonYear: currentYear + WHAT_IF_HORIZON_YEARS,
    ...(quotaWith !== null && quotaWithout !== null ? { quotaWith, quotaWithout, targetCalendarYear: currentYear + (targetYears as number) } : {}),
  };
}

const whenWords = (year: number | null, horizonYear: number): string => (year === null ? `oltre il ${horizonYear}` : `nel ${year}`);

/** § 13.7: the «Effetto sul FIRE» line, generated from the figures (The Narrative Honesty Rule). */
export function goalFireNarrative(effect: GoalFireEffect): string {
  if (effect.kind === 'noPlan') return 'Per l’effetto sul FIRE servono spesa e SWR nel Calcolatore.';
  if (effect.kind === 'excluded') return `Non conta nel FIRE: ${effect.reason}.`;
  const { yearWith, yearWithout, horizonYear, counted } = effect;
  if (effect.quotaWith !== undefined && effect.quotaWithout !== undefined) {
    const withPct = formatQuota(effect.quotaWith);
    const withoutPct = formatQuota(effect.quotaWithout);
    const when = `all’età obiettivo (${effect.targetCalendarYear})`;
    if (withPct === withoutPct) {
      return counted
        ? `Questa spesa non cambia la quota del numero FIRE all’età obiettivo (${withPct}, scenario Base).`
        : `Se la contassi nel FIRE la quota all’età obiettivo non cambierebbe (${withPct}).`;
    }
    return counted
      ? `Con questa spesa ${when} avrai il ${withPct} del numero FIRE invece del ${withoutPct} (scenario Base).`
      : `Se la contassi nel FIRE: ${when} avresti il ${withPct} del numero FIRE invece del ${withoutPct}.`;
  }
  const same = yearWith === yearWithout;
  if (counted) {
    return same
      ? `Questa spesa non sposta l’anno FIRE (${yearWith === null ? `oltre il ${horizonYear}` : yearWith}, scenario Base).`
      : `Con questa spesa il FIRE è ${whenWords(yearWith, horizonYear)} invece che ${whenWords(yearWithout, horizonYear)} (scenario Base).`;
  }
  return same
    ? `Se la contassi nel FIRE l’anno non cambierebbe (${yearWith === null ? `oltre il ${horizonYear}` : yearWith}).`
    : `Se la contassi nel FIRE: ${yearWith === null ? `oltre il ${horizonYear}` : yearWith} invece che ${yearWithout === null ? `oltre il ${horizonYear}` : yearWithout}.`;
}
