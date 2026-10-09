'use client';

/**
 * FIRE › COAST FIRE — a verdict over tiles (2026-08-25)
 *
 * The tab answers «posso smettere di versare?» before it shows a number: a rule-generated
 * verdict (`buildCoastVerdict` in lib/utils/coastFireView.ts) names the gap to the Coast number
 * of today, what the free capital becomes at the target age against what is required, the year
 * the CURRENT savings pace gets there (2026-09-23: «non ancora» had no «quando») and — with the
 * bridge model on — the locked fund, over a 12-column grid of tiles that each answer one
 * question with a reading line above their figures.
 *
 *   Desktop (12 col): Traguardo(5, 2 rows) | Afflussi(7)
 *                                          | Scenari(7)
 *   Without any inflow (§ 17 RCO7–RCO8) the Afflussi tile is not drawn: Traguardo(5) | Scenari(7).
 *   Mobile (1 col):   Traguardo → Afflussi → Scenari
 *
 * Below the grid, two disclosures: «Ipotesi» (the form — ages, expenses, state pensions, IRPEF
 * brackets — config-first: open only while no age is saved, reopening on an unsaved edit or an
 * incomplete pension) and «Dettaglio» (coverage phases, target vs steady state, the pensions'
 * impact, how to read it).
 *
 * The page has NO period axis — a Coast plan is read today — and no control of its own: the
 * pension-lock switch is «Il mio piano»'s (the block above the tabs) and governs the WHOLE FIRE page.
 *
 * This file is the ORCHESTRATOR: the four queries, the projection, and the summaries the tiles
 * read. The inputs (ages, pensions) are «Il mio piano»'s — read through `useFireSettings`, the saved
 * ones with the plan's unsaved edits over them; the numbers and the words in
 * `lib/utils/coastFireView.ts`, the math in `fireService` — where it already was, unchanged.
 * The tab computes nothing: a figure that cannot be pointed at inside a `CoastFIREScenarioMetrics`
 * (or the lock state, or the savings pace built on the projection's own series) does not belong
 * here.
 *
 * The state-pension inputs are intentionally scoped to Coast FIRE only: they affect the
 * retirement-phase portfolio need, not the classic FIRE tab.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useFirePlan } from '@/lib/hooks/useFirePlan';
import { DEFAULT_FIRE_TARGET_AGE } from '@/lib/utils/firePlan';
import {
  calculateCoastFIREProjection,
  getAnnualCashflowData,
  getDefaultScenarios,
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
  type FireFlowsInput,
  type PensionCapitalInflowToday,
} from '@/lib/services/fireService';
import { useFireDatedFlows } from '@/lib/hooks/useFireDatedFlows';
import { buildFlowSchedule } from '@/lib/utils/datedFlows';
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { summarizeLock } from '@/lib/utils/fireSummary';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import {
  buildBaseScenarioInterpretation,
  buildCoastCoverageSteps,
  buildCoastInflowEvents,
  buildCoastVerdict,
  COAST_INFLOWS_FOOTER,
  COAST_INFLOWS_METHOD,
  COAST_SCENARIOS_FOOTER,
  COAST_SCENARIOS_METHOD,
  describeCoastDettaglio,
  describeCoastEmptyTiles,
  describeCoastInflows,
  describeCoastScenarios,
  describeCoastRegimeMethod,
  describeCoastTarget,
  describeCoastTargetCaption,
  describeCoastTargetFooter,
  describeCoverage,
  describePensionImpact,
  describeTargetAndSteadyState,
  isValidAge,
  resolveCoastBridgeYears,
  resolveCoastEmptyKind,
  resolveCoastIncompleteReason,
  resolveCoastPace,
  sortPensionBreakdown,
  summarizeCoastPensions,
  summarizeCoastScenarios,
  summarizeCoastTarget,
} from '@/lib/utils/coastFireView';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { withFlowsDetail } from '@/lib/utils/fireAssumptionsNarrative';
import { FireAssumptionsRow } from '@/components/fire-simulations/FireAssumptionsRow';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { EmptyState } from '@/components/ui/empty-state';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { CoastTraguardoTile } from './coast/tiles/CoastTraguardoTile';
import { AfflussiTile } from './coast/tiles/AfflussiTile';
import { CoastScenariTile } from './coast/tiles/CoastScenariTile';
import { CoastDettaglio } from './coast/CoastDettaglio';
import { depletionCause, findDepletion } from '@/lib/utils/fireDepletion';
import { CoastFireProjectionChart } from './CoastFireProjectionChart';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
/** Three cells: the loading state does not know yet whether the Afflussi tile will exist. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 12 },
  { span: 7, lines: 5 },
  { span: 7, lines: 4 },
];

/** The three cells of the grid: one class per tile, shared by the data and the empty branches. */
const GRID_CLASS = 'grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12';
/* Tablet (768-1439): every tile full width, in the phone's order. */
const TRAGUARDO_CELL = cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2');
const AFFLUSSI_CELL = cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-7');
const SCENARI_CELL = cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-7');
/* Without the Afflussi tile the Traguardo is one row tall and the Scenari sits beside it. */
const TRAGUARDO_ALONE_CELL = cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5');

/** The one action of the empty state: a link (or a button) the size of a touch target, in the tile's own ink. */
const EMPTY_ACTION_CLASS =
  'inline-flex min-h-8 items-center text-[13px] text-foreground underline underline-offset-2 hover:decoration-2 [@media(pointer:coarse)]:min-h-11';

export function CoastFireTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const plan = useFirePlan();

  // ─── Queries ─────────────────────────────────────────────────────────────────
  // The saved settings with the plan's draft over them (RP3): «Il mio piano» is previewed here.
  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useFireSettings();

  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  // The Calcolatore's savings — the SAME query key, so the two tabs read one figure — is the
  // pace the verdict names. It rejects on a failed read (never a zeroed payload), so the
  // failure reaches the notice below like the other three.
  const { data: cashflowData, isLoading: isLoadingCashflow, isError: cashflowError } = useQuery({
    queryKey: ['annualCashflowData', ownerId],
    queryFn: () => getAnnualCashflowData(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  // The page's inputs: «Il mio piano»'s ages and pensions, as saved or as previewed (RP3). An age that is not valid stops the projection.
  const typedAge = settings?.userAge;
  const currentAge = isValidAge(typedAge ?? null) ? (typedAge as number) : null;
  const typedRetirementAge = settings?.coastFireRetirementAge ?? DEFAULT_FIRE_TARGET_AGE;
  const retirementAge = isValidAge(typedRetirementAge) ? typedRetirementAge : null;
  const previewPensions = useMemo(() => normalizeCoastFirePensions(settings?.coastFirePensions), [settings?.coastFirePensions]);
  // The IRPEF brackets are a rule of law, edited in Impostazioni › Simulazioni (RP8): always the saved ones.
  const previewTaxBrackets = useMemo(() => normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets), [settings?.coastFireTaxBrackets]);

  const withdrawalRate = settings?.withdrawalRate ?? 4.0;

  // ─── Pension lock (the Calcolatore's switch governs the whole page) ──────────
  // When on, locked pension funds leave the Coast starting capital and re-enter the walk as
  // capital inflows at their unlock year, at TODAY's value.
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
      calculateAssetValue,
    );
  }, [respectPensionLockIn, assets, currentAge, settings?.userAge, settings?.pensionInpsRetirementAge, settings?.pensionRitaLongUnemployment]);

  // The page's hypotheses (doc/fire-ipotesi/README.md): the scenarios are the target portfolio's rates on the
  // per-class assumptions of Impostazioni › Simulazioni, read through ONE hook in every tab.
  const assumptionLockedIds = useMemo(() => new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [pensionLockState]);
  const { assumptions } = useFireAssumptions(assumptionLockedIds, { withCashflow: true });
  const scenarios = useMemo(() => assumptions?.scenarios ?? getDefaultScenarios(), [assumptions]);
  // RP5 (D4) and RP6 (D5): the capital `K` and the plan's expenses are the page's, not this tab's.
  const capital = assumptions?.capital ?? null;
  const liquidNetWorth = capital?.liquid ?? 0;
  const pensionInflowsToday = useMemo<PensionCapitalInflowToday[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ yearsFromNow: inflow.yearsFromNow, amountToday: inflow.amount })),
    [pensionLockState],
  );
  const currentNetWorth = capital?.total ?? 0;

  // The tax on withdrawals (2026-09-24), read on the same capital the number runs on — `K` — so the
  // Coast number and the Calcolatore's agree.
  const taxProfile = capital?.taxProfile ?? null;
  const withdrawalTax = useMemo(() => (taxProfile ? { basisToday: taxProfile.basisToday, rate: taxProfile.rate } : undefined), [taxProfile]);

  const effectiveAnnualExpenses = assumptions?.expenses?.annual;

  // § 12 (RF9): the dated flows SAVED in the Calcolatore's Parametri. Before the target age only the lumps count (D-F11); the
  // requirement at the target age is RF5 with the FIRE-anchored flows starting there.
  const { resolved: resolvedFlows, excluded: excludedFlows } = useFireDatedFlows({ lockedAssetIds: assumptionLockedIds });
  const flowsInput = useMemo<FireFlowsInput | undefined>(
    () => (resolvedFlows.length > 0 ? { resolved: resolvedFlows, planExpensesFromCashflow: (assumptions?.expenses?.origin ?? 'cashflow') === 'cashflow' } : undefined),
    [resolvedFlows, assumptions?.expenses?.origin],
  );
  const flowAssumptions = useMemo(() => (assumptions ? withFlowsDetail(assumptions, resolvedFlows, excludedFlows) : null), [assumptions, resolvedFlows, excludedFlows]);

  // ─── The projection (fireService, unchanged) ─────────────────────────────────
  const coastProjection = useMemo(() => {
    if (currentAge === null || retirementAge === null || effectiveAnnualExpenses === undefined || effectiveAnnualExpenses <= 0 || withdrawalRate <= 0 || currentNetWorth <= 0) {
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
      pensionInflowsToday,
      withdrawalTax,
      flowsInput,
    );
  }, [effectiveAnnualExpenses, currentAge, currentNetWorth, pensionInflowsToday, previewPensions, previewTaxBrackets, retirementAge, scenarios, withdrawalRate, withdrawalTax, flowsInput]);

  // ─── The numbers (pure layer over the projection) ────────────────────────────
  const currentYear = getItalyYear();
  const baseScenario = coastProjection?.scenarios.base ?? null;
  const resolvedRetirementAge = coastProjection?.retirementAge ?? retirementAge ?? 0;
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);
  const isBridge = pensionInflowsToday.length > 0;

  // § 21 RE1–RE2: when the chart's Base series runs out, and the lump that does it.
  const depletion = useMemo(() => {
    const year = coastProjection ? findDepletion(coastProjection.projectionData, 'basePortfolioValue', coastProjection.projectionData[0]?.basePortfolioValue) : null;
    return { year, cause: year === null ? null : depletionCause(resolvedFlows, year, currentYear) };
  }, [coastProjection, resolvedFlows, currentYear]);
  const target = useMemo(
    () =>
      baseScenario && currentAge !== null
        ? summarizeCoastTarget(baseScenario, { currentNetWorth, liquidNetWorth, currentAge, retirementAge: resolvedRetirementAge, isBridge, currentYear, withdrawalRate, hasDatedFlows: resolvedFlows.length > 0, depletion })
        : null,
    [baseScenario, currentNetWorth, liquidNetWorth, currentAge, resolvedRetirementAge, isBridge, currentYear, withdrawalRate, resolvedFlows.length, depletion],
  );
  const annualSavings = cashflowData?.annualSavings;
  const pace = useMemo(
    () => {
      if (!coastProjection || !baseScenario || !target) return null;
      const baseInflation = scenarios.base.inflationRate;
      const schedule = flowsInput ? buildFlowSchedule(flowsInput.resolved, { inflationRate: baseInflation, planExpensesFromCashflow: flowsInput.planExpensesFromCashflow }) : undefined;
      const savingsDeltaReal = schedule ? (year: number) => schedule.savingsDelta(year) / Math.pow(1 + baseInflation / 100, year) : undefined;
      return resolveCoastPace(coastProjection.projectionData, annualSavings, baseScenario.realReturnRate, target.reached, savingsDeltaReal);
    },
    [coastProjection, baseScenario, target, annualSavings, flowsInput, scenarios.base.inflationRate],
  );
  const pensions = useMemo(
    () => (baseScenario ? summarizeCoastPensions(baseScenario, currentYear) : { count: 0, entries: [], annualNetReal: 0, monthlyNetReal: 0, annualNetRealAtRetirement: 0 }),
    [baseScenario, currentYear],
  );
  const scenarioRows = useMemo(() => (coastProjection ? summarizeCoastScenarios(coastProjection.scenarios, scenarios, currentNetWorth) : []), [coastProjection, scenarios, currentNetWorth]);
  const bridgeYears = baseScenario ? resolveCoastBridgeYears(baseScenario, resolvedRetirementAge) : 0;
  const sortedPensionBreakdown = useMemo(() => (baseScenario ? sortPensionBreakdown(baseScenario.pensionBreakdown) : []), [baseScenario]);
  const inflowEvents = useMemo(
    () =>
      buildCoastInflowEvents(
        sortedPensionBreakdown,
        pensionInflowsToday,
        currentYear,
        currentAge,
        coastProjection && resolvedFlows.length > 0
          ? { resolved: resolvedFlows, inflationRate: scenarios.base.inflationRate, retirementYears: Math.round(coastProjection.scenarios.base.yearsToRetirement), retirementAge: resolvedRetirementAge }
          : undefined,
      ),
    [sortedPensionBreakdown, pensionInflowsToday, currentYear, currentAge, coastProjection, resolvedFlows, scenarios.base.inflationRate, resolvedRetirementAge],
  );
  const emptyKind = resolveCoastEmptyKind(currentNetWorth, effectiveAnnualExpenses, currentAge, retirementAge);
  const incompleteReason = resolveCoastIncompleteReason(currentNetWorth, effectiveAnnualExpenses, currentAge, retirementAge);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const verdict = useMemo(() => buildCoastVerdict({ target, incompleteReason, pace, lock }), [target, incompleteReason, pace, lock]);
  // ─── Loading ─────────────────────────────────────────────────────────────────
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  const isLoading = isLoadingSettings || isLoadingAssets || isLoadingCashflow;
  if (resolveSurfaceState({ loading: isLoading, failed: settingsError || assetsError || cashflowError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio, ipotesi, spese annue e risparmio non sono stati letti: senza di essi non si sa se puoi smettere di versare.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoading) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  // ─── Nothing recorded: the grid stays, every tile keeps its question ──────────
  // The Absence-Has-Three-Names Rule: the eyebrow must stay visible precisely when the tile
  // cannot answer, and the ONE action belongs to the tile that owns the missing thing (the
  // Traguardo) — a page for the patrimonio, the Ipotesi field for what the form owns. Until
  // 2026-09-23 this state dropped the three tiles and linked nowhere.
  if (!coastProjection || !baseScenario || !target) {
    const empty = describeCoastEmptyTiles(emptyKind ?? 'no-net-worth');
    const emptyAction = empty.action;
    const action =
      'href' in emptyAction ? (
        <Link href={emptyAction.href} className={EMPTY_ACTION_CLASS}>
          {emptyAction.label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => plan?.focusField(emptyAction.piano)}
          className={EMPTY_ACTION_CLASS}
        >
          {emptyAction.label}
        </button>
      );
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <FireAssumptionsRow assumptions={flowAssumptions} />
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul Coast FIRE" />
        </div>
        <div className={GRID_CLASS}>
          <div className={TRAGUARDO_CELL}>
            <Tile eyebrow="Traguardo" ariaLabel="Traguardo Coast FIRE">
              <EmptyState className="mt-2" message={empty.traguardo} action={action} />
            </Tile>
          </div>
          <div className={AFFLUSSI_CELL}>
            <Tile eyebrow="Afflussi" ariaLabel="Afflussi già considerati">
              <EmptyState className="mt-2" message={empty.afflussi} />
            </Tile>
          </div>
          <div className={SCENARI_CELL}>
            <Tile eyebrow="Scenari" ariaLabel="Scenari Coast FIRE">
              <EmptyState className="mt-2" message={empty.scenari} />
            </Tile>
          </div>
        </div>
      </div>
    );
  }

  // §17 RCO7: no event at all (pensions, fund, dated flows) = no tile; its one line moves to the Traguardo's footer.
  const hasInflows = inflowEvents.length > 0;
  const lastPoint = coastProjection.projectionData[coastProjection.projectionData.length - 1];

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <FireAssumptionsRow assumptions={flowAssumptions} />
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul Coast FIRE" />
      </div>

      <div className={GRID_CLASS}>
        <div className={hasInflows ? TRAGUARDO_CELL : TRAGUARDO_ALONE_CELL}>
          <CoastTraguardoTile
            stagesMethod={describeCoastRegimeMethod(target)}
            reading={describeCoastTarget(target)}
            target={target}
            caption={describeCoastTargetCaption(target)}
            chart={
              <CoastFireProjectionChart
                projectionData={coastProjection.projectionData}
                height="100%"
                marginLeft={0}
                pensionUnlockCalendarYear={lock.unlockCalendarYear}
                pace={pace}
              />
            }
            footer={describeCoastTargetFooter({
              retirementAge: resolvedRetirementAge,
              requiredNet: baseScenario.retirementCapitalRequired,
              lastTargetOnPlot: lastPoint?.fireNumberTarget ?? baseScenario.retirementCapitalRequired,
              lock,
              lastProjectedYear: lastPoint?.calendarYear ?? currentYear,
              pace,
              noInflows: !hasInflows,
            })}
          />
        </div>

        {hasInflows && (
          <div className={AFFLUSSI_CELL}>
            <AfflussiTile
              reading={describeCoastInflows(inflowEvents, pensions, resolvedRetirementAge)}
              events={inflowEvents}
              footer={COAST_INFLOWS_FOOTER}
              method={COAST_INFLOWS_METHOD}
            />
          </div>
        )}

        <div className={SCENARI_CELL}>
          <CoastScenariTile reading={describeCoastScenarios(scenarioRows)} rows={scenarioRows} footer={COAST_SCENARIOS_FOOTER} method={COAST_SCENARIOS_METHOD} />
        </div>
      </div>

      <CoastDettaglio
        description={describeCoastDettaglio({ bridgeYears, pensionCount: pensions.count })}
        base={baseScenario}
        sortedPensionBreakdown={sortedPensionBreakdown}
        coverageSteps={buildCoastCoverageSteps(baseScenario, sortedPensionBreakdown, resolvedRetirementAge, bridgeYears)}
        coverageReading={describeCoverage(baseScenario, pensions, resolvedRetirementAge, bridgeYears)}
        targetReading={describeTargetAndSteadyState(baseScenario, resolvedRetirementAge, bridgeYears, withdrawalRate, isBridge)}
        impactReading={describePensionImpact(pensions)}
        interpretation={buildBaseScenarioInterpretation(baseScenario, effectiveAnnualExpenses, bridgeYears, resolvedRetirementAge)}
        annualExpenses={effectiveAnnualExpenses ?? 0}
        bridgeYears={bridgeYears}
        retirementAge={resolvedRetirementAge}
      />
    </div>
  );
}
