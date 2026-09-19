'use client';

/**
 * AccumulationPlanDialog — the three-step PAC editor (doc/pac-ate.md §10.3).
 *
 * Step 1 picks where the money comes from, step 2 where it goes (one row per tradable asset, a
 * toggle between «Nel piano» and «Da vendere», optional proxy grouping, «+ Nuovo asset» for a
 * position that does not exist yet — D7, `AssetDialog` in its empty-create mode), step 3 is the
 * read-only preview from `buildDraftPreview`. Every screen edits the SAME local `draft`
 * (`AccumulationPlanDraft`) so the liquidity box on step 1 reflects step 2's disposals the moment
 * the reader goes back — nothing here is computed twice.
 *
 * `createDraftPlan`/`updateDraftPlan` run their own zod pass; this dialog additionally runs
 * `validateDraftAgainstAssets` on every render so the status line can name the FIRST domain issue
 * before the write is even attempted (§6, §10.3: "uno alla volta, il primo").
 */
import { useMemo, useState } from 'react';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { AccumulationPlan, AccumulationPlanDraft, PlanDisposal, PlanPosition } from '@/types/accumulationPlan';
import { ASSET_CLASS_CHART_INDEX, ASSET_CLASS_LABELS, resolveAllocationRole, type RebalanceBand } from '@/lib/utils/allocationUtils';
import {
  addMonths,
  buildDraftPreview,
  computeUsableLiquidity,
  resolvePositionStates,
  toMonthKey,
  unitPriceEur,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { validateDraftAgainstAssets, type DraftIssue } from '@/lib/utils/accumulationPlanSchema';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useCreateDraftPlan, useUpdateDraftPlan, useActivatePlan } from '@/lib/hooks/useAccumulationPlan';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_COLORS } from '@/lib/constants/colors';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { ClassDriftChart } from '@/components/allocation/ClassDriftChart';
import { OptimizerPanel } from '@/components/allocation/OptimizerPanel';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import {
  describeOptimizerSnapshot,
  OPTIMIZER_STEP2_ARIA_LABEL,
  OPTIMIZER_STEP2_MANUAL,
  OPTIMIZER_STEP2_OPTIMIZED,
} from '@/lib/utils/weightOptimizerNarrative';
import { cachedFormatCurrencyEUR, formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';
import { describeModalStatus, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import {
  ACCUMULO_ACTION_ACTIVATE,
  ACCUMULO_ACTION_BACK,
  ACCUMULO_ACTION_GROUP_PROXY,
  ACCUMULO_ACTION_NEW_ASSET,
  ACCUMULO_ACTION_NEXT,
  ACCUMULO_ACTION_SAVE_DRAFT,
  ACCUMULO_ACTION_UNGROUP,
  ACCUMULO_ELLIPSIS,
  ACCUMULO_STEP1_INFLOW,
  ACCUMULO_STEP1_L_DISPOSALS,
  ACCUMULO_STEP1_L_HEADLINE,
  ACCUMULO_STEP1_L_INFLOWS,
  ACCUMULO_STEP1_L_MONTHLY,
  ACCUMULO_STEP1_L_RESERVE,
  ACCUMULO_STEP1_L_SOURCE,
  ACCUMULO_STEP1_MONTHS,
  ACCUMULO_STEP1_NO_CASH_ACCOUNTS,
  ACCUMULO_STEP1_RESERVE,
  ACCUMULO_STEP1_SOURCE_ACCOUNTS,
  ACCUMULO_STEP1_START_MONTH,
  ACCUMULO_STEP2_BUY_ASSET_CONFIRM,
  ACCUMULO_STEP2_BUY_ASSET_PROMPT,
  ACCUMULO_STEP2_COL_CURRENT_WEIGHT,
  ACCUMULO_STEP2_COL_INSTRUMENT,
  ACCUMULO_STEP2_COL_TARGET,
  ACCUMULO_STEP2_FOOTNOTE,
  ACCUMULO_STEP2_NO_TRADABLE_ASSETS,
  ACCUMULO_STEP2_PENDING_ASSET_LABEL,
  ACCUMULO_STEP2_TOGGLE_IN_PLAN,
  ACCUMULO_STEP2_TOGGLE_SELL,
  ACCUMULO_STEP2_TOTAL_LABEL,
  ACCUMULO_STEP3_COL_MONTH,
  ACCUMULO_STEP3_COL_TOTAL,
  ACCUMULO_STEP3_SECTION_CLASSES,
  ACCUMULO_STEP3_SECTION_EXPOSURE,
  ACCUMULO_STEP3_SECTION_WEIGHTS,
  ACCUMULO_STEP_TITLES,
  describeAboveTargetWarning,
  describeAccumuloDialogEyebrow,
  describeInsufficientLiquidityWarning,
  describeUnpricedWarning,
  describeWeightsTotal,
  formatSignedPp,
  monthLabelLong,
  monthLabelShort,
  trajectoryPointLabel,
} from '@/lib/utils/accumulationNarrative';

interface AccumulationPlanDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  /** The draft being edited, or `null` for a brand-new plan. */
  plan: AccumulationPlan | null;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  band: RebalanceBand;
  /** deriveTargetLeverageRatio(targets) — the leva target the optimizer's leverage objective aims at. */
  targetLeverageRatio: number;
  /** The owner's "Allocazione ideale" objectives (Impostazioni → Allocazione), or `null` when not
   *  yet loaded — the Ottimizzato view of step 2 reads it, never a second copy. */
  idealAllocation: IdealAllocationSettings | null;
  /** A «+ Nuovo asset» create landed: the page must reload `allAssets`. */
  onAssetsChanged: () => void;
  onSaved: (planId: string) => void;
}

const DEPS: PlanDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };
const MAX_CALENDAR_ROWS = 8;
const TRAJECTORY_SAMPLE_INDICES = [0, 1, 3, 6, 9];

function emptyDraft(startMonth: string, positions: PlanPosition[] = []): AccumulationPlanDraft {
  return {
    name: 'Piano di accumulo',
    startMonth,
    months: 12,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions,
    disposals: [],
  };
}

function draftFromPlan(plan: AccumulationPlan): AccumulationPlanDraft {
  return {
    name: plan.name,
    startMonth: plan.startMonth,
    months: plan.months,
    liquidity: plan.liquidity,
    positions: plan.positions,
    disposals: plan.disposals,
    optimizerSnapshot: plan.optimizerSnapshot,
  };
}

/**
 * Step 2 starts on ONE singleton position per tradable, valued holding — every euro the page
 * knows about needs a bucket the moment the editor opens (D5/D7), never only once the reader
 * has thought to add one. The target starts at 0, not at the holding's current share: a
 * pre-filled 100% for a single-asset portfolio would hide the very total-≠-100 gate step 2
 * exists to enforce.
 */
function seedPositionsFromAssets(allAssets: Asset[]): PlanPosition[] {
  return allAssets
    .filter((asset) => resolveAllocationRole(asset) === 'tradable' && calculateAssetValue(asset) > 0)
    .map((asset) => ({
      id: crypto.randomUUID(),
      label: asset.name,
      targetPercentage: 0,
      memberAssetIds: [asset.id],
      buyAssetId: asset.id,
    }));
}

export function AccumulationPlanDialog({
  open,
  onClose,
  ownerId,
  plan,
  allAssets,
  targets,
  band,
  targetLeverageRatio,
  idealAllocation,
  onAssetsChanged,
  onSaved,
}: AccumulationPlanDialogProps) {
  const isDemo = useDemoMode();
  const chartColors = useChartColors();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<AccumulationPlanDraft>(() => emptyDraft(addMonths(toMonthKey(new Date()), 1)));
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  const [selectedForGroup, setSelectedForGroup] = useState<Set<string>>(new Set());
  const [groupingBuyAssetId, setGroupingBuyAssetId] = useState<string | null>(null);
  const [newAssetDialogOpen, setNewAssetDialogOpen] = useState(false);
  const [step2Mode, setStep2Mode] = useState<'manual' | 'optimizer'>('manual');

  // Reset on every (open, plan) change, settled during render — AGENTS.md § Dialog Form Reset.
  const [openSubject, setOpenSubject] = useState<{ open: boolean; plan: AccumulationPlan | null } | null>(null);
  if (!openSubject || openSubject.open !== open || openSubject.plan !== plan) {
    setOpenSubject({ open, plan });
    if (open) {
      setDraft(plan ? draftFromPlan(plan) : emptyDraft(addMonths(toMonthKey(new Date()), 1), seedPositionsFromAssets(allAssets)));
      setStep(plan ? 2 : 1);
      setStatus({ phase: 'idle' });
      setSelectedForGroup(new Set());
      setGroupingBuyAssetId(null);
      setStep2Mode('manual');
    }
  }

  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);
  const cashAccounts = useMemo(() => allAssets.filter((asset) => asset.assetClass === 'cash'), [allAssets]);

  // Every tradable holding with a value, plus any asset created empty in THIS session — the
  // moment it exists it must be classified (D7).
  const classifiedAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const position of draft.positions) for (const id of position.memberAssetIds) ids.add(id);
    for (const disposal of draft.disposals) ids.add(disposal.assetId);
    return ids;
  }, [draft.positions, draft.disposals]);

  const candidateAssets = useMemo(
    () =>
      allAssets.filter((asset) => {
        if (resolveAllocationRole(asset) !== 'tradable') return false;
        return calculateAssetValue(asset) > 0 || classifiedAssetIds.has(asset.id);
      }),
    [allAssets, classifiedAssetIds],
  );

  const monthOptions = useMemo(() => {
    const current = toMonthKey(new Date());
    return Array.from({ length: 12 }, (_, i) => addMonths(current, i));
  }, []);

  const liquidity = useMemo(
    () => (open ? computeUsableLiquidity(draft.liquidity, assetsById, draft.disposals, draft.months, DEPS) : null),
    [open, draft, assetsById],
  );

  const issues: DraftIssue[] = useMemo(
    () => (open ? validateDraftAgainstAssets(draft, assetsById) : []),
    [open, draft, assetsById],
  );
  const weightsSum = draft.positions.reduce((sum, position) => sum + position.targetPercentage, 0);
  const weightsMessage = describeWeightsTotal(weightsSum);
  const firstIssue = issues[0]?.message ?? null;

  // ── Step 2 helpers — one row per candidate asset ──────────────────────────

  const positionOfAsset = (assetId: string): PlanPosition | undefined =>
    draft.positions.find((position) => position.memberAssetIds.includes(assetId));

  const updatePositions = (positions: PlanPosition[]) => setDraft((prev) => ({ ...prev, positions }));
  const updateDisposals = (disposals: PlanDisposal[]) => setDraft((prev) => ({ ...prev, disposals }));

  const moveAssetToDisposal = (asset: Asset) => {
    updatePositions(draft.positions.filter((position) => !(position.memberAssetIds.length === 1 && position.memberAssetIds[0] === asset.id)));
    updateDisposals([...draft.disposals, { assetId: asset.id, estimatedProceedsEur: calculateAssetValue(asset), status: 'planned' }]);
  };

  const moveAssetToPosition = (asset: Asset) => {
    updateDisposals(draft.disposals.filter((disposal) => disposal.assetId !== asset.id));
    updatePositions([
      ...draft.positions,
      { id: crypto.randomUUID(), label: asset.name, targetPercentage: 0, memberAssetIds: [asset.id], buyAssetId: asset.id },
    ]);
  };

  const setPositionTarget = (positionId: string, targetPercentage: number) =>
    updatePositions(draft.positions.map((position) => (position.id === positionId ? { ...position, targetPercentage } : position)));

  const confirmGroup = () => {
    if (!groupingBuyAssetId || selectedForGroup.size < 2) return;
    const selectedPositions = draft.positions.filter(
      (position) => position.memberAssetIds.length === 1 && selectedForGroup.has(position.memberAssetIds[0]),
    );
    const totalTarget = selectedPositions.reduce((sum, position) => sum + position.targetPercentage, 0);
    const memberAssetIds = selectedPositions.flatMap((position) => position.memberAssetIds);
    const buyAsset = assetsById.get(groupingBuyAssetId);
    const grouped: PlanPosition = {
      id: crypto.randomUUID(),
      label: buyAsset?.name ?? groupingBuyAssetId,
      targetPercentage: totalTarget,
      memberAssetIds,
      buyAssetId: groupingBuyAssetId,
    };
    const remaining = draft.positions.filter((position) => !(position.memberAssetIds.length === 1 && selectedForGroup.has(position.memberAssetIds[0])));
    updatePositions([...remaining, grouped]);
    setSelectedForGroup(new Set());
    setGroupingBuyAssetId(null);
  };

  const ungroup = (positionId: string) => {
    const position = draft.positions.find((p) => p.id === positionId);
    if (!position) return;
    const members = position.memberAssetIds.map((id) => assetsById.get(id)).filter((a): a is Asset => !!a);
    const totalValue = members.reduce((sum, a) => sum + calculateAssetValue(a), 0);
    const split: PlanPosition[] = members.map((asset) => ({
      id: crypto.randomUUID(),
      label: asset.name,
      targetPercentage: totalValue > 0 ? (calculateAssetValue(asset) / totalValue) * position.targetPercentage : position.targetPercentage / members.length,
      memberAssetIds: [asset.id],
      buyAssetId: asset.id,
    }));
    updatePositions([...draft.positions.filter((p) => p.id !== positionId), ...split]);
  };

  // ── Save / Activate ────────────────────────────────────────────────────────

  const createMutation = useCreateDraftPlan(ownerId);
  const updateMutation = useUpdateDraftPlan(ownerId);
  const activateMutation = useActivatePlan(ownerId);

  const saveDraft = async (): Promise<string | null> => {
    setStatus({ phase: 'submitting' });
    try {
      let planId: string;
      if (plan) {
        await updateMutation.mutateAsync({ planId: plan.id, draft });
        planId = plan.id;
      } else {
        planId = await createMutation.mutateAsync(draft);
      }
      setStatus({ phase: 'idle' });
      return planId;
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
      return null;
    }
  };

  const handleSaveDraft = async () => {
    const planId = await saveDraft();
    if (planId) {
      onSaved(planId);
      onClose();
    }
  };

  const handleActivate = async () => {
    const planId = await saveDraft();
    if (!planId) return;
    setStatus({ phase: 'submitting' });
    try {
      await activateMutation.mutateAsync({
        planId,
        input: { allAssets, targets, compare: compareAllocations, deps: DEPS, today: new Date() },
      });
      onSaved(planId);
      onClose();
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const canProceedFromStep2 = Math.abs(weightsSum - 100) <= 0.01 && draft.positions.length > 0;
  const modalStatus = describeModalStatus(status, {
    idle: [{ text: firstIssue ?? (step === 2 && weightsMessage ? weightsMessage : ACCUMULO_STEP_TITLES[step]) }],
    submitting: 'Salvataggio in corso…',
  });

  const preview = useMemo(
    () => (step === 3 ? buildDraftPreview({ draft, allAssets, targets, band, compare: compareAllocations, deps: DEPS }) : null),
    [step, draft, allAssets, targets, band],
  );

  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        width="xl"
        eyebrow={describeAccumuloDialogEyebrow(step)}
        title={ACCUMULO_STEP_TITLES[step]}
        reading={modalStatus}
        footer={
          <>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((step - 1) as 1 | 2)}>
                {ACCUMULO_ACTION_BACK}
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={() => setStep((step + 1) as 2 | 3)} disabled={step === 2 && !canProceedFromStep2}>
                {ACCUMULO_ACTION_NEXT}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void handleSaveDraft()} disabled={isDemo || status.phase === 'submitting'}>
                  {ACCUMULO_ACTION_SAVE_DRAFT}
                </Button>
                <Button onClick={() => void handleActivate()} disabled={isDemo || status.phase === 'submitting' || issues.length > 0}>
                  {ACCUMULO_ACTION_ACTIVATE}
                </Button>
              </>
            )}
          </>
        }
      >
        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP1_SOURCE_ACCOUNTS}</p>
                {cashAccounts.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">{ACCUMULO_STEP1_NO_CASH_ACCOUNTS}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {cashAccounts.map((account) => {
                      const checked = draft.liquidity.sourceCashAssetIds.includes(account.id);
                      return (
                        <li key={account.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`src-${account.id}`}
                            checked={checked}
                            onCheckedChange={(value) =>
                              setDraft((prev) => ({
                                ...prev,
                                liquidity: {
                                  ...prev.liquidity,
                                  sourceCashAssetIds: value
                                    ? [...prev.liquidity.sourceCashAssetIds, account.id]
                                    : prev.liquidity.sourceCashAssetIds.filter((id) => id !== account.id),
                                },
                              }))
                            }
                          />
                          <label htmlFor={`src-${account.id}`} className="flex-1 text-[13px] text-foreground">
                            {account.name}
                          </label>
                          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{cachedFormatCurrencyEUR(calculateAssetValue(account))}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <label className="block text-[13px] text-foreground">
                {ACCUMULO_STEP1_RESERVE}
                <Input
                  type="number"
                  min={0}
                  value={draft.liquidity.reserveEur}
                  onChange={(event) => setDraft((prev) => ({ ...prev, liquidity: { ...prev.liquidity, reserveEur: Number(event.target.value) || 0 } }))}
                  className="mt-1 font-mono"
                />
              </label>

              <label className="block text-[13px] text-foreground">
                {ACCUMULO_STEP1_INFLOW}
                <Input
                  type="number"
                  min={0}
                  value={draft.liquidity.monthlyInflowEur}
                  onChange={(event) => setDraft((prev) => ({ ...prev, liquidity: { ...prev.liquidity, monthlyInflowEur: Number(event.target.value) || 0 } }))}
                  className="mt-1 font-mono"
                />
              </label>

              <label className="block text-[13px] text-foreground">
                {ACCUMULO_STEP1_MONTHS}
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.months}
                  onChange={(event) => setDraft((prev) => ({ ...prev, months: Math.round(Number(event.target.value)) || 1 }))}
                  className="mt-1 font-mono"
                />
              </label>

              <div className="text-[13px] text-foreground">
                <span className="mb-1 block">{ACCUMULO_STEP1_START_MONTH}</span>
                <Select value={draft.startMonth} onValueChange={(value) => setDraft((prev) => ({ ...prev, startMonth: value }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((month) => (
                      <SelectItem key={month} value={month}>
                        {monthLabelLong(month)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {liquidity && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP1_L_HEADLINE}</p>
                <p className="mt-1 font-mono text-[28px] font-bold tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.L)}</p>
                <dl className="mt-3 space-y-1.5 text-[12px]">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_SOURCE}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.sourceCashEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_RESERVE}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(draft.liquidity.reserveEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_DISPOSALS}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.disposalProceedsEur)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_INFLOWS}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(liquidity.inflowTotalEur)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <dt className="text-muted-foreground">{ACCUMULO_STEP1_L_MONTHLY}</dt>
                    <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(draft.months > 0 ? liquidity.L / draft.months : 0)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <SegmentedPill
              options={[
                { value: 'manual', label: OPTIMIZER_STEP2_MANUAL },
                { value: 'optimizer', label: OPTIMIZER_STEP2_OPTIMIZED },
              ]}
              value={step2Mode}
              onChange={setStep2Mode}
              layoutId="accumulo-step2-mode"
              ariaLabel={OPTIMIZER_STEP2_ARIA_LABEL}
              semantics="radio"
            />

            {step2Mode === 'optimizer' ? (
              <OptimizerPanel
                ownerId={ownerId}
                draft={draft}
                allAssets={allAssets}
                targets={targets}
                targetLeverageRatio={targetLeverageRatio}
                idealAllocation={idealAllocation}
                liquidityL={liquidity?.L ?? 0}
                onApply={(weightsByPositionKey, snapshot) => {
                  setDraft((prev) => ({
                    ...prev,
                    positions: prev.positions.map((position) => ({
                      ...position,
                      targetPercentage: weightsByPositionKey[position.id] ?? position.targetPercentage,
                    })),
                    optimizerSnapshot: snapshot,
                  }));
                  setStep2Mode('manual');
                }}
              />
            ) : (
              <>
            {candidateAssets.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{ACCUMULO_STEP2_NO_TRADABLE_ASSETS}</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_INSTRUMENT}</th>
                    <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_CURRENT_WEIGHT}</th>
                    <th scope="col" className="py-1.5 pr-2 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_TOGGLE_IN_PLAN}/{ACCUMULO_STEP2_TOGGLE_SELL}</th>
                    <th scope="col" className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP2_COL_TARGET}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totalCandidateValue = candidateAssets.reduce((sum, a) => sum + calculateAssetValue(a), 0);
                    const rendered = new Set<string>();
                    const rows: React.ReactNode[] = [];

                    for (const position of draft.positions) {
                      const grouped = position.memberAssetIds.length > 1;
                      position.memberAssetIds.forEach((assetId, memberIndex) => {
                        const asset = assetsById.get(assetId);
                        if (!asset || rendered.has(assetId)) return;
                        rendered.add(assetId);
                        const isHead = memberIndex === 0;
                        const weightPct = totalCandidateValue > 0 ? (calculateAssetValue(asset) / totalCandidateValue) * 100 : 0;
                        rows.push(
                          <tr key={assetId} className="border-b border-border last:border-0">
                            <th scope="row" className={`py-1.5 pr-2 text-left font-normal text-foreground ${grouped && !isHead ? 'pl-5' : ''}`}>
                              {!grouped && (
                                <Checkbox
                                  className="mr-2 inline-flex align-middle"
                                  checked={selectedForGroup.has(assetId)}
                                  onCheckedChange={(value) =>
                                    setSelectedForGroup((prev) => {
                                      const next = new Set(prev);
                                      if (value) next.add(assetId);
                                      else next.delete(assetId);
                                      return next;
                                    })
                                  }
                                />
                              )}
                              {asset.name}
                              {grouped && isHead && (
                                <Button variant="ghost" className="ml-2 h-6 px-1.5 text-[11px]" onClick={() => ungroup(position.id)}>
                                  {ACCUMULO_ACTION_UNGROUP}
                                </Button>
                              )}
                            </th>
                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{formatPercentageIt(weightPct, 1)}</td>
                            <td className="py-1.5 pr-2 text-center text-muted-foreground">{ACCUMULO_STEP2_TOGGLE_IN_PLAN}</td>
                            <td className="py-1.5 text-right">
                              {isHead ? (
                                <Input
                                  type="number"
                                  min={0}
                                  value={position.targetPercentage}
                                  onChange={(event) => setPositionTarget(position.id, Number(event.target.value) || 0)}
                                  className="h-8 w-20 text-right font-mono"
                                />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>,
                        );
                      });
                    }

                    for (const disposal of draft.disposals) {
                      const asset = assetsById.get(disposal.assetId);
                      if (!asset || rendered.has(disposal.assetId)) continue;
                      rendered.add(disposal.assetId);
                      const weightPct = totalCandidateValue > 0 ? (calculateAssetValue(asset) / totalCandidateValue) * 100 : 0;
                      rows.push(
                        <tr key={disposal.assetId} className="border-b border-border last:border-0">
                          <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{asset.name}</th>
                          <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{formatPercentageIt(weightPct, 1)}</td>
                          <td className="py-1.5 pr-2 text-center">
                            <button type="button" className="text-[12px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => moveAssetToPosition(asset)}>
                              {ACCUMULO_STEP2_TOGGLE_SELL}
                            </button>
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">—</td>
                        </tr>,
                      );
                    }

                    return rows;
                  })()}
                </tbody>
              </table>
            )}

            {/* «Nel piano» rows still lack their sell toggle in the table above by design (a
                grouped member never sells alone); the plain toggle click lives here instead. */}
            {candidateAssets.filter((asset) => {
              const position = positionOfAsset(asset.id);
              return position && position.memberAssetIds.length === 1;
            }).length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {candidateAssets
                  .filter((asset) => {
                    const position = positionOfAsset(asset.id);
                    return position && position.memberAssetIds.length === 1;
                  })
                  .map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className="mr-3 underline-offset-2 hover:underline"
                      onClick={() => moveAssetToDisposal(asset)}
                    >
                      {asset.name} → {ACCUMULO_STEP2_TOGGLE_SELL}
                    </button>
                  ))}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-8 text-[12px]" disabled={selectedForGroup.size < 2} onClick={() => setGroupingBuyAssetId(selectedForGroup.values().next().value ?? null)}>
                {ACCUMULO_ACTION_GROUP_PROXY}
              </Button>
              <Button variant="outline" className="h-8 text-[12px]" onClick={() => setNewAssetDialogOpen(true)}>
                {ACCUMULO_ACTION_NEW_ASSET}
              </Button>
            </div>

            {groupingBuyAssetId !== null && (
              <div className="rounded-lg bg-muted p-3">
                <p className="mb-2 text-[12px] text-foreground">{ACCUMULO_STEP2_BUY_ASSET_PROMPT}</p>
                <div className="flex flex-wrap gap-3">
                  {Array.from(selectedForGroup).map((assetId) => {
                    const asset = assetsById.get(assetId);
                    if (!asset) return null;
                    return (
                      <label key={assetId} className="flex items-center gap-1.5 text-[12px] text-foreground">
                        <input
                          type="radio"
                          name="group-buy-asset"
                          checked={groupingBuyAssetId === assetId}
                          onChange={() => setGroupingBuyAssetId(assetId)}
                        />
                        {asset.name}
                      </label>
                    );
                  })}
                </div>
                <Button className="mt-2.5 h-8 text-[12px]" onClick={confirmGroup}>
                  {ACCUMULO_STEP2_BUY_ASSET_CONFIRM}
                </Button>
              </div>
            )}
              </>
            )}

            <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px]">
              <span className="font-medium text-foreground">{ACCUMULO_STEP2_TOTAL_LABEL}</span>
              <span className={`font-mono tabular-nums ${Math.abs(weightsSum - 100) > 0.01 ? 'text-destructive' : 'text-foreground'}`}>
                {formatPercentageIt(weightsSum, 2)}
              </span>
            </div>
            {weightsMessage && <p className="text-[12px] text-destructive">{weightsMessage}</p>}
            <p className="text-[11px] text-muted-foreground">{ACCUMULO_STEP2_FOOTNOTE}</p>
          </div>
        )}

        {step === 3 && preview && (
          <div className="space-y-6">
            {(() => {
              // Coverage warning (D9/§5.5): `preview.totals` always SUMS to L (splitTowardTarget
              // redistributes whatever is available), so a shortfall shows only by comparing L
              // against the IDEAL deficit — Σ max(0, target%×B − currentValue) — computed here the
              // same way `computeTotalPurchases` does internally.
              const states = resolvePositionStates(draft.positions, assetsById, DEPS);
              const priced = states.filter((s) => !s.unpriced);
              const B = states.reduce((sum, s) => sum + s.currentValueEur, 0) + preview.liquidity.L;
              const totalDeficit = priced.reduce((sum, s) => sum + Math.max(0, (s.targetPercentage / 100) * B - s.currentValueEur), 0);
              if (totalDeficit <= 0.5) return null;
              const coveragePct = Math.min(100, (preview.liquidity.L / totalDeficit) * 100);
              if (coveragePct >= 99.5) return null;
              return <p className="text-[12px] text-warning-foreground">{describeInsufficientLiquidityWarning(coveragePct)}</p>;
            })()}

            {preview.unpricedPositionIds.length > 0 && (
              <p className="text-[12px] text-warning-foreground">
                {describeUnpricedWarning(
                  preview.unpricedPositionIds.map((id) => draft.positions.find((p) => p.id === id)?.label ?? id),
                )}
              </p>
            )}

            {draft.optimizerSnapshot && (
              <p className="text-[11px] text-muted-foreground">
                {describeOptimizerSnapshot(draft.optimizerSnapshot, draft.positions)}
              </p>
            )}

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Calendario</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_COL_MONTH}</th>
                      {draft.positions.map((position) => (
                        <th key={position.id} scope="col" className="py-1.5 px-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {position.label}
                        </th>
                      ))}
                      <th scope="col" className="py-1.5 pl-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_COL_TOTAL}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const installments = preview.schedule.installments;
                      const compress = installments.length > MAX_CALENDAR_ROWS;
                      const shown = compress ? [...installments.slice(0, 5), null, installments[installments.length - 1]] : installments;
                      return shown.map((installment) => {
                        if (installment === null) {
                          return (
                            <tr key="ellipsis">
                              <td colSpan={draft.positions.length + 2} className="py-1 text-center text-muted-foreground">
                                {ACCUMULO_ELLIPSIS}
                              </td>
                            </tr>
                          );
                        }
                        const total = installment.lines.reduce((sum, line) => sum + line.plannedAmountEur, 0);
                        return (
                          <tr key={installment.index} className="border-b border-border last:border-0">
                            <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{monthLabelShort(installment.month)}</th>
                            {draft.positions.map((position) => {
                              const line = installment.lines.find((l) => l.positionId === position.id);
                              return (
                                <td key={position.id} className="py-1.5 px-2 text-right font-mono tabular-nums text-muted-foreground">
                                  {line ? formatNumberIt(line.plannedQuantity, 0) : '—'}
                                </td>
                              );
                            })}
                            <td className="py-1.5 pl-2 text-right font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(total)}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_SECTION_WEIGHTS}</p>
              <ul className="space-y-2">
                {preview.outcome.positions.map((position) => {
                  const overTarget = position.finalWeightPct > position.targetPercentage + 0.5;
                  return (
                    <li key={position.positionId}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-foreground">{position.label}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {formatPercentageIt(position.finalWeightPct, 1)} · target {formatPercentageIt(position.targetPercentage, 1)} · {formatSignedPp(position.driftPp)}
                        </span>
                      </div>
                      <div className="relative mt-1 h-[3px] rounded-full bg-muted">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `${Math.min(100, position.finalWeightPct)}%` }} />
                        <div className="absolute inset-y-[-3px] w-px bg-foreground/70" style={{ left: `${Math.min(100, position.targetPercentage)}%` }} />
                      </div>
                      {overTarget && <p className="mt-0.5 text-[11px] text-muted-foreground">{describeAboveTargetWarning([position.label])}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {ACCUMULO_STEP3_SECTION_EXPOSURE} {preview.outcome.leverageRatio > 1.01 && `· leva ${formatNumberIt(preview.outcome.leverageRatio, 2)}×`}
              </p>
              <div className="flex h-3 overflow-hidden rounded-full">
                {Object.entries(preview.outcome.implicitClassPct).map(([assetClass, pct]) => {
                  const idx = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
                  const color = chartColors[idx] ?? CHART_COLORS[idx] ?? CHART_COLORS[0];
                  return <div key={assetClass} style={{ width: `${Math.max(0, pct)}%`, backgroundColor: color }} title={`${ASSET_CLASS_LABELS[assetClass] ?? assetClass} ${formatPercentageIt(pct, 1)}`} />;
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{ACCUMULO_STEP3_SECTION_CLASSES}</p>
              <ClassDriftChart points={preview.trajectory} band={band} height={160} />
              <table className="mt-2 w-full text-[11px]">
                <tbody>
                  {TRAJECTORY_SAMPLE_INDICES.concat(draft.months).filter((i, idx, arr) => i <= draft.months && arr.indexOf(i) === idx).map((index) => {
                    const point = preview.trajectory.find((p) => p.index === index);
                    if (!point) return null;
                    return (
                      <tr key={index} className="border-b border-border last:border-0">
                        <th scope="row" className="py-1 pr-2 text-left font-normal text-muted-foreground">{trajectoryPointLabel(point.month)}</th>
                        {Object.entries(point.byClass).map(([assetClass, data]) => (
                          <td key={assetClass} className={`py-1 pr-2 text-right font-mono tabular-nums ${data.outOfBand ? 'text-warning-foreground' : 'text-muted-foreground'}`}>
                            {formatSignedPp(data.driftPp)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {newAssetDialogOpen && (
        <AssetDialog
          open={newAssetDialogOpen}
          onClose={() => setNewAssetDialogOpen(false)}
          createEmpty
          onCreated={(assetId) => {
            updatePositions([
              ...draft.positions,
              { id: crypto.randomUUID(), label: ACCUMULO_STEP2_PENDING_ASSET_LABEL, targetPercentage: 0, memberAssetIds: [assetId], buyAssetId: assetId },
            ]);
            onAssetsChanged();
            setNewAssetDialogOpen(false);
          }}
        />
      )}
    </>
  );
}
