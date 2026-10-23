'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PAGE_LEAVING_ATTRIBUTE, prefersReducedMotion, runViewTransition } from '@/lib/utils/viewTransition';
import { PILL_VISIBLE_QUERY } from '@/lib/constants/navigation';

/**
 * How long the scene waits for the next page to land before it plays anyway: a route the dev
 * server is still compiling would otherwise hold the frozen snapshot on screen. In production
 * the routes are prefetched and the pathname changes within a frame or two.
 */
const NEXT_PAGE_TIMEOUT_MS = 700;

/** The page that is left fades out in this long, then the route is pushed. Matches globals.css. */
const LEAVE_MS = 140;
/** A route that never lands gives its page back: `<main>` is never left blank for good. */
const LEAVE_GIVE_UP_MS = 2000;

/**
 * True where a navigation is the SOFT scene: where the phone's pill shows (2026-10-23). A view
 * transition paints its own snapshots over the whole document, the pill included, and a snapshot
 * has nothing behind it to blur: the glass pill went clear (Safari) or grey (Chromium) on every
 * navigation. The soft scene never leaves the live DOM, so the pill stays the real, blurred one.
 */
function isSoftScene(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(PILL_VISIBLE_QUERY).matches;
}

/**
 * A navigation between two dashboard pages as ONE scene (DESIGN.md → The Page Scene):
 * `router.push` wrapped in a view transition whose DOM update resolves when the pathname has
 * actually changed — the App Router swaps the tree asynchronously, so the promise is what tells
 * the browser "now take the new snapshot". Where the pill shows it is the soft scene instead:
 * `<main>` fades out (`data-page-leaving` on `<html>`), the route is pushed, and the next page
 * fades in through `template.tsx`; the header and verdict do not morph there. Without the API, or
 * with reduced motion, this is a plain `router.push`. The same page is never re-entered.
 */
export function useSceneNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const landed = useRef<(() => void) | null>(null);

  // The pathname changing IS the new page landing: settle the pending update, if any.
  useEffect(() => {
    landed.current?.();
    landed.current = null;
  }, [pathname]);

  return useCallback(
    (href: string) => {
      if (href === pathname) return;
      if (isSoftScene() && !prefersReducedMotion()) {
        // `template.tsx` takes the attribute off when the next page mounts: the link that started
        // this may be gone by then (the «Altro» drawer closes on the click).
        const root = document.documentElement;
        root.setAttribute(PAGE_LEAVING_ATTRIBUTE, '');
        setTimeout(() => root.removeAttribute(PAGE_LEAVING_ATTRIBUTE), LEAVE_GIVE_UP_MS);
        setTimeout(() => router.push(href), LEAVE_MS);
        return;
      }
      void runViewTransition('page', () => {
        return new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, NEXT_PAGE_TIMEOUT_MS);
          landed.current = () => {
            clearTimeout(timer);
            resolve();
          };
          router.push(href);
        });
      });
    },
    [router, pathname],
  );
}
