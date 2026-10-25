'use client';

import type { Narrative } from '@/lib/utils/narrative';
import { narrativeToText } from '@/lib/utils/narrative';
import type { SpendingTrend, TrendComparison, TrendComparisonId } from '@/lib/utils/spendingTrend';
import { MONTH_NAMES } from '@/lib/constants/months';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { SeriesLegend, type SeriesLegendItem } from '@/components/ui/series-legend';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { lazyComponent } from '@/components/ui/lazy-component';

/** The plot is a chunk of its own: recharts stays out of Tracciamento's first load. Module level, never in a render. */
const AndamentoChart = lazyComponent(() => import('@/components/cashflow/tiles/AndamentoChart').then((m) => m.AndamentoChart));

interface AndamentoTileProps {
  trend: SpendingTrend;
  /** The comparison drawn; null when none is available (the area alone). */
  chosen: TrendComparison | null;
  onChoose: (id: TrendComparisonId) => void;
  reading: Narrative;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («giorno per giorno»). */
  asideWhenClosed?: string;
  className?: string;
}

/**
 * «Sto spendendo più o meno del solito, a questo punto del mese?» — the month's spending accumulated
 * day by day as the fading area of Storico › Evoluzione, against ONE dashed comparison the pill picks
 * (D-AM3, D-AM11). Every figure is born in `lib/utils/spendingTrend.ts`, the reading in
 * `describeSpendingTrend`; the plot is the app's Recharts door, ticks in `CHART_TICK_STYLE`. With a
 * fine pointer a tooltip reads the day; a touch gets none — the reading says it (The Hover Reading Rule).
 */
export function AndamentoTile({ trend, chosen, onChoose, reading, collapse, asideWhenClosed, className }: AndamentoTileProps) {
  // A comparison is a baseline, not a series: the neutral grey of Capitale e mercato's invested
  // capital and of Rendimenti's benchmark, never a palette slot.
  const comparisonColor = 'var(--capital-invested)';
  const monthName = MONTH_NAMES[trend.month - 1];
  const showCalendar = trend.scheduledTotal > 0;
  const hasArea = trend.spent.length > 0;

  const legend: SeriesLegendItem[] = [
    ...(hasArea ? [{ label: `${monthName} ${trend.year}`, colors: ['var(--hero-series)'] }] : []),
    ...(showCalendar ? [{ label: 'Già in calendario', colors: ['var(--hero-series)'] }] : []),
    ...(chosen ? [{ label: chosen.label, colors: [comparisonColor] }] : []),
  ];

  return (
    <Tile
      eyebrow="Andamento del mese"
      aside={<span className="font-mono tabular-nums">{monthName} {trend.year}</span>}
      reading={reading}
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      className={className}
    >
      <div className="mt-3">
        <SegmentedPill
          options={trend.comparisons.map((comparison) => ({
            value: comparison.id,
            label: comparison.label,
            ...(comparison.available ? {} : { unavailable: { reason: comparison.reason ?? 'Non disponibile' } }),
          }))}
          // No comparison drawn = nothing selected (the pill's own rule for a value no option matches).
          value={(chosen?.id ?? '') as TrendComparisonId}
          onChange={onChoose}
          layoutId="andamento-confronto"
          ariaLabel="Confronta con"
          semantics="radio"
          optionClassName="max-desktop:min-h-11 max-desktop:py-2 text-[13px]"
        />
      </div>

      {/* The plot is the element that stretches: absolute inside a flex-1 box (Evoluzione's way). */}
      <div className="relative mt-3 flex-1 max-desktop:min-h-[160px] desktop:min-h-[190px]">
        <div className="absolute inset-0">
          <AndamentoChart
            trend={trend}
            chosen={chosen}
            comparisonColor={comparisonColor}
            ariaLabel={`Spesa cumulata di ${monthName.toLowerCase()} ${trend.year}, giorno per giorno. ${narrativeToText(reading)}`}
            fallback={<div className="h-full w-full" aria-hidden="true" />}
          />
        </div>
      </div>

      {legend.length > 0 && <SeriesLegend items={legend} className="mt-2.5" />}
    </Tile>
  );
}
