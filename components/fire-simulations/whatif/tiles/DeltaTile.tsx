'use client';

/**
 * DELTA — «di quanto cambia?»: every figure of the plan as one row — before → after on the
 * right, the signed change under it — in two blocks, the FIRE plan and, when an age is saved in
 * Coast FIRE, the Coast plan. The rows come formatted from `buildDeltaRows` (words), the sign
 * from the direction that is good for that row: a year later is a loss, a lower FIRE number a
 * gain, a bigger Coast gap a loss. An unchanged row says «invariato», muted — never a «+0 €».
 *
 * Only the rows that change are shown (FEAT FIRE 2026-10-05, `buildDeltaView`): the others are one
 * closing line, and when nothing moves the tile is one sentence. The order never reshuffles, the
 * rows only disappear. For a job loss of today the decomposed hit sits under the rows (`effect`).
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import { DELTA_NOTHING_MOVES, type DeltaRow, type DeltaView } from '@/lib/utils/whatIfNarrative';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface DeltaTileProps {
  /** `describeDelta(summary)`. */
  reading: Narrative;
  view: DeltaView;
  /** The Coast target age, for the block's label. */
  coastRetirementAge: number | null;
  /** `describeDeltaFooter(hasCoast)`. */
  footer: Narrative;
  /** The job-loss decomposition, when there is one. */
  effect?: ReactNode;
  className?: string;
}

function RowList({ rows, ariaLabel }: { rows: DeltaRow[]; ariaLabel: string }) {
  return (
    <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={ariaLabel}>
      {/* The label keeps its line; when the values need the room («Raggiunto → Raggiunto» in a
          3-column tile) they drop to a second line, right-aligned, instead of splitting the label
          in three (the Per classe row's rule). */}
      {rows.map((row) => (
        <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-[9px]">
          <span className="min-w-0 text-[13px] text-muted-foreground">{row.label}</span>
          <span className="ml-auto flex shrink-0 flex-col items-end">
            <span className="font-mono text-[13px] tabular-nums">
              <span className="text-muted-foreground">{row.before}</span>
              <span className="mx-1 text-muted-foreground/50" aria-hidden="true">
                →
              </span>
              <span className="sr-only">diventa</span>
              <span className="font-semibold text-foreground">{row.after}</span>
            </span>
            {row.change && (
              <span
                className={cn(
                  'font-mono text-[11px] tabular-nums',
                  row.sign === 'positive' && 'text-positive',
                  row.sign === 'negative' && 'text-destructive',
                  !row.sign && 'text-muted-foreground',
                )}
              >
                {row.change}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DeltaTile({ reading, view, coastRetirementAge, footer, effect, className }: DeltaTileProps) {
  if (view.nothingMoves) {
    return <Tile eyebrow="Delta" aside="prima → dopo" reading={DELTA_NOTHING_MOVES} ariaLabel="Delta dell'evento" className={className}>{null}</Tile>;
  }
  return (
    <Tile eyebrow="Delta" aside="prima → dopo" reading={reading} ariaLabel="Delta dell'evento" className={className}>
      {view.fire.length > 0 && (
        <>
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-3.5')}>FIRE</p>
          <RowList rows={view.fire} ariaLabel="Prima e dopo per il FIRE" />
        </>
      )}

      {view.coast && (
        <>
          <p className={cn(TILE_SUB_EYEBROW_CLASS, view.fire.length > 0 ? 'mt-4' : 'mt-3.5')}>Coast FIRE{coastRetirementAge !== null && ` · a ${coastRetirementAge} anni`}</p>
          <RowList rows={view.coast} ariaLabel="Prima e dopo per il Coast FIRE" />
        </>
      )}

      {view.unchangedLine && <p className="mt-3 text-[12px] leading-[1.45] text-muted-foreground">{view.unchangedLine}</p>}

      {effect}

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
