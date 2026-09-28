/**
 * The Allocazione comparison — current vs target per class / sub-category / specific asset on the
 * leverage-aware, role-partitioned base — and the EFFECTIVE targets it is measured against.
 *
 * Extracted from `lib/services/assetAllocationService.ts` (2026-09-28, F1b of
 * doc/ai-open-models-wiki.md) so the periodic email, which runs on the server with the Admin SDK,
 * measures allocation with the SAME function as the page instead of a second one: that file does
 * Firestore reads and writes through the client SDK, this one does none. The service re-exports
 * every symbol, so its importers are unchanged.
 *
 * Asset values still come from `calculateAssetValue` (through `expandAssetExposure`), the ONE
 * valuation of a position — as in every other `lib/utils` module that values assets.
 */

import type { Asset, AssetClass, AssetAllocationTarget, AssetAllocationSettings, AllocationResult, AllocationData, MonthlySnapshot } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { calculateAssetValue } from '@/lib/services/assetService';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';
import { partitionByAllocationRole, ASSET_CLASS_SEQUENCE, NO_SUBCATEGORY_LABEL } from '@/lib/utils/allocationUtils';
import { deriveTargetAllocationFromGoals } from '@/lib/utils/goalMath';
import { DEFAULT_SUB_CATEGORIES } from '@/lib/constants/defaultSubCategories';

/**
 * Find assets that match a specific asset name/ticker
 *
 * Matching is case-insensitive and checks both ticker and name fields.
 * Only returns assets that match the specified asset class and subcategory.
 *
 * @param assets - Array of all portfolio assets
 * @param specificAssetName - Name or ticker to search for (e.g., "Enel", "AAPL")
 * @param assetClass - Asset class to filter by
 * @param subCategory - Subcategory to filter by
 * @returns Array of matching assets
 */
function findMatchingAssets(
  assets: Asset[],
  specificAssetName: string,
  assetClass: string,
  subCategory: string
): Asset[] {
  const searchTerm = specificAssetName.trim().toLowerCase();

  return assets.filter(asset => {
    // Must match asset class
    if (asset.assetClass !== assetClass) return false;

    // Must match subcategory
    if (asset.subCategory !== subCategory) return false;

    // Match on ticker or name (case-insensitive, partial match)
    const tickerMatch = asset.ticker.toLowerCase().includes(searchTerm);
    const nameMatch = asset.name.toLowerCase().includes(searchTerm);

    return tickerMatch || nameMatch;
  });
}

/**
 * A single basis (market OR notional) of the exposure snapshot: totals and per-class /
 * per-sub-category / per-specific-asset breakdowns, all in the same unit.
 */
interface AllocationBasisSnapshot {
  totalValue: number;
  byAssetClass: Record<string, number>;
  /** class -> subCategory -> value. */
  bySubCategory: Record<string, Record<string, number>>;
  /** class -> specificAssetKey (asset id/name) -> value. */
  bySpecificAsset: Record<string, Record<string, number>>;
}

/**
 * Current allocation seen on BOTH bases at once: `market` (what it is worth) and `notional`
 * (the risk exposure it carries, market × leverage). For an unleveraged portfolio the two are
 * identical. Produced by `calculateCurrentAllocationSnapshot`, consumed by
 * `toLegacyAllocationResult` and by the instrument-aware planner (via the page).
 */
interface CurrentAllocationSnapshot {
  market: AllocationBasisSnapshot;
  notional: AllocationBasisSnapshot;
  metadata: {
    marketValue: number;
    notionalValue: number;
    leverageRatio: number;
    hasLeveragedExposure: boolean;
  };
}

/** Fixed set of top-level asset classes, used to seed a `CurrentAllocationSnapshot`. */
const ALL_ASSET_CLASSES: AssetClass[] = ASSET_CLASS_SEQUENCE;

/**
 * Expand every asset into per-class market AND notional exposure (`expandAssetExposure`, the
 * single source per invariant #2) and aggregate into a two-basis snapshot. No asset is
 * partitioned out here — the caller decides which set of assets to pass (`compareAllocations`,
 * its only caller, passes the investable base = tradable + frozen).
 */
function calculateCurrentAllocationSnapshot(
  assets: Asset[],
  assetClasses: AssetClass[]
): CurrentAllocationSnapshot {
  const seed = (): Record<string, number> =>
    assetClasses.reduce<Record<string, number>>((acc, assetClass) => {
      acc[assetClass] = 0;
      return acc;
    }, {});

  const marketByAssetClass = seed();
  const notionalByAssetClass = seed();
  const marketBySubCategory: Record<string, Record<string, number>> = {};
  const notionalBySubCategory: Record<string, Record<string, number>> = {};
  const marketBySpecificAsset: Record<string, Record<string, number>> = {};
  const notionalBySpecificAsset: Record<string, Record<string, number>> = {};

  let totalMarketValue = 0;
  let totalNotionalValue = 0;

  const nested = (
    container: Record<string, Record<string, number>>,
    parentKey: string
  ): Record<string, number> => (container[parentKey] ??= {});

  const add = (bucket: Record<string, number>, key: string | undefined, value: number) => {
    if (!key) return;
    bucket[key] = (bucket[key] ?? 0) + value;
  };

  for (const asset of assets) {
    const specificAssetKey = asset.id || asset.name;

    for (const component of expandAssetExposure(asset)) {
      const { marketValue, notionalValue, assetClass } = component;
      const subCategory = component.subCategory?.trim();

      totalMarketValue += marketValue;
      totalNotionalValue += notionalValue;

      add(marketByAssetClass, assetClass, marketValue);
      add(notionalByAssetClass, assetClass, notionalValue);

      // A holding with no subcategory still belongs to the class, so it must land in a bucket:
      // dropping it made the class total (the denominator of every sleeve) larger than the sum of
      // the sleeves, and each targeted sleeve read under target by the unclassified share, with
      // its euros nowhere on screen. `NO_SUBCATEGORY_LABEL` is the residual bucket — it carries no
      // target and receives no verdict; `toLegacyAllocationResult` emits it as a stated row.
      const subCategoryKey = subCategory || NO_SUBCATEGORY_LABEL;
      add(nested(marketBySubCategory, assetClass), subCategoryKey, marketValue);
      add(nested(notionalBySubCategory, assetClass), subCategoryKey, notionalValue);

      if (specificAssetKey) {
        add(nested(marketBySpecificAsset, assetClass), specificAssetKey, marketValue);
        add(nested(notionalBySpecificAsset, assetClass), specificAssetKey, notionalValue);
      }
    }
  }

  const leverageRatio = totalMarketValue > 0 ? totalNotionalValue / totalMarketValue : 1;
  const hasLeveragedExposure =
    totalMarketValue > 0 && Math.abs(totalNotionalValue - totalMarketValue) > 0.01;

  return {
    market: {
      totalValue: totalMarketValue,
      byAssetClass: marketByAssetClass,
      bySubCategory: marketBySubCategory,
      bySpecificAsset: marketBySpecificAsset,
    },
    notional: {
      totalValue: totalNotionalValue,
      byAssetClass: notionalByAssetClass,
      bySubCategory: notionalBySubCategory,
      bySpecificAsset: notionalBySpecificAsset,
    },
    metadata: { marketValue: totalMarketValue, notionalValue: totalNotionalValue, leverageRatio, hasLeveragedExposure },
  };
}

/** Shared ±2 p.p. threshold that decides COMPRA/VENDI/OK everywhere in this file. */
function classifyAction(difference: number): AllocationData['action'] {
  if (difference > 2) return 'VENDI';
  if (difference < -2) return 'COMPRA';
  return 'OK';
}

/**
 * The TARGET leverage a target set encodes. Every target % is a desired notional exposure as a
 * percentage of invested capital, so the SUM over the configured classes is exactly
 * `leverage × 100` (equity 90% + bonds 60% ⇒ 1.50×). Read-only / derived: the app
 * never stores a manual leverage input. Returns 1 for an empty/absent target set (no leverage).
 *
 * No exclusions parameter (D1): exclusions live on the asset (`allocationRole`), not on classes,
 * so every configured class target counts toward the target leverage of the investable base.
 */
export function deriveTargetLeverageRatio(targets: AssetAllocationTarget | null): number {
  if (!targets) return 1;
  let sum = 0;
  for (const [assetClass, data] of Object.entries(targets)) {
    // A fixed-amount cash target keeps a stale `targetPercentage` beside it (Settings sums the
    // other classes «excl. cash»); counting it read a 100% plan as a 1,05× leverage target.
    if (assetClass === 'cash' && data.useFixedAmount) continue;
    sum += Math.max(0, data.targetPercentage || 0);
  }
  return sum > 0 ? sum / 100 : 1;
}

/**
 * Build the `AllocationResult` (current vs target per class / sub-category / specific asset) on
 * the LEVERAGE-AWARE basis: every current/target percentage is a NOTIONAL exposure expressed as
 * a % of the investable MARKET capital, so a leveraged portfolio's weights legitimately sum to
 * MORE than 100% — their sum is the leverage ratio × 100. Current and target sit on the same
 * axis and stay directly comparable (a class's `difference` in p.p. drives COMPRA/VENDI/OK
 * exactly as before).
 *
 *   - current value per class = its NOTIONAL exposure (`snapshot.notional`).
 *   - denominator (`marketBase`) = investable MARKET capital = Σ market of the snapshot classes.
 *   - target value per class = `targetPercentage% × marketBase`, kept as a notional € figure so
 *     `differenceValue` is a real "how many € of exposure to move".
 *
 * For an unleveraged portfolio this reduces to the previous behavior (market == notional,
 * weights sum to 100), so pre-leverage results are unchanged (invariant #1).
 *
 * `assets` is only needed for the specific-asset level (matched by ticker/name via
 * `findMatchingAssets`, summing plain market value — specific-asset targets are individual
 * stocks, not leveraged instruments, so market value is an adequate proxy there).
 */
function toLegacyAllocationResult(
  snapshot: CurrentAllocationSnapshot,
  targets: AssetAllocationTarget | null,
  assets: Asset[]
): AllocationResult {
  const marketBase = snapshot.market.totalValue;
  const notionalInvestable = snapshot.notional.totalValue;

  const baseMetadata = {
    totalValue: notionalInvestable,
    marketValue: marketBase,
    notionalValue: notionalInvestable,
    leverageRatio: snapshot.metadata.leverageRatio,
    hasLeveragedExposure: snapshot.metadata.hasLeveragedExposure,
  };

  if (!targets || marketBase === 0) {
    return { byAssetClass: {}, bySubCategory: {}, bySpecificAsset: {}, ...baseMetadata };
  }

  // Fixed-amount cash is a legacy alternative to a percentage target: the reserved € is carved
  // out of the market base before the other classes' targets apply. (Excluding cash from the base
  // is a per-asset `allocationRole` decision now, so there is no class-level cash exclusion here.)
  const cashTarget = targets['cash'];
  const useCashFixedAmount = cashTarget?.useFixedAmount || false;
  const cashFixedAmount = useCashFixedAmount ? (cashTarget?.fixedAmount || 0) : 0;
  const targetBase = useCashFixedAmount ? Math.max(0, marketBase - cashFixedAmount) : marketBase;

  const byAssetClass: AllocationResult['byAssetClass'] = {};
  const bySubCategory: AllocationResult['bySubCategory'] = {};
  const bySpecificAsset: AllocationResult['bySpecificAsset'] = {};

  Object.keys(targets).forEach((assetClass) => {
    const targetData = targets[assetClass];
    const currentValue = snapshot.notional.byAssetClass[assetClass] || 0; // notional exposure
    const currentPercentage = marketBase > 0 ? (currentValue / marketBase) * 100 : 0;

    let targetValue: number;
    let targetPercentage: number;

    if (assetClass === 'cash' && useCashFixedAmount) {
      targetValue = cashFixedAmount;
      targetPercentage = marketBase > 0 ? (targetValue / marketBase) * 100 : 0;
    } else {
      // % of the (possibly fixed-cash-reduced) market base, expressed as a notional € figure —
      // and, as a percentage, re-expressed on the MARKET base like `currentPercentage` is: with
      // a 25k reserve on 200k, a 70% equity target is 61,25% of the market, and the p.p. drift
      // must compare the two on one base or every class reads under target by the cash share.
      targetValue = (targetBase * targetData.targetPercentage) / 100;
      targetPercentage = marketBase > 0 ? (targetValue / marketBase) * 100 : 0;
    }

    const difference = currentPercentage - targetPercentage;
    const differenceValue = currentValue - targetValue;

    byAssetClass[assetClass] = {
      currentPercentage,
      currentValue,
      targetPercentage,
      targetValue,
      difference,
      differenceValue,
      action: classifyAction(difference),
    };

    // Compare sub-categories if they exist (relative to their parent class's notional totals).
    if (targetData.subTargets) {
      const assetClassCurrentTotal = currentValue;
      const assetClassTargetTotal = targetValue;
      const subCurrentValues = snapshot.notional.bySubCategory[assetClass] ?? {};

      Object.keys(targetData.subTargets).forEach((subCategory) => {
        const subTargetData = targetData.subTargets![subCategory];

        // Support both old format (number) and new format (SubCategoryTarget)
        const subTargetPercentage = typeof subTargetData === 'number'
          ? subTargetData
          : subTargetData.targetPercentage;

        // Use composite key "assetClass:subCategory" to avoid collisions
        const subCategoryKey = `${assetClass}:${subCategory}`;
        const subCurrentValue = subCurrentValues[subCategory] || 0;

        // Sub-category percentage is relative to its asset class current value
        const subCurrentPercentage =
          assetClassCurrentTotal > 0 ? (subCurrentValue / assetClassCurrentTotal) * 100 : 0;

        // Target value is percentage of the asset class target value
        const subTargetValue = (assetClassTargetTotal * subTargetPercentage) / 100;
        const subDifference = subCurrentPercentage - subTargetPercentage;
        const subDifferenceValue = subCurrentValue - subTargetValue;

        bySubCategory[subCategoryKey] = {
          currentPercentage: subCurrentPercentage,
          currentValue: subCurrentValue,
          targetPercentage: subTargetPercentage,
          targetValue: subTargetValue,
          difference: subDifference,
          differenceValue: subDifferenceValue,
          action: classifyAction(subDifference),
        };

        // Compare specific assets if enabled
        if (typeof subTargetData === 'object' && subTargetData.specificAssetsEnabled && subTargetData.specificAssets) {
          subTargetData.specificAssets.forEach((specificAsset) => {
            // Use composite key "assetClass:subCategory:assetName"
            const specificAssetKey = `${assetClass}:${subCategory}:${specificAsset.name}`;

            // Find matching assets and sum their (market) value. Specific-asset targets are
            // individual unleveraged stocks, so market ≈ notional here.
            const matchingAssets = findMatchingAssets(assets, specificAsset.name, assetClass, subCategory);
            const specificCurrentValue = matchingAssets.reduce(
              (sum, asset) => sum + calculateAssetValue(asset),
              0
            );

            // Calculate percentage relative to subcategory current value
            const specificCurrentPercentage = subCurrentValue > 0
              ? (specificCurrentValue / subCurrentValue) * 100
              : 0;

            // Target value is percentage of the subcategory target value
            const specificTargetValue = (subTargetValue * specificAsset.targetPercentage) / 100;
            const specificTargetPercentage = specificAsset.targetPercentage;
            const specificDifference = specificCurrentPercentage - specificTargetPercentage;
            const specificDifferenceValue = specificCurrentValue - specificTargetValue;

            bySpecificAsset[specificAssetKey] = {
              currentPercentage: specificCurrentPercentage,
              currentValue: specificCurrentValue,
              targetPercentage: specificTargetPercentage,
              targetValue: specificTargetValue,
              difference: specificDifference,
              differenceValue: specificDifferenceValue,
              action: classifyAction(specificDifference),
            };
          });
        }
      });

      // The class's own euros that carry no sleeve. They are already inside `currentValue`, so
      // without this row the sleeves visibly fail to reach 100% and the reader has no way to see
      // why. It is a STATEMENT, not a verdict: no target, no gap, no action — the answer to
      // «troppo o troppo poco?» would be «classificalo», which no COMPRA/VENDI chip can say.
      const unclassified = subCurrentValues[NO_SUBCATEGORY_LABEL] ?? 0;
      if (unclassified > 0) {
        bySubCategory[`${assetClass}:${NO_SUBCATEGORY_LABEL}`] = {
          currentPercentage: assetClassCurrentTotal > 0 ? (unclassified / assetClassCurrentTotal) * 100 : 0,
          currentValue: unclassified,
          targetPercentage: 0,
          targetValue: 0,
          difference: 0,
          differenceValue: 0,
          action: 'OK',
        };
      }
    }
  });

  return { byAssetClass, bySubCategory, bySpecificAsset, ...baseMetadata };
}

/**
 * Compare current allocation against targets and generate rebalancing actions.
 *
 * LEVERAGE-AWARE invariant: current/target percentages
 * are notional exposure over investable MARKET capital, so they sum to `leverageRatio × 100`.
 *
 * The investable base is `tradable + frozen` (invariant #5): `excluded`-role assets (the home
 * you live in) leave num+denom entirely; `frozen` assets (a locked pension fund) stay in the
 * denominator and the percentages but are never traded — the page's planners move the others
 * around them. Partitioning happens HERE (via `partitionByAllocationRole`) so the function is
 * correct whether it is handed the full asset list (e.g. the PDF export) or a pre-filtered one
 * (the Allocazione page already passes tradable + frozen — idempotent).
 */
export function compareAllocations(
  assets: Asset[],
  targets: AssetAllocationTarget | null
): AllocationResult {
  const { tradable, frozen } = partitionByAllocationRole(assets);
  const investable = [...tradable, ...frozen];
  const snapshot = calculateCurrentAllocationSnapshot(investable, ALL_ASSET_CLASSES);
  return toLegacyAllocationResult(snapshot, targets, investable);
}

/**
 * Build an AssetAllocationTarget from goal-derived allocation percentages.
 *
 * Overrides targetPercentage at the asset class level with goal-derived values
 * while preserving sub-category structure (subCategoryConfig, subTargets) from
 * existing user targets. This keeps the drill-down experience intact.
 *
 * Asset classes not present in the derived allocation get 0% target.
 */
export function buildTargetsFromGoalAllocation(
  derived: Partial<Record<AssetClass, number>>,
  existingTargets?: AssetAllocationTarget | null
): AssetAllocationTarget {
  // The app-wide enumeration, never a literal: a class missing here keeps whatever target it had
  // while every other class is overwritten, so a goal-derived plan would silently leave a stale
  // trendFollowing/carry weight in a document that claims to describe the goal.
  const allClasses: AssetClass[] = ASSET_CLASS_SEQUENCE;

  const targets: AssetAllocationTarget = {};

  for (const cls of allClasses) {
    const existing = existingTargets?.[cls];
    targets[cls] = {
      // Override asset class percentage with goal-derived value
      targetPercentage: derived[cls] ?? 0,
      // Preserve sub-category structure from user Settings
      ...(existing?.useFixedAmount != null && { useFixedAmount: existing.useFixedAmount }),
      ...(existing?.fixedAmount != null && { fixedAmount: existing.fixedAmount }),
      ...(existing?.subCategoryConfig && { subCategoryConfig: existing.subCategoryConfig }),
      ...(existing?.subTargets && { subTargets: existing.subTargets }),
    };
  }

  return targets;
}

/**
 * Get default allocation targets for a new user
 * Default: 60% equity, 40% bonds
 */
export function getDefaultTargets(): AssetAllocationTarget {
  return {
    equity: {
      targetPercentage: 60,
      subCategoryConfig: {
        enabled: false,
        categories: [],
      },
    },
    bonds: {
      targetPercentage: 40,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.bonds,
      },
    },
    crypto: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.crypto,
      },
    },
    realestate: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.realestate,
      },
    },
    cash: {
      targetPercentage: 0,
      useFixedAmount: false,
      fixedAmount: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.cash,
      },
    },
    commodity: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.commodity,
      },
    },
    trendFollowing: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.trendFollowing,
      },
    },
    carry: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.carry,
      },
    },
  };
}

/**
 * The targets the Allocazione page measures against: the goal-derived class percentages when
 * goal-driven allocation is on AND the derivation yields something (sub-targets kept from
 * Settings), else the manual targets, else the defaults. `fromGoals` says which. Goal-derived
 * targets read the FULL asset list — a goal is funded by total wealth.
 */
export function resolveEffectiveTargets(input: {
  settings: Pick<AssetAllocationSettings, 'targets' | 'goalBasedInvestingEnabled' | 'goalDrivenAllocationEnabled'> | null | undefined;
  goalData: GoalBasedInvestingData | null | undefined;
  assets: Asset[];
}): { targets: AssetAllocationTarget; fromGoals: boolean } {
  const { settings, goalData, assets } = input;
  if (settings?.goalBasedInvestingEnabled && settings?.goalDrivenAllocationEnabled && goalData && goalData.goals.length > 0) {
    const derived = deriveTargetAllocationFromGoals(goalData.goals, goalData.assignments, assets);
    if (derived) return { targets: buildTargetsFromGoalAllocation(derived, settings?.targets), fromGoals: true };
  }
  return { targets: settings?.targets || getDefaultTargets(), fromGoals: false };
}

/**
 * Today's assets as they stood in a snapshot: the quantity and EUR value of `byAsset`, with the
 * role, class, composition, leverage and sub-category of TODAY — the snapshot freezes values, not
 * metadata (roles are not historicised). What `compareAllocations` then measures is the end of a
 * past period on today's classification (owner's call, 2026-09-28, F1b).
 *
 * The value is carried as an EUR unit price (`currency: 'EUR'`, `currentPrice = totalValue /
 * quantity`), so `calculateAssetValue` returns the snapshot's `totalValue` to the cent; real estate
 * keeps the snapshot's gross price and its debt at that date (gross − net), like the Driver reads
 * it. A row at quantity 0 is a closed position and is dropped. A row whose asset no longer exists
 * has no class to put it in: it is returned in `unmatched`, for the caller to declare.
 */
export function assetsAtSnapshot(
  assets: Asset[],
  rows: MonthlySnapshot['byAsset']
): { assets: Asset[]; unmatched: Array<{ name: string; totalValue: number }> } {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const valued: Asset[] = [];
  const unmatched: Array<{ name: string; totalValue: number }> = [];
  for (const row of rows ?? []) {
    if (!(row.quantity > 0)) continue;
    const asset = byId.get(row.assetId);
    if (!asset) {
      unmatched.push({ name: row.name, totalValue: row.totalValue });
      continue;
    }
    if (asset.assetClass === 'realestate') {
      const gross = row.quantity * row.price;
      valued.push({ ...asset, quantity: row.quantity, currency: 'EUR', currentPrice: row.price, currentPriceEur: undefined, outstandingDebt: Math.max(0, gross - row.totalValue) });
    } else {
      valued.push({ ...asset, quantity: row.quantity, currency: 'EUR', currentPrice: row.totalValue / row.quantity, currentPriceEur: undefined });
    }
  }
  return { assets: valued, unmatched };
}
