import type { OwnershipSummary } from '@/lib/utils/assetOwnership';
import { describeOwnership, describeOwnershipAside, describeOwnershipFooter } from '@/lib/utils/patrimonioNarrative';
import { cn } from '@/lib/utils';
import type { TileCollapse } from '@/components/ui/tile';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { OverviewTile } from './OverviewTile';

interface IntestatariTileProps {
  /** `summarizeOwnership` — the payload's on the Panoramica, the page's own on Patrimonio. */
  summary: OwnershipSummary;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («quote per persona»). */
  asideWhenClosed?: string;
  /**
   * The 4-column cell of Patrimonio at 1440 (R4, D-RU16): one person per row, name · share · euro, no
   * bar — a bar track does not fit a cell that narrow. The Panoramica does not pass it. Below `desktop:`
   * the tile is a row of a full-width column and keeps the ranked rows, whatever is passed.
   */
  dense?: boolean;
  className?: string;
}

/**
 * «Di chi è?» (owner, 2026-10-17) — the net worth by Intestatario: one ranked row per household
 * member holding something, then «In comune», then the orphaned ids, each with its amount, its
 * share of the NET total and how many assets it holds a part of (a split asset counts in every
 * row that has a quota of it, the owner's call of the quotas' day). The same tile on the
 * Panoramica (fed by the day's payload) and on Patrimonio (fed by the live assets), as
 * `PatrimonioTile` and `ComposizioneTile` already are. A group that is a net debt keeps its
 * amount with the minus and draws no bar (a bar has no negative width). The footer turns to the
 * warning tone when an asset's stored quotas no longer fit its quantity («quote da riassegnare»).
 */
export function IntestatariTile({ summary, collapse, asideWhenClosed, dense = false, className }: IntestatariTileProps) {
  const rows: RankedRow[] = summary.rows.map((row) => ({
    key: row.key,
    label: row.label,
    caption: `${row.assetCount} asset`,
    amount: row.value,
    percentage: row.sharePct === null ? 0 : Math.max(0, row.sharePct),
  }));
  const footer = describeOwnershipFooter(summary);

  return (
    <OverviewTile
      eyebrow="Intestatari"
      aside={describeOwnershipAside(summary)}
      asideWhenClosed={asideWhenClosed}
      reading={describeOwnership(summary)}
      collapse={collapse}
      className={className}
    >
      <div className={cn('mt-2', dense && 'desktop:hidden')}>
        <RankedRows rows={rows} color="var(--chart-1)" ariaLabel="Patrimonio per intestatario" />
      </div>
      {dense && (
        <ul className="mt-2 hidden flex-col divide-y divide-border desktop:flex" aria-label="Patrimonio per intestatario">
          {rows.map((row) => (
            <li key={row.key} className="flex items-baseline gap-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="line-clamp-2 break-words text-[13px] text-foreground">{row.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{row.caption}</span>
              </span>
              <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(row.percentage)}%</span>
              <span className="w-[84px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">{cachedFormatCurrencyEUR(row.amount, true)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={cn('mt-auto border-t border-border pt-3.5 text-[11px]', footer.tone === 'warning' ? 'text-warning-foreground' : 'text-muted-foreground')}>{footer.text}</p>
    </OverviewTile>
  );
}
