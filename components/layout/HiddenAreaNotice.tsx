'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useOpenTab, useViewAreas } from '@/contexts/ViewAreasContext';
import { VIEW_AREA_BY_ID } from '@/lib/constants/viewAreas';
import { hiddenAreaAt } from '@/lib/utils/viewAreas';

/**
 * «{Area} non è nel tuo menu.» (doc/essenziale/README.md § 5.6, D-ES14): a page or a tab of an area the viewer's view
 * hides, opened from a link (a bookmark, the delete dialog, an email), opens as always, with this line under its
 * header. «Mostrala nel menu» turns THAT area on (and its head, if it depends on one): the view becomes
 * «Personalizzata». A fact, not an alarm — no amber, no close button; a secondary button (one filled button per page:
 * the page's own).
 *
 * ONE copy, rendered by `PageHeader` inside the dashboard: it reads the pathname and the open tab (the page's own,
 * published by `usePublishOpenTab`, else `?tab=`) and translates them into an area with `VIEW_ROUTES`.
 */
export function HiddenAreaNotice() {
  return (
    <Suspense fallback={null}>
      <HiddenAreaLine />
    </Suspense>
  );
}

function HiddenAreaLine() {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const publishedTab = useOpenTab(pathname);
  const { areas, showArea } = useViewAreas();
  const area = hiddenAreaAt(pathname, publishedTab ?? searchParams.get('tab'), areas);
  if (!area) return null;
  const label = VIEW_AREA_BY_ID[area].label;

  return (
    <div
      data-hidden-area={area}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-2.5"
    >
      {/* Read once when the page opens: a status, not an alert (§ 6.1). */}
      <p role="status" className="text-[13px] leading-[1.45] text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span> non è nel tuo menu.
      </p>
      <Button type="button" variant="outline" size="sm" className="h-11 desktop:h-8" onClick={() => showArea(area)}>
        Mostrala nel menu
      </Button>
    </div>
  );
}
