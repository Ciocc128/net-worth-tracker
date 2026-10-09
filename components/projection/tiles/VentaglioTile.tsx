'use client';

/**
 * VENTAGLIO — «come si apre il ventaglio dei valori?»: the base scenario's 10–90 and 25–75 bands
 * and the median, in today's euros, from year 0 to the run's last year; the threshold a neutral
 * dashed line and the chosen horizon a faint guide. The chart is passed in as `chart`, so the
 * tile is a shell with a reading, a figure row and a footer — the footer is the chart's legend in words.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface VentaglioTileProps {
  reading: Narrative;
  aside: string;
  /** The three figures of the chosen horizon, today's euros. */
  p10: number;
  p50: number;
  p90: number;
  horizonLabel: string;
  chart: ReactNode;
  footer: Narrative;
  className?: string;
}

function Kpi({ label, value, hero = false }: { label: string; value: number; hero?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <span className={hero ? 'font-mono text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground desktop:text-[34px]' : 'font-mono text-[16px] font-semibold leading-none tabular-nums text-foreground desktop:text-[18px]'}>
        {Math.round(value) <= 0 ? 'esaurito' : cachedFormatCurrencyEUR(value, true)}
      </span>
    </div>
  );
}

export function VentaglioTile({ reading, aside, p10, p50, p90, horizonLabel, chart, footer, className }: VentaglioTileProps) {
  return (
    <Tile eyebrow="Ventaglio" aside={aside} reading={reading} ariaLabel="Ventaglio del portafoglio" className={className}>
      <div className="mt-3.5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <Kpi label={`Mediana · ${horizonLabel}`} value={p50} hero />
        <Kpi label="10° %ile" value={p10} />
        <Kpi label="90° %ile" value={p90} />
      </div>

      {/* The chart stretches with the tile's free height (the SVG's 100% resolves against the absolute box). */}
      <div className="relative mt-4 min-h-[240px] flex-1">
        <div className="absolute inset-0">{chart}</div>
      </div>

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
