import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PensionErrorNoticeProps {
  message: string;
  className?: string;
}

/**
 * A fetch that failed is not an empty set.
 *
 * Every query of the Previdenza page defaults to `[]`, so a network error would render as
 * «Nessun versamento registrato» and as zeros in `font-mono` — indistinguishable from the real
 * case, on a page whose thesis is "when I don't know, I say so". The tile that depends on the
 * missing data is OMITTED and replaced by this notice, in the same grid cell. A `section` like a
 * tile, so `TILE_CELL_CLASS` stretches it to the row.
 */
export function PensionErrorNotice({ message, className }: PensionErrorNoticeProps) {
  return (
    <section
      role="alert"
      className={cn('flex min-w-0 items-start gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-sm', className)}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-[13px] leading-[1.45] text-foreground">{message}</p>
        <p className="text-[11px] text-muted-foreground">Ricarica la pagina per riprovare. I dati registrati non sono stati toccati.</p>
      </div>
    </section>
  );
}
