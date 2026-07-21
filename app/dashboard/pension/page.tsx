/**
 * PREVIDENZA COMPLEMENTARE PAGE
 *
 * Dedicated view for the fondo pensione, living in the Pianificazione nav group (spec §8.4): it is
 * planning content (contributions, tax benefit, plafond, FIRE integration), reachable both from the
 * nav and from a quick link on the pension asset card in Patrimonio.
 *
 * The body reuses `PensionTab` — the self-contained pension component.
 */

'use client';

import { PiggyBank } from 'lucide-react';
import { PensionTab } from '@/components/fire-simulations/PensionTab';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

export default function PensionPage() {
  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <PiggyBank className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground" aria-hidden="true" />
            Previdenza Complementare
          </span>
        }
        description="Versamenti, beneficio fiscale e integrazione con il tuo piano FIRE"
        separator={false}
      />
      <PensionTab />
    </PageContainer>
  );
}
