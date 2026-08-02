'use client';

/**
 * "Registra versamento" — the Previdenza page's primary action, hosted in `PageHeader`'s `actions`
 * slot rather than in a row of its own above the hero.
 *
 * It owns the dialog because the header is rendered by the page while the body is rendered by
 * `PensionOverview`; lifting the state to the page would force the page to re-derive "does this user
 * own a fund" too. `useAssets` is the same React Query key `PensionOverview` reads, so this costs one
 * cache hit, not a second fetch.
 *
 * Renders nothing until at least one `pensionFund` asset exists: an action whose dialog can only say
 * "create a fund first" is chrome, and during the initial load it would also contradict the skeleton
 * shown underneath it.
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { Button } from '@/components/ui/button';
import { PensionContributionDialog } from '@/components/pension/PensionContributionDialog';

export function PensionHeaderAction() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [], isLoading } = useAssets(ownerId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const hasFunds = assets.some((asset) => asset.type === 'pensionFund');
  if (isLoading || !hasFunds) return null;

  return (
    <>
      <Button
        size="sm"
        onClick={() => setDialogOpen(true)}
        disabled={isDemo}
        aria-label="Registra versamento"
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Registra versamento
      </Button>
      <PensionContributionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
