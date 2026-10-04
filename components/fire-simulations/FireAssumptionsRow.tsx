'use client';

/**
 * «Ipotesi usate», one line above the verdict of every FIRE tab (doc/fire-ipotesi/README.md § 4.2):
 * which hypotheses the numbers below run on, with the way to change them. The sentence is generated
 * by `describeFireAssumptions`, so the four tabs print the same string for the same data.
 */
import Link from 'next/link';
import type { FireAssumptions } from '@/lib/utils/fireAssumptions';
import { costsLackStampDuty, describeFireAssumptions } from '@/lib/utils/fireAssumptionsNarrative';
import { NarrativeText } from '@/components/ui/narrative-text';

export function FireAssumptionsRow({ assumptions }: { assumptions: FireAssumptions | null }) {
  if (!assumptions) return null;
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] leading-[1.45] text-muted-foreground" data-testid="fire-assumptions-row">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em]">Ipotesi usate</span>
      <NarrativeText segments={describeFireAssumptions(assumptions)} figureClassName="font-medium" />
      <Link href="/dashboard/settings?tab=simulazioni" className="inline-flex min-h-11 items-center text-foreground underline underline-offset-2 desktop:min-h-0">
        Modifica in Impostazioni
      </Link>
      {costsLackStampDuty(assumptions) ? (
        <Link href="/dashboard/settings?tab=allocazione" className="inline-flex min-h-11 items-center text-foreground underline underline-offset-2 desktop:min-h-0">
          Attiva il bollo
        </Link>
      ) : null}
    </div>
  );
}
