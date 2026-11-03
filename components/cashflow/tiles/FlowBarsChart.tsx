'use client';

import type { CSSProperties, MouseEvent } from 'react';
import type { MonthFlow } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { ChartHoverTip, CURRENT_SLOT_LABEL_CLASS, CurrentSlotBand, useChartHover } from '@/components/ui/chart-hover';
import { SeriesDot } from '@/components/ui/series-dot';
import { CASHFLOW_SERIES_COLOR } from '@/lib/constants/expenseTypeColors';

interface FlowBarsChartProps {
  flows: MonthFlow[];
  /** The month the page is about — drawn at full strength, the others recede. */
  highlightKey: string | null;
  /**
   * Minimum height of the plot from `desktop:`; the tile's flex column lets it stretch past it.
   * Below `desktop:` the plot yields to `PHONE_MIN_HEIGHT_CLASS` whatever is passed
   * (The First-Screen Rule: with THE tile tall the curve gives, never the reading).
   */
  minHeight?: number;
  /** A click on a month's slot (or its axis label) opens that month; absent = a static chart. */
  onSelectMonth?: (month: { year: number; month: number }) => void;
  className?: string;
}

/** The plot's floor below `desktop:` (the Panoramica's curve has the same, 2026-10-11). */
const PHONE_MIN_HEIGHT_CLASS = 'min-h-[120px] desktop:min-h-[var(--flow-min-h)]';

/**
 * The months that are not the page's: two greys mixed from `--muted-foreground` into the tile (D-AS17). A fork
 * theme sets its own pair (`--flow-past-in` / `--flow-past-out`, D-AS24–D-AS25) so each grey weighs as its series does
 * in the current month; every other theme keeps the default, income the grey nearer the tile, spending the farther.
 * Reference data by choice: the income grey sits under 3:1 on the tile (≈1.8–2.0:1), the month's figures stay in
 * the slot's tooltip, and only the current month must read as the accent.
 */
const PAST_INCOME_FILL = 'var(--flow-past-in, color-mix(in oklab, var(--muted-foreground) 40%, var(--card)))';
const PAST_EXPENSES_FILL = 'var(--flow-past-out, color-mix(in oklab, var(--muted-foreground) 75%, var(--card)))';

const VIEW_W = 600;
const VIEW_H = 180;
/** Share of a month's slot taken by each of its two bars, and the gap between them. */
const BAR_SHARE = 0.3;
const BAR_GAP_SHARE = 0.06;

/**
 * Income beside spending, one pair of bars per month, in the two chart slots the category
 * tiles use (jade income, indigo spending) so the same colour means the same thing across
 * the page. Hand-written SVG, no Recharts: the chart stretches to the tile's free height
 * (`absolute inset-0` + `preserveAspectRatio="none"`, the Panoramica's sparkline technique)
 * and the labels live outside the SVG so they never stretch with it.
 */
export function FlowBarsChart({ flows, highlightKey, minHeight = 150, onSelectMonth, className }: FlowBarsChartProps) {
  const max = Math.max(...flows.map((f) => Math.max(f.income, f.expenses)), 1);
  const slot = VIEW_W / flows.length;
  const barWidth = slot * BAR_SHARE;
  const gap = slot * BAR_GAP_SHARE;
  const pairWidth = barWidth * 2 + gap;

  const label = flows
    .map((f) => `${f.label}: entrate ${cachedFormatCurrencyEUR(f.income, true)}, spese ${cachedFormatCurrencyEUR(f.expenses, true)}${f.scheduled ? ' (in calendario)' : ''}`)
    .join('; ');

  // A mouse over a month reads its two figures (desktop only; the SVG titles serve the rest).
  const hover = useChartHover(flows.length, 'slot');
  const hovered = hover.index !== null ? flows[hover.index] : null;

  // The desktop floor travels as a custom property so the phone's 120px can be a class, not an
  // inline style the class could never beat.
  // A click reads the slot under the pointer, like the hover: the bars and the empty space above
  // them are one target, so a short bar is as easy to open as a tall one.
  const onPlotClick = (event: MouseEvent<HTMLElement>) => {
    if (!onSelectMonth) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const flow = flows[Math.min(flows.length - 1, Math.floor(fraction * flows.length))];
    if (flow) onSelectMonth({ year: flow.year, month: flow.month });
  };

  const plotStyle = { '--flow-min-h': `${minHeight}px` } as CSSProperties;

  return (
    <div className={cn('flex flex-col', className)}>
      <div
        className={cn('relative flex-1', PHONE_MIN_HEIGHT_CLASS, onSelectMonth && 'cursor-pointer')}
        style={plotStyle}
        onClick={onSelectMonth ? onPlotClick : undefined}
        {...(hover.enabled ? hover.handlers : {})}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Entrate e spese per mese. ${label}`}
        >
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          <CurrentSlotBand index={flows.findIndex((f) => f.key === highlightKey)} slot={slot} height={VIEW_H} />
          {hover.index !== null && (
            <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />
          )}
          {flows.map((flow, i) => {
            const x = i * slot + (slot - pairWidth) / 2;
            const incomeHeight = (flow.income / max) * (VIEW_H - 8);
            const expensesHeight = (flow.expenses / max) * (VIEW_H - 8);
            // The month the page is about gets a band, a pill (CurrentSlotBand) and the two series colours;
            // every other month is a pair of greys, so the chart has ONE accent, on the month that answers
            // (D-AS17, D-AS24). The greys are mixed from `--muted-foreground`, never dimmed from the series colours.
            const current = highlightKey === null || flow.key === highlightKey;
            const incomeFill = current ? CASHFLOW_SERIES_COLOR.income : PAST_INCOME_FILL;
            const expensesFill = current ? CASHFLOW_SERIES_COLOR.expenses : PAST_EXPENSES_FILL;
            // A month that has not started holds only what is already in the calendar: drawn
            // lighter, so a recurring-only bar is never read as a month that was lived.
            const opacity = flow.scheduled ? 0.45 : 1;
            return (
              <g key={flow.key}>
                <title>{`${flow.label}: entrate ${cachedFormatCurrencyEUR(flow.income, true)}, spese ${cachedFormatCurrencyEUR(flow.expenses, true)}${flow.scheduled ? ' (in calendario)' : ''}`}</title>
                <rect x={x} y={VIEW_H - incomeHeight} width={barWidth} height={incomeHeight} fill={incomeFill} fillOpacity={opacity} />
                <rect x={x + barWidth + gap} y={VIEW_H - expensesHeight} width={barWidth} height={expensesHeight} fill={expensesFill} fillOpacity={opacity} />
              </g>
            );
          })}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / flows.length} label={`${hovered.label} ${hovered.year}${hovered.scheduled ? ' · in calendario' : ''}`}>
            <span className="font-mono tabular-nums">
              <SeriesDot color="var(--flow-in)" />
              <span className="text-muted-foreground">Entrate </span>
              <span className="text-income-figure">{cachedFormatCurrencyEUR(hovered.income, true)}</span>
            </span>
            <span className="font-mono tabular-nums">
              <SeriesDot color="var(--flow-out)" />
              <span className="text-muted-foreground">Spese </span>
              <span className="text-expense-figure">{cachedFormatCurrencyEUR(hovered.expenses, true)}</span>
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${flows.length}, minmax(0, 1fr))` }} aria-hidden={onSelectMonth ? undefined : true}>
        {flows.map((flow) => {
          const labelClass = cn(
            'text-center font-mono text-[11px] tabular-nums',
            flow.key === highlightKey ? CURRENT_SLOT_LABEL_CLASS : 'text-muted-foreground',
            flow.scheduled && 'opacity-60',
          );
          // The axis labels are the keyboard's way in: the plot's click is a pointer shortcut.
          return onSelectMonth ? (
            <button
              key={flow.key}
              type="button"
              onClick={() => onSelectMonth({ year: flow.year, month: flow.month })}
              aria-label={`Apri ${flow.label} ${flow.year}`}
              className={cn(labelClass, 'rounded-sm py-1 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring')}
            >
              {flow.label}
            </button>
          ) : (
            <span key={flow.key} className={labelClass}>
              {flow.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
