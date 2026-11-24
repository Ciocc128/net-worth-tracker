'use client';

/**
 * La catena dei pesi — the strip under Allocazione's tabs, the same on the three of them (RU8,
 * doc/allocazione-strategia/README.md § 5.2, D-ST2): Target per classe → Portafoglio modello → Piano
 * di accumulo → Rata del mese, each cell a link to where that step is changed. The cells of the tab
 * the reader is on are tinted, with a filled number.
 *
 * Nothing is computed here: `buildAllocationChain` (lib/utils/allocationChain.ts) writes every word
 * and figure, and the accessible name of each link is its whole sentence (the number and the arrow
 * are `aria-hidden`). Below `desktop:` the same four links in one row of 44px cells with the number
 * and the short figure only; the title and the detail stay in the link's name.
 *
 * The links are plain `<Link>`s: the page follows `?tab=`, and the `#anchor` is scrolled to by the router
 * when its block is already there or by Strategia when it mounts, so a cell, a bookmark and «Apri il
 * portafoglio modello» land the same way. The strip does not animate
 * when the tab changes (§ 6.2): only the cells' ground changes, with the theme's colour transition.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChainCell } from '@/lib/utils/allocationChain';

function StepNumber({ step, current, className }: { step: number; current: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold tabular-nums',
        current ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground',
        className,
      )}
    >
      {step}
    </span>
  );
}

export function AllocazioneChain({ cells, className }: { cells: ChainCell[]; className?: string }) {
  return (
    <nav aria-label="La catena dei pesi" className={className}>
      <ol className="grid grid-cols-4 overflow-hidden rounded-2xl border border-border bg-card">
        {cells.map((cell, index) => (
          <li key={cell.step} className={cn('min-w-0', index > 0 && 'border-l border-border')}>
            <Link
              href={cell.href}
              aria-label={cell.ariaLabel}
              aria-current={cell.linksHere ? 'page' : undefined}
              data-chain-step={cell.step}
              className={cn(
                'group flex h-full min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                // Below `desktop:` a 44px cell: the number and the short figure.
                'h-11 items-center justify-center gap-1.5 px-1.5',
                'desktop:h-auto desktop:items-start desktop:justify-start desktop:gap-2.5 desktop:px-4 desktop:py-3.5',
                cell.current ? 'bg-muted' : 'hover:bg-muted/40',
              )}
            >
              <StepNumber step={cell.step} current={cell.current} className="desktop:mt-px" />
              <span aria-hidden="true" className="min-w-0 truncate font-mono text-[12px] font-semibold tabular-nums text-foreground desktop:hidden">
                {cell.compactFigure}
              </span>
              <span aria-hidden="true" className="hidden min-w-0 flex-col desktop:flex">
                <span className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
                  <span className="truncate">{cell.title}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </span>
                <span className="mt-1 truncate font-mono text-[15px] font-semibold tabular-nums text-foreground">{cell.figure}</span>
                <span className={cn('mt-0.5 truncate text-[11px]', cell.tone === 'warning' ? 'text-warning-foreground' : 'text-muted-foreground')}>
                  {cell.detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
