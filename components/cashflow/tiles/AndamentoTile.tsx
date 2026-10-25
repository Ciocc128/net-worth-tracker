'use client';

import { useId } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from '@/components/ui/charts/recharts';
import { useChartMotion } from '@/lib/hooks/useChartMotion';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import type { Narrative } from '@/lib/utils/narrative';
import { narrativeToText } from '@/lib/utils/narrative';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import type { SpendingTrend, TrendComparison, TrendComparisonId } from '@/lib/utils/spendingTrend';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { SeriesLegend, type SeriesLegendItem } from '@/components/ui/series-legend';
import { Tile, type TileCollapse } from '@/components/ui/tile';

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

interface TrendDatum {
  day: number;
  spent: number | null;
  calendar: number | null;
  comparison: number | null;
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  maxWidth: 260,
} as const;

/** The days the axis names: the first, the 8th, 15th, 22nd and the last of the month. */
export function trendAxisTicks(daysInMonth: number): number[] {
  return [...new Set([1, 8, 15, 22, daysInMonth])];
}

/**
 * The chart's rows (module-level and pure so the tile stays a layout): the spent area runs to today,
 * the calendar line starts AT today's value (so the two touch) and runs to the month's last day, the
 * comparison covers the whole axis. A past month has no calendar, a future one has no area.
 */
export function buildTrendData(trend: SpendingTrend, chosen: TrendComparison | null): TrendDatum[] {
  const spentDays = trend.spent.length;
  const showCalendar = trend.scheduledTotal > 0;
  return Array.from({ length: trend.daysInMonth }, (_, i) => {
    const day = i + 1;
    return {
      day,
      spent: day <= spentDays ? trend.spent[i] : null,
      calendar: showCalendar && day >= Math.max(spentDays, 1) ? trend.withCalendar[i] : null,
      comparison: chosen?.series?.[i] ?? null,
    };
  });
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: TrendDatum }>;
  monthShort: string;
  comparisonLabel: string | null;
}

function TrendTooltip({ active, payload, monthShort, comparisonLabel }: TrendTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const mine = point.spent ?? point.calendar;
  return (
    <div style={TOOLTIP_STYLE} className="flex flex-col gap-1 text-[11px]">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {point.day} {monthShort}
      </span>
      {mine !== null && (
        <span className="text-muted-foreground">
          {point.spent !== null ? 'Speso' : 'Con il calendario'}{' '}
          <span className="font-mono text-[13px] font-semibold tabular-nums text-card-foreground">{cachedFormatCurrencyEUR(mine, true)}</span>
        </span>
      )}
      {comparisonLabel && point.comparison !== null && (
        <span className="text-muted-foreground">
          {comparisonLabel} <span className="font-mono font-semibold tabular-nums text-card-foreground">{cachedFormatCurrencyEUR(point.comparison, true)}</span>
        </span>
      )}
    </div>
  );
}

/**
 * «Sto spendendo più o meno del solito, a questo punto del mese?» — the month's spending accumulated
 * day by day as the fading area of Storico › Evoluzione, against ONE dashed comparison the pill picks
 * (D-AM3, D-AM11). Every figure is born in `lib/utils/spendingTrend.ts`, the reading in
 * `describeSpendingTrend`; the plot is the app's Recharts door, ticks in `CHART_TICK_STYLE`. With a
 * fine pointer a tooltip reads the day; a touch gets none — the reading says it (The Hover Reading Rule).
 */
export function AndamentoTile({ trend, chosen, onChoose, reading, collapse, asideWhenClosed, className }: AndamentoTileProps) {
  const chartMotion = useChartMotion();
  const colors = useChartColors();
  const gradientId = useId().replace(/:/g, '');
  const finePointer = useMediaQuery('(pointer: fine)');
  // Slot 2 of the theme's palette: distinct from `--hero-series` (slot 1) in every theme, held by
  // `__tests__/chartPaletteDistinctness.test.ts` (ΔE00 ≥ 14 between any two slots).
  const comparisonColor = colors[1] ?? 'var(--muted-foreground)';
  const data = buildTrendData(trend, chosen);
  const monthName = MONTH_NAMES[trend.month - 1];
  const monthShort = MONTH_NAMES_SHORT[trend.month - 1];
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
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              role="img"
              aria-label={`Spesa cumulata di ${monthName.toLowerCase()} ${trend.year}, giorno per giorno. ${narrativeToText(reading)}`}
              accessibilityLayer={false}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--hero-series)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--hero-series)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" ticks={trendAxisTicks(trend.daysInMonth)} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval={0} />
              <YAxis tickFormatter={(value: number) => formatCurrencyCompact(value)} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={52} domain={[0, 'auto']} />
              {finePointer && (
                <Tooltip
                  content={<TrendTooltip monthShort={monthShort} comparisonLabel={chosen?.label ?? null} />}
                  cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.25, strokeWidth: 1 }}
                />
              )}
              {trend.today !== null && <ReferenceLine x={trend.today} stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeDasharray="2 3" />}
              {chosen && (
                <Line
                  {...chartMotion}
                  type="monotone"
                  dataKey="comparison"
                  name={chosen.label}
                  stroke={comparisonColor}
                  strokeWidth={1.75}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={false}
                />
              )}
              {showCalendar && (
                <Line
                  {...chartMotion}
                  type="stepAfter"
                  dataKey="calendar"
                  name="Già in calendario"
                  stroke="var(--hero-series)"
                  strokeOpacity={0.7}
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={false}
                />
              )}
              {hasArea && (
                <Area
                  {...chartMotion}
                  type="monotone"
                  dataKey="spent"
                  name={`${monthName} ${trend.year}`}
                  stroke="var(--hero-series)"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 1.5, stroke: 'var(--foreground)', fill: 'var(--hero-series)' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {legend.length > 0 && <SeriesLegend items={legend} className="mt-2.5" />}
    </Tile>
  );
}
