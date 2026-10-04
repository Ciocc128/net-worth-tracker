/**
 * The capital the Monte Carlo simulates and the weights it simulates it with
 * (doc/montecarlo/README.md § 1.5 rules RK and RG, § 5.2).
 *
 * Two call sites must stay identical, because the divergent copy is the one the user sees
 * (AGENTS.md → Quick-Fix Reference): the Monte Carlo tab seeds its form from this and the FIRE
 * Ventaglio derives its exposure from it. Both go through `computeSimulatedCapital` and
 * `deriveMonteCarloWeights`.
 *
 * Model decisions:
 *   - SEVEN classes: Azioni, Obbligazioni, Oro, Materie prime, Liquidità, Trend, Carry. Crypto and
 *     real estate (and the legs of a composite asset in those classes) are OUTSIDE the simulated
 *     capital `K`; they are reported, never simulated.
 *   - Oro is the part of the `commodity` class whose sub-category is the one named in
 *     Impostazioni › Simulazioni (RG); everything else of that class is Materie prime.
 *   - a pension fund the lock keeps closed is not in `K` (it re-enters as a capital inflow).
 */
import type { Asset } from '@/types/assets';
import {
  MONTE_CARLO_CLASSES,
  MONTE_CARLO_EXCLUDED_CLASSES,
  monteCarloClassRecord,
  type MonteCarloClass,
  type MonteCarloExcludedClass,
} from '@/lib/constants/monteCarloClasses';
import { suggestIsLiquid } from './assetLiquidity';

/**
 * Paths a single Monte Carlo scenario is run with by default. A run is three scenarios
 * (bear · base · bull), so a default execution draws three times this many paths.
 *
 * It lives here rather than in `MonteCarloTab` because a second surface states it in words:
 * the public landing tells a visitor what the FIRE section computes, and a copy of the
 * number there would drift from the one the tab actually seeds (AGENTS.md → Quick-Fix
 * Reference: the divergent copy is the one the user sees).
 */
export const DEFAULT_MONTE_CARLO_SIMULATIONS = 10000;

/**
 * The seed of the Monte Carlo tab's draws (T3, README § 7.2 point 6): every scenario run — and the
 * Base run again without leverage — starts a fresh `createSeededRandom` from it, so they all meet the
 * same shocks and two «Esegui» with the same parameters give the same result.
 */
export const MONTE_CARLO_SEED = 20261003;

export interface SimulatedCapital {
  /** EUR per Monte Carlo class. */
  byClass: Record<MonteCarloClass, number>;
  /** `K`: the sum of the seven classes. */
  total: number;
  /** The part of `K` held in liquid assets (same predicate as `calculateLiquidNetWorth`). */
  liquid: number;
  /** EUR that stay outside the simulation, per excluded class. */
  excluded: Record<MonteCarloExcludedClass, number>;
}

export interface SimulatedCapitalOptions {
  /** Funds the pension lock keeps closed: they are not part of `K`. */
  lockedAssetIds?: ReadonlySet<string>;
  /** The commodity sub-category simulated as Oro (RG); null/undefined = none. */
  goldSubCategory?: string | null;
}

const MODELLED = new Set<string>(MONTE_CARLO_CLASSES.filter((cls) => cls !== 'gold'));

/** An asset's legs: the composition when it has one, else the asset itself as a single leg. */
function legsOf(asset: Asset): { assetClass: string; subCategory?: string; share: number }[] {
  return asset.composition && asset.composition.length > 0
    ? asset.composition.map((leg) => ({ assetClass: leg.assetClass, subCategory: leg.subCategory, share: leg.percentage / 100 }))
    : [{ assetClass: asset.assetClass, subCategory: asset.subCategory, share: 1 }];
}

/**
 * The fraction (0–1) of an asset's value that sits inside `K`: 1 for a plain asset of the seven
 * classes, 0 for real estate and crypto, the sum of the modelled legs for a composite one. The tax
 * profile of the plan's capital scales its basis by it (doc/fire-ipotesi/README.md RP5).
 */
export function simulatedShare(asset: Asset): number {
  return legsOf(asset).reduce((sum, leg) => (MODELLED.has(leg.assetClass) ? sum + leg.share : sum), 0);
}

/**
 * RK + RG: splits the portfolio into the seven simulated classes plus what stays outside.
 * `valueOf` is `calculateAssetValue` (injected, so this module stays free of the Firestore-coupled service).
 */
export function computeSimulatedCapital(
  assets: readonly Asset[],
  valueOf: (asset: Asset) => number,
  options: SimulatedCapitalOptions = {},
): SimulatedCapital {
  const byClass = monteCarloClassRecord(() => 0);
  const excluded = {} as Record<MonteCarloExcludedClass, number>;
  for (const cls of MONTE_CARLO_EXCLUDED_CLASSES) excluded[cls] = 0;
  let liquid = 0;

  for (const asset of assets) {
    if (options.lockedAssetIds?.has(asset.id)) continue;
    const value = valueOf(asset);
    const isLiquid = asset.isLiquid !== undefined ? asset.isLiquid === true : suggestIsLiquid(asset.type, asset.subCategory);
    for (const leg of legsOf(asset)) {
      const legValue = value * leg.share;
      if (leg.assetClass === 'realestate' || leg.assetClass === 'crypto') {
        excluded[leg.assetClass] += legValue;
        continue;
      }
      if (!MODELLED.has(leg.assetClass)) continue;
      const cls: MonteCarloClass =
        leg.assetClass === 'commodity' && options.goldSubCategory && leg.subCategory === options.goldSubCategory ? 'gold' : (leg.assetClass as MonteCarloClass);
      byClass[cls] += legValue;
      if (isLiquid) liquid += legValue;
    }
  }

  const total = MONTE_CARLO_CLASSES.reduce((sum, cls) => sum + byClass[cls], 0);
  return { byClass, total, liquid, excluded };
}

/**
 * Normalises EUR per class onto percentages summing to exactly 100: each class is rounded, classes
 * sorted descending by value, and the rounding residual goes to the smallest class (even at zero
 * value) — the rule the four-class version always had. When that residual would make the smallest
 * class negative (many tiny classes rounding up), it is taken off the largest instead.
 *
 * @returns null when the seven classes hold no value, meaning «keep whatever you already had».
 */
export function deriveMonteCarloWeights(byClass: Partial<Record<MonteCarloClass, number>>): Record<MonteCarloClass, number> | null {
  const values = MONTE_CARLO_CLASSES.map((key) => ({ key, value: Math.max(0, byClass[key] ?? 0) }));
  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) return null;

  // Stable sort: ties keep the model's order.
  const sorted = [...values].sort((a, b) => b.value - a.value);
  const result = monteCarloClassRecord(() => 0);

  let allocated = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const pct = Math.round((sorted[i].value / total) * 100);
    result[sorted[i].key] = pct;
    allocated += pct;
  }
  const smallest = sorted[sorted.length - 1].key;
  const residual = 100 - allocated;
  if (residual >= 0) {
    result[smallest] = residual;
  } else {
    result[sorted[0].key] += residual;
  }
  return result;
}
