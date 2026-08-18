'use client';

/**
 * FireCalculatorTab Component — single-answer IA (Spec 4).
 *
 * The page answers two questions at a glance and defers everything else:
 *   1. HERO [2fr_1fr] — "Quando?": the projected FIRE calendar year in the base scenario
 *      (verdict "FIRE proiettato nel {anno}, a {età}"), % verso FI + gap; the companion card
 *      answers "Quanto posso spendere?" (sustainable passive income). A basis line under the
 *      hero declares the active assumptions (SWR, casa, fondo pensione).
 *   2. "Impostazioni" — ONE collapsible (SWR, casa, fondo pensione + RITA), config-first
 *      collapse with a useRef seeded-flag (never keyed on the transient hasUnsavedChanges).
 *   3. "Proiezione" — FIREProjectionSection with the Scenari | Ventaglio pill.
 *   4. "Dettaglio" — the two historical charts and the FIRE explainer, demoted, nothing deleted.
 *
 * Data flow (no formula changes — presentation over existing pure functions):
 * 1. settings + assets + annualCashflowData queries (independent, staleTime 5min)
 * 2. fireData query (depends on assets + settings — gated by `enabled`)
 * 3. displayedFireMetrics + the deterministic projection derived client-side via useMemo so
 *    preview changes (WR, toggles, scenario params) are instant without re-fetching
 *
 * Preview pattern: user edits form → temp state updates → displayed metrics re-compute
 * instantly → banner "Anteprima locale attiva" appears → explicit Save persists to Firestore.
 *
 * The old FireReachedBanner is absorbed into the hero verdict (one announcement, not two);
 * its one-shot confetti keeps the SAME localStorage key so it never re-fires for existing users.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useChartColors } from '@/lib/hooks/useChartColors';
import {
  getAllAssets,
  calculateFIRENetWorth,
  calculateLiquidFIRENetWorth,
  calculateIlliquidFIRENetWorth,
  calculateAssetValue,
} from '@/lib/services/assetService';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import {
  getSettings,
  setSettings,
  getDefaultTargets,
  calculateCurrentAllocation,
} from '@/lib/services/assetAllocationService';
import {
  DEFAULT_INPS_RETIREMENT_AGE,
  resolvePensionLockState,
  resolveRitaUnlockAge,
  type PensionUnlockSettings,
} from '@/lib/utils/pensionUnlock';
import {
  getFIREData,
  getAnnualCashflowData,
  calculateFIREMetrics,
  calculateFireBridgeNumber,
  calculateFIREProjection,
  getDefaultScenarios,
  prepareRunwaySummaryLabel,
  type FIREMetrics,
  type FireProjectionPensionBridge,
} from '@/lib/services/fireService';
import { getDefaultMarketParameters } from '@/lib/services/monteCarloService';
import { deriveMonteCarloAllocation } from '@/lib/utils/monteCarloParams';
import { hasCelebrated, markCelebrated, shouldReduceMotion } from '@/lib/utils/celebrationUtils';
import { formatDate } from '@/lib/utils/formatters';
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { fmtCurrency } from '@/lib/utils/chartUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertTriangle, ChevronDown, HelpCircle, Info, Loader2 } from 'lucide-react';
import { FireCalculatorSkeleton } from '@/components/fire-simulations/FireCalculatorSkeleton';
import { toast } from 'sonner';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Settings } from '@/types/settings';
import { FIREProjectionScenarios } from '@/types/assets';
import { FIREProjectionSection, type FanSimulationInputs } from './FIREProjectionSection';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/lib/utils/useCountUp';

const FIRE_CONTROL_CLASSNAME =
  'mt-1 transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

/** How many Monte Carlo paths the Ventaglio runs — plenty for stable deciles, cheap on mobile. */
const FAN_SIMULATION_COUNT = 1000;

// Leaf nodes isolate count-up re-renders so surrounding layout doesn't reflow
function SettledCurrencyValue({ value, className }: { value: number | null; className?: string }) {
  const animatedValue = useCountUp(value, { fromPrevious: true, duration: 520, startDelay: 0 });
  return <span className={className}>{formatCurrency(animatedValue ?? value ?? 0)}</span>;
}

function SettledPercentageValue({ value, className }: { value: number | null; className?: string }) {
  const animatedValue = useCountUp(value, { fromPrevious: true, duration: 520, startDelay: 0 });
  return <span className={className}>{formatPercentage(animatedValue ?? value ?? 0)}</span>;
}

function SettledYearsValue({
  value,
  className,
  decimals = 1,
}: {
  value: number | null;
  className?: string;
  decimals?: number;
}) {
  const animatedValue = useCountUp(value, { fromPrevious: true, duration: 520, startDelay: 0 });
  if (value === null) return <span className={className}>—</span>;
  return <span className={className}>{(animatedValue ?? value).toFixed(decimals)}</span>;
}

function roundRunwayYears(value: number): number {
  return Math.round(value * 10) / 10;
}

function calculateDisplayedRunwayDelta(
  latestValue: number | null | undefined,
  comparisonValue: number | null | undefined
): number | null {
  if (latestValue == null || comparisonValue == null) return null;
  return roundRunwayYears(roundRunwayYears(latestValue) - roundRunwayYears(comparisonValue));
}

/** Small flat row for the passive-income companion card. */
function CompanionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function FireCalculatorTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const chartColors = useChartColors();

  const [tempWithdrawalRate, setTempWithdrawalRate] = useState<string>('4.0');
  const [includePrimaryResidence, setIncludePrimaryResidence] = useState<boolean>(false);
  const [respectPensionLockIn, setRespectPensionLockIn] = useState<boolean>(false);
  const [tempInpsRetirementAge, setTempInpsRetirementAge] = useState<string>(
    DEFAULT_INPS_RETIREMENT_AGE.toString()
  );
  const [tempRitaLongUnemployment, setTempRitaLongUnemployment] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState<boolean>(false);
  const [scenarios, setScenarios] = useState<FIREProjectionScenarios>(getDefaultScenarios());

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

  // Annual savings/expenses for the projection — lifted from FIREProjectionSection because the
  // hero verdict now needs the projection too. Same source, same figures as before.
  const { data: cashflowData, isLoading: isLoadingCashflow } = useQuery({
    queryKey: ['annualCashflowData', ownerId],
    queryFn: () => getAnnualCashflowData(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });
  const annualSavings = cashflowData?.annualSavings ?? 0;
  const projectionAnnualExpenses = cashflowData?.annualExpensesFromCashflow ?? 0;

  const withdrawalRate = settings?.withdrawalRate ?? 4.0;

  // Sync scenario params from Firestore when settings load
  useEffect(() => {
    if (settings?.fireProjectionScenarios) {
      setScenarios(settings.fireProjectionScenarios);
    }
  }, [settings?.fireProjectionScenarios]);

  // RITA rule preview inputs: the estimated unlock updates instantly with the two controls,
  // like every other setting on this page (persisted only on Save).
  const parsedInpsRetirementAge = Number.parseInt(tempInpsRetirementAge, 10);
  const previewInpsRetirementAge =
    Number.isFinite(parsedInpsRetirementAge) &&
    parsedInpsRetirementAge >= 60 &&
    parsedInpsRetirementAge <= 75
      ? parsedInpsRetirementAge
      : (settings?.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE);
  const pensionUnlockSettings: PensionUnlockSettings = {
    userAge: settings?.userAge,
    pensionInpsRetirementAge: previewInpsRetirementAge,
    pensionRitaLongUnemployment: tempRitaLongUnemployment,
  };

  // Locked pension capital (unlock resolved by pensionUnlock.ts: per-fund override > RITA rule
  // from userAge > not modellable) stays in the app's total net worth everywhere else — it only
  // leaves what THIS calculator treats as spendable now. Memoized because the fan inputs (and
  // the projection memo) key on its identity.
  const pensionLockState = useMemo(() => {
    if (!respectPensionLockIn || !assets) return null;
    return resolvePensionLockState(
      assets,
      {
        userAge: settings?.userAge,
        pensionInpsRetirementAge: previewInpsRetirementAge,
        pensionRitaLongUnemployment: tempRitaLongUnemployment,
      },
      new Date(),
      calculateAssetValue
    );
  }, [
    respectPensionLockIn,
    assets,
    settings?.userAge,
    previewInpsRetirementAge,
    tempRitaLongUnemployment,
  ]);
  const pensionLockedValue = pensionLockState?.totalLockedToday ?? 0;

  // Bridge model inputs (Spec 3). Funds with different unlock years are aggregated on the
  // LATEST year — conservative when the floor binds, and neutral otherwise because the fund
  // grows and is discounted at the same scenario real return.
  const baseScenarioParams = (settings?.fireProjectionScenarios ?? getDefaultScenarios()).base;
  const baseRealReturn = baseScenarioParams.growthRate - baseScenarioParams.inflationRate;
  const pensionUnlockYears =
    pensionLockState && pensionLockState.inflows.length > 0
      ? Math.max(...pensionLockState.inflows.map((inflow) => inflow.yearsFromNow))
      : 0;
  const pensionBridge: FireProjectionPensionBridge | null =
    pensionLockedValue > 0 && pensionUnlockYears > 0
      ? { valueToday: pensionLockedValue, yearsToUnlock: pensionUnlockYears }
      : null;

  // With the toggle on, the shown FIRE Number is the BRIDGE number: free assets must cover the
  // spending bridge until the unlock, then the fund tops up the standard requirement.
  const applyPensionBridge = (metrics: FIREMetrics): FIREMetrics => {
    if (!pensionBridge) return metrics;
    const { bridgeFireNumber } = calculateFireBridgeNumber({
      annualExpenses: metrics.annualExpenses,
      withdrawalRate: metrics.withdrawalRate,
      realReturn: baseRealReturn,
      yearsToUnlock: pensionBridge.yearsToUnlock,
      pensionValueToday: pensionBridge.valueToday,
      pensionGrowthRate: baseRealReturn,
    });
    return {
      ...metrics,
      fireNumber: bridgeFireNumber,
      progressToFI: bridgeFireNumber > 0 ? (metrics.currentNetWorth / bridgeFireNumber) * 100 : 0,
    };
  };

  const currentNetWorth = assets
    ? calculateFIRENetWorth(assets, includePrimaryResidence) - pensionLockedValue
    : 0;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const illiquidNetWorth = assets
    ? Math.max(0, calculateIlliquidFIRENetWorth(assets, includePrimaryResidence) - pensionLockedValue)
    : 0;

  const { data: fireData, isLoading: isLoadingFIRE } = useQuery({
    queryKey: ['fireData', ownerId, currentNetWorth, withdrawalRate, includePrimaryResidence],
    queryFn: () => getFIREData(user!.uid, currentNetWorth, withdrawalRate, includePrimaryResidence),
    enabled: !!user && !!assets && currentNetWorth > 0,
    staleTime: 300000,
  });

  // Enrich with liquid/illiquid breakdown after async fetch resolves
  const fireMetrics = fireData?.metrics
    ? applyPensionBridge(
        calculateFIREMetrics(
          currentNetWorth,
          fireData.metrics.annualExpenses,
          withdrawalRate,
          liquidNetWorth,
          illiquidNetWorth
        )
      )
    : null;
  const chartData = fireData?.chartData ?? [];
  const rawRunwayData = fireData?.runwayData ?? [];

  // Preview values: update instantly from temp state without persisting
  const parsedPreviewWithdrawalRate = Number.parseFloat(tempWithdrawalRate);
  const previewWithdrawalRate =
    Number.isFinite(parsedPreviewWithdrawalRate) && parsedPreviewWithdrawalRate > 0
      ? parsedPreviewWithdrawalRate
      : withdrawalRate;
  const hasUnsavedChanges =
    tempWithdrawalRate !== (settings?.withdrawalRate ?? 4.0).toString() ||
    includePrimaryResidence !== (settings?.includePrimaryResidenceInFIRE ?? false) ||
    respectPensionLockIn !== (settings?.respectPensionLockInFire ?? false) ||
    tempInpsRetirementAge !==
      (settings?.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE).toString() ||
    tempRitaLongUnemployment !== (settings?.pensionRitaLongUnemployment ?? false);

  // Decide the panel's initial state ONCE, after the form has settled to match saved settings
  // (hasUnsavedChanges === false ⇒ temp state has been seeded). Collapsed when a withdrawal rate
  // is already saved, open for config-first users. Waiting for the settled state avoids the
  // transient first-render mismatch (temp '4.0' vs saved '4') popping the panel open. The settings
  // inputs live inside the collapsible, so genuine edits only happen while it is already open.
  const hasSeededSettingsRef = useRef(false);
  useEffect(() => {
    if (hasSeededSettingsRef.current || isLoadingSettings || hasUnsavedChanges) return;
    hasSeededSettingsRef.current = true;
    if (settings?.withdrawalRate == null) setSettingsOpen(true);
  }, [isLoadingSettings, hasUnsavedChanges, settings?.withdrawalRate]);

  // After seeding, reopen if a genuine unsaved edit appears (keeps the preview banner visible).
  useEffect(() => {
    if (hasSeededSettingsRef.current && hasUnsavedChanges) setSettingsOpen(true);
  }, [hasUnsavedChanges]);

  // Primitive mirrors of pensionBridge so the memos below can depend on stable values.
  const pensionBridgeValueToday = pensionBridge?.valueToday ?? 0;
  const pensionBridgeYearsToUnlock = pensionBridge?.yearsToUnlock ?? 0;

  const displayedFireMetrics = useMemo(() => {
    if (!fireData?.metrics) return null;
    const metrics = calculateFIREMetrics(
      currentNetWorth,
      fireData.metrics.annualExpenses,
      previewWithdrawalRate,
      liquidNetWorth,
      illiquidNetWorth
    );
    if (pensionBridgeValueToday <= 0 || pensionBridgeYearsToUnlock <= 0) return metrics;
    // Same bridge override as applyPensionBridge, inlined so the memo depends on primitives.
    const { bridgeFireNumber } = calculateFireBridgeNumber({
      annualExpenses: metrics.annualExpenses,
      withdrawalRate: previewWithdrawalRate,
      realReturn: baseRealReturn,
      yearsToUnlock: pensionBridgeYearsToUnlock,
      pensionValueToday: pensionBridgeValueToday,
      pensionGrowthRate: baseRealReturn,
    });
    return {
      ...metrics,
      fireNumber: bridgeFireNumber,
      progressToFI: bridgeFireNumber > 0 ? (currentNetWorth / bridgeFireNumber) * 100 : 0,
    };
  }, [
    currentNetWorth,
    fireData?.metrics,
    liquidNetWorth,
    previewWithdrawalRate,
    illiquidNetWorth,
    pensionBridgeValueToday,
    pensionBridgeYearsToUnlock,
    baseRealReturn,
  ]);

  // The deterministic projection — the hero's "Quando?" and the Proiezione section share it.
  const projection = useMemo(() => {
    if (currentNetWorth <= 0 || projectionAnnualExpenses <= 0 || previewWithdrawalRate <= 0) {
      return null;
    }
    return calculateFIREProjection(
      currentNetWorth,
      projectionAnnualExpenses,
      annualSavings,
      previewWithdrawalRate,
      scenarios,
      50,
      pensionBridgeValueToday > 0 && pensionBridgeYearsToUnlock > 0
        ? { valueToday: pensionBridgeValueToday, yearsToUnlock: pensionBridgeYearsToUnlock }
        : undefined
    );
  }, [
    currentNetWorth,
    projectionAnnualExpenses,
    annualSavings,
    previewWithdrawalRate,
    scenarios,
    pensionBridgeValueToday,
    pensionBridgeYearsToUnlock,
  ]);

  // Fan (Ventaglio) inputs: market exposure from the REAL portfolio via the shared normalizer
  // (identical to the Monte Carlo tab's), market params from the saved MC base scenario or the
  // defaults, expenses inflated with the SAME base-scenario inflation as the deterministic
  // target line. Inflows at TODAY's value, per the MC convention (AGENTS → FIRE).
  const pensionCapitalInflows = useMemo(
    () =>
      (pensionLockState?.inflows ?? []).map((inflow) => ({
        year: inflow.yearsFromNow,
        amount: inflow.amount,
      })),
    [pensionLockState]
  );
  const fanInputs = useMemo<FanSimulationInputs | null>(() => {
    if (!assets || assets.length === 0) return null;
    if (currentNetWorth <= 0 || projectionAnnualExpenses <= 0 || previewWithdrawalRate <= 0) {
      return null;
    }
    const allocation = deriveMonteCarloAllocation(calculateCurrentAllocation(assets).byAssetClass);
    if (!allocation) return null;
    const market = settings?.monteCarloScenarios?.base ?? getDefaultMarketParameters();
    return {
      initialPortfolio: currentNetWorth,
      annualSavings,
      annualExpenses: projectionAnnualExpenses,
      withdrawalRate: previewWithdrawalRate,
      expenseInflationRate: scenarios.base.inflationRate,
      ...allocation,
      equityReturn: market.equityReturn,
      equityVolatility: market.equityVolatility,
      bondsReturn: market.bondsReturn,
      bondsVolatility: market.bondsVolatility,
      realEstateReturn: market.realEstateReturn,
      realEstateVolatility: market.realEstateVolatility,
      commoditiesReturn: market.commoditiesReturn,
      commoditiesVolatility: market.commoditiesVolatility,
      numberOfSimulations: FAN_SIMULATION_COUNT,
      capitalInflows: pensionCapitalInflows.length > 0 ? pensionCapitalInflows : undefined,
    } satisfies FanSimulationInputs;
  }, [
    assets,
    currentNetWorth,
    projectionAnnualExpenses,
    annualSavings,
    previewWithdrawalRate,
    scenarios.base.inflationRate,
    settings?.monteCarloScenarios,
    pensionCapitalInflows,
  ]);

  const displayedRunwayData = useMemo(() => {
    const targetYearsOfExpenses = previewWithdrawalRate > 0 ? 100 / previewWithdrawalRate : null;
    return rawRunwayData.map((point) => ({
      ...point,
      targetYearsOfExpenses,
      fireProgressToFI:
        point.trailing12mExpenses > 0 && previewWithdrawalRate > 0
          ? (point.fireNetWorthUsed /
              (point.trailing12mExpenses / (previewWithdrawalRate / 100))) *
            100
          : null,
    }));
  }, [previewWithdrawalRate, rawRunwayData]);

  const displayedRunwaySummary = useMemo(() => {
    const latestPoint = displayedRunwayData[displayedRunwayData.length - 1] ?? null;
    const comparisonPoint = latestPoint
      ? (displayedRunwayData.find(
          (p) => p.year === latestPoint.year - 1 && p.month === latestPoint.month
        ) ?? null)
      : null;
    return {
      currentMonthLabel: latestPoint?.monthLabel ?? null,
      currentYearsOfExpenses: latestPoint?.yearsOfExpenses ?? null,
      currentLiquidYearsOfExpenses: latestPoint?.liquidYearsOfExpenses ?? null,
      totalDeltaVs12Months: calculateDisplayedRunwayDelta(
        latestPoint?.yearsOfExpenses,
        comparisonPoint?.yearsOfExpenses
      ),
      liquidDeltaVs12Months: calculateDisplayedRunwayDelta(
        latestPoint?.liquidYearsOfExpenses,
        comparisonPoint?.liquidYearsOfExpenses
      ),
      currentProgressToFI: latestPoint?.fireProgressToFI ?? null,
      targetYearsOfExpenses:
        latestPoint?.targetYearsOfExpenses ??
        (previewWithdrawalRate > 0 ? 100 / previewWithdrawalRate : null),
    };
  }, [displayedRunwayData, previewWithdrawalRate]);

  // Sync form state when settings load or change (runs once data has loaded — even when the user
  // has no settings doc yet — so temp state always settles to the saved-or-default values).
  useEffect(() => {
    if (isLoadingSettings) return;
    setTempWithdrawalRate((settings?.withdrawalRate ?? 4.0).toString());
    setIncludePrimaryResidence(settings?.includePrimaryResidenceInFIRE ?? false);
    setRespectPensionLockIn(settings?.respectPensionLockInFire ?? false);
    setTempInpsRetirementAge(
      (settings?.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE).toString()
    );
    setTempRitaLongUnemployment(settings?.pensionRitaLongUnemployment ?? false);
  }, [isLoadingSettings, settings]);

  const handleResetToSaved = () => {
    setTempWithdrawalRate((settings?.withdrawalRate ?? 4.0).toString());
    setIncludePrimaryResidence(settings?.includePrimaryResidenceInFIRE ?? false);
    setRespectPensionLockIn(settings?.respectPensionLockInFire ?? false);
    setTempInpsRetirementAge(
      (settings?.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE).toString()
    );
    setTempRitaLongUnemployment(settings?.pensionRitaLongUnemployment ?? false);
  };

  const mutation = useMutation({
    mutationFn: (newSettings: {
      withdrawalRate: number;
      includePrimaryResidenceInFIRE?: boolean;
      respectPensionLockInFire?: boolean;
      pensionInpsRetirementAge?: number;
      pensionRitaLongUnemployment?: boolean;
    }) =>
      setSettings(user!.uid, {
        ...settings,
        targets: settings?.targets || getDefaultTargets(),
        ...newSettings,
      }),
    onSuccess: () => {
      toast.success('Impostazioni FIRE salvate con successo');
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    },
    onError: (error) => {
      console.error('Error saving FIRE settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni FIRE');
    },
  });

  const scenarioSaveMutation = useMutation({
    mutationFn: () =>
      setSettings(user!.uid, {
        ...settings,
        targets: settings?.targets || getDefaultTargets(),
        fireProjectionScenarios: scenarios,
      }),
    onSuccess: () => {
      toast.success('Parametri scenari salvati con successo');
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    },
    onError: (error) => {
      console.error('Error saving scenario parameters:', error);
      toast.error('Errore nel salvataggio dei parametri scenari');
    },
  });

  const handleResetScenarios = () => {
    setScenarios(getDefaultScenarios());
    toast.success('Parametri ripristinati ai valori predefiniti');
  };

  const handleSaveSettings = () => {
    const newWR = parseFloat(tempWithdrawalRate);

    if (isNaN(newWR) || newWR <= 0 || newWR > 100) {
      toast.error('Inserisci un Withdrawal Rate valido tra 0 e 100');
      return;
    }

    const newInpsAge = Number.parseInt(tempInpsRetirementAge, 10);
    if (!Number.isFinite(newInpsAge) || newInpsAge < 60 || newInpsAge > 75) {
      toast.error("Inserisci un'età pensione INPS valida tra 60 e 75");
      return;
    }

    mutation.mutate({
      withdrawalRate: newWR,
      includePrimaryResidenceInFIRE: includePrimaryResidence,
      respectPensionLockInFire: respectPensionLockIn,
      pensionInpsRetirementAge: newInpsAge,
      pensionRitaLongUnemployment: tempRitaLongUnemployment,
    });
  };

  // ===== Hero derivations (Quando? — base scenario of the deterministic projection) =====

  const currentYear = getItalyYear();
  const baseYearsToFIRE = projection?.baseYearsToFIRE ?? null;
  const fireCalendarYear = baseYearsToFIRE !== null ? currentYear + baseYearsToFIRE : null;
  const fireAge =
    baseYearsToFIRE !== null && settings?.userAge != null
      ? settings.userAge + baseYearsToFIRE
      : null;
  const fireReached =
    !!displayedFireMetrics &&
    displayedFireMetrics.fireNumber > 0 &&
    currentNetWorth >= displayedFireMetrics.fireNumber;
  const fireGap = displayedFireMetrics
    ? Math.max(0, displayedFireMetrics.fireNumber - currentNetWorth)
    : 0;
  const pensionUnlockCalendarYear = currentYear + pensionUnlockYears;

  // One-shot confetti, inherited from the absorbed FireReachedBanner: SAME localStorage key
  // (`celebrated_fire_reached_{ownerId}` via celebrationUtils), so nobody who already saw it
  // gets a second burst. Guarded on the SAVED metrics, never on a preview.
  const fireReachedSaved =
    !!fireMetrics && fireMetrics.fireNumber > 0 && currentNetWorth >= fireMetrics.fireNumber;
  useEffect(() => {
    if (!fireReachedSaved || !ownerId) return;
    const confettiKey = `fire_reached_${ownerId}`;
    if (hasCelebrated(confettiKey) || shouldReduceMotion()) return;
    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.3 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b'],
      });
      markCelebrated(confettiKey);
    });
  }, [fireReachedSaved, ownerId]);

  if (isLoadingSettings || isLoadingAssets || (currentNetWorth > 0 && isLoadingFIRE)) {
    return <FireCalculatorSkeleton />;
  }

  // Compact trigger label summarises active settings at a glance
  const settingsTriggerLabel = `Safe Withdrawal Rate ${previewWithdrawalRate}%`;

  // Estimated-unlock copy under the RITA controls: rule-driven funds get "Sblocco stimato",
  // override-driven ones point at the per-fund date; funds with neither stay unmodelled + warned.
  const lockedFunds = pensionLockState?.funds.filter((info) => info.isLocked) ?? [];
  const overrideLockedFunds = lockedFunds.filter((info) => {
    const override = info.fund.pensionFundDetails?.unlockDate;
    return !!override && !Number.isNaN(new Date(override).getTime());
  });
  const ruleLockedFunds = lockedFunds.filter((info) => !overrideLockedFunds.includes(info));
  const unmodellableFundCount =
    pensionLockState?.funds.filter((info) => info.unlockDate === null).length ?? 0;
  const ritaUnlockAge = resolveRitaUnlockAge(pensionUnlockSettings);
  const ruleUnlockYear =
    settings?.userAge !== undefined
      ? currentYear + Math.max(0, ritaUnlockAge - settings.userAge)
      : null;
  let pensionUnlockSummary: string | null = null;
  if (ruleLockedFunds.length > 0 && ruleUnlockYear !== null) {
    pensionUnlockSummary = `Sblocco stimato: ${ruleUnlockYear}, a ${ritaUnlockAge} anni${
      overrideLockedFunds.length > 0 ? ' (alcuni fondi usano la data impostata sul fondo)' : ''
    }`;
  } else if (overrideLockedFunds.length === 1 && overrideLockedFunds[0].unlockDate) {
    pensionUnlockSummary = `Sblocco: data impostata sul fondo (${formatDate(overrideLockedFunds[0].unlockDate)})`;
  } else if (overrideLockedFunds.length > 1) {
    pensionUnlockSummary = 'Sblocco: date impostate sui singoli fondi';
  }
  const pensionUnlockWarning =
    unmodellableFundCount > 0
      ? "Alcuni fondi non hanno né una data di sblocco né la tua età: imposta la tua età in Coast FIRE o una data di sblocco sul fondo. Finché mancano, restano trattati come non bloccati."
      : null;

  // Hero verdict per state — one announcement, tone included.
  let heroValue = '—';
  let heroQualifier: string | null = null;
  let verdictHeadline = 'Proiezione non disponibile.';
  let verdictDetail = 'Aggiungi entrate e uscite nel Cashflow per stimare l’anno del FIRE.';
  let verdictToneClass = 'text-muted-foreground';
  if (fireReached) {
    heroValue = 'Oggi';
    verdictHeadline = 'Obiettivo FIRE raggiunto.';
    verdictDetail = `Il patrimonio FIRE copre già il FIRE Number con un SWR del ${previewWithdrawalRate}%.`;
    verdictToneClass = 'text-positive';
  } else if (fireCalendarYear !== null && baseYearsToFIRE !== null) {
    heroValue = String(fireCalendarYear);
    const inYears = baseYearsToFIRE === 1 ? 'tra 1 anno' : `tra ${baseYearsToFIRE} anni`;
    heroQualifier = fireAge !== null ? `a ${fireAge} anni · ${inYears}` : inYears;
    verdictHeadline = `FIRE proiettato nel ${fireCalendarYear}${fireAge !== null ? `, a ${fireAge} anni` : ''}.`;
    verdictDetail = `Scenario base, con risparmio di ${formatCurrency(annualSavings)} l’anno e spese in crescita con l’inflazione.`;
    verdictToneClass = 'text-foreground';
  } else if (projection) {
    heroValue = '50+';
    heroQualifier = 'anni nello scenario base';
    verdictHeadline = 'FIRE oltre l’orizzonte di proiezione.';
    verdictDetail =
      'Nello scenario base il traguardo non arriva entro 50 anni: aumenta il risparmio o rivedi le spese.';
    verdictToneClass = 'text-amber-600 dark:text-amber-400';
  }

  const fireNumberNote = pensionBridge
    ? `Modello bridge: asset liberi per il ponte fino al ${pensionUnlockCalendarYear}, poi il fondo rientra`
    : displayedFireMetrics
      ? `${formatCurrency(displayedFireMetrics.annualExpenses)} ÷ ${previewWithdrawalRate}% — spese ${currentYear - 1} su SWR`
      : '';

  const basisParts = [
    `SWR ${previewWithdrawalRate}%`,
    includePrimaryResidence ? 'casa di abitazione inclusa' : 'casa di abitazione esclusa',
    respectPensionLockIn
      ? pensionBridge
        ? `fondo pensione bloccato fino al ${pensionUnlockCalendarYear} (modello bridge)`
        : 'vincolo fondo pensione attivo, nessun fondo bloccato'
      : 'fondo pensione non vincolato',
  ];

  return (
    <div className="space-y-6">
      {/* ── HERO [2fr_1fr]: Quando? + Quanto posso spendere? ── */}
      {displayedFireMetrics ? (
        <>
          <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
            {/* Dominant: the projected FIRE year, with verdict, progress and gap */}
            <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-[22px]">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Traguardo FIRE
                </p>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Scenario base
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-mono text-[44px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[54px]">
                  {heroValue}
                </p>
                {heroQualifier && (
                  <span className="text-[11px] text-muted-foreground">{heroQualifier}</span>
                )}
              </div>

              <p className="mt-3 text-sm">
                <span className={cn('font-semibold', verdictToneClass)}>{verdictHeadline}</span>{' '}
                <span className="text-muted-foreground">{verdictDetail}</span>
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-foreground">
                  <SettledPercentageValue value={displayedFireMetrics.progressToFI} />
                  {' '}verso FI
                </span>
                {!fireReached && fireGap > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    mancano{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {formatCurrency(fireGap)}
                    </span>
                  </span>
                )}
              </div>

              {/* Sticky footer: the two numbers behind the verdict, flat rows */}
              <div className="mt-auto pt-4">
                <div className="divide-y divide-border border-t border-border">
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <span className="text-sm text-muted-foreground">FIRE Number</span>
                      <p className="truncate text-[11px] text-muted-foreground/70">
                        {fireNumberNote}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                      <SettledCurrencyValue value={displayedFireMetrics.fireNumber} />
                    </span>
                  </div>
                  {/* WR corrente: shown destructive when above the safe rate — the only metric
                      that earns sign color here */}
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <span className="text-sm text-muted-foreground">WR corrente</span>
                      {displayedFireMetrics.currentWR > previewWithdrawalRate && (
                        <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground/70">
                          {formatCurrency(displayedFireMetrics.annualExpenses)} /{' '}
                          {formatCurrency(currentNetWorth)} — spese {currentYear - 1} su patrimonio
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold tabular-nums',
                          displayedFireMetrics.currentWR > previewWithdrawalRate
                            ? 'text-destructive'
                            : 'text-foreground'
                        )}
                      >
                        <SettledPercentageValue value={displayedFireMetrics.currentWR} />
                      </span>
                      {displayedFireMetrics.currentWR > previewWithdrawalRate && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Companion: sustainable passive income */}
            <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-[22px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Reddito passivo sostenibile
              </p>
              <p className="mt-2 font-mono text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">
                <SettledCurrencyValue value={displayedFireMetrics.annualAllowance} />
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                all&apos;anno — patrimonio FIRE {formatCurrency(currentNetWorth)} &times;{' '}
                {previewWithdrawalRate}%
              </p>

              <div className="mt-4 divide-y divide-border border-t border-border">
                <CompanionRow label="Mensile">
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                    <SettledCurrencyValue value={displayedFireMetrics.monthlyAllowance} />
                  </span>
                </CompanionRow>
                <CompanionRow label="Giornaliero">
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                    <SettledCurrencyValue value={displayedFireMetrics.dailyAllowance} />
                  </span>
                </CompanionRow>
                {/* yearsOfExpenses is the primary total; liquid/illiquid are the breakdown. */}
                <CompanionRow label="Anni di spesa totali">
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                    {displayedFireMetrics.yearsOfExpenses > 0
                      ? `${displayedFireMetrics.yearsOfExpenses.toFixed(1)} anni`
                      : '—'}
                  </span>
                </CompanionRow>
                <CompanionRow label="Di cui liquidi">
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                    {displayedFireMetrics.liquidYearsOfExpenses > 0
                      ? `${displayedFireMetrics.liquidYearsOfExpenses.toFixed(1)} anni`
                      : '—'}
                  </span>
                </CompanionRow>
                {displayedFireMetrics.illiquidYearsOfExpenses > 0 && (
                  <CompanionRow label="Di cui illiquidi">
                    <span className="font-mono text-[13px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {displayedFireMetrics.illiquidYearsOfExpenses.toFixed(1)} anni
                    </span>
                  </CompanionRow>
                )}
                {pensionBridge && (
                  <CompanionRow label="Fondo pensione">
                    <span className="text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                      {formatCurrency(pensionBridge.valueToday)}{' '}
                      <span className="font-sans font-normal text-muted-foreground">
                        — rientra nel {pensionUnlockCalendarYear}
                      </span>
                    </span>
                  </CompanionRow>
                )}
              </div>
            </div>
          </div>

          {/* Basis line — assumptions declared, not implicit (same pattern as Rendimenti) */}
          <p className="px-1 text-xs text-muted-foreground">
            Base di calcolo: {basisParts.join(' · ')}.
          </p>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Aggiungi asset con un valore positivo per calcolare FIRE Number e reddito passivo
              sostenibile.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Settings — collapsed by default, auto-opens when unsaved changes are present */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <div className="flex cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Impostazioni FIRE</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {settingsTriggerLabel}
                </p>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {hasUnsavedChanges && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-label="Modifiche non salvate"
                  />
                )}
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                    settingsOpen && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="space-y-4 border-t border-border px-6 py-4">
              {/* Unsaved changes banner — Info at rest, Loader2 only during mutation */}
              {hasUnsavedChanges && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    {mutation.isPending ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">Anteprima locale attiva</p>
                      <p className="text-xs text-muted-foreground">
                        Le metriche riflettono i valori inseriti ma non ancora salvati.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <Label htmlFor="withdrawalRate">Safe Withdrawal Rate (%)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none"
                          aria-label="Informazioni sul Safe Withdrawal Rate"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="max-w-[280px] text-sm leading-relaxed">
                        La percentuale del patrimonio che puoi prelevare ogni anno in modo
                        sostenibile. Il 4% (regola del 4%, Trinity Study) garantisce la
                        sopravvivenza del portafoglio su 30 anni nel 95% degli scenari storici.
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Input
                    id="withdrawalRate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={tempWithdrawalRate}
                    onChange={(e) => setTempWithdrawalRate(e.target.value)}
                    className={FIRE_CONTROL_CLASSNAME}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tipicamente 4% secondo la regola del 4% (Trinity Study)
                  </p>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="includePrimaryResidence" className="leading-normal">
                    Includi casa di abitazione nel FIRE
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se disattivo, gli immobili di abitazione sono esclusi (metodologia FIRE
                    standard).
                  </p>
                </div>
                <Switch
                  id="includePrimaryResidence"
                  checked={includePrimaryResidence}
                  onCheckedChange={setIncludePrimaryResidence}
                  className="mt-0.5 shrink-0"
                />
              </div>

              <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor="respectPensionLockIn" className="leading-normal">
                      Considera il fondo pensione come capitale bloccato fino allo sblocco
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Se attivo, il FIRE Number diventa un modello a due fasi: fino allo sblocco
                      servono solo gli asset liberi (il ponte), dallo sblocco il fondo rientra
                      nel capitale. Lo sblocco segue la regola RITA, salvo data impostata sul
                      singolo fondo.
                    </p>
                  </div>
                  <Switch
                    id="respectPensionLockIn"
                    checked={respectPensionLockIn}
                    onCheckedChange={setRespectPensionLockIn}
                    className="mt-0.5 shrink-0"
                  />
                </div>

                {respectPensionLockIn && (
                  <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="pensionInpsRetirementAge">Età pensione INPS</Label>
                        <Input
                          id="pensionInpsRetirementAge"
                          type="number"
                          min="60"
                          max="75"
                          step="1"
                          value={tempInpsRetirementAge}
                          onChange={(e) => setTempInpsRetirementAge(e.target.value)}
                          className={FIRE_CONTROL_CLASSNAME}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          RITA anticipa lo sblocco di 5 anni rispetto a questa età.
                        </p>
                      </div>
                      <div className="flex items-start justify-between gap-3 sm:pt-6">
                        <div className="min-w-0 space-y-0.5">
                          <Label htmlFor="pensionRitaLongUnemployment" className="leading-normal">
                            {"Disoccupato ≥ 24 mesi dopo il FIRE"}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {"Anticipa lo sblocco a INPS − 10 anni."}
                          </p>
                        </div>
                        <Switch
                          id="pensionRitaLongUnemployment"
                          checked={tempRitaLongUnemployment}
                          onCheckedChange={setTempRitaLongUnemployment}
                          className="mt-0.5 shrink-0"
                        />
                      </div>
                    </div>
                    {pensionUnlockSummary && (
                      <p className="text-xs text-muted-foreground">{pensionUnlockSummary}</p>
                    )}
                    {pensionUnlockWarning && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {pensionUnlockWarning}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveSettings}
                  disabled={isDemo || mutation.isPending}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                >
                  {mutation.isPending
                    ? 'Salvataggio...'
                    : hasUnsavedChanges
                      ? 'Salva Anteprima'
                      : 'Salva Impostazioni'}
                </Button>
                {hasUnsavedChanges && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetToSaved}
                    disabled={mutation.isPending}
                  >
                    Annulla
                  </Button>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── PROIEZIONE: Scenari | Ventaglio ── */}
      {displayedFireMetrics && currentNetWorth > 0 && (
        isLoadingCashflow ? (
          <div className="flex h-32 items-center justify-center">
            <div className="text-muted-foreground">Calcolo risparmi annuali...</div>
          </div>
        ) : (
          <FIREProjectionSection
            projection={projection}
            scenarios={scenarios}
            onScenariosChange={setScenarios}
            onSaveScenarios={() => scenarioSaveMutation.mutate()}
            onResetScenarios={handleResetScenarios}
            isSavingScenarios={scenarioSaveMutation.isPending}
            annualSavings={annualSavings}
            annualExpenses={projectionAnnualExpenses}
            cashflowReferenceYear={cashflowData?.referenceYear ?? null}
            cashflowIsAnnualized={cashflowData?.isAnnualized ?? false}
            fanInputs={fanInputs}
            pensionUnlockCalendarYear={pensionBridge ? pensionUnlockCalendarYear : null}
          />
        )
      )}

      {/* ── DETTAGLIO: the historical charts + explainer, demoted but intact ── */}
      <Collapsible
        open={detailOpen}
        onOpenChange={setDetailOpen}
        className="border-t border-border/60 pt-4"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {detailOpen ? 'Nascondi dettaglio storico' : 'Mostra dettaglio storico'}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                detailOpen && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <div className="space-y-6 pt-4">
            {/* Runway FIRE storica */}
            <Card>
              <CardHeader>
                <CardTitle>Anni di Spesa Coperti nel Tempo</CardTitle>
                <CardDescription>
                  Runway FIRE storica basata sulle spese rolling 12 mesi. La linea tratteggiata
                  mostra il target del tuo SWR.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {displayedRunwayData.length === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Servono almeno 12 snapshot mensili per calcolare la runway storica.
                  </p>
                ) : (
                  <>
                    {/* Runway summary: flat divide-y rows — no nested cards */}
                    <div className="divide-y divide-border rounded-lg border border-border">
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">Runway totale</p>
                          <p className="text-xs text-muted-foreground">
                            Liquidi + illiquidi &mdash;{' '}
                            {prepareRunwaySummaryLabel(displayedRunwaySummary.currentMonthLabel)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <div className="flex items-baseline gap-1">
                            <SettledYearsValue
                              value={displayedRunwaySummary.currentYearsOfExpenses}
                              className="font-mono text-xl font-bold tabular-nums text-foreground"
                            />
                            {displayedRunwaySummary.currentYearsOfExpenses !== null && (
                              <span className="text-sm text-muted-foreground">anni</span>
                            )}
                          </div>
                          {displayedRunwaySummary.totalDeltaVs12Months !== null && (
                            <span
                              className={cn(
                                'font-mono text-xs tabular-nums',
                                displayedRunwaySummary.totalDeltaVs12Months >= 0
                                  ? 'text-positive'
                                  : 'text-destructive'
                              )}
                            >
                              {displayedRunwaySummary.totalDeltaVs12Months >= 0 ? '+' : ''}
                              {displayedRunwaySummary.totalDeltaVs12Months.toFixed(1)} vs 12M
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">Runway liquida</p>
                          {/* Runway uses rolling 12M expenses as denominator; the hero uses last
                              full year. The two can differ when the spending trend is changing. */}
                          <p className="text-xs text-muted-foreground">
                            Solo asset liquidi &mdash; spese rolling 12 mesi
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <div className="flex items-baseline gap-1">
                            <SettledYearsValue
                              value={displayedRunwaySummary.currentLiquidYearsOfExpenses}
                              className="font-mono text-xl font-bold tabular-nums text-foreground"
                            />
                            {displayedRunwaySummary.currentLiquidYearsOfExpenses !== null && (
                              <span className="text-sm text-muted-foreground">anni</span>
                            )}
                          </div>
                          {displayedRunwaySummary.liquidDeltaVs12Months !== null && (
                            <span
                              className={cn(
                                'font-mono text-xs tabular-nums',
                                displayedRunwaySummary.liquidDeltaVs12Months >= 0
                                  ? 'text-positive'
                                  : 'text-destructive'
                              )}
                            >
                              {displayedRunwaySummary.liquidDeltaVs12Months >= 0 ? '+' : ''}
                              {displayedRunwaySummary.liquidDeltaVs12Months.toFixed(1)} vs 12M
                            </span>
                          )}
                        </div>
                      </div>

                      {displayedRunwaySummary.targetYearsOfExpenses !== null && (
                        <div className="flex items-center justify-between px-4 py-3">
                          {/* 1 / SWR = years of expenses the portfolio must cover to sustain the
                              withdrawal indefinitely. The dashed reference line below. */}
                          <p className="text-xs text-muted-foreground">
                            Obiettivo patrimonio (anni di spese, linea tratteggiata)
                          </p>
                          <p className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
                            {displayedRunwaySummary.targetYearsOfExpenses.toFixed(1)} anni
                          </p>
                        </div>
                      )}
                    </div>

                    <ResponsiveContainer width="100%" height={isMobile ? 300 : 400}>
                      <LineChart
                        data={displayedRunwayData}
                        margin={{ left: isMobile ? 10 : 50, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: isMobile ? 10 : 12 }} />
                        <YAxis
                          width={isMobile ? 70 : 100}
                          tickFormatter={(value) => `${Number(value).toFixed(0)}a`}
                          tick={{ fontSize: isMobile ? 10 : 12 }}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const point = payload[0]?.payload;
                            if (!point) return null;
                            return (
                              <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
                                <p className="font-semibold text-foreground">{label}</p>
                                <div className="mt-2 space-y-1 text-muted-foreground">
                                  <p>
                                    Runway totale:{' '}
                                    <span className="font-medium text-foreground">
                                      {point.yearsOfExpenses !== null
                                        ? `${point.yearsOfExpenses.toFixed(1)} anni`
                                        : '—'}
                                    </span>
                                  </p>
                                  <p>
                                    Runway liquida:{' '}
                                    <span className="font-medium text-foreground">
                                      {point.liquidYearsOfExpenses !== null
                                        ? `${point.liquidYearsOfExpenses.toFixed(1)} anni`
                                        : '—'}
                                    </span>
                                  </p>
                                  <p>
                                    Spese rolling 12M:{' '}
                                    <span className="font-medium text-foreground">
                                      {formatCurrency(point.trailing12mExpenses)}
                                    </span>
                                  </p>
                                  <p>
                                    Patrimonio FIRE:{' '}
                                    <span className="font-medium text-foreground">
                                      {formatCurrency(point.fireNetWorthUsed)}
                                    </span>
                                  </p>
                                  <p>
                                    Progresso FIRE:{' '}
                                    <span className="font-medium text-foreground">
                                      {point.fireProgressToFI !== null
                                        ? formatPercentage(point.fireProgressToFI)
                                        : '—'}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend />
                        <ReferenceLine
                          y={displayedRunwaySummary.targetYearsOfExpenses ?? undefined}
                          stroke="var(--chart-3)"
                          strokeWidth={1.5}
                          strokeDasharray="6 4"
                          label={
                            displayedRunwaySummary.targetYearsOfExpenses !== null
                              ? {
                                  value: `Target ${displayedRunwaySummary.targetYearsOfExpenses.toFixed(1)} anni`,
                                  position: 'insideTopRight',
                                  fill: 'var(--chart-3)',
                                  fontSize: 11,
                                }
                              : undefined
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="yearsOfExpenses"
                          stroke={chartColors[0]}
                          strokeWidth={2.5}
                          name="Totale FIRE"
                          dot={{ r: 3 }}
                          connectNulls={false}
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                        <Line
                          type="monotone"
                          dataKey="liquidYearsOfExpenses"
                          stroke={chartColors[1]}
                          strokeWidth={2.5}
                          name="Solo liquido"
                          dot={{ r: 3 }}
                          connectNulls={false}
                          animationDuration={800}
                          animationEasing="ease-out"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Cashflow e Reddito Passivo nel Tempo */}
            <Card>
              <CardHeader>
                <CardTitle>Cashflow e Reddito Passivo nel Tempo</CardTitle>
                <CardDescription>
                  Confronta entrate, uscite e reddito passivo mensile derivato dal patrimonio FIRE
                  dello stesso mese.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Nessuno storico disponibile. Gli snapshot mensili verranno creati
                    automaticamente.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={isMobile ? 280 : 400}>
                    <LineChart data={chartData} margin={{ left: isMobile ? 10 : 50, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: isMobile ? 10 : 12 }} />
                      <YAxis
                        width={isMobile ? 70 : 100}
                        tickFormatter={(value) => formatCurrencyCompact(value)}
                        tick={{ fontSize: isMobile ? 10 : 12 }}
                      />
                      <Tooltip
                        formatter={fmtCurrency}
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          color: 'var(--card-foreground)',
                        }}
                        labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="income"
                        stroke={chartColors[1]}
                        strokeWidth={2}
                        name="Entrate Mensili"
                        dot={{ r: 4 }}
                        animationDuration={800}
                        animationEasing="ease-out"
                      />
                      <Line
                        type="monotone"
                        dataKey="expenses"
                        stroke={chartColors[4]}
                        strokeWidth={2}
                        name="Uscite Mensili"
                        dot={{ r: 4 }}
                        animationDuration={800}
                        animationEasing="ease-out"
                      />
                      <Line
                        type="monotone"
                        dataKey="monthlyAllowance"
                        stroke={chartColors[3]}
                        strokeWidth={2}
                        name="Reddito Passivo"
                        dot={{ r: 4 }}
                        animationDuration={800}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Come funziona il FIRE? — collapsible, no blue tinting */}
            <Collapsible open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div className="flex cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-muted/30">
                    <p className="text-sm font-medium text-foreground">Come funziona il FIRE?</p>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                        howItWorksOpen && 'rotate-180'
                      )}
                    />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 border-t border-border px-6 py-4 text-sm text-muted-foreground">
                    <p>
                      <strong className="font-semibold text-foreground">FIRE Number:</strong>{' '}
                      Il patrimonio target calcolato come Spese Annuali &divide; Safe Withdrawal
                      Rate. Con un SWR del 4%, devi accumulare 25 volte le tue spese annuali.
                    </p>
                    <p>
                      <strong className="font-semibold text-foreground">
                        Safe Withdrawal Rate (SWR):
                      </strong>{' '}
                      La percentuale del patrimonio che puoi prelevare ogni anno in modo
                      sostenibile. Il 4% è basato sul Trinity Study su un orizzonte di 30 anni.
                    </p>
                    <p>
                      <strong className="font-semibold text-foreground">
                        Reddito Passivo Mensile:
                      </strong>{' '}
                      Basato sul tuo patrimonio attuale e sul SWR impostato. Mostra quanto potresti
                      già prelevare mensilmente in modo sostenibile.
                    </p>
                    <p>
                      <strong className="font-semibold text-foreground">
                        Come funziona la proiezione:
                      </strong>{' '}
                      Ogni anno il patrimonio cresce con il rendimento dello scenario, poi si
                      aggiungono i risparmi annuali (finché il FIRE non è raggiunto). Le spese
                      aumentano con l&apos;inflazione, facendo crescere il FIRE Number nel tempo. I
                      risparmi annuali sono calcolati dal cashflow dell&apos;ultimo anno completo.
                    </p>
                    <p>
                      <strong className="font-semibold text-foreground">Vista Ventaglio:</strong>{' '}
                      La stessa fase di accumulo, simulata {FAN_SIMULATION_COUNT.toLocaleString('it-IT')}{' '}
                      volte con rendimenti casuali derivati dalla tua allocazione: le bande mostrano
                      dove finisce la maggior parte dei percorsi e la probabilità di FIRE entro
                      l&apos;anno proiettato. Per l&apos;analisi del decumulo usa il tab Monte
                      Carlo.
                    </p>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
