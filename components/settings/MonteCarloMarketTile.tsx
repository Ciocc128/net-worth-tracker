'use client';

/**
 * IMPOSTAZIONI › SIMULAZIONI — «Ipotesi di mercato»: the CAGR and the volatility of the seven classes
 * the Monte Carlo simulates, scenario by scenario (Bear · Base · Bull), plus the inflation and the
 * commodity sub-category read as Oro (doc/montecarlo/README.md § 5.1).
 *
 * A controlled tile: the page owns the draft, the dirty snapshot and the single «Salva» (one Save
 * for the whole page, the state per tab). The Monte Carlo and the Ventaglio READ what is saved
 * here through `resolveMonteCarloMarketForPortfolio`; they declare it, they never edit it.
 *
 * The «media» next to each pair is the arithmetic mean the lognormal draws imply (rule R1): the
 * CAGR typed is the median compound growth, the mean is a little higher, and a reader comparing
 * with a source that prints an arithmetic average needs both.
 */

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { MonteCarloMarketScenario } from '@/types/assets';
import type { Narrative } from '@/lib/utils/narrative';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_CLASS_SOURCES, getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';
import { type MonteCarloScenarioKey } from '@/lib/utils/monteCarloMarket';
import { toLogNormal } from '@/lib/utils/monteCarloDraw';
import { portfolioCompoundReturn, type FireWeightsOrigin } from '@/lib/utils/fireAssumptions';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { SCENARIO_COLOR } from '@/lib/constants/scenarioColors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

/** The draft the page edits: the three scenarios and the Oro sub-category (undefined = never chosen, the default rule applies). */
export interface MonteCarloMarketDraft {
  scenarios: Record<MonteCarloScenarioKey, MonteCarloMarketScenario>;
  goldSubCategory: string | null | undefined;
  /** The 21 correlations (upper triangle), as typed; full precision after a correction. */
  correlations: number[];
  /** Percent added to the Liquidità return to price the leverage's debt (R4). */
  leverageSpread: number;
}

interface MonteCarloMarketTileProps {
  reading: Narrative;
  draft: MonteCarloMarketDraft;
  onDraftChange: (draft: MonteCarloMarketDraft) => void;
  /** The commodity sub-categories the user can name as Oro. */
  commoditySubCategories: string[];
  /** The sub-category in force: the draft's, or the one the default rule finds. */
  effectiveGoldSubCategory: string | null;
  /** The weights the FIRE page simulates (targets of Allocazione, else the portfolio held): the tile shows what they return on the typed numbers. */
  portfolio?: { weights: Record<MonteCarloClass, number>; origin: FireWeightsOrigin; /** Percent a year of TER and stamp duty (RC3); the rates shown are net of it. */ costPct?: number } | null;
  disabled?: boolean;
  className?: string;
}

const PORTFOLIO_SUBJECT: Record<FireWeightsOrigin, string> = {
  targets: 'Il portafoglio target rende',
  holdings: 'Il portafoglio di oggi rende',
  default: 'Un portafoglio 60/40 rende',
};

const SCENARIO_OPTIONS: { value: MonteCarloScenarioKey; label: string }[] = [
  { value: 'bear', label: 'Bear' },
  { value: 'base', label: 'Base' },
  { value: 'bull', label: 'Bull' },
];

const NONE_VALUE = '__none__';

const formatForInput = (value: number): string => String(Number.parseFloat(value.toFixed(4))).replace('.', ',');

/** A numeric text field that keeps what is typed («5,», «-») and commits every complete number. */
export function NumberField({
  value,
  onCommit,
  ariaLabel,
  disabled,
  className,
  decimals,
  step,
  min,
  max,
}: {
  value: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  /** Fixed decimals shown (a correlation shows two; the saved value keeps its full precision). */
  decimals?: number;
  /** Arrow-key step, clamped to `min`/`max`. */
  step?: number;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      value={text ?? (decimals === undefined ? formatForInput(value) : value.toFixed(decimals).replace('.', ','))}
      onKeyDown={
        step === undefined
          ? undefined
          : (event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              const raw = value + (event.key === 'ArrowUp' ? step : -step);
              const snapped = Math.round(raw / step) * step;
              onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(snapped.toFixed(6)))));
              setText(null);
            }
      }
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number.parseFloat(event.target.value.replace(',', '.'));
        if (Number.isFinite(parsed)) onCommit(parsed);
      }}
      onBlur={() => setText(null)}
      className={cn('h-8 px-1 text-center font-mono text-[12px] tabular-nums', className)}
    />
  );
}

export function MonteCarloMarketTile({
  reading,
  draft,
  onDraftChange,
  commoditySubCategories,
  effectiveGoldSubCategory,
  portfolio,
  disabled,
  className,
}: MonteCarloMarketTileProps) {
  const [scenarioKey, setScenarioKey] = useState<MonteCarloScenarioKey>('base');
  const scenario = draft.scenarios[scenarioKey];
  const scenarioLabel = SCENARIO_OPTIONS.find((option) => option.value === scenarioKey)?.label ?? '';

  const updateScenario = (patch: (current: MonteCarloMarketScenario) => MonteCarloMarketScenario) =>
    onDraftChange({ ...draft, scenarios: { ...draft.scenarios, [scenarioKey]: patch(scenario) } });

  const updateClass = (cls: MonteCarloClass, field: 'cagr' | 'volatility', value: number) =>
    updateScenario((current) => ({ ...current, classes: { ...current.classes, [cls]: { ...current.classes[cls], [field]: value } } }));

  const resetScenario = () => onDraftChange({ ...draft, scenarios: { ...draft.scenarios, [scenarioKey]: getDefaultMonteCarloMarket().scenarios[scenarioKey] } });

  // The Oro select lists the configured names, plus the one in force when it is not among them.
  const goldOptions = effectiveGoldSubCategory && !commoditySubCategories.includes(effectiveGoldSubCategory) ? [...commoditySubCategories, effectiveGoldSubCategory] : commoditySubCategories;

  return (
    <Tile eyebrow="Ipotesi di mercato" aside="CAGR e volatilità annui, %" reading={reading} ariaLabel="Ipotesi di mercato delle simulazioni" className={className}>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedPill
          options={SCENARIO_OPTIONS}
          value={scenarioKey}
          onChange={setScenarioKey}
          layoutId="settings-mc-scenario"
          ariaLabel="Scenario di mercato"
          semantics="radio"
        />
        <Button type="button" variant="ghost" size="sm" onClick={resetScenario} disabled={disabled} className="h-8">
          <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Ripristina default · {scenarioLabel}
        </Button>
      </div>

      {portfolio ? (
        <p className="mt-3 text-[13px] text-muted-foreground" data-testid="mc-market-portfolio-return">
          {PORTFOLIO_SUBJECT[portfolio.origin]} (composto):{' '}
          {SCENARIO_OPTIONS.map((option, index) => {
            const { cagr } = portfolioCompoundReturn(portfolio.weights, draft.scenarios[option.value], draft.correlations, draft.leverageSpread, portfolio.costPct ?? 0);
            return (
              <span key={option.value}>
                {index > 0 ? ' · ' : ''}
                {option.label} <span className="font-mono font-medium tabular-nums text-foreground">{formatPercentageIt(Math.round(cagr * 10) / 10, 1)}</span>
              </span>
            );
          })}
          {portfolio.costPct ? <span> · al netto di costi {formatPercentageIt(Math.round(portfolio.costPct * 100) / 100, 2)}</span> : null}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col" role="group" aria-label={`Ipotesi dello scenario ${scenarioLabel}`}>
        <div className="grid grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr] items-end gap-2 pb-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SCENARIO_COLOR[scenarioKey] }} aria-hidden="true" />
            <span className={TILE_SUB_EYEBROW_CLASS}>Classe</span>
          </span>
          <span className="text-center">CAGR</span>
          <span className="text-center">Volatilità</span>
          <span className="text-center">Media</span>
        </div>
        {MONTE_CARLO_CLASSES.map((cls) => {
          const params = scenario.classes[cls];
          const mean = toLogNormal(params).arithmeticMean * 100;
          const source = MONTE_CARLO_CLASS_SOURCES[cls];
          return (
            <div key={cls} className="grid grid-cols-[minmax(0,1.6fr)_1fr_1fr_1fr] items-center gap-2 border-t border-border py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{MONTE_CARLO_CLASS_LABELS[cls]}</p>
                <p className="truncate text-[10.5px] leading-[1.35] text-muted-foreground" title={`${source.series}, ${source.period}${source.note ? `. ${source.note}` : ''}`}>
                  {source.series} · {source.period}
                </p>
              </div>
              <NumberField value={params.cagr} onCommit={(value) => updateClass(cls, 'cagr', value)} ariaLabel={`${scenarioLabel}, CAGR ${MONTE_CARLO_CLASS_LABELS[cls]} (%)`} disabled={disabled} />
              <NumberField value={params.volatility} onCommit={(value) => updateClass(cls, 'volatility', value)} ariaLabel={`${scenarioLabel}, volatilità ${MONTE_CARLO_CLASS_LABELS[cls]} (%)`} disabled={disabled} />
              <span className="text-center font-mono text-[12px] tabular-nums text-muted-foreground" aria-label={`media aritmetica ${MONTE_CARLO_CLASS_LABELS[cls]}`}>
                {mean.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-[13px] font-medium">Inflazione · {scenarioLabel} %</span>
          <NumberField
            value={scenario.inflationRate}
            onCommit={(value) => updateScenario((current) => ({ ...current, inflationRate: value }))}
            ariaLabel={`${scenarioLabel}, inflazione (%)`}
            disabled={disabled}
            className="w-20"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <Label htmlFor="mc-market-gold" className="text-[13px]">
            Sottocategoria dell&apos;oro
          </Label>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Le materie prime in questa sottocategoria sono simulate come Oro, il resto come Materie prime.</p>
        </div>
        <Select
          value={effectiveGoldSubCategory ?? NONE_VALUE}
          onValueChange={(value) => onDraftChange({ ...draft, goldSubCategory: value === NONE_VALUE ? null : value })}
          disabled={disabled}
        >
          <SelectTrigger id="mc-market-gold" className="w-52" aria-label="Sottocategoria dell'oro">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Nessuna</SelectItem>
            {goldOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <Label htmlFor="mc-market-spread" className="text-[13px]">
            Spread della leva %
          </Label>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
            Il debito costa la liquidità dell&apos;anno più{' '}
            <span className="font-mono tabular-nums">{draft.leverageSpread.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%</span>. Conta solo se i pesi del Monte Carlo sommano oltre il 100%.
          </p>
        </div>
        <NumberField
          value={draft.leverageSpread}
          onCommit={(value) => onDraftChange({ ...draft, leverageSpread: value })}
          ariaLabel="Spread della leva (%)"
          disabled={disabled}
          className="w-20"
          step={0.1}
          min={0}
          max={20}
        />
      </div>
    </Tile>
  );
}
