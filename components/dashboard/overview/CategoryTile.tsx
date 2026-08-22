import type { DashboardOverviewCategoryAmount } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { OverviewTile } from './OverviewTile';
import { RankedRows } from './RankedRows';

interface CategoryTileProps {
  eyebrow: string;
  /** The month total the rows are a share of — shown beside the eyebrow and used for the residual. */
  total: number;
  categories: DashboardOverviewCategoryAmount[];
  /** Bar colour, a theme chart slot. */
  color: string;
  emptyCopy: string;
  className?: string;
}

/**
 * "Dove vanno / da dove arrivano i soldi?" — the month's top categories as ranked rows. The
 * payload carries the top 5 only, so the list closes with the residual ("Altre categorie") —
 * a list titled "per categoria" that does not add up to the total reads as missing data.
 */
export function CategoryTile({ eyebrow, total, categories, color, emptyCopy, className }: CategoryTileProps) {
  const shown = categories.reduce((sum, c) => sum + c.amount, 0);
  const remainderAmount = Math.max(0, total - shown);

  return (
    <OverviewTile
      eyebrow={eyebrow}
      aside={<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(total, true)}</span>}
      className={className}
    >
      {categories.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{emptyCopy}</p>
      ) : (
        <div className="mt-2">
          <RankedRows
            rows={categories.map((c) => ({
              key: c.categoryKey ?? c.category,
              label: c.category,
              amount: c.amount,
              percentage: c.percentage,
            }))}
            color={color}
            remainder={
              remainderAmount >= 1
                ? {
                    label: 'Altre categorie',
                    amount: remainderAmount,
                    percentage: total > 0 ? (remainderAmount / total) * 100 : 0,
                  }
                : null
            }
          />
        </div>
      )}
    </OverviewTile>
  );
}
