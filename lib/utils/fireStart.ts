/**
 * T5 «Dopo il FIRE» (doc/montecarlo/README.md § 12, RD1–RD3, RD5): from which year the withdrawal simulation starts and with
 * what capital. Pure: the tab feeds it the saved plan's Base walk (`runBaselineProjection`, the What If's «prima»).
 */
import type { FIREProjectionResult } from '@/types/assets';
import { findDepletion, quotaAtTarget } from '@/lib/utils/fireDepletion';

export type FireStartReason = 'already' | 'never' | 'no-plan';

export type FireStart =
  | {
      kind: 'fire';
      /** `T`: years from today to the FIRE year (≥ 1). */
      years: number;
      calendarYear: number;
      /** The age at the FIRE year, `null` without a saved age. */
      ageAtFire: number | null;
      /** RD2: the Base capital at the FIRE year, nominal euros. */
      capitalNominal: number;
      /** RD2: the same in today's euros (`capitalNominal / (1 + π_b)^T`). */
      capitalToday: number;
      /** RD3: the unrealised-gain share of the capital at the FIRE year (0…1); `null` when the walk models no withdrawal tax. */
      gainShare: number | null;
    }
  | {
      /** § 21 RE9: no FIRE year within the horizon — the walk of the target age. Same figures as `'fire'`, plus the share of the FIRE number. */
      kind: 'target';
      years: number;
      calendarYear: number;
      ageAtFire: number | null;
      capitalNominal: number;
      capitalToday: number;
      gainShare: number | null;
      /** `W_T / N_T` (0…1). */
      quota: number;
    }
  /** RE9: the capital is gone by the target age — nothing to withdraw. */
  | { kind: 'depleted'; depletionYear: number }
  | { kind: 'today'; reason: FireStartReason };

export interface FireStartInput {
  projection: FIREProjectionResult | null;
  /** The Base FIRE year as the What If reads it: 0 = already, null = never within the horizon. */
  yearsToFIRE: number | null;
  /** `useWhatIfBaseline().hasBaseline`: capital, expenses and SWR are there. */
  hasBaseline: boolean;
  /** The Base scenario's inflation, percent. */
  baseInflationRate: number;
  currentYear: number;
  currentAge: number | null;
  /** § 21 RE9: the years to the target age, null without a saved one. Read only when `yearsToFIRE` is null. */
  targetYears?: number | null;
}

export function resolveFireStart(input: FireStartInput): FireStart {
  if (!input.hasBaseline || !input.projection) return { kind: 'today', reason: 'no-plan' };
  if (input.yearsToFIRE === 0) return { kind: 'today', reason: 'already' };
  const targetYears = input.yearsToFIRE === null ? (input.targetYears ?? null) : null;
  if (input.yearsToFIRE === null && targetYears === null) return { kind: 'today', reason: 'never' };
  const years = input.yearsToFIRE ?? (targetYears as number);
  const row = input.projection.yearlyData.find((entry) => entry.year === years);
  if (!row) return { kind: 'today', reason: 'never' };
  if (targetYears !== null) {
    const depletionYear = findDepletion(input.projection.yearlyData, 'baseNetWorth');
    if (row.baseNetWorth <= 0 && depletionYear !== null) return { kind: 'depleted', depletionYear };
  }
  const capitalNominal = row.baseNetWorth;
  const capitalToday = capitalNominal / Math.pow(1 + input.baseInflationRate / 100, years);
  const gainShare =
    row.baseCostBasis === undefined ? null : capitalNominal > 0 ? Math.min(1, Math.max(0, 1 - row.baseCostBasis / capitalNominal)) : 0;
  if (targetYears !== null) {
    return {
      kind: 'target',
      years,
      calendarYear: input.currentYear + years,
      ageAtFire: input.currentAge === null ? null : input.currentAge + years,
      capitalNominal,
      capitalToday,
      gainShare,
      quota: quotaAtTarget(input.projection, years) ?? 0,
    };
  }
  return {
    kind: 'fire',
    years,
    calendarYear: input.currentYear + years,
    ageAtFire: input.currentAge === null ? null : input.currentAge + years,
    capitalNominal,
    capitalToday,
    gainShare,
  };
}

/** RD5: the default number of years of withdrawal, down to 90 years of age; 30 without a saved age (the default of before). */
export function defaultWithdrawalYears(currentAge: number | null, startYears: number): number {
  if (currentAge === null) return 30;
  return Math.min(60, Math.max(1, Math.round(90 - (currentAge + startYears))));
}
