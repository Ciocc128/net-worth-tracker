'use client';

/**
 * Previdenza Complementare — dedicated view for the fondo pensione.
 *
 * Lives in `planningNav` (Pianificazione), not as a `fire-simulations` tab: contributions, tax
 * benefit and plafond are planning content in their own right, and this is also the target of the
 * "Vai a Previdenza" quick link on a pensionFund asset card in Patrimonio.
 */

import { PiggyBank } from 'lucide-react';
import { PensionOverview } from '@/components/pension/PensionOverview';
import { PensionHeaderAction } from '@/components/pension/PensionHeaderAction';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

export default function PensionPage() {
  return (
    <PageContainer>
      <PageHeader
        label="Pianificazione"
        title={
          <span className="flex items-center gap-2">
            {/* Dimensionata sul breakpoint reale: `PageHeader` rende lo stesso `title` in una navbar
                mobile da 17px fino a 1440px, dove un'icona da 32px pesava il doppio del titolo. */}
            <PiggyBank className="h-5 w-5 text-muted-foreground desktop:h-8 desktop:w-8" aria-hidden="true" />
            Previdenza Complementare
          </span>
        }
        description="Versamenti, beneficio fiscale e plafond del tuo fondo pensione"
        actions={<PensionHeaderAction />}
      />
      <PensionOverview />
    </PageContainer>
  );
}
