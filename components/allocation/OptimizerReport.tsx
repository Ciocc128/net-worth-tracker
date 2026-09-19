'use client';

/**
 * OptimizerReport / OptimizerObjectivesReport — the weight optimizer's result (doc/weight-optimizer-ate.md
 * §9.2 point 6-7). `OptimizerObjectivesReport` (the per-objective report, conflicts and warnings —
 * never a weights table, whose columns differ between callers) is shared, byte for byte, between
 * `OptimizerPanel`'s "Ottimizzato" view of the PAC and Allocazione's standalone `IdealCompositionDialog`
 * (§4.3): each renders its OWN weights table (the PAC's has no € column, the standalone tool's does,
 * §4.2) and its own action below it — the PAC applies the weights to its draft, the standalone tool
 * offers "Crea un PAC con questi pesi" instead. `OptimizerReport` wraps `OptimizerObjectivesReport`
 * with the PAC's own table and "Usa questi pesi" action, unchanged from before this split.
 */
import type { OptimizerResult } from '@/lib/utils/weightOptimizer';
import { formatPercentageIt } from '@/lib/utils/formatters';
import { ACCUMULO_ACTION_CANCEL } from '@/lib/utils/accumulationNarrative';
import {
  describeConflict,
  describeObjectiveRow,
  describeOptimizerWarning,
  OPTIMIZER_ACTION_APPLY,
  OPTIMIZER_COL_CURRENT,
  OPTIMIZER_COL_INSTRUMENT,
  OPTIMIZER_COL_PROPOSED,
  OPTIMIZER_CONFLICTS_TITLE,
  OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM,
  OPTIMIZER_REPORT_TITLE,
  OPTIMIZER_STATUS_INFEASIBLE_BOUNDS,
  OPTIMIZER_STATUS_NO_CANDIDATES,
  OPTIMIZER_WARNINGS_TITLE,
} from '@/lib/utils/weightOptimizerNarrative';
import { Button } from '@/components/ui/button';

interface OptimizerObjectivesReportProps {
  result: OptimizerResult;
  /** Resolves a `result.warnings[].key` to the label the caller already knows (a position/candidate). */
  labelOf: (key: string) => string;
}

/** The per-objective report, conflicts and warnings — never the weights table (§4.3). */
export function OptimizerObjectivesReport({ result, labelOf }: OptimizerObjectivesReportProps) {
  return (
    <>
      {result.objectives.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_REPORT_TITLE}</p>
          <ul className="space-y-1 font-mono text-[12px] tabular-nums text-muted-foreground">
            {result.objectives.map((objective) => (
              <li key={objective.id}>{describeObjectiveRow(objective)}</li>
            ))}
          </ul>
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_CONFLICTS_TITLE}</p>
          <ul className="space-y-1 text-[12px] text-muted-foreground">
            {result.conflicts.map((conflict) => (
              <li key={conflict.removedObjectiveId}>{describeConflict(conflict, result.objectives)}</li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{OPTIMIZER_WARNINGS_TITLE}</p>
          <ul className="space-y-1 text-[12px] text-warning-foreground">
            {result.warnings.map((warning, i) => (
              <li key={i}>{describeOptimizerWarning(warning, labelOf)}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

interface OptimizerReportProps {
  result: OptimizerResult;
  labelOf: (key: string) => string;
  pendingIdealConfirm: boolean;
  onApplyClick: () => void;
  onConfirmApply: () => void;
  onCancelConfirm: () => void;
}

/** The PAC's own report: weights table (no € column — a PAC position moves by QUOTA, not by a
 *  fixed euro purchase) + `OptimizerObjectivesReport` + "Usa questi pesi". */
export function OptimizerReport({
  result,
  labelOf,
  pendingIdealConfirm,
  onApplyClick,
  onConfirmApply,
  onCancelConfirm,
}: OptimizerReportProps) {
  if (result.status === 'no_candidates') {
    return <p className="text-[12px] text-muted-foreground">{OPTIMIZER_STATUS_NO_CANDIDATES}</p>;
  }
  if (result.status === 'infeasible_bounds') {
    return <p className="text-[12px] text-destructive">{OPTIMIZER_STATUS_INFEASIBLE_BOUNDS}</p>;
  }

  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {OPTIMIZER_COL_INSTRUMENT}
            </th>
            <th scope="col" className="py-1.5 pr-2 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {OPTIMIZER_COL_CURRENT}
            </th>
            <th scope="col" className="py-1.5 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {OPTIMIZER_COL_PROPOSED}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.weights.map((w) => (
            <tr key={w.key} className="border-b border-border last:border-0">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">{w.label}</th>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted-foreground">{formatPercentageIt(w.currentPct, 1)}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{formatPercentageIt(w.proposedPct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <OptimizerObjectivesReport result={result} labelOf={labelOf} />

      {pendingIdealConfirm ? (
        <div className="rounded-lg bg-muted p-3">
          <p className="text-[12px] text-foreground">{OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" className="h-8 text-[12px]" onClick={onCancelConfirm}>
              {ACCUMULO_ACTION_CANCEL}
            </Button>
            <Button className="h-8 text-[12px]" onClick={onConfirmApply}>
              {OPTIMIZER_ACTION_APPLY}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="h-8 text-[12px]" onClick={onApplyClick}>
          {OPTIMIZER_ACTION_APPLY}
        </Button>
      )}
    </>
  );
}
