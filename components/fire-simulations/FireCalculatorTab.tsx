'use client';

/**
 * FIRE › CALCOLATORE — a verdict over tiles (2026-08-25)
 *
 * The tab answers «quando?» before it shows a number: a rule-generated verdict
 * (lib/utils/fireNarrative.ts) names the year and the age of the base scenario, the gap to the
 * FIRE number, the pace and — in both moneys — the passive income the plan lands on, over a
 * 12-column grid of tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Traguardo(5, 2 rows) | Base di calcolo(7: rows beside the lock)
 *                                           | Reddito passivo(4) | Scenari(3)
 *   Mobile (1 col):   Traguardo → Scenari → Reddito passivo → Base di calcolo
 *
 * A tile shares a row only with tiles of its own height (AGENTS.md → Hierarchy). Base di calcolo
 * took two rows until 2026-09-22 and ended 190px above its own footer (measured); putting it at
 * 3 columns beside Reddito passivo moved the void into Reddito (173px, measured the same day).
 * Base is the tallest tile, so it takes the first row ALONE, wide enough to set its rows beside
 * the rows; Reddito passivo and Scenari are within 30px of each other and share the second.
 * The Traguardo's chart is the one element that can be any height, and it takes the slack.
 *
 * Below the grid, one disclosure: «Dettaglio» (the historical runway, the cashflow history, the
 * explainer). The settings the tab runs on are NOT here since 2026-10-05: they are «Il mio piano», the
 * block above the tabs (doc/fire-ipotesi/README.md § 15), and this tab reads them like the other five —
 * the saved ones with the plan's unsaved edits laid over them (`useFireSettings`).
 *
 * The page has NO period axis — a FIRE plan is read today, on the last full year's cashflow. The tab
 * has no live control of its own: the pension-lock switch is in «Il mio piano» too, and the Base di
 * calcolo tile only reads what it does. The Scenari | Ventaglio switch in the Traguardo's aside is
 * that tile's scope, not an axis.
 *
 * Data flow (unchanged from the previous IA — presentation over the same pure functions):
 * 1. settings + assets + annualCashflowData queries (independent, staleTime 5min);
 * 2. fireData query (depends on assets + the SAVED rate — gated by `enabled`);
 * 3. the metrics, the deterministic projection and the fan inputs derived client-side via
 *    useMemo, so preview edits (SWR, RITA controls, scenario params) are instant.
 *
 * No component computes a figure or writes a sentence: numbers come from
 * lib/utils/fireSummary.ts (over fireService / pensionUnlock / monteCarloService), words from
 * lib/utils/fireNarrative.ts. A reached target is a sentence («Sei già FIRE.», with the
 * allowance against the expenses), not a burst: the one-shot confetti inherited from the old
 * FireReachedBanner went on 2026-09-22 — the product reports, it does not cheer (DESIGN.md →
 * Celebration Badge), and its five hexes were the tab's only colours outside the theme.
 */

import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { resolveGainShare } from '@/lib/utils/withdrawalTax';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { DEFAULT_INPS_RETIREMENT_AGE, resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import {
  calculateCoastFireNetRealAnnualPension,
  calculateFIREMetrics,
  calculateFIREProjection,
  getAnnualCashflowData,
  getDefaultScenarios,
  getFIREData,
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
  prepareRunwaySummaryLabel,
  resolveFanFireTargets,
  resolveFireRequirement,
  type FireFlowsInput,
  type FireHonestInputs,
  type FireProjectionPensionBridge,
} from '@/lib/services/fireService';
import { runAccumulationSimulation, type AccumulationSimulationParams } from '@/lib/services/monteCarloService';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { summarizeTargetAge, yearsToTargetAge, type FireWalk } from '@/lib/utils/fireTargetAge';
import { DEFAULT_FIRE_TARGET_AGE } from '@/lib/utils/firePlan';
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { resolveLeverCap, solveSavingsForTail, summarizeFireYearDistribution, summarizeRetirementSurvival } from '@/lib/utils/fireDistribution';
import {
  formatAllocationLabel,
  resolveFanVerdict,
  summarizeLock,
  summarizePassiveIncome,
  summarizeScenarios,
  summarizeTarget,
  summarizeTimeline,
  type FireTargetHonest,
} from '@/lib/utils/fireSummary';
import Link from 'next/link';
import {
  buildFireVerdict,
  describeBase,
  describeBaseAside,
  describeBaseFooter,
  describeDettaglio,
  describeEmptyTiles,
  describeFireDistributionMethod,
  describeFireYearDistribution,
  describeLock,
  describePassiveIncome,
  describeRetirementSurvival,
  describeRunway,
  describeScenarios,
  describeScenariosFooter,
  describeTailLever,
  describeTargetAge,
  describeTargetAgeMethod,
  describeTarget,
  describeTargetCaption,
  describeTargetFooter,
  type FireBase,
  type ProjectionView,
} from '@/lib/utils/fireNarrative';
import type { FIREProjectionScenarios } from '@/types/assets';
import { useFireDatedFlows } from '@/lib/hooks/useFireDatedFlows';
import { buildFlowSchedule, lumpMarkersOf } from '@/lib/utils/datedFlows';
import type { FlowsEffect } from '@/lib/utils/datedFlowsNarrative';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { FireAssumptionsRow } from '@/components/fire-simulations/FireAssumptionsRow';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { resolvePlanExpenses, type FireAssumptions } from '@/lib/utils/fireAssumptions';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { EmptyState } from '@/components/ui/empty-state';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { TraguardoTile } from '@/components/fire-simulations/tiles/TraguardoTile';
import { BaseDiCalcoloTile } from '@/components/fire-simulations/tiles/BaseDiCalcoloTile';
import { RedditoPassivoTile } from '@/components/fire-simulations/tiles/RedditoPassivoTile';
import { ScenariTile } from '@/components/fire-simulations/tiles/ScenariTile';
import { EtaObiettivoTile } from '@/components/fire-simulations/tiles/EtaObiettivoTile';
import { FireDettaglio } from '@/components/fire-simulations/FireDettaglio';
import { FIREProjectionChart } from '@/components/fire-simulations/FIREProjectionChart';
import { FireFanChart } from '@/components/fire-simulations/FireFanChart';
import { FireYearDistributionView } from '@/components/fire-simulations/FireYearDistributionView';

/** How many Monte Carlo paths the Ventaglio runs — plenty for stable deciles, cheap on mobile. */
const FAN_SIMULATION_COUNT = 1000;
/** Fan horizon cap: the deterministic projection's years, at most 40. */
const FAN_MAX_YEARS = 40;
/** The deterministic projection's horizon. */
const PROJECTION_HORIZON_YEARS = 50;
/**
 * The fan's seed («FIRE» in ASCII), fixed on purpose: the same base gives the same thousand
 * paths at every opening, and every lever comparison re-runs on the same shocks
 * (`lib/utils/seededRandom.ts`). The Monte Carlo tab stays unseeded — its «Esegui» is a new draw.
 */
const FAN_SEED = 0x46495245;
/** The retirement ledger runs to this age when the age is known… */
const RETIREMENT_HORIZON_AGE = 90;
/** …and this many years from today when it is not (said in the survival sentence: no age, no «a 90 anni»). */
const RETIREMENT_HORIZON_FALLBACK_YEARS = 50;
/** No ledger runs past this: a 20-year-old's «90 anni» is 70 years of draws per path. */
const RETIREMENT_HORIZON_MAX_YEARS = 70;

/** The fan's inputs minus the horizon, which is derived from the deterministic projection. */
type FanSimulationInputs = Omit<AccumulationSimulationParams, 'years'>;

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 12 },
  { span: 7, lines: 5 },
  { span: 4, lines: 5 },
  { span: 3, lines: 4 },
  { span: 12, lines: 4 },
];

/** The five cells of the grid: one class per tile, shared by the data and the empty branches. */
const GRID_CLASS = 'grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12';
const TRAGUARDO_CELL = cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2');
const BASE_CELL = cn(TILE_CELL_CLASS, 'order-5 tablet:order-4 tablet:col-span-2 desktop:order-none desktop:col-span-7');
const REDDITO_CELL = cn(TILE_CELL_CLASS, 'order-4 tablet:order-3 desktop:order-none desktop:col-span-4');
const SCENARI_CELL = cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-3');
// E1: the third row. A phone reads it after the scenarios; a tablet keeps Reddito beside Scenari and puts it last.
const ETA_CELL = cn(TILE_CELL_CLASS, 'order-3 tablet:order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12');

/** The one action of the empty state: a link the size of a touch target, in the tile's own ink. */
const EMPTY_ACTION_CLASS =
  'inline-flex min-h-8 items-center text-[13px] text-foreground underline underline-offset-2 hover:decoration-2 [@media(pointer:coarse)]:min-h-11';

function roundRunwayYears(value: number): number {
  return Math.round(value * 10) / 10;
}

function calculateDisplayedRunwayDelta(latestValue: number | null | undefined, comparisonValue: number | null | undefined): number | null {
  if (latestValue == null || comparisonValue == null) return null;
  return roundRunwayYears(roundRunwayYears(latestValue) - roundRunwayYears(comparisonValue));
}

export function FireCalculatorTab({ onOpenCoast }: { onOpenCoast?: () => void } = {}) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

  const [view, setView] = useState<ProjectionView>('scenari');

  // ─── Queries ─────────────────────────────────────────────────────────────────
  // The saved settings with the plan's draft over them (RP3): «Il mio piano» is previewed here, and every figure below
  // reads the same plan the other five tabs do. `saved` is the stored document, for the one query that must not refetch while typing.
  const { data: settings, saved: savedSettings, isLoading: isLoadingSettings, isError: settingsError } = useFireSettings();

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
  const annualSavings = cashflowData?.annualSavings ?? 0;

  const previewWithdrawalRate = settings?.withdrawalRate ?? 4.0;
  // The saved rate keys the history query: typing in the plan must not refetch it.
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
  // rates on the per-class assumptions of Impostazioni › Simulazioni — never typed here. While the
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
    () => (savedAssumptions ? { ...savedAssumptions, expenses: expenses ?? undefined, datedFlowsCount: resolvedFlows.length } : null),
    [savedAssumptions, expenses, resolvedFlows.length],
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
  const includePrimaryResidence = settings?.includePrimaryResidenceInFIRE ?? false;
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

  // `keepPreviousData`: the key moves with every lock flip and residence switch (currentNetWorth),
  // and without it the whole tab fell back to the skeleton mid-interaction — the pressed switch
  // unmounted, the Dettaglio closed, every figure counted up from zero.
  const { data: fireData, isLoading: isLoadingFIRE } = useQuery({
    queryKey: ['fireData', ownerId, currentNetWorth, withdrawalRate, includePrimaryResidence],
    queryFn: () => getFIREData(ownerId!, currentNetWorth, withdrawalRate, includePrimaryResidence),
    enabled: !!user && !!assets && currentNetWorth > 0,
    staleTime: 300000,
    placeholderData: keepPreviousData,
  });
  const chartData = useMemo(() => fireData?.chartData ?? [], [fireData]);
  const rawRunwayData = useMemo(() => fireData?.runwayData ?? [], [fireData]);

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
    return { withBridge: resolveFireRequirement({ ...shared, bridge }), withoutBridge: resolveFireRequirement(shared) };
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
  // D-F12: the same walk with the list empty — the Base di calcolo says how far the flows move the FIRE year.
  const flowsEffect = useMemo<FlowsEffect>(() => {
    const yearOf = (years: number | null | undefined): number | null => (years === null || years === undefined ? null : currentYearForFan + years);
    const without =
      flowsInput && currentNetWorth > 0 && projectionAnnualExpenses > 0 && previewWithdrawalRate > 0
        ? calculateFIREProjection(currentNetWorth, projectionAnnualExpenses, annualSavings, previewWithdrawalRate, scenarios, PROJECTION_HORIZON_YEARS, projectionBridge, honest, true).baseYearsToFIRE
        : null;
    return { count: resolvedFlows.length, excluded: excludedFlows, yearWithout: yearOf(without), yearWith: yearOf(projection?.baseYearsToFIRE) };
  }, [flowsInput, resolvedFlows.length, excludedFlows, currentNetWorth, projectionAnnualExpenses, annualSavings, previewWithdrawalRate, scenarios, projectionBridge, honest, projection, currentYearForFan]);
  const lumpMarkers = useMemo(() => lumpMarkersOf(resolvedFlows, currentYearForFan), [resolvedFlows, currentYearForFan]);

  // Fan (Ventaglio) inputs: the weights and the Base market of the page's assumptions (the Monte
  // Carlo tab's too), expenses inflated with the SAME base-scenario inflation as the deterministic
  // target line. Inflows at TODAY's value, per the MC convention (doc/guide/fire.md § FIRE, What If and Goals).
  const pensionCapitalInflows = useMemo(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ year: inflow.yearsFromNow, amount: inflow.amount })),
    [pensionLockState],
  );
  // The market and the capital are the page's own reading (`assumptions`), the Monte Carlo tab's too: no copy here.
  const monteCarloMarket = assumptions?.market ?? null;
  const fanInputs = useMemo<FanSimulationInputs | null>(() => {
    if (!assets || assets.length === 0 || !capital || !assumptions || !monteCarloMarket) return null;
    if (currentNetWorth <= 0 || projectionAnnualExpenses <= 0 || previewWithdrawalRate <= 0) return null;
    // D1: the fan simulates the TARGET portfolio (else the one held, else 60/40), the page's one reading of the weights.
    const weights = assumptions?.weights;
    if (!weights) return null;
    return {
      // Rule RK: the fan starts from `K` — the capital of every tab (D4).
      initialPortfolio: capital.total,
      annualSavings,
      savingsInflationRate: scenarios.base.inflationRate,
      annualExpenses: projectionAnnualExpenses,
      withdrawalRate: previewWithdrawalRate,
      expenseInflationRate: scenarios.base.inflationRate,
      weights,
      market: monteCarloMarket.scenarios.base,
      correlations: monteCarloMarket.correlations,
      leverageSpread: monteCarloMarket.leverageSpread,
      // RC4: the fan takes the target portfolio's costs off every year, like the deterministic Base.
      annualCostRate: assumptions.cost?.total,
      numberOfSimulations: FAN_SIMULATION_COUNT,
      capitalInflows: pensionCapitalInflows.length > 0 ? pensionCapitalInflows : undefined,
      // RF7 (§ 12): the paths read the same flows the walk does — the accumulation's Δs and lumps, the retirement ledger's need from each path's own FIRE year.
      flows: flowsInput,
    } satisfies FanSimulationInputs;
  }, [assets, capital, assumptions, monteCarloMarket, currentNetWorth, projectionAnnualExpenses, annualSavings, previewWithdrawalRate, scenarios.base.inflationRate, pensionCapitalInflows, flowsInput]);

  // The fan only pays its CPU cost while one of its two views is open (Ventaglio, Distribuzione).
  // Keyed on the same inputs that change the deterministic projection, so an edited parameter
  // re-runs it immediately. Seeded: the same inputs give the same paths, and the lever below
  // re-runs on the same shocks. The retirement ledger runs to age 90 (or 50 years without an age).
  const fanYears = projection ? Math.min(projection.yearlyData.length, FAN_MAX_YEARS) : 0;
  const retirementHorizonYears = Math.min(
    RETIREMENT_HORIZON_MAX_YEARS,
    Math.max(fanYears, userAge !== undefined && Number.isFinite(userAge) ? Math.max(0, RETIREMENT_HORIZON_AGE - userAge) : RETIREMENT_HORIZON_FALLBACK_YEARS),
  );
  // The paths aim at the walk's own requirement, year by year (bridge, pensions and tax in),
  // never at a number the verdict does not name; and from their FIRE year they withdraw what the
  // walk assumed — the expenses less the pensions, tax on the sale.
  const fanFireTargets = useMemo(
    () => (projection && displayedFireMetrics ? resolveFanFireTargets(displayedFireMetrics.fireNumber, projection) : undefined),
    [projection, displayedFireMetrics],
  );
  const fanRetirement = useMemo(() => {
    const pensionsConsidered = honestSummary.pensionsConsidered && userAge !== undefined;
    const statePensions = pensionsConsidered
      ? honest.pensions.map((pension) => {
          const breakdown = calculateCoastFireNetRealAnnualPension(pension, userAge as number, scenarios.base.inflationRate, honest.taxBrackets, now);
          return { fromYear: Math.max(0, Math.ceil(breakdown.yearsUntilStart)), annualNetToday: breakdown.netAnnualRealAtStart };
        })
      : undefined;
    // The cost basis is already `K`'s own (`resolveFireCapital`), so the fan carries it as it is.
    return { statePensions, withdrawalTax: honest.withdrawalTax };
  }, [honestSummary.pensionsConsidered, honest, userAge, scenarios.base.inflationRate, now]);
  const runFan = useCallback(
    (inputs: FanSimulationInputs, annualSavings = inputs.annualSavings) =>
      runAccumulationSimulation({
        ...inputs,
        annualSavings,
        years: fanYears,
        retirementHorizonYears,
        fireTargets: fanFireTargets,
        retirement: fanRetirement,
        random: createSeededRandom(FAN_SEED),
      }),
    [fanYears, retirementHorizonYears, fanFireTargets, fanRetirement],
  );
  const fanResult = useMemo(() => (view === 'scenari' || !fanInputs || fanYears <= 0 ? null : runFan(fanInputs)), [view, fanInputs, fanYears, runFan]);

  // ─── The Distribuzione view: the FIRE year across the paths, the lever, the retirement ────
  const fireYearDistribution = useMemo(
    () => (view === 'distribuzione' && fanResult && projection ? summarizeFireYearDistribution(fanResult, currentYearForFan, projection.baseYearsToFIRE) : null),
    [view, fanResult, projection, currentYearForFan],
  );
  // The lever aims at the deterministic base year; with no base year (never within 50 years)
  // or a target already cleared today there is nothing to aim at, and the sentence is absent.
  const tailLever = useMemo(() => {
    if (!fireYearDistribution || !fanResult || !fanInputs || !projection) return null;
    const targetYears = projection.baseYearsToFIRE;
    if (targetYears === null || targetYears === 0) return null;
    return solveSavingsForTail({
      baseResult: fanResult,
      run: (annualSavings) => runFan(fanInputs, annualSavings),
      baseAnnualSavings: fanInputs.annualSavings,
      targetYears,
      extraCap: resolveLeverCap(fanInputs.annualSavings, fanInputs.annualExpenses),
    });
  }, [fireYearDistribution, fanResult, fanInputs, projection, runFan]);
  const retirementSurvival = useMemo(
    () => (fireYearDistribution && fanResult ? summarizeRetirementSurvival(fanResult, currentYearForFan, userAge) : null),
    [fireYearDistribution, fanResult, currentYearForFan, userAge],
  );

  // ─── Età obiettivo (E1) ──────────────────────────────────────────────────────
  // The age is PREVIEWED from the typed field until saved, like the SWR: a typed age that is not valid
  // (not above today's age, past 100) falls back to the saved one. RS7/RS9 re-walk the SAME deterministic
  // projection the verdict names, changing only the saving or the plan's expenses.
  const previewTargetAge = settings?.coastFireRetirementAge ?? DEFAULT_FIRE_TARGET_AGE;
  const fireWalk = useCallback<FireWalk>(
    (savings, planExpenses) =>
      calculateFIREProjection(currentNetWorth, planExpenses, savings, previewWithdrawalRate, scenarios, PROJECTION_HORIZON_YEARS, projectionBridge, honest, true, flowsInput).baseYearsToFIRE,
    [currentNetWorth, previewWithdrawalRate, scenarios, projectionBridge, honest, flowsInput],
  );
  // RS8: the Ventaglio's lever aimed at the target age. The fan only exists in its own views, so the base run is
  // made here when the Traguardo shows the scenarios; the target must lie within the fan's horizon. ~14 runs of the
  // fan (measured 2026-10-04: ≈0,4 s on the cloud container), so the whole summary is computed from a DEFERRED
  // request: an edit paints at once and the tile follows, the three figures always from one request.
  const targetAgeRequest = useMemo(
    () =>
      projection
        ? { projection, userAge, targetAge: previewTargetAge, currentYear: currentYearForFan, annualSavings, planExpenses: projectionAnnualExpenses, fireWalk, fanInputs, fanYears, fanResult, runFan }
        : null,
    [projection, userAge, previewTargetAge, currentYearForFan, annualSavings, projectionAnnualExpenses, fireWalk, fanInputs, fanYears, fanResult, runFan],
  );
  const deferredTargetAgeRequest = useDeferredValue(targetAgeRequest);
  const targetAgeSummary = useMemo(() => {
    const request = deferredTargetAgeRequest;
    if (!request) return null;
    const span = yearsToTargetAge(request.targetAge, request.userAge);
    const baseYearsToFire = request.projection.baseYearsToFIRE;
    const { fanInputs: inputs, fanResult: shownFan, runFan: run } = request;
    const tail =
      span.kind === 'years' && inputs && baseYearsToFire !== 0 && span.years <= request.fanYears
        ? solveSavingsForTail({
            baseResult: shownFan ?? run(inputs),
            run: (savings) => run(inputs, savings),
            baseAnnualSavings: inputs.annualSavings,
            targetYears: span.years,
            extraCap: resolveLeverCap(inputs.annualSavings, inputs.annualExpenses),
          })
        : null;
    return summarizeTargetAge({
      userAge: request.userAge,
      targetAge: request.targetAge,
      currentYear: request.currentYear,
      annualSavings: request.annualSavings,
      planExpenses: request.planExpenses,
      baseYearsToFire,
      walk: request.fireWalk,
      tail,
    });
  }, [deferredTargetAgeRequest]);

  const displayedRunwayData = useMemo(() => {
    const targetYearsOfExpenses = previewWithdrawalRate > 0 ? 100 / previewWithdrawalRate : null;
    return rawRunwayData.map((point) => ({
      ...point,
      targetYearsOfExpenses,
      fireProgressToFI:
        point.trailing12mExpenses > 0 && previewWithdrawalRate > 0
          ? (point.fireNetWorthUsed / (point.trailing12mExpenses / (previewWithdrawalRate / 100))) * 100
          : null,
    }));
  }, [previewWithdrawalRate, rawRunwayData]);

  const displayedRunwaySummary = useMemo(() => {
    const latestPoint = displayedRunwayData[displayedRunwayData.length - 1] ?? null;
    const comparisonPoint = latestPoint
      ? (displayedRunwayData.find((p) => p.year === latestPoint.year - 1 && p.month === latestPoint.month) ?? null)
      : null;
    return {
      currentMonthLabel: latestPoint?.monthLabel ?? null,
      currentYearsOfExpenses: latestPoint?.yearsOfExpenses ?? null,
      currentLiquidYearsOfExpenses: latestPoint?.liquidYearsOfExpenses ?? null,
      totalDeltaVs12Months: calculateDisplayedRunwayDelta(latestPoint?.yearsOfExpenses, comparisonPoint?.yearsOfExpenses),
      liquidDeltaVs12Months: calculateDisplayedRunwayDelta(latestPoint?.liquidYearsOfExpenses, comparisonPoint?.liquidYearsOfExpenses),
      currentProgressToFI: latestPoint?.fireProgressToFI ?? null,
      targetYearsOfExpenses: latestPoint?.targetYearsOfExpenses ?? (previewWithdrawalRate > 0 ? 100 / previewWithdrawalRate : null),
    };
  }, [displayedRunwayData, previewWithdrawalRate]);

  const currentYear = currentYearForFan;
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: previewInpsRetirementAge, pensionRitaLongUnemployment: ritaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);
  const target = useMemo(
    () => (displayedFireMetrics ? summarizeTarget(displayedFireMetrics, pensionBridge !== null, honestSummary, requirementToday?.withoutBridge.requirement) : null),
    [displayedFireMetrics, pensionBridge, honestSummary, requirementToday],
  );
  const timeline = useMemo(() => (projection ? summarizeTimeline(projection, currentYear, userAge, PROJECTION_HORIZON_YEARS) : null), [projection, currentYear, userAge]);
  const scenarioRows = useMemo(() => (projection ? summarizeScenarios(projection, currentYear) : []), [projection, currentYear]);
  const passiveIncome = useMemo(() => (displayedFireMetrics ? summarizePassiveIncome(displayedFireMetrics) : null), [displayedFireMetrics]);
  const fanVerdict = useMemo(
    () => (fanResult && projection ? resolveFanVerdict(fanResult, projection.baseYearsToFIRE, currentYear) : null),
    [fanResult, projection, currentYear],
  );
  const allocationLabel = fanInputs ? formatAllocationLabel(fanInputs.weights) : '';

  const base: FireBase | null = displayedFireMetrics
    ? {
        netWorth: currentNetWorth,
        annualExpenses: displayedFireMetrics.annualExpenses,
        monthlyExpenses: displayedFireMetrics.annualExpenses / 12,
        annualSavings,
        monthlySavings: annualSavings / 12,
        swr: previewWithdrawalRate,
        referenceYear: cashflowData?.referenceYear ?? null,
        isAnnualized: cashflowData?.isAnnualized ?? false,
        outsideCapital: capital?.outside ?? { realestate: 0, crypto: 0, cash: 0, otherExcluded: 0 },
        planExpensesOrigin: expenses?.origin ?? 'cashflow',
        honest: honestSummary,
        flows: flowsEffect,
      }
    : null;

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const verdict = useMemo(
    () =>
      buildFireVerdict({
        hasNetWorth: currentNetWorth > 0,
        target,
        timeline,
        monthlySavings: annualSavings / 12,
        swr: previewWithdrawalRate,
        monthlyAllowance: passiveIncome?.monthly ?? 0,
        lock,
        honest: honestSummary,
      }),
    [currentNetWorth, target, timeline, annualSavings, previewWithdrawalRate, passiveIncome, lock, honestSummary],
  );

  // ─── Loading ─────────────────────────────────────────────────────────────────
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingSettings || isLoadingAssets || isLoadingCashflow || (currentNetWorth > 0 && isLoadingFIRE), failed: settingsError || assetsError || cashflowError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio, ipotesi e cashflow non sono stati letti: senza di essi la data non è calcolabile.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoadingSettings || isLoadingAssets || isLoadingCashflow || (currentNetWorth > 0 && isLoadingFIRE)) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  const dettaglio = (
    <FireDettaglio
      description={describeDettaglio({
        runwayYears: displayedRunwaySummary.currentYearsOfExpenses,
        runwayDelta: displayedRunwaySummary.totalDeltaVs12Months,
      })}
      runwayData={displayedRunwayData}
      runwaySummary={displayedRunwaySummary}
      runwayReading={describeRunway({
        years: displayedRunwaySummary.currentYearsOfExpenses,
        liquidYears: displayedRunwaySummary.currentLiquidYearsOfExpenses,
        delta: displayedRunwaySummary.totalDeltaVs12Months,
        targetYears: displayedRunwaySummary.targetYearsOfExpenses,
        // «07/2026» is the snapshot's own label; the sentence needs «luglio 2026».
        monthLabel: displayedRunwaySummary.currentMonthLabel ? prepareRunwaySummaryLabel(displayedRunwaySummary.currentMonthLabel).toLowerCase() : null,
        pointCount: displayedRunwayData.length,
      })}
      chartData={chartData}
      simulationCount={FAN_SIMULATION_COUNT}
    />
  );

  // ─── Nothing recorded: the grid stays, every tile keeps its question ──────────
  // The Absence-Has-Three-Names Rule: the eyebrow must stay visible precisely when the tile
  // cannot answer, and the ONE action belongs to the tile that owns the missing thing (the
  // Traguardo). Reddito passivo still answers when a net worth exists and only the expenses are
  // missing — the allowance is the SWR of the net worth, and needs no expenses.
  if (!displayedFireMetrics || !target || !base || !passiveIncome) {
    const empty = describeEmptyTiles(currentNetWorth > 0 ? 'no-expenses' : 'no-net-worth');
    const action = (
      <Link href={empty.action.href} className={EMPTY_ACTION_CLASS}>
        {empty.action.label}
      </Link>
    );
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <FireAssumptionsRow assumptions={assumptions} />
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sul FIRE" />
        </div>
        <div className={GRID_CLASS}>
          <div className={TRAGUARDO_CELL}>
            <Tile eyebrow="Traguardo" ariaLabel="Traguardo FIRE">
              <EmptyState className="mt-2" message={empty.traguardo} action={action} />
            </Tile>
          </div>
          <div className={BASE_CELL}>
            <Tile eyebrow="Base di calcolo" ariaLabel="Base di calcolo del FIRE">
              <EmptyState className="mt-2" message={empty.base} />
            </Tile>
          </div>
          <div className={REDDITO_CELL}>
            {empty.passiveIncome === null && passiveIncome ? (
              <RedditoPassivoTile reading={describePassiveIncome(passiveIncome)} income={passiveIncome} />
            ) : (
              <Tile eyebrow="Reddito passivo" ariaLabel="Reddito passivo sostenibile">
                <EmptyState className="mt-2" message={empty.passiveIncome ?? empty.traguardo} />
              </Tile>
            )}
          </div>
          <div className={SCENARI_CELL}>
            <Tile eyebrow="Scenari" ariaLabel="Scenari di mercato">
              <EmptyState className="mt-2" message={empty.scenarios} />
            </Tile>
          </div>
          <div className={ETA_CELL}>
            <Tile eyebrow="Età obiettivo" ariaLabel="Età obiettivo">
              <EmptyState className="mt-2" message={empty.targetAge} />
            </Tile>
          </div>
        </div>
          {dettaglio}
      </div>
    );
  }

  // ─── The chart in the Traguardo, in the selected view ────────────────────────
  const fanAvailable = fanInputs !== null;
  const chart = !projection ? (
    <p className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
      Nessun dato per la proiezione: servono spese registrate nel Cashflow e un patrimonio FIRE positivo.
    </p>
  ) : view === 'scenari' || !fanAvailable ? (
    <FIREProjectionChart
      yearlyData={projection.yearlyData}
      bearYearsToFIRE={projection.bearYearsToFIRE}
      baseYearsToFIRE={projection.baseYearsToFIRE}
      bullYearsToFIRE={projection.bullYearsToFIRE}
      height="100%"
      marginLeft={0}
      pensionUnlockCalendarYear={pensionBridge ? currentYear + pensionUnlockYears : null}
      lumpMarkers={lumpMarkers}
    />
  ) : view === 'distribuzione' ? (
    fireYearDistribution ? (
      <FireYearDistributionView
        distribution={fireYearDistribution}
        reading={describeFireYearDistribution(fireYearDistribution)}
        lever={tailLever ? describeTailLever(tailLever, currentYear) : null}
        survival={retirementSurvival ? describeRetirementSurvival(retirementSurvival, honestSummary) : null}
      />
    ) : null
  ) : fanResult && fanVerdict ? (
    <FireFanChart result={fanResult} startCalendarYear={currentYear} verdict={fanVerdict} height="100%" />
  ) : null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <FireAssumptionsRow assumptions={assumptions} />
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul FIRE" />
      </div>

      {/* Tablet (768-1439): Traguardo full, Base di calcolo full, Reddito passivo beside Scenari. */}
      <div className={GRID_CLASS}>
        <div className={TRAGUARDO_CELL}>
          <TraguardoTile
            reading={describeTarget(target)}
            target={target}
            caption={describeTargetCaption(target, displayedFireMetrics.annualExpenses, previewWithdrawalRate)}
            view={view}
            onViewChange={setView}
            fanAvailable={fanAvailable && projection !== null}
            chart={chart}
            footer={
              projection
                ? describeTargetFooter({
                    view: fanAvailable ? view : 'scenari',
                    fan: fanVerdict,
                    distribution: fireYearDistribution,
                    fanAvailable,
                    lock,
                    simulationCount: FAN_SIMULATION_COUNT,
                    allocationLabel,
                    lastProjectedYear: projection.yearlyData[projection.yearlyData.length - 1]?.calendarYear ?? null,
                    honest: honestSummary,
                  })
                : null
            }
            method={view === 'distribuzione' && fireYearDistribution ? describeFireDistributionMethod(fireYearDistribution.binWidthYears, honestSummary) : null}
          />
        </div>

        <div className={BASE_CELL}>
          <BaseDiCalcoloTile
            reading={describeBase(base)}
            aside={describeBaseAside(base)}
            base={base}
            lock={lock}
            lockCaption={describeLock(lock)}
            footer={describeBaseFooter()}
            currentYear={currentYear}
          />
        </div>

        <div className={REDDITO_CELL}>
          <RedditoPassivoTile reading={describePassiveIncome(passiveIncome)} income={passiveIncome} />
        </div>

        <div className={SCENARI_CELL}>
          {projection ? (
            <ScenariTile reading={describeScenarios(scenarioRows)} rows={scenarioRows} horizonYears={PROJECTION_HORIZON_YEARS} footer={describeScenariosFooter()} />
          ) : (
            // A projection needs expenses and a positive net worth, which the branch above already
            // guarantees; this is the belt to those braces, and it says so instead of an empty cell.
            <Tile eyebrow="Scenari" ariaLabel="Scenari di mercato">
              <EmptyState className="mt-2" message={describeEmptyTiles('no-expenses').scenarios} />
            </Tile>
          )}
        </div>

        <div className={ETA_CELL}>
          {targetAgeSummary ? (
            <EtaObiettivoTile reading={describeTargetAge(targetAgeSummary)} summary={targetAgeSummary} method={describeTargetAgeMethod()} onOpenCoast={onOpenCoast} />
          ) : (
            <Tile eyebrow="Età obiettivo" ariaLabel="Età obiettivo">
              <EmptyState className="mt-2" message={describeEmptyTiles('no-expenses').targetAge} />
            </Tile>
          )}
        </div>
      </div>

      {dettaglio}
    </div>
  );
}
