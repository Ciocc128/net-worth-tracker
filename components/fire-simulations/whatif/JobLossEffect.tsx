'use client';

/**
 * EFFETTO SUL PATRIMONIO — the job-loss hit decomposed (FEAT FIRE 2026-10-05: it left the Evento tile, which is
 * an INPUT, for the Delta tile, which says what the event did): each effect with its formula filled with
 * the simulation's own figures (`decomposeJobLossHit`, pure and tested), so the net-worth delta stays traceable.
 */

import type { JobLossHit } from '@/lib/utils/whatIfSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

const compact = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true);

export function JobLossEffect({ hit, months, annualSavings, lostAnnualIncome }: { hit: JobLossHit; months: number; annualSavings: number; lostAnnualIncome: number }) {
  return (
    <div className="mt-4">
      <p className={TILE_SUB_EYEBROW_CLASS}>Effetto sul patrimonio</p>
      <dl className="mt-1 flex flex-col divide-y divide-border">
        <div className="flex items-start justify-between gap-3 py-[9px]">
          <dt className="min-w-0">
            <span className="block text-[13px] text-muted-foreground">Mancati risparmi</span>
            <span className="block font-mono text-[11px] leading-[1.4] tabular-nums text-muted-foreground/70">
              min({compact(annualSavings)}; {compact(lostAnnualIncome)}) × {months}/12
            </span>
          </dt>
          <dd className="shrink-0 font-mono text-[13px] tabular-nums text-destructive">−{compact(hit.forgoneSavings)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 py-[9px]">
          <dt className="min-w-0">
            <span className="block text-[13px] text-muted-foreground">Spese dal portafoglio</span>
            <span className="block font-mono text-[11px] leading-[1.4] tabular-nums text-muted-foreground/70">
              max({compact(lostAnnualIncome)} − {compact(annualSavings)}; 0) × {months}/12
            </span>
          </dt>
          <dd className="shrink-0 font-mono text-[13px] tabular-nums text-destructive">−{compact(hit.drawnExpenses)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-[9px]">
          <dt className="text-[13px] font-medium text-foreground">Impatto sul patrimonio</dt>
          <dd className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">−{compact(hit.total)}</dd>
        </div>
      </dl>
    </div>
  );
}
