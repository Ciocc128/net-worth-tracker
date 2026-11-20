'use client';

import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

/**
 * The condition of Tailwind's `desktop:` (app/globals.css, RU0): 1440 and up, or 1280 and up with a
 * fine pointer. The range form, never `(min-width: 1440px)`, which would leave a fractional zoom
 * width (1439.5) in neither branch. ONE source for every JS reader.
 */
export const DESKTOP_QUERY = '(width >= 1440px) or ((width >= 1280px) and (pointer: fine))';

/**
 * The query of Tailwind's `max-desktop:`: the negation of `DESKTOP_QUERY`.
 * `useMediaQuery` is `false` on the server and during hydration (`lib/hooks/useMediaQuery.ts`).
 */
export const COMPACT_QUERY = `not all and (${DESKTOP_QUERY})`;

/**
 * Whether the page is composed for a small screen (DESIGN.md → The Closed-Row Rule):
 * below `desktop:` the rows of a page are closed tiles and the verdict is cut; at 1440 nothing of
 * that exists and `useMobileSections().collapse(id)` answers `undefined`. ONE store, not a second
 * one beside `useMediaQuery`: the CSS (`max-desktop:`) and this hook read the same query, so a
 * component is never styled for one width and behaving for another.
 */
export function useCompactLayout(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}
