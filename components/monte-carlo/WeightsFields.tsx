'use client';

/**
 * The Allocazione block shared by the Monte Carlo and the Proiezione Parametri tiles: the sum of
 * the seven weights (leverage above 100%), where they come from (R6), the two seeds
 * («Usa i target», «Importa il portafoglio di oggi»), the seven fields and what stays outside the
 * simulated capital. Controlled: the owning tab keeps the form as strings, so a field can hold «22.»
 * while typing.
 */

import type { MonteCarloClass, MonteCarloExcludedClass } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS } from '@/lib/constants/monteCarloClasses';
import { describeAllocationTotal, describeExcludedRow, describeWeightsSource, resolveAllocationTotalState, type WeightsOrigin } from '@/lib/utils/monteCarloNarrative';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface WeightsFieldsProps {
  /** The seven weights, percent, as typed. */
  weights: Record<MonteCarloClass, string>;
  onWeightsChange: (weights: Record<MonteCarloClass, string>) => void;
  /** Sum of the seven fields as typed — above 100% it is leverage, off 100–300% the run is blocked. */
  allocationSum: number;
  weightsOrigin: WeightsOrigin;
  leverage: number;
  /** Allocazione has targets on the modelled classes: «Usa i target» is offered. */
  hasTargets: boolean;
  onUseTargets?: () => void;
  onImportHoldings?: () => void;
  /** EUR of real estate and crypto, left outside the simulated capital; null while unread. */
  excluded: Record<MonteCarloExcludedClass, number> | null;
  /** Prefix of the fields' ids («mc-weight» keeps the Monte Carlo's). */
  idPrefix?: string;
}

const CONTROL_CLASS = 'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

export function WeightsFields({ weights, onWeightsChange, allocationSum, weightsOrigin, leverage, hasTargets, onUseTargets, onImportHoldings, excluded, idPrefix = 'mc-weight' }: WeightsFieldsProps) {
  const totalState = resolveAllocationTotalState(allocationSum);
  const allocationOff = totalState === 'below' || totalState === 'above';
  const excludedRow = describeExcludedRow(excluded);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Allocazione</p>
        <NarrativeText
          segments={describeAllocationTotal(allocationSum)}
          className={cn('text-[11px] font-medium tabular-nums', allocationOff ? 'text-destructive' : 'text-foreground')}
          figureClassName="font-medium"
        />
      </div>
      <NarrativeText segments={describeWeightsSource({ origin: weightsOrigin, leverage, hasTargets })} className="mt-1 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
      <div className="mt-2 flex flex-wrap gap-2">
        {onUseTargets && (
          <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onUseTargets} disabled={weightsOrigin === 'targets'}>
            Usa i target
          </Button>
        )}
        {onImportHoldings && (
          <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onImportHoldings} disabled={weightsOrigin === 'holdings'}>
            Importa il portafoglio di oggi
          </Button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MONTE_CARLO_CLASSES.map((cls) => (
          <div key={cls}>
            <Label htmlFor={`${idPrefix}-${cls}`} className="text-[13px]">
              {MONTE_CARLO_CLASS_LABELS[cls]} %
            </Label>
            <Input
              id={`${idPrefix}-${cls}`}
              type="number"
              inputMode="decimal"
              min="0"
              max="300"
              step="any"
              value={weights[cls]}
              onChange={(e) => onWeightsChange({ ...weights, [cls]: e.target.value })}
              className={CONTROL_CLASS}
            />
          </div>
        ))}
      </div>
      {excludedRow && <NarrativeText segments={excludedRow} className="mt-2 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />}
    </div>
  );
}
