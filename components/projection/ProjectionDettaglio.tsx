'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: how the projection is calculated and what it
 * does not say. Closed by default — the verdict and the tiles already answer the question.
 * Static words from `PROJECTION_EXPLAINER`: nothing is computed here.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PROJECTION_DETTAGLIO_DESCRIPTION, PROJECTION_EXPLAINER } from '@/lib/utils/projectionNarrative';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_EYEBROW_CLASS } from '@/components/ui/tile';

export function ProjectionDettaglio() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">{PROJECTION_DETTAGLIO_DESCRIPTION}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <Tile eyebrow="Come si calcola" ariaLabel="Come si calcola la proiezione">
          <div className="mt-3 grid grid-cols-1 gap-5 text-[13px] leading-[1.5] text-muted-foreground desktop:grid-cols-3">
            {PROJECTION_EXPLAINER.map((block) => (
              <div key={block.title}>
                <p className="mb-1 font-medium text-foreground">{block.title}</p>
                {block.body}
              </div>
            ))}
          </div>
        </Tile>
      </CollapsibleContent>
    </Collapsible>
  );
}
