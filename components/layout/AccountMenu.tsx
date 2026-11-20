'use client';

import { SceneLink } from '@/components/layout/SceneLink';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { LogoutDialog } from '@/components/layout/LogoutDialog';
import { ThemePicker } from '@/components/layout/ThemePicker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/lib/hooks/useLogout';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountLabel, getDisplayInfo } from '@/lib/utils/userDisplayUtils';
import { Settings, LogOut, Check, Users } from 'lucide-react';

interface AccountMenuProps {
  /** The trigger: ONE element, it receives the menu's `asChild` props. */
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /** The person's name and email at the top of the menu (the band's: no footer carries them there). */
  identity?: boolean;
  /** Called when a link inside the menu is chosen (the phone's sheet closes itself). */
  onNavigate?: () => void;
}

/**
 * The account menu, ONE copy for both places that open it: the sidebar's footer (the phone's sheet) and the
 * person in the desktop band (D-FD8): the account switcher when the viewer reaches more than one account,
 * Impostazioni first, the theme, «Esci» behind its confirm.
 */
export function AccountMenu({ children, side = 'bottom', align = 'end', identity = false, onNavigate }: AccountMenuProps) {
  const { user } = useAuth();
  const { displayName } = getDisplayInfo(user);
  const { ownerId, accessibleAccounts, switchAccount } = useActiveAccount();
  const { confirmLogout, setConfirmLogout, handleSignOut } = useLogout();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent side={side} align={align} className="w-56">
          {identity && user && (
            <>
              <div data-account-identity="" className="grid px-2 py-1.5 leading-tight">
                <span className="truncate text-[13px] font-medium">{displayName}</span>
                <span className="truncate text-[11px] text-muted-foreground">{user.email}</span>
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          {/* Account switcher — only when the viewer can reach >1 account */}
          {accessibleAccounts.length > 1 && (
            <>
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                Account
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                {accessibleAccounts.map((account) => (
                  <DropdownMenuItem
                    key={account.ownerId}
                    onSelect={() => switchAccount(account.ownerId)}
                  >
                    <Users className="size-4" />
                    <span className="flex-1 truncate">{getAccountLabel(account)}</span>
                    {account.ownerId === ownerId && (
                      <Check className="ml-auto size-4 shrink-0 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <SceneLink href="/dashboard/settings" onClick={onNavigate}>
                <Settings className="size-4" />
                Impostazioni
              </SceneLink>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Preferenze
          </DropdownMenuLabel>
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm">Tema</span>
            <ThemePicker />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmLogout(true)}>
            <LogOut className="size-4" />
            Esci
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LogoutDialog open={confirmLogout} onOpenChange={setConfirmLogout} onConfirm={handleSignOut} />
    </>
  );
}
