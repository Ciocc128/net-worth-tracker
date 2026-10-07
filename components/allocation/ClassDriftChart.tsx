'use client';

/**
 * ClassDriftChart — the classes' drift from target, month by month (doc/pac-ate.md §10.6, D11).
 *
 * Hand-written SVG (DESIGN.md → In-tile Bars): one polyline per asset class, solid where both its
 * endpoints are `measured` points, dashed where either is `projected` — the plan's own baseline
 * and closed installments on one side, its calendar-driven forecast on the other. A shaded band
 * around zero shows the rebalance band; under `rule525` the band differs per class, so the chart
 * shades the TIGHTEST one and the caption names it (§10.6: "usa la banda del target più piccolo").
 * Colour is the class's own chart slot (`ASSET_CLASS_CHART_INDEX`), so a class reads the same hue
 * here and on Allocazione/Storico. No library: `role="img"` + `aria-label` carry every figure for
 * a reader who cannot see the plot.
 */
import { useMemo } from 'react';
import type { AssetClass } from '@/types/assets';
import type { ClassTrajectoryPoint } from '@/lib/utils/accumulationPlanUtils';
import { ASSET_CLASS_CHART_INDEX, ASSET_CLASS_LABELS, bandForTarget, type RebalanceBand } from '@/lib/utils/allocationUtils';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_COLORS } from '@/lib/constants/colors';
import {
  ACCUMULO_DRIFT_CHART_LEGEND,
  describeClassDriftChartAriaLabel,
  describeDriftChartBand,
  describeDriftReading,
  formatSignedPp,
  trajectoryPointLabel,
} from '@/lib/utils/accumulationNarrative';
import { stepTrajectoryCursor } from '@/lib/utils/accumuloSummary';
import { cn } from '@/lib/utils';

interface ClassDriftChartProps {
  points: ClassTrajectoryPoint[];
  band: RebalanceBand;
  /** Minimum height of the plot; the tile's flex column lets it stretch past it. */
  height?: number;
  className?: string;
  /**
   * The month the cursor sits on (RV5, PO15). Absent = no cursor: the chart is the plain plot the
   * Calendario and the editor already had. Present with `onSelect`, the plot answers the pointer
   * and the left/right arrows (ONE Tab stop for the whole chart) and a reading row names the month.
   */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_Y = 6;
const MAX_AXIS_LABELS = 7;

/** Evenly spaced indices, the first and the last always included — mirrors the Rendimenti chart. */
function pickAxisIndices(count: number, max = MAX_AXIS_LABELS): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

export function ClassDriftChart({ points, band, height = 160, className, selectedIndex, onSelect }: ClassDriftChartProps) {
  const chartColors = useChartColors();
  const colorOf = (assetClass: AssetClass): string => {
    const idx = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
    return chartColors[idx] ?? CHART_COLORS[idx] ?? CHART_COLORS[0];
  };

  // Every class ANY point names — a point missing one (e.g. a class with no notional that month)
  // leaves a gap in that class's line rather than a false zero.
  const classes = useMemo(() => {
    const set = new Set<AssetClass>();
    for (const point of points) {
      for (const key of Object.keys(point.byClass)) set.add(key as AssetClass);
    }
    return Array.from(set).sort((a, b) => (ASSET_CLASS_CHART_INDEX[a] ?? 99) - (ASSET_CLASS_CHART_INDEX[b] ?? 99));
  }, [points]);

  const allDrifts = points.flatMap((point) =>
    classes.map((assetClass) => point.byClass[assetClass]?.driftPp).filter((v): v is number => v !== undefined),
  );
  const maxAbs = Math.max(1, ...allDrifts.map((v) => Math.abs(v)));
  const sx = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * VIEW_W : VIEW_W / 2);
  const sy = (v: number) => VIEW_H / 2 - (v / maxAbs) * (VIEW_H / 2 - PAD_Y);

  // The shaded band: the TIGHTEST one among the shown classes' current targets (rule525 varies by
  // target size); `null` label when the band is uniform (the `fixed` case, or every target equal).
  const bandInfo = useMemo(() => {
    const last = points[points.length - 1];
    if (!last) return null;
    let tightestPp = Infinity;
    let tightestLabel: string | null = null;
    let firstPp: number | null = null;
    let uniform = true;
    for (const assetClass of classes) {
      const targetPct = last.byClass[assetClass]?.targetPct;
      if (targetPct === undefined) continue;
      const pp = bandForTarget(band, targetPct);
      if (firstPp === null) firstPp = pp;
      else if (Math.abs(pp - firstPp) > 1e-6) uniform = false;
      if (pp < tightestPp) {
        tightestPp = pp;
        tightestLabel = ASSET_CLASS_LABELS[assetClass] ?? assetClass;
      }
    }
    if (!Number.isFinite(tightestPp)) return null;
    return { pp: tightestPp, label: uniform ? null : tightestLabel };
  }, [points, classes, band]);

  const ariaLabel = describeClassDriftChartAriaLabel({
    classLines: classes.map((assetClass) => ({
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      startDriftPp: points[0]?.byClass[assetClass]?.driftPp ?? 0,
      finalDriftPp: points[points.length - 1]?.byClass[assetClass]?.driftPp ?? 0,
    })),
  });

  const hasCursor = selectedIndex !== undefined && !!onSelect && points.length > 0;
  const cursorPosition = hasCursor ? Math.min(Math.max(points.findIndex((point) => point.index === selectedIndex), 0), points.length - 1) : -1;
  const cursorPoint = cursorPosition >= 0 ? points[cursorPosition] : undefined;
  const cursorLeftPct = cursorPosition >= 0 ? (points.length > 1 ? (cursorPosition / (points.length - 1)) * 100 : 50) : 0;

  const selectPosition = (position: number) => {
    const clamped = Math.min(Math.max(position, 0), points.length - 1);
    onSelect?.(points[clamped].index);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasCursor) return;
    const next = stepTrajectoryCursor(cursorPosition, event.key, points.length);
    if (next === null) return;
    event.preventDefault();
    selectPosition(next);
  };
  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasCursor || points.length < 2) return;
    // A mouse only moves the cursor while it is pressed; a finger drags it.
    if (event.type === 'pointermove' && event.buttons === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    selectPosition(Math.round(((event.clientX - rect.left) / rect.width) * (points.length - 1)));
  };
  const reading = cursorPoint ? describeDriftReading(cursorPoint, band) : null;

  return (
    <div className={cn('flex flex-col', className)}>
      {bandInfo && <p className="mb-1 text-[10px] text-muted-foreground">{describeDriftChartBand(bandInfo.pp, bandInfo.label)}</p>}
      <div
        className={cn('relative flex-1', hasCursor && 'touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        style={{ minHeight: height }}
        {...(hasCursor
          ? {
              tabIndex: 0,
              role: 'group',
              'aria-label': 'Mese del grafico: usa le frecce sinistra e destra',
              onKeyDown: handleKeyDown,
              onPointerDown: handlePointer,
              onPointerMove: handlePointer,
            }
          : {})}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          role="img"
          aria-label={ariaLabel}
        >
          {bandInfo && (
            <rect
              x={0}
              y={sy(bandInfo.pp)}
              width={VIEW_W}
              height={Math.max(0, sy(-bandInfo.pp) - sy(bandInfo.pp))}
              fill="var(--foreground)"
              fillOpacity={0.05}
            />
          )}
          <line x1={0} x2={VIEW_W} y1={sy(0)} y2={sy(0)} stroke="var(--foreground)" strokeOpacity={0.4} vectorEffect="non-scaling-stroke" />
          {points.length > 1 &&
            classes.map((assetClass) => {
              const color = colorOf(assetClass);
              const segments = [];
              for (let i = 0; i < points.length - 1; i++) {
                const from = points[i].byClass[assetClass];
                const to = points[i + 1].byClass[assetClass];
                if (from === undefined || to === undefined) continue;
                const solid = points[i].source === 'measured' && points[i + 1].source === 'measured';
                segments.push(
                  <line
                    key={i}
                    x1={sx(i)}
                    y1={sy(from.driftPp)}
                    x2={sx(i + 1)}
                    y2={sy(to.driftPp)}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={solid ? undefined : '4 3'}
                    vectorEffect="non-scaling-stroke"
                  />,
                );
              }
              return <g key={assetClass}>{segments}</g>;
            })}
        </svg>

        {cursorPoint && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${cursorLeftPct}%` }} />
            {classes.map((assetClass) => {
              const entry = cursorPoint.byClass[assetClass];
              if (!entry) return null;
              return (
                <span
                  key={assetClass}
                  className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
                  style={{ left: `${cursorLeftPct}%`, top: `${(sy(entry.driftPp) / VIEW_H) * 100}%`, backgroundColor: colorOf(assetClass) }}
                />
              );
            })}
          </div>
        )}

        {/* Final labels — «Azioni +1,3» — outside the scaled SVG so the text never stretches. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {classes.map((assetClass) => {
            const last = points[points.length - 1]?.byClass[assetClass];
            if (!last) return null;
            return (
              <span
                key={assetClass}
                className="absolute right-0 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] tabular-nums"
                style={{ top: `${(sy(last.driftPp) / VIEW_H) * 100}%`, color: colorOf(assetClass) }}
              >
                {ASSET_CLASS_LABELS[assetClass] ?? assetClass} {formatSignedPp(last.driftPp)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="relative mt-1.5 h-[14px]" aria-hidden="true">
        {pickAxisIndices(points.length).map((i) => (
          <span
            key={i}
            className="absolute top-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground"
            style={{
              left: `${points.length > 1 ? (i / (points.length - 1)) * 100 : 0}%`,
              transform: i === 0 ? 'none' : i === points.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {trajectoryPointLabel(points[i].month)}
          </span>
        ))}
      </div>

      {reading && (
        <>
          <p className="mt-2 text-[11px] leading-[1.5]" aria-live="polite">
            <span className="font-mono tabular-nums text-muted-foreground">{reading.when}</span>
            {reading.items.map((item) => (
              <span key={item.label} className={cn('font-mono tabular-nums', item.outOfBand ? 'text-warning-foreground' : 'text-muted-foreground')}>
                {' · '}
                {item.text}
              </span>
            ))}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{ACCUMULO_DRIFT_CHART_LEGEND}</p>
        </>
      )}
    </div>
  );
}
