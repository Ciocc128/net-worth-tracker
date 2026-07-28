/**
 * Tooltip of the "Evoluzione Patrimonio" chart.
 *
 * The chart draws two series — the invested base as an area, net worth as a line — because those
 * are the two quantities a stacked chart cannot show honestly once contributions turn negative.
 * The decomposition the chart no longer stacks is spelled out here in numbers instead: what was
 * already there at the start, what was paid in since, and what the market added on top.
 */

import { formatCurrency } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import type { PerformanceChartData } from '@/types/performance';

interface PerformanceTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function signClass(value: number): string {
  if (value > 0) return 'text-positive';
  if (value < 0) return 'text-destructive';
  return 'font-medium';
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
}

export function PerformanceTooltip({ active, payload, label }: PerformanceTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  // Every entry carries the whole datum; the first one is enough to read the breakdown.
  const point = payload[0]?.payload as PerformanceChartData | undefined;

  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-lg">
      <p className="mb-2 font-semibold">{label}</p>

      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{formatCurrency(entry.value)}</span>
        </div>
      ))}

      {point && typeof point.returns === 'number' && (
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">di cui valore iniziale</span>
            <span className="font-medium tabular-nums">{formatCurrency(point.initialCapital)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">di cui versamenti netti</span>
            <span className="font-medium tabular-nums">{formatSigned(point.contributions)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Rendimento del mercato</span>
            <span className={cn('font-semibold tabular-nums', signClass(point.returns))}>
              {formatSigned(point.returns)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
