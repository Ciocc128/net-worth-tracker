'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTabBar, type TabDef } from './PageTabBar';

interface PageTabsProps {
  tabs: TabDef[];
  value: string;
  onValueChange: (v: string) => void;
  layoutId: string;
  /** Accessible name of the tablist, forwarded to `PageTabBar`. */
  ariaLabel?: string;
  /** Which panels are mounted, forwarded to `PageTabBar` — see its `renderedPanels`. */
  renderedPanels?: ReadonlySet<string>;
  /** Show a loading skeleton instead of the tab bar */
  loading?: boolean;
  children: React.ReactNode;
}

/**
 * The tab bar and its panels. From the FIRST change the reader makes, the panel that becomes active
 * fades in (`[data-tab-switched]` in globals.css → Tab panel, 200 ms): before it, the page's own
 * entrance (the scene, `template.tsx`) is the only motion, never two fades added up.
 */
export function PageTabs({ tabs, value, onValueChange, layoutId, ariaLabel, renderedPanels, loading, children }: PageTabsProps) {
  const [switched, setSwitched] = useState(false);
  const handleValueChange = (next: string) => {
    setSwitched(true);
    onValueChange(next);
  };
  return (
    <Tabs value={value} onValueChange={handleValueChange} className="w-full" data-tab-switched={switched ? '' : undefined}>
      {loading ? (
        // Same height as the desktop underline bar (13px label + py-2.5) so nothing jumps.
        <Skeleton className="h-10 w-full rounded-none border-b border-border/50 bg-muted/30" />
      ) : (
        <PageTabBar
          tabs={tabs}
          value={value}
          onValueChange={handleValueChange}
          layoutId={layoutId}
          ariaLabel={ariaLabel}
          renderedPanels={renderedPanels}
        />
      )}
      {children}
    </Tabs>
  );
}

export type { TabDef };
