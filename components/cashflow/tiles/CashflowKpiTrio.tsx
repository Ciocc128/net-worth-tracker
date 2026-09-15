import type { PeriodCashflowTotals } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { printedDelta } from '@/lib/utils/cashflowNarrative';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { SeriesDot } from '@/components/ui/series-dot';

// 22px where the trio has room; in a phone's column the three five-digit figures touched, so the
// size follows the trio's own width (container units) down to a 15px floor.
const KPI_VALUE_CLASS = 'font-mono text-[clamp(15px,5.8cqw,22px)] font-bold leading-none tracking-[-0.03em] tabular-nums';

/**
 * Colour of a period-over-period delta: a rise in income is good, a rise in spending is not —
 * `positiveGood` flips the reading for the Spese KPI (DESIGN.md → Delta Annotation).
 */
export function deltaClass(delta: number, positiveGood: boolean): string {
  if (delta === 0) return 'text-muted-foreground';
  return (delta > 0) === positiveGood ? 'text-positive' : 'text-destructive';
}

/**
 * Colour of the period's savings and its rate — one sign for both: neutral by default, signed where
 * a theme names the net-figure tokens. The coverage ratio beside them stays muted, a secondary unit.
 */
export function netFigureClass(net: number): string {
  if (net > 0) return 'text-net-gain-figure';
  if (net < 0) return 'text-net-loss-figure';
  return 'text-foreground';
}

function DeltaLine({ delta, positiveGood, previousLabel }: { delta: number | null; positiveGood: boolean; previousLabel: string | null }) {
  // No previous period, or a zero base: the line is absent rather than a placeholder.
  if (delta === null) return null;
  // Decided on the printed figure: a 0,04% change prints as 0,0% and reads as no change.
  const printed = printedDelta(delta);
  if (printed === 0) return <p className="text-[11px] text-muted-foreground">{previousLabel ? `come ${previousLabel}` : 'invariate'}</p>;
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className={cn('font-mono tabular-nums', deltaClass(delta, positiveGood))}>
        {delta > 0 ? '↑' : '↓'} {formatPercentage(printed, 1)}
      </span>
      {previousLabel && <> vs {previousLabel}</>}
    </p>
  );
}

interface CashflowKpiTrioProps {
  totals: PeriodCashflowTotals;
  /** Income and spending against the previous window, in percent; null when there is no baseline. */
  incomeDelta: number | null;
  expensesDelta: number | null;
  /**
   * The caption of a delta («luglio», «2025»), printed after each arrow; null when the caller
   * prints ONE caption for both under the trio (Analisi, whose baseline is a long window name).
   */
  previousLabel: string | null;
  className?: string;
}

/**
 * Entrate · Spese · Risparmio at 22px with their deltas — the same trio on Tracciamento's hero
 * and on Analisi's Periodo tile, one component so the two cannot drift. The savings rate and
 * the coverage ratio sit together on purpose: same relationship, two units.
 */
export function CashflowKpiTrio({ totals, incomeDelta, expensesDelta, previousLabel, className }: CashflowKpiTrioProps) {
  const { income, expenses, net, savingsRate, coverageRatio } = totals;
  return (
    <div className={cn('@container grid grid-cols-3 gap-3.5', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className={TILE_SUB_EYEBROW_CLASS}><SeriesDot color="var(--flow-in)" />Entrate</p>
        <p className={cn(KPI_VALUE_CLASS, income > 0 ? 'text-income-figure' : 'text-muted-foreground')}>
          {cachedFormatCurrencyEUR(income, true)}
        </p>
        <DeltaLine delta={incomeDelta} positiveGood={true} previousLabel={previousLabel} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className={TILE_SUB_EYEBROW_CLASS}><SeriesDot color="var(--flow-out)" />Spese</p>
        <p className={cn(KPI_VALUE_CLASS, expenses > 0 ? 'text-expense-figure' : 'text-muted-foreground')}>
          {cachedFormatCurrencyEUR(expenses, true)}
        </p>
        <DeltaLine delta={expensesDelta} positiveGood={false} previousLabel={previousLabel} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className={TILE_SUB_EYEBROW_CLASS}>Risparmio</p>
        <p className={cn(KPI_VALUE_CLASS, netFigureClass(net))}>
          {net < 0 ? '−' : ''}
          {cachedFormatCurrencyEUR(Math.abs(net), true)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {savingsRate !== null ? (
            <span className={cn('font-mono tabular-nums', netFigureClass(net))}>{formatPercentage(savingsRate, 1)}</span>
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
  );
}
