'use client';

import { Fragment } from 'react';
import { SceneLink } from '@/components/layout/SceneLink';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { SIDEBAR_AVATAR_CLASS } from '@/components/layout/shellStyles';
import { cn } from '@/lib/utils';
import { isNavItemActive } from '@/lib/utils/navUtils';
import { getAccountLabel, getDisplayInfo } from '@/lib/utils/userDisplayUtils';
import { assistantNavItem } from '@/lib/constants/navigation';
import { useViewNavGroups } from '@/lib/hooks/useViewNavGroups';
import type { ViewNavItem } from '@/lib/utils/viewAreas';
import { ChevronsUpDown } from 'lucide-react';

function NavItems({ items }: { items: ViewNavItem[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = isNavItemActive(item.href, pathname);
        return (
          <SidebarMenuItem key={item.name} data-view-area={item.viewArea}>
            {isActive && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-md bg-sidebar-accent"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={item.name}
              className="relative z-10 data-[active=true]:bg-transparent"
            >
              {/* aria-current="page" is on the <a> so screen readers announce the active route */}
              <SceneLink href={item.href} onClick={handleClick} aria-current={isActive ? 'page' : undefined}>
                <item.icon />
                <span>{item.name}</span>
              </SceneLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/**
 * The sidebar, now only the Sheet of a phone turned sideways (from `desktop:` and on a tablet in landscape the
 * navigation is the shell's band, `ShellBand`). Chrome is kept to what
 * separates: a wordmark, three groups of routes with the tiles' eyebrow as group label, one
 * hairline before the assistant, the account at the bottom. The active route is the only
 * highlighted surface and it is `--sidebar-accent` — no hue in the navigation of the default
 * theme (DESIGN.md → The Zero-Chroma Rule). Collapsed to the icon rail every target is 44px.
 */
export function AppSidebar() {
  const { user } = useAuth();
  const { ownerId, accessibleAccounts, isSharedView } = useActiveAccount();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const { displayName, initials } = getDisplayInfo(user);
  const activeAccount = accessibleAccounts.find((a) => a.ownerId === ownerId);

  const showAssistant = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';
  // The view's groups (doc/essenziale/README.md § 5.4): Completa is `navGroups` whole.
  const navGroups = useViewNavGroups();

  // From `desktop:` and on a tablet in landscape the navigation is the shell's band (`ShellBand`, D-FD16):
  // this sidebar is now only the Sheet of a phone turned sideways.
  if (!isMobile) return null;

  return (
    <>
      <Sidebar collapsible="icon">
        {/*
          Header — visible in both desktop and Sheet (tablet landscape / mobile).
          Collapse toggle is desktop-only (hidden desktop:flex); in the icon rail it is the
          only thing left and grows to the rail's 44px target.
          The wordmark hides only in desktop icon-collapsed mode via group CSS selector.
        */}
        <SidebarHeader>
          <div className="flex items-center gap-1">
            <SceneLink
              href="/dashboard"
              onClick={closeMobile}
              className="flex h-8 flex-1 min-w-0 items-center rounded-md px-2 text-[13px] font-semibold tracking-[-0.01em] hover:bg-sidebar-accent transition-colors group-data-[state=collapsed]:hidden"
            >
              <span className="truncate">Portfolio Tracker</span>
            </SceneLink>
          </div>
        </SidebarHeader>

        {/*
          role="navigation" + aria-label turns this <div> into a nav landmark.
          SidebarContent is a plain div in the shadcn primitive; spreading these
          props is the cleanest way to add semantics without modifying the primitive
          or introducing an extra DOM wrapper that would break the flex layout.
        */}
        <SidebarContent role="navigation" aria-label="Navigazione principale">
          {/* Groups by object (navGroups, RU1): a loose route has no label, a group wears the tiles' eyebrow. */}
          {navGroups.map((group, index) => (
            <Fragment key={group.label ?? group.items[0].href}>
              {index === 1 && <div className="mx-3 border-t border-sidebar-border" />}
              <SidebarGroup>
                {group.label && (
                  <SidebarGroupLabel className={cn(TILE_EYEBROW_CLASS, 'h-6 text-sidebar-foreground/60')}>{group.label}</SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <NavItems items={group.items} />
                </SidebarGroupContent>
              </SidebarGroup>
            </Fragment>
          ))}

          {/* The assistant is a route like the others: a row after a hairline, no banner. */}
          {showAssistant && (
            <>
              <div className="mx-3 border-t border-sidebar-border" />
              <SidebarGroup>
                <SidebarGroupContent>
                  <NavItems items={[assistantNavItem]} />
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        {/* Footer — in icon mode the button becomes a 44px square around the avatar */}
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <AccountMenu side="top" align="end" onNavigate={closeMobile}>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={displayName}
                    // While the user is unknown the button has no text of its own: name the wait.
                    aria-label={user ? undefined : "Account, in attesa dell'accesso"}
                    className="h-11 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    {user ? (
                      <>
                        <span className={SIDEBAR_AVATAR_CLASS} aria-hidden="true">{initials}</span>
                        <div className="grid flex-1 overflow-hidden text-left leading-tight">
                          <span className="truncate text-[13px] font-medium text-sidebar-foreground">{displayName}</span>
                          {/* When viewing a shared account, surface WHOSE data is active
                              instead of the viewer's own email — otherwise the account
                              being edited is invisible. */}
                          {isSharedView && activeAccount ? (
                            <span className="truncate text-[11px] text-primary">
                              Vedi: {getAccountLabel(activeAccount)}
                            </span>
                          ) : (
                            /* text-sidebar-foreground/50: footer sits on --sidebar, not --background */
                            <span className="truncate text-[11px] text-sidebar-foreground/50">{user.email}</span>
                          )}
                        </div>
                      </>
                    ) : (
                      // The auth wait, in the shell: the sidebar is in the prerendered HTML (since 2026-09-28)
                      // and the profile is the one thing on it that depends on the user. The avatar's
                      // square and two lines at the text's own size; the button is 44px tall either
                      // way, so the name lands with no layout shift (`Skeleton` is `aria-hidden`).
                      <>
                        <Skeleton className="size-7 shrink-0 rounded-md" />
                        <div className="grid flex-1 gap-1.5 overflow-hidden">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-2.5 w-32" />
                        </div>
                      </>
                    )}
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/50" />
                  </SidebarMenuButton>
              </AccountMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

    </>
  );
}
