'use client';

/**
 * AccumuloTab — Allocazione's second tab, «sto portando il portafoglio dove voglio, e cosa compro
 * questo mese?» (doc/pac-ottimizzatore § RV1, PO2). It owns what its tiles share: the open plan and
 * the month it is in (`useOpenAccumuloPlan`), the ledger matching, the class trajectory, and the
 * verdict built from them (`buildAccumuloVerdict`) — so the verdict and the tiles can never name
 * different counts. The grid is the render's (`doc/pac-ottimizzatore/render-accumulo.html`):
 *
 *   plan open:   Questo mese (7) | Classi del piano (5)     — a draft or a finished plan has no
 *                                                              trajectory: Questo mese takes the row
 *   no plan:     Accumulo (12)                              — the empty state, RV4
 *   always:      Portafoglio modello (7) | Obiettivi (5)    — the model portfolio's own tile (A2)
 * Below `desktop:` one tile per row in that order.
 *
 * The objectives' modal is opened from the Obiettivi tile and by `?obiettivi=1` (the link
 * Impostazioni, the optimizer panels and the model portfolio carry); the query is dropped once read.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/utils/weightOptimizer';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { projectClassTrajectory } from '@/lib/utils/accumulationPlanUtils';
import { matchPlanExecutions } from '@/lib/utils/accumulationPlanMatching';
import { buildAccumuloVerdict, isPlanDone, selectClosedPlans, summarizeDraftTotal } from '@/lib/utils/accumuloSummary';
import { describeBandReentry } from '@/lib/utils/accumulationNarrative';
import { useOpenAccumuloPlan } from '@/lib/hooks/useOpenAccumuloPlan';
import { useModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { resolveSurfaceState, describeReadFailure } from '@/lib/utils/statesNarrative';
import { describeAccumulationReadFailure, ACCUMULO_TILE_EYEBROW } from '@/lib/utils/accumulationNarrative';
import { cn } from '@/lib/utils';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { QuestoMeseTile } from '@/components/allocation/tiles/QuestoMeseTile';
import { ClassiDelPianoTile } from '@/components/allocation/tiles/ClassiDelPianoTile';
import { AccumuloVuotoTile, COMPOSITION_ANCHOR_ID } from '@/components/allocation/tiles/AccumuloVuotoTile';
import { PortafoglioModelloTile } from '@/components/allocation/tiles/PortafoglioModelloTile';
import { PianiConclusiTile } from '@/components/allocation/tiles/PianiConclusiTile';
import { ObiettiviTile } from '@/components/allocation/tiles/ObiettiviTile';
import { ObiettiviDialog } from '@/components/allocation/ObiettiviDialog';
import { DEPS } from '@/components/allocation/tiles/accumuloShared';

interface AccumuloTabProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  /** The page re-reads assets and settings. */
  onAssetsChanged: () => void;
}

export function AccumuloTab({ ownerId, allAssets, targets, band, targetLeverageRatio, idealAllocation, onAssetsChanged }: AccumuloTabProps) {
  const { plansQuery, plan, today, currentIndex } = useOpenAccumuloPlan(ownerId);
  const modelQuery = useModelPortfolio(ownerId);
  const model = modelQuery.data ?? null;
  const transactionsQuery = useAssetTransactions(ownerId, undefined, { enabled: !!plan && plan.status === 'active' });
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wantsObjectives = searchParams.get('obiettivi') === '1';
  useEffect(() => {
    if (!wantsObjectives) return;
    // Deferred: the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      setObjectivesOpen(true);
      router.replace(`${pathname}?tab=accumulo`, { scroll: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [wantsObjectives, pathname, router]);

  const matchResult = useMemo(
    () =>
      plan
        ? matchPlanExecutions(plan, transactionsQuery.data ?? [], today, transactionsQuery.isLoading)
        : { matches: [], lineStates: {} },
    // `today` deliberately not a dependency: matching only needs day-level freshness when the plan
    // or the ledger change (doc/pac-ate.md §5.9).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, transactionsQuery.data, transactionsQuery.isLoading],
  );

  const isActive = plan?.status === 'active';
  const done = !!plan && isActive && isPlanDone(plan, currentIndex);
  const showTrajectory = isActive && !done && !!targets;
  const trajectory = useMemo(
    () =>
      plan && showTrajectory && targets
        ? projectClassTrajectory({ plan, allAssets, installments: plan.installments, targets, band, compare: compareAllocations, currentIndex })
        : [],
    [plan, showTrajectory, allAssets, targets, band, currentIndex],
  );
  const clampedIndex = plan ? Math.min(Math.max(currentIndex, 0), plan.months) : 0;
  const reentry = useMemo(() => describeBandReentry(trajectory, clampedIndex, band), [trajectory, clampedIndex, band]);

  const sourceCashEur = useMemo(
    () => allAssets.filter((asset) => asset.assetClass === 'cash' && asset.type === 'cash').reduce((sum, asset) => sum + calculateAssetValue(asset), 0),
    [allAssets],
  );
  const draftTotalEur = useMemo(() => (plan?.status === 'draft' ? summarizeDraftTotal(plan, allAssets, DEPS) : 0), [plan, allAssets]);

  const verdict = useMemo(
    () =>
      buildAccumuloVerdict({ plan, currentIndex, sourceCashEur, hasModel: !!model, lineStates: matchResult.lineStates, draftTotalEur, reentry }),
    [plan, currentIndex, sourceCashEur, model, matchResult.lineStates, draftTotalEur, reentry],
  );

  const surfaceState = resolveSurfaceState({ loading: plansQuery.isLoading || modelQuery.isLoading || (!!plan && !targets), failed: plansQuery.isError });

  if (surfaceState === 'loading') {
    return (
      <div className="mt-4 space-y-3">
        <Skeleton className="h-10 w-2/3 max-w-[560px]" />
        <Skeleton className="h-4 w-1/2 max-w-[420px]" />
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
          <Skeleton className="h-64 desktop:col-span-7" />
          <Skeleton className="h-64 desktop:col-span-5" />
        </div>
      </div>
    );
  }

  if (surfaceState === 'failed') {
    return (
      <div className="mt-4">
        <ErrorNotice
          className="max-w-[920px]"
          onRetry={() => void plansQuery.refetch()}
          notice={describeReadFailure({ subject: ACCUMULO_TILE_EYEBROW, consequence: describeAccumulationReadFailure(), canRetry: true })}
        />
      </div>
    );
  }

  const objectivesSaved = idealAllocation ?? DEFAULT_IDEAL_ALLOCATION;
  const closedPlans = selectClosedPlans(plansQuery.data);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sul piano di accumulo" />
      </div>

      <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
        {!plan && (
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-12')}>
            <AccumuloVuotoTile
              ownerId={ownerId}
              allAssets={allAssets}
              targets={targets}
              band={band}
              targetLeverageRatio={targetLeverageRatio}
              idealAllocation={idealAllocation}
              model={model}
              today={today}
              onAssetsChanged={onAssetsChanged}
            />
          </div>
        )}

        {/* Two independent stacks (render, view 1): the left one carries the month and the model, the
            right one the classes and the objectives, so a shorter tile leaves no hole in the other. */}
        <div className="flex flex-col gap-3 desktop:col-span-7">
          {plan && targets && (
            <div className={TILE_CELL_CLASS}>
              <QuestoMeseTile
                ownerId={ownerId}
                plan={plan}
                allAssets={allAssets}
                targets={targets}
                band={band}
                targetLeverageRatio={targetLeverageRatio}
                idealAllocation={idealAllocation}
                currentIndex={currentIndex}
                matchResult={matchResult}
                model={model}
                onAssetsChanged={onAssetsChanged}
              />
            </div>
          )}

          <div id={COMPOSITION_ANCHOR_ID} className={cn(TILE_CELL_CLASS, 'scroll-mt-4')}>
            <PortafoglioModelloTile
              ownerId={ownerId}
              allAssets={allAssets}
              targets={targets}
              band={band}
              targetLeverageRatio={targetLeverageRatio}
              idealAllocation={idealAllocation}
              model={model}
              readFailed={modelQuery.isError}
              onAssetsChanged={onAssetsChanged}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 desktop:col-span-5">
          {plan && showTrajectory && (
            <div className={TILE_CELL_CLASS}>
              <ClassiDelPianoTile plan={plan} trajectory={trajectory} currentIndex={currentIndex} band={band} />
            </div>
          )}

          <div className={TILE_CELL_CLASS}>
            <ObiettiviTile
              idealAllocation={idealAllocation}
              targetLeverageRatio={targetLeverageRatio}
              snapshot={model?.optimizerSnapshot}
              editRef={editRef}
              disabled={!targets}
              onEdit={() => setObjectivesOpen(true)}
            />
          </div>
        </div>

        {closedPlans.length > 0 && (
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-12')}>
            <PianiConclusiTile plans={closedPlans} targets={targets} />
          </div>
        )}
      </div>

      {objectivesOpen && targets && (
        <ObiettiviDialog
          open={objectivesOpen}
          onClose={() => setObjectivesOpen(false)}
          ownerId={ownerId}
          allAssets={allAssets}
          targets={targets}
          targetLeverageRatio={targetLeverageRatio}
          saved={objectivesSaved}
          model={model}
          onSaved={onAssetsChanged}
          returnFocusTo={editRef}
        />
      )}
    </div>
  );
}
