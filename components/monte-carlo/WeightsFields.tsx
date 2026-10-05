'use client';

/**
 * The Allocazione block shared by the Monte Carlo and the Proiezione Parametri tiles: the sum of
 * the seven weights (leverage above 100%), where they come from (R6), the two seeds
 * («Usa i target», «Importa il portafoglio di oggi»), the seven fields. Controlled: the owning tab keeps the form as strings, so a field can hold «22.»
 * while typing.
 */

import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS } from '@/lib/constants/monteCarloClasses';
import { describeAllocationTotal, describeWeightsSource, resolveAllocationTotalState, type WeightsOrigin } from '@/lib/utils/monteCarloNarrative';
import { cn } from '@/lib/utils';
import { ASIDE_TOGGLE_OFF_CLASS, ASIDE_TOGGLE_ON_CLASS } from '@/components/ui/aside-toggle';
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
  /** Prefix of the fields' ids («mc-weight» keeps the Monte Carlo's). */
  idPrefix?: string;
}

/**
 * The two seeds wear the pressed-toggle states of `AsideToggle` (Strumenti, Confronto): the active source is FILLED,
 * never `disabled` — a disabled button fades and read as «off» exactly when it was the one in use (owner, 2026-10-05).
 * They stay two buttons, not a toggle group: after an edit the weights are «edited» and neither is pressed.
 */
const SEED_CLASS = 'h-11 rounded-md border px-3 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-8 desktop:px-2.5';

const CONTROL_CLASS = 'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

export function WeightsFields({ weights, onWeightsChange, allocationSum, weightsOrigin, leverage, hasTargets, onUseTargets, onImportHoldings, idPrefix = 'mc-weight' }: WeightsFieldsProps) {
  const totalState = resolveAllocationTotalState(allocationSum);
  const allocationOff = totalState === 'below' || totalState === 'above';

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
          <button type="button" className={cn(SEED_CLASS, weightsOrigin === 'targets' ? ASIDE_TOGGLE_ON_CLASS : ASIDE_TOGGLE_OFF_CLASS)} onClick={onUseTargets} aria-pressed={weightsOrigin === 'targets'}>
            Usa i target
          </button>
        )}
        {onImportHoldings && (
          <button type="button" className={cn(SEED_CLASS, weightsOrigin === 'holdings' ? ASIDE_TOGGLE_ON_CLASS : ASIDE_TOGGLE_OFF_CLASS)} onClick={onImportHoldings} aria-pressed={weightsOrigin === 'holdings'}>
            Importa il portafoglio di oggi
          </button>
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
    </div>
  );
}
