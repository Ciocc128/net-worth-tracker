'use client';

/**
 * A row that opens by itself while its inputs differ from the run it shows (The Stale-Run Rule; RU10, D-RU28: Parametri of
 * Dopo il FIRE and of the Proiezione, a closed row under the verdict that must not hide the «Prova» a changed field now needs).
 *
 * `collapse` is the row's own (`useMobileSections().collapse(id)`); the answer is the same object with `open` forced while
 * `stale` holds. Closing the row during a stale spell is the reader's call: it stays closed until the spell ends (the form
 * matches the run again) and the next one opens it afresh. Nothing is written to the row's memory by the forced opening.
 */

import { useMemo, useState } from 'react';
import type { TileCollapse } from '@/components/ui/tile';

export function useStaleOpenCollapse(collapse: TileCollapse | undefined, stale: boolean): TileCollapse | undefined {
  const [dismissed, setDismissed] = useState(false);
  // Pattern (3) of AGENTS.md § Motion: settled during render. A spell that ended forgets the dismissal.
  if (!stale && dismissed) setDismissed(false);

  const forced = stale && !dismissed;
  const base = collapse;
  return useMemo(() => {
    if (!base) return undefined;
    if (!forced) {
      return stale ? { ...base, onOpenChange: (next: boolean) => { if (!next) setDismissed(true); base.onOpenChange(next); } } : base;
    }
    return {
      ...base,
      open: true,
      mounted: true,
      onOpenChange: (next: boolean) => {
        if (!next) setDismissed(true);
        base.onOpenChange(next);
      },
    };
  }, [base, forced, stale]);
}
