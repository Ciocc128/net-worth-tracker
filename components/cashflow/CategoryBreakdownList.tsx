'use client';

import React, { Suspense, useMemo } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';
import { EmptyState, ChartEmptyIcon } from '@/components/ui/empty-state';
import type { ExpenseCategory } from '@/types/expenses';

export interface CategoryBreakdownItem {
  /** Display label; may carry a type qualifier when two categories share a name. */
  category: string;
  /** Category document id — the identity used to resolve icon + colour. Optional
   * because some producers (stories, legacy cached payloads) carry only the label. */
  categoryKey?: string;
  amount: number;
  percentage: number;
}

// Module-level component required by the React Compiler — getLazyIcon calls React.lazy()
// which must never be called inside a render function or map callback.
function CategoryIconBadge({
  iconName,
  color,
  fallbackColor,
}: {
  iconName: string;
  color?: string;
  fallbackColor: string;
}) {
  const Icon = getLazyIcon(iconName);
  if (!Icon) {
    return (
      <div
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: color || fallbackColor }}
      />
    );
  }
  return (
    <div
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
      style={{ backgroundColor: color ? `${color}20` : 'var(--muted)' }}
    >
      <Suspense
        fallback={<div className="h-2 w-2 rounded-full" style={{ background: fallbackColor }} />}
      >
        <Icon className="h-3 w-3" style={{ color: color || fallbackColor }} aria-hidden="true" />
      </Suspense>
    </div>
  );
}

interface Props {
  /** Category summary rows to render. */
  items: CategoryBreakdownItem[];
  /** Full category list used to resolve icon + color by name. */
  categories: ExpenseCategory[];
}

export function CategoryBreakdownList({ items, categories }: Readonly<Props>) {
  const chartColors = useChartColors();

  // Resolved once per categories change. Lookup goes by id first (two same-named
  // categories keep their own icon + colour); the name map remains only for items
  // without a key, where last-wins is the best available answer.
  const { metaById, metaByName } = useMemo(
    () => ({
      metaById: new Map(categories.map((c) => [c.id, { icon: c.icon, color: c.color }])),
      metaByName: new Map(categories.map((c) => [c.name, { icon: c.icon, color: c.color }])),
    }),
    [categories],
  );

  if (items.length === 0)
    return (
      <EmptyState
        icon={ChartEmptyIcon}
        title="Nessun dato disponibile"
        description="Aggiungi delle voci per vedere il dettaglio per categoria."
        className="flex-1"
      />
    );

  return (
    <div className="space-y-3">
      {items.map((cat, i) => {
        const meta = (cat.categoryKey && metaById.get(cat.categoryKey)) || metaByName.get(cat.category);
        // Use category color if set; otherwise cycle through theme chart colors.
        const color =
          meta?.color || chartColors[i % chartColors.length] || `var(--chart-${(i % 5) + 1})`;
        return (
          <div key={cat.categoryKey ?? cat.category} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                {meta?.icon ? (
                  <CategoryIconBadge
                    iconName={meta.icon}
                    color={meta.color}
                    fallbackColor={color}
                  />
                ) : (
                  <div
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                )}
                <span className="text-foreground truncate text-[13px]">{cat.category}</span>
              </div>
              <div className="ml-3 flex flex-shrink-0 items-center gap-2">
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {Math.round(cat.percentage)}%
                </span>
                <span className="text-foreground font-mono text-[13px] tabular-nums">
                  {cachedFormatCurrencyEUR(cat.amount, true)}
                </span>
              </div>
            </div>
            <div
              className="bg-muted h-[3px] overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={Math.round(cat.percentage)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${cat.category}: ${Math.round(cat.percentage)}%`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${cat.percentage}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
