'use client';

/**
 * ALLOCAZIONE — a verdict over tiles (2026-08-25)
 *
 * The page answers «sono allineato al piano, e cosa faccio con i prossimi soldi?» before it shows
 * a number: a rule-generated verdict (lib/utils/allocazioneNarrative.ts) names the balance score,
 * the classes off target in points and where the next money goes, over a 12-column grid of tiles
 * that each answer one question with a reading line above their figures.
 *
 * The page has NO period axis — an allocation is always read today. Its one control is the
 * rebalance BAND (±2 · ±5 · 5/25 · custom), which re-classifies every COMPRA/VENDI/OK across the
 * verdict, the Piano and the Per classe chips; it lives in the Bilanciamento tile's aside, next to
 * the score it qualifies (Alt A of the canvas, chosen on 2026-08-25). The balance score itself is
 * band-INDEPENDENT (`computeBalanceScore`) and never moves with the band.
 *
 * TWO TABS (fork, 2026-10-07, doc/pac-ottimizzatore § RV1): «Bilanciamento» (the page as upstream
 * has it, default) and «Accumulo» (`?tab=accumulo`; the fork's plan, the optimizer and its
 * objectives, `AccumuloTab`). The band is page state shared by both. The verdict follows the tab:
 * Bilanciamento's carries the accumulation plan's installment in place of Versa when a plan is
 * active (PO3, `pac` in `buildAllocazioneVerdict`).
 *
 *   Bilanciamento, desktop (12 col), two independent stacks (fork, 2026-09-25):
 *                     [Bilanciamento · Per classe](5) | [Piano · Esposizione ·
 *                     Previdenza (only with a pension fund)](7)
 *   Mobile (1 col):   Bilanciamento → Piano → Per classe → Esposizione → Previdenza → Dettaglio
 *   Tablet (2 col):   the same order (Per classe and Esposizione, the two half-width tiles, share
 *                     one row)
 *
 * The «Dettaglio» disclosure under the grid holds the two holdings lists the old hero kept in
 * popovers — Non negoziabili (inside the total, untouchable) and Esclusi (outside it).
 *
 * ALLOCATION ROLES: every asset carries an `allocationRole` — `tradable`, `frozen`, or `excluded`
 * — and `partitionByAllocationRole` splits them BEFORE `compareAllocations`, never downstream (see
 * `allocationUtils.ts` for why the filter cannot live after the comparison: it would break the
 * Σ(current − target) = 0 invariant the plans rely on). `frozen` counts in the denominator and in
 * the percentages but never appears in a plan; `excluded` leaves the page entirely, denominator
 * included — which is why the header's total is SMALLER than the Panoramica net worth, and the
 * Bilanciamento footer says so. `Asset.excludeFromAllocation` survives only as a read-fallback in
 * `resolveAllocationRole`; never reintroduce it as a write path.
 *
 * The Piano's amount (default 1000 €) is page state on purpose: the verdict's last clause is the
 * VERSA answer at that amount whatever mode the tile shows, so the two can never disagree.
 * No component computes a figure or writes a sentence: numbers come from
 * lib/utils/allocazioneSummary.ts, words from lib/utils/allocazioneNarrative.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Scale, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { getAllAssets, calculateAssetValue } from '@/lib/services/assetService';
import {
  getSettings,
  compareAllocations,
  deriveTargetLeverageRatio,
  resolveEffectiveTargets,
} from '@/lib/services/assetAllocationService';
import { getGoalData } from '@/lib/services/goalService';
import type { LeveragePlanInputs } from '@/lib/utils/leverageAwareAllocationUtils';
import type { Asset, AllocationResult, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import {
  applyRebalanceBand,
  summarizeBalance,
  computeBalanceScore,
  partitionByAllocationRole,
  buildHoldings,
  sumHoldingsByClass,
  sumHoldingsBySubCategory,
  sumTradableByClass,
  findOrphanedTargets,
  stripOrphanedSubTargets,
  DEFAULT_REBALANCE_BAND,
  type AllocatableHolding,
  type RebalanceBand,
} from '@/lib/utils/allocationUtils';
import {
  buildCompositionPair,
  buildPensionLookThrough,
  buildPlanView,
  activeClassGaps,
  estimatePlanSaleTax,
  offTargetGaps,
  planSaleNodes,
  summarizeClassGaps,
  summarizeHoldings,
  summarizeNextMoney,
  untargetedClassLabels,
  type PlanInputs,
  type PlanMode,
} from '@/lib/utils/allocazioneSummary';
import {
  buildAllocazioneVerdict,
  describeAllocazioneHeader,
  describeBalance,
  describeBalanceFooter,
  describeBandChange,
  describeClasses,
  describePension,
  describePensionAside,
  describePlan,
  describePlanFooter,
} from '@/lib/utils/allocazioneNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { PageTabs, type TabDef } from '@/components/layout/PageTabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import { TabsContent } from '@/components/ui/tabs';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { BilanciamentoTile } from '@/components/allocation/tiles/BilanciamentoTile';
import { PianoTile } from '@/components/allocation/tiles/PianoTile';
import { AccumuloTab } from '@/components/allocation/AccumuloTab';
import { PerClasseTile } from '@/components/allocation/tiles/PerClasseTile';
import { EsposizioneTile } from '@/components/allocation/tiles/EsposizioneTile';
import { PrevidenzaTile } from '@/components/allocation/tiles/PrevidenzaTile';
import { AllocazioneDettaglio } from '@/components/allocation/AllocazioneDettaglio';
import { useOpenAccumuloPlan } from '@/lib/hooks/useOpenAccumuloPlan';
import { summarizePacMonth } from '@/lib/utils/accumuloSummary';

/** The grid's geometry, for the skeleton: the same spans as the tiles below. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 10 },
  { span: 7, lines: 8 },
  { span: 12, lines: 6 },
  { span: 12, lines: 3 },
  { span: 6, lines: 7 },
  { span: 6, lines: 7 },
  { span: 12, lines: 4 },
];

const ALLOCATION_TABS: TabDef[] = [
  { value: 'bilanciamento', label: 'Bilanciamento', icon: Scale },
  { value: 'accumulo', label: 'Accumulo', icon: TrendingUp },
];
type AllocationTabId = 'bilanciamento' | 'accumulo';

function getInitialTab(param: string | null): AllocationTabId {
  return param === 'accumulo' ? 'accumulo' : 'bilanciamento';
}

/** The Versa/Preleva amount the page opens with: the verdict needs one to name the next money. */
const DEFAULT_PLAN_AMOUNT_INPUT = '1000';

const EMPTY_HOLDINGS: AllocatableHolding[] = [];

export default function AllocationPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AllocationTabId>(() => getInitialTab(searchParams.get('tab')));
  // The accumulation plan the Bilanciamento verdict names in place of Versa (PO3).
  const { plan: openPlan, currentIndex: pacMonthIndex } = useOpenAccumuloPlan(ownerId ?? undefined);
  const pac = useMemo(() => summarizePacMonth(openPlan, pacMonthIndex), [openPlan, pacMonthIndex]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(true);
  /** A failed load is not an empty set: it gets an alert, never a verdict about zeros. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [usingGoalTargets, setUsingGoalTargets] = useState(false);

  // Per-instrument rows of everything IN the allocation — tradable and frozen alike. Each carries
  // its own `tradable` flag: the frozen ones count in every total and percentage but are never
  // offered as a source or destination, so the plans reach the target by moving the others.
  const [holdings, setHoldings] = useState<AllocatableHolding[]>(EMPTY_HOLDINGS);
  // The `tradable` assets themselves: the trade CANDIDATES for the leverage-aware planner.
  const [tradableAssets, setTradableAssets] = useState<Asset[]>([]);
  // The wealth this page deliberately ignores — the home you live in. Reported only.
  const [excludedHoldings, setExcludedHoldings] = useState<AllocatableHolding[]>(EMPTY_HOLDINGS);
  // Full, unfiltered asset list — the Previdenza tile's «tutto il patrimonio» needs every role.
  const [allAssets, setAllAssets] = useState<Asset[]>([]);

  // The page's one control: the drift tolerance that decides COMPRA/VENDI/OK. Session-only; the
  // default matches the server's ±2 p.p. so the first render equals the persisted classification.
  const [band, setBand] = useState<RebalanceBand>(DEFAULT_REBALANCE_BAND);
  const [planMode, setPlanMode] = useState<PlanMode>('rebalance');
  const [amountInput, setAmountInput] = useState(DEFAULT_PLAN_AMOUNT_INPUT);
  // The owner's "Allocazione ideale" objectives (Impostazioni → Allocazione) — the PAC editor's
  // Ottimizzato view reads it; `null` before the first load, same as `targets`.
  const [idealAllocation, setIdealAllocation] = useState<IdealAllocationSettings | null>(null);

  const handleTabChange = (value: string) => {
    const next = getInitialTab(value);
    setActiveTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  };

  const loadData = useCallback(async () => {
    if (!user || !ownerId) return;
    try {
      setLoadFailed(false);
      const [assetsData, settings, goalData] = await Promise.all([
        getAllAssets(ownerId),
        getSettings(ownerId),
        getGoalData(ownerId),
      ]);

      // Split by role BEFORE any allocation math (see `partitionByAllocationRole`). Goal-derived
      // targets keep reading the full asset list — a goal is funded by total wealth.
      const { tradable, frozen, excluded } = partitionByAllocationRole(assetsData);
      const inAllocation = [...tradable, ...frozen];

      // The ONE resolution of the targets the page measures against (goal-derived, manual or
      // default) — the periodic email reads the same function (lib/utils/allocationComparison.ts).
      const { targets: effectiveTargets, fromGoals } = resolveEffectiveTargets({ settings, goalData, assets: assetsData });

      setTargets(effectiveTargets);
      setUsingGoalTargets(fromGoals);
      setIdealAllocation(settings?.idealAllocation ?? null);
      setAllocation(compareAllocations(inAllocation, effectiveTargets));
      setHoldings(buildHoldings(inAllocation, calculateAssetValue));
      setTradableAssets(tradable);
      setExcludedHoldings(buildHoldings(excluded, calculateAssetValue));
      setAllAssets(assetsData);
    } catch (error) {
      setLoadFailed(true);
      console.error('Error loading allocation data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  }, [user, ownerId]);

  useEffect(() => {
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  // ─── The numbers (pure layer) ───────────────────────────────────────────────
  // Re-classify the whole result under the active band; the verdict, the plan and the chips all
  // read the banded copy so they can never disagree.
  const bandedAllocation = useMemo(
    () => (allocation ? applyRebalanceBand(allocation, band) : null),
    [allocation, band],
  );
  const balanceSummary = useMemo(
    () => (bandedAllocation ? summarizeBalance(bandedAllocation.byAssetClass) : null),
    [bandedAllocation],
  );
  const balanceScore = useMemo(
    () => (bandedAllocation ? computeBalanceScore(bandedAllocation.byAssetClass) : null),
    [bandedAllocation],
  );
  const tradableByClass = useMemo(() => sumTradableByClass(holdings), [holdings]);
  const frozenGroup = useMemo(() => summarizeHoldings(holdings.filter((h) => !h.tradable)), [holdings]);
  const excludedGroup = useMemo(() => summarizeHoldings(excludedHoldings), [excludedHoldings]);
  const targetLeverageRatio = useMemo(() => deriveTargetLeverageRatio(targets), [targets]);

  // The instrument-aware planner inputs — only when the portfolio actually has leverage.
  const leverageInputs = useMemo<LeveragePlanInputs | undefined>(() => {
    if (!allocation || !allocation.hasLeveragedExposure) return undefined;
    const currentNotionalByAssetClass: Record<string, number> = {};
    for (const [assetClass, data] of Object.entries(allocation.byAssetClass)) {
      currentNotionalByAssetClass[assetClass] = data.currentValue;
    }
    // The comparison's EFFECTIVE targets, on the market base (a fixed-amount cash target keeps a
    // stale percentage in Settings).
    const targetPercentageByAssetClass: Record<string, number> = {};
    for (const [assetClass, data] of Object.entries(allocation.byAssetClass)) {
      targetPercentageByAssetClass[assetClass] = data.targetPercentage;
    }
    return {
      tradableAssets,
      currentNotionalByAssetClass,
      currentNotionalTotal: allocation.notionalValue,
      currentMarketTotal: allocation.marketValue,
      targetPercentageByAssetClass,
      targetLeverageRatio,
    };
  }, [allocation, tradableAssets, targetLeverageRatio]);

  // A target whose entire value sits in excluded assets can never be reached by any buy or sell:
  // the verdict declares it, and it is stripped from the maps handed to the planners AND to the
  // Per classe rows (a COMPRA chip the user can never act on is the same lie in both places).
  const orphanedTargets = useMemo(
    () =>
      bandedAllocation
        ? findOrphanedTargets(
            bandedAllocation.byAssetClass,
            bandedAllocation.bySubCategory,
            sumHoldingsByClass(excludedHoldings),
            sumHoldingsBySubCategory(excludedHoldings),
          )
        : [],
    [bandedAllocation, excludedHoldings],
  );
  const actionableSubCategories = useMemo(
    () => (bandedAllocation ? stripOrphanedSubTargets(bandedAllocation.bySubCategory, orphanedTargets) : {}),
    [bandedAllocation, orphanedTargets],
  );

  const gaps = useMemo(() => (bandedAllocation ? summarizeClassGaps(bandedAllocation.byAssetClass) : []), [bandedAllocation]);
  // A class with neither allocated value nor a target cannot be off target, so it never counts in
  // «N classi su M» and is never named «in linea» — «Immobili · OK · 0 €» was a verdict on a void
  // while the Previdenza tile printed the same class at 60.000 € (`isDormantClass`).
  const activeGaps = useMemo(() => activeClassGaps(gaps), [gaps]);
  const offTarget = useMemo(() => offTargetGaps(activeGaps), [activeGaps]);
  const excludedByClass = useMemo(() => sumHoldingsByClass(excludedHoldings), [excludedHoldings]);
  const composition = useMemo(
    () =>
      bandedAllocation
        ? buildCompositionPair(bandedAllocation.byAssetClass, bandedAllocation.notionalValue, bandedAllocation.hasLeveragedExposure)
        : { current: [], target: [] },
    [bandedAllocation],
  );

  const planInputs = useMemo<PlanInputs | null>(
    () =>
      bandedAllocation
        ? {
            byAssetClass: bandedAllocation.byAssetClass,
            bySubCategory: actionableSubCategories,
            bySpecificAsset: bandedAllocation.bySpecificAsset,
            holdings,
            tradableByClass,
            leverage: leverageInputs,
          }
        : null,
    [bandedAllocation, actionableSubCategories, holdings, tradableByClass, leverageInputs],
  );
  const planAmount = Number(amountInput) || 0;
  const planView = useMemo(
    () => (planInputs ? buildPlanView(planMode, planAmount, planInputs) : null),
    [planInputs, planMode, planAmount],
  );
  const nextMoney = useMemo(
    () => (planInputs ? summarizeNextMoney(planInputs, planAmount) : null),
    [planInputs, planAmount],
  );
  // What the plan's SELL legs would actually deliver. The broker withholds on the day of the sale,
  // so «vendi 25.000 €» is gross; `null` (a missing EUR cost basis or rate on some leg) keeps the
  // reading silent and the footer's «non sono considerate» — never a flattering zero.
  const saleTax = useMemo(
    () => (planView ? estimatePlanSaleTax(planSaleNodes(planView), holdings) : null),
    [planView, holdings],
  );
  const pension = useMemo(() => buildPensionLookThrough(allAssets, calculateAssetValue), [allAssets]);
  const pensionFundNames = useMemo(
    () => allAssets.filter((asset) => asset.type === 'pensionFund').map((asset) => asset.name),
    [allAssets],
  );

  const classCount = activeGaps.length;
  const hasAssets = classCount > 0;
  const leverageInPlay = !!bandedAllocation && (bandedAllocation.hasLeveragedExposure || targetLeverageRatio > 1.01);
  const leverageReading = useMemo(
    () => (bandedAllocation && leverageInPlay ? { current: bandedAllocation.leverageRatio, target: targetLeverageRatio } : null),
    [bandedAllocation, leverageInPlay, targetLeverageRatio],
  );
  // Without leverage a negative Σdrift is wealth in classes the targets do not name (a house held
  // with no `realestate` target), not «esposizione sotto il target di leva»: read it as what it is.
  const untargeted = useMemo(() => {
    if (!bandedAllocation || !balanceScore || leverageInPlay || balanceScore.leverageGapPp >= -0.5) return null;
    return { pct: -balanceScore.leverageGapPp, labels: untargetedClassLabels(holdings, bandedAllocation.byAssetClass) };
  }, [bandedAllocation, balanceScore, leverageInPlay, holdings]);

  // ─── The words (pure layer) ─────────────────────────────────────────────────
  const verdict = useMemo(
    () =>
      buildAllocazioneVerdict({
        hasAssets,
        excludedValue: excludedGroup.total,
        score: balanceScore?.score ?? 0,
        isBalanced: balanceSummary?.isBalanced ?? true,
        band,
        offTarget,
        leverage: leverageReading,
        nextMoney,
        orphans: orphanedTargets,
        pac,
      }),
    [hasAssets, excludedGroup.total, balanceScore, balanceSummary, band, offTarget, leverageReading, nextMoney, orphanedTargets, pac],
  );

  const headerDescription = describeAllocazioneHeader({
    marketValue: bandedAllocation?.marketValue ?? 0,
    classCount,
    targetSource: usingGoalTargets ? 'goals' : 'settings',
  });

  const header = (
    <PageHeader
      label="Pianificazione"
      title="Allocazione"
      description={headerDescription}
      actions={
        <Button asChild variant="outline" className="hidden h-8 gap-1.5 px-2.5 text-xs desktop:inline-flex">
          <Link href="/dashboard/settings">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            Modifica target
          </Link>
        </Button>
      }
    />
  );

  // Below desktop the header action sits AFTER the tiles as a 44px button: «Modifica target» is
  // what you do once you have read the plan, and above the grid it outranked reading it. It is
  // `asChild` so the DOM is one <a>, never the <a><button> pair that costs two Tab stops.
  const mobileAction = (
    <Button asChild variant="outline" className="h-11 w-full gap-1.5 desktop:hidden">
      <Link href="/dashboard/settings">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Modifica target
      </Link>
    </Button>
  );

  // ─── Loading and empty states ───────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer>
        {header}
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  // A failed read comes BEFORE the empty branch: `[]` on failure is indistinguishable from `[]`
  // on a new account, and the empty branch would judge a set that was never read.
  if (loadFailed) {
    return (
      <PageContainer>
        {header}
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => void loadData()}
          notice={describeReadFailure({
            consequence: 'Strumenti e obiettivi di allocazione non sono stati letti: senza di essi il piano non è calcolabile.',
            untouched: 'Il piano registrato non è stato toccato.',
            canRetry: true,
          })}
        />
      </PageContainer>
    );
  }

  if (!hasAssets || !bandedAllocation || !balanceSummary || !balanceScore || !planView) {
    return (
      <PageContainer>
        {header}
        <div className="pt-1">
          <PageVerdict verdict={verdict} ariaLabel="Verdetto sull'allocazione" />
        </div>
        {mobileAction}
      </PageContainer>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageContainer>
      {header}

      <PageTabs
        tabs={ALLOCATION_TABS}
        value={activeTab}
        onValueChange={handleTabChange}
        layoutId="allocation-tab"
        ariaLabel="Sezioni di Allocazione"
        renderedPanels={new Set([activeTab])}
      >
        {/* Only the active panel is mounted: each carries its own verdict, and two sections with the
            page-verdict view-transition name would break the page scene. */}
        {activeTab === 'bilanciamento' && (
          <TabsContent
            value="bilanciamento"
            id={pageTabPanelId('allocation-tab', 'bilanciamento')}
            aria-label="Bilanciamento"
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
            className="mt-4 flex flex-col gap-3"
          >
          <div className="pt-1">
            <PageVerdict verdict={verdict} ariaLabel="Verdetto sull'allocazione" />
          </div>

          {/* The band re-classifies the verdict, this page's plan and every chip at once. The region is
              mounted with the page, before anything changes, so a reader is already watching it when the
              text is rewritten — one created together with its content announces nothing. */}
          <p className="sr-only" role="status" aria-live="polite">
            {describeBandChange({ band, offTargetCount: balanceSummary.offTargetCount, classCount })}
          </p>

          {/* TWO INDEPENDENT STACKS from `desktop:`, and no full-width row under them (fork,
              2026-09-25). The Piano's height is not a constant: on the owner's account it runs from
              381px (Versa) to 1159px (Ribilancia) and grows with the instruments to trade, and Per
              classe grows when a class opens. A full-width row under two columns has to start below
              the LONGER one, so every change of mode used to open a 250–580px hole under the shorter
              column. In two stacks a tile that grows only pushes the tiles under it in its own column:
              no hole between tiles is possible, only the bottom edge of the page moves. AGENTS.md → a
              tile stretched beside a taller neighbour is cured in the GRID.
              Since the Accumulo tab took the fork's two tiles away (2026-10-07) the stacks are
              Bilanciamento, Per classe | Piano, Esposizione, Previdenza: the left one lost the
              tallest tile it had, so the heights below are NOT re-measured yet — measure them on the
              owner's account (`mirror:seed`) and move Esposizione across if the left column ends far
              above the right (doc/pac-ottimizzatore § RV1).
              Below `desktop:` both wrappers are `contents`, so the tiles are grid items again in their
              own `order-*` and the phone keeps reading Bilanciamento → Piano → Per classe → Esposizione
              → Previdenza. Per classe and Esposizione are the only half-width tiles on `tablet:` (two
              columns, the iPad) and sit next to each other in that order, so they share one row. */}
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
            <div className="contents desktop:col-span-5 desktop:flex desktop:min-w-0 desktop:flex-col desktop:gap-3 desktop:self-start">
            <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none')}>
              <BilanciamentoTile
                reading={describeBalance({
                  marketValue: bandedAllocation.marketValue,
                  misallocationPct: balanceScore.misallocationPct,
                  leverageGapPp: leverageInPlay ? balanceScore.leverageGapPp : 0,
                  offTargetCount: balanceSummary.offTargetCount,
                  classCount,
                  band,
                  untargeted,
                })}
                band={band}
                onBandChange={setBand}
                score={balanceScore.score}
                misallocationPct={balanceScore.misallocationPct}
                misallocationValue={(balanceScore.misallocationPct / 100) * bandedAllocation.notionalValue}
                offTargetCount={balanceSummary.offTargetCount}
                classCount={classCount}
                offTargetLabels={offTarget.map((gap) => gap.label)}
                leverage={leverageReading}
                composition={composition}
                footer={describeBalanceFooter({
                  frozen: frozenGroup,
                  excluded: excludedGroup,
                  netWorth: bandedAllocation.marketValue + excludedGroup.total,
                })}
              />
            </div>

            <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none')}>
              <PerClasseTile
                reading={describeClasses(activeGaps, band)}
                aside="corrente · target · gap"
                allocation={{ ...bandedAllocation, bySubCategory: actionableSubCategories }}
                targets={targets}
                orphans={orphanedTargets}
                excludedByClass={excludedByClass}
              />
            </div>

            </div>

            {/* The right stack: what to do (Piano), then Esposizione and Previdenza. */}
            <div className="contents desktop:col-span-7 desktop:flex desktop:min-w-0 desktop:flex-col desktop:gap-3 desktop:self-start">
            <div className={cn(TILE_CELL_CLASS, 'order-2 tablet:col-span-2 desktop:order-none')}>
              <PianoTile
                mode={planMode}
                onModeChange={setPlanMode}
                amountInput={amountInput}
                onAmountInputChange={setAmountInput}
                reading={describePlan(planView, band, saleTax)}
                view={planView}
                footer={describePlanFooter(planMode, !!leverageInputs, saleTax?.tax !== null && saleTax?.tax !== undefined)}
              />
            </div>

            <div className={cn(TILE_CELL_CLASS, 'order-4 desktop:order-none')}>
              {user && ownerId && <EsposizioneTile userId={ownerId} />}
            </div>

            {pension && (
              <div className={cn(TILE_CELL_CLASS, 'order-5 tablet:col-span-2 desktop:order-none')}>
                <PrevidenzaTile
                  reading={describePension(pension)}
                  aside={describePensionAside({ fundNames: pensionFundNames, fundValue: pension.fundValue, allFrozen: pension.allFrozen })}
                  lookThrough={pension}
                />
              </div>
            )}
            </div>

          </div>

          {mobileAction}

          <AllocazioneDettaglio frozen={frozenGroup} excluded={excludedGroup} />
          </TabsContent>
        )}

        {activeTab === 'accumulo' && (
          <TabsContent
            value="accumulo"
            id={pageTabPanelId('allocation-tab', 'accumulo')}
            aria-label="Accumulo"
            aria-labelledby={undefined}
          >
            {ownerId && (
              <AccumuloTab
                ownerId={ownerId}
                allAssets={allAssets}
                targets={targets}
                band={band}
                targetLeverageRatio={targetLeverageRatio}
                idealAllocation={idealAllocation}
                onAssetsChanged={() => void loadData()}
              />
            )}
          </TabsContent>
        )}
      </PageTabs>
    </PageContainer>
  );
}
