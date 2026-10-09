'use client';

/**
 * The fan of the withdrawal plan — the Probabilità tile's projection: the 10–90 and 25–75 bands
 * of the base scenario's simulations, the median line, a dashed destructive line at zero (the
 * capital exhausted) and, when the bridge model is on, a dashed muted guide at the year the
 * pension fund enters. Same technique as the Calcolatore's Ventaglio (`FireFanChart`): one hue for
 * fan and median, ticks in the mono face, `height="100%"` inside an absolutely positioned box.
 *
 * No legend: the tile's footer says what the line and the bands are in words. The tooltip is a
 * module-level component (AGENTS → Recharts) with card tokens so it follows the theme.
 */

import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PercentilesData } from '@/types/assets';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { SCENARIO_COLOR } from '@/lib/constants/scenarioColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

interface MonteCarloFanChartProps {
  percentiles: PercentilesData[];
  /** Calendar year of the simulation's year 0. */
  startCalendarYear: number;
  /** The year the locked pension fund enters, when it is on the plot; null draws no guide. */
  unlockCalendarYear: number | null;
  height: number | `${number}%`;
  ariaLabel: string;
  /** Draw the dashed destructive line at zero (the capital exhausted). Default true: the Monte Carlo's. */
  zeroLine?: boolean;
  /** § 21 RE4: bands and median are drawn at `max(0, p)` and the tooltip says «esaurito» for a percentile at or under zero. Only the Proiezione sets it. */
  floorAtZero?: boolean;
  /** A neutral dashed line at a value (Proiezione's threshold) — a target, not a loss, so never the destructive token. */
  referenceLine?: { value: number; label: string };
  /** The same neutral dashed line as a SERIES on the percentiles' years (Proiezione's moving threshold): `values[t]` at year t. */
  referenceSeries?: { values: readonly number[]; label: string };
  /** The calendar year the tab's horizon sits at: a faint vertical guide. */
  markedCalendarYear?: number | null;
}

interface FanRow {
  calendarYear: number;
  reference?: number;
  band1090: [number, number];
  band2575: [number, number];
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface FanTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: FanRow }[];
  label?: string | number;
  /** The moving threshold's name, when the chart draws one: it gets a row of its own. */
  referenceLabel?: string;
}

function FanTooltip({ active, payload, label, referenceLabel }: FanTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const rows: [string, number][] = [
    ['90° percentile', row.p90],
    ['75° percentile', row.p75],
    ['Mediana', row.p50],
    ['25° percentile', row.p25],
    ['10° percentile', row.p10],
  ];
  if (referenceLabel && row.reference !== undefined) rows.push([referenceLabel, row.reference]);
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {rows.map(([name, value]) => (
          <p key={name}>
            {name}:{' '}
            <span className={name === 'Mediana' ? 'font-mono font-semibold tabular-nums text-foreground' : 'font-mono font-medium tabular-nums text-foreground'}>
              {value > 0 ? formatCurrency(value) : 'esaurito'}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** The name of the dashed series, printed once above its first point (a series has no `ReferenceLine` label). */
function renderSeriesLabel(text: string) {
  function SeriesLabel({ x, y, index }: { x?: number | string; y?: number | string; index?: number }) {
    if (index !== 0 || typeof x !== 'number' || typeof y !== 'number') return null;
    return (
      <text x={x + 6} y={y - 6} fill="var(--muted-foreground)" fontSize={11}>
        {text}
      </text>
    );
  }
  return SeriesLabel;
}

export function MonteCarloFanChart({ percentiles, startCalendarYear, unlockCalendarYear, height, ariaLabel, zeroLine = true, floorAtZero = false, referenceLine, referenceSeries, markedCalendarYear = null }: MonteCarloFanChartProps) {
  const fanColor = SCENARIO_COLOR.base;

  const rows = useMemo<FanRow[]>(
    () =>
      percentiles.map((raw) => {
        const point = floorAtZero ? { ...raw, p10: Math.max(0, raw.p10), p25: Math.max(0, raw.p25), p50: Math.max(0, raw.p50), p75: Math.max(0, raw.p75), p90: Math.max(0, raw.p90) } : raw;
        return {
          calendarYear: startCalendarYear + point.year,
          band1090: [point.p10, point.p90],
          band2575: [point.p25, point.p75],
          p10: point.p10,
          p25: point.p25,
          p50: point.p50,
          p75: point.p75,
          p90: point.p90,
          ...(referenceSeries && referenceSeries.values[point.year] !== undefined ? { reference: referenceSeries.values[point.year] } : {}),
        };
      }),
    [percentiles, startCalendarYear, referenceSeries, floorAtZero],
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 4 }} role="img" aria-label={ariaLabel} accessibilityLayer={false}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="calendarYear" tick={CHART_TICK_STYLE} tickMargin={6} />
        <YAxis width={64} tickFormatter={(value) => formatCurrencyCompact(Number(value))} tick={CHART_TICK_STYLE} />
        <Tooltip content={<FanTooltip referenceLabel={referenceSeries?.label} />} />
        <Area dataKey="band1090" name="10°–90° percentile" stroke="none" fill={fanColor} fillOpacity={0.1} isAnimationActive={false} activeDot={false} />
        <Area dataKey="band2575" name="25°–75° percentile" stroke="none" fill={fanColor} fillOpacity={0.18} isAnimationActive={false} activeDot={false} />
        {unlockCalendarYear !== null && <ReferenceLine x={unlockCalendarYear} stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeDasharray="2 3" />}
        {markedCalendarYear !== null && <ReferenceLine x={markedCalendarYear} stroke="var(--muted-foreground)" strokeOpacity={0.35} />}
        <Line dataKey="p50" name="Mediana" stroke={fanColor} strokeWidth={2.5} dot={false} animationDuration={800} animationEasing="ease-out" />
        {/* The capital exhausted: a fact with a sign, so the loss token is the one honest colour here. */}
        {zeroLine && <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="3 3" />}
        {referenceSeries && (
          <Line dataKey="reference" name={referenceSeries.label} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} legendType="none" label={renderSeriesLabel(referenceSeries.label)} />
        )}
        {referenceLine && (
          <ReferenceLine y={referenceLine.value} ifOverflow="extendDomain" stroke="var(--muted-foreground)" strokeDasharray="4 3" label={{ value: referenceLine.label, position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 11 }} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
