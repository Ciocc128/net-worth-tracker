'use client';

/**
 * SCENARI A CONFRONTO — «e se i mercati vanno diversamente?»: Orso, Base and Toro as rows, each
 * with its swatch (the scenario's chart slot), the median at the horizon in today's euros as the
 * row's figure and, with a threshold, its probability. A chart slot is not a text colour: the
 * label stays `text-foreground` beside its 8px swatch.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { ScenarioKey } from '@/lib/utils/monteCarloSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { SCENARIO_COLOR } from '@/lib/constants/scenarioColors';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

export interface ProjectionScenarioRow {
  key: ScenarioKey;
  label: string;
  median: number;
  /** The row's note (the probability of the threshold, when there is one). */
  note: Narrative;
  /** 0–100, fills the 3px track; null with no threshold. */
  fillPct: number | null;
}

interface ScenariTileProps {
  reading: Narrative;
  aside: string;
  rows: ProjectionScenarioRow[];
  footer: Narrative;
  className?: string;
}

export function ScenariTile({ reading, aside, rows, footer, className }: ScenariTileProps) {
  return (
    <Tile eyebrow="Scenari a confronto" aside={aside} reading={reading} ariaLabel="Scenari a confronto" className={className}>
      <ul className="mt-3.5 flex flex-col divide-y divide-border" aria-label="Mediana per scenario">
        {rows.map((row) => {
          const color = SCENARIO_COLOR[row.key];
          return (
            <li key={row.key} className="flex flex-col py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
                  {row.label}
                </span>
                <span className="font-mono text-[16px] font-semibold leading-none tabular-nums text-foreground">{cachedFormatCurrencyEUR(row.median, true)}</span>
              </div>
              {row.fillPct !== null && (
                <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, row.fillPct))}%`, background: color }} />
                </div>
              )}
              <NarrativeText segments={row.note} className="mt-1.5 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
            </li>
          );
        })}
      </ul>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
