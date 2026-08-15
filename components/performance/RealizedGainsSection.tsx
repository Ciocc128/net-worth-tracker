'use client';

/**
 * "Plusvalenze realizzate" rows for Rendimenti (Fase D).
 *
 * `aggregateRealizedByYear` lives in the ledger engine (lib/utils/assetTransactionUtils.ts) — this
 * module only renders its result.
 */

import { formatCurrency } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';

function signClass(value: number): string {
  if (value > 0) return 'text-positive';
  if (value < 0) return 'text-destructive';
  return 'text-foreground';
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
}

/** Flat divide-y rows (one per fiscal year, newest first) + a total row. Renders nothing when empty. */
export function RealizedGainsRows({
  byYear,
  skippedAssets = 0,
}: {
  byYear: Record<number, number>;
  /** Assets left out of the totals because their replay failed; surfaced so the figure is not read as complete. */
  skippedAssets?: number;
}) {
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return null;

  const total = years.reduce((sum, year) => sum + byYear[year], 0);

  return (
    <>
      {years.map((year) => (
        <div key={year} className="flex items-center justify-between gap-4 px-6 py-3.5">
          <span className="text-sm font-medium text-foreground">{year}</span>
          <span className={cn('font-mono text-sm font-semibold tabular-nums', signClass(byYear[year]))}>
            {formatSigned(byYear[year])}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 bg-muted/30 px-6 py-3.5">
        <span className="text-sm font-semibold text-foreground">Totale</span>
        <span className={cn('font-mono text-sm font-bold tabular-nums', signClass(total))}>
          {formatSigned(total)}
        </span>
      </div>
      {skippedAssets > 0 && (
        <p className="px-6 py-3 text-xs text-amber-600 dark:text-amber-400">
          {skippedAssets === 1
            ? '1 asset è escluso da questo totale: il suo registro operazioni non è ricostruibile.'
            : `${skippedAssets} asset sono esclusi da questo totale: il loro registro operazioni non è ricostruibile.`}{' '}
          Il totale è quindi incompleto — controlla i movimenti di quegli asset da Patrimonio.
        </p>
      )}
    </>
  );
}
