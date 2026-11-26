'use client';

/**
 * The FIRE progress — ONE derivation of the Calculator's figures, read by the Calculator and by Panoramica's «Verso il FIRE»
 * (doc/essenziale/README.md § 5.7, D-ES2; NF1: «numero FIRE» names only the Calculator's requirement).
 *
 * It was the first half of `FireCalculatorTab` (2026-11-26, ES2, moved whole, nothing re-derived): the plan's settings, the
 * assets, the snapshots and the recent expenses window → ONE capital `K` (K1/EF1), the requirement of today
 * (`resolveFireRequirement`: bridge, pensions, tax, dated flows) and the deterministic projection on the Base scenario. The
 * same hooks, the same query keys: a Panoramica that reads it for a viewer with FIRE off shares the persisted cache with the
 * Calculator (doc/guide/cache-persistita.md). The history behind the «Dettaglio» (the older expenses window, `buildFIREData`)
 * stays in the tab: nothing of the tile needs it.
 */

import { useMemo } from 'react';
import { useExpenseFlows } from '@/lib/hooks/useExpenseFlows';
import { fireWindows } from '@/lib/utils/expenseWindows';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useAssets } from '@/lib/hooks/useAssets';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue } from '@/lib/services/assetService';
import { resolveGainShare } from '@/lib/utils/withdrawalTax';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { DEFAULT_INPS_RETIREMENT_AGE, resolvePensionLockState } from '@/lib/utils/pensionUnlock';
import {
  calculateFIREMetrics,
  calculateFIREProjection,
  computeAnnualCashflowData,
  getDefaultScenarios,
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
  resolveFireRequirement,
  type FireFlowsInput,
  type FireHonestInputs,
  type FireProjectionPensionBridge,
} from '@/lib/services/fireService';
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { useFireDatedFlows } from '@/lib/hooks/useFireDatedFlows';
import { buildFlowSchedule } from '@/lib/utils/datedFlows';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { resolvePlanExpenses, type FireAssumptions } from '@/lib/utils/fireAssumptions';
import { withFlowsDetail } from '@/lib/utils/fireAssumptionsNarrative';
import type { FireTargetHonest } from '@/lib/utils/fireSummary';
import type { FIREProjectionScenarios } from '@/types/assets';

/** The deterministic projection's horizon. */
export const PROJECTION_HORIZON_YEARS = 50;

export function useFireProgress() {
  const { ownerId } = useActiveAccount();

  // ─── Queries ─────────────────────────────────────────────────────────────────
  // The saved settings with the plan's draft over them (RP3): «Il mio piano» is previewed here, and every figure below
  // reads the same plan the other five tabs do. `saved` is the stored document, for the one query that must not refetch while typing.
  const { data: settings, saved: savedSettings, isLoading: isLoadingSettings, isError: settingsError } = useFireSettings();

  // Assets from the key every page shares (2026-09-29).
  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useAssets(ownerId);

  // The cashflow figures — the last full year, else the running year annualised — computed in
  // memory from the page's RECENT expenses window (January of last year → this December: the key
  // Coast FIRE and What If read too), in parallel with the assets, the settings and the snapshots.
  // The history behind the «Dettaglio» also needs the rows before that window, back to eleven
  // months before the first snapshot: a second, OLDER window that can only be asked for once the
  // snapshots are in, and that the grid does not wait for (2026-09-30; until then the tab read
  // the account's whole expense list for it).
  const readAt = useMemo(() => new Date(), []);
  const { data: snapshots, isLoading: isLoadingSnapshots } = useSnapshots(ownerId);
  const expenseWindows = useMemo(() => fireWindows(readAt, snapshots?.[0] ?? null), [readAt, snapshots]);
  // Both as MOVEMENTS since the monthly totals (doc/totali-mensili/README.md § 6.3): the closed
  // months as the aggregated rows of their totals, the running one from its rows — the builders sum
  // by month, type and category, so the figures are the rows' (CA5). The history is ONE list from
  // its first month to this December; with no older window it is the recent list itself.
  const { data: recentExpenses, isLoading: isLoadingCashflow, isError: recentExpensesError } = useExpenseFlows(ownerId, {
    from: expenseWindows.recent.from,
    to: expenseWindows.recent.to,
  });
  const cashflowData = useMemo(() => (recentExpenses ? computeAnnualCashflowData(recentExpenses, readAt) : undefined), [recentExpenses, readAt]);
  const annualSavings = cashflowData?.annualSavings ?? 0;

  const previewWithdrawalRate = settings?.withdrawalRate ?? 4.0;
  // The saved rate drives the history: typing in the plan must not recompute it.
  const withdrawalRate = savedSettings?.withdrawalRate ?? 4.0;

  // ─── Pension lock (preview inputs: the RITA controls update the estimate instantly) ─────
  const respectPensionLockIn = settings?.respectPensionLockInFire ?? false;
  const previewInpsRetirementAge = settings?.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE;
  const ritaLongUnemployment = settings?.pensionRitaLongUnemployment ?? false;
  const userAge = settings?.userAge;

  // Locked pension capital (unlock resolved by pensionUnlock.ts: per-fund override > RITA rule
  // from userAge > not modellable) stays in the app's total net worth everywhere else — it only
  // leaves what THIS calculator treats as spendable now. Memoized because the fan inputs (and
  // the projection memo) key on its identity.
  const pensionLockState = useMemo(() => {
    if (!respectPensionLockIn || !assets) return null;
    return resolvePensionLockState(
      assets,
      { userAge, pensionInpsRetirementAge: previewInpsRetirementAge, pensionRitaLongUnemployment: ritaLongUnemployment },
      new Date(),
      calculateAssetValue,
    );
  }, [respectPensionLockIn, assets, userAge, previewInpsRetirementAge, ritaLongUnemployment]);
  const pensionLockedValue = pensionLockState?.totalLockedToday ?? 0;

  // The page's hypotheses (doc/fire-ipotesi/README.md): the three scenarios are the target portfolio's
  // rates on the per-class assumptions of Impostazioni › Avanzate — never typed here. While the
  // data loads the skeleton is shown, so the neutral defaults below are never read as numbers.
  const assumptionLockedIds = useMemo(() => new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [pensionLockState]);
  const { assumptions: savedAssumptions } = useFireAssumptions(assumptionLockedIds, { withCashflow: true });
  const scenarios = useMemo<FIREProjectionScenarios>(() => savedAssumptions?.scenarios ?? getDefaultScenarios(), [savedAssumptions]);

  // RP6: the plan's expenses (the typed one is already over `settings`, RP3; empty = from the Cashflow).
  const expenses = useMemo(() => (cashflowData ? resolvePlanExpenses(settings ?? {}, cashflowData) : null), [cashflowData, settings]);
  // § 12 (F1): the dated flows, placed on the calendar with the age and the linked mortgages (the plan's preview included).
  const { resolved: resolvedFlows, excluded: excludedFlows } = useFireDatedFlows({ lockedAssetIds: assumptionLockedIds });
  const flowsInput = useMemo<FireFlowsInput | undefined>(
    () => (resolvedFlows.length > 0 ? { resolved: resolvedFlows, planExpensesFromCashflow: (expenses?.origin ?? 'cashflow') === 'cashflow' } : undefined),
    [resolvedFlows, expenses?.origin],
  );
  const assumptions = useMemo<FireAssumptions | null>(
    () => (savedAssumptions ? { ...withFlowsDetail(savedAssumptions, resolvedFlows, excludedFlows), expenses: expenses ?? undefined } : null),
    [savedAssumptions, expenses, resolvedFlows, excludedFlows],
  );
  const projectionAnnualExpenses = expenses?.annual ?? 0;
  // RP5 (D4): ONE capital for every tab — `K`, net of the closed pension funds; real estate and crypto stay out, declared in the line.
  const capital = assumptions?.capital ?? null;

  // Bridge model inputs. Funds with different unlock years are aggregated on the LATEST year —
  // conservative when the floor binds, and neutral otherwise because the fund grows and is
  // discounted at the same scenario real return. The PREVIEW base scenario, the one the
  // projection runs on: the number and the year must move together while a parameter is edited.
  const pensionUnlockYears =
    pensionLockState && pensionLockState.inflows.length > 0 ? Math.max(...pensionLockState.inflows.map((inflow) => inflow.yearsFromNow)) : 0;
  const pensionBridge = useMemo<FireProjectionPensionBridge | null>(
    () => (pensionLockedValue > 0 && pensionUnlockYears > 0 ? { valueToday: pensionLockedValue, yearsToUnlock: pensionUnlockYears } : null),
    [pensionLockedValue, pensionUnlockYears],
  );
  // Primitive mirrors of pensionBridge so the memos below can depend on stable values.
  const pensionBridgeValueToday = pensionBridge?.valueToday ?? 0;
  const pensionBridgeYearsToUnlock = pensionBridge?.yearsToUnlock ?? 0;

  // The residence rule of Impostazioni stays on the history of the runway only (facts, not hypotheses — D4).
  // Read once here: the fan's memos above the render's `currentYear` need it too.
  const currentYearForFan = getItalyYear();
  const currentNetWorth = capital?.total ?? 0;

  // ─── What makes the number honest (2026-09-24) ────────────────────────────────
  // The tax profile of the capital the plan withdraws from — `K`, the same set `currentNetWorth` is — and
  // the state pensions saved in Coast FIRE, dated by the saved age. Null profile = no EUR cost basis anywhere: tax not modelled.
  const now = useMemo(() => new Date(), []);
  const taxProfile = capital?.taxProfile ?? null;
  const savedPensions = settings?.coastFirePensions;
  const savedTaxBrackets = settings?.coastFireTaxBrackets;
  const honest = useMemo<FireHonestInputs>(
    () => ({
      userAge,
      pensions: normalizeCoastFirePensions(savedPensions),
      taxBrackets: normalizeCoastFireTaxBrackets(savedTaxBrackets),
      withdrawalTax: taxProfile ? { basisToday: taxProfile.basisToday, rate: taxProfile.rate } : undefined,
      now,
    }),
    [userAge, savedPensions, savedTaxBrackets, taxProfile, now],
  );
  const gainShareToday = taxProfile ? resolveGainShare(currentNetWorth, taxProfile.basisToday) : 0;
  const liquidNetWorth = capital?.liquid ?? 0;
  const illiquidNetWorth = capital?.illiquid ?? 0;

  // ─── The numbers (pure layer over the existing engines) ──────────────────────
  // The metrics on the PREVIEW withdrawal rate, with the bridge override when the lock is on:
  // free assets must cover the spending bridge until the unlock, then the fund tops up the
  // standard requirement. The expenses are the projection's (`getAnnualCashflowData`: the last
  // full year, else the running year annualized and said so in the Base di calcolo aside) —
  // ONE basis for the number, the verdict and the chart (The Same-Basis Rule). `getFIREData`'s
  // own metrics read the last full year only, which on a fresh account is a 0 that would call
  // the number «non calcolabile» while the projection kept drawing.
  // The requirement of TODAY (`resolveFireRequirement`, the ONE rule the walk runs year by
  // year): the bridge while the unlock is ahead, the pensions from their start, the tax on what
  // the portfolio funds. `withoutBridge` is the same number with the fund free — the caption's
  // «senza il vincolo sarebbe».
  const requirementToday = useMemo(() => {
    if (!cashflowData || currentNetWorth <= 0 || projectionAnnualExpenses <= 0 || previewWithdrawalRate <= 0) return null;
    const flows = flowsInput ? buildFlowSchedule(flowsInput.resolved, { inflationRate: scenarios.base.inflationRate, planExpensesFromCashflow: flowsInput.planExpensesFromCashflow }) : undefined;
    const shared = { annualExpenses: projectionAnnualExpenses, withdrawalRate: previewWithdrawalRate, scenario: scenarios.base, yearsElapsed: 0, honest, gainShare: gainShareToday, flows };
    const bridge = pensionBridgeValueToday > 0 && pensionBridgeYearsToUnlock > 0 ? { compartmentValue: pensionBridgeValueToday, yearsToUnlock: pensionBridgeYearsToUnlock } : undefined;
    return { withBridge: resolveFireRequirement({ ...shared, bridge }), withoutBridge: resolveFireRequirement(shared), flows, bridge };
  }, [cashflowData, currentNetWorth, projectionAnnualExpenses, previewWithdrawalRate, scenarios.base, honest, gainShareToday, pensionBridgeValueToday, pensionBridgeYearsToUnlock, flowsInput]);

  const displayedFireMetrics = useMemo(() => {
    if (!cashflowData || currentNetWorth <= 0) return null;
    const metrics = calculateFIREMetrics(currentNetWorth, projectionAnnualExpenses, previewWithdrawalRate, liquidNetWorth, illiquidNetWorth);
    if (!requirementToday) return metrics;
    const { requirement } = requirementToday.withBridge;
    return {
      ...metrics,
      fireNumber: requirement,
      progressToFI: requirement > 0 ? (currentNetWorth / requirement) * 100 : 0,
    };
  }, [cashflowData, currentNetWorth, projectionAnnualExpenses, liquidNetWorth, previewWithdrawalRate, illiquidNetWorth, requirementToday]);

  // What is inside the number, for the rows, the caption and the verdict (declared when out).
  const honestSummary = useMemo<FireTargetHonest>(() => {
    const req = requirementToday?.withBridge;
    const pensionsConsidered = req?.pensionsConsidered ?? false;
    return {
      pensionsConsidered,
      pensionNetAnnual: req?.pensionNetAnnual ?? 0,
      pensionStartCalendarYear:
        pensionsConsidered && req?.pensionLatestStartAge !== null && req?.pensionLatestStartAge !== undefined && userAge !== undefined
          ? currentYearForFan + Math.max(0, Math.ceil(req.pensionLatestStartAge - userAge))
          : null,
      pensionCount: req?.pensionCount ?? 0,
      pensionsSkipped: pensionsConsidered ? null : honest.pensions.length === 0 ? 'none-saved' : 'no-age',
      taxConsidered: taxProfile !== null,
      taxRate: taxProfile?.rate ?? 0,
      gainSharePct: gainShareToday * 100,
      taxSkipped: taxProfile ? null : 'no-basis',
    };
  }, [requirementToday, userAge, currentYearForFan, honest.pensions.length, taxProfile, gainShareToday]);

  const projectionBridge = useMemo<FireProjectionPensionBridge | undefined>(
    () => (pensionBridgeValueToday > 0 && pensionBridgeYearsToUnlock > 0 ? { valueToday: pensionBridgeValueToday, yearsToUnlock: pensionBridgeYearsToUnlock } : undefined),
    [pensionBridgeValueToday, pensionBridgeYearsToUnlock],
  );
  // The deterministic projection — the verdict, the Traguardo and the Scenari share it.
  const projection = useMemo(() => {
    if (currentNetWorth <= 0 || projectionAnnualExpenses <= 0 || previewWithdrawalRate <= 0) return null;
    return calculateFIREProjection(
      currentNetWorth,
      projectionAnnualExpenses,
      annualSavings,
      previewWithdrawalRate,
      scenarios,
      PROJECTION_HORIZON_YEARS,
      projectionBridge,
      honest,
      // RP7 (D6): the saving grows with the scenario's inflation, the pace Coast already keeps.
      true,
      flowsInput,
    );
  }, [currentNetWorth, projectionAnnualExpenses, annualSavings, previewWithdrawalRate, scenarios, projectionBridge, honest, flowsInput]);

  return {
    settings,
    isLoadingSettings,
    settingsError,
    assets,
    isLoadingAssets,
    assetsError,
    readAt,
    snapshots,
    isLoadingSnapshots,
    expenseWindows,
    recentExpenses,
    isLoadingCashflow,
    recentExpensesError,
    annualSavings,
    previewWithdrawalRate,
    withdrawalRate,
    previewInpsRetirementAge,
    ritaLongUnemployment,
    userAge,
    pensionLockState,
    scenarios,
    expenses,
    resolvedFlows,
    excludedFlows,
    flowsInput,
    assumptions,
    projectionAnnualExpenses,
    capital,
    pensionUnlockYears,
    pensionBridge,
    currentYearForFan,
    currentNetWorth,
    now,
    honest,
    gainShareToday,
    requirementToday,
    displayedFireMetrics,
    honestSummary,
    projectionBridge,
    projection,
    cashflowData,
  };
}
