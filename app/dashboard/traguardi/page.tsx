/**
 * TRAGUARDI PAGE
 *
 * Goal-based investing as a page of its own (RU11, doc/riordino-ui/ondata-3.md § 5.2, D-RU29), in the «Futuro» group
 * between FIRE and Previdenza. It was the fourth tab of FIRE until RU10 left it there on purpose: `?tab=goals` of the
 * FIRE page redirects here.
 *
 * The page has NO «Il mio piano»: the goals read the SAVED plan (`useFireSettings()` outside the plan's provider is the
 * saved settings) and change nothing of it; the verdict's scope line links to FIRE for every figure it names. The menu
 * entry exists only with «Traguardi di investimento» on; opened by an old link with the switch off, the page shows its
 * empty state with the way to Impostazioni › Funzioni.
 *
 * The content is the page, so it is not lazy: it ships with the route's own chunk.
 */

'use client';

import { GoalBasedInvestingTab } from '@/components/fire-simulations/GoalBasedInvestingTab';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { useGoalData } from '@/lib/hooks/useGoalData';
import { useSettings } from '@/lib/hooks/useSettings';

export default function TraguardiPage() {
  const { ownerId } = useActiveAccount();
  // The header's «Aggiornato alle…» over the three reads the page paints from (the tab's own keys, no second read).
  const freshness = useFreshness([useSettings(ownerId), useAssets(ownerId), useGoalData(ownerId)]);
  return (
    <PageContainer>
      <PageHeader title="Traguardi" freshness={freshness} />
      <GoalBasedInvestingTab />
    </PageContainer>
  );
}
