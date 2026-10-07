/**
 * What the objectives' editor needs from the account (doc/pac-ottimizzatore § RV6): the classes a
 * second-level objective can target, the ones that could once their sub-categories are on, the
 * instruments a second-level objective cannot place today and the tradable instruments the limits
 * pick from. Until A1 Impostazioni derived all of it from the targets FORM it was editing; the
 * editor now sits in Allocazione, so it reads the SAVED targets — the same ones the optimizer runs on.
 */
import type { Asset, AssetAllocationTarget, AssetClass } from '@/types/assets';
import { ASSET_CLASS_LABELS, resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { findSecondLevelGaps, type SecondLevelGap } from '@/lib/utils/weightOptimizer';

export interface ObjectivesClassOption {
  assetClass: AssetClass;
  label: string;
}

export interface ObjectivesEditorContext {
  factorClassOptions: ObjectivesClassOption[];
  secondLevelReadyClasses: ObjectivesClassOption[];
  secondLevelGaps: SecondLevelGap[];
  tradableAssets: { id: string; label: string }[];
}

export function buildObjectivesEditorContext(
  targets: AssetAllocationTarget,
  allAssets: Asset[],
  valueOf: (asset: Asset) => number,
): ObjectivesEditorContext {
  const classes = Object.keys(targets) as AssetClass[];
  const option = (assetClass: AssetClass): ObjectivesClassOption => ({ assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass });

  const factorClasses = classes.filter(
    (assetClass) => !!targets[assetClass]?.subCategoryConfig?.enabled && (targets[assetClass]?.subCategoryConfig?.categories.length ?? 0) > 0,
  );
  const secondLevelReadyClasses = classes.filter(
    (assetClass) => (targets[assetClass]?.targetPercentage ?? 0) > 0 && !targets[assetClass]?.subCategoryConfig?.enabled,
  );

  const scoped = allAssets.filter((asset) => {
    const role = resolveAllocationRole(asset);
    return role === 'tradable' || role === 'frozen';
  });
  return {
    factorClassOptions: factorClasses.map(option),
    secondLevelReadyClasses: secondLevelReadyClasses.map(option),
    secondLevelGaps: findSecondLevelGaps(scoped, targets, factorClasses, valueOf),
    tradableAssets: allAssets.filter((asset) => resolveAllocationRole(asset) === 'tradable').map((asset) => ({ id: asset.id, label: asset.name })),
  };
}

/** The same range checks Impostazioni ran on «Salva»: a message, or null when the objectives can be saved. */
export function findIdealAllocationProblem(value: {
  instrumentLimits: { minPct?: number; maxPct?: number }[];
  groupLimits: { label: string; maxPct: number }[];
}): string | null {
  for (const limit of value.instrumentLimits) {
    if ([limit.minPct, limit.maxPct].some((pct) => pct !== undefined && (pct < 0 || pct > 100))) {
      return 'I limiti per strumento devono essere tra 0 e 100%.';
    }
    if (limit.minPct !== undefined && limit.maxPct !== undefined && limit.minPct > limit.maxPct) {
      return 'In un limite per strumento il minimo non può superare il massimo.';
    }
  }
  for (const group of value.groupLimits) {
    if (group.maxPct < 0 || group.maxPct > 100) {
      return `Il tetto del gruppo "${group.label || 'senza etichetta'}" deve essere tra 0 e 100%.`;
    }
  }
  return null;
}
