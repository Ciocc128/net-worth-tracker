import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

export interface RankedRow {
  key: string;
  label: string;
  amount: number;
  /** Share of the total, 0-100 — shown as the trailing figure. */
  percentage: number;
}

interface RankedRowsProps {
  rows: RankedRow[];
  /** Bar colour, a theme chart slot (`var(--chart-1)`), never a literal hex. */
  color: string;
  /**
   * The residual not covered by `rows` (the month total minus the rows shown), rendered as a
   * muted closing row so the list visibly adds up to the total. Omit when rows are exhaustive.
   */
  remainder?: { label: string; amount: number; percentage: number } | null;
  /** Width reserved for the label column. */
  labelClassName?: string;
}

/**
 * Flat, `divide-y` ranked rows with a 3px bar — label, bar, mono amount, share. The bar width
 * encodes RANK (the largest row fills the track), the trailing figure encodes share, so a month
 * where no category dominates still reads at a glance (the `CompositionList` rule).
 */
export function RankedRows({ rows, color, remainder, labelClassName = 'w-[92px]' }: RankedRowsProps) {
  const maxAmount = Math.max(...rows.map((r) => r.amount), 0);

  return (
    <div className="flex flex-col divide-y divide-border">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3 py-[9px]">
          <span className={cn('shrink-0 truncate text-[13px] text-foreground', labelClassName)}>
            {row.label}
          </span>
          <div
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-muted"
            role="presentation"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0}%`,
                background: color,
              }}
            />
          </div>
          <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
            {cachedFormatCurrencyEUR(row.amount, true)}
          </span>
          <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(row.percentage)}%
          </span>
        </div>
      ))}
      {remainder && remainder.amount > 0 && (
        <div className="flex items-center gap-3 py-[9px]">
          <span className={cn('shrink-0 truncate text-[13px] text-muted-foreground', labelClassName)}>
            {remainder.label}
          </span>
          <div className="flex-1" />
          <span className="w-[64px] shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">
            {cachedFormatCurrencyEUR(remainder.amount, true)}
          </span>
          <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {Math.round(remainder.percentage)}%
          </span>
        </div>
      )}
    </div>
  );
}
