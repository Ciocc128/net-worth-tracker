'use client';

/**
 * Flusso's type view on a phone — the only view when the 50/30/20 roles are off. A four-column
 * Sankey gets ~80 px a column at 390 and says nothing, so this is the roles view's twin: one bar of
 * the SPENDING split by type, then each type's categories as ranked rows, then what was put aside.
 *
 * One base on the screen: the reading above prints the types as shares of the spending («fisse
 * 53%, variabili 37%, debiti 10%»), so the bar is the spending and its legend prints those very
 * figures (buildTypeFlowBreakdown takes them from the reading's own FlowSummary). Savings are a
 * share of the income in that sentence, so they stay out of the bar: a closing block with the
 * amount. A deficit is the red «entrate» line inside the bar, where the income ends.
 *
 * Colours: the slots of the ONE type colour map (lib/constants/expenseTypeColors.ts: fixed
 * `--chart-1`, variable `--chart-4`, debt `--chart-3`), savings income's series slot `--chart-2` —
 * never the desktop Sankey's hex.
 */

import { EXPENSE_TYPE_LABELS, type ExpenseType } from '@/types/expenses';
import type { SpendingType, TypeFlowBreakdown } from '@/lib/utils/analisiSummary';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { FlowShareMobile, type FlowShareGroup } from '@/components/cashflow/analisi/FlowShareMobile';

const TYPE_COLOR: Record<SpendingType, string> = {
  fixed: 'var(--chart-1)',
  variable: 'var(--chart-4)',
  debt: 'var(--chart-3)',
};

/** What is left is income kept: income's series slot. */
const SAVINGS_COLOR = 'var(--chart-2)';

interface Props {
  breakdown: TypeFlowBreakdown;
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

export function SpendingTypesMobileFlow({ breakdown, onEntityClick }: Props) {
  const { blocks, surplus, deficit } = breakdown;
  const spending = blocks.reduce((sum, block) => sum + block.amount, 0);
  if (spending <= 0 && surplus <= 0) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">Nessun flusso nel periodo.</p>;
  }

  const groups: FlowShareGroup[] = blocks.map((block) => ({
    key: block.type,
    // The types' full names, as the drill breadcrumb on this same tile prints them.
    label: EXPENSE_TYPE_LABELS[block.type],
    color: TYPE_COLOR[block.type],
    total: block.amount,
    categories: block.categories.map((category) => ({ ...category, expenseType: block.type })),
  }));
  if (surplus > 0) {
    groups.push({ key: 'savings', label: 'Risparmio', color: SAVINGS_COLOR, total: surplus, categories: [], note: `${euro(surplus)} avanzati nel periodo.` });
  }

  return (
    <FlowShareMobile
      bar={{
        segments: blocks.map((block) => ({
          key: block.type,
          label: block.label,
          value: block.amount,
          share: formatPercentageIt(block.percentage, 0),
          color: TYPE_COLOR[block.type],
        })),
        incomeEdge: deficit > 0 ? ((spending - deficit) / spending) * 100 : null,
        caption:
          spending > 0
            ? `Quote delle spese (${euro(spending)}).` + (deficit > 0 ? ` Oltre la linea delle entrate: ${euro(deficit)} dal patrimonio.` : '')
            : 'Nessuna spesa nel periodo.',
      }}
      groups={groups}
      onEntityClick={onEntityClick}
    />
  );
}
