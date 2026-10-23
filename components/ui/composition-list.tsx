/**
 * CompositionList — ranked-bar rows for "which items are biggest, by how much".
 *
 * Pie charts answer "what share is this?" and read well up to ~5 slices. Analisi's
 * category/subcategory breakdowns, Dividendi's per-payer ranking, and similar surfaces
 * ask a different question with 8-15 items — a comparison of magnitudes — which reads
 * on aligned bar lengths, not on angles. This is the Trade Republic row: label + bar +
 * mono value + %.
 *
 * Bar width = value/maxValue (the largest item = 100% of track), NOT `percentage`.
 * Width encodes RANK (how this item compares to the biggest one); the `%` column
 * encodes SHARE (how this item compares to the whole). Using `percentage` as width
 * would leave every bar looking short whenever no single item dominates the total —
 * exactly the empty-card problem this primitive replaces.
 *
 * Colors arrive pre-resolved from the caller (`useChartColors()` or a shading derivation
 * like `computeShadeOpacities`) — this component never invents a color. The share is printed
 * through chartService's `formatPercentage` (`42,4%`), never `toFixed`: the row sits under a
 * reading formatted for it-IT, and a dot decimal would make the same tile — and the screen
 * reader, which reads the row's `aria-label` — announce two different figures.
 */
'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useRowMorph } from '@/lib/hooks/useRowMorph';
import { MorphFigure } from '@/components/ui/morph-figure';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';

export interface CompositionListItem {
  /** Stable key for key/click — normally the same value as `name`. */
  id: string;
  name: string;
  /** Absolute magnitude (e.g. euros). Drives bar width via value/maxValue. */
  value: number;
  /** Share of the total, 0-100. Rendered as the trailing % label. */
  percentage: number;
  /** Resolved color (from useChartColors()/shading) — never hardcoded here. */
  color: string;
  /** Bar fill opacity, default 1. Used by subcategory shading. */
  barOpacity?: number;
}

interface CompositionListProps {
  /** Already sorted descending by the caller. */
  items: CompositionListItem[];
  onItemClick?: (item: CompositionListItem) => void;
  formatValue?: (value: number) => string;
  /** Caps rendered rows to maxRows - 1 + a static "Altre N voci" footer. */
  maxRows?: number;
  ariaLabel: string;
}

// A module-level default, not an inline arrow: the React Compiler cannot reorder an arrow
// function used as a parameter default.
const formatEuro = (v: number) => cachedFormatCurrencyEUR(v);
const formatShare = (v: number) => formatPercentage(v, 1);

/**
 * The bars and the re-rank on the 400/35 spring, as `RankedRows` (doc/animazioni/README.md § 6): a
 * switch moves the bar from the width it shows, the figures count (`useRowMorph`), a row that leaves
 * fades in 100 ms.
 */
const BAR_SPRING = { type: 'spring', stiffness: 400, damping: 35 } as const;
const ROW_EXIT = { opacity: 0, transition: { duration: 0.1, ease: 'easeOut' } } as const;

export function CompositionList({
  items,
  onItemClick,
  formatValue = formatEuro,
  maxRows,
  ariaLabel,
}: CompositionListProps) {
  const reducedMotion = useReducedMotion();
  const overflow = maxRows && items.length > maxRows;
  const visible = overflow ? items.slice(0, maxRows - 1) : items;
  // Before the early return: a hook runs on every render (AGENTS.md § Motion).
  const morph = useRowMorph(visible.map((item) => ({ key: item.id, label: item.name, figures: { value: item.value, percentage: item.percentage } })));

  if (items.length === 0) return null;

  const maxValue = Math.max(...items.map((i) => i.value), 0);
  const hidden = overflow ? items.slice(maxRows - 1) : [];
  const hiddenTotal = hidden.reduce((sum, i) => sum + i.value, 0);

  return (
    <div role="list" aria-label={ariaLabel} className="relative divide-y divide-border/60">
      <AnimatePresence initial={false} mode="popLayout">
      {visible.map((item) => {
        const widthPct = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        const slot = morph.slotOf(item.id);
        const relabelled = morph.relabelled.has(slot);
        const rowContent = (
          <>
            <span
              key={relabelled ? item.name : undefined}
              className={cn('w-[34%] desktop:w-[22%] min-w-0 shrink-0 break-words text-sm font-medium leading-tight text-foreground', relabelled && 'row-label-in')}
            >
              {item.name}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.span
                className="block h-full rounded-full"
                style={{ backgroundColor: item.color, opacity: item.barOpacity ?? 1 }}
                initial={reducedMotion ? false : { width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={reducedMotion ? undefined : BAR_SPRING}
              />
            </span>
            <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
              <MorphFigure morph={morph} slot={slot} name="value" value={item.value} format={formatValue} />
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              <MorphFigure morph={morph} slot={slot} name="percentage" value={item.percentage} format={formatShare} />
            </span>
          </>
        );

        const rowClassName = cn('flex items-center gap-3 py-2.5', morph.entered.has(slot) && 'row-enter');
        const rowMotion = { layout: morph.animate ? ('position' as const) : false, transition: BAR_SPRING, exit: ROW_EXIT };

        if (onItemClick) {
          return (
            <motion.button
              key={slot}
              {...rowMotion}
              type="button"
              role="listitem"
              onClick={() => onItemClick(item)}
              className={cn(
                rowClassName,
                '-mx-2 w-[calc(100%+16px)] rounded-md px-2 text-left transition-colors duration-150 hover:bg-muted/40 cursor-pointer'
              )}
              aria-label={`${item.name}, ${formatValue(item.value)}, ${formatPercentage(item.percentage, 1)}`}
            >
              {rowContent}
            </motion.button>
          );
        }

        return (
          <motion.div key={slot} {...rowMotion} role="listitem" className={rowClassName}>
            {rowContent}
          </motion.div>
        );
      })}
      </AnimatePresence>

      {overflow && (
        <div className="flex items-center justify-between py-2.5 text-xs text-muted-foreground">
          <span>Altre {hidden.length} voci</span>
          <span className="font-mono tabular-nums">{formatValue(hiddenTotal)}</span>
        </div>
      )}
    </div>
  );
}
