'use client';

/**
 * PARAMETRI — the plan the projection runs on, as a tile of the grid (The Input Tile Rule, last
 * position: the plan is seeded from the page's hypotheses and the page is answered before anything
 * is typed). Two blocks: the Piano (starting capital with the «Totale / Liquido» shortcuts, the
 * yearly saving seeded from the Cashflow and how many years it is paid, the horizon, the threshold,
 * the simulation count) and the Allocazione (`WeightsFields`, shared with the Monte Carlo) with the
 * DECLARATION of the market assumptions — edited in Impostazioni › Simulazioni, never here (The
 * Declaration-Tile Rule). One action row: Esegui, and the footer that says whether the figures above
 * still match what is typed.
 *
 * The form is owned by the tab as strings, so a numeric field can hold «22.» while typing.
 */

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { formatInputAmount } from '@/lib/utils/monteCarloSummary';
import type { WeightsOrigin } from '@/lib/utils/monteCarloNarrative';
import { PROJECTION_MAX_YEARS } from '@/lib/utils/projectionSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type { FireCapital } from '@/lib/utils/fireCapital';
import { describeCapitalBreakdown } from '@/lib/utils/fireAssumptionsNarrative';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { WeightsFields } from '@/components/monte-carlo/WeightsFields';

export interface ProjectionForm {
  initialPortfolio: string;
  annualSavings: string;
  savingsYears: string;
  horizon: string;
  threshold: string;
  numberOfSimulations: string;
  /** The seven class weights, percent, as typed. */
  weights: Record<MonteCarloClass, string>;
}

interface ParametriTileProps {
  reading: Narrative;
  aside: string;
  form: ProjectionForm;
  onFormChange: (patch: Partial<ProjectionForm>) => void;
  allocationSum: number;
  weightsOrigin: WeightsOrigin;
  leverage: number;
  hasTargets: boolean;
  onUseTargets?: () => void;
  onImportHoldings?: () => void;
  totalNetWorth: number;
  liquidNetWorth: number;
  /** Under the saving field: where the figure comes from. */
  savingsHint: string;
  /** Under the threshold field. */
  thresholdHint: string;
  marketDeclaration: Narrative;
  /** K1 (§ 11.6): the page's capital, for the line under «Capitale iniziale»; null while unread. */
  capital: FireCapital | null;
  /** § 12: the dated flows the run reads, one read-only line under the capital (`describeSimulationFlowsRow`); edited in the Calcolatore. */
  flowsNote: string;
  onRun: () => void;
  canRun: boolean;
  isRunning: boolean;
  footer: Narrative;
  /** The footer says the results are stale — printed in the warning tone. */
  stale: boolean;
  className?: string;
}

const CONTROL_CLASS = 'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';
const HINT_CLASS = 'mt-1 text-[11px] leading-[1.4] text-muted-foreground';
const MARKET_SETTINGS_HREF = '/dashboard/settings?tab=simulazioni';
const FLOWS_HREF = '/dashboard/fire-simulations?tab=fire';

export function ParametriTile({
  reading,
  aside,
  form,
  onFormChange,
  allocationSum,
  weightsOrigin,
  leverage,
  hasTargets,
  onUseTargets,
  onImportHoldings,
  totalNetWorth,
  liquidNetWorth,
  savingsHint,
  thresholdHint,
  marketDeclaration,
  capital,
  flowsNote,
  onRun,
  canRun,
  isRunning,
  footer,
  stale,
  className,
}: ParametriTileProps) {
  return (
    <Tile eyebrow="Parametri" aside={aside} reading={reading} ariaLabel="Parametri della proiezione" className={className}>
      <div className="mt-3.5 grid grid-cols-1 gap-5 desktop:grid-cols-12">
        {/* Piano (7) */}
        <div className="flex min-w-0 flex-col gap-4 desktop:col-span-7">
          <p className={TILE_SUB_EYEBROW_CLASS}>Piano</p>

          <div>
            <Label htmlFor="pr-initialPortfolio" className="text-[13px]">
              Capitale di partenza (€)
            </Label>
            <Input id="pr-initialPortfolio" type="text" inputMode="decimal" value={form.initialPortfolio} onChange={(e) => onFormChange({ initialPortfolio: e.target.value })} className={CONTROL_CLASS} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onFormChange({ initialPortfolio: formatInputAmount(totalNetWorth) })}>
                Totale · {cachedFormatCurrencyEUR(totalNetWorth, true)}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onFormChange({ initialPortfolio: formatInputAmount(liquidNetWorth) })}>
                Liquido · {cachedFormatCurrencyEUR(liquidNetWorth, true)}
              </Button>
            </div>
            {capital && <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">Capitale {describeCapitalBreakdown(capital)}.</p>}
            <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">{flowsNote}.</p>
            <Link href={FLOWS_HREF} className="inline-flex min-h-11 items-center text-[11px] text-foreground underline underline-offset-2 desktop:min-h-0">
              Modifica nel Calcolatore › Parametri
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pr-annualSavings" className="text-[13px]">
                Versamento annuo (€)
              </Label>
              <Input id="pr-annualSavings" type="number" inputMode="numeric" min="0" step="1000" value={form.annualSavings} onChange={(e) => onFormChange({ annualSavings: e.target.value })} className={CONTROL_CLASS} />
              <p className={HINT_CLASS}>{savingsHint}</p>
            </div>
            <div>
              <Label htmlFor="pr-savingsYears" className="text-[13px]">
                Per quanti anni
              </Label>
              <Input id="pr-savingsYears" type="number" inputMode="numeric" min="0" max={PROJECTION_MAX_YEARS} step="1" value={form.savingsYears} onChange={(e) => onFormChange({ savingsYears: e.target.value })} className={CONTROL_CLASS} />
              <p className={HINT_CLASS}>0 anni = solo il capitale di oggi</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="pr-horizon" className="text-[13px]">
                Orizzonte (anni)
              </Label>
              <Input id="pr-horizon" type="number" inputMode="numeric" min="1" max={PROJECTION_MAX_YEARS} step="1" value={form.horizon} onChange={(e) => onFormChange({ horizon: e.target.value })} className={CONTROL_CLASS} />
              <p className={HINT_CLASS}>da 1 a {PROJECTION_MAX_YEARS}</p>
            </div>
            <div>
              <Label htmlFor="pr-threshold" className="text-[13px]">
                Soglia (€ di oggi)
              </Label>
              <Input id="pr-threshold" type="text" inputMode="decimal" value={form.threshold} onChange={(e) => onFormChange({ threshold: e.target.value })} className={CONTROL_CLASS} />
              <p className={HINT_CLASS}>{thresholdHint}</p>
            </div>
            <div>
              <Label htmlFor="pr-numberOfSimulations" className="text-[13px]">
                Simulazioni
              </Label>
              <Input id="pr-numberOfSimulations" type="number" inputMode="numeric" min="1000" max="50000" step="1000" value={form.numberOfSimulations} onChange={(e) => onFormChange({ numberOfSimulations: e.target.value })} className={CONTROL_CLASS} />
              <p className={HINT_CLASS}>1.000 – 50.000 per scenario</p>
            </div>
          </div>
        </div>

        {/* Allocazione (5) and the declaration of the market */}
        <div className="flex min-w-0 flex-col gap-4 desktop:col-span-5">
          <WeightsFields
            weights={form.weights}
            onWeightsChange={(weights) => onFormChange({ weights })}
            allocationSum={allocationSum}
            weightsOrigin={weightsOrigin}
            leverage={leverage}
            hasTargets={hasTargets}
            onUseTargets={onUseTargets}
            onImportHoldings={onImportHoldings}
            idPrefix="pr-weight"
          />

          {/* Market assumptions: DECLARED here, edited in Impostazioni › Simulazioni (The Declaration-Tile Rule). */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted p-3.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>Ipotesi di mercato</p>
            <NarrativeText segments={marketDeclaration} className="text-[12px] leading-[1.5] text-muted-foreground" figureClassName="font-medium text-foreground" />
            <Link href={MARKET_SETTINGS_HREF} className="inline-flex w-fit items-center gap-1 text-[12px] font-medium text-primary underline-offset-4 hover:underline">
              Modifica in Impostazioni
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" onClick={onRun} disabled={!canRun || isRunning} className="h-9 w-full sm:w-auto">
          {isRunning ? 'Simulazione in corso…' : 'Esegui'}
        </Button>
        <NarrativeText segments={footer} className={cn('text-[11px] leading-[1.4] sm:ml-auto sm:text-right', stale ? 'text-warning-foreground' : 'text-muted-foreground')} figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
