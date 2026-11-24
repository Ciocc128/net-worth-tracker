'use client';

/**
 * StrategiaTab — Allocazione's third tab (RU8, doc/allocazione-strategia/README.md § 5.3, D-ST3):
 * where the weights are SET, numbered as the strip above it.
 *
 *   1  Target per classe (12)                              id="target"
 *   2  Portafoglio modello (7) | Criteri del modello (5)   id="portafoglio-modello"
 *
 * No verdict: a surface of settings (The Declaration-Tile Rule); the strip is its summary. Below
 * `desktop:` one column with no composition (every tile is a form), two columns from `tablet:` for
 * block 2 only.
 *
 * Block 1 replaces the three tiles Impostazioni › Allocazione had (total, formula, list): the source
 * pill in the aside (A mano · Formula per età · Dai traguardi, D-ST4), ONE reading, the total, the
 * formula's two inputs as links to where they are typed, the class rows (moved from Impostazioni
 * unchanged, the specific assets offered only where already in use, D-ST6). Under «Dai traguardi»
 * the rows are read-only and show what the goals give; the manual targets stay in the draft and
 * come back with «A mano».
 *
 * The draft is the PAGE's (`useTargetsDraft`, D-ST5): a visit to Bilanciamento loses nothing. This
 * view consumes the focus «Salva i target» asks for, and draws the save bar at the bottom of `<main>`.
 * Block 2 is the model portfolio and its criteria, moved from Accumulo as they were, with their
 * dialogs and `?obiettivi=1`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { Asset, AssetAllocationTarget, AssetClass, IdealAllocationSettings } from '@/types/assets';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/utils/weightOptimizer';
import { isTargetTotalValid } from '@/lib/utils/allocationTargetValidation';
import { formatNumber } from '@/lib/services/chartService';
import type { RiskFreeResolution } from '@/lib/utils/riskFreeRate';
import { narrativeToText } from '@/lib/utils/narrative';
import { describeRiskFreeOrigin, describeStrategiaTargets, describeTargetProblem } from '@/lib/utils/settingsNarrative';
import {
  findSliceTargetProblem,
  resolveFormulaSplit,
  resolveTargetSource,
  sumClassTargets,
  effectiveRiskFreeRate,
  TARGET_CLASS_ORDER,
  type TargetSource,
} from '@/lib/utils/targetsDraft';
import { STRATEGIA_ANCHORS } from '@/lib/utils/allocationChain';
import { isPlanDone } from '@/lib/utils/accumuloSummary';
import type { TargetsDraftController } from '@/lib/hooks/useTargetsDraft';
import { useOpenAccumuloPlan } from '@/lib/hooks/useOpenAccumuloPlan';
import { useModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SegmentedPill, type SegmentedPillOption } from '@/components/ui/segmented-pill';
import { Tile, TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { NarrativeText } from '@/components/ui/narrative-text';
import { SAVED_BUTTON_CLASS, SaveButtonContent } from '@/components/ui/save-button-content';
import { pctLabel } from '@/components/settings/tabs/shared';
import { AllocationClassEditor } from '@/components/allocation/strategia/AllocationClassEditor';
import { PortafoglioModelloTile } from '@/components/allocation/tiles/PortafoglioModelloTile';
import { ObiettiviTile } from '@/components/allocation/tiles/ObiettiviTile';
import { ObiettiviDialog } from '@/components/allocation/ObiettiviDialog';

const SOURCE_LABELS: Record<TargetSource, string> = {
  manual: 'A mano',
  formula: 'Formula per età',
  goals: 'Dai traguardi',
};

/** The age's one editor (D-T5) and the risk-free rate's (RU8, Impostazioni › Preferenze). */
const AGE_HREF = '/dashboard/fire-simulations?piano=eta';
const RISK_FREE_HREF = '/dashboard/settings?tab=generale';

export interface StrategiaGoalPreview {
  /** What the goals give the classes on the draft's tree (`resolveEffectiveTargets` with the flag on). */
  targets: AssetAllocationTarget;
  /** The goals that weigh. */
  goalCount: number;
}

export interface StrategiaTabProps {
  ownerId: string;
  allAssets: Asset[];
  /** The targets in force as SAVED: the model and the criteria read them, never the draft. */
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  /** The page re-reads assets and settings. */
  onAssetsChanged: () => void;
  /** The class targets' draft, held by the page (D-ST5). */
  controller: TargetsDraftController;
  /** Impostazioni › Funzioni «Traguardi di investimento»: without it the pill has two options. */
  goalsEnabled: boolean;
  /** `null` while no goal weighs on the classes. */
  goalPreview: StrategiaGoalPreview | null;
  /** The ECB estimate of the risk-free rate, for the formula row's words. */
  riskFreeEstimate: RiskFreeResolution;
}

export function StrategiaTab({
  ownerId,
  allAssets,
  targets,
  band,
  targetLeverageRatio,
  idealAllocation,
  onAssetsChanged,
  controller,
  goalsEnabled,
  goalPreview,
  riskFreeEstimate,
}: StrategiaTabProps) {
  const isDemo = useDemoMode();
  const { draft, dispatch, dirty, saving, justSaved, save, revert, restoreDefaults } = controller;
  const { slice, pendingFocus } = draft;
  const { classes, cashUseFixedAmount, cashFixedAmount, userAge, riskFreeRate, autoCalculate } = slice;

  // ─── Block 2's reads: the model and the open plan, the keys Accumulo shares ───────────────
  const { plan, currentIndex } = useOpenAccumuloPlan(ownerId);
  const modelQuery = useModelPortfolio(ownerId);
  const model = modelQuery.data ?? null;
  const liveCriteriaPlan = plan && plan.status === 'active' && !isPlanDone(plan, currentIndex) ? plan : null;
  const [objectivesOpen, setObjectivesOpen] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);

  // `?obiettivi=1` (the link Impostazioni, the optimizer's panels and the model carry) opens the
  // criteria's dialog once, and is dropped from the URL.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wantsObjectives = searchParams.get('obiettivi') === '1';
  useEffect(() => {
    if (!wantsObjectives) return;
    // Deferred: the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      setObjectivesOpen(true);
      router.replace(`${pathname}?tab=strategia#${STRATEGIA_ANCHORS.model}`, { scroll: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [wantsObjectives, pathname, router]);

  // A link from the strip, Accumulo or a bookmark lands on its block: the router scrolls when the block
  // is already there, this does it when the tab mounts (the chunk arrives after the navigation).
  useEffect(() => {
    const anchor = window.location.hash.slice(1);
    if (anchor !== STRATEGIA_ANCHORS.target && anchor !== STRATEGIA_ANCHORS.model) return;
    const frame = window.requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // The focus «Salva i target» asked for, consumed after the commit that opened the class's group
  // (an animation frame later, so the scroll lands on the field's final position).
  useEffect(() => {
    if (!pendingFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const field = document.getElementById(pendingFocus);
      if (field) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        field.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        field.focus({ preventScroll: true });
      }
      dispatch({ type: 'focusConsumed' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingFocus, dispatch]);

  // ─── Block 1's numbers (the draft module) and words (settingsNarrative) ───────────────────
  const source = resolveTargetSource(slice, goalsEnabled);
  const fromGoals = source === 'goals';
  const goalTargets = fromGoals ? (goalPreview?.targets ?? null) : null;
  const total = goalTargets ? sumTargetPercentages(goalTargets) : sumClassTargets(slice);
  const isValidTotal = isTargetTotalValid(total);
  const leverage = total > 0 ? total / 100 : 1;
  const hasLeverage = leverage > 1.005;
  const formulaSplit = resolveFormulaSplit(slice);
  // The rule «Salva i target» would refuse: the manual tree is written under «Dai traguardi» too.
  const problem = findSliceTargetProblem(slice);
  const classesWithTarget = TARGET_CLASS_ORDER.filter((assetClass) => (classes[assetClass]?.targetPercentage ?? 0) > 0).length;
  const reading = describeStrategiaTargets({
    source,
    classesWithTarget,
    classCount: TARGET_CLASS_ORDER.length,
    total,
    cashFixedAmount: cashUseFixedAmount ? cashFixedAmount : null,
    formula: { userAge, riskFreeRate: effectiveRiskFreeRate(slice), equityPct: formulaSplit?.equityPercentage },
    goalCount: goalPreview?.goalCount ?? 0,
    problem: fromGoals ? null : problem,
  });

  const sourceOptions = useMemo<SegmentedPillOption<TargetSource>[]>(
    () => [
      { value: 'manual', label: SOURCE_LABELS.manual },
      {
        value: 'formula',
        label: SOURCE_LABELS.formula,
        // Without the age the formula has nothing to compute: offered, never chosen (unless it is the saved source).
        unavailable: userAge === undefined && !autoCalculate ? { reason: "Formula per età: manca l'età, che si scrive in FIRE › Il mio piano" } : undefined,
      },
      ...(goalsEnabled ? [{ value: 'goals' as const, label: SOURCE_LABELS.goals }] : []),
    ],
    [userAge, autoCalculate, goalsEnabled],
  );

  const handleRestoreDefaults = () => {
    restoreDefaults();
    toast.info('Target predefiniti nella bozza: «Salva i target» li scrive.');
  };

  const handleSave = async () => {
    const ok = await save();
    if (!ok && problem) toast.error(narrativeToText(describeTargetProblem(problem)));
  };

  const showBar = !isDemo && (dirty || justSaved);
  const objectivesSaved = idealAllocation ?? DEFAULT_IDEAL_ALLOCATION;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* 1 · Target per classe */}
      <div id={STRATEGIA_ANCHORS.target} className={cn(TILE_CELL_CLASS, 'scroll-mt-4')}>
        <Tile
          eyebrow="Target per classe"
          aside={
            <SegmentedPill
              options={sourceOptions}
              value={source}
              onChange={(next) => dispatch({ type: 'setSource', source: next })}
              layoutId="strategia-target-source"
              ariaLabel="Da dove vengono i target"
              semantics="radio"
              disabled={isDemo}
              optionClassName="h-11 desktop:h-8"
            />
          }
          reading={reading}
        >
          {/* Says the new source once, when it changes; the reading above is its visible twin. */}
          <p className="sr-only" role="status" aria-live="polite">
            {`Target: ${SOURCE_LABELS[source]}.`}
          </p>

          <div className="mt-3.5 flex flex-wrap items-end gap-3">
            <p
              className={cn(
                'font-mono text-[40px] font-bold leading-none tracking-[0.01em] tabular-nums',
                isValidTotal ? 'text-foreground' : 'text-destructive',
              )}
            >
              {pctLabel(total)}
            </p>
            {hasLeverage && (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-[12px] font-medium tabular-nums">
                Leva {formatNumber(leverage, 2)}×
              </span>
            )}
            {cashUseFixedAmount && !fromGoals && <span className="pb-0.5 text-[11px] text-muted-foreground">esclusa liquidità fissa</span>}
          </div>
          {!isValidTotal && (
            <div className="mt-2 flex max-w-[720px] items-center justify-between gap-4 py-1">
              <span className="text-[13px] text-destructive">Residuo da allocare</span>
              <span className="font-mono text-[13px] font-semibold tabular-nums text-destructive">{pctLabel(Math.abs(100 - total))}</span>
            </div>
          )}

          {/* The formula's two inputs: declared here, typed where they live. */}
          {source === 'formula' && (
            <div className="mx-auto mt-3 flex w-full max-w-[720px] flex-col divide-y divide-border border-y border-border">
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">Età</p>
                  <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                    Si modifica in{' '}
                    <Link href={AGE_HREF} className={TILE_FOOTER_ACTION_CLASS}>
                      FIRE › Il mio piano
                    </Link>
                  </p>
                </div>
                <span className={cn('shrink-0 font-mono text-[14px] tabular-nums', userAge === undefined && 'text-muted-foreground')}>
                  {userAge === undefined ? '—' : `${userAge} anni`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">Risk-free rate</p>
                  <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                    {describeRiskFreeOrigin({ typed: riskFreeRate, estimate: riskFreeEstimate })} · si modifica in{' '}
                    <Link href={RISK_FREE_HREF} className={TILE_FOOTER_ACTION_CLASS}>
                      Impostazioni › Preferenze
                    </Link>
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[14px] tabular-nums">{pctLabel(effectiveRiskFreeRate(slice) ?? riskFreeEstimate.value)}</span>
              </div>
            </div>
          )}

          <div className="mx-auto mt-1 flex w-full max-w-[720px] flex-col divide-y divide-border">
            {goalTargets
              ? TARGET_CLASS_ORDER.filter((assetClass) => (goalTargets[assetClass]?.targetPercentage ?? 0) > 0).map((assetClass) => (
                  <GoalClassRow key={assetClass} assetClass={assetClass} percentage={goalTargets[assetClass]?.targetPercentage ?? 0} />
                ))
              : TARGET_CLASS_ORDER.map((assetClass) => {
                  const classDraft = classes[assetClass];
                  if (!classDraft) return null;
                  return (
                    <AllocationClassEditor
                      key={assetClass}
                      assetClass={assetClass}
                      draft={classDraft}
                      isAutoCalculated={autoCalculate && (assetClass === 'equity' || assetClass === 'bonds')}
                      cash={
                        assetClass === 'cash'
                          ? {
                              useFixedAmount: cashUseFixedAmount,
                              fixedAmount: cashFixedAmount,
                              onUseFixedAmount: (value) => dispatch({ type: 'set', patch: { cashUseFixedAmount: value } }),
                              onFixedAmount: (value) => dispatch({ type: 'set', patch: { cashFixedAmount: value } }),
                            }
                          : undefined
                      }
                      onChange={(patch) => dispatch({ type: 'setClass', assetClass, patch })}
                    />
                  );
                })}
          </div>

          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p>
                I pesi per strumento vengono dal{' '}
                <a href={`#${STRATEGIA_ANCHORS.model}`} className={TILE_FOOTER_ACTION_CLASS}>
                  portafoglio modello
                </a>{' '}
                (2).
              </p>
              {!fromGoals && (
                <Button variant="outline" size="sm" className="h-11 gap-1.5 desktop:h-8" onClick={handleRestoreDefaults} disabled={isDemo}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Ripristina default
                </Button>
              )}
            </div>
            <TileMethodNote
              subject="Target per classe"
              summary="«Salva i target» controlla il totale (almeno 100%) e ogni gruppo di sottocategorie (esattamente 100%)."
            >
              <span>Sopra il 100% il totale è una leva target: 110% vuol dire leva 1,10×.</span>
              <span>
                La liquidità come importo fisso in euro esce dal budget percentuale: le altre classi si applicano al
                patrimonio che resta.
              </span>
              <span>
                Le percentuali si applicano al patrimonio ribilanciabile: gli asset «esclusi dal ribilanciamento» (la casa, il
                fondo pensione) non entrano; si escludono dal loro ruolo in Patrimonio, non con un target qui.
              </span>
              <span>Con la formula per età: 125 − età − (risk-free × 5) = % Azioni; le Obbligazioni prendono il resto.</span>
              <span>I target arrivano in Bilanciamento e nel piano con «Salva i target», non prima.</span>
            </TileMethodNote>
          </div>
        </Tile>
      </div>

      {/* 2 · Portafoglio modello | Criteri del modello — moved from Accumulo as they were (D-ST3). */}
      <div id={STRATEGIA_ANCHORS.model} className="grid scroll-mt-4 grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7 desktop:self-start')}>
          <PortafoglioModelloTile
            ownerId={ownerId}
            allAssets={allAssets}
            targets={targets}
            band={band}
            targetLeverageRatio={targetLeverageRatio}
            idealAllocation={idealAllocation}
            model={model}
            plan={plan}
            readFailed={modelQuery.isError}
            onAssetsChanged={onAssetsChanged}
          />
        </div>
        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5 desktop:self-start')}>
          <ObiettiviTile
            idealAllocation={idealAllocation}
            targetLeverageRatio={targetLeverageRatio}
            snapshot={model?.optimizerSnapshot}
            editRef={editRef}
            disabled={!targets}
            plan={liveCriteriaPlan}
            ownerId={ownerId}
            allAssets={allAssets}
            targets={targets}
            onEdit={() => setObjectivesOpen(true)}
          />
        </div>
      </div>

      {/* The save state of the targets, where the thumb and the eye are: sticky at the bottom of
          `<main>` while the draft differs from the saved document (and the moment after «Salvato»),
          with the way back beside the page's ONE filled button. */}
      {showBar && (
        <div className="sticky bottom-4 z-20 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
          <section
            aria-label="Target non salvati"
            className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg desktop:ml-0"
          >
            <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', problem ? 'bg-destructive' : 'bg-primary')} aria-hidden="true" />
              {problem ? (
                <NarrativeText segments={describeTargetProblem(problem)} className="text-[13px] leading-[1.4]" />
              ) : (
                <span>{dirty ? 'Target modificati, non ancora salvati.' : 'Target salvati.'}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" className="h-11 desktop:h-8" onClick={() => void revert()} disabled={saving || !dirty}>
                Annulla
              </Button>
              <Button size="sm" className={cn('h-11 desktop:h-8', justSaved && SAVED_BUTTON_CLASS)} onClick={() => void handleSave()} disabled={saving}>
                <SaveButtonContent saving={saving} saved={justSaved} icon={<Save className="h-4 w-4" />} idle="Salva i target" />
              </Button>
            </div>
          </section>
        </div>
      )}

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
          plan={liveCriteriaPlan}
          onSaved={onAssetsChanged}
          returnFocusTo={editRef}
        />
      )}
    </div>
  );
}

/** Σ of the class targets of a map, the fixed-euro cash out (what `sumClassTargets` does on a draft). */
function sumTargetPercentages(targets: AssetAllocationTarget): number {
  return TARGET_CLASS_ORDER.reduce((sum, assetClass) => {
    const entry = targets[assetClass];
    if (!entry || (assetClass === 'cash' && entry.useFixedAmount)) return sum;
    return sum + (entry.targetPercentage || 0);
  }, 0);
}

/** A class row under «Dai traguardi»: what the goals give it, read-only (the manual targets stay in the draft). */
function GoalClassRow({ assetClass, percentage }: { assetClass: AssetClass; percentage: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{ASSET_CLASS_LABELS[assetClass] ?? assetClass}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Dai traguardi</p>
      </div>
      <span className="shrink-0 font-mono text-[14px] tabular-nums">{pctLabel(percentage)}</span>
    </div>
  );
}
