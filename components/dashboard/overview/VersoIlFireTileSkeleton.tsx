'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { TileCollapse } from '@/components/ui/tile';
import { OverviewTile } from './OverviewTile';

// Its own file on purpose: Panoramica imports the skeleton statically, and the tile (with the FIRE engine behind
// `useFireProgress`) is a lazy chunk. Both in one module put the engine in /dashboard's initial JS (+66 KB gz, measured
// 2026-11-26 on perf:build).
export interface VersoIlFireTileProps {
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow (`describeOverviewAsides`). */
  asideWhenClosed?: string;
  className?: string;
}

/** The tile's size before its figures arrive (and while its chunk loads): the same lines, so nothing moves. */
export function VersoIlFireTileSkeleton({ collapse, asideWhenClosed, className }: VersoIlFireTileProps) {
  return (
    <OverviewTile eyebrow="Verso il FIRE" asideWhenClosed={asideWhenClosed} collapse={collapse} className={className}>
      <div className="mt-4 flex flex-col gap-2.5" aria-hidden="true">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-[3px] w-full" />
        <Skeleton className="h-3 w-40" />
      </div>
    </OverviewTile>
  );
}
