'use client';

/**
 * The What If's baseline — the plan of TODAY as the Calcolatore runs it — assembled ONCE for whoever needs it
 * (doc/fire-ipotesi/README.md § 13, RO2): the What If tab and the Obiettivi's «Effetto sul FIRE» read the same
 * `WhatIfBaseline`, so a goal's effect on the FIRE year is computed on the plan the other tabs show. Extracted verbatim from
 * `WhatIfAnalysisTab` (same queries, same assembly, same result); the shared React Query keys mean no extra fetching.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { resolvePensionLockState } from '@/lib/utils/pensionUnlock';
import { realReturn } from '@/lib/utils/realReturn';
import {
  getAnnualCashflowData,
  getDefaultScenarios,
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
  type FireHonestInputs,
  type PensionCapitalInflowToday,
} from '@/lib/services/fireService';
import { useFireDatedFlows } from '@/lib/hooks/useFireDatedFlows';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import type { DatedFlowsInput } from '@/lib/utils/datedFlows';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import type { WhatIfBaseline } from '@/types/whatIf';

export function useWhatIfBaseline() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

  // ─── Queries ─────────────────────────────────────────────────────────────────
  // The saved settings with the plan's draft over them (RP3): «Il mio piano» is previewed here.
  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useFireSettings();

  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  const { data: cashflowData, isLoading: isLoadingCashflow, isError: cashflowError } = useQuery({
    queryKey: ['annualCashflowData', ownerId],
    queryFn: () => getAnnualCashflowData(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  // ─── Baseline assembly ───────────────────────────────────────────────────────
  // The FIRE lock-in toggle governs the whole page — the What If baseline inherits it. Locked
  // pension capital leaves the perturbable net worth and re-enters BOTH walks: the FIRE one as
  // the Calcolatore's bridge (compartment merged at the unlock year, bridge FIRE number until
  // then) and the Coast one as a capital inflow at its unlock year.
  const respectPensionLockIn = settings?.respectPensionLockInFire ?? false;
  const pensionLockState = useMemo(() => {
    if (!respectPensionLockIn || !assets) return null;
    return resolvePensionLockState(
      assets,
      {
        userAge: settings?.userAge,
        pensionInpsRetirementAge: settings?.pensionInpsRetirementAge,
        pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment,
      },
      new Date(),
      calculateAssetValue,
    );
  }, [respectPensionLockIn, assets, settings?.userAge, settings?.pensionInpsRetirementAge, settings?.pensionRitaLongUnemployment]);
  const pensionLockedValue = pensionLockState?.totalLockedToday ?? 0;

  // The page's hypotheses (doc/fire-ipotesi/README.md): the scenarios are the target portfolio's rates on the
  // per-class assumptions of Impostazioni › Simulazioni, read through ONE hook in every tab.
  const assumptionLockedIds = useMemo(() => new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [pensionLockState]);
  const { assumptions } = useFireAssumptions(assumptionLockedIds, { withCashflow: true });
  // § 12: the SAVED dated flows are the plan both sides run on («prima» = the Calcolatore's); an event of a later year is laid over them.
  const { resolved: resolvedFlows, isLoading: isLoadingFlows } = useFireDatedFlows({ lockedAssetIds: assumptionLockedIds });
  const planExpensesFromCashflow = (assumptions?.expenses?.origin ?? 'cashflow') === 'cashflow';
  const datedFlows = useMemo<DatedFlowsInput | undefined>(
    () => (resolvedFlows.length > 0 ? { resolved: resolvedFlows, planExpensesFromCashflow } : undefined),
    [resolvedFlows, planExpensesFromCashflow],
  );
  const assumptionsWithFlows = useMemo(() => (assumptions ? { ...assumptions, datedFlowsCount: resolvedFlows.length } : null), [assumptions, resolvedFlows.length]);
  const currentYear = getItalyYear();
  const scenarios = useMemo(() => assumptions?.scenarios ?? getDefaultScenarios(), [assumptions]);
  const pensionInflowsToday = useMemo<PensionCapitalInflowToday[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ yearsFromNow: inflow.yearsFromNow, amountToday: inflow.amount })),
    [pensionLockState],
  );
  // Multi-fund unlocks aggregate on the LATEST year, as the Calcolatore does (doc/guide/fire.md § FIRE, What If and Goals).
  const pensionUnlockYears = pensionLockState && pensionLockState.inflows.length > 0 ? Math.max(...pensionLockState.inflows.map((inflow) => inflow.yearsFromNow)) : 0;
  const pensionBridge = useMemo(
    () => (pensionLockedValue > 0 && pensionUnlockYears > 0 ? { valueToday: pensionLockedValue, yearsToUnlock: pensionUnlockYears } : null),
    [pensionLockedValue, pensionUnlockYears],
  );

  // RP5 (D4): the capital `K` of the whole page, and the tax profile behind it.
  const capital = assumptions?.capital ?? null;
  const netWorth = capital?.total ?? 0;
  const liquidNetWorth = capital?.liquid ?? 0;

  // The honest inputs of the Calcolatore (2026-09-24), built the same way: the tax profile of `K`,
  // the state pensions dated by the saved age.
  const now = useMemo(() => new Date(), []);
  const taxProfile = capital?.taxProfile ?? null;
  const honest = useMemo<FireHonestInputs>(
    () => ({
      userAge: settings?.userAge,
      pensions: normalizeCoastFirePensions(settings?.coastFirePensions),
      taxBrackets: normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets),
      withdrawalTax: taxProfile ? { basisToday: taxProfile.basisToday, rate: taxProfile.rate } : undefined,
      now,
    }),
    [settings?.userAge, settings?.coastFirePensions, settings?.coastFireTaxBrackets, taxProfile, now],
  );
  const illiquidNetWorth = capital?.illiquid ?? 0;
  const withdrawalRate = settings?.withdrawalRate ?? 4;
  // RP6 (D5): the plan's expenses. The Cashflow's own figure stays for the job loss, which is a fact of the income.
  const annualExpenses = assumptions?.expenses?.annual ?? 0;
  const cashflowExpenses = cashflowData?.annualExpensesFromCashflow ?? 0;
  const annualSavings = cashflowData?.annualSavings ?? 0;

  // ─── The baseline and the scenario ───────────────────────────────────────────
  const currentAge = settings?.userAge ?? null;
  const retirementAge = settings?.coastFireRetirementAge ?? 60;

  const baseline = useMemo<WhatIfBaseline>(() => {
    return {
      netWorth,
      liquidNetWorth,
      illiquidNetWorth,
      annualExpenses,
      annualSavings,
      annualIncome: cashflowExpenses + annualSavings,
      indexSavings: true,
      withdrawalRate,
      scenarios,
      pensionBridge,
      honest,
      flows: datedFlows,
      currentYear,
      coast:
        currentAge !== null
          ? {
              currentAge,
              retirementAge,
              annualExpenses,
              realReturnRate: realReturn(scenarios.base.growthRate, scenarios.base.inflationRate),
              inflationRate: scenarios.base.inflationRate,
              pensions: normalizeCoastFirePensions(settings?.coastFirePensions),
              taxBrackets: normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets),
              capitalInflowsToday: pensionInflowsToday,
            }
          : null,
    };
    // settings sub-fields are captured explicitly; the whole settings object is stable per query.
  }, [
    netWorth,
    liquidNetWorth,
    illiquidNetWorth,
    annualExpenses,
    cashflowExpenses,
    annualSavings,
    withdrawalRate,
    scenarios,
    pensionBridge,
    honest,
    datedFlows,
    currentYear,
    currentAge,
    retirementAge,
    pensionInflowsToday,
    settings?.coastFirePensions,
    settings?.coastFireTaxBrackets,
  ]);

  const hasBaseline = netWorth > 0 && annualExpenses > 0 && withdrawalRate > 0;

  return {
    settings,
    assets,
    cashflowData,
    isLoadingSettings,
    isLoadingAssets,
    isLoadingCashflow,
    isLoadingFlows,
    settingsError,
    assetsError,
    cashflowError,
    assumptions,
    assumptionsWithFlows,
    datedFlows,
    resolvedFlows,
    scenarios,
    currentYear,
    pensionLockState,
    netWorth,
    annualExpenses,
    annualSavings,
    cashflowExpenses,
    withdrawalRate,
    baseline,
    hasBaseline,
  };
}
