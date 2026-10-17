/**
 * AL20 (D-AL6): how much of each hedgeable Monte Carlo class the portfolio holds in instruments the owner flagged
 * «Coperto dal cambio in EUR» (`Asset.currencyHedge`), to PROPOSE the class's hedge switch in Impostazioni › Simulazioni
 * (doc/allineamento/README.md § 9.6). The proposal is a sentence and a button; this module never writes a switch.
 *
 * The share is measured on market value, on the same legs and the same `K` as the Monte Carlo weights
 * (`expandAssetExposure`, the pension lock out, the Oro split of RG), so the class the tile names is the class the
 * simulation reads. A composite instrument's legs all take the flag of their asset.
 */
import type { Asset } from '@/types/assets';
import { MONTE_CARLO_HEDGEABLE_CLASSES, type MonteCarloHedgeableClass } from '@/lib/constants/monteCarloMarketDefaults';
import { expandAssetExposure } from './assetExposureUtils';
import { legMonteCarloClass, type MonteCarloWeightsOptions } from './monteCarloWeights';

/** Above this share the class "is" hedged in the portfolio: «la maggior parte della classe». */
export const HEDGE_PROPOSAL_SHARE = 0.5;

/** Share (0–1) of each hedgeable class's market value held in flagged instruments; a class with no value is absent. */
export function hedgedShareByClass(assets: readonly Asset[], options: MonteCarloWeightsOptions = {}): Partial<Record<MonteCarloHedgeableClass, number>> {
  const total: Partial<Record<MonteCarloHedgeableClass, number>> = {};
  const hedged: Partial<Record<MonteCarloHedgeableClass, number>> = {};
  for (const asset of assets) {
    if (options.lockedAssetIds?.has(asset.id)) continue;
    for (const component of expandAssetExposure(asset)) {
      const cls = legMonteCarloClass(component, options);
      if (!cls || !(MONTE_CARLO_HEDGEABLE_CLASSES as readonly string[]).includes(cls)) continue;
      const key = cls as MonteCarloHedgeableClass;
      total[key] = (total[key] ?? 0) + component.marketValue;
      if (asset.currencyHedge === 'EUR') hedged[key] = (hedged[key] ?? 0) + component.marketValue;
    }
  }
  const out: Partial<Record<MonteCarloHedgeableClass, number>> = {};
  for (const cls of MONTE_CARLO_HEDGEABLE_CLASSES) {
    const all = total[cls] ?? 0;
    if (all > 0) out[cls] = (hedged[cls] ?? 0) / all;
  }
  return out;
}

/** The classes whose hedge switch is off while most of the class is held hedged: the ones the tile proposes. */
export function proposedHedgeClasses(
  shares: Partial<Record<MonteCarloHedgeableClass, number>>,
  switches: Record<MonteCarloHedgeableClass, boolean>
): MonteCarloHedgeableClass[] {
  return MONTE_CARLO_HEDGEABLE_CLASSES.filter((cls) => !switches[cls] && (shares[cls] ?? 0) > HEDGE_PROPOSAL_SHARE);
}
