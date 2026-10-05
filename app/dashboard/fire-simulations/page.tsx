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
 * - Obiettivi: Goal-based investing (mental allocation of portfolio to financial goals)
 *
 * «Il mio piano» (components/fire-simulations/plan/FirePlanBlock.tsx) sits between the header and the tab bar,
 * outside the panels: the plan's ONE draft is owned here (`useFirePlanDraft`) and read by every tab over the saved
 * settings (doc/fire-ipotesi/README.md § 15). The page reads `?tab=<tab>` (the initial tab) and `?piano=aperto|<field>`
 * (opens the block, puts the focus on the field): the links of Impostazioni and of the tiles work.
 *
 * Mobile/tablet pattern (< 1440px): PageTabBar renders a centered segmented pill (icon-only
 * inactive tabs). Desktop (≥ 1440px): standard TabsList with icons.
 * No lazy loading needed - components load quickly.
 *
 * The container is `wide` (1920px, the tile grid's root): every tab is propagated to «Verdict
 * over Tiles» — Calcolatore, Coast FIRE, What If, Monte Carlo and, since 2026-08-26, Obiettivi.
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Flame, Dices, Mountain, Target, Lightbulb, TrendingUp } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import { CoastFireTab } from '@/components/fire-simulations/CoastFireTab';
import { WhatIfAnalysisTab } from '@/components/fire-simulations/WhatIfAnalysisTab';
import { MonteCarloTab } from '@/components/fire-simulations/MonteCarloTab';
import { ProjectionTab } from '@/components/fire-simulations/ProjectionTab';
import { GoalBasedInvestingTab } from '@/components/fire-simulations/GoalBasedInvestingTab';
import { FirePlanBlock } from '@/components/fire-simulations/plan/FirePlanBlock';
import { FirePlanContext, useFirePlanDraft } from '@/lib/hooks/useFirePlan';
import { isFireTab, isFirePlanField, type FireTabValue } from '@/lib/utils/firePlan';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import type { TabDef } from '@/components/layout/PageTabs';

type TabValue = FireTabValue;

const TABS: TabDef[] = [
  { value: 'fire',       label: 'Calcolatore FIRE', icon: Flame     },
  { value: 'coast',      label: 'Coast FIRE',       icon: Mountain  },
  { value: 'whatif',     label: 'What If',          icon: Lightbulb },
  { value: 'montecarlo', label: 'Dopo il FIRE',      icon: Dices     },
  { value: 'proiezione', label: 'Proiezione',       icon: TrendingUp },
  { value: 'goals',      label: 'Obiettivi',        icon: Target    },
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
            {tab.value === 'coast'      && <CoastFireTab />}
            {tab.value === 'whatif'     && <WhatIfAnalysisTab />}
            {tab.value === 'montecarlo' && <MonteCarloTab />}
            {tab.value === 'proiezione' && <ProjectionTab />}
            {tab.value === 'goals'      && <GoalBasedInvestingTab />}
          </TabsContent>
        ))}
      </PageTabs>
      </FirePlanContext.Provider>
    </PageContainer>
  );
}
