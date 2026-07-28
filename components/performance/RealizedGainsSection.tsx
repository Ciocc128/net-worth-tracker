'use client';

/**
 * "Plusvalenze realizzate" rows for Rendimenti (Fase D).
 *
 * Aggregates realized P&L by fiscal year across ALL ledger assets. replayTransactions computes
 * ONE asset's position state, so the transactions must be grouped by assetId before folding —
 * summing realizedByYear across assets is the aggregation step this module owns (kept out of the
 * shared engine by the Fase D scope decision: lib/utils/assetTransactionUtils.ts was not to be
 * touched by that phase).
 */

import { replayTransactions } from '@/lib/utils/assetTransactionUtils';
import { formatCurrency } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import type { AssetTransaction } from '@/types/assetTransactions';

/** Realized P&L per fiscal year, plus how many assets could not be replayed. */
export interface RealizedGainsAggregate {
  byYear: Record<number, number>;
  /**
   * Assets whose replay threw and were left out of the totals. This is a TAX figure: a total that
   * is quietly short by one position is worse than no total, so the count reaches the UI instead of
   * dying in a silent catch.
   */
  skippedAssets: number;
}

/** Sum of realized P&L (EUR) per fiscal year, across every asset's own replay. */
export function aggregateRealizedByYear(transactions: AssetTransaction[]): RealizedGainsAggregate {
  const byAsset = new Map<string, AssetTransaction[]>();
  transactions.forEach((t) => {
    const arr = byAsset.get(t.assetId) ?? [];
    arr.push(t);
    byAsset.set(t.assetId, arr);
  });

  const byYear: Record<number, number> = {};
  let skippedAssets = 0;

  byAsset.forEach((assetTransactions, assetId) => {
    try {
      const { realizedByYear } = replayTransactions(assetTransactions);
      Object.entries(realizedByYear).forEach(([year, amount]) => {
        byYear[Number(year)] = (byYear[Number(year)] ?? 0) + amount;
      });
    } catch (error) {
      // A per-asset sequence is server-validated at write time, so this should not happen; when it
      // does, one asset must not take down the whole card — but the total is now incomplete and
      // both the console and the card have to say so.
      skippedAssets += 1;
      console.warn('Realized gains: skipping an asset whose ledger replay failed', {
        assetId,
        transactionCount: assetTransactions.length,
        operation: 'aggregateRealizedByYear',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return { byYear, skippedAssets };
}

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
