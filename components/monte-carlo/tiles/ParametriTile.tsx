'use client';

/**
 * PARAMETRI — the plan the simulation runs on, as a tile of the grid (The Input Tile Rule, in
 * its desktop position: the answer tiles come first because the plan is auto-filled from the
 * portfolio and the page is answered before anything is typed). Two blocks: the Piano (starting
 * capital with the two «Usa» shortcuts and the read-only pension row, the horizon, the
 * withdrawal, the simulation count) and the Allocazione (seven class weights with their sum, what
 * stays outside the simulation, and the DECLARATION of the market assumptions: they are edited in
 * Impostazioni › Simulazioni, never here — The Declaration-Tile Rule). One action row: Esegui, and
 * the footer that says whether the figures above still match what is typed (`describeParametriFooter`).
 *
 * The form is owned by the tab as strings (`MonteCarloForm`), the way FireParametri's is: a
 * numeric field that keeps a string lets the user type «22.» without the value snapping back.
 */

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { MonteCarloPlan } from '@/lib/utils/monteCarloSummary';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS, type MonteCarloClass, type MonteCarloExcludedClass } from '@/lib/constants/monteCarloClasses';
import { formatInputAmount } from '@/lib/utils/monteCarloSummary';
import { describeExcludedRow, describePensionInflowRow, describeStatePensionRow, describeWithdrawalTaxRow } from '@/lib/utils/monteCarloNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

export interface MonteCarloForm {
  initialPortfolio: string;
  retirementYears: string;
  annualWithdrawal: string;
  numberOfSimulations: string;
  /** The seven class weights, percent, as typed. */
  weights: Record<MonteCarloClass, string>;
}

interface ParametriTileProps {
  reading: Narrative;
  aside: string;
  plan: MonteCarloPlan;
  form: MonteCarloForm;
  onFormChange: (patch: Partial<MonteCarloForm>) => void;
  /** Sum of the seven weight fields as typed — the tile prints it and flags a sum off 100. */
  allocationSum: number;
  totalNetWorth: number;
  liquidNetWorth: number;
  /** Where the market assumptions come from (`describeMarketDeclaration`). */
  marketDeclaration: Narrative;
  /** EUR of real estate and crypto, left outside the simulated capital; null while unread. */
  excluded: Record<MonteCarloExcludedClass, number> | null;
  onRun: () => void;
  canRun: boolean;
  isRunning: boolean;
  footer: Narrative;
  /** The footer says the results are stale — printed in the warning tone. */
  stale: boolean;
  className?: string;
}

const CONTROL_CLASS = 'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

const MARKET_SETTINGS_HREF = '/dashboard/settings?tab=simulazioni';

export function ParametriTile({
  reading,
  aside,
  plan,
  form,
  onFormChange,
  allocationSum,
  totalNetWorth,
  liquidNetWorth,
  marketDeclaration,
  excluded,
  onRun,
  canRun,
  isRunning,
  footer,
  stale,
  className,
}: ParametriTileProps) {
  const allocationOff = Math.abs(allocationSum - 100) > 0.01;

  const excludedRow = describeExcludedRow(excluded);

  return (
    <Tile eyebrow="Parametri" aside={aside} reading={reading} ariaLabel="Parametri della simulazione" className={className}>
      <div className="mt-3.5 grid grid-cols-1 gap-5 desktop:grid-cols-12">
        {/* Piano (7) */}
        <div className="flex min-w-0 flex-col gap-4 desktop:col-span-7">
          <p className={TILE_SUB_EYEBROW_CLASS}>Piano</p>

          <div>
            <Label htmlFor="mc-initialPortfolio" className="text-[13px]">
              Patrimonio iniziale (€)
            </Label>
            <Input
              id="mc-initialPortfolio"
              type="text"
              inputMode="decimal"
              value={form.initialPortfolio}
              onChange={(e) => onFormChange({ initialPortfolio: e.target.value })}
              className={CONTROL_CLASS}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onFormChange({ initialPortfolio: formatInputAmount(totalNetWorth) })}>
                Totale · {cachedFormatCurrencyEUR(totalNetWorth, true)}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onFormChange({ initialPortfolio: formatInputAmount(liquidNetWorth) })}>
                Liquido · {cachedFormatCurrencyEUR(liquidNetWorth, true)}
              </Button>
            </div>
            {plan.inflows.map((inflow) => (
              <NarrativeText key={inflow.yearOffset} segments={describePensionInflowRow(inflow)} className="mt-2 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="mc-retirementYears" className="text-[13px]">
                Anni
              </Label>
              <Input id="mc-retirementYears" type="number" inputMode="numeric" min="1" max="60" step="1" value={form.retirementYears} onChange={(e) => onFormChange({ retirementYears: e.target.value })} className={CONTROL_CLASS} />
              <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">{plan.endAge !== null ? `fino a ${plan.endAge} anni` : `fino al ${plan.endCalendarYear}`}</p>
            </div>
            <div>
              <Label htmlFor="mc-annualWithdrawal" className="text-[13px]">
                Prelievo annuo (€)
              </Label>
              <Input id="mc-annualWithdrawal" type="number" inputMode="numeric" min="0" step="1000" value={form.annualWithdrawal} onChange={(e) => onFormChange({ annualWithdrawal: e.target.value })} className={CONTROL_CLASS} />
              <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">indicizzato all&apos;inflazione</p>
            </div>
            <div>
              <Label htmlFor="mc-numberOfSimulations" className="text-[13px]">
                Simulazioni
              </Label>
              <Input id="mc-numberOfSimulations" type="number" inputMode="numeric" min="1000" max="50000" step="1000" value={form.numberOfSimulations} onChange={(e) => onFormChange({ numberOfSimulations: e.target.value })} className={CONTROL_CLASS} />
              <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">1.000 – 50.000 per scenario</p>
            </div>
          </div>

          {/* What the withdrawal is net of and what it pays (2026-09-24): read-only rows, each
              either in the run or declared out with its reason — the same rule as the
              Calcolatore's Base di calcolo. */}
          <div className="flex flex-col gap-1.5">
            {plan.statePensions.map((pension) => (
              <NarrativeText key={`${pension.yearOffset}-${pension.annualNetToday}`} segments={describeStatePensionRow(pension)} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
            ))}
            {plan.statePensions.length === 0 && (
              <p className="text-[11px] leading-[1.4] text-muted-foreground">Pensioni statali: nessuna datata in Coast FIRE › Ipotesi (serve l&apos;età), il prelievo resta intero.</p>
            )}
            <NarrativeText segments={describeWithdrawalTaxRow(plan.withdrawalTax)} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
          </div>

        </div>

        {/* Allocazione (5) and the declaration of the market */}
        <div className="flex min-w-0 flex-col gap-4 desktop:col-span-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className={TILE_SUB_EYEBROW_CLASS}>Allocazione · dal portafoglio</p>
              <span className={cn('font-mono text-[11px] font-medium tabular-nums', allocationOff ? 'text-destructive' : 'text-foreground')}>
                {allocationOff ? `${allocationSum.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% — deve fare 100%` : '100%'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {MONTE_CARLO_CLASSES.map((cls) => (
                <div key={cls}>
                  <Label htmlFor={`mc-weight-${cls}`} className="text-[13px]">
                    {MONTE_CARLO_CLASS_LABELS[cls]} %
                  </Label>
                  <Input
                    id={`mc-weight-${cls}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="5"
                    value={form.weights[cls]}
                    onChange={(e) => onFormChange({ weights: { ...form.weights, [cls]: e.target.value } })}
                    className={CONTROL_CLASS}
                  />
                </div>
              ))}
            </div>
            {excludedRow && <NarrativeText segments={excludedRow} className="mt-2 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />}
          </div>

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
          {isRunning ? 'Simulazione in corso…' : 'Esegui simulazione'}
        </Button>
        <NarrativeText segments={footer} className={cn('text-[11px] leading-[1.4] sm:ml-auto sm:text-right', stale ? 'text-warning-foreground' : 'text-muted-foreground')} figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
