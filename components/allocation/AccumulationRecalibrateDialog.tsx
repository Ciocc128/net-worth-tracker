'use client';

/**
 * AccumulationRecalibrateDialog — «Ricalibra rata» (doc/pac-ate.md §10.4, §5.7).
 *
 * `recalibrateInstallment` (pure, `accumulationPlanUtils.ts`) re-derives the open installment's
 * budget from TODAY's prices and TODAY's liquidity — a price move or a cash shortfall changes how
 * many shares each position can now afford. This modal only shows the suggestion and lets the
 * owner apply it (`applyRecalibration` replaces the installment's `planned` lines, leaving any
 * already `executed` untouched) or ignore it; it never recalibrates on its own.
 */
import { useMemo, useState } from 'react';
import type { Asset } from '@/types/assets';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import { recalibrateInstallment, unitPriceEur, type PlanDeps } from '@/lib/utils/accumulationPlanUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useApplyRecalibration } from '@/lib/hooks/useAccumulationPlan';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { describeModalStatus, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { formatNumberIt } from '@/lib/utils/formatters';
import {
  ACCUMULO_ACTION_APPLY,
  ACCUMULO_ACTION_IGNORE,
  ACCUMULO_RECALIBRATE_COL_DELTA,
  ACCUMULO_RECALIBRATE_COL_INSTRUMENT,
  ACCUMULO_RECALIBRATE_COL_PLANNED,
  ACCUMULO_RECALIBRATE_COL_SUGGESTED,
  ACCUMULO_RECALIBRATE_SUBMITTING,
  describeRecalibrateTitle,
  describeRecalibration,
  describeRecalibrationTotals,
} from '@/lib/utils/accumulationNarrative';

interface AccumulationRecalibrateDialogProps {
  open: boolean;
  onClose: () => void;
  plan: AccumulationPlan;
  index: number;
  ownerId: string;
  allAssets: Asset[];
  onApplied: () => void;
}

const DEPS: PlanDeps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };

export function AccumulationRecalibrateDialog({
  open,
  onClose,
  plan,
  index,
  ownerId,
  allAssets,
  onApplied,
}: AccumulationRecalibrateDialogProps) {
  const isDemo = useDemoMode();
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  const applyMutation = useApplyRecalibration(ownerId);

  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);
  const result = useMemo(
    () => (open ? recalibrateInstallment(plan, index, assetsById, DEPS) : null),
    [open, plan, index, assetsById],
  );
  const labelOf = (positionId: string): string =>
    plan.positions.find((position) => position.id === positionId)?.label ?? positionId;

  const reading = result
    ? describeRecalibration({
        lines: result.lines.map((line) => ({
          label: labelOf(line.positionId),
          plannedQuantity: line.plannedQuantity,
          suggestedQuantity: line.suggestedQuantity,
        })),
        plannedTotalEur: result.plannedTotalEur,
        suggestedTotalEur: result.suggestedTotalEur,
      })
    : [];

  const handleClose = () => {
    setStatus({ phase: 'idle' });
    onClose();
  };

  const handleApply = async () => {
    if (!result) return;
    setStatus({ phase: 'submitting' });
    try {
      await applyMutation.mutateAsync({ planId: plan.id, index, lines: result.lines });
      onApplied();
      handleClose();
    } catch (error) {
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const modalStatus = describeModalStatus(status, {
    idle: reading,
    submitting: ACCUMULO_RECALIBRATE_SUBMITTING,
  });

  return (
    <ResponsiveModal
      open={open}
      onClose={handleClose}
      width="md"
      title={describeRecalibrateTitle(plan.installments.find((i) => i.index === index)?.month ?? plan.startMonth)}
      reading={modalStatus}
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            {ACCUMULO_ACTION_IGNORE}
          </Button>
          <Button onClick={handleApply} disabled={isDemo || status.phase === 'submitting' || !result}>
            {ACCUMULO_ACTION_APPLY}
          </Button>
        </>
      }
    >
      {result && (
        <div className="space-y-3">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {ACCUMULO_RECALIBRATE_COL_INSTRUMENT}
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {ACCUMULO_RECALIBRATE_COL_PLANNED}
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {ACCUMULO_RECALIBRATE_COL_SUGGESTED}
                </th>
                <th scope="col" className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {ACCUMULO_RECALIBRATE_COL_DELTA}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => {
                const delta = line.suggestedQuantity - line.plannedQuantity;
                return (
                  <tr key={line.positionId} className="border-b border-border last:border-0">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                      {labelOf(line.positionId)}
                    </th>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">
                      {formatNumberIt(line.plannedQuantity, 0)}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">
                      {formatNumberIt(line.suggestedQuantity, 0)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${formatNumberIt(Math.abs(delta), 0)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="font-mono text-[13px] tabular-nums text-foreground">
            {describeRecalibrationTotals(result.plannedTotalEur, result.suggestedTotalEur)}
          </p>
        </div>
      )}
    </ResponsiveModal>
  );
}
