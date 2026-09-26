'use client';

/**
 * Flusso's 50/30/20 view on a phone: one share bar, then each group's categories as ranked rows.
 * A four-column Sankey gets ~80 px a column at 390 and stops saying anything, so the roles view
 * draws this instead, fed by its own mapping (SpendingRolesMobileFlow). The component knows
 * nothing of roles: segments, groups and captions come in ready to draw.
 *
 * The bar is proportion only; the shares are printed in the legend under it, in the foreground
 * ink — white figures inside the segments would sit on whatever chart slot a theme gives the
 * role, with no contrast floor, and a thin segment would clip its figure away entirely.
 */

import { useState } from 'react';
import type { ExpenseType } from '@/types/expenses';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';
import { cn } from '@/lib/utils';

const ROWS_SHOWN = 5;

export interface FlowShareSegment {
  key: string;
  label: string;
  value: number;
  /** The share as the page's reading prints it («58%»), so the legend and the sentence agree. */
  share: string;
  /** A CSS colour, a theme token (`var(--role-need)`), never a hex. */
  color: string;
}

export interface FlowShareCategory {
  categoryKey: string;
  categoryName: string;
  expenseType: ExpenseType;
  value: number;
}

export interface FlowShareGroup {
  key: string;
  label: string;
  color: string;
  total: number;
  categories: FlowShareCategory[];
  /** A muted line under the rows («544 € avanzati nel periodo.»). */
  note?: string | null;
}

export interface FlowShareBarModel {
  segments: FlowShareSegment[];
  /** Reference ticks, as a share of the bar (the 50/30/20 view's 50 and 80). */
  ticks?: number[];
  /** Where income ends, as a share of the bar, when spending ran past it; null otherwise. */
  incomeEdge?: number | null;
  /** The line under the legend: what the bar is a share of, and the deficit if any. */
  caption: string;
}

interface FlowShareMobileProps {
  bar: FlowShareBarModel;
  groups: FlowShareGroup[];
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

export function FlowShareMobile({ bar, groups, onEntityClick }: FlowShareMobileProps) {
  return (
    <div className="mt-3">
      <ShareBar bar={bar} />
      <div className="mt-4 flex flex-col gap-4">
        {groups.map((group) => (
          <GroupRows key={group.key} group={group} onEntityClick={onEntityClick} />
        ))}
      </div>
    </div>
  );
}

/** The bar, its ticks and the income edge, then the legend that carries the figures. */
function ShareBar({ bar }: { bar: FlowShareBarModel }) {
  const span = bar.segments.reduce((sum, segment) => sum + segment.value, 0);
  const ticks = bar.ticks ?? [];
  const hasEdge = bar.incomeEdge !== null && bar.incomeEdge !== undefined;
  // Income and no spending: nothing to split, the caption says so and the groups say the rest.
  if (span <= 0) return <p className="mt-2 text-[11px] text-muted-foreground">{bar.caption}</p>;
  return (
    <div>
      {/* Decorative: the legend below is the same information as text. */}
      <div className={cn('relative', ticks.length > 0 ? 'mt-6' : 'mt-2')} aria-hidden="true">
        <div className="flex h-[30px] overflow-hidden rounded-lg">
          {bar.segments.map((segment) => (
            <div key={segment.key} style={{ width: `${span > 0 ? (segment.value / span) * 100 : 0}%`, background: segment.color }} />
          ))}
        </div>
        {ticks.map((tick) => (
          <div key={tick} className="absolute -bottom-1.5 -top-5 border-l border-dashed border-foreground/50" style={{ left: `${tick}%` }}>
            <span className="absolute left-1 top-0 font-mono text-[10.5px] text-muted-foreground">{tick}</span>
          </div>
        ))}
        {hasEdge && (
          <div className="absolute -bottom-1.5 -top-5 border-l-[1.5px] border-dashed border-destructive" style={{ left: `${bar.incomeEdge}%` }}>
            {/* Under the bar: above it the label sat on the 80 tick whenever income ends near 80-100%. */}
            <span className="absolute -bottom-4 right-1 font-mono text-[10.5px] text-destructive">entrate</span>
          </div>
        )}
      </div>
      <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[12px]', hasEdge ? 'mt-6' : 'mt-2.5')} aria-label="Quote del flusso">
        {bar.segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: segment.color }} aria-hidden="true" />
            <span>{segment.label}</span>
            <span className="font-mono tabular-nums">{segment.share}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{bar.caption}</p>
    </div>
  );
}

function GroupRows({ group, onEntityClick }: { group: FlowShareGroup; onEntityClick: FlowShareMobileProps['onEntityClick'] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.categories : group.categories.slice(0, ROWS_SHOWN);
  const rest = group.categories.slice(shown.length);
  const share = (value: number) => (group.total > 0 ? (value / group.total) * 100 : 0);
  const keyOf = (category: FlowShareCategory) => `${category.expenseType}:${category.categoryKey}`;
  const byKey = new Map(group.categories.map((category) => [keyOf(category), category]));
  const rows: RankedRow[] = shown.map((category) => ({
    key: keyOf(category),
    label: category.categoryName,
    amount: category.value,
    percentage: share(category.value),
  }));
  const restTotal = rest.reduce((sum, category) => sum + category.value, 0);

  return (
    <section aria-label={group.label}>
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: group.color }} aria-hidden="true" />
          {group.label}
        </span>
        <span className="font-mono text-[12px] tabular-nums">{euro(group.total)}</span>
      </div>
      {rows.length > 0 && (
        <RankedRows
          rows={rows}
          color={group.color}
          remainder={rest.length > 0 ? { label: `Altre ${rest.length}`, amount: restTotal, percentage: share(restTotal) } : null}
          labelClassName="w-[140px]"
          ariaLabel={`Categorie in ${group.label}`}
          onRowClick={(row) => {
            const category = byKey.get(row.key);
            if (category) onEntityClick({ expenseType: category.expenseType, categoryKey: category.categoryKey });
          }}
        />
      )}
      {group.categories.length > ROWS_SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 h-11 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Mostra meno' : 'Mostra tutte'}
        </button>
      )}
      {group.note && <p className="mt-1.5 text-[12px] text-muted-foreground">{group.note}</p>}
    </section>
  );
}
