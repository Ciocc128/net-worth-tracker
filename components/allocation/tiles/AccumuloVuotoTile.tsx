'use client';

/**
 * AccumuloVuotoTile — the Accumulo tab with no open plan (doc/pac-ottimizzatore § RV4): what the
 * feature does and does not do, in the reader's own numbers. The verdict above already says the
 * cash in the accounts; this tile adds the preview (a month's rata and where the classes would go
 * with today's weights, the default reserve and no inflow) and the two lists a first-time reader
 * needs before pressing «Crea piano». «Crea piano» opens the editor on the plan dialog as before;
 * the second action jumps to Composizione ideale, where the weights are designed until the model
 * portfolio gets its own tile (task A2).
 */
import { useMemo, useState } from 'react';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { buildAccumuloPreview } from '@/lib/utils/accumuloSummary';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { AccumulationPlanDialog } from '@/components/allocation/AccumulationPlanDialog';
import { TargetTick } from '@/components/allocation/TargetTick';
import { DEPS, TILE_ACTION_CLASS } from '@/components/allocation/tiles/accumuloShared';
import {
  ACCUMULO_ACTION_CREATE_PLAN,
  ACCUMULO_ACTION_GO_TO_COMPOSITION,
  ACCUMULO_EMPTY_DOESNT,
  ACCUMULO_EMPTY_DOESNT_TITLE,
  ACCUMULO_EMPTY_DOES,
  ACCUMULO_EMPTY_DOES_TITLE,
  ACCUMULO_EMPTY_PREVIEW_CLASSES,
  ACCUMULO_EMPTY_PREVIEW_TITLE,
  ACCUMULO_TILE_EYEBROW,
  describeAccumuloPreview,
} from '@/lib/utils/accumulationNarrative';

/** The anchor `AccumuloTab` puts on Composizione ideale's cell. */
export const COMPOSITION_ANCHOR_ID = 'composizione-ideale';

interface AccumuloVuotoTileProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  band: RebalanceBand;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  today: Date;
  onAssetsChanged: () => void;
}

export function AccumuloVuotoTile({ ownerId, allAssets, targets, band, targetLeverageRatio, idealAllocation, today, onAssetsChanged }: AccumuloVuotoTileProps) {
  const isDemo = useDemoMode();
  const [dialogOpen, setDialogOpen] = useState(false);

  const preview = useMemo(
    () => (targets ? buildAccumuloPreview({ allAssets, targets, band, compare: compareAllocations, deps: DEPS, today }) : null),
    [allAssets, targets, band, today],
  );

  const goToComposition = () => {
    document.getElementById(COMPOSITION_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <Tile eyebrow={ACCUMULO_TILE_EYEBROW} aside={ACCUMULO_EMPTY_PREVIEW_TITLE} reading={describeAccumuloPreview(preview)}>
        {preview && preview.classes.length > 0 && (
          <div className="mt-3 max-w-[640px]">
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_EMPTY_PREVIEW_CLASSES}</p>
            <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-3 tablet:grid-cols-2">
              {preview.classes.map((row) => (
                <li key={row.assetClass}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[13px] text-foreground">{ASSET_CLASS_LABELS[row.assetClass] ?? row.assetClass}</span>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums">
                      <span className="font-semibold text-foreground">{formatPercentageIt(row.currentPct, 1)}</span>
                      <span className="ml-1.5 text-muted-foreground">→ {formatPercentageIt(row.finalPct, 1)}</span>
                    </span>
                  </div>
                  <TargetTick
                    className="mt-1"
                    color={`var(--allocation-row-bar, var(${getAssetClassCssVar(row.assetClass)}))`}
                    currentPercentage={row.currentPct}
                    targetPercentage={row.targetPct}
                    projectedPercentage={row.finalPct}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-border pt-3.5 tablet:grid-cols-2">
          <div>
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_EMPTY_DOES_TITLE}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] leading-[1.5] text-foreground marker:text-muted-foreground">
              {ACCUMULO_EMPTY_DOES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className={TILE_SUB_EYEBROW_CLASS}>{ACCUMULO_EMPTY_DOESNT_TITLE}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] leading-[1.5] text-muted-foreground marker:text-muted-foreground">
              {ACCUMULO_EMPTY_DOESNT.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
          <Button className={TILE_ACTION_CLASS} disabled={isDemo || !targets} onClick={() => setDialogOpen(true)}>
            {ACCUMULO_ACTION_CREATE_PLAN}
          </Button>
          <Button variant="outline" className={TILE_ACTION_CLASS} onClick={goToComposition}>
            {ACCUMULO_ACTION_GO_TO_COMPOSITION}
          </Button>
        </div>
      </Tile>
      {dialogOpen && targets && (
        <AccumulationPlanDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          ownerId={ownerId}
          plan={null}
          allAssets={allAssets}
          targets={targets}
          band={band}
          targetLeverageRatio={targetLeverageRatio}
          idealAllocation={idealAllocation}
          onAssetsChanged={onAssetsChanged}
          onSaved={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
