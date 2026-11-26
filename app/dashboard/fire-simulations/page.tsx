/**
 * FIRE PAGE
 *
 * Simple tab wrapper for FIRE (Financial Independence, Retire Early) tools. RU10 (2026-11-26, D-RU26…D-RU32;
 * doc/riordino-ui/ondata-3.md § 5.1): the page and its menu entry are «FIRE», and the six tabs of before are three that say the
 * answer first and keep the method behind one door.
 *
 * TAB STRUCTURE:
 * - Quando (`quando`): the FIRE Calculator — when the plan reaches the number
 * - E se… (`ese`): What If — life events and their impact on FIRE and Coast FIRE
 * - Approfondimenti (`approfondimenti`): a pill on the tab's axis (`?vista=`) picks Coast FIRE, Dopo il FIRE (Monte Carlo)
 *   or Proiezione (`ApprofondimentiTab`)
 *
 * The old ids (`fire`, `whatif`, `coast`, `montecarlo`, `proiezione`) stay accepted from `?tab=` (`resolveFireTab`);
 * `?tab=goals` goes to the Traguardi page (RU11), by `router.replace`, so Back returns to where the reader was.
 *
 * «Il mio piano» (components/fire-simulations/plan/FirePlanBlock.tsx) sits between the header and the tab bar,
 * outside the panels: the plan's ONE draft is owned here (`useFirePlanDraft`) and read by every tab over the saved
 * settings (doc/fire-ipotesi/README.md § 15). The page reads `?tab=<tab>` (the initial tab) and `?piano=aperto|<field>`
 * (opens the block, puts the focus on the field): the links of Impostazioni and of the tiles work. The header says
 * «Capitale X su Y di patrimonio · fuori: …» (`describeFireHeader`).
 *
 * Mobile/tablet pattern (below `desktop:`): PageTabBar renders a centered segmented pill (icon-only
 * inactive tabs). Desktop (`desktop:`): standard TabsList with icons.
 *
 * Only Quando — the tab the page opens on — is in the page's initial JavaScript (P6, D-RU32); What If, the three views
 * of Approfondimenti are a chunk each, fetched once the page is idle or when their tab is opened,
 * whichever comes first (2026-09-30). Only the active panel mounts either way (Radix `TabsContent`),
 * so what the lazy tabs save is their CODE on the page's critical path. If a tab is opened before its chunk,
 * the panel shows that tab's own `TileGridSkeleton` (`tabSkeletons.ts`), the same one it shows while its data
 * loads, so the two waits read as one.
 *
 * The container is `wide` (1920px, the tile grid's root): every tab is propagated to «Verdict
 * over Tiles».
 */

'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Flame, Layers, Lightbulb } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import { ApprofondimentiTab, APPROFONDIMENTI_LAZY } from '@/components/fire-simulations/ApprofondimentiTab';
import { WHAT_IF_TAB_SKELETON_CELLS } from '@/components/fire-simulations/tabSkeletons';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { lazyComponent, usePreloadWhenIdle } from '@/components/ui/lazy-component';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useExpenseFlows } from '@/lib/hooks/useExpenseFlows';
import { fireWindows } from '@/lib/utils/expenseWindows';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { useSettings } from '@/lib/hooks/useSettings';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { FirePlanBlock } from '@/components/fire-simulations/plan/FirePlanBlock';
import { FirePlanContext, useFirePlanDraft, useFireSettings } from '@/lib/hooks/useFirePlan';
import { useFireAssumptions } from '@/lib/hooks/useFireAssumptions';
import { calculateAssetValue } from '@/lib/services/assetService';
import { DEFAULT_INPS_RETIREMENT_AGE, resolvePensionLockState } from '@/lib/utils/pensionUnlock';
import { describeFireHeader, listFireOutside } from '@/lib/utils/fireAssumptionsNarrative';
import { GOALS_PAGE_HREF, isFirePlanField, isGoalsTabAlias, resolveFireTab, type FireTabValue, type FireVista } from '@/lib/utils/firePlan';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import type { TabDef } from '@/components/layout/PageTabs';
import { usePublishOpenTab, useViewAreas } from '@/contexts/ViewAreasContext';
import { filterTabsByArea } from '@/lib/utils/viewAreas';

// The tabs the page does not open on, one chunk each (see the header): `lazyComponent` at module
// level (AGENTS.md § Dynamic Imports and Module Hygiene), preloaded once the page is idle, so a tab
// opened later is drawn at once — no Suspense fallback held on screen. The three views of Approfondimenti are theirs
// (`APPROFONDIMENTI_LAZY`).
const WhatIfAnalysisTab = lazyComponent(() => import('@/components/fire-simulations/WhatIfAnalysisTab').then((m) => m.WhatIfAnalysisTab));
const LAZY_TABS = [WhatIfAnalysisTab, ...APPROFONDIMENTI_LAZY];

type TabValue = FireTabValue;

const TABS: TabDef[] = [
  { value: 'quando',          label: 'Quando',          icon: Flame },
  { value: 'ese',             label: 'E se…',           icon: Lightbulb },
  { value: 'approfondimenti', label: 'Approfondimenti', icon: Layers },
];

/** The last view picked in Approfondimenti in this session (try/catch: storage can be missing or refuse). */
const VISTA_SESSION_KEY = 'fire.approfondimenti.vista';

function readSessionVista(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(VISTA_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionVista(vista: FireVista): void {
  try {
    window.sessionStorage.setItem(VISTA_SESSION_KEY, vista);
  } catch {
    // The memory is a convenience: without it the next visit opens on Coast.
  }
}

export default function FireSimulationsPage() {
  // `useSearchParams` needs a Suspense boundary above it for the prerender of the shell.
  return (
    <Suspense fallback={null}>
      <FireSimulationsContent />
    </Suspense>
  );
}

function FireSimulationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = searchParams.get('tab');
  const vistaParam = searchParams.get('vista');
  const pianoParam = searchParams.get('piano');
  const [landing] = useState(() => resolveFireTab(tabParam, vistaParam, readSessionVista()));
  const [activeTab, setActiveTab] = useState<TabValue>(landing.tab);
  const [vista, setVista] = useState<FireVista>(landing.vista);
  const plan = useFirePlanDraft();
  const { setOpen: setPlanOpen, focusField } = plan;
  const { ownerId } = useActiveAccount();
  // The header's «Aggiornato alle…» over the four keys the Calcolatore — the tab the
  // page opens on — paints from; the same cache entries the tabs read, no second read. The
  // expenses are the page's RECENT window (last year and this one: what every tab's number stands
  // on); the older rows behind the Calcolatore's «Dettaglio» and the goals document stay out,
  // each read only by the surface that shows it.
  const recentExpensesWindow = useMemo(() => fireWindows(new Date(), null).recent, []);
  const calculatorReads = [
    useSettings(ownerId),
    useAssets(ownerId),
    useExpenseFlows(ownerId, { from: recentExpensesWindow.from, to: recentExpensesWindow.to }),
    useSnapshots(ownerId),
  ];
  const freshness = useFreshness(calculatorReads);
  // The lazy tabs are fetched once the Calcolatore's reads are in and the page is idle: started
  // earlier, the «idle» browser is only waiting for Firestore and the download competes with the
  // first figures.
  usePreloadWhenIdle(LAZY_TABS, calculatorReads.every((query) => query.data !== undefined));

  // RP10: a link inside the page (the URL changes, the page does not reload) acts like a first visit: `?tab=` moves to the
  // tab (an old id lands on its new place, `?vista=` on its view), `?piano=` opens the block and, with a field name, puts
  // the focus on it. The timer is the repo's idiom against set-state-in-effect.
  // RU11: the old Traguardi tab is a page of its own; `replace` keeps Back on the page the reader came from.
  const goesToGoals = isGoalsTabAlias(tabParam);
  useEffect(() => {
    if (goesToGoals) router.replace(GOALS_PAGE_HREF);
  }, [goesToGoals, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tabParam !== null && !goesToGoals) {
        const next = resolveFireTab(tabParam, vistaParam, readSessionVista());
        setActiveTab(next.tab);
        if (next.tab === 'approfondimenti') setVista(next.vista);
      }
      if (pianoParam === 'aperto') setPlanOpen(true);
      else if (isFirePlanField(pianoParam)) focusField(pianoParam);
    }, 0);
    return () => clearTimeout(timer);
  }, [tabParam, vistaParam, pianoParam, goesToGoals, setPlanOpen, focusField]);

  // Changing the view `replace`s the URL (the back button does not walk the three views) and is remembered in the session.
  const changeVista = useCallback(
    (next: FireVista) => {
      setVista(next);
      writeSessionVista(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'approfondimenti');
      params.set('vista', next);
      params.delete('piano');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // The viewer's view (doc/essenziale/README.md § 5.4): the bar keeps the tab asked for by a link; a bar left with one
  // tab is not drawn. The panels stay all mounted.
  const { areas } = useViewAreas();
  const shownTabs = filterTabsByArea('/dashboard/fire-simulations', TABS, areas, activeTab);
  usePublishOpenTab('/dashboard/fire-simulations', activeTab);

  // The redirect is on its way: draw nothing of FIRE meanwhile (the Traguardi page shows its own skeleton).
  if (goesToGoals) return null;

  return (
    <PageContainer>
      <FirePlanContext.Provider value={plan}>
      <FirePageHeader freshness={freshness} />
      <FirePlanBlock />

      <PageTabs
        tabs={shownTabs}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        layoutId="fire-tab-pill"
        ariaLabel="Sezioni di FIRE"
      >
        {TABS.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            id={pageTabPanelId('fire-tab-pill', tab.value)}
            aria-label={tab.label}
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
            className="mt-0"
          >
            {tab.value === 'quando' && (
              <FireCalculatorTab
                onOpenCoast={() => {
                  setVista('coast');
                  setActiveTab('approfondimenti');
                }}
              />
            )}
            {tab.value === 'ese' && <WhatIfAnalysisTab fallback={<TileGridSkeleton cells={WHAT_IF_TAB_SKELETON_CELLS} />} />}
            {tab.value === 'approfondimenti' && <ApprofondimentiTab vista={vista} onVistaChange={changeVista} />}
          </TabsContent>
        ))}
      </PageTabs>
      </FirePlanContext.Provider>
    </PageContainer>
  );
}

/**
 * The page's header: «FIRE» and, once the capital is read, «Capitale X su Y di patrimonio · fuori: …» (D-RU30) — the capital
 * of the hypotheses' popover (K1/EF1), read through the same `useFireAssumptions` (the plan's draft over the saved settings, the
 * pension lock the plan declares) the tabs use, so the header and the tiles never say two capitals. Inside the plan's provider.
 */
function FirePageHeader({ freshness }: { freshness: ReturnType<typeof useFreshness> }) {
  const { ownerId } = useActiveAccount();
  const { data: settings } = useFireSettings();
  const { data: assets } = useAssets(ownerId);
  const lockedState = useMemo(
    () =>
      settings?.respectPensionLockInFire && assets
        ? resolvePensionLockState(
            assets,
            { userAge: settings.userAge, pensionInpsRetirementAge: settings.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE, pensionRitaLongUnemployment: settings.pensionRitaLongUnemployment ?? false },
            new Date(),
            calculateAssetValue,
          )
        : null,
    [settings, assets],
  );
  const lockedIds = useMemo(() => new Set((lockedState?.funds ?? []).filter((info) => info.isLocked).map((info) => info.fund.id)), [lockedState]);
  const { assumptions } = useFireAssumptions(lockedIds);
  const description = useMemo(
    () =>
      assumptions?.capital
        ? describeFireHeader({ capital: assumptions.capital.total, netWorth: assumptions.capital.netWorth, outside: listFireOutside(assumptions.capital, lockedState?.totalLockedToday ?? 0) })
        : undefined,
    [assumptions, lockedState],
  );
  return <PageHeader title="FIRE" description={description} freshness={freshness} />;
}
