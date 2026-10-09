'use client';

/**
 * TAPPE — «e a 10, 20, 30, 40, 50 anni?»: one row per milestone that fits the run (plus the
 * chosen horizon), the 10th, the median and the 90th percentile in today's euros, the median's
 * nominal figure in small print, and the probability of the threshold. The scenario is the tile's
 * scope (`AsideToggle`); the default is Base, the verdict's.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { ProjectionFigures, ScenarioKey } from '@/lib/utils/projectionSummary';
import { formatPercentage } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { AsideToggle } from '@/components/ui/aside-toggle';

const SCOPE_OPTIONS = [
  { value: 'bear' as const, label: 'Bear' },
  { value: 'base' as const, label: 'Base' },
  { value: 'bull' as const, label: 'Bull' },
];

interface TappeTileProps {
  reading: Narrative;
  rows: ProjectionFigures[];
  scenario: ScenarioKey;
  onScenarioChange: (scenario: ScenarioKey) => void;
  /** The chosen horizon: its row is the one the verdict reads. */
  horizon: number;
  hasThreshold: boolean;
  /** RN3: the threshold moves with the year, so each row says its own figure under the percentage; a typed one is the footer's. */
  showRowThreshold: boolean;
  footer: Narrative;
  className?: string;
}

// § 21 RE4: a percentile at or under zero reads «esaurito», never a negative figure.
const compact = (value: number) => (Math.round(value) <= 0 ? 'esaurito' : cachedFormatCurrencyEUR(value, true));

export function TappeTile({ reading, rows, scenario, onScenarioChange, horizon, hasThreshold, showRowThreshold, footer, className }: TappeTileProps) {
  return (
    <Tile
      eyebrow="Tappe"
      aside={<AsideToggle options={SCOPE_OPTIONS} value={scenario} onChange={onScenarioChange} ariaLabel="Scenario delle tappe" />}
      reading={reading}
      ariaLabel="Valore del portafoglio per tappa"
      className={className}
    >
      <div className="-mx-5 mt-3.5 overflow-x-auto px-5">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold')}>
                Tra
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold')}>
                Anno
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>
                10°
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>
                Mediana
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>
                90°
              </th>
              {hasThreshold && (
                <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>
                  Sopra la soglia
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const chosen = row.year === horizon;
              return (
                <tr key={row.year} className={cn('border-t border-border', chosen && 'bg-muted/50')}>
                  <th scope="row" className="py-2 text-left font-mono font-normal tabular-nums text-foreground">
                    {row.year} {row.year === 1 ? 'anno' : 'anni'}
                  </th>
                  <td className="py-2 text-left font-mono tabular-nums text-muted-foreground">
                    {row.calendarYear}
                    {row.age !== null && <span className="ml-1.5 text-[11px]">{row.age} anni</span>}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-foreground">{compact(row.p10)}</td>
                  <td className="py-2 text-right font-mono font-semibold tabular-nums text-foreground">
                    {compact(row.p50)}
                    <span className="block text-[10px] font-normal text-muted-foreground">nominale {compact(row.p50Nominal)}</span>
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-foreground">{compact(row.p90)}</td>
                  {hasThreshold && (
                    <td className="py-2 text-right font-mono tabular-nums text-foreground">
                      {row.probabilityAtLeast !== null ? formatPercentage(row.probabilityAtLeast, Number.isInteger(Math.round(row.probabilityAtLeast * 10) / 10) ? 0 : 1) : '—'}
                      {showRowThreshold && row.threshold !== null && <span className="block text-[10px] font-normal text-muted-foreground">di {compact(row.threshold)}</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
