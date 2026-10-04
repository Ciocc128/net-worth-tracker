'use client';

/**
 * SPESA SOSTENIBILE — «quanto posso prelevare?»: the largest annual withdrawal (today's euros) that
 * lasts the horizon in 9 simulations out of 10 on the Base scenario as the hero, its monthly and its
 * share of the capital beside it, and a 3 × 3 table of the same figure at 80 / 90 / 95% for Orso,
 * Base and Toro (S1, D-S1–D-S3). The figures belong to the LAST run (The Stale-Run Rule): the tile
 * never recomputes on a typed input.
 *
 * Hero left, table right on a wide cell (a container query); one under the other on a phone. A
 * scenario's chart slot paints only its 8px swatch: the label stays `text-foreground`.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { SustainableSpendingSummary } from '@/lib/utils/sustainableWithdrawal';
import { SCENARIO_COLOR } from '@/lib/constants/scenarioColors';
import { describeSpesaCell, describeSpesaHeroAside, SPESA_METHOD, SPESA_FOOTER } from '@/lib/utils/monteCarloNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { cn } from '@/lib/utils';

interface SpesaSostenibileTileProps {
  reading: Narrative;
  aside: string;
  summary: SustainableSpendingSummary;
  className?: string;
}

const COLUMNS = [
  { key: 'bear', label: 'Orso' },
  { key: 'base', label: 'Base' },
  { key: 'bull', label: 'Toro' },
] as const;

export function SpesaSostenibileTile({ reading, aside, summary, className }: SpesaSostenibileTileProps) {
  const verdictRow = summary.rows.find((row) => row.probability === 0.9) ?? summary.rows[0];
  const hero = verdictRow.base;
  const heroAside = describeSpesaHeroAside(hero);

  return (
    <Tile eyebrow="Spesa sostenibile" aside={aside} reading={reading} ariaLabel="Spesa sostenibile" className={className}>
      <div className="@container mt-3.5 flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 @[640px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @[640px]:items-center">
          <div>
            <p className={TILE_SUB_EYEBROW_CLASS}>Prelievo annuo · 9 simulazioni su 10 · scenario base</p>
            <p className="mt-1.5 font-mono text-[34px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground desktop:text-[42px]">
              {hero.withdrawal === null ? 'nessuno' : cachedFormatCurrencyEUR(hero.withdrawal, true)}
            </p>
            {heroAside && <p className="mt-2 font-mono text-[12px] tabular-nums text-muted-foreground">{heroAside}</p>}
          </div>

          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">Prelievo annuo sostenibile, in euro di oggi, per probabilità di successo e scenario</caption>
            <thead>
              <tr>
                <th scope="col" className="pb-2 text-left font-normal text-muted-foreground">
                  <span className="sr-only">Probabilità</span>
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.key} scope="col" className="pb-2 text-right font-normal text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SCENARIO_COLOR[column.key] }} aria-hidden="true" />
                      {column.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-t border-border">
              {summary.rows.map((row) => (
                <tr key={row.probability}>
                  <th scope="row" className="py-2 text-left font-normal text-muted-foreground">
                    {Math.round(row.probability * 100)}%
                  </th>
                  {COLUMNS.map((column) => {
                    const cell = row[column.key];
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          'py-2 text-right font-mono tabular-nums text-foreground',
                          cell.withdrawal === null && 'font-sans text-[12px] text-muted-foreground',
                          row.probability === 0.9 && column.key === 'base' && 'font-semibold',
                        )}
                      >
                        {describeSpesaCell(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TileMethodNote subject="Spesa sostenibile" summary={SPESA_FOOTER.map((segment) => segment.text).join('')}>
        {SPESA_METHOD.map((paragraph) => (
          <span key={paragraph}>{paragraph}</span>
        ))}
      </TileMethodNote>
    </Tile>
  );
}
