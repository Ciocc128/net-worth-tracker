/**
 * RebalancePanel — the consolidated, prioritized trade list (body of ActionPlanner's
 * "Ribilancia" tab).
 *
 * Every off-target asset class becomes one signed move (buy the under-allocated, trim the
 * over-allocated), largest euro amount first. When everything is within the active band it
 * shows a calm "in linea" state rather than an empty list. Pure presentation over
 * `buildRebalancePlan` output — no Card chrome of its own; ActionPlanner provides it.
 */
'use client';

import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { type RebalanceMove } from '@/lib/utils/allocationUtils';
import { planInstrumentRebalance } from '@/lib/utils/leverageAwareAllocationUtils';
import { useActionColors } from '@/lib/hooks/useActionColors';
import type { Asset } from '@/types/assets';
import { ActionChip } from './ActionChip';

interface RebalancePanelProps {
  moves: RebalanceMove[];
  assets: Asset[];
  currentNotionalByAssetClass: Record<string, number>;
  currentNotionalTotal: number;
  currentMarketTotal: number;
  targetPercentageByAssetClass: Record<string, number>;
  targetLeverageRatio?: number;
}

export function RebalancePanel({
  moves,
  assets,
  currentNotionalByAssetClass,
  currentNotionalTotal,
  currentMarketTotal,
  targetPercentageByAssetClass,
  targetLeverageRatio,
}: RebalancePanelProps) {
  const actionColors = useActionColors();

  // Which concrete instruments to trade to realize the class-level plan above — reasons over
  // the ACTUAL held instruments (including leveraged/composite ones), not a generic 1x
  // assumption. See lib/utils/leverageAwareAllocationUtils.ts for the full rationale.
  const instrumentTrades = useMemo(
    () =>
      planInstrumentRebalance(
        assets,
        currentNotionalByAssetClass,
        currentNotionalTotal,
        currentMarketTotal,
        targetPercentageByAssetClass,
        targetLeverageRatio
      ).trades,
    [assets, currentNotionalByAssetClass, currentNotionalTotal, currentMarketTotal, targetPercentageByAssetClass, targetLeverageRatio]
  );

  if (moves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <CheckCircle2 className="h-7 w-7" style={{ color: actionColors.OK }} aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Tutto in linea</p>
        <p className="text-xs text-muted-foreground">
          Nessun movimento necessario entro la soglia attuale.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-border/50">
        {moves.map((move) => {
          const isBuy = move.action === 'COMPRA';
          return (
            <div key={move.assetClass} className="flex items-start justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <ActionChip action={move.action} color={actionColors[move.action]} />
                  <span className="truncate text-sm font-medium text-foreground" title={move.label}>
                    {move.label}
                  </span>
                </div>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatPercentage(move.currentPercentage)}
                  <span className="px-1 opacity-40">→</span>
                  {formatPercentage(move.targetPercentage)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p
                  className="font-mono text-lg font-bold tabular-nums leading-none"
                  style={{ color: actionColors[move.action] }}
                >
                  {isBuy ? '+' : '−'}
                  {formatCurrency(move.amount)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isBuy ? 'da aggiungere' : 'da ridurre'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {instrumentTrades.length > 0 && (
        <div className="border-t border-border/50 px-4 py-3.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Quali strumenti
          </p>
          <div className="space-y-1.5">
            {instrumentTrades.map((trade) => {
              const isBuy = trade.amount > 0;
              return (
                <div key={trade.assetId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground" title={trade.name}>
                    {trade.ticker}
                  </span>
                  <span
                    className="shrink-0 font-mono tabular-nums"
                    style={{ color: isBuy ? actionColors.COMPRA : actionColors.VENDI }}
                  >
                    {isBuy ? '+' : '−'}
                    {formatCurrency(Math.abs(trade.amount))}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
            Tiene conto della leva degli strumenti già in portafoglio — stima indicativa, non
            un consiglio finanziario.
          </p>
        </div>
      )}
    </div>
  );
}
