'use client';

/**
 * A failed fetch is not an empty set.
 *
 * Both queries behind Centri di Costo default to `[]`, so a dropped connection used to render as
 * «Nessun centro di costo» with a button offering to create the first one — telling a user with
 * eight tracked projects that they own none, and inviting them to start over. It was
 * indistinguishable from the truthful case, which is the one thing a tracker must never be.
 *
 * The block that depends on the missing data is OMITTED and replaced by this. Same doctrine and
 * same shape as PensionErrorNotice: say what failed, then say what was NOT touched — the second
 * sentence is the one that stops the user reaching for a backup.
 */

import { AlertTriangle } from 'lucide-react';

export function CostCenterErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-[22px]"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">
          Ricarica la pagina per riprovare. I centri e le spese registrate non sono stati toccati.
        </p>
      </div>
    </div>
  );
}
