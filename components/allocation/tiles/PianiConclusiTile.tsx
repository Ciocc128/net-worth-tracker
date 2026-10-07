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
  ACCUMULO_CLOSED_PLANS_EYEBROW,
  describeClosedPlanDrift,
  describeClosedPlanInstallments,
  describeClosedPlanInvested,
  describeClosedPlanPeriod,
} from '@/lib/utils/accumulationNarrative';
import { Tile } from '@/components/ui/tile';

interface PianiConclusiTileProps {
  plans: AccumulationPlan[];
  targets: AssetAllocationTarget | null;
}

export function PianiConclusiTile({ plans, targets }: PianiConclusiTileProps) {
  return (
    <Tile eyebrow={ACCUMULO_CLOSED_PLANS_EYEBROW}>
      <ul className="mt-3 divide-y divide-border">
        {plans.map((plan) => {
          const row = summarizeClosedPlan(plan, targets);
          return (
            <li key={plan.id} className="py-2">
              <span className="line-clamp-2 break-words text-[13px] text-foreground">{row.name}</span>
              <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                {describeClosedPlanPeriod(row.startMonth, row.endMonth)} · {describeClosedPlanInstallments(row.closedCount, row.totalMonths, row.interrupted)}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
                {describeClosedPlanInvested(row.investedEur, row.plannedEur)} · {describeClosedPlanDrift(row.finalDrift)}
              </span>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}
