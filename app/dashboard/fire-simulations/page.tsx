/**
 * FIRE SIMULATIONS PAGE
 *
 * Simple tab wrapper for FIRE (Financial Independence, Retire Early) tools.
 *
 * TAB STRUCTURE:
 * - FIRE Calculator: Calculate retirement readiness
 * - Coast FIRE: Measure whether current FIRE patrimonio can compound to the full target
 * - What If: Simulate life events and their impact on FIRE and Coast FIRE
 * - Monte Carlo: Probabilistic portfolio simulations
 * - Proiezione: what the portfolio may be worth in N years, and with what probability
 * - Traguardi: Goal-based investing (mental allocation of portfolio to financial goals)
 *
 * «Il mio piano» (components/fire-simulations/plan/FirePlanBlock.tsx) sits between the header and the tab bar,
 * outside the panels: the plan's ONE draft is owned here (`useFirePlanDraft`) and read by every tab over the saved
 * settings (doc/fire-ipotesi/README.md § 15). The page reads `?tab=<tab>` (the initial tab) and `?piano=aperto|<field>`
 * (opens the block, puts the focus on the field): the links of Impostazioni and of the tiles work.
 *
 * Mobile/tablet pattern (< 1440px): PageTabBar renders a centered segmented pill (icon-only
 * inactive tabs). Desktop (≥ 1440px): standard TabsList with icons.
 *
 * Only the Calcolatore — the tab the page opens on — and the Proiezione are in the page's initial JavaScript; the
 * other four are a chunk each, fetched once the page is idle or when their tab is opened, whichever
 * comes first (2026-09-30). Only the active panel mounts either way (Radix `TabsContent`),
 * so what the lazy tabs save is their CODE on the page's critical path. If a tab is opened before its chunk,
 * the panel shows that tab's own `TileGridSkeleton` (`tabSkeletons.ts`), the same one it shows while its data
 * loads, so the two waits read as one.
 *
 * The container is `wide` (1920px, the tile grid's root): every tab is propagated to «Verdict
 * over Tiles» — Calcolatore, Coast FIRE, What If, Monte Carlo and, since 2026-08-26, Traguardi.
 */

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Flame, Dices, Mountain, Target, Lightbulb, TrendingUp } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import { ProjectionTab } from '@/components/fire-simulations/ProjectionTab';
import {
  COAST_TAB_SKELETON_CELLS,
  GOALS_TAB_SKELETON_CELLS,
  MONTE_CARLO_TAB_SKELETON_CELLS,
  WHAT_IF_TAB_SKELETON_CELLS,
} from '@/components/fire-simulations/tabSkeletons';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { lazyComponent, usePreloadWhenIdle } from '@/components/ui/lazy-component';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useExpensesInRange } from '@/lib/hooks/useExpenses';
import { fireWindows } from '@/lib/utils/expenseWindows';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { useSettings } from '@/lib/hooks/useSettings';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { FirePlanBlock } from '@/components/fire-simulations/plan/FirePlanBlock';
import { FirePlanContext, useFirePlanDraft } from '@/lib/hooks/useFirePlan';
import { isFireTab, isFirePlanField, type FireTabValue } from '@/lib/utils/firePlan';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import type { TabDef } from '@/components/layout/PageTabs';

// The four tabs the page does not open on, one chunk each (see the header): `lazyComponent` at module
// level (AGENTS.md § Dynamic Imports and Module Hygiene), preloaded once the page is idle, so a tab
// opened later is drawn at once — no Suspense fallback held on screen.
const CoastFireTab = lazyComponent(() => import('@/components/fire-simulations/CoastFireTab').then((m) => m.CoastFireTab));
const WhatIfAnalysisTab = lazyComponent(() => import('@/components/fire-simulations/WhatIfAnalysisTab').then((m) => m.WhatIfAnalysisTab));
const MonteCarloTab = lazyComponent(() => import('@/components/fire-simulations/MonteCarloTab').then((m) => m.MonteCarloTab));
const GoalBasedInvestingTab = lazyComponent(() => import('@/components/fire-simulations/GoalBasedInvestingTab').then((m) => m.GoalBasedInvestingTab));
const LAZY_TABS = [CoastFireTab, WhatIfAnalysisTab, MonteCarloTab, GoalBasedInvestingTab];

type TabValue = FireTabValue;

const TABS: TabDef[] = [
  { value: 'fire',       label: 'Calcolatore FIRE', icon: Flame     },
  { value: 'coast',      label: 'Coast FIRE',       icon: Mountain  },
  { value: 'whatif',     label: 'What If',          icon: Lightbulb },
  { value: 'montecarlo', label: 'Dopo il FIRE',      icon: Dices     },
  { value: 'proiezione', label: 'Proiezione',       icon: TrendingUp },
  { value: 'goals',      label: 'Traguardi',        icon: Target    },
];

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
  const tabParam = searchParams.get('tab');
  const pianoParam = searchParams.get('piano');
  const [activeTab, setActiveTab] = useState<TabValue>(isFireTab(tabParam) ? tabParam : 'fire');
  const plan = useFirePlanDraft();
  const { setOpen: setPlanOpen, focusField } = plan;
  const { ownerId } = useActiveAccount();
  // The header's «Aggiornato alle…» over the four keys the Calcolatore — the tab the
  // page opens on — paints from; the same cache entries the tabs read, no second read. The
  // expenses are the page's RECENT window (last year and this one: what every tab's number stands
  // on); the older rows behind the Calcolatore's «Dettaglio» and the goals document stay out,
  // each read only by the surface that shows it.
  const recentExpensesWindow = useMemo(() => fireWindows(new Date(), null).recent, []);
  const calculatorReads = [useSettings(ownerId), useAssets(ownerId), useExpensesInRange(ownerId, recentExpensesWindow), useSnapshots(ownerId)];
  const freshness = useFreshness(calculatorReads);
  // The lazy tabs are fetched once the Calcolatore's reads are in and the page is idle: started
  // earlier, the «idle» browser is only waiting for Firestore and the download competes with the
  // first figures.
  usePreloadWhenIdle(LAZY_TABS, calculatorReads.every((query) => query.data !== undefined));

  // RP10: a link inside the page (the URL changes, the page does not reload) acts like a first visit: `?tab=` moves to the
  // tab, `?piano=` opens the block and, with a field name, puts the focus on it. The timer is the repo's idiom against
  // set-state-in-effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isFireTab(tabParam)) setActiveTab(tabParam);
      if (pianoParam === 'aperto') setPlanOpen(true);
      else if (isFirePlanField(pianoParam)) focusField(pianoParam);
    }, 0);
    return () => clearTimeout(timer);
  }, [tabParam, pianoParam, setPlanOpen, focusField]);

  return (
    <PageContainer>
      <PageHeader
        label="Pianificazione"
        title="FIRE e Simulazioni"
        description="Libertà finanziaria e sostenibilità del piano"
        freshness={freshness}
      />

      <FirePlanContext.Provider value={plan}>
      <FirePlanBlock />

      <PageTabs
        tabs={TABS}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        layoutId="fire-tab-pill"
        ariaLabel="Sezioni di FIRE e Simulazioni"
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
            {tab.value === 'fire'       && <FireCalculatorTab onOpenCoast={() => setActiveTab('coast')} />}
            {tab.value === 'coast'      && <CoastFireTab fallback={<TileGridSkeleton cells={COAST_TAB_SKELETON_CELLS} />} />}
            {tab.value === 'whatif'     && <WhatIfAnalysisTab fallback={<TileGridSkeleton cells={WHAT_IF_TAB_SKELETON_CELLS} />} />}
            {tab.value === 'montecarlo' && <MonteCarloTab fallback={<TileGridSkeleton cells={MONTE_CARLO_TAB_SKELETON_CELLS} />} />}
            {tab.value === 'proiezione' && <ProjectionTab />}
            {tab.value === 'goals'      && <GoalBasedInvestingTab fallback={<TileGridSkeleton cells={GOALS_TAB_SKELETON_CELLS} />} />}
          </TabsContent>
        ))}
      </PageTabs>
      </FirePlanContext.Provider>
    </PageContainer>
  );
}
