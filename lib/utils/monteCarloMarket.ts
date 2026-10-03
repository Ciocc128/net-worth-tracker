/**
 * Resolution of the Monte Carlo market assumptions (doc/montecarlo/README.md § 4.2).
 *
 * ONE function reads the two settings fields — `monteCarloMarket` (CAGR, the new shape) and the
 * legacy `monteCarloScenarios` (arithmetic means, four classes) — and EVERY consumer goes through
 * it: the Monte Carlo tab, the Ventaglio, Impostazioni › Simulazioni. Nobody reads the fields
 * directly, so the two engines cannot see different numbers.
 */
import type {
  Asset,
  AssetAllocationSettings,
  MonteCarloClassParams,
  MonteCarloMarketScenario,
  MonteCarloMarketSettings,
  MonteCarloScenarioParams,
} from '@/types/assets';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';
import { DEFAULT_SUB_CATEGORIES } from '@/lib/constants/defaultSubCategories';
import { cagrFromArithmeticMean } from './monteCarloDraw';

export type MonteCarloScenarioKey = 'bear' | 'base' | 'bull';
export const MONTE_CARLO_SCENARIO_KEYS: MonteCarloScenarioKey[] = ['bear', 'base', 'bull'];

export type MonteCarloMarketOrigin = 'saved' | 'migrated' | 'default';

export interface ResolvedMonteCarloMarket {
  scenarios: MonteCarloMarketSettings['scenarios'];
  /** The commodity sub-category simulated as Oro (RG); null = none. Resolved against `availableSubCategories` when given. */
  goldSubCategory: string | null;
  /** Where the numbers come from, for the tile's reading. */
  origin: MonteCarloMarketOrigin;
  /** Classes whose numbers differ from the defaults, per scenario-agnostic count (for «modificate in N classi»). */
  editedClasses: MonteCarloClass[];
}

/** The default sub-category of gold: the first commodity sub-category named `gold` or `oro` (RG). */
export function findDefaultGoldSubCategory(commoditySubCategories: readonly string[]): string | null {
  return commoditySubCategories.find((name) => /^(gold|oro)$/i.test(name.trim())) ?? null;
}

/** R2 on the four classes the legacy field knew; the others take the defaults. */
export function migrateLegacyScenarios(legacy: NonNullable<AssetAllocationSettings['monteCarloScenarios']>): MonteCarloMarketSettings {
  const defaults = getDefaultMonteCarloMarket();
  const migrateClass = (mean: number, volatility: number): MonteCarloClassParams => ({
    cagr: cagrFromArithmeticMean(mean, volatility),
    volatility,
  });
  const migrateScenario = (scenario: MonteCarloScenarioParams, fallback: MonteCarloMarketScenario): MonteCarloMarketScenario => ({
    classes: {
      ...fallback.classes,
      equity: migrateClass(scenario.equityReturn, scenario.equityVolatility),
      bonds: migrateClass(scenario.bondsReturn, scenario.bondsVolatility),
      commodity: migrateClass(scenario.commoditiesReturn, scenario.commoditiesVolatility),
      // realEstateReturn / realEstateVolatility are dropped: the class is no longer simulated.
    },
    inflationRate: scenario.inflationRate,
  });
  return {
    version: 1,
    scenarios: {
      bear: migrateScenario(legacy.bear, defaults.scenarios.bear),
      base: migrateScenario(legacy.base, defaults.scenarios.base),
      bull: migrateScenario(legacy.bull, defaults.scenarios.bull),
    },
  };
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A saved scenario with a missing class or field is completed with the default of that class. */
function completeScenario(saved: Partial<MonteCarloMarketScenario> | undefined, fallback: MonteCarloMarketScenario): MonteCarloMarketScenario {
  const classes = monteCarloClassRecord((cls) => {
    const entry = saved?.classes?.[cls];
    return {
      cagr: isFiniteNumber(entry?.cagr) ? entry.cagr : fallback.classes[cls].cagr,
      volatility: isFiniteNumber(entry?.volatility) ? entry.volatility : fallback.classes[cls].volatility,
    };
  });
  return { classes, inflationRate: isFiniteNumber(saved?.inflationRate) ? saved.inflationRate : fallback.inflationRate };
}

/** The classes whose numbers differ from the defaults in any scenario. */
export function countEditedClasses(scenarios: MonteCarloMarketSettings['scenarios']): MonteCarloClass[] {
  const defaults = getDefaultMonteCarloMarket().scenarios;
  return MONTE_CARLO_CLASSES.filter((cls) =>
    MONTE_CARLO_SCENARIO_KEYS.some(
      (key) => scenarios[key].classes[cls].cagr !== defaults[key].classes[cls].cagr || scenarios[key].classes[cls].volatility !== defaults[key].classes[cls].volatility,
    ),
  );
}

/**
 * `monteCarloMarket` when present; otherwise the legacy `monteCarloScenarios` migrated with R2;
 * otherwise the defaults. `commoditySubCategories` (the names the user has configured under
 * Materie prime) resolves the Oro sub-category when nothing is saved.
 */
export function resolveMonteCarloMarket(
  settings: Pick<AssetAllocationSettings, 'monteCarloMarket' | 'monteCarloScenarios'> | null | undefined,
  commoditySubCategories: readonly string[] = [],
): ResolvedMonteCarloMarket {
  const defaults = getDefaultMonteCarloMarket();
  const saved = settings?.monteCarloMarket;
  const legacy = settings?.monteCarloScenarios;

  let source: MonteCarloMarketSettings;
  let origin: MonteCarloMarketOrigin;
  if (saved) {
    source = saved;
    origin = 'saved';
  } else if (legacy?.base && legacy.bear && legacy.bull) {
    source = migrateLegacyScenarios(legacy);
    origin = 'migrated';
  } else {
    source = defaults;
    origin = 'default';
  }

  const scenarios = {
    bear: completeScenario(source.scenarios?.bear, defaults.scenarios.bear),
    base: completeScenario(source.scenarios?.base, defaults.scenarios.base),
    bull: completeScenario(source.scenarios?.bull, defaults.scenarios.bull),
  };
  // `undefined` = never chosen → the default rule; `null` = chosen «Nessuna».
  const goldSubCategory = saved?.goldSubCategory === undefined ? findDefaultGoldSubCategory(commoditySubCategories) : saved.goldSubCategory;

  return { scenarios, goldSubCategory, origin, editedClasses: origin === 'default' ? [] : countEditedClasses(scenarios) };
}

/** The settings to write from a resolved market (the form's draft). */
export function toMonteCarloMarketSettings(
  scenarios: MonteCarloMarketSettings['scenarios'],
  goldSubCategory: string | null,
): MonteCarloMarketSettings {
  return { version: 1, scenarios, goldSubCategory };
}

/**
 * The commodity sub-categories the user can name as «Oro»: the ones configured under Materie prime
 * in the allocation targets, the ones the portfolio's commodity assets (and composite legs) carry,
 * and the app's defaults — deduplicated, in that order.
 */
export function collectCommoditySubCategories(
  assets: readonly Pick<Asset, 'assetClass' | 'subCategory' | 'composition'>[] | undefined,
  settings: Pick<AssetAllocationSettings, 'targets'> | null | undefined,
): string[] {
  const names: string[] = [];
  const add = (name: string | undefined) => {
    const trimmed = name?.trim();
    if (trimmed && !names.includes(trimmed)) names.push(trimmed);
  };
  const commodityTarget = settings?.targets?.commodity;
  commodityTarget?.subCategoryConfig?.categories?.forEach(add);
  Object.keys(commodityTarget?.subTargets ?? {}).forEach(add);
  for (const asset of assets ?? []) {
    if (asset.composition && asset.composition.length > 0) {
      for (const leg of asset.composition) if (leg.assetClass === 'commodity') add(leg.subCategory);
    } else if (asset.assetClass === 'commodity') {
      add(asset.subCategory);
    }
  }
  DEFAULT_SUB_CATEGORIES.commodity.forEach(add);
  return names;
}

/** The ONE call every consumer makes: the saved settings resolved against this portfolio's commodity sub-categories. */
export function resolveMonteCarloMarketForPortfolio(
  settings: Pick<AssetAllocationSettings, 'monteCarloMarket' | 'monteCarloScenarios' | 'targets'> | null | undefined,
  assets: readonly Asset[] | undefined,
): ResolvedMonteCarloMarket {
  return resolveMonteCarloMarket(settings, collectCommoditySubCategories(assets, settings));
}
