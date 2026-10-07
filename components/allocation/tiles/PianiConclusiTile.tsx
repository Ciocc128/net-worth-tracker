'use client';

/**
 * PianiConclusiTile — «come sono andati i piani passati?» (doc/pac-ottimizzatore § RP6, PO9). Read-only:
 * one row per `completed` or `cancelled` plan, newest first — name, period, installments closed,
 * what was invested against what the plan could spend, and the largest class gap at its last
 * measurement. No action: the plan is closed. The tab mounts it only when there is one.
 */
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { AssetAllocationTarget } from '@/types/assets';
import { summarizeClosedPlan } from '@/lib/utils/accumuloSummary';
import {
  ACCUMULO_CLOSED_PLANS_COLUMNS,
  ACCUMULO_CLOSED_PLANS_EYEBROW,
  describeClosedPlansAside,
  describeClosedPlanDrift,
  describeClosedPlanInstallments,
  describeClosedPlanInvested,
  describeClosedPlanPeriod,
} from '@/lib/utils/accumulationNarrative';
import { Tile } from '@/components/ui/tile';

const HEAD_CLASS = 'py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';
const CELL_CLASS = 'whitespace-nowrap py-1.5 pr-2 text-right font-mono text-[12px] tabular-nums text-muted-foreground';

interface PianiConclusiTileProps {
  plans: AccumulationPlan[];
  targets: AssetAllocationTarget | null;
}

export function PianiConclusiTile({ plans, targets }: PianiConclusiTileProps) {
  return (
    <Tile eyebrow={ACCUMULO_CLOSED_PLANS_EYEBROW} aside={describeClosedPlansAside(plans.length)}>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              {ACCUMULO_CLOSED_PLANS_COLUMNS.map((column, index) => (
                <th key={column} scope="col" className={`${HEAD_CLASS} ${index === 0 ? '' : 'text-right'} ${index === ACCUMULO_CLOSED_PLANS_COLUMNS.length - 1 ? 'pr-0' : ''}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const row = summarizeClosedPlan(plan, targets);
              return (
                <tr key={plan.id} className="border-b border-border last:border-0">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                    <span className="line-clamp-2 break-words">{row.name}</span>
                  </th>
                  <td className={CELL_CLASS}>{describeClosedPlanPeriod(row.startMonth, row.endMonth)}</td>
                  <td className={CELL_CLASS}>{describeClosedPlanInstallments(row.closedCount, row.totalMonths, row.interrupted)}</td>
                  <td className={CELL_CLASS}>{describeClosedPlanInvested(row.investedEur, row.plannedEur)}</td>
                  <td className={`${CELL_CLASS} pr-0`}>{describeClosedPlanDrift(row.finalDrift)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tile>
  );
}
