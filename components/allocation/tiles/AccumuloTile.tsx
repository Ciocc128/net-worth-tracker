'use client';

/**
 * AccumuloTile — «sto accumulando verso il piano?» (doc/pac-ate.md §10.2).
 *
 * A standalone tile, separate from Piano/`PianoTile`: it owns its own plan (`accumulationPlans`,
 * D1) and never touches `PlanMode`/`buildPlanView`/the page's verdict. Six states —
 * `loading`/`failed`/`none`/`draft`/`active`/`done` — resolved by `resolveSurfaceState` plus a
 * local check on the plan's own status; every figure comes from `accumulationPlanUtils.ts`, every
 * word from `accumulationNarrative.ts`.
 *
 * S5 wires the ledger matching engine in (`accumulationPlanMatching.ts` §9): a `planned` line's
 * state is the richer `LineUiState` (`todo`/`toConfirm`/`late`) instead of S4's own two-state
 * derivation, with the actions §10.2 punto 4 lists per state — `toConfirm` → Conferma · Ignora
 * (Ignora is a session-local dismiss only, never a write: nothing in the plan schema records a
 * declined match, so a reload proposes it again), `executed` (ledger-linked) → Scollega, `late` →
 * the S4 manual actions unchanged, `lostLink` → Rivedi (opens the Calendario already on that
 * rata). `todo`/`skipped` carry no action, on purpose: the tile nudges towards recording the trade
 * in the Registro rather than pre-empting it by hand. The same vocabulary now also covers the
 * disposals («Vendite fuori piano») the S4 tile never rendered — without it a plan with a disposal
 * could never reach `done` (`isPlanDone` requires `disposalsClosed`, and nothing wrote it).
 */
import { useMemo, useRef, useState } from 'react';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import {
  computeTotalPurchases,
  computeUsableLiquidity,
  monthIndexOf,
  projectPlanOutcome,
  projectClassTrajectory,
  resolvePositionStates,
  selectClassStripRows,
  toMonthKey,
  unitPriceEur,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { matchPlanExecutions, type LineMatch, type LineUiState } from '@/lib/utils/accumulationPlanMatching';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import {
  selectOpenPlan,
  useAccumulationPlans,
  useActivatePlan,
  useClosePlan,
  useDeleteDraftPlan,
  useSetDisposal,
  useSetInstallmentLine,
} from '@/lib/hooks/useAccumulationPlan';
import { useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';
import { toast } from 'sonner';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { resolveSurfaceState } from '@/lib/utils/statesNarrative';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NarrativeText } from '@/components/ui/narrative-text';
import { AccumulationPlanDialog } from '@/components/allocation/AccumulationPlanDialog';
import { AccumulationCalendarDialog } from '@/components/allocation/AccumulationCalendarDialog';
import { AccumulationRecalibrateDialog } from '@/components/allocation/AccumulationRecalibrateDialog';
import { TargetTick } from '@/components/allocation/TargetTick';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';
import { armedActionLabel, describeWriteError } from '@/lib/utils/dialogNarrative';
import {
  ACCUMULO_ACTION_ACTIVATE,
  ACCUMULO_ACTION_CALENDAR,
  ACCUMULO_ACTION_CANCEL,
  ACCUMULO_ACTION_CLOSE,
  ACCUMULO_ACTION_CLOSE_VERB,
  ACCUMULO_ACTION_CONFIRM,
  ACCUMULO_ACTION_CREATE_PLAN,
  ACCUMULO_ACTION_DELETE_DRAFT,
  ACCUMULO_ACTION_DELETE_DRAFT_VERB,
  ACCUMULO_ACTION_EDIT,
  ACCUMULO_ACTION_IGNORE_MATCH,
  ACCUMULO_ACTION_MARK_EXECUTED,
  ACCUMULO_ACTION_RECALIBRATE,
  ACCUMULO_ACTION_REVIEW,
  ACCUMULO_ACTION_SAVE,
  ACCUMULO_ACTION_SKIP,
  ACCUMULO_ACTION_STOP,
  ACCUMULO_ACTION_STOP_VERB,
  ACCUMULO_ACTION_UNDO_EXECUTED,
  ACCUMULO_ACTION_UNLINK,
  ACCUMULO_CLASS_STRIP_LEGEND,
  ACCUMULO_CLASS_STRIP_TITLE,
  ACCUMULO_DISPOSALS_SECTION_TITLE,
  ACCUMULO_DONE_BOX_DRIFT,
  ACCUMULO_DONE_BOX_EXECUTED,
  ACCUMULO_DONE_BOX_RESIDUAL,
  ACCUMULO_DRAFT_BOX_DISPOSALS,
  ACCUMULO_DRAFT_BOX_INFLOWS,
  ACCUMULO_DRAFT_BOX_LIQUIDITY,
  ACCUMULO_DRAFT_BOX_POSITIONS,
  ACCUMULO_LINE_STATUS_LABEL,
  ACCUMULO_MANUAL_AMOUNT_LABEL,
  ACCUMULO_MANUAL_QUANTITY_LABEL,
  ACCUMULO_TILE_EYEBROW,
  describeAccumulationActive,
  describeAccumulationDone,
  describeAccumulationDraft,
  describeAccumulationNone,
  describeAccumulationOutcomeFooter,
  describeAccumulationReadFailure,
  describeClassStripItem,
  describeMonthsBarCaption,
  describeReserveWarning,
  monthLabelLong,
} from '@/lib/utils/accumulationNarrative';

interface AccumuloTileProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  /** deriveTargetLeverageRatio(targets) — threaded to the editor's Ottimizzato view. */
  targetLeverageRatio: number;
  /** The owner's "Allocazione ideale" objectives, or `null` when not yet loaded. */
  idealAllocation: IdealAllocationSettings | null;
  onAssetsChanged: () => void;
}

const DEPS: PlanDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };

/** Every button of the tile: 44px on touch, the dense 32px from `desktop:` (AGENTS.md → Accessibility). */
const TILE_ACTION_CLASS = 'h-11 text-[12px] desktop:h-8';
/** A row's action: the same floor, a tighter label. */
const ROW_ACTION_CLASS = 'h-11 shrink-0 px-3 text-[12px] desktop:h-8 desktop:px-2 desktop:text-[11px]';
/** Undoing a closed line («Scollega», «Segna da rifare») is rare and asks nothing of the reader:
 *  a ghost, so a column of seven executed lines does not read as seven calls to action. */
// The negative right margin lines the ghost's LABEL up with the state above it (a ghost has no
// edge of its own, so its padding read as a stray indent at 390).
const ROW_UNDO_CLASS = `${ROW_ACTION_CLASS} -mr-3 text-muted-foreground desktop:-mr-2`;

/** A dismissed `toConfirm` match falls back to what its raw state would be without a match — the
 *  dismissal is never written (see the file header), so it only affects THIS render. */
function effectiveLineState(rawState: LineUiState, key: string, ignored: Set<string>, isLate: boolean): LineUiState {
  if (rawState === 'toConfirm' && ignored.has(key)) return isLate ? 'late' : 'todo';
  return rawState;
}

/** Every installment fully closed, `late` lines included — the plan has nothing left to do. */
function isPlanDone(plan: AccumulationPlan, currentIndex: number): boolean {
  if (currentIndex <= plan.months) return false;
  const linesClosed = plan.installments.every((installment) => installment.lines.every((line) => line.status !== 'planned'));
  const disposalsClosed = plan.disposals.every((disposal) => disposal.status !== 'planned');
  return linesClosed && disposalsClosed;
}

export function AccumuloTile({ ownerId, allAssets, targets, band, targetLeverageRatio, idealAllocation, onAssetsChanged }: AccumuloTileProps) {
  const isDemo = useDemoMode();
  const plansQuery = useAccumulationPlans(ownerId);
  const plan = selectOpenPlan(plansQuery.data);

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarFocusIndex, setCalendarFocusIndex] = useState<number | undefined>(undefined);
  const [recalibrateIndex, setRecalibrateIndex] = useState<number | null>(null);
  const [manualLine, setManualLine] = useState<{ installmentIndex: number; positionId: string; qty: string; amount: string } | null>(null);
  const [manualDisposal, setManualDisposal] = useState<{ assetId: string; amount: string } | null>(null);
  const [ignoredMatches, setIgnoredMatches] = useState<Set<string>>(new Set());

  const deleteDraftRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const deleteDraftMutation = useDeleteDraftPlan(ownerId);
  const closeMutation = useClosePlan(ownerId);
  const activateMutation = useActivatePlan(ownerId);
  const setLineMutation = useSetInstallmentLine(ownerId);
  const setDisposalMutation = useSetDisposal(ownerId);
  const transactionsQuery = useAssetTransactions(ownerId, undefined, { enabled: !!plan && plan.status === 'active' });

  const deleteDraftArmed = useArmedDelete(deleteDraftRef, () => {
    if (plan) void deleteDraftMutation.mutateAsync(plan.id);
  });
  const stopArmed = useArmedDelete(stopRef, () => {
    if (plan) void closeMutation.mutateAsync({ planId: plan.id, status: 'cancelled' });
  });
  const closeArmed = useArmedDelete(closeRef, () => {
    if (plan) void closeMutation.mutateAsync({ planId: plan.id, status: 'completed' });
  });

  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);
  const sourceCashEur = useMemo(
    () => allAssets.filter((asset) => asset.assetClass === 'cash').reduce((sum, asset) => sum + calculateAssetValue(asset), 0),
    [allAssets],
  );

  // Stabilized to day granularity (never `new Date()` inline in the two expensive memos below): a
  // fresh Date every render defeated their memoization even on a keystroke in the manual form (PR
  // #4 review, rilievo 3) — `todayIso` only changes once a day, so `today`'s identity does too.
  const todayIso = getItalyDateIso(new Date());
  const today = useMemo(() => new Date(`${todayIso}T12:00:00`), [todayIso]);

  // Rules of Hooks: computed unconditionally, ahead of the loading/failed/none/draft early returns
  // below, even though only the active (non-done) branch renders them.
  const currentIndex = useMemo(() => (plan ? monthIndexOf(plan, toMonthKey(today)) : 0), [plan, today]);

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

  const trajectory = useMemo(
    () =>
      plan && targets
        ? projectClassTrajectory({
            plan,
            allAssets,
            installments: plan.installments,
            targets,
            band,
            compare: compareAllocations,
            currentIndex,
          })
        : [],
    [plan, allAssets, targets, band, currentIndex],
  );

  const surfaceState = resolveSurfaceState({ loading: plansQuery.isLoading || (!!plan && !targets), failed: plansQuery.isError });

  const measurementInput = targets ? { allAssets, targets, compare: compareAllocations, today: new Date() } : null;

  const setStatus = async (installmentIndex: number, positionId: string, status: 'skipped' | 'planned') => {
    if (!measurementInput) return;
    await setLineMutation.mutateAsync({ planId: plan!.id, index: installmentIndex, positionId, patch: { status }, measurementInput });
  };

  const saveManual = async () => {
    if (!manualLine || !measurementInput) return;
    const executedQuantity = Number(manualLine.qty);
    const executedAmountEur = Number(manualLine.amount);
    if (!Number.isFinite(executedQuantity) || !Number.isFinite(executedAmountEur)) return;
    await setLineMutation.mutateAsync({
      planId: plan!.id,
      index: manualLine.installmentIndex,
      positionId: manualLine.positionId,
      patch: { status: 'executed', executedQuantity, executedAmountEur },
      measurementInput,
    });
    setManualLine(null);
  };

  /** §9's «Conferma»: link the proposed ledger trades and close the line. */
  const confirmMatch = async (installmentIndex: number, positionId: string, match: LineMatch) => {
    if (!measurementInput) return;
    await setLineMutation.mutateAsync({
      planId: plan!.id,
      index: installmentIndex,
      positionId,
      patch: { status: 'executed', transactionIds: match.transactionIds, executedQuantity: match.quantity, executedAmountEur: match.amountEur },
      measurementInput,
    });
  };

  /** §10.2 punto 4's «Scollega»: undo a ledger-linked confirmation, clearing its transaction ids. */
  const unlinkLine = async (installmentIndex: number, positionId: string) => {
    if (!measurementInput) return;
    await setLineMutation.mutateAsync({
      planId: plan!.id,
      index: installmentIndex,
      positionId,
      patch: { status: 'planned', transactionIds: undefined, executedQuantity: undefined, executedAmountEur: undefined },
      measurementInput,
    });
  };

  const confirmDisposalMatch = async (assetId: string, match: LineMatch) => {
    await setDisposalMutation.mutateAsync({
      planId: plan!.id,
      assetId,
      patch: { status: 'executed', transactionIds: match.transactionIds, executedAmountEur: match.amountEur },
    });
  };

  const unlinkDisposal = async (assetId: string) => {
    await setDisposalMutation.mutateAsync({
      planId: plan!.id,
      assetId,
      patch: { status: 'planned', transactionIds: undefined, executedAmountEur: undefined },
    });
  };

  const setDisposalStatus = async (assetId: string, status: 'skipped' | 'planned') => {
    await setDisposalMutation.mutateAsync({ planId: plan!.id, assetId, patch: { status } });
  };

  const saveManualDisposal = async () => {
    if (!manualDisposal) return;
    const executedAmountEur = Number(manualDisposal.amount);
    if (!Number.isFinite(executedAmountEur)) return;
    await setDisposalMutation.mutateAsync({ planId: plan!.id, assetId: manualDisposal.assetId, patch: { status: 'executed', executedAmountEur } });
    setManualDisposal(null);
  };

  const openCalendarOn = (installmentIndex: number) => {
    setCalendarFocusIndex(installmentIndex);
    setCalendarOpen(true);
  };

  if (surfaceState === 'loading') {
    return (
      <Tile eyebrow={ACCUMULO_TILE_EYEBROW}>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Tile>
    );
  }

  if (surfaceState === 'failed') {
    return (
      <ErrorNotice
        compact
        onRetry={() => void plansQuery.refetch()}
        notice={describeReadFailure({ subject: ACCUMULO_TILE_EYEBROW, consequence: describeAccumulationReadFailure(), canRetry: true })}
      />
    );
  }

  if (!plan) {
    return (
      <>
        <Tile eyebrow={ACCUMULO_TILE_EYEBROW} reading={describeAccumulationNone(sourceCashEur)}>
          <Button className={`mt-3.5 w-fit ${TILE_ACTION_CLASS}`} disabled={isDemo || !targets} onClick={() => setPlanDialogOpen(true)}>
            {ACCUMULO_ACTION_CREATE_PLAN}
          </Button>
        </Tile>
        {planDialogOpen && targets && (
          <AccumulationPlanDialog
            open={planDialogOpen}
            onClose={() => setPlanDialogOpen(false)}
            ownerId={ownerId}
            plan={null}
            allAssets={allAssets}
            targets={targets}
            band={band}
            targetLeverageRatio={targetLeverageRatio}
            idealAllocation={idealAllocation}
            onAssetsChanged={onAssetsChanged}
            onSaved={() => setPlanDialogOpen(false)}
          />
        )}
      </>
    );
  }

  // ── draft ────────────────────────────────────────────────────────────────
  if (plan.status === 'draft') {
    const liquidity = computeUsableLiquidity(plan.liquidity, assetsById, plan.disposals, plan.months, DEPS);
    const states = resolvePositionStates(plan.positions, assetsById, DEPS);
    const totals = computeTotalPurchases(states, liquidity.L);
    const totalEur = Object.values(totals).reduce((sum, v) => sum + v, 0);
    const draftIssues = targets ? validateDraftAgainstAssets(plan, assetsById) : [];

    const handleActivate = async () => {
      if (!targets) return;
      try {
        await activateMutation.mutateAsync({
          planId: plan.id,
          input: { allAssets, targets, compare: compareAllocations, deps: DEPS, today: new Date() },
        });
      } catch (error) {
        toast.error(describeWriteError(error));
      }
    };

    return (
      <>
        <Tile eyebrow={ACCUMULO_TILE_EYEBROW} reading={describeAccumulationDraft({ totalEur, months: plan.months, startMonth: plan.startMonth })}>
          <div className="mt-3 grid grid-cols-2 gap-3 tablet:grid-cols-4">
            <DraftBox label={ACCUMULO_DRAFT_BOX_LIQUIDITY} value={cachedFormatCurrencyEUR(liquidity.sourceCashEur)} />
            <DraftBox label={ACCUMULO_DRAFT_BOX_DISPOSALS} value={cachedFormatCurrencyEUR(liquidity.disposalProceedsEur)} />
            <DraftBox label={ACCUMULO_DRAFT_BOX_INFLOWS} value={cachedFormatCurrencyEUR(liquidity.inflowTotalEur)} />
            <DraftBox label={ACCUMULO_DRAFT_BOX_POSITIONS} value={`${plan.positions.length}`} />
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
            <Button
              ref={deleteDraftRef}
              variant="outline"
              className={TILE_ACTION_CLASS}
              disabled={isDemo}
              onClick={deleteDraftArmed.onClick}
              onBlur={deleteDraftArmed.onBlur}
            >
              {deleteDraftArmed.armed ? armedActionLabel(ACCUMULO_ACTION_DELETE_DRAFT_VERB) : ACCUMULO_ACTION_DELETE_DRAFT}
            </Button>
            <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => setPlanDialogOpen(true)}>
              {ACCUMULO_ACTION_EDIT}
            </Button>
            <Button
              className={TILE_ACTION_CLASS}
              disabled={isDemo || !targets || draftIssues.length > 0}
              onClick={() => void handleActivate()}
            >
              {ACCUMULO_ACTION_ACTIVATE}
            </Button>
          </div>
        </Tile>
        {planDialogOpen && targets && (
          <AccumulationPlanDialog
            open={planDialogOpen}
            onClose={() => setPlanDialogOpen(false)}
            ownerId={ownerId}
            plan={plan}
            allAssets={allAssets}
            targets={targets}
            band={band}
            targetLeverageRatio={targetLeverageRatio}
            idealAllocation={idealAllocation}
            onAssetsChanged={onAssetsChanged}
            onSaved={() => setPlanDialogOpen(false)}
          />
        )}
      </>
    );
  }

  // ── active / done ────────────────────────────────────────────────────────
  const done = isPlanDone(plan, currentIndex);
  const states = resolvePositionStates(plan.positions, assetsById, DEPS);
  const outcome = projectPlanOutcome(states, plan.installments, plan.residualEur ?? 0, assetsById, plan.positions, DEPS);

  if (done) {
    const closedCount = plan.installments.filter((installment) => installment.lines.every((line) => line.status !== 'planned')).length;
    const investedEur = plan.installments.reduce(
      (sum, installment) => sum + installment.lines.reduce((s, line) => s + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : 0), 0),
      0,
    );
    const totalEur = plan.installments.reduce((sum, installment) => sum + installment.lines.reduce((s, line) => s + line.plannedAmountEur, 0), 0);
    const avgAbsDrift = outcome.positions.length > 0 ? outcome.positions.reduce((sum, p) => sum + Math.abs(p.driftPp), 0) / outcome.positions.length : 0;
    const maxDrift = outcome.maxDriftPositionId
      ? { label: outcome.positions.find((p) => p.positionId === outcome.maxDriftPositionId)?.label ?? '', deltaPp: outcome.maxAbsDriftPp }
      : null;

    return (
      <>
        <Tile
          eyebrow={ACCUMULO_TILE_EYEBROW}
          reading={describeAccumulationDone({ closedCount, totalInstallments: plan.months, investedEur, totalEur, maxDrift })}
        >
          <div className="mt-3 grid grid-cols-3 gap-3">
            <DraftBox label={ACCUMULO_DONE_BOX_EXECUTED} value={`${closedCount} / ${plan.months}`} />
            <DraftBox label={ACCUMULO_DONE_BOX_RESIDUAL} value={cachedFormatCurrencyEUR(outcome.residualEur)} />
            <DraftBox label={ACCUMULO_DONE_BOX_DRIFT} value={formatNumberIt(avgAbsDrift, 1) + ' pp'} />
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
            <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => { setCalendarFocusIndex(undefined); setCalendarOpen(true); }}>
              {ACCUMULO_ACTION_CALENDAR}
            </Button>
            <Button
              ref={closeRef}
              className={TILE_ACTION_CLASS}
              disabled={isDemo}
              onClick={closeArmed.onClick}
              onBlur={closeArmed.onBlur}
            >
              {closeArmed.armed ? armedActionLabel(ACCUMULO_ACTION_CLOSE_VERB) : ACCUMULO_ACTION_CLOSE}
            </Button>
          </div>
        </Tile>
        {calendarOpen && targets && (
          <AccumulationCalendarDialog
            open={calendarOpen}
            onClose={() => { setCalendarOpen(false); setCalendarFocusIndex(undefined); }}
            plan={plan}
            ownerId={ownerId}
            allAssets={allAssets}
            targets={targets}
            band={band}
            initialExpandedIndex={calendarFocusIndex}
          />
        )}
      </>
    );
  }

  // ── active ───────────────────────────────────────────────────────────────
  const currentInstallment = plan.installments.find((installment) => installment.index === currentIndex);
  const lateLines = plan.installments
    .filter((installment) => installment.index < currentIndex)
    .flatMap((installment) => installment.lines.filter((line) => line.status === 'planned').map((line) => ({ installment, line })));
  const currentLines = currentInstallment ? currentInstallment.lines.filter((line) => line.plannedQuantity > 0 || line.status !== 'planned') : [];

  const executedCount = currentInstallment ? currentInstallment.lines.filter((line) => line.status === 'executed').length : 0;
  const todoCount = lateLines.length + (currentInstallment ? currentInstallment.lines.filter((line) => line.status === 'planned').length : 0);
  const installmentTotalEur = currentInstallment
    ? currentInstallment.lines.reduce((sum, line) => sum + (line.status === 'executed' ? (line.executedAmountEur ?? line.plannedAmountEur) : line.plannedAmountEur), 0)
    : 0;

  const clampedIndex = Math.min(currentIndex, plan.months);

  // The strip's rows and the reading's «furthest drift» come from the SAME list, dormant classes
  // already out (`selectClassStripRows`), so the two can never name different classes.
  const classRows = selectClassStripRows(trajectory, clampedIndex);
  const classStrip = classRows.map((row) => ({
    row,
    item: describeClassStripItem({
      label: ASSET_CLASS_LABELS[row.assetClass] ?? row.assetClass,
      currentPct: row.currentPct,
      targetPct: row.targetPct,
      currentDriftPp: row.currentDriftPp,
      finalDriftPp: row.finalDriftPp,
      outOfBandNow: row.outOfBandNow,
      reentersAt: row.reentryMonth
        ? monthLabelLong(row.reentryMonth === 'baseline' ? plan.startMonth : row.reentryMonth, false)
        : undefined,
    }),
  }));

  const furthestDrift = classRows.reduce<{ label: string; deltaPp: number } | null>(
    (worst, row) =>
      worst === null || Math.abs(row.currentDriftPp) > Math.abs(worst.deltaPp)
        ? { label: ASSET_CLASS_LABELS[row.assetClass] ?? row.assetClass, deltaPp: row.currentDriftPp }
        : worst,
    null,
  );

  const belowReserve = plan.liquidity.reserveEur > 0 && sourceCashEur < plan.liquidity.reserveEur;

  const maxDrift = outcome.maxDriftPositionId
    ? { label: outcome.positions.find((p) => p.positionId === outcome.maxDriftPositionId)?.label ?? '', deltaPp: outcome.maxAbsDriftPp }
    : null;

  const monthsClosed = plan.installments.filter((installment) => installment.lines.every((line) => line.status !== 'planned')).length;

  return (
    <>
      <Tile
        eyebrow={ACCUMULO_TILE_EYEBROW}
        reading={describeAccumulationActive({
          monthKey: currentInstallment?.month ?? plan.startMonth,
          installmentTotalEur,
          lineCount: currentLines.length,
          executedCount,
          todoCount,
          furthestDrift,
        })}
      >
        {belowReserve && (
          <p className="mt-2 text-[12px] text-warning-foreground">
            <NarrativeText
              segments={describeReserveWarning({ sourceCashEur, reserveEur: plan.liquidity.reserveEur, belowReserve: true }) ?? []}
              className="inline"
            />
          </p>
        )}

        {/* Months bar (§10.2 point 3): one 3px segment per month. A closed month takes the theme's
            progress fill (`--progress-fill`, the foreground by default, mid slate in Lime Frost —
            «no near-black bar anywhere», doc/guide/fork-scelte-ui.md § 2). */}
        <div className="mt-3 flex gap-[3px]" role="img" aria-label={describeMonthsBarCaption({ startMonth: plan.startMonth, endMonth: plan.installments[plan.installments.length - 1]?.month ?? plan.startMonth, closedCount: monthsClosed, totalMonths: plan.months })}>
          {plan.installments.map((installment) => {
            const hasLate = installment.index < currentIndex && installment.lines.some((line) => line.status === 'planned');
            const closed = installment.lines.every((line) => line.status !== 'planned');
            const isCurrent = installment.index === currentIndex;
            return (
              <div
                key={installment.index}
                className={`h-[3px] flex-1 rounded-full ${hasLate ? 'bg-destructive' : closed ? 'bg-[var(--progress-fill)]' : isCurrent ? 'bg-muted-foreground/60' : 'bg-muted'}`}
              />
            );
          })}
        </div>
        <p className="mt-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {describeMonthsBarCaption({ startMonth: plan.startMonth, endMonth: plan.installments[plan.installments.length - 1]?.month ?? plan.startMonth, closedCount: monthsClosed, totalMonths: plan.months })}
        </p>

        {/* Two columns when the TILE is wide enough (a container query: on the page the tile sits in
            a 470px column at 1440 and full width on a tablet, so the viewport says nothing): what
            to DO this month (the lines, then the disposals) on the left, where the plan takes each
            CLASS on the right. Narrower, the strip follows the lines. */}
        <div className="@container mt-3">
        <div className="grid grid-cols-1 gap-y-4 @[720px]:grid-cols-12 @[720px]:gap-x-8">
        <div className="min-w-0 @[720px]:col-span-7">
        {/* Lines of the current installment, late lines first (§10.2 point 4). */}
        <ul className="divide-y divide-border">
          {[...lateLines.map(({ installment, line }) => ({ installmentIndex: installment.index, line })), ...currentLines.map((line) => ({ installmentIndex: currentIndex, line }))].map(
            ({ installmentIndex, line }) => {
              const key = `${installmentIndex}:${line.positionId}`;
              const isLateRow = installmentIndex < currentIndex;
              const status = effectiveLineState(matchResult.lineStates[key] ?? 'todo', key, ignoredMatches, isLateRow);
              const match = matchResult.matches.find((m) => m.kind === 'installment' && m.index === installmentIndex && m.positionId === line.positionId);
              const isManual = manualLine?.installmentIndex === installmentIndex && manualLine.positionId === line.positionId;
              const asset = assetsById.get(line.assetId);
              return (
                <li key={key} className="py-2">
                  {/* The name takes the room and wraps (never cut — fork-scelte-ui.md § 1); the state
                      and its actions stack at the right on a phone and sit in one line from
                      `desktop:`. A wrapping row put «Scollega» on a line of its own at 390. */}
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-[13px] text-foreground">
                        {plan.positions.find((p) => p.id === line.positionId)?.label ?? asset?.name ?? line.positionId}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                        {asset && `${getAssetDisplayTicker(asset)} · `}
                        {formatNumberIt(line.plannedQuantity, 0)} · {cachedFormatCurrencyEUR(line.plannedAmountEur)}
                      </span>
                    </span>
                    <div className="flex shrink-0 flex-col items-end gap-1 desktop:flex-row desktop:items-center desktop:gap-3">
                    <span className="shrink-0 text-[11px] text-muted-foreground">{ACCUMULO_LINE_STATUS_LABEL[status]}</span>
                    {!isDemo && status === 'toConfirm' && match && (
                      <span className="flex shrink-0 gap-1.5">
                        <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void confirmMatch(installmentIndex, line.positionId, match)}>
                          {ACCUMULO_ACTION_CONFIRM}
                        </Button>
                        <Button
                          variant="outline"
                          className={ROW_ACTION_CLASS}
                          onClick={() => setIgnoredMatches((prev) => new Set(prev).add(key))}
                        >
                          {ACCUMULO_ACTION_IGNORE_MATCH}
                        </Button>
                      </span>
                    )}
                    {!isDemo && status === 'late' && (
                      <span className="flex shrink-0 gap-1.5">
                        <Button
                          variant="outline"
                          className={ROW_ACTION_CLASS}
                          onClick={() =>
                            setManualLine({
                              installmentIndex,
                              positionId: line.positionId,
                              qty: String(line.plannedQuantity),
                              amount: line.plannedAmountEur.toFixed(2),
                            })
                          }
                        >
                          {ACCUMULO_ACTION_MARK_EXECUTED}
                        </Button>
                        <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void setStatus(installmentIndex, line.positionId, 'skipped')}>
                          {ACCUMULO_ACTION_SKIP}
                        </Button>
                      </span>
                    )}
                    {!isDemo && status === 'executed' && !!line.transactionIds?.length && (
                      <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void unlinkLine(installmentIndex, line.positionId)}>
                        {ACCUMULO_ACTION_UNLINK}
                      </Button>
                    )}
                    {!isDemo && status === 'executed' && !line.transactionIds?.length && (
                      <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void setStatus(installmentIndex, line.positionId, 'planned')}>
                        {ACCUMULO_ACTION_UNDO_EXECUTED}
                      </Button>
                    )}
                    {!isDemo && status === 'lostLink' && (
                      <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => openCalendarOn(installmentIndex)}>
                        {ACCUMULO_ACTION_REVIEW}
                      </Button>
                    )}
                  </div>
                  </div>
                  {isManual && (
                    <div className="mt-1.5 flex items-end gap-2 rounded-lg bg-muted p-2.5">
                      <label className="flex-1 text-[11px] text-muted-foreground">
                        {ACCUMULO_MANUAL_QUANTITY_LABEL}
                        <Input type="number" value={manualLine.qty} onChange={(event) => setManualLine({ ...manualLine, qty: event.target.value })} className="mt-1 h-11 font-mono desktop:h-8" />
                      </label>
                      <label className="flex-1 text-[11px] text-muted-foreground">
                        {ACCUMULO_MANUAL_AMOUNT_LABEL}
                        <Input type="number" value={manualLine.amount} onChange={(event) => setManualLine({ ...manualLine, amount: event.target.value })} className="mt-1 h-11 font-mono desktop:h-8" />
                      </label>
                      <Button variant="ghost" className={ROW_ACTION_CLASS} onClick={() => setManualLine(null)}>
                        {ACCUMULO_ACTION_CANCEL}
                      </Button>
                      <Button className={ROW_ACTION_CLASS} onClick={() => void saveManual()}>
                        {ACCUMULO_ACTION_SAVE}
                      </Button>
                    </div>
                  )}
                </li>
              );
            },
          )}
        </ul>

        {/* Disposals — held instruments left out of the plan, sold at month 1 (D5, §9's disposal matching). */}
        {plan.disposals.length > 0 && (
          <div className="mt-3">
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_DISPOSALS_SECTION_TITLE}</p>
            <ul className="mt-1.5 divide-y divide-border">
              {plan.disposals.map((disposal) => {
                const key = `disposal:${disposal.assetId}`;
                const isLateRow = currentIndex > 1;
                const status = effectiveLineState(matchResult.lineStates[key] ?? 'todo', key, ignoredMatches, isLateRow);
                const match = matchResult.matches.find((m) => m.kind === 'disposal' && m.assetId === disposal.assetId);
                const isManual = manualDisposal?.assetId === disposal.assetId;
                const asset = assetsById.get(disposal.assetId);
                return (
                  <li key={key} className="py-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 break-words text-[13px] text-foreground">{asset?.name ?? disposal.assetId}</span>
                        <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                          {asset && `${getAssetDisplayTicker(asset)} · `}
                          {cachedFormatCurrencyEUR(disposal.executedAmountEur ?? disposal.estimatedProceedsEur)}
                        </span>
                      </span>
                      <div className="flex shrink-0 flex-col items-end gap-1 desktop:flex-row desktop:items-center desktop:gap-3">
                      <span className="shrink-0 text-[11px] text-muted-foreground">{ACCUMULO_LINE_STATUS_LABEL[status]}</span>
                      {!isDemo && status === 'toConfirm' && match && (
                        <span className="flex shrink-0 gap-1.5">
                          <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void confirmDisposalMatch(disposal.assetId, match)}>
                            {ACCUMULO_ACTION_CONFIRM}
                          </Button>
                          <Button
                            variant="outline"
                            className={ROW_ACTION_CLASS}
                            onClick={() => setIgnoredMatches((prev) => new Set(prev).add(key))}
                          >
                            {ACCUMULO_ACTION_IGNORE_MATCH}
                          </Button>
                        </span>
                      )}
                      {!isDemo && status === 'late' && (
                        <span className="flex shrink-0 gap-1.5">
                          <Button
                            variant="outline"
                            className={ROW_ACTION_CLASS}
                            onClick={() => setManualDisposal({ assetId: disposal.assetId, amount: disposal.estimatedProceedsEur.toFixed(2) })}
                          >
                            {ACCUMULO_ACTION_MARK_EXECUTED}
                          </Button>
                          <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void setDisposalStatus(disposal.assetId, 'skipped')}>
                            {ACCUMULO_ACTION_SKIP}
                          </Button>
                        </span>
                      )}
                      {!isDemo && status === 'executed' && !!disposal.transactionIds?.length && (
                        <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void unlinkDisposal(disposal.assetId)}>
                          {ACCUMULO_ACTION_UNLINK}
                        </Button>
                      )}
                      {!isDemo && status === 'executed' && !disposal.transactionIds?.length && (
                        <Button variant="ghost" className={ROW_UNDO_CLASS} onClick={() => void setDisposalStatus(disposal.assetId, 'planned')}>
                          {ACCUMULO_ACTION_UNDO_EXECUTED}
                        </Button>
                      )}
                      {/* lostLink: no Calendario surface for disposals — the only recovery is unlinking. */}
                      {!isDemo && status === 'lostLink' && (
                        <Button variant="outline" className={ROW_ACTION_CLASS} onClick={() => void unlinkDisposal(disposal.assetId)}>
                          {ACCUMULO_ACTION_UNLINK}
                        </Button>
                      )}
                    </div>
                    </div>
                    {isManual && (
                      <div className="mt-1.5 flex items-end gap-2 rounded-lg bg-muted p-2.5">
                        <label className="flex-1 text-[11px] text-muted-foreground">
                          {ACCUMULO_MANUAL_AMOUNT_LABEL}
                          <Input
                            type="number"
                            value={manualDisposal.amount}
                            onChange={(event) => setManualDisposal({ ...manualDisposal, amount: event.target.value })}
                            className="mt-1 h-11 font-mono desktop:h-8"
                          />
                        </label>
                        <Button variant="ghost" className={ROW_ACTION_CLASS} onClick={() => setManualDisposal(null)}>
                          {ACCUMULO_ACTION_CANCEL}
                        </Button>
                        <Button className={ROW_ACTION_CLASS} onClick={() => void saveManualDisposal()}>
                          {ACCUMULO_ACTION_SAVE}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        </div>

        {/* Class strip (D11): one row per class the plan touches (dormant ones dropped by
            `selectClassStripRows`) — name, today's share and the target on one line, the track
            under it (fill = today, hairline = target, ring = end of the plan), the drift in pp as
            the muted second figure. Amber marks only a class OUT of band now, on its drift line
            and its re-entry month, never the whole row (owner's call, 2026-09-25). */}
        {classStrip.length > 0 && (
          <div className="min-w-0 @[720px]:col-span-5 @[720px]:border-l @[720px]:border-border @[720px]:pl-8">
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_CLASS_STRIP_TITLE}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{ACCUMULO_CLASS_STRIP_LEGEND}</p>
            <ul className="mt-2.5 space-y-3">
              {classStrip.map(({ row, item }) => (
                <li key={row.assetClass}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[13px] text-foreground">{item.label}</span>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums">
                      <span className="font-semibold text-foreground">{item.current}</span>
                      <span className="ml-1.5 text-muted-foreground">{item.target}</span>
                    </span>
                  </div>
                  <TargetTick
                    className="mt-1"
                    color={`var(--allocation-row-bar, var(${getAssetClassCssVar(row.assetClass)}))`}
                    currentPercentage={row.currentPct}
                    targetPercentage={row.targetPct}
                    projectedPercentage={row.finalPct}
                  />
                  <p className={`mt-0.5 font-mono text-[10px] tabular-nums ${item.outOfBandNow ? 'text-warning-foreground' : 'text-muted-foreground'}`}>
                    {item.secondary}
                    {item.note && <span className="font-sans"> · {item.note}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
        </div>

        <div className="mt-auto border-t border-border pt-3.5">
          <NarrativeText segments={describeAccumulationOutcomeFooter({ maxDrift, residualEur: outcome.residualEur })} className="text-[11px] leading-[1.5] text-muted-foreground" />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button variant="outline" className={TILE_ACTION_CLASS} disabled={!currentInstallment} onClick={() => setRecalibrateIndex(currentIndex)}>
              {ACCUMULO_ACTION_RECALIBRATE}
            </Button>
            <Button variant="outline" className={TILE_ACTION_CLASS} onClick={() => { setCalendarFocusIndex(undefined); setCalendarOpen(true); }}>
              {ACCUMULO_ACTION_CALENDAR}
            </Button>
            <Button
              ref={stopRef}
              variant="outline"
              className={TILE_ACTION_CLASS}
              disabled={isDemo}
              onClick={stopArmed.onClick}
              onBlur={stopArmed.onBlur}
            >
              {stopArmed.armed ? armedActionLabel(ACCUMULO_ACTION_STOP_VERB) : ACCUMULO_ACTION_STOP}
            </Button>
          </div>
        </div>
      </Tile>

      {calendarOpen && targets && (
        <AccumulationCalendarDialog
          open={calendarOpen}
          onClose={() => { setCalendarOpen(false); setCalendarFocusIndex(undefined); }}
          plan={plan}
          ownerId={ownerId}
          allAssets={allAssets}
          targets={targets}
          band={band}
          initialExpandedIndex={calendarFocusIndex}
        />
      )}
      {recalibrateIndex !== null && (
        <AccumulationRecalibrateDialog
          open={recalibrateIndex !== null}
          onClose={() => setRecalibrateIndex(null)}
          plan={plan}
          index={recalibrateIndex}
          ownerId={ownerId}
          allAssets={allAssets}
          onApplied={() => setRecalibrateIndex(null)}
        />
      )}
    </>
  );
}

function DraftBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
