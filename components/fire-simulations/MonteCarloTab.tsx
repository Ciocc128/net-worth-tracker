'use client';

/**
 * FIRE › DOPO IL FIRE (Monte Carlo) — a verdict over tiles (2026-08-26, T5 2026-10-05)
 *
 * T5 (doc/montecarlo/README.md § 12): the tab starts at the FIRE year the Calcolatore finds on the SAVED plan (`useWhatIfBaseline`,
 * `runBaselineProjection`, `resolveFireStart`), with the Base capital of that year in today's euros, or «Oggi» as before; every
 * figure is in today's euros (RD6). The tab answers «dopo il FIRE il capitale regge, e quanto posso prelevare?» before it shows a number: a rule-generated verdict
 * (`buildMonteCarloVerdict` in lib/utils/monteCarloNarrative.ts) reads the base scenario's run —
 * the share of simulations in which the capital holds to the horizon, the median final value,
 * the year the worst tenth runs out, the bear and bull probabilities, the pension bridge — over a
 * 12-column grid of tiles that each answer one question with a reading line above their figures.
 *
 *   Desktop (12 col): Spesa sostenibile(12)
 *                     Probabilità(8) | Scenari a confronto(4)
 *                     Parametri(12)
 *   Mobile (1 col):   Spesa sostenibile → Probabilità → Scenari → Parametri
 *
 * ONE run = the three scenarios (Bear · Base · Bull) with the plan's shared inputs; the verdict,
 * Probabilità read Base, the Scenari tile reads all three. The old
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
import { useFireSettings } from '@/lib/hooks/useFirePlan';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { calculateAssetValue, getAllAssets } from '@/lib/services/assetService';
import { useWhatIfBaseline } from '@/lib/hooks/useWhatIfBaseline';
import { runBaselineProjection } from '@/lib/services/whatIfService';
import { defaultWithdrawalYears, resolveFireStart } from '@/lib/utils/fireStart';
import { targetYearsOf } from '@/lib/utils/fireDepletion';
import { DEFAULT_FIRE_TARGET_AGE } from '@/lib/utils/firePlan';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { portfolioCost } from '@/lib/utils/fireCosts';
import { buildScenarioParams, runMonteCarloSimulation, type AnnualInflow } from '@/lib/services/monteCarloService';
import { calculateCoastFireNetRealAnnualPension, normalizeCoastFirePensions, normalizeCoastFireTaxBrackets } from '@/lib/services/fireService';
import { resolvePensionLockState, resolveRitaUnlockAge } from '@/lib/utils/pensionUnlock';
import { DEFAULT_MONTE_CARLO_SIMULATIONS, MONTE_CARLO_PARAMETER_SEED, MONTE_CARLO_SEED } from '@/lib/utils/monteCarloParams';
import { summarizeSustainableSpending, SUSTAINABLE_VERDICT_PROBABILITY, type SustainableSpendingSummary } from '@/lib/utils/sustainableWithdrawal';
import { weightsLeverage } from '@/lib/utils/monteCarloDraw';
import { marketUncertainty, resolveMonteCarloMarketForPortfolio } from '@/lib/utils/monteCarloMarket';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { summarizeLock } from '@/lib/utils/fireSummary';
import {
  buildOverlaySeries,
  buildPercentileRows,
  deflatePercentiles,
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
  describeFireStartRow,
  START_MODE_LABELS,
  type StartMode,
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
import { withFlowsDetail } from '@/lib/utils/fireAssumptionsNarrative';
import { FireAssumptionsRow } from '@/components/fire-simulations/FireAssumptionsRow';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { useMarketAnchors } from '@/lib/hooks/useMarketAnchors';
import { useFireDatedFlows } from '@/lib/hooks/useFireDatedFlows';
import type { DatedFlowsInput } from '@/lib/utils/datedFlows';
import { describeSimulationFlowsRow } from '@/lib/utils/datedFlowsNarrative';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { MonteCarloFanChart } from '@/components/monte-carlo/MonteCarloFanChart';
import { MonteCarloDettaglio } from '@/components/monte-carlo/MonteCarloDettaglio';
import { ProbabilitaTile } from '@/components/monte-carlo/tiles/ProbabilitaTile';
import { SpesaSostenibileTile } from '@/components/monte-carlo/tiles/SpesaSostenibileTile';
import { ScenariConfrontoTile } from '@/components/monte-carlo/tiles/ScenariConfrontoTile';
import { ParametriTile, type MonteCarloForm } from '@/components/monte-carlo/tiles/ParametriTile';
import type { SegmentedPillOption } from '@/components/ui/segmented-pill';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 12, lines: 8 },
  { span: 8, lines: 14 },
  { span: 4, lines: 9 },
  { span: 12, lines: 10 },
];

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

  // The saved settings with the plan's draft over them (RP3): «Il mio piano» is previewed here.
  const { data: settings, isLoading: isLoadingSettings, isError: settingsError } = useFireSettings();

  // T5 (DF2): the saved plan's Base walk — the same «prima» as the What If's and the Obiettivi's «Effetto sul FIRE» — gives the FIRE year.
  const whatIf = useWhatIfBaseline();
  const { baseline, hasBaseline, isLoadingSettings: isLoadingBaselineSettings, isLoadingAssets: isLoadingBaselineAssets, isLoadingCashflow, isLoadingFlows: isLoadingBaselineFlows, cashflowError } = whatIf;
  const baselineLoading = isLoadingBaselineSettings || isLoadingBaselineAssets || isLoadingCashflow || isLoadingBaselineFlows;

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
  const anchors = useMarketAnchors();
  const market = useMemo(() => resolveMonteCarloMarketForPortfolio(settings, assets, anchors), [settings, assets, anchors]);
  const scenarios = market.scenarios;

  const lockedAssetIds = useMemo(() => new Set((pensionLockState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [pensionLockState]);
  // The page's hypotheses: the weights seed the form from the SAME reading as the other tabs (D1).
  const { assumptions, isLoading: isLoadingAssumptions, isError: assumptionsError } = useFireAssumptions(lockedAssetIds, { withCashflow: true });
  // K1 (RK7): the capital and the two seeds of the weights are the page's own reading — this tab never recomputes them.
  const capital = assumptions?.capital ?? null;
  // § 12 (RF8): the saved dated flows, read as «if I stop today» — a FIRE-anchored one opens in year 1 + its delay. The plan's
  // expenses come from the Cashflow unless typed in Impostazioni (D-F6): that decides whether a flow «already in the Cashflow» is inside them.
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

  // What makes the plan honest (2026-09-24): the state pensions saved in Coast FIRE, dated by the
  // saved age and netted through the IRPEF brackets, taken off the withdrawal from their start;
  // and the tax on withdrawals, from the portfolio's cost basis — the capital the plan starts
  // from (everything but the locked funds), its gain share carried onto whatever amount is typed.
  const now = useMemo(() => new Date(), []);
  // The cost basis is `K`'s own (`resolveFireCapital`, the page's one reading): crypto and real estate are not in the basis either.
  const taxProfile = assumptions?.capital?.taxProfile ?? null;

  const currentYear = getItalyYear();
  const currentAge = settings?.userAge ?? null;
  const baseInflationPct = scenarios.base.inflationRate;
  // RD1–RD2: the FIRE year and the Base capital of that year; «today» with the reason when there is none (DF6).
  // § 21 RE9: with no FIRE year within the horizon the run may start at the target age instead.
  const targetYears = useMemo(() => targetYearsOf(settings?.coastFireRetirementAge ?? DEFAULT_FIRE_TARGET_AGE, currentAge ?? undefined), [settings?.coastFireRetirementAge, currentAge]);
  const fireStart = useMemo(() => {
    if (baselineLoading) return null;
    const { projection, yearsToFIRE } = runBaselineProjection(baseline);
    return resolveFireStart({ projection, yearsToFIRE, hasBaseline, baseInflationRate: baseInflationPct, currentYear, currentAge, targetYears });
  }, [baselineLoading, baseline, hasBaseline, baseInflationPct, currentYear, currentAge, targetYears]);
  const [startChoice, setStartChoice] = useState<StartMode>('fire');
  const startMode: StartMode = fireStart?.kind === 'fire' || fireStart?.kind === 'target' ? startChoice : 'today';
  const startYears = startMode === 'fire' && (fireStart?.kind === 'fire' || fireStart?.kind === 'target') ? fireStart.years : 0;
  /** The context of a run that started `years` from today: dates, ages and the inflation its euros are deflated with (RD6). */
  const contextFor = useCallback(
    (years: number) => ({ startCalendarYear: currentYear + years, currentAge: currentAge === null ? null : currentAge + years, startYears: years, inflationRate: baseInflationPct }),
    [currentYear, currentAge, baseInflationPct],
  );
  const ctx = useMemo(() => contextFor(startYears), [contextFor, startYears]);
  const ritaUnlockAge = resolveRitaUnlockAge({ pensionInpsRetirementAge: settings?.pensionInpsRetirementAge, pensionRitaLongUnemployment: settings?.pensionRitaLongUnemployment });
  const lock = useMemo(() => summarizeLock(pensionLockState, { currentYear, ritaUnlockAge }), [pensionLockState, currentYear, ritaUnlockAge]);

  // ─── The form (ephemeral) ────────────────────────────────────────────────────
  const [form, setForm] = useState<MonteCarloForm | null>(null);
  // Where the weights come from (R6); typing in a weight field makes them «a mano».
  const [weightsOrigin, setWeightsOrigin] = useState<WeightsOrigin>('targets');
  // RD5: the horizon follows the start mode until the user types it.
  const yearsTouchedRef = useRef(false);
  const onFormChange = useCallback((patch: Partial<MonteCarloForm>) => {
    if (patch.weights) setWeightsOrigin('edited');
    if (patch.retirementYears !== undefined) yearsTouchedRef.current = true;
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
  // The form as the saved plan declares it; also what «Riporta al piano» puts back.
  const buildSeedForm = useCallback((): MonteCarloForm | null => {
    if (!assumptions || !fireStart) return null;
    const weights = assumptions.weights;
    const seedYears = fireStart.kind === 'fire' || fireStart.kind === 'target' ? fireStart.years : 0;
    return {
      // The first run is «Al FIRE» when the Calcolatore has a FIRE year (RD2: the Base capital of that year, today's euros).
      initialPortfolio: formatInputAmount(fireStart.kind === 'fire' || fireStart.kind === 'target' ? fireStart.capitalToday : totalNetWorth),
      retirementYears: String(defaultWithdrawalYears(currentAge, seedYears)),
      // RP6 (D5): the same expenses as the other tabs; the old 30.000 € stands in only while there are none anywhere.
      annualWithdrawal: String(Math.round(assumptions.expenses?.annual ?? 0) || DEFAULT_WITHDRAWAL),
      numberOfSimulations: String(DEFAULT_SIMULATIONS),
      weights: monteCarloClassRecord((cls) => String(weights[cls])),
    };
  }, [assumptions, fireStart, totalNetWorth, currentAge]);
  useEffect(() => {
    if (didSeedRef.current || isLoadingAssets || isLoadingSettings || !assets || !assumptions || !fireStart) return;
    const timer = setTimeout(() => {
      didSeedRef.current = true;
      // The seed: the targets of Allocazione, else the portfolio held today (the Parametri line says which).
      setWeightsOrigin(assumptions.weightsOrigin === 'targets' ? 'targets' : 'holdings');
      setForm(buildSeedForm());
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingAssets, isLoadingSettings, assets, settings, assumptions, fireStart, buildSeedForm]);

  // «Riporta al piano»: every typed value back to the saved plan's.
  const resetToPlan = useCallback(() => {
    const seed = buildSeedForm();
    if (!seed || !assumptions) return;
    yearsTouchedRef.current = false;
    setStartChoice('fire');
    setWeightsOrigin(assumptions.weightsOrigin === 'targets' ? 'targets' : 'holdings');
    setForm(seed);
  }, [buildSeedForm, assumptions]);

  // Changing «Quando smetto» re-seeds the capital (and the horizon, unless typed): a value typed by hand wins only until the mode changes.
  const onStartModeChange = useCallback(
    (mode: StartMode) => {
      if (!fireStart) return;
      setStartChoice(mode);
      const years = mode === 'fire' && (fireStart.kind === 'fire' || fireStart.kind === 'target') ? fireStart.years : 0;
      setForm((prev) =>
        prev
          ? {
              ...prev,
              initialPortfolio: formatInputAmount(years > 0 && (fireStart.kind === 'fire' || fireStart.kind === 'target') ? fireStart.capitalToday : totalNetWorth),
              retirementYears: yearsTouchedRef.current ? prev.retirementYears : String(defaultWithdrawalYears(currentAge, years)),
            }
          : prev,
      );
    },
    [fireStart, totalNetWorth, currentAge],
  );

  // ─── The params the run reads (numbers from the strings) ─────────────────────
  const params = useMemo<MonteCarloParams | null>(() => {
    if (!form) return null;
    const initialPortfolio = Math.round(parseItalianNumber(form.initialPortfolio) ?? 0);
    return {
      portfolioSource: 'total',
      initialPortfolio,
      retirementYears: parseIntField(form.retirementYears, defaultWithdrawalYears(currentAge, startYears)),
      weights: monteCarloClassRecord((cls) => parseFloatField(form.weights[cls])),
      annualWithdrawal: Math.round(parseFloatField(form.annualWithdrawal)),
      withdrawalAdjustment: 'inflation',
      // The shared params carry the Base market; each scenario's run overrides it with
      // `buildScenarioParams`, so this is never what the Bear and Bull runs read.
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
      // The typed capital keeps the gain share of the capital it stands for: today's, or (RD3) the Base's at the FIRE year.
      withdrawalTax: taxProfile
        ? { basisToday: initialPortfolio * (1 - (startYears > 0 && (fireStart?.kind === 'fire' || fireStart?.kind === 'target') && fireStart.gainShare !== null ? fireStart.gainShare : taxProfile.gainShare)), rate: taxProfile.rate }
        : undefined,
      flows: datedFlows,
      ...(startYears > 0 ? { startYear: startYears } : {}),
    };
  }, [form, scenarios, market.correlations, market.leverageSpread, assumptions?.costs, pensionInflows, statePensionInflows, taxProfile, datedFlows, startYears, fireStart, currentAge]);

  const allocationSum = params ? MONTE_CARLO_CLASSES.reduce((sum, cls) => sum + params.weights[cls], 0) : 0;
  const runnable = !!params && params.initialPortfolio > 0 && params.annualWithdrawal > 0;
  // Below 100% or above 300% the run stays blocked; in between a sum above 100% is leverage (R4).
  const totalState = resolveAllocationTotalState(allocationSum);
  // Nominal sum of the dated outflows over the horizon: enough to tell «the flows alone exceed the capital».
  const datedOutflows = useMemo(
    () => resolvedFlows.reduce((sum, flow) => (flow.sigma === 1 || (flow.sigma === 0 && flow.kind === 'lumpOut') ? sum + flow.amount * (flow.sigma === 0 ? 1 : Math.min(flow.durationYears ?? 60, 60)) : sum), 0),
    [resolvedFlows],
  );
  const leverage = weightsLeverage(MONTE_CARLO_CLASSES.map((cls) => (params ? params.weights[cls] : 0)));
  const canRun = fireStart?.kind !== 'depleted' && runnable && (totalState === 'plain' || totalState === 'leveraged') && !!params && params.retirementYears >= 1 && params.retirementYears <= 60;

  // RQ6 (Q2): the uncertainty per class the Base draws each path's means from (Bear and Bull are the RQ5 stress).
  const uncertainty = useMemo(() => marketUncertainty(market), [market]);
  const currentInputs = useMemo<MonteCarloRunInputs | null>(
    () => (params ? { params, scenarios, inflows: pensionInflows, uncertainty } : null),
    [params, scenarios, pensionInflows, uncertainty],
  );

  // ─── The run: the three scenarios in one go ──────────────────────────────────
  const [lastRun, setLastRun] = useState<MonteCarloRunState | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runScenarios = useCallback((inputs: MonteCarloRunInputs) => {
    setIsRunning(true);
    // Monte Carlo is CPU-bound and blocks the main thread: the delay lets the browser paint the
    // running state before the computation starts.
    window.setTimeout(() => {
      try {
        // Seeded (T3): each run draws from a fresh generator on the SAME seed, so the three scenarios and the
        // unleveraged Base meet the same shocks and a re-run with the same inputs gives the same figures.
        // RQ6 (Q2): the Base alone draws each path's means, from a fresh generator on its own seed — the leveraged
        // and the unleveraged Base meet the same means too (A13).
        const run = (scenario: keyof typeof inputs.scenarios, params: MonteCarloParams, keepFactors = true): MonteCarloResults =>
          runMonteCarloSimulation(
            {
              ...buildScenarioParams(params, inputs.scenarios[scenario]),
              random: createSeededRandom(MONTE_CARLO_SEED),
              ...(scenario === 'base' && inputs.uncertainty
                ? { uncertainty: inputs.uncertainty, parameterRandom: createSeededRandom(MONTE_CARLO_PARAMETER_SEED) }
                : {}),
            },
            { keepFactors },
          );
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
    // The flows are part of the plan: the first run waits for the mortgage linked in Patrimonio to be read.
    if (didAutoRunRef.current || !currentInputs || !canRun || isLoadingFlows) return;
    didAutoRunRef.current = true;
    const timer = setTimeout(() => runScenarios(currentInputs), 0);
    return () => clearTimeout(timer);
  }, [currentInputs, canRun, runScenarios, isLoadingFlows]);

  const handleRun = useCallback(() => {
    if (currentInputs && canRun) runScenarios(currentInputs);
  }, [currentInputs, canRun, runScenarios]);

  // ─── The numbers (pure layer over the results) ───────────────────────────────
  const runParams = lastRun?.inputs.params ?? null;
  // The shown run keeps ITS start: a mode changed since is a stale input, not a different reading of the figures (The Stale-Run Rule).
  const runStartYears = runParams?.startYear ?? 0;
  const runCtx = useMemo(() => contextFor(runStartYears), [contextFor, runStartYears]);
  const scenarioInflation = useMemo(() => (lastRun ? { bear: lastRun.inputs.scenarios.bear.inflationRate, base: lastRun.inputs.scenarios.base.inflationRate, bull: lastRun.inputs.scenarios.bull.inflationRate } : null), [lastRun]);
  const run = useMemo(() => (lastRun && runParams ? summarizeMonteCarloRun(lastRun.results.base, runParams, { ...runCtx, inflationRate: scenarioInflation?.base }) : null), [lastRun, runParams, runCtx, scenarioInflation]);
  const comparison = useMemo(() => (lastRun && runParams && scenarioInflation ? summarizeScenarios(lastRun.results, runParams, runCtx, scenarioInflation) : null), [lastRun, runParams, runCtx, scenarioInflation]);
  const overlay = useMemo(() => (lastRun && scenarioInflation ? buildOverlaySeries(lastRun.results, runCtx.startCalendarYear, scenarioInflation) : []), [lastRun, runCtx.startCalendarYear, scenarioInflation]);
  const percentileRows = useMemo(() => (lastRun && scenarioInflation ? buildPercentileRows(lastRun.results.base.percentiles, runCtx.startCalendarYear, 5, scenarioInflation.base) : []), [lastRun, runCtx.startCalendarYear, scenarioInflation]);
  const fanPercentiles = useMemo(() => (lastRun && scenarioInflation ? deflatePercentiles(lastRun.results.base.percentiles, scenarioInflation.base) : []), [lastRun, scenarioInflation]);
  // The plan as typed (the Parametri reading) and the plan the shown results ran on (the Dettaglio).
  const typedPlan = useMemo(() => (params ? summarizeMonteCarloPlan(params, pensionInflows, pensionLockedValue, ctx) : null), [params, pensionInflows, pensionLockedValue, ctx]);
  const runPlan = useMemo(() => (runParams && lastRun ? summarizeMonteCarloPlan(runParams, lastRun.inputs.inflows, pensionLockedValue, runCtx) : null), [runParams, lastRun, pensionLockedValue, runCtx]);
  const stale = !!lastRun && !!currentInputs && haveRunInputsChanged(lastRun.inputs, currentInputs);

  // S1: the nine figures were computed with the run (on its own factors), so they are the LAST run's — never the typed inputs' (Stale-Run).
  const sustainable = lastRun?.sustainable ?? null;
  const sustainableVerdictInput = useMemo(() => {
    const base90 = sustainable?.rows.find((row) => row.probability === SUSTAINABLE_VERDICT_PROBABILITY)?.base;
    return sustainable && base90 && runParams ? { base90, capital: sustainable.capital, typedWithdrawal: runParams.annualWithdrawal, leverage, datedOutflows } : null;
  }, [sustainable, runParams, leverage, datedOutflows]);

  // ─── The words (pure layer) ───────────────────────────────────────────────────
  const unleveragedSuccessRate = lastRun?.results.unleveragedBase?.successRate ?? null;
  const verdictStart = useMemo(
    () => (runParams ? { atFire: runStartYears > 0, calendarYear: runCtx.startCalendarYear, age: runCtx.currentAge, capital: runParams.initialPortfolio } : null),
    [runParams, runStartYears, runCtx],
  );
  const verdict = useMemo(
    () => buildMonteCarloVerdict({ runnable, run, scenarios: comparison, lock, unleveragedSuccessRate, sustainable: sustainableVerdictInput, start: verdictStart }),
    [runnable, run, comparison, lock, unleveragedSuccessRate, sustainableVerdictInput, verdictStart],
  );

  // ─── Loading: until the seeded plan has run once ─────────────────────────────
  const awaitingFirstRun = runnable && canRun && !lastRun;
  // A failed read comes BEFORE the wait: these queries default to undefined, and a plan built
  // on a base that was never read is a number with nothing behind it.
  if (resolveSurfaceState({ loading: isLoadingAssets || isLoadingSettings || isLoadingAssumptions || baselineLoading, failed: assetsError || settingsError || assumptionsError || cashflowError }) === 'failed') {
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

  if (isLoadingAssets || isLoadingSettings || isLoadingAssumptions || isLoadingFlows || baselineLoading || !fireStart || !form || !params || !typedPlan || awaitingFirstRun) {
    return <TileGridSkeleton cells={SKELETON_CELLS} />;
  }

  // RD4: a fund that unlocks at or before the FIRE year is already in the capital the run starts from — no step on the plot.
  const unlockOnPlot =
    lock.active && lock.lockedValue > 0 && lock.unlockCalendarYear !== null && run !== null && lock.unlockCalendarYear <= run.endCalendarYear && (runStartYears === 0 || lock.unlockCalendarYear > run.startCalendarYear)
      ? lock.unlockCalendarYear
      : null;
  const startOptions: ReadonlyArray<SegmentedPillOption<StartMode>> | null =
    fireStart.kind === 'fire' || fireStart.kind === 'target'
      ? [
          { value: 'fire', label: START_MODE_LABELS.fire(fireStart) },
          { value: 'today', label: START_MODE_LABELS.today(fireStart) },
        ]
      : null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="pt-1">
        <FireAssumptionsRow assumptions={assumptionsWithFlows} />
        <PageVerdict verdict={verdict} ariaLabel="Verdetto su Dopo il FIRE" />
      </div>

      {/* Tablet (768-1439): every tile full width, in the phone's order. */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        {sustainable && runParams && (
          <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
            <SpesaSostenibileTile reading={describeSpesaSostenibile(sustainable, runParams.retirementYears, { leverage, datedOutflows })} aside={SPESA_ASIDE} summary={sustainable} />
          </div>
        )}

        {run && lastRun && (
          <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none desktop:col-span-8')}>
            <ProbabilitaTile
              reading={describeProbabilita(run)}
              aside={describeProbabilitaAside(run)}
              run={run}
              chart={
                <MonteCarloFanChart
                  percentiles={fanPercentiles}
                  startCalendarYear={run.startCalendarYear}
                  unlockCalendarYear={unlockOnPlot}
                  height="100%"
                  ariaLabel={`Ventaglio del piano di prelievo in euro di oggi, scenario base: bande dei percentili 10–90 e 25–75 e mediana delle ${run.simulations.toLocaleString('it-IT')} simulazioni dal ${run.startCalendarYear} al ${run.endCalendarYear}; la linea tratteggiata in basso è il capitale esaurito.`}
                />
              }
              footer={describeProbabilitaFooter(run, lock)}
            />
          </div>
        )}

        {comparison && (
          <div className={cn(TILE_CELL_CLASS, 'order-3 tablet:col-span-2 desktop:order-none desktop:col-span-4')}>
            <ScenariConfrontoTile
              reading={describeScenari(comparison)}
              aside={SCENARI_ASIDE}
              rows={comparison.rows.map((row) => ({ key: row.key, label: scenarioLabel(row.key), successRate: row.successRate, note: describeScenarioNote(row) }))}
              footer={SCENARI_FOOTER}
            />
          </div>
        )}

        <div className={cn(TILE_CELL_CLASS, 'order-4 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
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
            capital={capital}
            start={{
              mode: startMode,
              options: startOptions,
              onModeChange: onStartModeChange,
              note: describeFireStartRow(fireStart, startMode, currentYear),
              fireCapital: fireStart.kind === 'fire' || fireStart.kind === 'target' ? fireStart.capitalToday : null,
            }}
            flowsNote={describeSimulationFlowsRow({ count: resolvedFlows.length, excluded: excludedFlows, fireAnchored: resolvedFlows.filter((flow) => flow.anchor === 'fire').length, view: 'monteCarlo' })}
            onRun={handleRun}
            onReset={resetToPlan}
            canRun={canRun}
            isRunning={isRunning}
            footer={
              lastRun
                ? describeParametriFooter({ stale, simulations: lastRun.inputs.params.numberOfSimulations })
                : [{ text: canRun ? 'Premi Prova per lanciare i tre scenari.' : 'Completa il piano: patrimonio e prelievo maggiori di zero, allocazione tra 100% e 300%, da 1 a 60 anni.' }]
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
