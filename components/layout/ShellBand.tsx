'use client';

import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CircleUserRound } from 'lucide-react';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { ShellBandContext } from '@/components/layout/ShellBandSlots';
import { SceneLink } from '@/components/layout/SceneLink';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useViewNavGroups } from '@/lib/hooks/useViewNavGroups';
import { stripQuery } from '@/lib/utils/viewAreas';
import { cn } from '@/lib/utils';
import {
  bandPages,
  buildFolders,
  findOpenFolder,
  findOpenPage,
  folderTarget,
  rememberFolderPage,
  subscribeFolderMemory,
  type Folder,
} from '@/lib/utils/folderNav';

/**
 * The band of the shell (doc/fascia-desktop/README.md, round 2–3: D-FD14–D-FD22). From the band's widths (`band:`,
 * `BAND_QUERY`) it sits above `<main>` across the whole window and never moves: on its first floor the wordmark, the
 * five groups of `navGroups` as plain names centred, the open one with a 3px ink bar under it, the Assistente and the
 * person at the right; on its bottom edge the open group's pages as tabs, the open one in the page's ground and joined
 * to the sheet, then the page's fact and, at the right, the page's actions. The fact and the actions are the PAGE's:
 * `PageHeader` portals them into the two slots this band exposes (`useShellBandSlots`), so they keep the page's
 * state and context.
 *
 * Motion (D-FD21): the band is live DOM across navigations (they are the soft scene here, D-FD22), so its indicators
 * move at the click — the group's bar and the open tab slide with `PageTabBar`'s spring to the link just clicked
 * (`pendingHref`, before the route lands); a new group's tabs come in from the side of travel. `MotionProvider`'s
 * `reducedMotion="user"` turns the slides off; the CSS fades check `prefers-reduced-motion` themselves.
 */

const SPRING = { type: 'spring', stiffness: 400, damping: 35 } as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export function ShellBand() {
  const pathname = usePathname() ?? '';
  const context = useContext(ShellBandContext);
  const reduced = useReducedMotion();
  const showAssistant = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';
  // The view's groups (doc/essenziale/README.md § 5.4): Completa is `navGroups` whole.
  const groups = useViewNavGroups();
  const folders = useMemo(() => buildFolders(showAssistant, groups), [showAssistant, groups]);

  // The link just clicked, until its route lands: the indicators slide at the click, not 140 ms + a fetch later.
  const [pending, setPending] = useState<string | null>(null);
  const [landedOn, setLandedOn] = useState(pathname);
  if (landedOn !== pathname) {
    setLandedOn(pathname);
    setPending(null);
  }
  const shownPath = pending ?? pathname;
  // A route that never lands gives the band back (the scene's own give-up, `useSceneNavigation`).
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), 2000);
    return () => clearTimeout(timer);
  }, [pending]);

  const openFolder = findOpenFolder(folders, shownPath);
  const openPage = openFolder ? findOpenPage(openFolder, shownPath) : undefined;
  const realFolder = findOpenFolder(folders, pathname);
  const realPage = realFolder ? findOpenPage(realFolder, pathname) : undefined;

  // A folder opens on the page last read in it (D-FD11). The server's snapshot is every first page.
  const targetsKey = useSyncExternalStore(
    subscribeFolderMemory,
    () => folders.map((folder) => folderTarget(folder)).join('|'),
    () => folders.map((folder) => folder.items[0].href).join('|'),
  );
  const targets = useMemo(
    () => Object.fromEntries(targetsKey.split('|').map((href, index) => [folders[index].key, href])),
    [targetsKey, folders],
  );
  useEffect(() => {
    if (realFolder && realPage) rememberFolderPage(realFolder, realPage.href);
  }, [realFolder, realPage]);

  // The side a new group's tabs come in from: the direction of travel along the row.
  const folderIndex = openFolder ? folders.indexOf(openFolder) : -1;
  const [travel, setTravel] = useState({ index: folderIndex, direction: 1 });
  if (travel.index !== folderIndex) setTravel({ index: folderIndex, direction: folderIndex >= travel.index ? 1 : -1 });
  const direction = travel.index !== folderIndex ? (folderIndex >= travel.index ? 1 : -1) : travel.direction;

  const main = folders.filter((folder) => !isAssistant(folder));
  const assistant = folders.find(isAssistant);
  const pages = bandPages(openFolder, shownPath);
  const setSlot = context?.setSlot;
  const factRef = useCallback((el: HTMLElement | null) => setSlot?.('fact', el), [setSlot]);
  const actionsRef = useCallback((el: HTMLElement | null) => setSlot?.('actions', el), [setSlot]);
  const go = (href: string) => {
    // A page entry may carry a tab (FIRE's «Traguardi»); the band follows the page, not the query.
    const path = stripQuery(href);
    if (path !== pathname) setPending(path);
  };

  return (
    <header
      data-shell-band=""
      // While the clicked page loads, the page that is leaving takes its fact and actions out of the band.
      data-pending={pending ? '' : undefined}
      className="top-band shell-band relative z-30 hidden shrink-0 text-foreground band:block"
    >
      {/* The band's ground stays full width; its content shares the page's axis: `PageContainer` is 1920 and
          centred, and at 2560 the band's edges stood 320px outside it (UM5b N17). */}
      <div className="mx-auto w-full max-w-[1920px]">
      <div className="grid h-[60px] grid-cols-[1fr_auto_1fr] items-center px-7 max-desktop:px-5">
        <div className="min-w-0">
          <SceneLink
            href="/dashboard"
            onClick={() => go('/dashboard')}
            className="inline-flex h-11 items-center rounded-md text-[14px] font-semibold tracking-[-0.01em] whitespace-nowrap text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Portfolio Tracker
          </SceneLink>
        </div>
        <nav aria-label="Navigazione principale" data-nav="folders" className="flex items-stretch">
          {main.map((folder) => (
            <GroupLink
              key={folder.key}
              folder={folder}
              href={targets[folder.key] ?? folder.items[0].href}
              open={folder === openFolder}
              currentPage={folder === realFolder && realPage?.href === (targets[folder.key] ?? folder.items[0].href)}
              onNavigate={go}
              reduced={!!reduced}
            />
          ))}
        </nav>
        <div className="flex min-w-0 items-center justify-end gap-2">
          {assistant && (
            <GroupLink
              folder={assistant}
              href={assistant.items[0].href}
              open={assistant === openFolder}
              currentPage={assistant === realFolder}
              onNavigate={go}
              reduced={!!reduced}
            />
          )}
          <BandAccount />
        </div>
      </div>

      <div className="flex h-[50px] items-end justify-between gap-6 px-7 max-desktop:px-5">
        <div className="flex min-w-0 flex-1 items-end gap-5">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.nav
              key={openFolder?.key ?? 'none'}
              aria-label="Pagine del gruppo"
              data-band-pages=""
              className="flex shrink-0 items-end gap-7"
              custom={direction}
              initial={reduced ? false : { opacity: 0, x: 12 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.08 } }}
              transition={{ duration: reduced ? 0 : 0.22, ease: EASE_OUT_QUART }}
            >
              {pages.map((page) => (
                <PageTab
                  key={page.href}
                  href={page.href}
                  name={page.name}
                  open={page.href === (openPage?.href ?? shownPath)}
                  current={stripQuery(page.href) === pathname}
                  viewArea={page.viewArea}
                  layoutId={`band-page-${openFolder?.key ?? 'none'}`}
                  onNavigate={go}
                  reduced={!!reduced}
                />
              ))}
            </motion.nav>
          </AnimatePresence>
          <p
            ref={factRef}
            data-band-fact=""
            className="mb-[17px] min-w-0 flex-1 truncate text-[13.5px] leading-[18px] text-muted-foreground"
          />
        </div>
        <div
          ref={actionsRef}
          data-band-actions-desktop=""
          className="mb-[10px] flex shrink-0 items-center gap-2"
        />
      </div>
      </div>
    </header>
  );
}

const isAssistant = (folder: Folder) => folder.key === '/dashboard/assistant';

/** One group on the band's first floor: a plain name; the open one in full ink with a 3px ink bar under it (D-FD20). */
function GroupLink({
  folder,
  href,
  open,
  currentPage,
  onNavigate,
  reduced,
}: {
  folder: Folder;
  href: string;
  open: boolean;
  currentPage: boolean;
  onNavigate: (href: string) => void;
  reduced: boolean;
}) {
  return (
    <SceneLink
      href={href}
      onClick={() => onNavigate(href)}
      aria-current={open ? (currentPage ? 'page' : 'true') : undefined}
      data-folder={open ? 'open' : 'closed'}
      data-view-area={folder.viewArea}
      className={cn(
        'relative flex h-[60px] items-center px-3.5 text-[15px] whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        open ? 'font-semibold text-foreground' : 'font-medium text-[var(--band-ink-closed)] hover:text-foreground',
      )}
    >
      {folder.label}
      {open && (
        <motion.span
          layoutId="band-group-bar"
          aria-hidden="true"
          className="band-group-bar absolute inset-x-3.5 bottom-[9px] h-[3px] rounded-full bg-foreground"
          transition={reduced ? { duration: 0 } : SPRING}
        />
      )}
    </SceneLink>
  );
}

/**
 * One page of the open group on the band's bottom edge (D-FD14): the open one is the sheet's joint — the page's ground
 * and ink, 48px high, two 14px inverted corners — and slides to the tab just clicked (D-FD21); the others are
 * buttons on the band, 42px (44 on touch).
 */
function PageTab({
  href,
  name,
  open,
  current,
  layoutId,
  onNavigate,
  reduced,
  viewArea,
}: {
  href: string;
  name: string;
  open: boolean;
  current: boolean;
  layoutId: string;
  /** The area that hides this tab before hydration (doc/essenziale/README.md D-ES15). */
  viewArea?: string;
  onNavigate: (href: string) => void;
  reduced: boolean;
}) {
  return (
    <SceneLink
      href={href}
      onClick={() => onNavigate(href)}
      aria-current={current ? 'page' : undefined}
      data-band-page={open ? 'open' : 'closed'}
      data-view-area={viewArea}
      className={cn(
        'relative flex items-center whitespace-nowrap px-[18px] transition-[color,font-size] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        open
          ? 'h-12 text-[18px] font-semibold tracking-[-0.015em] text-[var(--page-ink)]'
          : 'band-tab-closed h-12 rounded-t-[14px] text-[16px] font-medium text-[var(--band-ink-closed)] hover:text-foreground',
      )}
    >
      {open && (
        <motion.span
          layoutId={layoutId}
          aria-hidden="true"
          className="band-page-joint absolute inset-0 bg-[var(--page-ground)]"
          // In `style`, so framer corrects the radius while the tab slides and resizes.
          style={{ borderTopLeftRadius: 14, borderTopRightRadius: 14 }}
          transition={reduced ? { duration: 0 } : SPRING}
        />
      )}
      <span className="relative">{name}</span>
    </SceneLink>
  );
}

/**
 * The person: the account menu (D-FD8), Impostazioni first. It appears with the user — the shell paints before Auth
 * answers, and a visible person is the specs' «session ready» signal (`e2e/account.ts`); until then a box of its size.
 */
function BandAccount() {
  const { user } = useAuth();
  if (!user) return <span aria-hidden="true" className="size-9 shrink-0 pointer-coarse:size-11" />;
  return (
    <AccountMenu side="bottom" align="end" identity>
      <button
        type="button"
        aria-label="Account e preferenze"
        data-account-menu=""
        data-slot="button"
        data-variant="outline"
        className={cn(buttonVariants({ variant: 'outline' }), 'size-9 shrink-0 px-0 pointer-coarse:size-11')}
      >
        <CircleUserRound className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </AccountMenu>
  );
}
