'use client';

/**
 * Flusso's 50/30/20 view on a phone: the 50/30/20 bar with the reference ticks, then each role's
 * categories as ranked rows (the owner's call, 2026-09-15, after trying a vertical flow beside
 * it). Drawn by FlowShareMobile, the type view's twin.
 *
 * The bar's shares are on the SAME base as the tile's reading above — income plus what the wealth
 * covered, i.e. what left — so the bar and the sentence print the same 58/42 (owner, 2026-09-15:
 * the income base printed 60/44 under a 58/42 sentence). A deficit is the red «entrate» line inside
 * the bar. The role headers print amounts only.
 *
 * Every number comes from the summary Analisi already computed (summarizeSpendingRoles).
 */

import type { ExpenseType } from '@/types/expenses';
import type { SpendingBucket, SpendingRolesSummary } from '@/lib/utils/spendingRoles';
import { SPENDING_BUCKET_LABELS, SPENDING_ROLE_FLOW_ORDER } from '@/lib/utils/cashflowSankey';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { FlowShareMobile, type FlowShareGroup } from '@/components/cashflow/analisi/FlowShareMobile';

const ROLE_COLOR: Record<SpendingBucket, string> = {
  need: 'var(--role-need)',
  want: 'var(--role-want)',
  saving: 'var(--role-saving)',
  unclassified: 'var(--role-unclassified)',
};

/** The 50/30/20 reference: needs up to 50, needs + wants up to 80. */
const RULE_TICKS = [50, 80];

interface Props {
  summary: SpendingRolesSummary;
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

export function SpendingRolesMobileFlow({ summary, onEntityClick }: Props) {
  const span = summary.income + summary.deficit;
  if (span <= 0) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">Nessun flusso nel periodo.</p>;
  }

  const groups: FlowShareGroup[] = SPENDING_ROLE_FLOW_ORDER.map((bucket) => {
    const categories = summary.byBucket[bucket].categories;
    const surplus = bucket === 'saving' ? summary.surplus : 0;
    return {
      key: bucket,
      label: SPENDING_BUCKET_LABELS[bucket],
      color: ROLE_COLOR[bucket],
      total: bucket === 'saving' ? summary.savings : summary.byBucket[bucket].total,
      categories,
      note: surplus > 0 ? (categories.length > 0 ? `Più ${euro(surplus)} avanzati nel periodo.` : `${euro(surplus)} avanzati nel periodo.`) : null,
    };
  }).filter((group) => group.total > 0);

  return (
    <FlowShareMobile
      bar={{
        segments: groups.map((group) => ({
          key: group.key,
          label: group.label,
          value: group.total,
          share: formatPercentageIt((group.total / span) * 100, 0),
          color: group.color,
        })),
        ticks: RULE_TICKS,
        incomeEdge: summary.deficit > 0 ? (summary.income / span) * 100 : null,
        caption:
          `Quote di quanto è uscito (${euro(span)}); tacche a 50 e 80, il riferimento 50/30/20.` +
          (summary.deficit > 0 ? ` Oltre la linea delle entrate: ${euro(summary.deficit)} dal patrimonio.` : ''),
      }}
      groups={groups}
      onEntityClick={onEntityClick}
    />
  );
}
