'use client';

/**
 * ObiettiviDialog — the weight optimizer's objectives, edited where they are used (doc/pac-ottimizzatore
 * § RV6, D-A6). The form is `IdealAllocationTile`'s own (extracted in its `bare` mode: the same controlled
 * leaf Impostazioni used to host), kept in a local DRAFT:
 *   «Prova»   runs `runOptimizer` on the draft — mode Ideale, the whole portfolio as the base — and
 *             shows the report (objectives, conflicts, warnings). Nothing is written.
 *   «Salva gli obiettivi» writes `idealAllocation` and nothing else: `setSettings` without `targets`
 *             is a merge write, so every other setting stays as it is (settingsRoundTrip, PT7).
 * The draft never leaks out: closing the modal drops it.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { Asset, AssetAllocationSettings, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import { setSettings } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { buildObjectivesEditorContext, findIdealAllocationProblem } from '@/lib/utils/idealAllocationEditor';
import { buildStandaloneCandidates, runOptimizer, type OptimizerResult } from '@/lib/utils/weightOptimizer';
import { useInstrumentProfiles } from '@/lib/hooks/useInstrumentProfiles';
import { useOptimizerGeographyReference } from '@/lib/hooks/useOptimizerGeographyReference';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import {
  OBJECTIVES_ACTION_CANCEL,
  OBJECTIVES_ACTION_SAVE,
  OBJECTIVES_ACTION_TRY,
  OBJECTIVES_DIALOG_READING,
  OBJECTIVES_DIALOG_TITLE,
  OBJECTIVES_SAVED_TOAST,
  OBJECTIVES_TRY_EMPTY,
  OPTIMIZER_LOADING_PROFILES,
  OPTIMIZER_PROFILES_FAILURE_CONSEQUENCE,
  OPTIMIZER_PROFILES_FAILURE_SUBJECT,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
} from '@/lib/utils/weightOptimizerNarrative';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ui/error-notice';
import { IdealAllocationTile } from '@/components/settings/IdealAllocationTile';
import { OptimizerObjectivesReport } from '@/components/allocation/OptimizerReport';

interface ObiettiviDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget;
  targetLeverageRatio: number;
  /** The saved objectives (`DEFAULT_IDEAL_ALLOCATION` when the account has none). */
  saved: IdealAllocationSettings;
  /** The saved model portfolio: its instruments at 0 shares take part in «Prova» too (PO10). */
  model?: ModelPortfolio | null;
  /** After a successful save: the page re-reads the settings. */
  onSaved: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}

export function ObiettiviDialog({ open, onClose, ownerId, allAssets, targets, targetLeverageRatio, saved, model, onSaved, returnFocusTo }: ObiettiviDialogProps) {
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<IdealAllocationSettings>(saved);
  const [tryRequested, setTryRequested] = useState(false);
  const [saving, setSaving] = useState(false);

  const editorContext = useMemo(() => buildObjectivesEditorContext(targets, allAssets, calculateAssetValue), [targets, allAssets]);
  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);

  // The «Prova» base is the whole allocable portfolio: no amount to invest, the objectives alone.
  const baseEur = useMemo(
    () =>
      allAssets.reduce((sum, asset) => {
        const role = resolveAllocationRole(asset);
        if (role !== 'tradable' && role !== 'frozen') return sum;
        const value = calculateAssetValue(asset);
        return value > 0 ? sum + value : sum;
      }, 0),
    [allAssets],
  );
  const evaluateAssetIds = useMemo(() => new Set((model?.weights ?? []).map((weight) => weight.assetId)), [model]);
  const standalone = useMemo(
    () => buildStandaloneCandidates(allAssets, baseEur, calculateAssetValue, evaluateAssetIds),
    [allAssets, baseEur, evaluateAssetIds],
  );
  const candidateAssetIds = useMemo(() => standalone.positions.map((position) => position.buyAssetId), [standalone.positions]);
  const profilesQuery = useInstrumentProfiles(tryRequested ? ownerId : undefined, candidateAssetIds);
  const { referenceCountries, referenceAreas, referenceEstimatedShare } = useOptimizerGeographyReference(draft);

  // `tryRequested` stays true after the first «Prova»: the report follows the draft from then on, as
  // the weights table of Composizione ideale follows its inputs.
  const result: OptimizerResult | null = useMemo(() => {
    if (!tryRequested || !profilesQuery.data) return null;
    return runOptimizer({
      positions: standalone.positions,
      assetsById,
      profilesByTicker: new Map(Object.entries(profilesQuery.data.profiles)),
      referenceCountries,
      settings: draft,
      mode: 'ideal',
      baseEur,
      valueOf: calculateAssetValue,
      targets,
      referenceAreas,
      referenceEstimatedShare,
      targetLeverageRatio,
      fixBounds: standalone.fixBounds,
    });
  }, [tryRequested, profilesQuery.data, standalone, assetsById, referenceCountries, draft, baseEur, targets, referenceAreas, referenceEstimatedShare, targetLeverageRatio]);

  const labelOf = (key: string): string => standalone.positions.find((position) => position.key === key)?.label ?? key;

  const handleSave = async () => {
    const problem = findIdealAllocationProblem(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      // No `targets` in the payload: the merge write touches `idealAllocation` and nothing else.
      await setSettings(ownerId, { idealAllocation: draft } as AssetAllocationSettings);
      toast.success(OBJECTIVES_SAVED_TOAST);
      await queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
      onSaved();
      onClose();
    } catch (error) {
      toast.error(describeWriteError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      width="xl"
      eyebrow="Accumulo"
      title={OBJECTIVES_DIALOG_TITLE}
      reading={OBJECTIVES_DIALOG_READING}
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button variant="outline" className="h-11 text-[12px] desktop:h-8" onClick={onClose} disabled={saving}>
            {OBJECTIVES_ACTION_CANCEL}
          </Button>
          <Button variant="outline" className="h-11 text-[12px] desktop:h-8" onClick={() => setTryRequested(true)} disabled={!draft.enabled || standalone.positions.length === 0}>
            {OBJECTIVES_ACTION_TRY}
          </Button>
          <Button className="h-11 text-[12px] desktop:h-8" onClick={() => void handleSave()} disabled={isDemo || saving}>
            {OBJECTIVES_ACTION_SAVE}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <IdealAllocationTile
          bare
          value={draft}
          onChange={setDraft}
          targetLeverageRatio={targetLeverageRatio}
          factorClassOptions={editorContext.factorClassOptions}
          secondLevelReadyClasses={editorContext.secondLevelReadyClasses}
          secondLevelGaps={editorContext.secondLevelGaps}
          tradableAssets={editorContext.tradableAssets}
          disabled={isDemo}
        />

        {draft.enabled && standalone.positions.length === 0 && <p className="text-[12px] text-muted-foreground">{OBJECTIVES_TRY_EMPTY}</p>}
        {tryRequested && profilesQuery.isLoading && <p className="text-[12px] text-muted-foreground">{OPTIMIZER_LOADING_PROFILES}</p>}
        {tryRequested && profilesQuery.isError && (
          <ErrorNotice
            compact
            onRetry={() => void profilesQuery.refetch()}
            notice={describeReadFailure({ subject: OPTIMIZER_PROFILES_FAILURE_SUBJECT, consequence: OPTIMIZER_PROFILES_FAILURE_CONSEQUENCE, canRetry: true })}
          />
        )}
        {tryRequested && result && (
          <>
            {result.status === 'no_candidates' && <p className="text-[12px] text-muted-foreground">{OPTIMIZER_STATUS_NO_CANDIDATES}</p>}
            {result.status === 'infeasible_bounds' && <p className="text-[12px] text-destructive">{OPTIMIZER_STATUS_INFEASIBLE_BOUNDS}</p>}
            {result.status === 'ok' && <OptimizerObjectivesReport result={result} labelOf={labelOf} />}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
