import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { MonthFlow, PeriodCashflowTotals, PeriodDelta } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { printedDelta } from '@/lib/utils/cashflowNarrative';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { FlowBarsChart } from './FlowBarsChart';

export interface SpendingProjection {
  /** Where spending lands at the current daily pace — a linear extrapolation, named as such. */
  projected: number;
  /** Last month's spending to read it against; null when last month has none. */
  previousExpenses: number | null;
  /** The row label of last month ("A luglio"), from the narrative module. */
  previousLabel: string;
}

interface CashflowPeriodoTileProps {
  eyebrow: string;
  aside?: ReactNode;
  reading: Narrative | null;
  totals: PeriodCashflowTotals;
  /** Against the previous period; null when there is none (a custom range). */
  delta: PeriodDelta | null;
  /** The caption of a delta ("luglio", "2025"); null when there is no previous period. */
  previousLabel: string | null;
  /** The months of the income-vs-spending chart, oldest first. */
  flows: MonthFlow[];
  /** The month the page is about, highlighted in the chart; null for a year. */
  highlightKey: string | null;
  /** The chart's sub-eyebrow («Ultimi 6 mesi», «6 mesi fino a maggio 2025», «Mese per mese»). */
  windowLabel: Narrative;
  /** The month-end projection, only while the period is the current month. */
  projection: SpendingProjection | null;
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';

/**
 * Colour of a period-over-period delta: a rise in income is good, a rise in spending is not —
 * `positiveGood` flips the reading for the Spese KPI (DESIGN.md → Delta Annotation).
 */
function deltaClass(delta: number, positiveGood: boolean): string {
  if (delta === 0) return 'text-muted-foreground';
  return (delta > 0) === positiveGood ? 'text-positive' : 'text-destructive';
}

function DeltaLine({ delta, positiveGood, previousLabel }: { delta: number | null; positiveGood: boolean; previousLabel: string | null }) {
  // No previous period, or a zero base: the line is absent rather than a placeholder.
  if (delta === null || !previousLabel) return null;
  // Decided on the printed figure: a 0,04% change prints as 0,0% and reads as no change.
  const printed = printedDelta(delta);
  if (printed === 0) return <p className="text-[11px] text-muted-foreground">come {previousLabel}</p>;
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className={cn('font-mono tabular-nums', deltaClass(delta, positiveGood))}>
        {delta > 0 ? '↑' : '↓'} {formatPercentage(printed, 1)}
      </span>{' '}
      vs {previousLabel}
    </p>
  );
}

/**
 * "Come sta andando il periodo?" in figures — the dominant tile of Tracciamento: the three
 * KPIs with their deltas, the income-vs-spending bars of the trailing months (the element
 * that stretches when the tile spans two rows), and, while the month is still running, where
 * spending lands at the current pace next to last month's figure. The savings rate and the
 * coverage ratio sit together on purpose: same relationship, two units (AGENTS.md →
 * Cashflow KPIs and Tracciamento).
 */
export function CashflowPeriodoTile({
  eyebrow,
  aside,
  reading,
  totals,
  delta,
  previousLabel,
  flows,
  highlightKey,
  windowLabel,
  projection,
  className,
}: CashflowPeriodoTileProps) {
  const { income, expenses, net, savingsRate, coverageRatio } = totals;
  const projectionClass =
    projection && projection.previousExpenses !== null && projection.previousExpenses > 0
      ? deltaClass(projection.projected - projection.previousExpenses, false)
      : 'text-foreground';

  return (
    <Tile eyebrow={eyebrow} aside={aside} reading={reading} className={className} ariaLabel="Cashflow del periodo">
      <div className="mt-4 grid grid-cols-3 gap-3.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Entrate</p>
          <p className={cn(KPI_VALUE_CLASS, income > 0 ? 'text-positive' : 'text-muted-foreground')}>
            {cachedFormatCurrencyEUR(income, true)}
          </p>
          <DeltaLine delta={delta?.income ?? null} positiveGood={true} previousLabel={previousLabel} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Spese</p>
          <p className={cn(KPI_VALUE_CLASS, expenses > 0 ? 'text-destructive' : 'text-muted-foreground')}>
            {cachedFormatCurrencyEUR(expenses, true)}
          </p>
          <DeltaLine delta={delta?.expenses ?? null} positiveGood={false} previousLabel={previousLabel} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Risparmio</p>
          <p className={cn(KPI_VALUE_CLASS, 'text-foreground')}>
            {net < 0 ? '−' : ''}
            {cachedFormatCurrencyEUR(Math.abs(net), true)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {savingsRate !== null ? (
              <span className="font-mono tabular-nums text-foreground">{formatPercentage(savingsRate, 1)}</span>
            ) : (
              <span>—</span>
            )}
            {coverageRatio !== null && (
              <>
                {' '}
                · <span className="font-mono tabular-nums">{formatNumber(coverageRatio, 2)}×</span>
              </>
            )}
          </p>
        </div>
      </div>

      {flows.length >= 2 && (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <NarrativeText segments={windowLabel} className={TILE_SUB_EYEBROW_CLASS} figureClassName="font-semibold" />
            <div className="flex gap-3 text-[11px] text-muted-foreground" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-2)' }} />
                Entrate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-1)' }} />
                Spese
              </span>
            </div>
          </div>
          <FlowBarsChart flows={flows} highlightKey={highlightKey} className="mt-2.5 flex-1" />
        </>
      )}

      {projection && (
        <div className="mt-auto flex flex-col border-t border-border pt-3.5">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-0.5')}>Spese a fine mese</p>
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-3 py-[8px]">
              <span className="text-[13px] text-muted-foreground">Al ritmo attuale</span>
              <span className={cn('font-mono text-[13px] tabular-nums', projectionClass)}>
                ~{cachedFormatCurrencyEUR(projection.projected, true)}
              </span>
            </div>
            {/* No last-month figure → no row: a placeholder is not a fact. */}
            {projection.previousExpenses !== null && projection.previousExpenses > 0 && (
              <div className="flex items-center justify-between gap-3 py-[8px]">
                <span className="text-[13px] text-muted-foreground">{projection.previousLabel}</span>
                <span className="font-mono text-[13px] tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(projection.previousExpenses, true)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Tile>
  );
}
