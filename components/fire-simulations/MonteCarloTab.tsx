'use client';

/**
 * FIRE › MONTE CARLO — a verdict over tiles (2026-08-26)
 *
 * The tab answers «quanto è probabile?» before it shows a number: a rule-generated verdict
 * (`buildMonteCarloVerdict` in lib/utils/monteCarloNarrative.ts) reads the base scenario's run —
 * the share of simulations in which the capital holds to the horizon, the median final value,
 * the year the worst tenth runs out, the bear and bull probabilities, the pension bridge — over a
 * 12-column grid of tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Probabilità(5) | Distribuzione(4) | Scenari a confronto(3)
 *                     Spesa sostenibile(12)
 *                     Parametri(12)
 *   Mobile (1 col):   Probabilità → Spesa sostenibile → Distribuzione → Scenari → Parametri
 *
 * ONE run = the three scenarios (Orso · Base · Toro) with the plan's shared inputs; the verdict,
 * Probabilità and Distribuzione read Base, the Scenari tile reads all three. The old
 * «Simulazione singola | Confronto scenari» toggle is gone with the mode it switched: the single
 * form's market parameters ARE the Base scenario's. The run is automatic once the auto-filled
 * plan settles (the Ventaglio's precedent) and explicit afterwards: while the typed inputs differ
 * from the ones the shown results were run with, the Parametri footer says so and the figures
 * stay the last run's — never a silent re-run on every keystroke of a 30.000-path simulation.
 *
 * The page has NO period axis — a plan is simulated today — and its one input, the plan, is a
 * tile of the grid (The Input Tile Rule) in the desktop's last position: the plan is auto-filled
 * from the portfolio, so the page is answered before anything is typed.
 *
 * This file is the ORCHESTRATOR and computes nothing: the numbers come from
 * lib/utils/monteCarloSummary.ts over the results the service returns, the words from
 * lib/utils/monteCarloNarrative.ts. The form is ephemeral local state (strings, so a field can
 * hold «22.» while typing). The market assumptions are NOT edited here: they live in Impostazioni ›
 * Simulazioni and this tab only reads them (`resolveMonteCarloMarketForPortfolio`), declared in the
 * Parametri tile (The Declaration-Tile Rule).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getGoalData } from '@/lib/services/goalService';
import { resolveEffectiveTargets } from '@/lib/utils/allocationComparison';
import { seedWeightsFromTargets, weightsFromHoldings } from '@/lib/utils/monteCarloWeights';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { portfolioCost } from '@/lib/utils/fireCosts';
import { buildScenarioParams, runMonteCarloSimulation, type AnnualInflow } from '@/lib/services/monteCarloService';
import { calculateCoastFireNetRealAnnualPension, normalizeCoastFirePensions, normalizeCoastFireTaxBrackets } from '@/lib/services/fireService';
import { resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { computeSimulatedCapital, DEFAULT_MONTE_CARLO_SIMULATIONS, MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { summarizeSustainableSpending, SUSTAINABLE_VERDICT_PROBABILITY, type SustainableSpendingSummary } from '@/lib/utils/sustainableWithdrawal';
import { weightsLeverage } from '@/lib/utils/monteCarloDraw';
import { resolveMonteCarloMarketForPortfolio } from '@/lib/utils/monteCarloMarket';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { summarizeLock } from '@/lib/utils/fireSummary';
import {
  buildOverlaySeries,
  buildPercentileRows,
  formatInputAmount,
  haveRunInputsChanged,
  parseItalianNumber,
  summarizeMonteCarloPlan,
  summarizeMonteCarloRun,
  summarizeScenarios,
  type MonteCarloRunInputs,
  type ScenarioResults,
} from '@/lib/utils/monteCarloSummary';
import {
  buildMonteCarloVerdict,
  describeDistribuzione,
  describeDistribuzioneAside,
  describeDistribuzioneFooter,
  describeEsaurimento,
  describeEsaurimentoFooter,
  type DistributionView,
  describeMarketDeclaration,
  describeParametri,
  describeParametriFooter,
  resolveAllocationTotalState,
  type WeightsOrigin,
  describePercentili,
  describeProbabilita,
  describeProbabilitaAside,
  describeProbabilitaFooter,
  describeScenari,
  describeSpesaSostenibile,
  SPESA_ASIDE,
  describeScenarioNote,
  describeTraiettorie,
  DETTAGLIO_DESCRIPTION,
  PARAMETRI_ASIDE,
  SCENARI_ASIDE,
  SCENARI_FOOTER,
  scenarioLabel,
} from '@/lib/utils/monteCarloNarrative';
import type { MonteCarloCapitalInflow, MonteCarloParams, MonteCarloResults } from '@/types/assets';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { FireAssumptionsRow } from '@/components/fire-simulations/FireAssumptionsRow';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { MonteCarloFanChart } from '@/components/monte-carlo/MonteCarloFanChart';
import { MonteCarloDettaglio } from '@/components/monte-carlo/MonteCarloDettaglio';
import { ProbabilitaTile } from '@/components/monte-carlo/tiles/ProbabilitaTile';
import { DistribuzioneTile } from '@/components/monte-carlo/tiles/DistribuzioneTile';
import { SpesaSostenibileTile } from '@/components/monte-carlo/tiles/SpesaSostenibileTile';
import { ScenariConfrontoTile } from '@/components/monte-carlo/tiles/ScenariConfrontoTile';
import { ParametriTile, type MonteCarloForm } from '@/components/monte-carlo/tiles/ParametriTile';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 14 },
  { span: 4, lines: 10 },
  { span: 3, lines: 9 },
  { span: 12, lines: 8 },
  { span: 12, lines: 10 },
];

const DEFAULT_RETIREMENT_YEARS = 30;
const DEFAULT_SIMULATIONS = DEFAULT_MONTE_CARLO_SIMULATIONS;
const DEFAULT_WITHDRAWAL = 30000;

/** A run keeps the inputs it was made with, so the page can tell a stale form from a fresh one. */
interface MonteCarloRunState {
  results: ScenarioResults;
  inputs: MonteCarloRunInputs;
  /** S1: the withdrawal replayed on the run's own factors, inside the run (the running state covers it). */
  sustainable: SustainableSpendingSummary;
}

function parseIntField(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatField(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function MonteCarloTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

  // ─── Queries (shared keys with the other FIRE tabs) ──────────────────────────
  const { data: assets, isLoading: isLoadingAssets, isError: assetsError } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useQuery({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  // The goal-driven targets (when that mode is on) are part of the effective targets the weights are seeded from.
  const goalDriven = !!settings?.goalBasedInvestingEnabled && !!settings?.goalDrivenAllocationEnabled;
  const { data: goalData } = useQuery({
    queryKey: ['goalData', ownerId],
    queryFn: () => getGoalData(ownerId!),
    enabled: !!user && !!ownerId && goalDriven,
    staleTime: 300000,
  });

  // ─── The pension lock (governs the whole FIRE page) ──────────────────────────
  // With the lock on, the locked funds leave the starting portfolio and re-enter the simulation
  // as capital inflows at their unlock year, at TODAY's value (doc/guide/fire.md § FIRE, What If and Goals).
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
  const pensionInflows = useMemo<MonteCarloCapitalInflow[]>(
    () => (pensionLockState?.inflows ?? []).map((inflow) => ({ year: inflow.yearsFromNow, amount: inflow.amount })),
    [pensionLockState],
  );

  // The market assumptions, saved in Impostazioni › Simulazioni (the legacy field migrated, else the defaults).
  const market = useMemo(() => resolveMonteCarloMarketForPortfolio(settings, assets), [settings, assets]);
  const scenarios = market.scenarios;

  // The capital the simulation covers (rule RK): the seven classes, net of the closed pension
  // funds; real estate and crypto stay outside and are declared under the weights.
  const lockedAssetIds = useMemo(() => new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [pensionLockState]);
  const capital = useMemo(
    () => (assets ? computeSimulatedCapital(assets, calculateAssetValue, { lockedAssetIds, goldSubCategory: market.goldSubCategory }) : null),
    [assets, lockedAssetIds, market.goldSubCategory],
  );
  // The two seeds of the weights (R6): the effective targets of Allocazione (Σ above 100 = leverage), and the
  // portfolio held today (notional, leverage included). With no targets on the modelled classes the first is null.
  const targetSeed = useMemo(() => {
    if (!assets) return null;
    const { targets } = resolveEffectiveTargets({ settings, goalData: goalDriven ? goalData : null, assets });
    return seedWeightsFromTargets(targets, assets, { lockedAssetIds, goldSubCategory: market.goldSubCategory });
  }, [assets, settings, goalData, goalDriven, lockedAssetIds, market.goldSubCategory]);
  const holdingsSeed = useMemo(() => (assets ? weightsFromHoldings(assets, { lockedAssetIds, goldSubCategory: market.goldSubCategory }) : null), [assets, lockedAssetIds, market.goldSubCategory]);
  // The page's hypotheses: the weights seed the form from the SAME reading as the other tabs (D1).
  const { assumptions, isLoading: isLoadingAssumptions, isError: assumptionsError } = useFireAssumptions(lockedAssetIds, { withCashflow: true });
  const totalNetWorth = Math.max(0, capital?.total ?? 0);
  const liquidNetWorth = Math.max(0, capital?.liquid ?? 0);

  // What makes the plan honest (2026-09-24): the state pensions saved in Coast FIRE, dated by the
  // saved age and netted through the IRPEF brackets, taken off the withdrawal from their start;
  // and the tax on withdrawals, from the portfolio's cost basis — the capital the plan starts
  // from (everything but the locked funds), its gain share carried onto whatever amount is typed.
  const now = useMemo(() => new Date(), []);
  // The cost basis is `K`'s own (`resolveFireCapital`, the page's one reading): crypto and real estate are not in the basis either.
  const taxProfile = assumptions?.capital?.taxProfile ?? null;

  const currentYear = getItalyYear();
  const currentAge = settings?.userAge ?? null;
  const ctx = useMemo(() => ({ startCalendarYear: currentYear, currentAge }), [currentYear, currentAge]);
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);

  // ─── The form (ephemeral) ────────────────────────────────────────────────────
  const [form, setForm] = useState<MonteCarloForm | null>(null);
  // Where the weights come from (R6); typing in a weight field makes them «a mano».
  const [weightsOrigin, setWeightsOrigin] = useState<WeightsOrigin>('targets');
  const onFormChange = useCallback((patch: Partial<MonteCarloForm>) => {
    if (patch.weights) setWeightsOrigin('edited');
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);
  const applySeed = useCallback((seed: typeof targetSeed, origin: WeightsOrigin) => {
    if (!seed) return;
    setWeightsOrigin(origin);
    setForm((prev) => (prev ? { ...prev, weights: monteCarloClassRecord((cls) => String(seed.weights[cls])) } : prev));
  }, []);

  // The state pensions, net through the IRPEF brackets and deflated with the base scenario's
  // inflation (the same figure Coast FIRE prints), dated by the saved age: without an age there
  // is nothing to date, and the Parametri tile says so.
  const savedPensions = settings?.coastFirePensions;
  const savedTaxBrackets = settings?.coastFireTaxBrackets;
  const userAge = settings?.userAge;
  const baseInflationRate = scenarios.base.inflationRate;
  const statePensionInflows = useMemo<AnnualInflow[]>(() => {
    if (userAge === undefined || !Number.isFinite(userAge)) return [];
    const brackets = normalizeCoastFireTaxBrackets(savedTaxBrackets);
    return normalizeCoastFirePensions(savedPensions).map((pension) => {
      const breakdown = calculateCoastFireNetRealAnnualPension(pension, userAge, baseInflationRate, brackets, now);
      return { fromYear: Math.max(0, Math.ceil(breakdown.yearsUntilStart)), annualNetToday: breakdown.netAnnualRealAtStart };
    });
  }, [userAge, savedPensions, savedTaxBrackets, baseInflationRate, now]);

  // Seed the form ONCE from the portfolio, after the data has loaded — the starting capital net of
  // the locked funds, the planned expenses, the allocation normalized onto the seven MC classes
  // (`computeSimulatedCapital` + `deriveMonteCarloWeights`, shared with the Ventaglio: the two call sites must stay identical).
  // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (didSeedRef.current || isLoadingAssets || isLoadingSettings || !assets || !assumptions) return;
    const timer = setTimeout(() => {
      didSeedRef.current = true;
      // The seed: the targets of Allocazione, else the portfolio held today (the Parametri line says which).
      const weights = assumptions.weights;
      setWeightsOrigin(assumptions.weightsOrigin === 'targets' ? 'targets' : 'holdings');
      setForm({
        initialPortfolio: formatInputAmount(totalNetWorth),
        retirementYears: String(DEFAULT_RETIREMENT_YEARS),
        // RP6 (D5): the same expenses as the other tabs; the old 30.000 € stands in only while there are none anywhere.
        annualWithdrawal: String(Math.round(assumptions.expenses?.annual ?? 0) || DEFAULT_WITHDRAWAL),
        numberOfSimulations: String(DEFAULT_SIMULATIONS),
        weights: monteCarloClassRecord((cls) => String(weights[cls])),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingAssets, isLoadingSettings, assets, settings, totalNetWorth, assumptions]);

  // ─── The params the run reads (numbers from the strings) ─────────────────────
  const params = useMemo<MonteCarloParams | null>(() => {
    if (!form) return null;
    const initialPortfolio = Math.round(parseItalianNumber(form.initialPortfolio) ?? 0);
    return {
      portfolioSource: 'total',
      initialPortfolio,
      retirementYears: parseIntField(form.retirementYears, DEFAULT_RETIREMENT_YEARS),
      weights: monteCarloClassRecord((cls) => parseFloatField(form.weights[cls])),
      annualWithdrawal: Math.round(parseFloatField(form.annualWithdrawal)),
      withdrawalAdjustment: 'inflation',
      // The shared params carry the Base market; each scenario's run overrides it with
      // `buildScenarioParams`, so this is never what the Orso and Toro runs read.
      market: scenarios.base,
      // The classes move together through the matrix saved in Impostazioni (one matrix for the three scenarios).
      correlations: market.correlations,
      // R4: the debt of a leveraged portfolio costs the Liquidità return plus this (Impostazioni › Simulazioni).
      leverageSpread: market.leverageSpread,
      // RC3/RC4: the costs of the weights of THIS run (the user may have moved them), on the page's per-class costs.
      annualCostRate: portfolioCost(monteCarloClassRecord((cls) => parseFloatField(form.weights[cls])), assumptions?.costs).total,
      numberOfSimulations: Math.min(50000, Math.max(1000, parseIntField(form.numberOfSimulations, DEFAULT_SIMULATIONS))),
      capitalInflows: pensionInflows.length > 0 ? pensionInflows : undefined,
      annualInflows: statePensionInflows.length > 0 ? statePensionInflows : undefined,
      // The typed capital keeps the portfolio's gain share: basis = capital × (1 − gain share).
      withdrawalTax: taxProfile ? { basisToday: initialPortfolio * (1 - taxProfile.gainShare), rate: taxProfile.rate } : undefined,
    };
  }, [form, scenarios, market.correlations, market.leverageSpread, assumptions?.costs, pensionInflows, statePensionInflows, taxProfile]);

  const allocationSum = params ? MONTE_CARLO_CLASSES.reduce((sum, cls) => sum + params.weights[cls], 0) : 0;
  const runnable = !!params && params.initialPortfolio > 0 && params.annualWithdrawal > 0;
  // Below 100% or above 300% the run stays blocked; in between a sum above 100% is leverage (R4).
  const totalState = resolveAllocationTotalState(allocationSum);
  const leverage = weightsLeverage(MONTE_CARLO_CLASSES.map((cls) => (params ? params.weights[cls] : 0)));
  const canRun = runnable && (totalState === 'plain' || totalState === 'leveraged') && !!params && params.retirementYears >= 1 && params.retirementYears <= 60;

  const currentInputs = useMemo<MonteCarloRunInputs | null>(() => (params ? { params, scenarios, inflows: pensionInflows } : null), [params, scenarios, pensionInflows]);

  // ─── The run: the three scenarios in one go ──────────────────────────────────
  const [lastRun, setLastRun] = useState<MonteCarloRunState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  // The Distribuzione tile's view (final values | the year the money runs out): the tile's scope.
  const [distributionView, setDistributionView] = useState<DistributionView>('finali');

  const runScenarios = useCallback((inputs: MonteCarloRunInputs) => {
    setIsRunning(true);
    // Monte Carlo is CPU-bound and blocks the main thread: the delay lets the browser paint the
    // running state before the computation starts.
    window.setTimeout(() => {
      try {
        // Seeded (T3): each run draws from a fresh generator on the SAME seed, so the three scenarios and the
        // unleveraged Base meet the same shocks and a re-run with the same inputs gives the same figures.
        const run = (scenario: keyof typeof inputs.scenarios, params: MonteCarloParams, keepFactors = true): MonteCarloResults =>
          runMonteCarloSimulation({ ...buildScenarioParams(params, inputs.scenarios[scenario]), random: createSeededRandom(MONTE_CARLO_SEED) }, { keepFactors });
        const results: ScenarioResults = {
          bear: run('bear', inputs.params),
          base: run('base', inputs.params),
          bull: run('bull', inputs.params),
        };
        // D11: with leverage the Base runs again without it (weights scaled to 100) on the same shocks.
        const runLeverage = weightsLeverage(MONTE_CARLO_CLASSES.map((cls) => inputs.params.weights[cls]));
        if (runLeverage > 1) {
          results.unleveragedBase = run('base', { ...inputs.params, weights: monteCarloClassRecord((cls) => inputs.params.weights[cls] / runLeverage), leverageSpread: 0 }, false);
        }
        // S1: the nine sustainable figures replay the withdrawal on the three runs' factors; the factors
        // (n × N × 8 bytes a scenario) are dropped afterwards, the results keep what the tiles read.
        const sustainable = summarizeSustainableSpending({
          bear: { factors: results.bear.factors!, params: buildScenarioParams(inputs.params, inputs.scenarios.bear) },
          base: { factors: results.base.factors!, params: buildScenarioParams(inputs.params, inputs.scenarios.base) },
          bull: { factors: results.bull.factors!, params: buildScenarioParams(inputs.params, inputs.scenarios.bull) },
        });
        for (const key of ['bear', 'base', 'bull'] as const) results[key] = { ...results[key], factors: undefined };
        setLastRun({ results, inputs, sustainable });
      } catch (error) {
        console.error('Error running the Monte Carlo scenarios:', error);
        toast.error('Errore durante la simulazione');
      } finally {
        setIsRunning(false);
      }
    }, 60);
  }, []);

  // Auto-run once, when the seeded plan can run — the page opens answered, like the Ventaglio.
  const didAutoRunRef = useRef(false);
  useEffect(() => {
    if (didAutoRunRef.current || !currentInputs || !canRun) return;
    didAutoRunRef.current = true;
    const timer = setTimeout(() => runScenarios(currentInputs), 0);
    return () => clearTimeout(timer);
  }, [currentInputs, canRun, runScenarios]);

  const handleRun = useCallback(() => {
    if (currentInputs && canRun) runScenarios(currentInputs);
  }, [currentInputs, canRun, runScenarios]);

  // ─── The numbers (pure layer over the results) ───────────────────────────────
  const runParams = lastRun?.inputs.params ?? null;
  const run = useMemo(() => (lastRun && runParams ? summarizeMonteCarloRun(lastRun.results.base, runParams, ctx) : null), [lastRun, runParams, ctx]);
  const comparison = useMemo(() => (lastRun && runParams ? summarizeScenarios(lastRun.results, runParams, ctx) : null), [lastRun, runParams, ctx]);
  const overlay = useMemo(() => (lastRun ? buildOverlaySeries(lastRun.results, ctx.startCalendarYear) : []), [lastRun, ctx.startCalendarYear]);
  const percentileRows = useMemo(() => (lastRun ? buildPercentileRows(lastRun.results.base.percentiles, ctx.startCalendarYear) : []), [lastRun, ctx.startCalendarYear]);
  // The plan as typed (the Parametri reading) and the plan the shown results ran on (the Dettaglio).
  const typedPlan = useMemo(() => (params ? summarizeMonteCarloPlan(params, pensionInflows, pensionLockedValue, ctx) : null), [params, pensionInflows, pensionLockedValue, ctx]);
  const runPlan = useMemo(() => (runParams && lastRun ? summarizeMonteCarloPlan(runParams, lastRun.inputs.inflows, pensionLockedValue, ctx) : null), [runParams, lastRun, pensionLockedValue, ctx]);
  const stale = !!lastRun && !!currentInputs && haveRunInputsChanged(lastRun.inputs, currentInputs);

  // S1: the nine figures were computed with the run (on its own factors), so they are the LAST run's — never the typed inputs' (Stale-Run).
  const sustainable = lastRun?.sustainable ?? null;
  const sustainableVerdictInput = useMemo(() => {
    const base90 = sustainable?.rows.find((row) => row.probability === SUSTAINABLE_VERDICT_PROBABILITY)?.base;
    return sustainable && base90 && runParams ? { base90, capital: sustainable.capital, typedWithdrawal: runParams.annualWithdrawal } : null;
  }, [sustainable, runParams]);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const unleveragedSuccessRate = lastRun?.results.unleveragedBase?.successRate ?? null;
  const verdict = useMemo(() => buildMonteCarloVerdict({ runnable, run, scenarios: comparison, lock, unleveragedSuccessRate, sustainable: sustainableVerdictInput }), [runnable, run, comparison, lock, unleveragedSuccessRate, sustainableVerdictInput]);

  // ─── Loading: until the seeded plan has run once ─────────────────────────────
  const awaitingFirstRun = runnable && canRun && !lastRun;
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingAssets || isLoadingSettings || isLoadingAssumptions, failed: assetsError || settingsError || assumptionsError }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Patrimonio e ipotesi non sono stati letti: la simulazione girerebbe su una base che non esiste.',
          untouched: 'Le ipotesi salvate non sono state toccate.',
        })}
      />
    );
  }

  if (isLoadingAssets || isLoadingSettings || isLoadingAssumptions || !form || !params || !typedPlan || awaitingFirstRun) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  const unlockOnPlot = lock.active && lock.lockedValue > 0 && lock.unlockCalendarYear !== null && run !== null && lock.unlockCalendarYear <= run.endCalendarYear ? lock.unlockCalendarYear : null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <FireAssumptionsRow assumptions={assumptions} />
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul Monte Carlo" />
      </div>

      {/* Tablet (768-1439): every tile full width, in the phone's order. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        {run && lastRun && (
          <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5')}>
            <ProbabilitaTile
              reading={describeProbabilita(run)}
              aside={describeProbabilitaAside(run)}
              run={run}
              chart={
                <MonteCarloFanChart
                  percentiles={lastRun.results.base.percentiles}
                  startCalendarYear={ctx.startCalendarYear}
                  unlockCalendarYear={unlockOnPlot}
                  height="100%"
                  ariaLabel={`Ventaglio del piano di prelievo, scenario base: bande dei percentili 10–90 e 25–75 e mediana delle ${run.simulations.toLocaleString('it-IT')} simulazioni fino al ${run.endCalendarYear}; la linea tratteggiata in basso è il capitale esaurito.`}
                />
              }
              footer={describeProbabilitaFooter(run, lock)}
            />
          </div>
        )}

        {run && (
          <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-4')}>
            <DistribuzioneTile
              reading={distributionView === 'esaurimento' && run.failureCount > 0 ? describeEsaurimento(run) : describeDistribuzione(run)}
              aside={describeDistribuzioneAside(run)}
              run={run}
              view={distributionView}
              onViewChange={setDistributionView}
              footer={distributionView === 'esaurimento' && run.failureCount > 0 ? describeEsaurimentoFooter(run) : describeDistribuzioneFooter(run)}
            />
          </div>
        )}

        {comparison && (
          <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-3')}>
            <ScenariConfrontoTile
              reading={describeScenari(comparison)}
              aside={SCENARI_ASIDE}
              rows={comparison.rows.map((row) => ({ key: row.key, label: scenarioLabel(row.key), successRate: row.successRate, note: describeScenarioNote(row) }))}
              footer={SCENARI_FOOTER}
            />
          </div>
        )}

        {sustainable && runParams && (
          <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
            <SpesaSostenibileTile reading={describeSpesaSostenibile(sustainable, runParams.retirementYears)} aside={SPESA_ASIDE} summary={sustainable} />
          </div>
        )}

        <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          <ParametriTile
            reading={describeParametri(typedPlan)}
            aside={PARAMETRI_ASIDE}
            plan={typedPlan}
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
            marketDeclaration={describeMarketDeclaration(market, leverage)}
            excluded={capital?.excluded ?? null}
            onRun={handleRun}
            canRun={canRun}
            isRunning={isRunning}
            footer={
              lastRun
                ? describeParametriFooter({ stale, simulations: lastRun.inputs.params.numberOfSimulations })
                : [{ text: canRun ? 'Premi Esegui simulazione per lanciare i tre scenari.' : 'Completa il piano: patrimonio e prelievo maggiori di zero, allocazione tra 100% e 300%, da 1 a 60 anni.' }]
            }
            stale={stale}
          />
        </div>
      </div>

      {lastRun && run && comparison && runPlan && (
        <MonteCarloDettaglio
          description={DETTAGLIO_DESCRIPTION}
          traiettorieReading={describeTraiettorie(comparison, runPlan)}
          overlay={overlay}
          percentiliReading={describePercentili(run)}
          percentileRows={percentileRows}
        />
      )}
    </div>
  );
}
