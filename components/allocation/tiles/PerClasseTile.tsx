'use client';

/**
 * PER CLASSE — «quanto è lontana ogni classe dal suo target?»: a reading line from
 * `describeClasses` (the largest gap in EURO — the verdict already reads the drifts in points,
 * so the two never print the same figure for the same class), then the class → sub-category →
 * specific-asset accordion as flat rows with a 3px tick each, and a footer.
 *
 * The tile has no axis and no toggle: a gap is a position, not a period, and the band that
 * classifies it lives in the Bilanciamento tile — one lever for the whole page, never a second
 * one here. The aside names the three columns («corrente · target · gap») instead of a scope,
 * because a list of aligned figures with no header is a list the reader has to guess at.
 *
 * The footer is where the orphaned targets go: a target whose whole value sits in excluded
 * assets can never be reached by any buy or sell, so the page strips it from the plans and from
 * these rows — and something must say so where the rows are, or the class simply vanishes.
 * Amber is a setting to fix, not a market signal. Without orphans the footer explains the one
 * convention the columns rely on, the sign of the gap.
 *
 * Nothing is computed here: the allocation is banded by the page, the words come from
 * `allocazioneNarrative.ts`, and `AllocationBreakdown` only renders what it is given.
 */

import Link from 'next/link';
import { AlertTriangle, Pencil } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { OrphanedTarget } from '@/lib/utils/allocationUtils';
import type { AllocationResult, AssetAllocationTarget } from '@/types/assets';
import { formatPercentage } from '@/lib/services/chartService';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { AllocationBreakdown } from '@/components/allocation/AllocationBreakdown';

interface PerClasseTileProps {
  /** `describeClasses(gaps, band)`; null without a class. */
  reading: Narrative | null;
  /** The column legend, «corrente · target · gap». */
  aside: string;
  /** Banded, with `bySubCategory` ALREADY stripped of orphaned sub-targets. */
  allocation: AllocationResult;
  targets: AssetAllocationTarget | null;
  /** Where the targets are edited (Allocazione › Strategia, RU8): the pencil in the aside and the orphans' link. */
  editHref: string;
  /** The targets the exclusion stranded — the rows above no longer carry them. */
  orphans: OrphanedTarget[];
  /** Euro of each class sitting in EXCLUDED assets, so a dormant row can say where its money is. */
  excludedByClass?: Record<string, number>;
  /** The row of the phone composition (The Closed-Row Rule); absent at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
  className?: string;
}

/**
 * Assembled as a string, not interleaved with JSX expressions: mixing `{cond ? 'a' : 'b'}`
 * with adjacent prose swallows the separating spaces and silently mangles the plural arm.
 */
const ORPHAN_EXPLANATION = {
  singular: 'Questo target non è raggiungibile e viene escluso dai piani: tutto il suo valore è in asset esclusi.',
  plural: 'Questi target non sono raggiungibili e vengono esclusi dai piani: tutto il loro valore è in asset esclusi.',
} as const;

function OrphanWarning({ orphans, editHref }: { orphans: OrphanedTarget[]; editHref: string }) {
  return (
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">Target senza asset ribilanciabili</p>
        <p className="mt-0.5">
          {orphans.length === 1 ? ORPHAN_EXPLANATION.singular : ORPHAN_EXPLANATION.plural} Azzera il target in{' '}
          <Link href={editHref} className="text-foreground underline-offset-2 hover:underline">
            Strategia
          </Link>{' '}
          oppure togli l&apos;esclusione dall&apos;asset.
        </p>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {orphans.map((orphan) => (
            <li key={orphan.label}>
              <span className="text-foreground">{orphan.label}</span> — target{' '}
              <span className="font-mono tabular-nums">{formatPercentage(orphan.targetPercentage, 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PerClasseTile({ reading, aside, allocation, targets, editHref, orphans, excludedByClass, collapse, asideWhenClosed, className }: PerClasseTileProps) {
  // The way to the targets (D-ST7): a pencil beside the columns' legend, 32px (44 below `desktop:`).
  const asideWithEdit = (
    <span className="flex items-center gap-2">
      <span>{aside}</span>
      <Link
        href={editHref}
        aria-label="Modifica i target per classe"
        title="Modifica i target per classe"
        className="-my-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-8 desktop:w-8"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </span>
  );
  return (
    <Tile eyebrow="Per classe" aside={asideWithEdit} asideWhenClosed={asideWhenClosed} reading={reading} className={className} ariaLabel="Allocazione per classe" collapse={collapse}>
      <AllocationBreakdown allocation={allocation} targets={targets} excludedByClass={excludedByClass} className="mt-3" />

      <div className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.5] text-muted-foreground">
        {orphans.length > 0 ? (
          <OrphanWarning orphans={orphans} editHref={editHref} />
        ) : (
          <p>
            Il segno del gap è quello dell&apos;operazione: + c&apos;è troppo, − manca. Una classe con sottocategorie si apre
            sulla riga, e le sue sottocategorie si compensano dentro la classe: il loro «corrente» è una quota della
            classe, non del portafoglio.
          </p>
        )}
      </div>
    </Tile>
  );
}
