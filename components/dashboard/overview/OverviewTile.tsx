import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Narrative } from '@/lib/utils/overviewNarrative';
import { NarrativeText } from './NarrativeText';

interface OverviewTileProps {
  /** The tile's question, as the small uppercase label. */
  eyebrow: string;
  /** Short context on the right of the eyebrow (a period, a count, a scope). */
  aside?: ReactNode;
  /** The one-line reading under the eyebrow: the answer in words, before the numbers. */
  reading?: Narrative | null;
  /** Optional accessible label for the section; defaults to the eyebrow. */
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

/** The eyebrow every tile and every hero on the page shares. */
export const TILE_EYEBROW_CLASS =
  'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

/** A smaller eyebrow for labels INSIDE a tile (a KPI name, a list title). */
export const TILE_SUB_EYEBROW_CLASS =
  'text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

/**
 * One tile of the Panoramica bento. Every tile answers ONE question: the eyebrow names it,
 * the reading answers it in a sentence, the body shows the numbers. The shell is the app's
 * card (bg-card, 1px border, 16px radius, the Lift shadow) written as a naked `section` so
 * the tile controls its own flex column — `mt-auto` footers rely on it.
 */
export function OverviewTile({
  eyebrow,
  aside,
  reading,
  ariaLabel,
  className,
  children,
}: OverviewTileProps) {
  return (
    <section
      aria-label={ariaLabel ?? eyebrow}
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={TILE_EYEBROW_CLASS}>{eyebrow}</p>
        {aside && <div className="shrink-0 text-[10px] text-muted-foreground">{aside}</div>}
      </div>
      {reading && (
        <NarrativeText segments={reading} className="mt-2 text-[13px] leading-[1.45] text-foreground" />
      )}
      {children}
    </section>
  );
}
