'use client';

/**
 * ComposizioneIdealeTile — Allocazione's standalone entry point to the weight optimizer
 * (doc/weight-optimizer-ate.md §4, doc/guide/ottimizzatore.md): «com'è fatto il mio portafoglio
 * ideale, strumento per strumento?», independent of any PAC in progress. No calculation and no
 * network call before the reader clicks Calcola — the tile itself only opens
 * `IdealCompositionDialog` when the objectives are on. It owns the choice between that dialog and
 * `AccumulationPlanDialog` ("Crea un PAC con questi pesi" never stacks a second modal under the
 * first, §4.2): only one of the two is ever mounted.
 */
import { useState } from 'react';
import Link from 'next/link';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { PlanPosition, OptimizerSnapshot } from '@/types/accumulationPlan';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import { buildIdealAllocationInput, describeIdealComposition } from '@/lib/utils/settingsNarrative';
import {
  IDEAL_COMPOSITION_TILE_EYEBROW,
  IDEAL_COMPOSITION_TILE_OFF_READING,
  OPTIMIZER_ACTION_CALCULATE,
  OPTIMIZER_ACTION_MODIFY_IN_SETTINGS,
} from '@/lib/utils/weightOptimizerNarrative';
import { Tile } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { IdealCompositionDialog } from '@/components/allocation/IdealCompositionDialog';
import { AccumulationPlanDialog } from '@/components/allocation/AccumulationPlanDialog';

interface ComposizioneIdealeTileProps {
  ownerId: string;
  allAssets: Asset[];
  targets: AssetAllocationTarget | null;
  targetLeverageRatio: number;
  idealAllocation: IdealAllocationSettings | null;
  band: RebalanceBand;
  onAssetsChanged: () => void;
}

type View = 'closed' | 'composition' | 'pac';

export function ComposizioneIdealeTile({
  ownerId,
  allAssets,
  targets,
  targetLeverageRatio,
  idealAllocation,
  band,
  onAssetsChanged,
}: ComposizioneIdealeTileProps) {
  const [view, setView] = useState<View>('closed');
  const [pacSeed, setPacSeed] = useState<{ positions: PlanPosition[]; optimizerSnapshot: OptimizerSnapshot } | undefined>(
    undefined
  );

  if (!idealAllocation?.enabled) {
    return (
      <Tile eyebrow={IDEAL_COMPOSITION_TILE_EYEBROW} reading={[{ text: IDEAL_COMPOSITION_TILE_OFF_READING }]}>
        <Link
          href="/dashboard/settings?tab=allocazione"
          className="mt-3.5 inline-block text-[13px] underline underline-offset-2"
        >
          {OPTIMIZER_ACTION_MODIFY_IN_SETTINGS}
        </Link>
      </Tile>
    );
  }

  const readingInput = buildIdealAllocationInput(idealAllocation, targetLeverageRatio);

  return (
    <>
      <Tile eyebrow={IDEAL_COMPOSITION_TILE_EYEBROW} reading={describeIdealComposition(readingInput)}>
        <Button className="mt-3.5 w-fit" onClick={() => setView('composition')} disabled={!targets}>
          {OPTIMIZER_ACTION_CALCULATE}
        </Button>
      </Tile>

      {view === 'composition' && targets && (
        <IdealCompositionDialog
          open
          onClose={() => setView('closed')}
          ownerId={ownerId}
          allAssets={allAssets}
          targets={targets}
          targetLeverageRatio={targetLeverageRatio}
          idealAllocation={idealAllocation}
          onCreatePac={(seed) => {
            setPacSeed(seed);
            setView('pac');
          }}
        />
      )}

      {view === 'pac' && targets && (
        <AccumulationPlanDialog
          open
          onClose={() => setView('closed')}
          ownerId={ownerId}
          plan={null}
          allAssets={allAssets}
          targets={targets}
          band={band}
          targetLeverageRatio={targetLeverageRatio}
          idealAllocation={idealAllocation}
          seedDraft={pacSeed}
          onAssetsChanged={onAssetsChanged}
          onSaved={() => setView('closed')}
        />
      )}
    </>
  );
}
