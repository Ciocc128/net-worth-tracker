'use client';

/**
 * FIRE › PROIEZIONE — «quanto può valere il portafoglio tra N anni, e con che probabilità?»
 * (doc/montecarlo/README.md § 11, doc/guide/fire-proiezione.md). A rule-generated verdict over a
 * 12-column grid of tiles, on the same hypotheses as the rest of the page (`useFireAssumptions`):
 *
 *   Desktop (12 col): Tappe(12)
 *                     Ventaglio(8) | Scenari(4)
 *                     Parametri(12)
 *   Mobile (1 col):   Tappe → Ventaglio → Scenari → Parametri (the DOM order; T6, § 13)
 *
 * ONE run = the three scenarios on the same seed (`runAccumulationSimulation` without paths, one
 * sorted snapshot per year). The run is automatic once the seeded plan is ready and explicit
 * afterwards (The Stale-Run Rule). The declared exception: the threshold and the horizon (within the
 * years the run kept) are READINGS of the same snapshots and update at once. The default threshold is
 * the Calcolatore's FIRE number year by year (T6, doc/montecarlo/README.md § 13): a series read from the
 * saved plan's Base walk (`useWhatIfBaseline`), not from the run.
 *
 * This file is the ORCHESTRATOR and computes nothing: the numbers come from
 * lib/utils/projectionSummary.ts, the words from lib/utils/projectionNarrative.ts. The form is
 * ephemeral local state (strings). The market assumptions are NOT edited here: they live in
 * Impostazioni › Simulazioni and the Parametri tile declares them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { getAnnualCashflowData } from '@/lib/services/fireService';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { portfolioCost } from '@/lib/utils/fireCosts';
import { runAccumulationSimulation } from '@/lib/services/monteCarloService';
import { resolveProjectionFireSeries } from '@/lib/services/whatIfService';
import { useWhatIfBaseline } from '@/lib/hooks/useWhatIfBaseline';
import { resolvePensionLockState } from '@/lib/utils/pensionUnlock';
import { DEFAULT_MONTE_CARLO_SIMULATIONS, MONTE_CARLO_PARAMETER_SEED, MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { weightsLeverage } from '@/lib/utils/monteCarloDraw';
import { marketUncertainty, resolveMonteCarloMarketForPortfolio } from '@/lib/utils/monteCarloMarket';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_NOUNS, monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { formatInputAmount, parseItalianNumber, SCENARIO_KEYS, type ScenarioKey } from '@/lib/utils/monteCarloSummary';
import {
  describeMarketDeclaration,
  resolveAllocationTotalState,
  type WeightsOrigin,
} from '@/lib/utils/monteCarloNarrative';
import {
  DEFAULT_PROJECTION_HORIZON,
  haveProjectionInputsChanged,
  PROJECTION_MAX_YEARS,
  resolveRunYears,
  summarizeProjection,
  type ProjectionRunData,
  type ProjectionRunInputs,
  type ProjectionThreshold,
} from '@/lib/utils/projectionSummary';
import {
  buildProjectionVerdict,
  describeFireThresholdPlaceholder,
  describeTappeFooter,
  describeProjectionFooter,
  describeProjectionParametri,
  describeProjectionScenari,
  describeProjectionScenarioNote,
  describeSavingsSource,
  describeTappe,
  describeVentaglio,
  describeVentaglioFooter,
  PROJECTION_PARAMETRI_ASIDE,
  PROJECTION_SCENARI_ASIDE,
  PROJECTION_THRESHOLD_HINT_EMPTY,
  PROJECTION_THRESHOLD_HINT_FIRE,
  PROJECTION_THRESHOLD_HINT_FIXED,
  projectionScenariFooter,
  projectionScenarioLabel,
  VENTAGLIO_ASIDE,
} from '@/lib/utils/projectionNarrative';
import type { MonteCarloCapitalInflow } from '@/types/assets';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { withFlowsDetail } from '@/lib/utils/fireAssumptionsNarrative';
import { FireAssumptionsRow } from '@/components/fire-simulations/FireAssumptionsRow';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { useMarketAnchors } from '@/lib/hooks/useMarketAnchors';
import { useFireDatedFlows } from '@/lib/hooks/useFireDatedFlows';
import { buildFlowSchedule, type DatedFlowsInput } from '@/lib/utils/datedFlows';
import { describeSimulationFlowsRow } from '@/lib/utils/datedFlowsNarrative';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { MonteCarloFanChart } from '@/components/monte-carlo/MonteCarloFanChart';
import { VentaglioTile } from '@/components/projection/tiles/VentaglioTile';
import { ScenariTile } from '@/components/projection/tiles/ScenariTile';
import { TappeTile } from '@/components/projection/tiles/TappeTile';
import { ParametriTile, type ProjectionForm } from '@/components/projection/tiles/ParametriTile';
import { ProjectionDettaglio } from '@/components/projection/ProjectionDettaglio';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 12, lines: 8 },
  { span: 8, lines: 14 },
  { span: 4, lines: 9 },
  { span: 12, lines: 10 },
];

/** A run keeps the inputs it was made with, and the data its figures read. */
interface ProjectionRunState {
  data: ProjectionRunData;
  inputs: ProjectionRunInputs;
}

function parseIntField(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatField(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ProjectionTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

  // ─── Queries (shared keys with the other FIRE tabs) ──────────────────────────
  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });
  // The saved settings with the plan's draft over them (RP3): «Il mio piano» is previewed here.
  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useFireSettings();
  // The Cashflow, for the yearly saving (the Calcolatore's `annualSavings`): the SAME key `useFireAssumptions` reads.
  const { data: cashflowData, isLoading: isLoadingCashflow } = useQuery({
    queryKey: ['annualCashflowData', ownerId],
    queryFn: () => getAnnualCashflowData(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  // ─── The pension lock (governs the whole FIRE page) ──────────────────────────
  // With the lock on, the locked funds leave the starting capital and re-enter as capital inflows at
  // their unlock year, at TODAY's value (doc/guide/fire.md § FIRE, What If and Goals).
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
  const pensionInflows = useMemo<MonteCarloCapitalInflow[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ year: inflow.yearsFromNow, amount: inflow.amount })),
    [pensionLockState],
  );

  // The market assumptions, saved in Impostazioni › Simulazioni (the legacy field migrated, else the defaults).
  const anchors = useMarketAnchors();
  const market = useMemo(() => resolveMonteCarloMarketForPortfolio(settings, assets, anchors), [settings, assets, anchors]);
  const scenarios = market.scenarios;

  const lockedAssetIds = useMemo(() => new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [pensionLockState]);
  // The page's hypotheses: weights, capital `K` and the plan's expenses from the SAME reading as the other tabs.
  const { assumptions, isLoading: isLoadingAssumptions, isError: assumptionsError } = useFireAssumptions(lockedAssetIds, { withCashflow: true });
  // K1 (RK7): the capital and the two seeds of the weights are the page's own reading — this tab never recomputes them.
  const capital = assumptions?.capital ?? null;
  // § 12 (RF10): the saved dated flows. The Proiezione has no FIRE: a flow anchored to it does not exist here, the recurring ones
  // change the saving while it is paid, the lumps land every year.
  const { resolved: resolvedFlows, excluded: excludedFlows, isLoading: isLoadingFlows } = useFireDatedFlows({ lockedAssetIds: lockedAssetIds });
  const planExpensesFromCashflow = (assumptions?.expenses?.origin ?? 'cashflow') === 'cashflow';
  const datedFlows = useMemo<DatedFlowsInput | undefined>(
    () => (resolvedFlows.length > 0 ? { resolved: resolvedFlows, planExpensesFromCashflow } : undefined),
    [resolvedFlows, planExpensesFromCashflow],
  );
  const assumptionsWithFlows = useMemo(() => (assumptions ? withFlowsDetail(assumptions, resolvedFlows, excludedFlows) : null), [assumptions, resolvedFlows, excludedFlows]);
  const targetSeed = assumptions?.weightSeeds?.targets ?? null;
  const holdingsSeed = assumptions?.weightSeeds?.holdings ?? null;
  const totalNetWorth = Math.max(0, capital?.total ?? 0);
  const liquidNetWorth = Math.max(0, capital?.liquid ?? 0);

  const currentYear = getItalyYear();
  const currentAge = settings?.userAge ?? null;
  const ctx = useMemo(() => ({ startCalendarYear: currentYear, currentAge }), [currentYear, currentAge]);

  // T6 (RN1–RN2, RN6): the Calcolatore's FIRE number year by year in today's euros, read from the saved plan's Base walk
  // (the same `WhatIfBaseline` as the What If and «Dopo il FIRE»; shared query keys, no extra read). Always walked to the
  // longest horizon: the series is a reading of the plan, so it does not change with the horizon typed here (RN5).
  const { baseline, isLoadingSettings: baselineSettingsLoading, isLoadingAssets: baselineAssetsLoading, isLoadingCashflow: baselineCashflowLoading, isLoadingFlows: baselineFlowsLoading } = useWhatIfBaseline();
  const baselineLoading = baselineSettingsLoading || baselineAssetsLoading || baselineCashflowLoading || baselineFlowsLoading;
  const fireSeries = useMemo(() => (baselineLoading ? null : resolveProjectionFireSeries(baseline, PROJECTION_MAX_YEARS)), [baselineLoading, baseline]);
  // The threshold is the FIRE number until a figure is typed (RN4); without a plan that runs there is no FIRE number.
  const [thresholdMode, setThresholdMode] = useState<'fire' | 'fixed'>('fire');

  // ─── The form (ephemeral) ────────────────────────────────────────────────────
  const [form, setForm] = useState<ProjectionForm | null>(null);
  const [weightsOrigin, setWeightsOrigin] = useState<WeightsOrigin>('targets');
  const onFormChange = useCallback((patch: Partial<ProjectionForm>) => {
    if (patch.weights) setWeightsOrigin('edited');
    // Typing in the threshold field makes it a figure of the user's; the «Numero FIRE» seed takes it back.
    if (patch.threshold !== undefined) setThresholdMode('fixed');
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);
  const applySeed = useCallback((seed: typeof targetSeed, origin: WeightsOrigin) => {
    if (!seed) return;
    setWeightsOrigin(origin);
    setForm((prev) => (prev ? { ...prev, weights: monteCarloClassRecord((cls) => String(seed.weights[cls])) } : prev));
  }, []);

  // Seed the form ONCE, after the data has loaded: the capital K and the Cashflow's saving (the threshold is the FIRE number: no text to seed).
  // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (didSeedRef.current || isLoadingAssets || isLoadingSettings || isLoadingCashflow || !assets || !assumptions) return;
    const timer = setTimeout(() => {
      didSeedRef.current = true;
      setWeightsOrigin(assumptions.weightsOrigin === 'targets' ? 'targets' : 'holdings');
      setForm({
        initialPortfolio: formatInputAmount(totalNetWorth),
        annualSavings: String(Math.round(cashflowData?.annualSavings ?? 0)),
        savingsYears: String(DEFAULT_PROJECTION_HORIZON),
        horizon: String(DEFAULT_PROJECTION_HORIZON),
        threshold: '',
        numberOfSimulations: String(DEFAULT_MONTE_CARLO_SIMULATIONS),
        weights: monteCarloClassRecord((cls) => String(assumptions.weights[cls])),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingAssets, isLoadingSettings, isLoadingCashflow, assets, assumptions, totalNetWorth, cashflowData]);

  // ─── What the run reads (numbers from the strings) ───────────────────────────
  const typed = useMemo(() => {
    if (!form) return null;
    const horizon = Math.min(PROJECTION_MAX_YEARS, Math.max(1, parseIntField(form.horizon, DEFAULT_PROJECTION_HORIZON)));
    return {
      initialPortfolio: Math.round(parseItalianNumber(form.initialPortfolio) ?? 0),
      annualSavings: Math.max(0, Math.round(parseFloatField(form.annualSavings))),
      savingsYears: Math.min(PROJECTION_MAX_YEARS, Math.max(0, parseIntField(form.savingsYears, 0))),
      horizon,
      simulations: Math.min(50000, Math.max(1000, parseIntField(form.numberOfSimulations, DEFAULT_MONTE_CARLO_SIMULATIONS))),
      weights: monteCarloClassRecord((cls) => parseFloatField(form.weights[cls])),
      threshold: parseItalianNumber(form.threshold),
    };
  }, [form]);

  const allocationSum = typed ? MONTE_CARLO_CLASSES.reduce((sum, cls) => sum + typed.weights[cls], 0) : 0;
  const totalState = resolveAllocationTotalState(allocationSum);
  const leverage = weightsLeverage(MONTE_CARLO_CLASSES.map((cls) => (typed ? typed.weights[cls] : 0)));
  const canRun = !!typed && typed.initialPortfolio > 0 && (totalState === 'plain' || totalState === 'leveraged');

  const currentInputs = useMemo<ProjectionRunInputs | null>(
    () =>
      typed
        ? {
            initialPortfolio: typed.initialPortfolio,
            annualSavings: typed.annualSavings,
            savingsYears: typed.savingsYears,
            simulations: typed.simulations,
            horizon: typed.horizon,
            years: resolveRunYears(typed.horizon),
            weights: typed.weights,
            scenarios,
            correlations: market.correlations,
            leverageSpread: market.leverageSpread,
            // RC3/RC4: the costs of the weights of THIS run, on the page's per-class costs.
            costRate: portfolioCost(typed.weights, assumptions?.costs).total,
            inflows: pensionInflows,
            datedFlows,
            // RQ6 (Q2): the Base draws each path's means from it; Bear and Bull are the RQ5 stress.
            uncertainty: marketUncertainty(market),
          }
        : null,
    [typed, scenarios, market, assumptions?.costs, pensionInflows, datedFlows],
  );

  // ─── The run: the three scenarios in one go ──────────────────────────────────
  const [lastRun, setLastRun] = useState<ProjectionRunState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [tappeScenario, setTappeScenario] = useState<ScenarioKey>('base');

  const runProjection = useCallback((inputs: ProjectionRunInputs) => {
    setIsRunning(true);
    // The run is CPU-bound and blocks the main thread: the delay lets the browser paint the running state first.
    window.setTimeout(() => {
      try {
        const years = inputs.years;
        const snapshotYears = Array.from({ length: years }, (_, index) => index + 1);
        // The lumps of the running year are part of the starting capital (RF6), whatever the scenario's inflation.
        const startingLump = inputs.datedFlows ? buildFlowSchedule(inputs.datedFlows.resolved, { inflationRate: 0, planExpensesFromCashflow: inputs.datedFlows.planExpensesFromCashflow }).lump(0) : 0;
        const startValue = inputs.initialPortfolio + inputs.inflows.filter((inflow) => inflow.year <= 0).reduce((sum, inflow) => sum + inflow.amount, 0) + startingLump;
        const data: ProjectionRunData = {
          scenarios: {} as ProjectionRunData['scenarios'],
          inflation: { bear: 0, base: 0, bull: 0 },
          startValue,
          simulations: inputs.simulations,
          years,
        };
        for (const key of SCENARIO_KEYS) {
          const scenario = inputs.scenarios[key];
          // RV7: a fresh generator on the SAME seed per scenario, so Bear, Base and Bull meet the same shocks.
          const result = runAccumulationSimulation({
            initialPortfolio: inputs.initialPortfolio,
            annualSavings: inputs.annualSavings,
            savingsInflationRate: scenario.inflationRate,
            savingsYears: inputs.savingsYears,
            annualExpenses: 0,
            withdrawalRate: 0,
            expenseInflationRate: scenario.inflationRate,
            years,
            weights: inputs.weights,
            market: scenario,
            correlations: inputs.correlations,
            leverageSpread: inputs.leverageSpread,
            annualCostRate: inputs.costRate,
            numberOfSimulations: inputs.simulations,
            capitalInflows: inputs.inflows.length > 0 ? inputs.inflows : undefined,
            flows: inputs.datedFlows,
            collectPaths: false,
            snapshotYears,
            random: createSeededRandom(MONTE_CARLO_SEED),
            ...(key === 'base' && inputs.uncertainty
              ? { uncertainty: inputs.uncertainty, parameterRandom: createSeededRandom(MONTE_CARLO_PARAMETER_SEED) }
              : {}),
          });
          data.scenarios[key] = { snapshots: result.snapshots ?? {}, leverageZeroedCount: result.leverageZeroedCount ?? 0 };
          data.inflation[key] = scenario.inflationRate;
        }
        setLastRun({ data, inputs });
      } catch (error) {
        console.error('Error running the projection:', error);
        toast.error('Errore durante la simulazione');
      } finally {
        setIsRunning(false);
      }
    }, 60);
  }, []);

  // Auto-run once, when the seeded plan can run — the page opens answered.
  const didAutoRunRef = useRef(false);
  useEffect(() => {
    // The flows are part of the plan: the first run waits for the mortgage linked in Patrimonio to be read.
    if (didAutoRunRef.current || !currentInputs || !canRun || isLoadingFlows) return;
    didAutoRunRef.current = true;
    const timer = setTimeout(() => runProjection(currentInputs), 0);
    return () => clearTimeout(timer);
  }, [currentInputs, canRun, runProjection, isLoadingFlows]);

  const handleRun = useCallback(() => {
    if (currentInputs && canRun) runProjection(currentInputs);
  }, [currentInputs, canRun, runProjection]);

  // ─── The numbers (pure layer over the snapshots) ─────────────────────────────
  // Threshold and horizon are READINGS of the run (§ 11.6): they follow the typed values at once,
  // the horizon capped at the years the run kept.
  const typedThreshold = typed?.threshold && typed.threshold > 0 ? typed.threshold : null;
  const thresholdIsFireNumber = thresholdMode === 'fire' && fireSeries !== null;
  const threshold = useMemo<ProjectionThreshold>(
    () => (thresholdIsFireNumber && fireSeries ? { kind: 'fire', series: fireSeries } : typedThreshold !== null ? { kind: 'fixed', value: typedThreshold } : null),
    [thresholdIsFireNumber, fireSeries, typedThreshold],
  );
  const summary = useMemo(
    () => (lastRun && typed ? summarizeProjection(lastRun.data, { horizon: typed.horizon, threshold, startingCapital: lastRun.inputs.initialPortfolio, ctx }) : null),
    [lastRun, typed, threshold, ctx],
  );
  const useFireThreshold = useCallback(() => {
    setThresholdMode('fire');
    setForm((prev) => (prev ? { ...prev, threshold: '' } : prev));
  }, []);
  const stale = !!lastRun && !!currentInputs && haveProjectionInputsChanged(lastRun.inputs, currentInputs);
  const runLeverage = lastRun ? weightsLeverage(MONTE_CARLO_CLASSES.map((cls) => lastRun.inputs.weights[cls])) : 1;

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const runnable = !!typed && typed.initialPortfolio > 0;
  const verdict = useMemo(() => buildProjectionVerdict({ runnable, summary, thresholdIsFireNumber, leverage: runLeverage }), [runnable, summary, thresholdIsFireNumber, runLeverage]);

  const typedPlan = useMemo(
    () =>
      typed
        ? {
            initialPortfolio: typed.initialPortfolio,
            annualSavings: typed.annualSavings,
            savingsYears: typed.savingsYears,
            horizon: typed.horizon,
            simulations: typed.simulations,
            allocation: MONTE_CARLO_CLASSES.map((key) => ({ key, label: MONTE_CARLO_CLASS_NOUNS[key], pct: typed.weights[key] })).filter((entry) => entry.pct > 0),
          }
        : null,
    [typed],
  );

  // ─── Loading: until the seeded plan has run once ─────────────────────────────
  const awaitingFirstRun = runnable && canRun && !lastRun;
  // A failed read comes BEFORE the wait: a plan built on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingAssets || isLoadingSettings || isLoadingAssumptions, failed: assetsError || settingsError || assumptionsError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio e ipotesi non sono stati letti: la proiezione girerebbe su una base che non esiste.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoadingAssets || isLoadingSettings || isLoadingAssumptions || isLoadingCashflow || isLoadingFlows || !form || !typed || !typedPlan || awaitingFirstRun) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  const base = summary?.scenarios.base;
  const savingsSource = cashflowData ? { year: cashflowData.referenceYear, annualized: cashflowData.isAnnualized } : null;
  const baseInflation = lastRun?.data.inflation.base ?? scenarios.base.inflationRate;
  // RN1/RN4: the FIRE number is a dashed SERIES that follows the plan, a typed figure a straight line.
  const thresholdKind = threshold === null ? 'none' : threshold.kind;
  const plotSeries = threshold?.kind === 'fire' ? { values: threshold.series, label: 'numero FIRE' } : undefined;
  const plotLine = threshold?.kind === 'fixed' ? { value: threshold.value, label: 'soglia' } : undefined;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <FireAssumptionsRow assumptions={assumptionsWithFlows} />
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sulla proiezione" />
      </div>

      {/* Tablet (768-1439): every tile full width, in the phone's order. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        {summary && base && lastRun && (
          <>
            <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
              <TappeTile
                reading={describeTappe(summary.scenarios[tappeScenario].milestones)}
                rows={summary.scenarios[tappeScenario].milestones}
                scenario={tappeScenario}
                onScenarioChange={setTappeScenario}
                horizon={summary.horizon}
                hasThreshold={summary.threshold !== null}
                showRowThreshold={thresholdKind === 'fire'}
                footer={describeTappeFooter(thresholdKind, threshold?.kind === 'fixed' ? threshold.value : null)}
              />
            </div>

            <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-8')}>
              <VentaglioTile
                reading={describeVentaglio(summary, lastRun.data.startValue)}
                aside={VENTAGLIO_ASIDE}
                p10={base.atHorizon.p10}
                p50={base.atHorizon.p50}
                p90={base.atHorizon.p90}
                horizonLabel={`${summary.horizon} ${summary.horizon === 1 ? 'anno' : 'anni'}`}
                chart={
                  <MonteCarloFanChart
                    floorAtZero
                    percentiles={base.series}
                    startCalendarYear={ctx.startCalendarYear}
                    unlockCalendarYear={null}
                    zeroLine={false}
                    referenceLine={plotLine}
                    referenceSeries={plotSeries}
                    markedCalendarYear={summary.endCalendarYear}
                    height="100%"
                    ariaLabel={`Ventaglio del portafoglio, scenario base, in euro di oggi: bande dei percentili 10–90 e 25–75 e mediana delle ${summary.simulations.toLocaleString('it-IT')} simulazioni fino al ${ctx.startCalendarYear + lastRun.data.years}.`}
                  />
                }
                footer={describeVentaglioFooter(baseInflation, thresholdKind, lastRun?.inputs.costRate ?? 0)}
              />
            </div>

            <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-4')}>
              <ScenariTile
                reading={describeProjectionScenari(summary)}
                aside={PROJECTION_SCENARI_ASIDE}
                rows={SCENARIO_KEYS.map((key) => {
                  const figures = summary.scenarios[key].atHorizon;
                  return { key, label: projectionScenarioLabel(key), median: figures.p50, note: describeProjectionScenarioNote(figures, summary.threshold !== null), fillPct: figures.probabilityAtLeast };
                })}
                footer={projectionScenariFooter(thresholdKind)}
              />
            </div>
          </>
        )}

        <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
          <ParametriTile
            reading={describeProjectionParametri(typedPlan)}
            aside={PROJECTION_PARAMETRI_ASIDE}
            form={form}
            onFormChange={onFormChange}
            allocationSum={allocationSum}
            weightsOrigin={weightsOrigin}
            leverage={leverage}
            hasTargets={targetSeed !== null}
            onUseTargets={targetSeed ? () => applySeed(targetSeed, 'targets') : undefined}
            onImportHoldings={holdingsSeed ? () => applySeed(holdingsSeed, 'holdings') : undefined}
            totalNetWorth={totalNetWorth}
            liquidNetWorth={liquidNetWorth}
            savingsHint={describeSavingsSource(savingsSource)}
            thresholdHint={thresholdIsFireNumber ? PROJECTION_THRESHOLD_HINT_FIRE : typedThreshold !== null ? PROJECTION_THRESHOLD_HINT_FIXED : PROJECTION_THRESHOLD_HINT_EMPTY}
            thresholdIsFire={thresholdIsFireNumber}
            fireThresholdPlaceholder={fireSeries ? describeFireThresholdPlaceholder(fireSeries[0]) : null}
            onUseFireThreshold={useFireThreshold}
            marketDeclaration={describeMarketDeclaration(market, leverage)}
            capital={capital}
            flowsNote={describeSimulationFlowsRow({ count: resolvedFlows.length, excluded: excludedFlows, fireAnchored: resolvedFlows.filter((flow) => flow.anchor === 'fire').length, view: 'projection' })}
            onRun={handleRun}
            canRun={canRun}
            isRunning={isRunning}
            footer={
              lastRun
                ? describeProjectionFooter({ stale, simulations: lastRun.inputs.simulations })
                : [{ text: canRun ? 'Premi Prova per lanciare i tre scenari.' : 'Completa il piano: capitale maggiore di zero e allocazione tra 100% e 300%.' }]
            }
            stale={stale}
          />
        </div>
      </div>

      <ProjectionDettaglio />
    </div>
  );
}
