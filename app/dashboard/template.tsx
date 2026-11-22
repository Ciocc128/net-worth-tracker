'use client';

/**
 * PAGE TRANSITION WRAPPER
 *
 * template.tsx re-mounts on every navigation (unlike layout.tsx which persists).
 * This guarantees Framer Motion treats the mount as truly new — so initial="hidden"
 * is always applied before the first browser paint, preventing the 1-frame flash
 * of visible content that occurs when React Query returns cached data immediately.
 *
 * Why not layout.tsx + AnimatePresence: Next.js App Router wraps navigations in
 * startTransition (React 18 concurrent), which can cause AnimatePresence to inherit
 * the previous variant context ("visible") and skip initial="hidden" on the new child.
 *
 * Since 2026-09-12 a click on the shell's links runs the navigation as a page SCENE — a
 * native view transition (`useSceneNavigation`, globals.css → Page scene). While one is in
 * flight `<html data-vt="page">` is set and this fade stands down: two fades on one page
 * would compound (t²). It stays the transition for everything else — a browser without the
 * API, a `router.push` from a page, the back button.
 */

import { useEffect, useLayoutEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { pageVariants } from '@/lib/utils/motionVariants';
import { PAGE_ENTERING_ATTRIBUTE, PAGE_LEAVING_ATTRIBUTE, VIEW_TRANSITION_ATTRIBUTE } from '@/lib/utils/viewTransition';

/** True when this mount is the landing of a page scene: the view transition is the entrance. */
function isInsidePageScene(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute(VIEW_TRANSITION_ATTRIBUTE) === 'page';
}

/** True when this mount is the landing of a soft scene: the stylesheet, not this wrapper, is the entrance. */
function isSoftSceneLanding(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(PAGE_LEAVING_ATTRIBUTE);
}

/** The soft entrance's 320 ms (globals.css → Soft scene) plus a frame of slack. */
const SOFT_ENTRANCE_MS = 360;

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  // Read once, on the render that mounts the page: the attribute is gone by the time it lands.
  const [sceneEntrance] = useState(isInsidePageScene);
  // The landing of a soft scene (the phone): the previous page faded out under `data-page-leaving`, still set.
  const [softEntrance] = useState(isSoftSceneLanding);
  // The soft scene (the phone, `useSceneNavigation`) faded `<main>` out: this mount is the next
  // page landing, so give `<main>` back — the fade below is the entrance.
  useEffect(() => {
    document.documentElement.removeAttribute(PAGE_LEAVING_ATTRIBUTE);
  }, []);
  // The soft scene's landing (UM2): the stylesheet fades in every subtree but the band, so the band never
  // blinks. Set before the first paint (a layout effect), taken off once the 320 ms entrance is over.
  useLayoutEffect(() => {
    if (!softEntrance) return;
    const root = document.documentElement;
    root.setAttribute(PAGE_ENTERING_ATTRIBUTE, '');
    const timer = setTimeout(() => root.removeAttribute(PAGE_ENTERING_ATTRIBUTE), SOFT_ENTRANCE_MS);
    return () => {
      clearTimeout(timer);
      root.removeAttribute(PAGE_ENTERING_ATTRIBUTE);
    };
  }, [softEntrance]);

  if (sceneEntrance || softEntrance) return <>{children}</>;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      // Belt-and-suspenders: CSS opacity:0 + translateY covers the single frame
      // before Framer Motion's useLayoutEffect runs on very slow JS threads.
      // Omitted when reduced motion is preferred — the root MotionProvider's
      // `MotionConfig reducedMotion="user"` (the ONE in the app since 2026-09-29) already
      // skips durations, so this inline style would cause a one-frame invisible flash
      // without any animation payoff for reduced-motion users.
      // Values must match pageVariants.hidden exactly when applied.
      style={!prefersReducedMotion ? { opacity: 0, transform: 'translateY(4px)' } : undefined}
    >
      {children}
    </motion.div>
  );
}
