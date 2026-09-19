'use client';

/**
 * OptimizerPanel — the PAC editor's "Ottimizzato" view of step 2 (doc/weight-optimizer-ate.md §9.2).
 * Replaces the manual weight table when the reader picks "Ottimizzato": summarises the active
 * objectives from Impostazioni → Allocazione, lets them pick Raggiungibile/Ideale, resolves
 * instrument profiles for every position's members on "Calcola", runs the pure `optimizeWeights`
 * engine and renders its report. "Usa questi pesi" hands the caller the proposed weights AND the
 * `OptimizerSnapshot` to persist with the draft (§9.4) — this component never writes to Firestore
 * itself.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { AccumulationPlanDraft, OptimizerSnapshot } from '@/types/accumulationPlan';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { INDEX_PROFILES } from '@/lib/constants/instrumentProfiles';
import {
  areasFromCountries,
  buildOptimizerCandidates,
  optimizeWeights,
  type OptimizerMode,
  type OptimizerResult,
} from '@/lib/utils/weightOptimizer';
import { calculateAssetValue } from '@/lib/services/assetService';
import { resolvePositionStates, unitPriceEur, type PlanDeps } from '@/lib/utils/accumulationPlanUtils';
import { useInstrumentProfiles } from '@/lib/hooks/useInstrumentProfiles';
import { describeIdealAllocation } from '@/lib/utils/settingsNarrative';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { ACCUMULO_ACTION_CANCEL } from '@/lib/utils/accumulationNarrative';
import {
  describeConflict,
  describeObjectiveRow,
  describeOptimizerMode,
  describeOptimizerWarning,
  OPTIMIZER_ACTION_APPLY,
  OPTIMIZER_ACTION_CALCULATE,
  OPTIMIZER_ACTION_MODIFY_IN_SETTINGS,
  OPTIMIZER_COL_CURRENT,
  OPTIMIZER_COL_INSTRUMENT,
  OPTIMIZER_COL_PROPOSED,
  OPTIMIZER_CONFLICTS_TITLE,
  OPTIMIZER_DISABLED_READING,
  OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM,
  OPTIMIZER_LOADING_PROFILES,
  OPTIMIZER_MODE_ARIA_LABEL,
  OPTIMIZER_MODE_LABELS,
  OPTIMIZER_OBJECTIVES_TITLE,
  OPTIMIZER_PROFILES_FAILURE_CONSEQUENCE,
  OPTIMIZER_PROFILES_FAILURE_SUBJECT,
  OPTIMIZER_REPORT_TITLE,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
  OPTIMIZER_WARNINGS_TITLE,
} from '@/lib/utils/weightOptimizerNarrative';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Button } from '@/components/ui/button';
import { NarrativeText } from '@/components/ui/narrative-text';
import { ErrorNotice } from '@/components/ui/error-notice';

const DEPS: PlanDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };
const MODE_OPTIONS = [
  { value: 'reachable' as const, label: OPTIMIZER_MODE_LABELS.reachable },
  { value: 'ideal' as const, label: OPTIMIZER_MODE_LABELS.ideal },
];
const BELOW_HELD_EPSILON = 1e-6;

interface OptimizerPanelProps {
  ownerId: string;
  draft: AccumulationPlanDraft;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  liquidityL: number;
  onApply: (weightsByPositionKey: Record<string, number>, snapshot: OptimizerSnapshot) => void;
}

export function OptimizerPanel({
  ownerId,
  draft,
  allAssets,
  targets,
  targetLeverageRatio,
  idealAllocation,
  liquidityL,
  onApply,
}: OptimizerPanelProps) {
  const [mode, setMode] = useState<OptimizerMode>('reachable');
  const [calcRequested, setCalcRequested] = useState(false);
  const [pendingIdealConfirm, setPendingIdealConfirm] = useState(false);

  const assetsById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets]);
  const memberAssetIds = useMemo(
    () => Array.from(new Set(draft.positions.flatMap((p) => p.memberAssetIds))),
    [draft.positions]
  );
  const profilesQuery = useInstrumentProfiles(calcRequested ? ownerId : undefined, memberAssetIds);

  const baseEur = useMemo(() => {
    const states = resolvePositionStates(draft.positions, assetsById, DEPS);
    return states.reduce((sum, s) => sum + s.currentValueEur, 0) + liquidityL;
  }, [draft.positions, assetsById, liquidityL]);

  const geographyProfile =
    idealAllocation?.geography ? INDEX_PROFILES[idealAllocation.geography.referenceIndexId] : undefined;
  const referenceCountries = geographyProfile?.countries?.map((c) => ({ key: c.code, weight: c.weight })) ?? null;

  const referenceAreas = useMemo(() => {
    if (!idealAllocation?.geography?.enabled || !referenceCountries) return { areas: null, estimatedShare: 0 };
    const { areas, estimatedShare } = areasFromCountries(referenceCountries, geographyProfile?.otherAreaSplit, null);
    return { areas, estimatedShare };
  }, [idealAllocation?.geography?.enabled, referenceCountries, geographyProfile?.otherAreaSplit]);

  const result: OptimizerResult | null = useMemo(() => {
    if (!idealAllocation?.enabled || !profilesQuery.data) return null;
    const profilesByTicker = new Map(Object.entries(profilesQuery.data.profiles));
    const { candidates } = buildOptimizerCandidates({
      positions: draft.positions.map((p) => ({
        key: p.id,
        label: p.label,
        memberAssetIds: p.memberAssetIds,
        buyAssetId: p.buyAssetId,
      })),
      assetsById,
      profilesByTicker,
      referenceCountries,
      settings: idealAllocation,
      mode,
      baseEur,
      valueOf: calculateAssetValue,
    });
    return optimizeWeights({
      candidates,
      baseEur,
      targets,
      settings: idealAllocation,
      referenceAreas: referenceAreas.areas,
      referenceEstimatedShare: referenceAreas.estimatedShare,
      mode,
      targetLeverageRatio,
    });
  }, [
    idealAllocation,
    profilesQuery.data,
    draft.positions,
    assetsById,
    referenceCountries,
    mode,
    baseEur,
    targets,
    referenceAreas,
    targetLeverageRatio,
  ]);

  if (!idealAllocation?.enabled) {
    return (
      <div className="rounded-lg bg-muted p-4 text-[13px] text-muted-foreground">
        {OPTIMIZER_DISABLED_READING}{' '}
        <Link href="/dashboard/settings?tab=allocazione" className="underline underline-offset-2">
          {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
        </Link>
      </div>
    );
  }

  const readingInput = {
    enabled: idealAllocation.enabled,
    classPriority: idealAllocation.classPriority,
    leveragePriority: idealAllocation.leveragePriority,
    targetLeverageRatio,
    factorObjectives: idealAllocation.factorObjectives.map((f) => ({
      classLabel: ASSET_CLASS_LABELS[f.assetClass] ?? f.assetClass,
      priority: f.priority,
    })),
    geography: idealAllocation.geography?.enabled
      ? {
          referenceIndexLabel: geographyProfile?.label ?? idealAllocation.geography.referenceIndexId,
          priority: idealAllocation.geography.priority,
        }
      : null,
  };

  const labelOf = (key: string): string => draft.positions.find((p) => p.id === key)?.label ?? key;

  const belowHeld = (r: OptimizerResult): boolean =>
    mode === 'ideal' && r.weights.some((w) => w.proposedPct < w.currentPct - BELOW_HELD_EPSILON);

  const applyResult = (r: OptimizerResult) => {
    const weightsByPositionKey = Object.fromEntries(r.weights.map((w) => [w.key, w.proposedPct]));
    const snapshot: OptimizerSnapshot = {
      computedAt: new Date(),
      mode,
      settingsUsed: idealAllocation,
      weights: r.weights.map((w) => ({ key: w.key, proposedPct: w.proposedPct })),
      objectives: r.objectives,
    };
    onApply(weightsByPositionKey, snapshot);
    setPendingIdealConfirm(false);
  };

  const handleApplyClick = () => {
    if (!result || result.status !== 'ok') return;
    if (belowHeld(result)) setPendingIdealConfirm(true);
    else applyResult(result);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3">
        <p className={'mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'}>
          {OPTIMIZER_OBJECTIVES_TITLE}
        </p>
        <NarrativeText segments={describeIdealAllocation(readingInput)} className="text-[13px] text-foreground" />
        <Link href="/dashboard/settings?tab=allocazione" className="mt-1.5 inline-block text-[11px] underline underline-offset-2">
          {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
        </Link>
      </div>

      <div>
        <SegmentedPill
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          layoutId="optimizer-mode"
          ariaLabel={OPTIMIZER_MODE_ARIA_LABEL}
          semantics="radio"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">{describeOptimizerMode(mode)}</p>
      </div>

      {!calcRequested && (
        <Button className="h-8 text-[12px]" onClick={() => setCalcRequested(true)} disabled={memberAssetIds.length === 0}>
          {OPTIMIZER_ACTION_CALCULATE}
        </Button>
      )}

      {calcRequested && profilesQuery.isLoading && <p className="text-[12px] text-muted-foreground">{OPTIMIZER_LOADING_PROFILES}</p>}

      {calcRequested && profilesQuery.isError && (
        <ErrorNotice
          compact
          onRetry={() => void profilesQuery.refetch()}
          notice={describeReadFailure({
            subject: OPTIMIZER_PROFILES_FAILURE_SUBJECT,
            consequence: OPTIMIZER_PROFILES_FAILURE_CONSEQUENCE,
            canRetry: true,
          })}
        />
      )}

      {calcRequested && result && (
        <>
          {result.status === 'no_candidates' && <p className="text-[12px] text-muted-foreground">{OPTIMIZER_STATUS_NO_CANDIDATES}</p>}
          {result.status === 'infeasible_bounds' && <p className="text-[12px] text-destructive">{OPTIMIZER_STATUS_INFEASIBLE_BOUNDS}</p>}

          {result.status === 'ok' && (
            <>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {OPTIMIZER_COL_INSTRUMENT}
                    </th>
                    <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {OPTIMIZER_COL_CURRENT}
                    </th>
                    <th scope="col" className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {OPTIMIZER_COL_PROPOSED}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.weights.map((w) => (
                    <tr key={w.key} className="border-b border-border last:border-0">
                      <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{w.label}</th>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{formatPercentageIt(w.currentPct, 1)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{formatPercentageIt(w.proposedPct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {result.objectives.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_REPORT_TITLE}</p>
                  <ul className="space-y-1 font-mono text-[12px] tabular-nums text-muted-foreground">
                    {result.objectives.map((objective) => (
                      <li key={objective.id}>{describeObjectiveRow(objective)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.conflicts.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_CONFLICTS_TITLE}</p>
                  <ul className="space-y-1 text-[12px] text-muted-foreground">
                    {result.conflicts.map((conflict) => (
                      <li key={conflict.removedObjectiveId}>{describeConflict(conflict, result.objectives)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_WARNINGS_TITLE}</p>
                  <ul className="space-y-1 text-[12px] text-warning-foreground">
                    {result.warnings.map((warning, i) => (
                      <li key={i}>{describeOptimizerWarning(warning, labelOf)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {pendingIdealConfirm ? (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-[12px] text-foreground">{OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM}</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" className="h-8 text-[12px]" onClick={() => setPendingIdealConfirm(false)}>
                      {ACCUMULO_ACTION_CANCEL}
                    </Button>
                    <Button className="h-8 text-[12px]" onClick={() => applyResult(result)}>
                      {OPTIMIZER_ACTION_APPLY}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="h-8 text-[12px]" onClick={handleApplyClick}>
                  {OPTIMIZER_ACTION_APPLY}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
