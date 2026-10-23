'use client';

import { cn } from '@/lib/utils';
import { formatStripFigure, type StripFigure } from '@/lib/utils/verdictStrip';
import type { NarrativeSegment } from '@/lib/utils/narrative';
import { NarrativeSegments } from '@/components/ui/narrative-text';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { useSettledFigure } from '@/components/ui/settled-figure';

interface VerdictStripProps {
  /** At most four, from the page's `select<Page>Strip(summary)` — never recomputed here. */
  figures: readonly StripFigure[];
  /** What a cell opens: a row (`sections.reveal`), the verdict's rest, or THE tile (the page's own handler). */
  onOpen(section: string): void;
  /**
   * The eyebrow a cell announces («, apre Anni»), by the section it opens: the controller's
   * `sections.eyebrows` (every row), spread with the page's own words for a cell that opens THE
   * tile or no row («l'andamento da inizio anno»). The strip does not know the rows, so an id
   * missing here falls back to the cell's own label — «apre Quest'anno», which is why the map
   * comes from the controller since 2026-10-10.
   */
  eyebrows?: Readonly<Record<string, string>>;
}

/**
 * The cell's figure, gliding from the one it showed when the page's window moves (AN2,
 * doc/animazioni/README.md § 5.6): the frame is printed through the same formatter, in the LANDED
 * figure's tone (a frame that crosses zero never flips the colour), and the screen reader reads the
 * landed text. `strip:{opens}` is its slot in the page's `FigureMemory`, when the page has one.
 */
function StripValue({ figure, landed }: { figure: StripFigure; landed: NarrativeSegment }) {
  const frame = useSettledFigure(figure.value, `strip:${figure.opens}`);
  const frameText = frame === null || frame === figure.value ? landed.text : (formatStripFigure({ ...figure, value: frame })?.text ?? landed.text);
  // The unit at `ml-[0.2em]` after the figure: `NarrativeSegments` splits it (narrative-text.tsx).
  if (frameText === landed.text) return <NarrativeSegments segments={[landed]} />;
  return (
    <>
      <span aria-hidden="true">
        <NarrativeSegments segments={[{ ...landed, text: frameText }]} />
      </span>
      <span className="sr-only">{landed.text}</span>
    </>
  );
}

/**
 * A value longer than this takes a row of its own below `tablet:`: «+123.456,78 €» does not fit a
 * third of 358px (2026-10-10); from 768 a third is ~240px and every cell shares the one row
 * (2026-10-16). A `null` cell's `reason` counts the same way («nessuno snapshot prima di questo
 * mese» is a wide cell too; first seen on the Panoramica, 2026-10-11).
 */
const WIDE_CELL_CHARS = 9;

/**
 * The figures of a phone's first screen, under the verdict's first sentence (The First-Screen
 * Rule): 1–3 cells in a row, 4 as 2×2 below `tablet:`, a wide cell on a row of its own with the
 * others moving down — below `tablet:` only; from 768 every cell is on one row. Each cell is a button that opens the section explaining it; a `null` figure
 * prints its `reason`, never a zero. Hidden from `desktop:` by its own class: the page does not
 * branch on the width to mount it.
 *
 * The `ul[aria-label="Le cifre del verdetto"]` is what the census counts OUTSIDE the verdict
 * (`scripts/mobileCensus.mjs`, correction 3): rename nothing here without renaming it there.
 */
export function VerdictStrip({ figures, onOpen, eyebrows }: VerdictStripProps) {
  if (figures.length === 0) return null;
  const twoByTwo = figures.length === 4;

  return (
    <ul aria-label="Le cifre del verdetto" className="my-2 flex flex-wrap gap-2 desktop:hidden">
      {figures.map((figure) => {
        const segment = formatStripFigure(figure);
        const text = segment?.text ?? figure.reason ?? '';
        const wide = text.length > WIDE_CELL_CHARS;
        const target = eyebrows?.[figure.opens] ?? figure.label;
        return (
          <li
            key={figure.opens}
            className={cn('@container min-w-0 flex-1', wide ? 'basis-full tablet:basis-0' : twoByTwo ? 'basis-[calc(50%-0.25rem)] tablet:basis-0' : 'basis-0')}
          >
            <button
              type="button"
              onClick={() => onOpen(figure.opens)}
              className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-lg py-1 text-left active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={TILE_SUB_EYEBROW_CLASS}>{figure.label}</span>
              {segment ? (
                <span className="text-[22px] leading-none tabular-nums @max-[110px]:text-[18px]">
                  <StripValue figure={figure} landed={segment} />
                </span>
              ) : (
                <span className="text-[13px] leading-[1.3] text-muted-foreground">{figure.reason}</span>
              )}
              <span className="sr-only">, apre {target}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
