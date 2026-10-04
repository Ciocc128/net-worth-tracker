'use client';

/**
 * DISTRIBUZIONE A N ANNI — «con quanto potrei ritrovarmi?»: the base scenario's values at the
 * chosen horizon, in today's euros, as three flat figures (10th, median, 90th) and the Monte
 * Carlo's ten-bin histogram (`FinalValueBars`, the shared binning rule), the median's bin outlined.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { HistogramBin } from '@/lib/utils/monteCarloSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { FinalValueBars } from '@/components/monte-carlo/FinalValueBars';

interface DistribuzioneTileProps {
  reading: Narrative;
  aside: string;
  p10: number;
  p50: number;
  p90: number;
  bins: HistogramBin[];
  calendarYear: number;
  footer: Narrative;
  className?: string;
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <span className="font-mono text-[16px] font-semibold leading-none tabular-nums text-foreground desktop:text-[18px]">{cachedFormatCurrencyEUR(value, true)}</span>
    </div>
  );
}

export function DistribuzioneTile({ reading, aside, p10, p50, p90, bins, calendarYear, footer, className }: DistribuzioneTileProps) {
  return (
    <Tile eyebrow="Distribuzione" aside={aside} reading={reading} ariaLabel="Distribuzione dei valori all'orizzonte" className={className}>
      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-3">
        <Kpi label="10° %ile" value={p10} />
        <Kpi label="Mediana" value={p50} />
        <Kpi label="90° %ile" value={p90} />
      </div>

      <FinalValueBars bins={bins} ariaLabel={`Distribuzione dei valori del portafoglio nel ${calendarYear}, in euro di oggi, in ${bins.length} classi.`} className="mt-4 flex-1" minHeight={120} />

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
