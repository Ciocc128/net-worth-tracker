'use client';

/**
 * What the five Impostazioni views share: the panel each one renders, the skeleton a lazy one draws
 * until its chunk has arrived, the control transition class, the percentage label and the «Si regola altrove» line.
 * Each view is a module-level component controlled by the page's draft (lib/utils/settingsDraft.ts):
 * it receives its slice, emits a patch, keeps no form state — Radix unmounts an inactive panel,
 * and a view holding its own fields would lose them at the first tab change.
 */

import { useViewAreas } from '@/contexts/ViewAreasContext';
import type { ViewAreaId } from '@/lib/constants/viewAreas';
import Link from 'next/link';
import { TabsContent } from '@/components/ui/tabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import { TILE_FOOTER_ACTION_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';
import type { SettingsTabId } from '@/lib/utils/settingsDraft';

export { runGuarded } from '@/lib/utils/runGuarded';

/** The `layoutId` of the page's tab pill — the panel ids derive from it. */
export const SETTINGS_TABS_LAYOUT_ID = 'settings-tab-pill';

export const INTERACTIVE_CONTROL_CLASS =
  'motion-safe:transition-[border-color,box-shadow,background-color,color] motion-safe:duration-150 motion-reduce:transition-none';

/** A percentage with only the decimals the value carries (100 → «100%», 3,5 → «3,5%»); Allocazione › Strategia's editors use it too. */
export const pctLabel = (value: number): string => formatPercentage(value, value % 1 === 0 ? 0 : 1);

interface SettingsTabPanelProps {
  tab: SettingsTabId;
  /** The panel's accessible name — the label of its tab. */
  label: string;
  children: React.ReactNode;
}

/**
 * One tab's panel: the Radix content with the page's panel id and the 12-column tile grid every
 * tab lays its tiles on. Radix names a Content after ITS trigger; the page's triggers are plain
 * buttons, so the generated reference points at nothing — the name is the label.
 */
export function SettingsTabPanel({ tab, label, children }: SettingsTabPanelProps) {
  return (
    <TabsContent
      value={tab}
      id={pageTabPanelId(SETTINGS_TABS_LAYOUT_ID, tab)}
      aria-label={label}
      aria-labelledby={undefined}
      className="mt-4"
    >
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">{children}</div>
    </TabsContent>
  );
}

/**
 * What a lazy tab draws until its chunk arrives (P6, D-RU23): the same panel, with tiles of the
 * geometry the tab will have, so nothing moves when the content replaces it.
 */
export function SettingsTabFallback({ tab, label, cells }: { tab: SettingsTabId; label: string; cells: TileSkeletonCell[] }) {
  return (
    <SettingsTabPanel tab={tab} label={label}>
      <TileGridSkeleton verdict={false} cells={cells} className="tablet:col-span-2 desktop:col-span-12" />
    </SettingsTabPanel>
  );
}

/** One pointer of the «Si regola altrove» line: what is set elsewhere, where, and the link that opens it. */
export interface ElsewhereItem {
  /** What the reader looks for («Piano FIRE (età, spesa, SWR…)»). */
  what: string;
  /** The destination, spelled out as the page's name («FIRE › Il mio piano»); it is the link's text. */
  where: string;
  href: string;
  /** The viewer's area the destination belongs to: the pointer goes when it is off (door P8, doc/essenziale § 5.5). */
  area?: ViewAreaId;
}

/**
 * «Si regola altrove» (D-RU20, DESIGN.md → The Declaration-Tile Rule): a field another surface OWNS
 * is named here with its link, never copied into a read-only tile. A line, not a tile — it has no
 * values to show. A real `<p>` with real links; each link says where it goes in full.
 */
export function ElsewhereLine({ items: allItems }: { items: ElsewhereItem[] }) {
  const { areas } = useViewAreas();
  const items = allItems.filter((item) => !item.area || areas[item.area]);
  if (items.length === 0) return null;
  return (
    <p className="flex flex-col gap-1 pt-1 text-[12px] leading-[1.5] text-muted-foreground tablet:col-span-2 desktop:col-span-12">
      <span className={cn(TILE_SUB_EYEBROW_CLASS)}>Si regola altrove</span>
      {items.map((item) => (
        <span key={item.href + item.where}>
          {item.what}:{' '}
          <Link href={item.href} aria-label={`Apri ${item.where}`} className={TILE_FOOTER_ACTION_CLASS}>
            {item.where}
          </Link>
        </span>
      ))}
    </p>
  );
}
