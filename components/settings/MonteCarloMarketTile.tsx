'use client';

/**
 * IMPOSTAZIONI › SIMULAZIONI — «Ipotesi di mercato»: the REAL CAGR, the volatility and the uncertainty of the
 * seven classes the Monte Carlo simulates, one expected inflation, and the commodity sub-category read as Oro
 * (doc/montecarlo/README.md § 14.9).
 *
 * A controlled tile: the page owns the draft, the dirty snapshot and the single «Salva» (one Save
 * for the whole page, the state per tab). The draft holds ONLY what the user typed (`overrides`); every other
 * figure follows the defaults in force — Obbligazioni and Liquidità the ECB rates, Trend and Carry the Liquidità
 * plus a premium (RQ2) — so the tile resolves them with `buildMarketNumbers` and says where each comes from.
 * The Monte Carlo and the Ventaglio READ what is saved here through `resolveMonteCarloMarketForPortfolio`;
 * they declare it, they never edit it.
 *
 * The «media» of each class (the arithmetic mean the lognormal draws imply, rule R1) is in the row's `title`.
 */

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { MonteCarloClassOverride } from '@/types/assets';
import type { Narrative } from '@/lib/utils/narrative';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { describeAnchorLines } from '@/lib/utils/marketAnchors';
import {
  MONTE_CARLO_CLASS_DEFAULTS,
  MONTE_CARLO_CLASS_SOURCES,
  MONTE_CARLO_FROZEN_ANCHORS,
  MONTE_CARLO_HEDGEABLE_CLASSES,
  defaultCorrelations,
  normalizeHedge,
  type MonteCarloAnchors,
  type MonteCarloHedgeableClass,
} from '@/lib/constants/monteCarloMarketDefaults';
import { buildMarketNumbers, countEditedCorrelations, type MonteCarloMarketOverrides } from '@/lib/utils/monteCarloMarket';
import { describeHedgeReading } from '@/lib/utils/settingsNarrative';
import { toLogNormal } from '@/lib/utils/monteCarloDraw';
import { portfolioScenarioBand, realReturn, type FireWeightsOrigin } from '@/lib/utils/fireAssumptions';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

/** The draft the page edits: what the user typed (undefined field = the default in force) and the Oro sub-category (undefined = never chosen, the default rule applies). */
export interface MonteCarloMarketDraft {
  overrides: MonteCarloMarketOverrides;
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
  /** The ECB anchors in force and their dates (the daily cron's, else the frozen ones). */
  anchors?: MonteCarloAnchors;
  disabled?: boolean;
  className?: string;
}

const PORTFOLIO_SUBJECT: Record<FireWeightsOrigin, string> = {
  targets: 'Il portafoglio target rende',
  holdings: 'Il portafoglio di oggi rende',
  default: 'Un portafoglio 60/40 rende',
};

const NONE_VALUE = '__none__';

const formatForInput = (value: number): string => String(Number.parseFloat(value.toFixed(4))).replace('.', ',');

const fmt2 = (value: number): string => value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  anchors = MONTE_CARLO_FROZEN_ANCHORS,
  disabled,
  className,
}: MonteCarloMarketTileProps) {
  const numbers = buildMarketNumbers(draft.overrides, anchors);
  const hedged = normalizeHedge(draft.overrides.hedged);
  const writtenAny = Object.keys(draft.overrides.classes).length > 0 || draft.overrides.inflationRate !== undefined || Object.values(hedged).some(Boolean);

  const setOverrides = (overrides: MonteCarloMarketOverrides) => onDraftChange({ ...draft, overrides });
  const setField = (cls: MonteCarloClass, field: keyof MonteCarloClassOverride, value: number) =>
    setOverrides({ ...draft.overrides, classes: { ...draft.overrides.classes, [cls]: { ...draft.overrides.classes[cls], [field]: value } } });
  const resetClass = (cls: MonteCarloClass) => {
    const classes = { ...draft.overrides.classes };
    delete classes[cls];
    setOverrides({ ...draft.overrides, classes });
  };
  const resetField = (cls: MonteCarloClass, field: keyof MonteCarloClassOverride) => {
    const rest = { ...draft.overrides.classes[cls] };
    delete rest[field];
    const classes = { ...draft.overrides.classes };
    if (Object.keys(rest).length > 0) classes[cls] = rest;
    else delete classes[cls];
    setOverrides({ ...draft.overrides, classes });
  };
  // Q4 (RQ7): a default correlation follows the hedge; a matrix the user edited stays as it is.
  const withHedge = (next: Partial<Record<MonteCarloHedgeableClass, boolean>> | undefined): MonteCarloMarketDraft => {
    const matrixEdited = countEditedCorrelations(draft.correlations, hedged) > 0;
    return {
      ...draft,
      overrides: { ...draft.overrides, hedged: next },
      correlations: matrixEdited ? draft.correlations : defaultCorrelations(next),
    };
  };
  const setHedge = (cls: MonteCarloHedgeableClass, value: boolean) => {
    const next = Object.fromEntries(MONTE_CARLO_HEDGEABLE_CLASSES.filter((key) => (key === cls ? value : hedged[key])).map((key) => [key, true]));
    onDraftChange(withHedge(Object.keys(next).length > 0 ? next : undefined));
  };
  const resetAll = () => onDraftChange({ ...withHedge(undefined), overrides: { classes: {} } });

  // The Oro select lists the configured names, plus the one in force when it is not among them.
  const goldOptions = effectiveGoldSubCategory && !commoditySubCategories.includes(effectiveGoldSubCategory) ? [...commoditySubCategories, effectiveGoldSubCategory] : commoditySubCategories;

  const band = portfolio
    ? portfolioScenarioBand(
        portfolio.weights,
        numbers.scenarios.base,
        Object.fromEntries(MONTE_CARLO_CLASSES.map((cls) => [cls, numbers.classes[cls].uncertainty])) as Record<MonteCarloClass, number>,
        draft.correlations,
        draft.leverageSpread,
        portfolio.costPct ?? 0,
      )
    : null;
  const portfolioReal = band ? (['bear', 'base', 'bull'] as const).map((key) => ({ key, value: realReturn(band[key], numbers.inflationRate) })) : [];

  const anchorLines = describeAnchorLines(anchors, new Date(), fmt2);
  const anchorLine = (cls: MonteCarloClass): string | null => {
    const entry = numbers.classes[cls];
    const kind = MONTE_CARLO_CLASS_DEFAULTS[cls].kind;
    if (kind === 'anchor') {
      if (entry.origin === 'saved') return 'scritto a mano';
      return `${cls === 'bonds' ? anchorLines.aaa10y : anchorLines.estr}, meno l’inflazione`;
    }
    if (kind === 'premium') return `Base ${fmt2(entry.cagr)}% = liquidità ${fmt2(numbers.classes.cash.cagr)}% + premio`;
    return null;
  };

  return (
    <Tile eyebrow="Ipotesi di mercato" aside="in euro, termini reali, %" reading={reading} ariaLabel="Ipotesi di mercato delle simulazioni" className={className}>
      <div className="mt-3.5 flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={resetAll} disabled={disabled || !writtenAny} className="h-8">
          <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Ripristina default
        </Button>
      </div>

      {band ? (
        <p className="mt-3 text-[13px] text-muted-foreground" data-testid="mc-market-portfolio-return">
          {PORTFOLIO_SUBJECT[portfolio!.origin]} (reale, composto, 30 anni):{' '}
          {portfolioReal.map((entry, index) => (
            <span key={entry.key}>
              {index > 0 ? ' · ' : ''}
              {entry.key === 'bear' ? 'Bear' : entry.key === 'base' ? 'Base' : 'Bull'}{' '}
              <span className="font-mono font-medium tabular-nums text-foreground">{formatPercentageIt(Math.round(entry.value * 10) / 10, 1)}</span>
            </span>
          ))}
          {portfolio!.costPct ? <span> · al netto di costi {formatPercentageIt(Math.round(portfolio!.costPct * 100) / 100, 2)}</span> : null}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col" role="group" aria-label="Ipotesi di mercato per classe">
        <div className="grid grid-cols-[minmax(0,1.8fr)_1fr_1fr_1fr_28px] items-end gap-2 pb-1.5 text-[10px] text-muted-foreground">
          <span className={TILE_SUB_EYEBROW_CLASS}>Classe</span>
          <span className="text-center">CAGR reale</span>
          <span className="text-center">Volatilità</span>
          <span className="text-center">Incertezza ±</span>
          <span aria-hidden="true" />
        </div>
        {MONTE_CARLO_CLASSES.map((cls) => {
          const entry = numbers.classes[cls];
          const kind = MONTE_CARLO_CLASS_DEFAULTS[cls].kind;
          const premiumClass = kind === 'premium';
          const mean = toLogNormal({ cagr: entry.cagr, volatility: entry.volatility }).arithmeticMean * 100;
          const source = MONTE_CARLO_CLASS_SOURCES[cls];
          const written = draft.overrides.classes[cls];
          const label = MONTE_CARLO_CLASS_LABELS[cls];
          const sub = anchorLine(cls);
          const canUseAnchor = kind === 'anchor' && written?.cagr !== undefined;
          return (
            <div
              key={cls}
              className="grid grid-cols-[minmax(0,1.8fr)_1fr_1fr_1fr_28px] items-center gap-2 border-t border-border py-2"
              title={`media ${mean.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
              data-testid={`mc-market-row-${cls}`}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{label}</p>
                <p className="truncate text-[10.5px] leading-[1.35] text-muted-foreground" title={`${source.series}, ${source.period}${source.note ? `. ${source.note}` : ''}`}>
                  {source.series} · {source.period}
                </p>
                {sub ? (
                  <p className="text-[10.5px] leading-[1.35] text-muted-foreground">
                    {sub}
                    {canUseAnchor ? (
                      <button type="button" className="ml-1.5 underline underline-offset-2" onClick={() => resetField(cls, 'cagr')} disabled={disabled}>
                        Usa il tasso BCE
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {premiumClass ? (
                <div className="flex items-center justify-center gap-0.5">
                  <span className="font-mono text-[12px] text-muted-foreground" aria-hidden="true">
                    +
                  </span>
                  <NumberField value={entry.premium ?? 0} onCommit={(value) => setField(cls, 'premium', value)} ariaLabel={`Premio ${label} sopra la liquidità (%)`} disabled={disabled} />
                </div>
              ) : (
                <NumberField value={entry.cagr} onCommit={(value) => setField(cls, 'cagr', value)} ariaLabel={`CAGR reale ${label} (%)`} disabled={disabled} />
              )}
              <NumberField value={entry.volatility} onCommit={(value) => setField(cls, 'volatility', value)} ariaLabel={`Volatilità ${label} (%)`} disabled={disabled} />
              <NumberField value={entry.uncertainty} onCommit={(value) => setField(cls, 'uncertainty', value)} ariaLabel={`Incertezza ${label} (punti)`} disabled={disabled} />
              {written ? (
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Ripristina ${label}`}
                  onClick={() => resetClass(cls)}
                  disabled={disabled}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="min-w-0">
            <span className="text-[13px] font-medium">Inflazione attesa %</span>
            <p className="text-[10.5px] leading-[1.35] text-muted-foreground">
              {numbers.inflationOrigin === 'anchor' ? anchorLines.inflation : 'scritta a mano'}
              {numbers.inflationOrigin === 'saved' ? (
                <button type="button" className="ml-1.5 underline underline-offset-2" onClick={() => setOverrides({ ...draft.overrides, inflationRate: undefined })} disabled={disabled}>
                  Usa il dato BCE
                </button>
              ) : null}
            </p>
          </div>
          <NumberField
            value={numbers.inflationRate}
            onCommit={(value) => setOverrides({ ...draft.overrides, inflationRate: value })}
            ariaLabel="Inflazione attesa (%)"
            disabled={disabled}
            className="w-20"
          />
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4" role="group" aria-label="Copertura del cambio" data-testid="mc-market-hedge">
        <span className="text-[13px] font-medium">Copertura del cambio</span>
        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground" data-testid="mc-market-hedge-reading">
          {describeHedgeReading(hedged)}
        </p>
        <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {MONTE_CARLO_HEDGEABLE_CLASSES.map((cls) => (
            <div key={cls} className="flex items-center justify-between gap-3 py-1.5">
              <Label htmlFor={`mc-market-hedge-${cls}`} className="flex-1 cursor-pointer text-[13px] font-normal">
                {MONTE_CARLO_CLASS_LABELS[cls]}
              </Label>
              <Switch id={`mc-market-hedge-${cls}`} checked={hedged[cls]} onCheckedChange={(checked) => setHedge(cls, checked)} disabled={disabled} />
            </div>
          ))}
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
