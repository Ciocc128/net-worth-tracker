'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** How long the reveal marker stays on the container: the fade is 180 ms (globals.css → Skeleton reveal). */
const REVEAL_MS = 220;

/**
 * Skeleton → content (AN3 F, doc/animazioni/README.md § 5.8). The content that replaces a skeleton fades
 * in over 180 ms, ONLY when the skeleton was really painted in this visit: a passive effect (it runs after
 * paint) marks it, and the layout cleanup — which runs in the commit that swaps the skeleton for the page,
 * before the browser paints it — puts `data-skeleton-reveal` on the skeleton's parent for the fade. A page
 * restored from the persisted cache never draws a skeleton, so it never fades; the Panoramica keeps its
 * own cascade and opts out. Once per container (`data-skeleton-revealed`): a period change that draws the
 * skeleton again is the View-Transforms Rule's job, not a second fade of the whole page.
 *
 * The marker is set on the DOM, not in state: the swap costs no render. No `translate` anywhere — the page
 * scene already moved the content.
 */
export function useSkeletonReveal(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const painted = useRef(false);

  useEffect(() => {
    if (enabled) painted.current = true;
  }, [enabled]);

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement ?? null;
    return () => {
      if (!painted.current || !parent || parent.dataset.skeletonRevealed !== undefined) return;
      parent.dataset.skeletonRevealed = '';
      parent.dataset.skeletonReveal = '';
      window.setTimeout(() => {
        delete parent.dataset.skeletonReveal;
      }, REVEAL_MS);
    };
  }, [ref]);
}
