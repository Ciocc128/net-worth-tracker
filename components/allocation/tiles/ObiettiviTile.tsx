'use client';

/**
 * ObiettiviTile — «quali obiettivi guidano il portafoglio ideale?» (doc/pac-ottimizzatore § RV6).
 * Lists the objectives of «Allocazione ideale» with their priority and opens `ObiettiviDialog` to
 * change them; Impostazioni › Allocazione keeps a read-only summary and a link here. The dossier's
 * target → reached bars and the first conflict sentence read the model portfolio's snapshot, which
 * arrives with task A2: until then the tile shows the objectives alone.
 */
import { useRef } from 'react';
import type { IdealAllocationSettings } from '@/types/assets';
import { buildIdealAllocationInput, describeIdealComposition, listIdealObjectives } from '@/lib/utils/settingsNarrative';
import { OBJECTIVES_ACTION_EDIT, OBJECTIVES_OFF_READING, OBJECTIVES_TILE_EYEBROW } from '@/lib/utils/weightOptimizerNarrative';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Tile } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { TILE_ACTION_CLASS } from '@/components/allocation/tiles/accumuloShared';

interface ObiettiviTileProps {
  idealAllocation: IdealAllocationSettings | null;
  targetLeverageRatio: number;
  onEdit: () => void;
  /** The button that opened the modal, so closing it can return the focus there. */
  editRef?: React.RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
}

export function ObiettiviTile({ idealAllocation, targetLeverageRatio, onEdit, editRef, disabled }: ObiettiviTileProps) {
  const isDemo = useDemoMode();
  const fallbackRef = useRef<HTMLButtonElement>(null);
  const enabled = !!idealAllocation?.enabled;
  const input = idealAllocation ? buildIdealAllocationInput(idealAllocation, targetLeverageRatio) : null;
  const objectives = enabled && input ? listIdealObjectives(input) : [];

  return (
    <Tile
      eyebrow={OBJECTIVES_TILE_EYEBROW}
      reading={enabled && input ? describeIdealComposition(input) : [{ text: OBJECTIVES_OFF_READING }]}
    >
      {objectives.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {objectives.map((objective) => (
            <li key={objective} className="py-2 text-[13px] text-foreground">
              {objective}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
        <Button ref={editRef ?? fallbackRef} variant="outline" className={TILE_ACTION_CLASS} disabled={disabled || isDemo || !idealAllocation} onClick={onEdit}>
          {OBJECTIVES_ACTION_EDIT}
        </Button>
      </div>
    </Tile>
  );
}
