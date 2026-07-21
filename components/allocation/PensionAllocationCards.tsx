/**
 * PensionAllocationCards — read-only previdenza views for the Allocazione page (spec §8.1).
 *
 * The main allocation pie (target vs actual, with COMPRA/VENDI chips) stays UNTOUCHED and on the
 * personal portfolio only — the fondo pensione is not rebalanceable by the user, so it must not
 * dilute the targets. Instead, behind a "Mostra previdenza complementare" toggle, two read-only
 * cards appear:
 *   - Card A — «Allocazione fondo pensione»: the fund(s) underlying mix on its own (equity/bond from
 *     `composition`, or a single «Previdenza» bucket for a plain manually-valued fund).
 *   - Card B — «Portafoglio + previdenza»: the combined split of all invested capital.
 *
 * Neither card has targets or actions — the fund is read-only here.
 */
'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, PiggyBank } from 'lucide-react';
import { Asset } from '@/types/assets';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import { getAssetClassCssVar } from '@/lib/constants/colors';
import { formatAssetClassName } from '@/lib/utils/assetUtils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface ClassSlice {
  assetClass: string;
  value: number;
  percentage: number;
}

/**
 * Split one asset into (assetClass, value) legs. This dedicated Previdenza view is the ONE place a
 * fondo pensione is LOOKED THROUGH: if it carries an underlying composition (e.g. 75% equity / 20%
 * bonds / 5% real estate), it is expanded into those classes here — everywhere else the fund stays
 * whole as class 'pension' (see `expandAssetExposure`). Other assets use their normal exposure.
 */
function assetLegs(asset: Asset): { assetClass: string; value: number }[] {
  if (asset.type === 'pension') {
    const value = calculateAssetValue(asset);
    if (value <= 0) return [];
    if (asset.composition && asset.composition.length > 0) {
      return asset.composition.map((comp) => ({
        assetClass: comp.assetClass,
        value: (value * comp.percentage) / 100,
      }));
    }
    return [{ assetClass: 'pension', value }];
  }
  return expandAssetExposure(asset).map((component) => ({
    assetClass: component.assetClass,
    value: component.marketValue ?? 0,
  }));
}

/** Aggregate the market value of a set of assets by asset class, as sorted slices summing to 100%. */
function toClassSlices(assets: Asset[]): ClassSlice[] {
  const byClass = new Map<string, number>();
  for (const asset of assets) {
    for (const leg of assetLegs(asset)) {
      if (leg.value <= 0) continue;
      byClass.set(leg.assetClass, (byClass.get(leg.assetClass) ?? 0) + leg.value);
    }
  }
  const total = Array.from(byClass.values()).reduce((sum, v) => sum + v, 0);
  if (total <= 0) return [];
  return Array.from(byClass.entries())
    .map(([assetClass, value]) => ({ assetClass, value, percentage: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

function AllocationReadOnlyCard({ title, slices }: { title: string; slices: ClassSlice[] }) {
  if (slices.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-[22px]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      {/* Segmented bar */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
        {slices.map((slice) => (
          <div
            key={slice.assetClass}
            style={{ width: `${slice.percentage}%`, backgroundColor: getAssetClassCssVar(slice.assetClass) }}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="mt-4 divide-y divide-border/60">
        {slices.map((slice) => (
          <div key={slice.assetClass} className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: getAssetClassCssVar(slice.assetClass) }}
                aria-hidden="true"
              />
              <span className="truncate text-sm text-foreground">
                {formatAssetClassName(slice.assetClass)}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm tabular-nums text-foreground">
                {slice.percentage.toFixed(1)}%
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {cachedFormatCurrencyEUR(slice.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PensionAllocationCards({ assets }: { assets: Asset[] }) {
  const [open, setOpen] = useState(false);

  const pensionAssets = useMemo(() => assets.filter((a) => a.type === 'pension'), [assets]);
  const fundSlices = useMemo(() => toClassSlices(pensionAssets), [pensionAssets]);
  const combinedSlices = useMemo(() => toClassSlices(assets), [assets]);

  // Nothing to show without a fondo pensione.
  if (pensionAssets.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">Mostra previdenza complementare</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-3 grid gap-3 desktop:grid-cols-2">
          <AllocationReadOnlyCard title="Allocazione fondo pensione" slices={fundSlices} />
          <AllocationReadOnlyCard title="Portafoglio + previdenza" slices={combinedSlices} />
        </div>
      )}
    </div>
  );
}
