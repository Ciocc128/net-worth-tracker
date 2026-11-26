'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import type { AssetAllocationSettings } from '@/types/assets';
import { usePathname } from 'next/navigation';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useViewAreas } from '@/contexts/ViewAreasContext';
import { useSettings } from '@/lib/hooks/useSettings';
import { countMenuEntries, describeViewChange, resolveNavGroups, type ViewAreas, type ViewNavGroup } from '@/lib/utils/viewAreas';

/**
 * The menu's groups for the viewer's view (doc/essenziale/README.md § 5.4) — what Sidebar, the «Altro» sheet and the
 * shell's band draw. The account's goals switch (it names the «Traguardi» entry, RU11) comes from the settings the shell
 * and every page already read through the same key.
 */
export function useViewNavGroups(): ViewNavGroup[] {
  const pathname = usePathname() ?? '';
  const { areas } = useViewAreas();
  const { ownerId } = useActiveAccount();
  const { data: settings } = useSettings(ownerId);
  const goalsEnabled = settings?.goalBasedInvestingEnabled === true;
  return useMemo(() => resolveNavGroups(areas, { goalsEnabled }, pathname), [areas, goalsEnabled, pathname]);
}

/**
 * The polite announcement of a change of view (§ 6.1): «Vista Essenziale: 8 voci nel menu», counted on the menu the
 * new areas lead to. Changing view never moves the focus; this sentence is what says it happened.
 */
export function useViewChangeAnnouncer() {
  const { announce } = useViewAreas();
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();
  const showAssistant = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';
  return (areas: ViewAreas, label: string) => {
    // From the cache only: the account menu is in the shell, and the shell reads nothing new for this sentence.
    const settings = ownerId ? queryClient.getQueryData<AssetAllocationSettings | null>(queryKeys.settings.all(ownerId)) : undefined;
    const groups = resolveNavGroups(areas, { goalsEnabled: settings?.goalBasedInvestingEnabled === true });
    announce(describeViewChange(label, countMenuEntries(groups, showAssistant)));
  };
}
