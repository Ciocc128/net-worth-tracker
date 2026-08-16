'use client';

import { useCountUp } from '@/lib/utils/useCountUp';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

/** Leaf so the rAF count-up re-renders only this span, not the whole card (DESIGN.md rule). */
function AnimatedNetWorth({ value }: { value: number }) {
  const animated = useCountUp(value, { once: true, fromPrevious: false, startDelay: 80 });
  return <>{cachedFormatCurrencyEUR(animated ?? value, true)}</>;
}

interface AssistantPatrimonioTodayCardProps {
  netWorth: number | null;
  variation: { value: number; percentage: number } | null;
}

/**
 * "Patrimonio netto oggi" card shown as the companion scheda when no numeric
 * period is attached (Libera mode). Keeps a dominant number on screen so the
 * user always has their financial reality in view before asking a free-form
 * question. Follows the Dominant Value Block: eyebrow → section-hero value →
 * delta annotation → tertiary metadata.
 */
export function AssistantPatrimonioTodayCard({ netWorth, variation }: AssistantPatrimonioTodayCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Patrimonio netto oggi
      </p>
      <p className="mt-2 font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
        {netWorth !== null ? <AnimatedNetWorth value={netWorth} /> : '—'}
      </p>
      {variation && (
        <p
          className={cn(
            'mt-1.5 font-mono text-[12px] tabular-nums',
            variation.value >= 0 ? 'text-positive' : 'text-destructive'
          )}
        >
          {variation.value >= 0 ? '+' : ''}
          {cachedFormatCurrencyEUR(variation.value, true)}{' '}
          ({variation.percentage >= 0 ? '+' : ''}
          {variation.percentage.toFixed(2)}%)
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        vs. mese scorso · prezzi correnti · al netto delle tasse stimate
      </p>
    </div>
  );
}
