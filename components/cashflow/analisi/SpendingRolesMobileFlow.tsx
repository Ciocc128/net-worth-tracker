'use client';

/**
 * Flusso's 50/30/20 view on a phone. A four-column Sankey gets ~80 px a column at 390 and stops
 * saying anything, so on a phone the view is not a Sankey: one 50/30/20 bar with the reference
 * ticks, then each role's categories as ranked rows (the owner's call, 2026-09-15, after trying a
 * vertical flow beside it).
 *
 * The bar's shares are of INCOME — how the rule is quoted — so a deficit runs past the red 100%
 * line; the tile's reading above measures shares of what left. The role headers print amounts only,
 * so no second percentage on another base sits on the same screen.
 *
 * Every number comes from the summary Analisi already computed (summarizeSpendingRoles).
 */

import { useState } from 'react';
import type { ExpenseType } from '@/types/expenses';
import type { SpendingBucket, SpendingRoleSlice, SpendingRolesSummary } from '@/lib/utils/spendingRoles';
import { SPENDING_BUCKET_LABELS, SPENDING_ROLE_FLOW_ORDER } from '@/lib/utils/cashflowSankey';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

const ROLE_COLOR: Record<SpendingBucket, string> = {
  need: 'var(--role-need)',
  want: 'var(--role-want)',
  saving: 'var(--role-saving)',
  unclassified: 'var(--role-unclassified)',
};

const ROWS_SHOWN = 5;

interface Props {
  summary: SpendingRolesSummary;
  onEntityClick: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

interface RoleBlock {
  bucket: SpendingBucket;
  total: number;
  categories: SpendingRoleSlice[];
}

const euro = (value: number) => cachedFormatCurrencyEUR(value, true);

export function SpendingRolesMobileFlow({ summary, onEntityClick }: Props) {
  const roles: RoleBlock[] = SPENDING_ROLE_FLOW_ORDER.map((bucket) => ({
    bucket,
    total: bucket === 'saving' ? summary.savings : summary.byBucket[bucket].total,
    categories: summary.byBucket[bucket].categories,
  })).filter((role) => role.total > 0);

  if (summary.income + summary.deficit <= 0) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">Nessun flusso nel periodo.</p>;
  }

  return (
    <div className="mt-3">
      <RuleBar summary={summary} roles={roles} />
      <div className="mt-4 flex flex-col gap-4">
        {roles.map((role) => (
          <RoleRows key={role.bucket} role={role} surplus={role.bucket === 'saving' ? summary.surplus : 0} onEntityClick={onEntityClick} />
        ))}
      </div>
    </div>
  );
}

/** One bar of the period's income with the 50 and 80 ticks; a deficit runs past the red 100% line. */
function RuleBar({ summary, roles }: { summary: SpendingRolesSummary; roles: RoleBlock[] }) {
  const span = summary.income + summary.deficit;
  const width = (value: number) => `${(value / span) * 100}%`;
  const incomeEdge = (summary.income / span) * 100;
  const ofIncome = (value: number) => (summary.income > 0 ? `${Math.round((value / summary.income) * 100)}%` : '—');
  return (
    <div>
      <div className="relative mt-6">
        <div className="flex h-[30px] overflow-hidden rounded-lg" role="img" aria-label={roles.map((role) => `${SPENDING_BUCKET_LABELS[role.bucket]} ${ofIncome(role.total)} delle entrate`).join(', ')}>
          {roles.map((role) => (
            <div
              key={role.bucket}
              className="flex min-w-0 items-center overflow-hidden whitespace-nowrap px-1.5 font-mono text-[11.5px] font-semibold tabular-nums text-white"
              style={{ width: width(role.total), background: ROLE_COLOR[role.bucket] }}
              aria-hidden="true"
            >
              {ofIncome(role.total)}
            </div>
          ))}
        </div>
        {[50, 80].map((tick) => (
          <div key={tick} className="absolute -bottom-1.5 -top-5 border-l border-dashed border-foreground/50" style={{ left: `${(tick / 100) * incomeEdge}%` }} aria-hidden="true">
            <span className="absolute left-1 top-0 font-mono text-[10.5px] text-muted-foreground">{tick}</span>
          </div>
        ))}
        {summary.deficit > 0 && (
          <div className="absolute -bottom-1.5 -top-5 border-l-[1.5px] border-dashed" style={{ left: `${incomeEdge}%`, borderColor: 'var(--role-deficit)' }} aria-hidden="true">
            <span className="absolute right-1 top-0 font-mono text-[10.5px]" style={{ color: 'var(--role-deficit)' }}>100%</span>
          </div>
        )}
      </div>
      <p className="mt-2.5 text-[11px] text-muted-foreground">
        Quote sulle entrate ({euro(summary.income)}); tacche a 50 e 80, il riferimento 50/30/20.
        {summary.deficit > 0 && ` Oltre il 100%: ${euro(summary.deficit)} dal patrimonio.`}
      </p>
    </div>
  );
}

function RoleRows({ role, surplus, onEntityClick }: { role: RoleBlock; surplus: number; onEntityClick: Props['onEntityClick'] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? role.categories : role.categories.slice(0, ROWS_SHOWN);
  const rest = role.categories.slice(shown.length);
  const share = (value: number) => (role.total > 0 ? (value / role.total) * 100 : 0);
  const byKey = new Map(role.categories.map((slice) => [`${slice.expenseType}:${slice.categoryKey}`, slice]));
  const rows: RankedRow[] = shown.map((slice) => ({
    key: `${slice.expenseType}:${slice.categoryKey}`,
    label: slice.categoryName,
    amount: slice.value,
    percentage: share(slice.value),
  }));
  const restTotal = rest.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section aria-label={SPENDING_BUCKET_LABELS[role.bucket]}>
      <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: ROLE_COLOR[role.bucket] }} aria-hidden="true" />
          {SPENDING_BUCKET_LABELS[role.bucket]}
        </span>
        <span className="font-mono text-[12px] tabular-nums">{euro(role.total)}</span>
      </div>
      {rows.length > 0 && (
        <RankedRows
          rows={rows}
          color={ROLE_COLOR[role.bucket]}
          remainder={rest.length > 0 ? { label: `Altre ${rest.length}`, amount: restTotal, percentage: share(restTotal) } : null}
          labelClassName="w-[140px]"
          ariaLabel={`Categorie in ${SPENDING_BUCKET_LABELS[role.bucket]}`}
          onRowClick={(row) => {
            const slice = byKey.get(row.key);
            if (slice) onEntityClick({ expenseType: slice.expenseType, categoryKey: slice.categoryKey });
          }}
        />
      )}
      {role.categories.length > ROWS_SHOWN && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 h-11 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Mostra meno' : 'Mostra tutte'}
        </button>
      )}
      {surplus > 0 && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          {role.categories.length > 0 ? `Più ${euro(surplus)} avanzati nel periodo.` : `${euro(surplus)} avanzati nel periodo.`}
        </p>
      )}
    </section>
  );
}
