'use client';

import { useEffect, useState } from 'react';
import { findAddedIds } from '@/lib/utils/rowTransition';

/** How long a new row stays highlighted: the CSS fades it over the same 1200 ms (globals.css → Rows that leave and arrive). */
export const ADDED_ROW_HIGHLIGHT_MS = 1200;

/**
 * The ids of the rows the reader just created (AN3 G): a list that GAINED one or two rows and lost none
 * (`findAddedIds`). A row wears `data-row-added` while its id is in the set; the timer that drops it lives in
 * its own effect (AGENTS.md → Motion, auto-dismiss). The previous list is adjusted during render, not read
 * from a ref, so the first render with a new row already carries the marker.
 */
export function useAddedRows(ids: readonly string[]): ReadonlySet<string> {
  const [previous, setPrevious] = useState<readonly string[]>(ids);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());

  if (previous !== ids && (previous.length !== ids.length || previous.some((id, i) => id !== ids[i]))) {
    setPrevious(ids);
    const gained = findAddedIds(previous, ids);
    if (gained.size > 0) setAdded(gained);
  }

  useEffect(() => {
    if (added.size === 0) return;
    const timer = window.setTimeout(() => setAdded(new Set()), ADDED_ROW_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [added]);

  return added;
}
