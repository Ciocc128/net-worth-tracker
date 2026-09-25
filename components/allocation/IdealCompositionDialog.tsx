'use client';

/**
 * IdealCompositionDialog — Allocazione's standalone weight-optimizer tool (doc/weight-optimizer-ate.md
 * §4, `ComposizioneIdealeTile`'s modal). Unlike the PAC's `OptimizerPanel` (whose candidates are the
 * bozza's own positions, §9), every candidate here is a single tradable instrument straight from the
 * portfolio — `buildStandaloneCandidates` (§4.2/§4.4) — so the tool works even with no plan open.
 * Reuses the SAME engine (`runOptimizer`) and the SAME objectives/conflicts/warnings presentation
 * (`OptimizerObjectivesReport`, §4.3) as the PAC view; only the weights table (its own € column) and
 * the final action ("Crea un PAC con questi pesi" instead of "Usa questi pesi") are its own, because
 * those are genuinely different acts. Never writes to Firestore — "Crea un PAC" hands the seeded
 * positions to the CALLER, which opens `AccumulationPlanDialog` itself (never two modals stacked).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Asset, AssetAllocationTarget, AssetClass, IdealAllocationSettings } from '@/types/assets';
import type { PlanPosition, OptimizerSnapshot } from '@/types/accumulationPlan';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import {
  buildStandaloneCandidates,
  findSecondLevelGaps,
  hasSpecificAssetTargets,
  runOptimizer,
  type OptimizerMode,
  type OptimizerResult,
} from '@/lib/utils/weightOptimizer';
import { weightsToSeedPositions } from '@/lib/utils/accumulationPlanUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useInstrumentProfiles } from '@/lib/hooks/useInstrumentProfiles';
import { useOptimizerGeographyReference } from '@/lib/hooks/useOptimizerGeographyReference';
import { useAccumulationPlans, selectOpenPlan } from '@/lib/hooks/useAccumulationPlan';
import { buildIdealAllocationInput, describeIdealComposition } from '@/lib/utils/settingsNarrative';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import {
  describeOptimizerMode,
  describeSecondLevelGaps,
  formatOptimizerWeightDiffEur,
  IDEAL_COMPOSITION_ACTION_CREATE_PAC,
  IDEAL_COMPOSITION_AMOUNT_LABEL,
  IDEAL_COMPOSITION_COL_CURRENT,
  IDEAL_COMPOSITION_COL_DIFF,
  IDEAL_COMPOSITION_COL_IDEAL,
  IDEAL_COMPOSITION_COL_INSTRUMENT,
  IDEAL_COMPOSITION_PLAN_ALREADY_OPEN,
  IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON,
  IDEAL_COMPOSITION_TITLE,
  OPTIMIZER_ACTION_CALCULATE,
  OPTIMIZER_ACTION_MODIFY_IN_SETTINGS,
  OPTIMIZER_LOADING_PROFILES,
  OPTIMIZER_MODE_ARIA_LABEL,
  OPTIMIZER_MODE_LABELS,
  OPTIMIZER_OBJECTIVES_TITLE,
  OPTIMIZER_PROFILES_FAILURE_CONSEQUENCE,
  OPTIMIZER_PROFILES_FAILURE_SUBJECT,
  OPTIMIZER_SPECIFIC_ASSETS_NOTE,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
} from '@/lib/utils/weightOptimizerNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { NarrativeText } from '@/components/ui/narrative-text';
import { ErrorNotice } from '@/components/ui/error-notice';
import { OptimizerObjectivesReport } from '@/components/allocation/OptimizerReport';

const MODE_OPTIONS = [
  { value: 'ideal' as const, label: OPTIMIZER_MODE_LABELS.ideal },
  { value: 'reachable' as const, label: OPTIMIZER_MODE_LABELS.reachable },
];

interface IdealCompositionDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings;
  /** "Crea un PAC con questi pesi": hands the caller a fresh draft's seed — the caller opens
   *  `AccumulationPlanDialog` itself (never nested under this one). */
  onCreatePac: (seed: { positions: PlanPosition[]; optimizerSnapshot: OptimizerSnapshot }) => void;
}

export function IdealCompositionDialog({
  open,
  onClose,
  ownerId,
  allAssets,
  targets,
  targetLeverageRatio,
  idealAllocation,
  onCreatePac,
}: IdealCompositionDialogProps) {
  const [amountInput, setAmountInput] = useState('');
  const [mode, setMode] = useState<OptimizerMode>('ideal');
  const [calcRequested, setCalcRequested] = useState(false);

  const assetsById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets]);

  const allocablePortfolioEur = useMemo(
    () =>
      allAssets.reduce((sum, a) => {
        const role = resolveAllocationRole(a);
        if (role !== 'tradable' && role !== 'frozen') return sum;
        const value = calculateAssetValue(a);
        return value > 0 ? sum + value : sum;
      }, 0),
    [allAssets]
  );
  const amountEur = Number(amountInput.replace(',', '.')) || 0;
  const canReachable = amountEur > 0;
  const effectiveMode = canReachable ? mode : 'ideal';
  const baseEur = allocablePortfolioEur + (canReachable ? amountEur : 0);

  const { referenceCountries, referenceAreas, referenceEstimatedShare } = useOptimizerGeographyReference(idealAllocation);

  const standalone = useMemo(
    () => buildStandaloneCandidates(allAssets, baseEur, calculateAssetValue),
    [allAssets, baseEur]
  );
  const candidateAssetIds = useMemo(() => standalone.positions.map((p) => p.buyAssetId), [standalone.positions]);
  const profilesQuery = useInstrumentProfiles(calcRequested ? ownerId : undefined, candidateAssetIds);

  const result: OptimizerResult | null = useMemo(() => {
    if (!profilesQuery.data) return null;
    const profilesByTicker = new Map(Object.entries(profilesQuery.data.profiles));
    return runOptimizer({
      positions: standalone.positions,
      assetsById,
      profilesByTicker,
      referenceCountries,
      settings: idealAllocation,
      mode: effectiveMode,
      baseEur,
      valueOf: calculateAssetValue,
      targets,
      referenceAreas,
      referenceEstimatedShare,
      targetLeverageRatio,
      fixBounds: standalone.fixBounds,
    });
  }, [
    profilesQuery.data,
    standalone,
    assetsById,
    referenceCountries,
    idealAllocation,
    effectiveMode,
    baseEur,
    targets,
    referenceAreas,
    referenceEstimatedShare,
    targetLeverageRatio,
  ]);

  const plansQuery = useAccumulationPlans(ownerId);
  const openPlan = selectOpenPlan(plansQuery.data);

  const readingInput = buildIdealAllocationInput(idealAllocation, targetLeverageRatio);

  const labelOf = (key: string): string => standalone.positions.find((p) => p.key === key)?.label ?? key;

  const secondLevelGapLines = describeSecondLevelGaps(
    findSecondLevelGaps(allAssets, targets, idealAllocation.factorObjectives.map((f) => f.assetClass), calculateAssetValue)
  );
  const showSpecificAssetsNote = hasSpecificAssetTargets(targets, Object.keys(targets) as AssetClass[]);

  const handleCreatePac = () => {
    if (!result || result.status !== 'ok' || openPlan) return;
    const positions = weightsToSeedPositions(result.weights);
    const snapshot: OptimizerSnapshot = {
      computedAt: new Date(),
      mode: effectiveMode,
      settingsUsed: idealAllocation,
      weights: result.weights.map((w) => ({ key: w.key, proposedPct: w.proposedPct })),
      objectives: result.objectives,
    };
    onCreatePac({ positions, optimizerSnapshot: snapshot });
  };

  return (
    <ResponsiveModal open={open} onClose={onClose} width="xl" title={IDEAL_COMPOSITION_TITLE}>
      <div className="space-y-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {OPTIMIZER_OBJECTIVES_TITLE}
          </p>
          <NarrativeText segments={describeIdealComposition(readingInput)} className="text-[13px] text-foreground" />
          <Link href="/dashboard/settings?tab=allocazione" className="mt-1.5 inline-block text-[11px] underline underline-offset-2">
            {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
          </Link>
        </div>

        <div>
          <label className="text-[13px] font-medium" htmlFor="ideal-composition-amount">
            {IDEAL_COMPOSITION_AMOUNT_LABEL}
          </label>
          <Input
            id="ideal-composition-amount"
            type="number"
            inputMode="decimal"
            className="mt-1.5 w-40"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
        </div>

        <div>
          <SegmentedPill
            options={MODE_OPTIONS}
            value={effectiveMode}
            onChange={(next) => {
              if (next === 'reachable' && !canReachable) return;
              setMode(next);
            }}
            layoutId="ideal-composition-mode"
            ariaLabel={OPTIMIZER_MODE_ARIA_LABEL}
            semantics="radio"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {canReachable ? describeOptimizerMode(effectiveMode) : IDEAL_COMPOSITION_REACHABLE_DISABLED_REASON}
          </p>
        </div>

        {showSpecificAssetsNote && <p className="text-[11px] text-muted-foreground">{OPTIMIZER_SPECIFIC_ASSETS_NOTE}</p>}

        {secondLevelGapLines.length > 0 && (
          <div className="flex flex-col gap-1">
            {secondLevelGapLines.map((line) => (
              <p key={line} className="text-[11px] text-warning-foreground">
                {line}
              </p>
            ))}
          </div>
        )}

        {!calcRequested && (
          <Button className="h-8 text-[12px]" onClick={() => setCalcRequested(true)} disabled={standalone.positions.length === 0}>
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
            {result.status === 'infeasible_bounds' && (
              <p className="text-[12px] text-destructive">{OPTIMIZER_STATUS_INFEASIBLE_BOUNDS}</p>
            )}

            {result.status === 'ok' && (
              <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {IDEAL_COMPOSITION_COL_INSTRUMENT}
                      </th>
                      <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {IDEAL_COMPOSITION_COL_CURRENT}
                      </th>
                      <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {IDEAL_COMPOSITION_COL_IDEAL}
                      </th>
                      <th scope="col" className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {IDEAL_COMPOSITION_COL_DIFF}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.weights.map((w) => (
                      <tr key={w.key} className="border-b border-border last:border-0">
                        <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{w.label}</th>
                        <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{formatPercentageIt(w.currentPct, 1)}</td>
                        <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">{formatPercentageIt(w.proposedPct, 1)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                          {formatOptimizerWeightDiffEur(w.currentPct, w.proposedPct, baseEur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <OptimizerObjectivesReport result={result} labelOf={labelOf} />

                <div>
                  <Button className="h-8 text-[12px]" onClick={handleCreatePac} disabled={!!openPlan}>
                    {IDEAL_COMPOSITION_ACTION_CREATE_PAC}
                  </Button>
                  {openPlan && <p className="mt-1.5 text-[11px] text-muted-foreground">{IDEAL_COMPOSITION_PLAN_ALREADY_OPEN}</p>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
