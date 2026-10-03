'use client';

/**
 * IMPOSTAZIONI › SIMULAZIONI — «Correlazioni»: the 21 pairs of the correlation matrix the seven
 * Monte Carlo classes are drawn with (doc/montecarlo/README.md § 6.1).
 *
 * One list per class: «Azioni con…» opens the six pairs with the classes that follow it in
 * `MONTE_CARLO_CLASSES`, so every pair appears once. The classes the portfolio holds come first and
 * open; the others are closed. A controlled tile — the page owns the draft and the single «Salva»,
 * where rule R5 corrects a matrix that is not valid; the pairs it changed stay marked
 * «scritto 0,90 → usato 0,50» until the next Save.
 */

import { ChevronDown, RotateCcw } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_CORRELATIONS_SOURCE, getDefaultMonteCarloCorrelations } from '@/lib/constants/monteCarloMarketDefaults';
import { pairIndices } from '@/lib/utils/correlationMatrix';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile } from '@/components/ui/tile';
import { NumberField } from './MonteCarloMarketTile';

/** A pair the last Save adapted: what was written, what is used now. */
export interface CorrelationCorrection {
  index: number;
  written: number;
  used: number;
}

interface MonteCarloCorrelationsTileProps {
  reading: Narrative;
  /** The 21 values of the draft. */
  correlations: number[];
  onChange: (correlations: number[]) => void;
  /** The classes the portfolio holds: their lists come first and open. */
  heldClasses: MonteCarloClass[];
  corrections: CorrectionsByIndex;
  disabled?: boolean;
  className?: string;
}

export type CorrectionsByIndex = Record<number, CorrelationCorrection>;

const PAIRS = pairIndices(MONTE_CARLO_CLASSES.length);

const formatTwo = (value: number) => value.toFixed(2).replace('.', ',');

export function MonteCarloCorrelationsTile({ reading, correlations, onChange, heldClasses, corrections, disabled, className }: MonteCarloCorrelationsTileProps) {
  // Every class but the last has successors. Held classes first (open), then the others (closed).
  const groups = MONTE_CARLO_CLASSES.slice(0, -1).map((cls, rowIndex) => ({ cls, rowIndex, held: heldClasses.includes(cls) }));
  const ordered = [...groups.filter((group) => group.held), ...groups.filter((group) => !group.held)];
  const defaults = getDefaultMonteCarloCorrelations();
  const source = MONTE_CARLO_CORRELATIONS_SOURCE;

  const setPair = (index: number, value: number) => onChange(correlations.map((current, i) => (i === index ? value : current)));

  return (
    <Tile eyebrow="Correlazioni" aside="log-rendimenti annui, da −1 a 1" reading={reading} ariaLabel="Correlazioni tra le classi delle simulazioni" className={className}>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-[11px] leading-[1.4] text-muted-foreground" title={source.note}>
          {source.series} · {source.period}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(defaults)} disabled={disabled} className="h-8">
          <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Ripristina default
        </Button>
      </div>

      <div className="mt-3 flex flex-col" role="group" aria-label="Correlazioni per classe">
        {ordered.map(({ cls, rowIndex, held }) => {
          const pairs = PAIRS.map(([i, j], index) => ({ i, j, index })).filter((pair) => pair.i === rowIndex);
          return (
            <Collapsible key={cls} defaultOpen={held} className="border-t border-border">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 py-2 text-left text-[13px] font-medium" aria-label={`${MONTE_CARLO_CLASS_LABELS[cls]} con…`}>
                <span>
                  {MONTE_CARLO_CLASS_LABELS[cls]} con…
                  {held && <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">in portafoglio</span>}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col pb-2">
                  {pairs.map(({ j, index }) => {
                    const other = MONTE_CARLO_CLASSES[j];
                    const correction = corrections[index];
                    // The note is shown while the field still holds what the correction wrote.
                    const showCorrection = !!correction && Math.abs(correlations[index] - correction.used) < 1e-9;
                    return (
                      <div key={index} className="flex items-center justify-between gap-3 py-1.5">
                        <div className="min-w-0">
                          <span className="text-[13px]">{MONTE_CARLO_CLASS_LABELS[other]}</span>
                          {showCorrection && (
                            <p className={cn('text-[11px] leading-[1.35] text-muted-foreground')}>
                              scritto {formatTwo(correction.written)} → usato {formatTwo(correction.used)}
                            </p>
                          )}
                        </div>
                        <NumberField
                          value={correlations[index]}
                          onCommit={(value) => setPair(index, value)}
                          ariaLabel={`Correlazione ${MONTE_CARLO_CLASS_LABELS[cls]} con ${MONTE_CARLO_CLASS_LABELS[other]}`}
                          disabled={disabled}
                          decimals={2}
                          step={0.05}
                          min={-1}
                          max={1}
                          className={cn('w-20', showCorrection && 'border-primary')}
                        />
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </Tile>
  );
}
