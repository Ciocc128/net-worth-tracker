/**
 * Display-only prevailing asset class.
 *
 * A composite asset (a fondo pensione, a multi-sleeve ETF) has no single "true" class — its real
 * exposure lives in `Asset.composition`. `Asset.assetClass` itself only ever holds ONE value
 * (`TYPE_TO_CLASS['pensionFund'] = 'equity'` for a fund with no composition yet — see
 * AssetDialog.tsx), so a table that always reads `asset.assetClass` shows "Azioni" for a fund that
 * is actually 70% obbligazioni. This module answers "which class should a badge/group/sort show?"
 * WITHOUT ever writing back to `asset.assetClass` — no role/class is ever inferred at read time
 * (same rule as `resolveAllocationRole` in allocationUtils.ts). It is purely a display label.
 */
import type { Asset, AssetClass, AssetComposition } from '@/types/assets';
import { ASSET_CLASS_LABELS as labels } from './allocationUtils';

interface AssetClassLeg {
  assetClass: AssetClass;
  weight: number;
}

/**
 * Splits one asset into (assetClass, weight) legs, looking through `composition` when present —
 * weight is the composition percentage, or the asset's own class at full weight when uncomposed.
 * Shared by `resolveDisplayAssetClass` (ranks legs directly, no dollar value needed) and
 * `buildPensionLookThrough` in allocazioneSummary.ts (ranks legs after scaling weight by the asset's market VALUE) — the
 * third consumer of this exact "split into weighted class legs" shape is what earned the extraction
 * (Rule of Three), the two were duplicated as `assetLegs`/`toClassSlices` before this file existed.
 */
function assetClassLegs(
  asset: Pick<Asset, 'assetClass' | 'composition'>,
  totalWeight: number = 100
): AssetClassLeg[] {
  if (asset.composition && asset.composition.length > 0) {
    return asset.composition.map((comp: AssetComposition) => ({
      assetClass: comp.assetClass,
      weight: (totalWeight * comp.percentage) / 100,
    }));
  }
  return [{ assetClass: asset.assetClass, weight: totalWeight }];
}

/**
 * The composition leg with the largest share, falling back to `asset.assetClass` when composition
 * is empty/absent. On a tie, the FIRST leg in insertion order wins (`Array.prototype.sort` is
 * stable) — an arbitrary but deterministic choice, since there is no third signal to break a real
 * 50/50 split. NEVER used to rewrite `asset.assetClass` — display only (table badges, group
 * headers, sort), never allocation math, snapshots, or Storico, which already do their own
 * composition look-through where it matters.
 */
export function resolveDisplayAssetClass(
  asset: Pick<Asset, 'assetClass' | 'composition'>
): AssetClass {
  // assetClassLegs always returns at least one leg (the uncomposed fallback), so the top of a
  // descending sort is always defined.
  return rankedClassLegs(asset)[0].assetClass;
}

/**
 * The asset's legs with one entry per class (a composition that names a class twice is one leg),
 * largest first; on a tie, the class that appears first in the composition. The ONE ranking both
 * the row's group (`resolveDisplayAssetClass`) and its chip's segments (`describeAssetClassChip`)
 * read, so the chip's first segment is always the group the row sits in.
 */
function rankedClassLegs(asset: Pick<Asset, 'assetClass' | 'composition'>): AssetClassLeg[] {
  const byClass = new Map<AssetClass, number>();
  for (const leg of assetClassLegs(asset)) byClass.set(leg.assetClass, (byClass.get(leg.assetClass) ?? 0) + leg.weight);
  return [...byClass.entries()].map(([assetClass, weight]) => ({ assetClass, weight })).sort((a, b) => b.weight - a.weight);
}

export { assetClassLegs };

/** Below this share (in %) a leg gets no segment and no word in the label — only the accessible name. */
export const MIN_CHIP_SEGMENT_PCT = 5;

/** Fixed short forms, so «Azioni · Obbl.» fits the chip; the accessible name spells every class out. */
const SHORT_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Azioni',
  bonds: 'Obbl.',
  crypto: 'Cripto',
  realestate: 'Immob.',
  cash: 'Liquid.',
  commodity: 'Mat. prime',
  trendFollowing: 'Trend',
  carry: 'Carry',
};

export interface AssetClassChipModel {
  /** Visible segments, prevailing first; `share` is the segment's width in % (they sum to 100). */
  segments: Array<{ assetClass: AssetClass; share: number }>;
  /** The visible text: a class name, «Azioni · Obbl.» for two segments, «Misto» from three. */
  label: string;
  /** Every leg with its share, the small ones included — null for a single-class asset, whose label says it all. */
  accessibleName: string | null;
}

function formatShare(pct: number): string {
  return `${Number.isInteger(pct) ? pct : pct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;
}

/**
 * What the Strumenti class chip shows for one asset. A composite asset (a 60/40 fund, a leveraged
 * equity/bond ETF) stays ONE row — it is one instrument — but its chip splits into one segment per
 * composition leg, as wide as the leg's share of the market value (leverage is a separate field and
 * does not widen a segment). A leg under `MIN_CHIP_SEGMENT_PCT` has no segment and no word in the
 * label: a 95/5 fund reads «Azioni», with the 5% in the accessible name. Same look-through as
 * `resolveDisplayAssetClass`, so the chip's first segment is always the class the row is grouped and
 * sorted under.
 */
export function describeAssetClassChip(asset: Pick<Asset, 'assetClass' | 'composition'>): AssetClassChipModel {
  const ranked = rankedClassLegs(asset);
  const legs = ranked.filter((leg) => leg.weight > 0);

  if (legs.length <= 1) {
    const assetClass = legs[0]?.assetClass ?? ranked[0].assetClass;
    return { segments: [{ assetClass, share: 100 }], label: labels[assetClass] ?? assetClass, accessibleName: null };
  }

  const accessibleName = legs.map((leg) => `${labels[leg.assetClass] ?? leg.assetClass} ${formatShare(leg.weight)}`).join(', ');
  const kept = legs.filter((leg) => leg.weight >= MIN_CHIP_SEGMENT_PCT);
  // Nothing reaches the floor only on a scatter of tiny legs; showing them all beats an empty chip.
  const visible = kept.length > 0 ? kept : legs;
  const visibleTotal = visible.reduce((sum, leg) => sum + leg.weight, 0);
  const segments = visible.map((leg) => ({ assetClass: leg.assetClass, share: (leg.weight / visibleTotal) * 100 }));

  let label: string;
  if (segments.length === 1) label = labels[segments[0].assetClass] ?? segments[0].assetClass;
  else if (segments.length === 2) label = segments.map((s) => SHORT_CLASS_LABELS[s.assetClass] ?? s.assetClass).join(' · ');
  else label = 'Misto';

  return { segments, label, accessibleName };
}
