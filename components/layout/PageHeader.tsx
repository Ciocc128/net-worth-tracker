'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleUserRound } from 'lucide-react';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { SceneLink } from '@/components/layout/SceneLink';
import { navGroups } from '@/lib/constants/navigation';
import { isNavItemActive } from '@/lib/utils/navUtils';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PageFreshness } from '@/lib/hooks/useFreshness';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  /**
   * The page's freshness reading (`useFreshness`): «Aggiornato alle 18:42, sto rileggendo…»
   * while the figures on screen were restored from the persisted cache and the fresh read is in
   * flight, `null` otherwise. Rendered in ONE stable `role="status"` node per width that changes
   * text and empties — never a node that appears and disappears (doc/guide/dialog.md), and never
   * a line that grows: on desktop it follows the description in the same fixed-height row, on a
   * phone it takes the description's line while it lasts. So nothing under it moves when it goes.
   */
  freshness?: PageFreshness;
  className?: string;
}

/** The live region's attributes, the same on both copies (see `freshness` above). */
const FRESHNESS_LIVE_PROPS = { role: 'status', 'aria-live': 'polite', 'aria-atomic': true, 'data-freshness': '' } as const;

/** How long «sto rileggendo…» takes to fade once the fresh read has landed (doc/animazioni/README.md § 5.7). */
const FRESHNESS_FADE_MS = 200;
const FRESHNESS_FADE_CLASS = 'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out';

/**
 * The sentence on screen: the freshness reading, and for `FRESHNESS_FADE_MS` after it goes the
 * last one, fading (`leaving`) — the fresh figure glides in the meantime (`OverviewAnimatedCurrency`).
 * The live region keeps the same text while it fades, so nothing extra is announced; it empties after.
 * Reduced motion: the sentence goes at once.
 */
function useFadingSentence(sentence: string | null): { text: string | null; leaving: boolean } {
  const [state, setState] = useState<{ sentence: string | null; text: string | null; leaving: boolean }>({ sentence, text: sentence, leaving: false });
  if (state.sentence !== sentence) {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fade = sentence === null && state.text !== null && !reduced;
    setState({ sentence, text: fade ? state.text : sentence, leaving: fade });
  }
  // The fade's own timer, in its own effect (AGENTS.md § Motion, auto-dismiss).
  const { leaving } = state;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setState((previous) => (previous.leaving ? { ...previous, text: null, leaving: false } : previous)), FRESHNESS_FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return { text: state.text, leaving: state.leaving };
}

/**
 * The compact page header (the default since the shell redesign, the only one since the last
 * propagation): on `desktop:` ONE line — title · description, actions on the right
 * — because on a redesigned page the real headline is the verdict in the content. It draws
 * no separator: when a tab bar follows, its underline is the separation. The sidebar already names the section, so there is no eyebrow. The mobile sticky
 * navbar is one block, and its title is what the user anchors to while scrolling.
 */
/** The scroll, in px, over which the band's rounded corners flatten (= their radius, `.top-band` in globals.css). */
const TOP_BAND_FLATTEN_PX = 24;

/**
 * Writes `--band-progress` (0 at the top of the page, 1 once it has scrolled by the corners' radius) on
 * the header, straight on its style: a scroll-linked value, so no React state and no re-render per frame.
 * The scroller is the shell's `<main id="page-main">`; a page outside the shell (the landing) has none and
 * keeps 0, the rounded corners at rest.
 */
function useTopBandProgress(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const header = ref.current;
    const scroller = document.getElementById('page-main');
    if (!header || !scroller) return;
    let frame = 0;
    const write = () => {
      frame = 0;
      const progress = Math.min(1, Math.max(0, scroller.scrollTop / TOP_BAND_FLATTEN_PX));
      header.style.setProperty('--band-progress', String(progress));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(write); };
    write();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/**
 * Where the shortcut stays out: Impostazioni itself, and the Assistente, whose four own buttons (with its
 * own preferences) already fill the bar and left the conversation's title a few letters (owner 2026-11-06).
 */
const SHORTCUT_EXCLUDED = ['/dashboard/settings', '/dashboard/assistant'];

/**
 * The band's shortcut to Impostazioni, as Nubank's avatar: a person, not a gear, because a page's own gear
 * (Cashflow's «Impostazioni Spese») already sits in the same bar. On every dashboard page but those in
 * `SHORTCUT_EXCLUDED`, never on the landing.
 */
function SettingsShortcut() {
  const pathname = usePathname() ?? '';
  if (!pathname.startsWith('/dashboard') || SHORTCUT_EXCLUDED.some((path) => pathname.startsWith(path))) return null;
  return (
    <Link
      href="/dashboard/settings"
      aria-label="Impostazioni"
      data-top-band-settings=""
      data-slot="button"
      data-variant="outline"
      className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-11 px-0')}
    >
      <CircleUserRound className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}

/**
 * The band's title line on `desktop:` (D-FD4): the pages of the open page's group as one line of titles, the
 * open page in full ink (the page's own `title`, the page's `h1`), the others attenuated, each a link. A page
 * outside the groups (Impostazioni, the Assistente) shows its title alone. The riordino's groups (`navGroups`)
 * are the ONE source.
 */
function BandTitles({ title, pathname }: { title: React.ReactNode; pathname: string }) {
  const group = navGroups.find((g) => g.items.some((item) => isNavItemActive(item.href, pathname)));
  const titleClass = 'text-2xl font-semibold leading-tight tracking-[-0.02em]';
  if (!group || group.items.length < 2) {
    return <h1 className={cn(titleClass, 'truncate text-foreground')}>{title}</h1>;
  }
  return (
    <nav aria-label="Pagine del gruppo" className="flex min-w-0 flex-wrap items-baseline gap-x-3.5">
      {group.items.map((item) =>
        isNavItemActive(item.href, pathname) ? (
          <h1 key={item.href} className={cn(titleClass, 'text-foreground')}>{title}</h1>
        ) : (
          <SceneLink
            key={item.href}
            href={item.href}
            className={cn(titleClass, 'rounded-sm text-[color-mix(in_oklab,var(--foreground)_72%,transparent)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
          >
            {item.name}
          </SceneLink>
        ),
      )}
    </nav>
  );
}

/** The person in the band: the account menu (D-FD8), Impostazioni first; the gear stays the page's own. */
function BandAccount() {
  return (
    <AccountMenu side="bottom" align="end" identity>
      <button
        type="button"
        aria-label="Account e preferenze"
        data-account-menu=""
        data-slot="button"
        data-variant="outline"
        className={cn(buttonVariants({ variant: 'outline' }), 'size-9 px-0 tablet-landscape:size-11')}
      >
        <CircleUserRound className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </AccountMenu>
  );
}

export function PageHeader({ title, description, actions, freshness, className }: PageHeaderProps) {
  const { text: freshnessSentence, leaving } = useFadingSentence(freshness?.sentence ?? null);
  const fadeClass = cn(FRESHNESS_FADE_CLASS, leaving && 'opacity-0');
  const headerRef = useRef<HTMLDivElement>(null);
  useTopBandProgress(headerRef);
  const pathname = usePathname() ?? '';
  // The band of the shell's desktop is the dashboard's; the landing keeps its compact row.
  const inShell = pathname.startsWith('/dashboard');

  return (
    // `page-header`: the page scene morphs this line into the next page's (globals.css → Page scene).
    // The STICKY box is this wrapper, not the navbar inside it: `position: sticky` travels only
    // within its containing block, and the navbar's was this div — exactly as tall as the
    // navbar, so it never stuck and «Salva» scrolled away on every page (measured on
    // Impostazioni, 2026-09-22). The wrapper's containing block is the page, so it stays for
    // the whole scroll. `-top-4` cancels `<main>`'s 16px padding below `desktop:`: a sticky
    // offset is measured from the scroller's content edge, and at `top-0` the rows scrolling
    // past would show through a 16px strip above the bar.
    <div
      ref={headerRef}
      data-page-header=""
      className={cn(
        inShell
          // Sticky on the phone and at `desktop:`; static on a tablet in landscape, where the stage's own sticky
          // column measures its fold from the page's top (`stageCustomProperties`) and the band scrolls with the page.
          ? 'sticky -top-4 z-20 desktop:-top-5 tablet-landscape:static'
          : 'max-desktop:sticky max-desktop:-top-4 max-desktop:z-20 tablet-landscape:static',
        className,
      )}
      style={{ viewTransitionName: 'page-header' }}
    >
      {/* Mobile navbar — title + description in one block so the header feels like a unified
          navbar. Its background is OPAQUE: it covers the rows scrolling underneath, and a 95%
          fill with a blur let their words ghost through behind the title. */}
      {/* `top-band` (globals.css → The top band): in Lime Frost and Graphite the bar is a band in the
          net-worth colour that reaches the top of the screen (`-mt-4 pt-5` covers `<main>`'s padding),
          the page under it starts as a sheet with rounded corners, and the corners flatten as the page
          scrolls (`--band-progress`). Every other theme paints it as before. */}
      <div className="top-band -mx-4 -mt-4 px-4 pt-5 pb-2 flex flex-col bg-background desktop:hidden tablet-landscape:hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-[16px] font-semibold tracking-tight truncate min-w-0">{title}</h1>
          {/* `data-band-actions`: every button here takes the band's ONE shape (globals.css → The band's buttons). */}
          <div data-band-actions="" className="flex shrink-0 items-center gap-2 ml-2">
            {actions}
            <SettingsShortcut />
          </div>
        </div>
        {(description || freshness) && (
          // With a freshness reading the line is reserved even on a page with no description, so
          // the sentence never adds a line under the title; the description yields to it and returns.
          <p className={cn('text-sm text-muted-foreground leading-tight truncate', freshness && 'min-h-[1.25em]')}>
            {freshness && <span {...FRESHNESS_LIVE_PROPS} className={fadeClass}>{freshnessSentence ?? ''}</span>}
            {!freshnessSentence && description}
          </p>
        )}
      </div>

      {inShell ? (
        // The desktop band (doc/fascia-desktop/README.md, D-FD3): full width under the folder row, in the colour
        // of the open folder, carrying the group's titles, the page's fact and its actions as the phone's does.
        // `top-band-wide`: no iOS outset, the 24px corners are the phone's (`--band-progress`).
        <div className="top-band top-band-wide -mx-5 -mt-5 hidden min-h-[85px] items-start justify-between gap-x-6 gap-y-2 bg-background px-7 pt-4 pb-[18px] desktop:flex tablet-landscape:-mx-4 tablet-landscape:-mt-4 tablet-landscape:flex tablet-landscape:px-6">
          <div className="min-w-0">
            <BandTitles title={title} pathname={pathname} />
            <p className="mt-1 min-h-[18px] text-[13.5px] leading-[18px] text-muted-foreground">
              {description}
              {freshness && (
                <span {...FRESHNESS_LIVE_PROPS} className={fadeClass}>
                  {freshnessSentence ? `${description ? ' · ' : ''}${freshnessSentence}` : ''}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <BandAccount />
          </div>
        </div>
      ) : (
      <div className="hidden desktop:flex tablet-landscape:flex items-center justify-between gap-4 min-h-9">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-sm text-muted-foreground truncate">
            <span className="font-medium text-foreground">{title}</span>
            {description && <span> · {description}</span>}
          </h1>
          {freshness && (
            <p {...FRESHNESS_LIVE_PROPS} className={cn('shrink-0 text-sm text-muted-foreground', fadeClass)}>
              {freshnessSentence ? `· ${freshnessSentence}` : ''}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      )}
    </div>
  );
}

/**
 * The compact header's silhouette, for the auth wait of the dashboard layout: the same
 * two boxes at the same heights — the phone navbar's paddings, its title row at the 36px an action
 * button gives it, its description line; the desktop row's `min-h-9` — and no words, because the
 * words are the page's and arrive with it. Measured on 2026-09-28 before it existed: when the page
 * mounted, the tile grid moved down 56px at 1440 and 65px at 390. It carries no `page-header`
 * view-transition name (that belongs to the header replacing it) and no heading: `main h1` still
 * means «the page has mounted» (`e2e/shellBoot.ts`, `scripts/perfBenchmark.mjs`).
 */
export function PageHeaderSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="-mx-4 px-4 pt-1 pb-2 flex flex-col desktop:hidden tablet-landscape:hidden">
        <div className="flex min-h-9 items-center">
          <Skeleton className="h-[15px] w-36" />
        </div>
        {/* An inline block inside the line: the box takes the description's own line height. */}
        <div className="text-sm leading-tight">
          <Skeleton className="inline-block h-3 w-52 align-middle" />
        </div>
      </div>
      {/* The desktop band's silhouette (D-FD3): the band in its colour, 85px, the title and the fact line. */}
      <div className="top-band top-band-wide -mx-5 -mt-5 hidden min-h-[85px] flex-col gap-2.5 bg-background px-7 pt-4 pb-[18px] desktop:flex tablet-landscape:-mx-4 tablet-landscape:-mt-4 tablet-landscape:flex tablet-landscape:px-6">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-[13px] w-56" />
      </div>
    </div>
  );
}
