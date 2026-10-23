'use client';

import { SceneLink } from '@/components/layout/SceneLink';
import { usePathname, useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Suspense, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { SecondaryMenuDrawer } from './SecondaryMenuDrawer';
import { isAddExpenseFabShown, isNavItemActive } from '@/lib/utils/navUtils';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { PILL_VISIBLE_QUERY, primaryNav, secondaryHrefs } from '@/lib/constants/navigation';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

const ACTIVE_PILL_LAYOUT_ID = 'bottom-nav-active-pill';

const BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 12px)';
/**
 * The pill is never inside a view transition (2026-10-23): where it shows, a navigation is the soft
 * scene (`useSceneNavigation`), so it stays live, glass and all, while the page changes under it. A
 * named region of a view transition is a backdrop root and its snapshot is painted alone, so in
 * the old scene the glass had nothing to blur (clear on Safari, a grey box on Chromium) however it
 * was named. `data-bottom-nav` is the container's handle for the specs.
 */
const PILL_CONTAINER_STYLE = { bottom: BOTTOM };

/**
 * The «+» rises out of the pill (from its edge, below, small) and settles with a spring, its glyph
 * turning a quarter in; it sinks back quicker, a plain ease-in, so leaving the tab never waits on it.
 * Under reduced motion it only fades.
 */
const FAB_MOTION = {
  initial: { opacity: 0, y: 20, scale: 0.5 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 520, damping: 30 } },
  exit: { opacity: 0, y: 16, scale: 0.6, transition: { duration: 0.16, ease: 'easeIn' as const } },
};
const FAB_MOTION_REDUCED = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/**
 * The «+» that adds an expense. It belongs to Cashflow › Tracciamento and nowhere else, and
 * not to the demo (`isAddExpenseFabShown`, the ONE rule — since 2026-10-12 the demo clause: the
 * shell renders before Firebase Auth resolves, so the FAB can appear for a frame and leave once
 * the demo uid is known). The tab is the URL's `?tab=` (the Cashflow page canonicalises it on
 * mount), absent = Tracciamento.
 *
 * It floats ABOVE the pill at the right edge, never beside it (2026-10-23): a tab bar navigates and
 * holds no actions, and its row never changes from page to page (Apple HIG → Tab bars). Beside it,
 * the centred group pill + «+» pushed the pill off centre on Tracciamento alone. Its shadow, like
 * the pill's (`.nav-glass`), is a close layer plus a wide one, so it lifts off the page under it.
 */
function AddExpenseFab({ pathname, drawerOpen }: { pathname: string; drawerOpen: boolean }) {
  const searchParams = useSearchParams();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();
  // «Altro» open: the «+» sinks into the pill before the sheet rises over it, and comes back when
  // the sheet closes on Tracciamento (under the backdrop it read as a dimmed, dead button).
  const shown = !drawerOpen && isAddExpenseFabShown({ pathname, tab: searchParams.get('tab'), isDemo });
  const motionProps = prefersReducedMotion ? FAB_MOTION_REDUCED : FAB_MOTION;

  return (
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button"
          aria-label="Aggiungi nuova voce"
          {...motionProps}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
          onClick={() => window.dispatchEvent(new CustomEvent('cashflow:add-expense'))}
          className="absolute bottom-full right-4 mb-3 flex size-14 origin-bottom items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_6px_rgb(0_0_0/0.18),0_10px_15px_-3px_rgb(0_0_0/0.45)]"
        >
          <motion.span
            className="flex"
            initial={prefersReducedMotion ? false : { rotate: -90 }}
            animate={{ rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.06 }}
          >
            <Plus className="size-5" aria-hidden="true" />
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function BottomNavigation() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Framer Motion's hook reads prefers-reduced-motion from the OS.
  const prefersReducedMotion = useReducedMotion();
  // The nav stays mounted everywhere (it is in the prerendered shell, hidden by CSS), but its
  // layout animations run only where it is visible: a `layout` or `layoutId` element is MEASURED
  // at every update even under `display: none`, so at 1440 each pathname change paid for a pill
  // nobody sees (2026-10-08). `false` on the server and during hydration — no layout animation in the
  // first frame — then the real value.
  const isPillVisible = useMediaQuery(PILL_VISIBLE_QUERY);
  const activePillLayoutId = isPillVisible ? ACTIVE_PILL_LAYOUT_ID : undefined;

  const isAltroActive = secondaryHrefs.some(
    (href) => pathname === href || pathname.startsWith(href + '/')
  );
  // Zero-duration transition disables the sliding-pill animation for users
  // who have requested reduced motion at the OS level.
  const pillTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 400, damping: 35 };

  return (
    <>
      {/* Full-width fixed container: the pill alone is centred, the «+» floats above it.
          aria-label on motion.nav distinguishes this landmark from the
          desktop sidebar <nav> when a screen reader lists nav regions. */}
      <div
        className="fixed z-30 left-0 right-0 desktop:hidden max-desktop:portrait:flex max-desktop:landscape:hidden items-center justify-center"
        style={PILL_CONTAINER_STYLE}
        data-bottom-nav=""
      >
        {/* Nav pill — the same box on every page. Remounted when the gate flips: Framer sets up
            its layout measuring when the element MOUNTS, so a `layoutId` turned on afterwards (the
            media query answers `true` only after hydration) would not animate the active pill. */}
        <motion.nav
          key={isPillVisible ? 'pill-animated' : 'pill-static'}
          aria-label="Navigazione principale"
          // The landscape icon rail is the same landmark (`TabletRail`, 2026-10-16, never visible with
          // the pill): the census and the specs that mean THE PILL select this attribute.
          data-nav="pill"
          // Frosted glass over the page that scrolls under it (`.nav-glass` in globals.css).
          className="nav-glass flex rounded-full"
        >
          <div className="flex items-center gap-1 px-2 py-1.5">
            {primaryNav.map((item) => {
              const isActive = isNavItemActive(item.href, pathname);
              return (
                <SceneLink
                  key={item.name}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
                    isActive
                      ? 'text-sidebar-foreground'
                      : 'text-sidebar-foreground/55 hover:text-sidebar-foreground'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId={activePillLayoutId}
                      className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                      transition={pillTransition}
                    />
                  )}
                  <item.icon className="relative z-10 h-5 w-5" aria-hidden="true" />
                  <span className="relative z-10 text-[11px] font-medium leading-none">{item.name}</span>
                </SceneLink>
              );
            })}

            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-current={isAltroActive ? 'page' : undefined}
              onClick={() => setDrawerOpen(true)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
                isAltroActive
                  ? 'text-sidebar-foreground'
                  : 'text-sidebar-foreground/55 hover:text-sidebar-foreground'
              )}
            >
              {isAltroActive && (
                <motion.div
                  layoutId={activePillLayoutId}
                  className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                  transition={pillTransition}
                />
              )}
              <MoreHorizontal className="relative z-10 h-5 w-5" aria-hidden="true" />
              <span className="relative z-10 text-[11px] font-medium leading-none">Altro</span>
            </button>
          </div>
        </motion.nav>

        {/* Add expense button — the Tracciamento tab only. Its own component because
            `useSearchParams` wants a Suspense boundary in a layout. */}
        <Suspense fallback={null}>
          <AddExpenseFab pathname={pathname} drawerOpen={drawerOpen} />
        </Suspense>
      </div>

      <SecondaryMenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
