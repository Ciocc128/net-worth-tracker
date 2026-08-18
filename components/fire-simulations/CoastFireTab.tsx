'use client';

/**
 * CoastFireTab — single-answer IA.
 *
 * The page asks one question, "posso smettere di versare?", and answers it before anything else:
 *   1. HERO [2fr_1fr] — the shortfall (or surplus) against the Coast FIRE Number with the verdict
 *      in words, beside what the patrimonio becomes if contributions stop today. A basis line
 *      under the hero declares the assumptions.
 *   2. "Afflussi già considerati" — the events the backward walk already discounts: each state
 *      pension from its decorrenza, plus the pension fund unlocking.
 *   3. "Impostazioni Coast FIRE" — ONE collapsible, config-first collapse via a useRef seeded
 *      flag (never keyed on the transient hasUnsavedChanges — AGENTS → *FIRE, What If and Goals*).
 *   4. "Scenari" — Orso / Base / Toro as peer cards.
 *   5. "Proiezione" — the chart, with the unlock step named in its tooltip, and a "Dettaglio"
 *      collapsible holding the coverage phases, the per-pension impact and the explainer.
 *
 * This file is the ORCHESTRATOR: the three queries, the projection, and the derivations that feed
 * the five sections. The form lives in `useCoastFireSettingsDraft`, the wording and the view model
 * in `lib/utils/coastFireView.ts`, the math in `fireService` — where it already was, unchanged.
 *
 * The state-pension inputs are intentionally scoped to Coast FIRE only: they affect the
 * retirement-phase portfolio need, not the classic FIRE tab.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useCoastFireSettingsDraft } from '@/lib/hooks/useCoastFireSettingsDraft';
import {
  calculateCoastFIREProjection,
  getAnnualExpenses,
  getDefaultScenarios,
  type PensionCapitalInflowToday,
} from '@/lib/services/fireService';
import {
  calculateAssetValue,
  calculateFIRENetWorth,
  calculateLiquidFIRENetWorth,
  getAllAssets,
} from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { resolvePensionLockState } from '@/lib/utils/pensionUnlock';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import {
  buildBaseScenarioInterpretation,
  buildCoastBasisParts,
  buildCoastCoverageSteps,
  buildCoastInflowEvents,
  buildCoastVerdict,
  formatAgeYears,
  getPensionConfigurationState,
  resolveCoastIncompleteReason,
} from '@/lib/utils/coastFireView';
import { Card, CardContent } from '@/components/ui/card';
import { FireCalculatorSkeleton } from '@/components/fire-simulations/FireCalculatorSkeleton';
import { CoastFireConfigSection } from './coast/CoastFireConfigSection';
import { CoastFireHero } from './coast/CoastFireHero';
import { CoastFireProjectionSection } from './coast/CoastFireProjectionSection';
import { CoastInflowTimeline } from './coast/CoastInflowTimeline';
import { CoastScenarioCards } from './coast/CoastScenarioCards';
import { Settings } from '@/types/settings';

export function CoastFireTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const { data: settings, isLoading: isLoadingSettings } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const { data: annualExpenses, isLoading: isLoadingAnnualExpenses } = useQuery({
    queryKey: ['coastFireAnnualExpenses', ownerId],
    queryFn: () => getAnnualExpenses(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const draft = useCoastFireSettingsDraft({
    settings,
    isLoadingSettings,
    userId: user?.uid,
    ownerId,
  });

  const includePrimaryResidence = settings?.includePrimaryResidenceInFIRE ?? false;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const scenarios = settings?.fireProjectionScenarios ?? getDefaultScenarios();
  const withdrawalRate = settings?.withdrawalRate ?? 4.0;
  const currentAge = draft.currentAge;
  const retirementAge = draft.parsedRetirementAge;

  // The FIRE lock-in toggle governs the WHOLE page. When on, locked pension funds leave
  // the Coast starting capital and re-enter the walk as capital inflows at their unlock year.
  const respectPensionLockIn = settings?.respectPensionLockInFire ?? false;
  const pensionLockState = useMemo(() => {
    if (!respectPensionLockIn || !assets) return null;
    return resolvePensionLockState(
      assets,
      {
        userAge: currentAge ?? settings?.userAge,
        pensionInpsRetirementAge: settings?.pensionInpsRetirementAge,
        pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment,
      },
      new Date(),
      calculateAssetValue
    );
  }, [
    respectPensionLockIn,
    assets,
    currentAge,
    settings?.userAge,
    settings?.pensionInpsRetirementAge,
    settings?.pensionRitaLongUnemployment,
  ]);
  const pensionLockedValue = pensionLockState?.totalLockedToday ?? 0;
  const pensionInflowsToday = useMemo<PensionCapitalInflowToday[]>(
    () =>
      (pensionLockState?.inflows ?? []).map((inflow) => ({
        yearsFromNow: inflow.yearsFromNow,
        amountToday: inflow.amount,
      })),
    [pensionLockState]
  );
  const currentNetWorth = assets
    ? calculateFIRENetWorth(assets, includePrimaryResidence) - pensionLockedValue
    : 0;

  // Custom expenses when the toggle is on and the value parses to a positive number; otherwise
  // the last complete year's actuals from the query.
  const effectiveAnnualExpenses = draft.usesCustomExpenses
    ? draft.parsedCustomExpenses
    : annualExpenses;

  const { previewPensions, previewTaxBrackets } = draft;
  const coastProjection = useMemo(() => {
    if (
      currentAge === null ||
      retirementAge === null ||
      effectiveAnnualExpenses === undefined ||
      effectiveAnnualExpenses <= 0 ||
      withdrawalRate <= 0 ||
      currentNetWorth <= 0
    ) {
      return null;
    }

    return calculateCoastFIREProjection(
      currentNetWorth,
      effectiveAnnualExpenses,
      withdrawalRate,
      currentAge,
      retirementAge,
      scenarios,
      previewPensions,
      previewTaxBrackets,
      undefined, // currentDate: keep the function's own default
      pensionInflowsToday
    );
  }, [
    effectiveAnnualExpenses,
    currentAge,
    currentNetWorth,
    pensionInflowsToday,
    previewPensions,
    previewTaxBrackets,
    retirementAge,
    scenarios,
    withdrawalRate,
  ]);

  // ===== Derived view model — one place, so the five sections cannot disagree =====

  const currentYear = getItalyYear();
  const baseScenario = coastProjection?.scenarios.base ?? null;
  const liquidProgressBase =
    baseScenario && baseScenario.coastFireNumberToday > 0
      ? (liquidNetWorth / baseScenario.coastFireNumberToday) * 100
      : 0;
  const resolvedRetirementAge = coastProjection?.retirementAge ?? retirementAge ?? 0;
  const bridgeYears = baseScenario
    ? Math.max(Math.ceil(baseScenario.latestPensionStartAge - resolvedRetirementAge), 0)
    : 0;
  const sortedPensionBreakdown = useMemo(
    () =>
      baseScenario
        ? [...baseScenario.pensionBreakdown].sort((left, right) => left.startAge - right.startAge)
        : [],
    [baseScenario]
  );
  const pensionConfigurationState = getPensionConfigurationState(
    previewPensions,
    draft.pensionIssues
  );

  // Funds with different unlock years are aggregated on the LATEST one, exactly as the FIRE tab
  // does (AGENTS → *FIRE, What If and Goals*): the tooltip names one step, and with growth equal
  // to the discount rate the bridge number is insensitive to which one it names.
  const pensionUnlockCalendarYear =
    pensionInflowsToday.length > 0
      ? currentYear +
        Math.max(
          ...pensionInflowsToday.map((inflow) => Math.max(0, Math.round(inflow.yearsFromNow)))
        )
      : null;

  const incompleteReason = resolveCoastIncompleteReason(
    currentNetWorth,
    effectiveAnnualExpenses,
    currentAge,
    retirementAge
  );
  const verdict = buildCoastVerdict(baseScenario, currentNetWorth, incompleteReason);
  const basisParts = buildCoastBasisParts({
    currentAge,
    retirementAge,
    annualExpenses: effectiveAnnualExpenses,
    usesCustomExpenses: draft.usesCustomExpenses,
    withdrawalRate,
    baseRealReturn: baseScenario?.realReturnRate ?? null,
    respectPensionLockIn,
    pensionUnlockCalendarYear,
  });
  const inflowEvents = useMemo(
    () => buildCoastInflowEvents(sortedPensionBreakdown, pensionInflowsToday, currentYear),
    [sortedPensionBreakdown, pensionInflowsToday, currentYear]
  );
  const coverageSteps = buildCoastCoverageSteps(
    baseScenario,
    sortedPensionBreakdown,
    resolvedRetirementAge,
    bridgeYears
  );
  const interpretation = buildBaseScenarioInterpretation(
    baseScenario,
    effectiveAnnualExpenses,
    bridgeYears,
    resolvedRetirementAge
  );

  // Decide the initial collapsed/expanded state ONCE, after the form has settled to match saved
  // settings (hasUnsavedChanges === false ⇒ temp state seeded). Collapsed when the user has already
  // configured their age (config-first for new users). Waiting for the settled state avoids the
  // transient first-render mismatch (empty temp vs saved age) popping the panel open.
  const hasSeededConfigRef = useRef(false);
  const hasUnsavedChanges = draft.hasUnsavedChanges;
  useEffect(() => {
    if (hasSeededConfigRef.current || isLoadingSettings || hasUnsavedChanges) return;
    hasSeededConfigRef.current = true;
    if (settings?.userAge == null) setIsConfigOpen(true);
  }, [isLoadingSettings, hasUnsavedChanges, settings?.userAge]);

  // After seeding, reopen on a genuine unsaved edit or an incomplete pension to fix.
  // Never auto-close: collapsing after save is disorienting if the user keeps editing.
  useEffect(() => {
    if (!hasSeededConfigRef.current) return;
    if (hasUnsavedChanges || pensionConfigurationState === 'incomplete') setIsConfigOpen(true);
  }, [hasUnsavedChanges, pensionConfigurationState]);

  if (isLoadingSettings || isLoadingAssets || isLoadingAnnualExpenses) {
    return <FireCalculatorSkeleton />;
  }

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      <CoastFireHero
        verdict={verdict}
        baseScenario={baseScenario}
        currentNetWorth={currentNetWorth}
        liquidNetWorth={liquidNetWorth}
        liquidProgress={liquidProgressBase}
        retirementAge={retirementAge}
        basisParts={basisParts}
      />

      <CoastInflowTimeline events={inflowEvents} />

      <CoastFireConfigSection
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        userAge={draft.userAge}
        onUserAgeChange={draft.setUserAge}
        retirementAge={draft.retirementAge}
        onRetirementAgeChange={draft.setRetirementAge}
        useCustomExpenses={draft.useCustomExpenses}
        onUseCustomExpensesChange={draft.setUseCustomExpenses}
        customExpenses={draft.customExpenses}
        onCustomExpensesChange={draft.setCustomExpenses}
        pensions={draft.pensions}
        onAddPension={draft.addPension}
        onUpdatePension={draft.updatePension}
        onRemovePension={draft.removePension}
        taxBrackets={draft.taxBrackets}
        onAddTaxBracket={draft.addTaxBracket}
        onUpdateTaxBracket={draft.updateTaxBracket}
        onRemoveTaxBracket={draft.removeTaxBracket}
        pensionIssues={draft.pensionIssues}
        pensionConfigurationState={pensionConfigurationState}
        ageLabel={currentAge !== null ? formatAgeYears(currentAge) : 'Da impostare'}
        retirementAgeLabel={retirementAge !== null ? formatAgeYears(retirementAge) : 'Da impostare'}
        effectiveAnnualExpenses={effectiveAnnualExpenses}
        detectedAnnualExpenses={annualExpenses}
        withdrawalRate={withdrawalRate}
        includePrimaryResidence={includePrimaryResidence}
        liquidNetWorth={liquidNetWorth}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={draft.isSaving}
        isDemo={isDemo}
        onSave={draft.save}
        onReset={draft.resetToSaved}
      />

      {coastProjection && baseScenario ? (
        <>
          <CoastScenarioCards
            scenarios={coastProjection.scenarios}
            liquidNetWorth={liquidNetWorth}
          />

          <CoastFireProjectionSection
            projectionData={coastProjection.projectionData}
            baseScenario={baseScenario}
            sortedPensionBreakdown={sortedPensionBreakdown}
            coverageSteps={coverageSteps}
            interpretation={interpretation}
            effectiveAnnualExpenses={effectiveAnnualExpenses ?? 0}
            bridgeYears={bridgeYears}
            pensionUnlockCalendarYear={pensionUnlockCalendarYear}
          />
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {incompleteReason ??
                'Completa la configurazione qui sopra per vedere scenari e proiezione.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
