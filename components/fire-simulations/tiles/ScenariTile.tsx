'use client';

/**
 * SCENARI — «e se il mercato va diversamente?»: the three scenarios as rows — Bear · Base ·
 * Bull, each with its growth and inflation as a caption and its FIRE year with the distance in
 * years — and a footer that says the model in words. The base row is set semibold: it is the
 * scenario the verdict and the Traguardo run on.
 *
 * Since 2026-10-05 (FEAT FIRE) the tile also draws the three curves, left of the rows, which are
 * their legend: one tile for «e se il mercato va diversamente?», figures and drawing together. The
 * chart was a view of the Traguardo's toggle until then, and repeated what these rows say. The
 * chart is passed in as `chart` (this tile knows nothing about Recharts) and fills an absolutely
 * positioned box, like the Traguardo's.
 *
 * The swatch takes the same colour the Scenari chart gives that series (`SCENARIO_COLOR`, theme
 * tokens defaulting to slots 5 / 1 / 2), so a row and its line share a hue on
 * every theme. The old page had the same three numbers as KPI chips above the chart; inside a
 * tile they are rows, so the year and the parameters read as one line each.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { ScenarioRow } from '@/lib/utils/fireSummary';
import { SCENARIO_COLOR } from '@/lib/constants/scenarioColors';
import { formatRate } from '@/lib/utils/fireNarrative';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface ScenariTileProps {
  reading: Narrative;
  rows: ScenarioRow[];
  /** The projection's horizon, for the «oltre N anni» caption. */
  horizonYears: number;
  /** The deterministic projection (three curves and the target line), or the message that replaces it. */
  chart: ReactNode;
  /** The chart's legend in words, then the model: `describeScenariosChartLegend` + `describeScenariosFooter`. */
  footer: Narrative;
  className?: string;
}


/** «tra 6 anni» / «tra 1 anno» / «già raggiunto» (year 0: the walk tests today before stepping). */
function distance(years: number | null, horizonYears: number, quotaLabel?: string): string {
  if (years === null && quotaLabel) return `all’età obiettivo il ${quotaLabel} del numero FIRE`;
  if (years === null) return `oltre ${horizonYears} anni`;
  if (years === 0) return 'già raggiunto';
  return years === 1 ? 'tra 1 anno' : `tra ${years} anni`;
}

export function ScenariTile({ reading, rows, horizonYears, chart, footer, className }: ScenariTileProps) {

  return (
    <Tile eyebrow="Scenari" aside="crescita · inflazione" reading={reading} ariaLabel="Scenari di mercato" className={className}>
      <div className="mt-2.5 grid grid-cols-1 gap-x-8 gap-y-3 desktop:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
      <div className="relative order-2 min-h-[240px] desktop:order-1">
        <div className="absolute inset-0">{chart}</div>
      </div>
      <ul className="order-1 flex flex-col divide-y divide-border self-start desktop:order-2" aria-label="Anno del FIRE per scenario">
        {rows.map((row) => {
          const isBase = row.key === 'base';
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 py-[9px]">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SCENARIO_COLOR[row.key] }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className={cn('block text-[13px] text-foreground', isBase && 'font-semibold')}>{row.label}</span>
                  <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatRate(row.growthRate)} · {formatRate(row.inflationRate)}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                {/* A year cell prints the year; a scenario reached today prints «oggi» — the year
                    it would print is this one, and «2026 · già raggiunto» reads as a date. */}
                <span className={cn('block font-mono text-[14px] tabular-nums text-foreground', isBase && 'font-semibold')}>
                  {row.yearsToFire === 0 ? 'oggi' : (row.calendarYear ?? '—')}
                </span>
                <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{distance(row.yearsToFire, horizonYears, row.quotaLabel)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      </div>

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
