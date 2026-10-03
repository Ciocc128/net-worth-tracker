/**
 * The weights the Monte Carlo simulates with, seeded from what the user already declared
 * (doc/montecarlo/README.md § 1.5 rule R6, § 7.2). Two seeds, one vocabulary:
 *
 *   - `seedWeightsFromTargets`: the EFFECTIVE targets of Allocazione (the caller passes the ones
 *     `resolveEffectiveTargets` returns — this module never re-derives them). Every target is a
 *     desired NOTIONAL exposure as a % of the investable capital, so their sum above 100 IS the
 *     leverage (90% equity + 60% bonds = 150%, 1,5×), the same convention as
 *     `deriveTargetLeverageRatio`.
 *   - `weightsFromHoldings`: the notional held today (`expandAssetExposure`), leverage included.
 *
 * Both are measured on `K`, the simulated capital (rule RK: the modelled classes net of the closed
 * pension funds), so a weight is `notional / K` and the weights sum to `leverage × 100`. Crypto and
 * real estate (and the legs of a composite in those classes) are outside `K` and outside the weights.
 *
 * Pure: the only collaborator is `expandAssetExposure`, the app's one reading of a holding's market
 * value and notional.
 */
import type { Asset, AssetAllocationTarget } from '@/types/assets';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { expandAssetExposure } from './assetExposureUtils';
import { resolveAllocationRole } from './allocationUtils';
import { deriveMonteCarloWeights } from './monteCarloParams';

export interface MonteCarloWeightsOptions {
  /** Funds the pension lock keeps closed: outside `K` and outside the investable base. */
  lockedAssetIds?: ReadonlySet<string>;
  /** The commodity sub-category simulated as Oro (RG); null/undefined = none. */
  goldSubCategory?: string | null;
}

export interface SeededWeights {
  /** Percent per class; they sum to 100 or, with leverage, to `leverage × 100`. */
  weights: Record<MonteCarloClass, number>;
  /** `Σ weights / 100`, 1 when the weights sum to 100. */
  leverage: number;
}

const MODELLED = new Set<string>(MONTE_CARLO_CLASSES.filter((cls) => cls !== 'gold'));

/** Above this a sum is leverage; below it, the rounding of the percentages. */
const LEVERAGE_TOLERANCE_PCT = 0.5;

interface Leg {
  cls: MonteCarloClass;
  market: number;
  notional: number;
  role: ReturnType<typeof resolveAllocationRole>;
}

/** The modelled legs of every asset in `K`, with the gold split of RG applied. */
function collectLegs(assets: readonly Asset[], options: MonteCarloWeightsOptions): Leg[] {
  const legs: Leg[] = [];
  for (const asset of assets) {
    if (options.lockedAssetIds?.has(asset.id)) continue;
    const role = resolveAllocationRole(asset);
    for (const component of expandAssetExposure(asset)) {
      if (!MODELLED.has(component.assetClass)) continue;
      const cls: MonteCarloClass =
        component.assetClass === 'commodity' && options.goldSubCategory && component.subCategory === options.goldSubCategory ? 'gold' : (component.assetClass as MonteCarloClass);
      legs.push({ cls, market: component.marketValue, notional: component.notionalValue, role });
    }
  }
  return legs;
}

/**
 * Percent per class → the weights the form holds. A sum of 100 (within the rounding) is normalised
 * to exactly 100 by the same rule the unleveraged seed always had; a leveraged sum keeps one decimal
 * per class, so the leverage it states is the one the user sees.
 */
function normalise(percentByClass: Record<MonteCarloClass, number>): SeededWeights | null {
  const sum = MONTE_CARLO_CLASSES.reduce((total, cls) => total + percentByClass[cls], 0);
  if (!(sum > 0)) return null;
  if (sum <= 100 + LEVERAGE_TOLERANCE_PCT) {
    // Scale a sum a little under 100 onto 100 (the allocation's own rule), then the integer normaliser.
    const weights = deriveMonteCarloWeights(percentByClass);
    return weights ? { weights, leverage: 1 } : null;
  }
  const weights = monteCarloClassRecord((cls) => Math.round(percentByClass[cls] * 10) / 10);
  const rounded = MONTE_CARLO_CLASSES.reduce((total, cls) => total + weights[cls], 0);
  return { weights, leverage: rounded / 100 };
}

/** R6 «Importa il portafoglio di oggi»: `w_c = Σ notional_c / K`, null when `K` is empty. */
export function weightsFromHoldings(assets: readonly Asset[], options: MonteCarloWeightsOptions = {}): SeededWeights | null {
  const legs = collectLegs(assets, options);
  const capital = legs.reduce((total, leg) => total + leg.market, 0);
  if (!(capital > 0)) return null;
  const percent = monteCarloClassRecord<number>(() => 0);
  for (const leg of legs) percent[leg.cls] += (leg.notional / capital) * 100;
  return normalise(percent);
}

function subTargetPercentage(entry: number | { targetPercentage: number } | undefined): number {
  const value = typeof entry === 'number' ? entry : entry?.targetPercentage;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * The share of the commodity target that is Oro (RG): the gold sub-target over the commodity
 * sub-targets when they are configured, else the gold share held today, else none.
 */
function goldShareOfCommodityTarget(target: AssetAllocationTarget[string] | undefined, goldSubCategory: string | null | undefined, heldGold: number, heldCommodity: number): number {
  if (!goldSubCategory) return 0;
  const subTargets = target?.subTargets;
  if (target?.subCategoryConfig?.enabled && subTargets) {
    const total = Object.values(subTargets).reduce<number>((sum, entry) => sum + subTargetPercentage(entry), 0);
    if (total > 0) return subTargetPercentage(subTargets[goldSubCategory]) / total;
  }
  const held = heldGold + heldCommodity;
  return held > 0 ? heldGold / held : 0;
}

/**
 * R6: `w_c = (t_c·B + E_c) / K` over the capital `K` of the simulation, where `t_c` is the effective
 * target of the class (a % of the investable capital), `B` the market value of the investable capital
 * (`allocationRole` tradable or frozen, inside `K`) and `E_c` the notional of the class in the
 * `excluded` assets that are part of `K`. A fixed-amount cash target enters as its amount. The
 * crypto and real-estate targets take no weight: the modelled targets are rescaled by
 * `100 / (100 − t_crypto − t_realestate)`.
 *
 * Returns null when there are no targets on the modelled classes (the caller then seeds from the
 * holdings and says so) or `K` is empty.
 */
export function seedWeightsFromTargets(targets: AssetAllocationTarget | null | undefined, assets: readonly Asset[], options: MonteCarloWeightsOptions = {}): SeededWeights | null {
  if (!targets) return null;
  const legs = collectLegs(assets, options);
  const capital = legs.reduce((total, leg) => total + leg.market, 0);
  if (!(capital > 0)) return null;

  const investable = legs.filter((leg) => leg.role !== 'excluded').reduce((total, leg) => total + leg.market, 0);
  const excludedNotional = monteCarloClassRecord<number>(() => 0);
  for (const leg of legs) if (leg.role === 'excluded') excludedNotional[leg.cls] += leg.notional;
  const heldMarket = monteCarloClassRecord<number>(() => 0);
  for (const leg of legs) heldMarket[leg.cls] += leg.market;

  const percentOf = (assetClass: string): number => Math.max(0, targets[assetClass]?.targetPercentage || 0);
  const outsidePct = percentOf('crypto') + percentOf('realestate');
  const rescale = outsidePct < 100 ? 100 / (100 - outsidePct) : 1;

  const cashFixed = targets.cash?.useFixedAmount ? Math.max(0, targets.cash.fixedAmount || 0) : 0;
  const classTarget = monteCarloClassRecord<number>(() => 0);
  let anyTarget = cashFixed > 0;
  for (const cls of MONTE_CARLO_CLASSES) {
    if (cls === 'gold') continue;
    if (cls === 'cash' && targets.cash?.useFixedAmount) continue;
    const pct = percentOf(cls) * rescale;
    if (pct > 0) anyTarget = true;
    classTarget[cls] = pct;
  }
  if (!anyTarget) return null;

  // RG on the target: the commodity target splits between Oro and Materie prime.
  const goldShare = goldShareOfCommodityTarget(targets.commodity, options.goldSubCategory, heldMarket.gold, heldMarket.commodity);
  classTarget.gold = classTarget.commodity * goldShare;
  classTarget.commodity = classTarget.commodity * (1 - goldShare);

  const percent = monteCarloClassRecord<number>(() => 0);
  for (const cls of MONTE_CARLO_CLASSES) percent[cls] = (((classTarget[cls] / 100) * investable + excludedNotional[cls]) / capital) * 100;
  percent.cash += (cashFixed / capital) * 100;
  return normalise(percent);
}
