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
  MonteCarloClassOverride,
  MonteCarloClassParams,
  MonteCarloMarketScenario,
  MonteCarloMarketScenarios,
  MonteCarloMarketSettingsV1,
  MonteCarloMarketSettingsV2,
  MonteCarloScenarioParams,
} from '@/types/assets';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import {
  LEGACY_V1_DEFAULT_CORRELATIONS,
  LEGACY_V1_DEFAULT_INFLATION,
  MONTE_CARLO_CLASS_DEFAULTS,
  MONTE_CARLO_DEFAULT_LEVERAGE_SPREAD,
  MONTE_CARLO_FROZEN_ANCHORS,
  MONTE_CARLO_HEDGEABLE_CLASSES,
  defaultCorrelations,
  getLegacyV1DefaultMarket,
  normalizeHedge,
  type MonteCarloAnchors,
  type MonteCarloHedgeSwitches,
  type MonteCarloHedgeableClass,
} from '@/lib/constants/monteCarloMarketDefaults';
import { DEFAULT_SUB_CATEGORIES } from '@/lib/constants/defaultSubCategories';
import { cagrFromArithmeticMean } from './monteCarloDraw';
import { pairCount } from './correlationMatrix';

export type MonteCarloScenarioKey = 'bear' | 'base' | 'bull';
export const MONTE_CARLO_SCENARIO_KEYS: MonteCarloScenarioKey[] = ['bear', 'base', 'bull'];

/** `migrated` = read from a v1 (or the legacy field) and converted: the document is not rewritten until the next Save. */
export type MonteCarloMarketOrigin = 'saved' | 'migrated' | 'default';

/** Φ⁻¹(0,85): the 15th/85th percentile of a normal (RQ3, RQ5; the PEPP KID rule). */
export const MONTE_CARLO_BAND_Z = 1.0364333894937898;
/** Horizon of the deterministic Bear/Bull, years (§ 14.7, fixed). */
export const MONTE_CARLO_BAND_YEARS = 30;

/** What the user wrote, normalised: the part of a v2 the tile edits. */
export interface MonteCarloMarketOverrides {
  classes: Partial<Record<MonteCarloClass, MonteCarloClassOverride>>;
  /** Percent; absent = the SPF anchor. */
  inflationRate?: number;
  /** Q4: the classes whose currency is hedged (only `true` entries are meaningful); absent = nothing hedged. */
  hedged?: Partial<Record<MonteCarloHedgeableClass, boolean>>;
}

/** A class as the engines and the tile read it, REAL percent (RQ0). */
export interface ResolvedMonteCarloClass {
  /** Real CAGR of the Base. */
  cagr: number;
  /** Real volatility. */
  volatility: number;
  /** Uncertainty on the mean of the log-returns, points. */
  uncertainty: number;
  /** Trend and Carry: the premium over the Liquidità, percent. */
  premium?: number;
  /** `saved` = the Base was typed; `anchor` = follows an ECB rate (Obbligazioni, Liquidità), or the Liquidità (Trend, Carry via the premium); `default` = the research's. */
  origin: 'default' | 'anchor' | 'saved';
}

/** The numbers every consumer needs, computed from the overrides (no settings, no settings origin). */
export interface MarketNumbers {
  classes: Record<MonteCarloClass, ResolvedMonteCarloClass>;
  inflationRate: number;
  inflationOrigin: 'anchor' | 'saved';
  /** Nominal, the form the engines read: `base` = RQ1, `bear`/`bull` = the RQ5 stress. */
  scenarios: MonteCarloMarketScenarios;
}

export interface ResolvedMonteCarloMarket extends MarketNumbers {
  /** What the user wrote (after the migration of an old document). */
  overrides: MonteCarloMarketOverrides;
  /** The ECB anchors used (the daily cron's, else the frozen ones), with their date. */
  anchors: MonteCarloAnchors;
  /** Q4 switches (RQ7): which classes' currency is hedged; the default is none. */
  hedged: MonteCarloHedgeSwitches;
  /** The commodity sub-category simulated as Oro (RG); null = none. Resolved against `availableSubCategories` when given. */
  goldSubCategory: string | null;
  /** The 21 correlations of the log-returns, upper triangle in `MONTE_CARLO_CLASSES` order (saved, else the defaults). */
  correlations: number[];
  /** `saved` = the document carries its own matrix; `default` = the research's. */
  correlationOrigin: 'saved' | 'default';
  /** Percent added to the Liquidità return to price the debt of a leveraged portfolio (R4; saved, else the default). */
  leverageSpread: number;
  /** Where the numbers come from, for the tile's reading. */
  origin: MonteCarloMarketOrigin;
  /** Classes with at least one written field (for «modificate in N classi»). */
  editedClasses: MonteCarloClass[];
  /** Only with `origin: 'migrated'`: what the conversion did (RQ8). */
  migration?: { keptCount: number; bearBullDropped: boolean };
}

/** The default sub-category of gold: the first commodity sub-category named `gold` or `oro` (RG). */
export function findDefaultGoldSubCategory(commoditySubCategories: readonly string[]): string | null {
  return commoditySubCategories.find((name) => /^(gold|oro)$/i.test(name.trim())) ?? null;
}

/** R2 on the four classes the legacy field knew; the others take the v1 defaults. Returns a v1 document (it is migrated like any other). */
export function migrateLegacyScenarios(legacy: NonNullable<AssetAllocationSettings['monteCarloScenarios']>): MonteCarloMarketSettingsV1 {
  const defaults = getLegacyV1DefaultMarket();
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
const sameNumber = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

/** Pairs whose value differs from the defaults (for «modificate 4 coppie su 21»). */
export function countEditedCorrelations(correlations: readonly number[], hedged?: Partial<Record<MonteCarloHedgeableClass, boolean>>): number {
  const defaults = defaultCorrelations(hedged);
  return defaults.filter((value, index) => correlations[index] !== value).length;
}

/** The classes with at least one written field. */
export function countEditedClasses(overrides: Pick<MonteCarloMarketOverrides, 'classes'>): MonteCarloClass[] {
  return MONTE_CARLO_CLASSES.filter((cls) => {
    const entry = overrides.classes[cls];
    return !!entry && Object.values(entry).some(isFiniteNumber);
  });
}

/** The hedged classes written in the overrides, as the four switches. */
const hedgeOf = (overrides: Pick<MonteCarloMarketOverrides, 'hedged'>): MonteCarloHedgeSwitches => normalizeHedge(overrides.hedged);

/** The volatility default of a class under the hedge in force (RQ7): the hedged one where the class has it. */
function defaultVolatility(cls: MonteCarloClass, hedged: MonteCarloHedgeSwitches): number {
  const base = MONTE_CARLO_CLASS_DEFAULTS[cls];
  const isHedged = (MONTE_CARLO_HEDGEABLE_CLASSES as readonly string[]).includes(cls) && hedged[cls as MonteCarloHedgeableClass];
  return isHedged && base.volatilityHedged !== undefined ? base.volatilityHedged : base.volatility;
}

const pct = (decimal: number): number => decimal * 100;

/**
 * RQ0–RQ2, RQ5: the real classes and the nominal scenarios from what the user wrote. Pure; the anchors are
 * a parameter (frozen until Q3).
 */
export function buildMarketNumbers(overrides: MonteCarloMarketOverrides, anchors: MonteCarloAnchors = MONTE_CARLO_FROZEN_ANCHORS): MarketNumbers {
  const inflation = isFiniteNumber(overrides.inflationRate) ? overrides.inflationRate : anchors.inflation;
  const inflationOrigin = isFiniteNumber(overrides.inflationRate) ? 'saved' : 'anchor';
  // RQ2: the real value of an ECB rate, Fisher.
  const realOf = (nominal: number) => pct((1 + nominal / 100) / (1 + inflation / 100) - 1);
  const field = (cls: MonteCarloClass, key: keyof MonteCarloClassOverride): number | undefined => {
    const value = overrides.classes[cls]?.[key];
    return isFiniteNumber(value) ? value : undefined;
  };
  const cashCagr = field('cash', 'cagr') ?? realOf(anchors.estr);
  const hedged = hedgeOf(overrides);

  const classes = monteCarloClassRecord<ResolvedMonteCarloClass>((cls) => {
    const base = MONTE_CARLO_CLASS_DEFAULTS[cls];
    const volatility = field(cls, 'volatility') ?? defaultVolatility(cls, hedged);
    const uncertainty = field(cls, 'uncertainty') ?? base.uncertainty;
    if (base.kind === 'premium') {
      const premium = field(cls, 'premium') ?? base.premium!;
      const cagr = pct((1 + cashCagr / 100) * (1 + premium / 100) - 1);
      return { cagr, volatility, uncertainty, premium, origin: field(cls, 'premium') !== undefined ? 'saved' : 'default' };
    }
    if (base.kind === 'anchor') {
      const typed = field(cls, 'cagr');
      const cagr = typed ?? (cls === 'cash' ? cashCagr : realOf(anchors.aaa10y));
      return { cagr, volatility, uncertainty, origin: typed !== undefined ? 'saved' : 'anchor' };
    }
    const typed = field(cls, 'cagr');
    return { cagr: typed ?? base.cagr!, volatility, uncertainty, origin: typed !== undefined ? 'saved' : 'default' };
  });

  // RQ1: real → nominal with the one inflation; volatility scales with (1 + π).
  const nominal = (cls: MonteCarloClass): MonteCarloClassParams => ({
    cagr: pct((1 + classes[cls].cagr / 100) * (1 + inflation / 100) - 1),
    volatility: classes[cls].volatility * (1 + inflation / 100),
  });
  // RQ5: every class at the 15th/85th percentile of its own uncertainty, same annual dispersion.
  const stress = (sign: -1 | 1) =>
    monteCarloClassRecord<MonteCarloClassParams>((cls) => {
      const base = nominal(cls);
      const shifted = pct(Math.exp(Math.log(1 + base.cagr / 100) + sign * MONTE_CARLO_BAND_Z * (classes[cls].uncertainty / 100)) - 1);
      return { cagr: shifted, volatility: base.volatility * ((1 + shifted / 100) / (1 + base.cagr / 100)) };
    });
  const baseClasses = monteCarloClassRecord<MonteCarloClassParams>(nominal);
  return {
    classes,
    inflationRate: inflation,
    inflationOrigin,
    scenarios: {
      bear: { classes: stress(-1), inflationRate: inflation },
      base: { classes: baseClasses, inflationRate: inflation },
      bull: { classes: stress(1), inflationRate: inflation },
    },
  };
}

export interface MigratedV1 {
  overrides: MonteCarloMarketOverrides;
  /** The full matrix to keep, or undefined when every pair was a default. */
  correlations?: number[];
  keptCount: number;
  bearBullDropped: boolean;
}

/**
 * RQ6 (Q2): the uncertainty on the mean of each class, in points — what the stochastic engines' Base draws each path's
 * means from. Bear and Bull never receive it: they are the RQ5 stress.
 */
export function marketUncertainty(market: Pick<MarketNumbers, 'classes'>): Record<MonteCarloClass, number> {
  return monteCarloClassRecord((cls) => market.classes[cls].uncertainty);
}

/**
 * RQ8: v1 → what the user actually changed. A value equal to the v1 default is dropped (it takes the new
 * default), a different one is kept and converted to real terms with the inflation it was written with.
 */
export function migrateV1(settings: MonteCarloMarketSettingsV1, anchors: MonteCarloAnchors = MONTE_CARLO_FROZEN_ANCHORS): MigratedV1 {
  const legacy = getLegacyV1DefaultMarket();
  const base = settings.scenarios?.base;
  const pi1 = isFiniteNumber(base?.inflationRate) ? base.inflationRate : LEGACY_V1_DEFAULT_INFLATION;
  const classes: MonteCarloMarketOverrides['classes'] = {};
  let keptCount = 0;
  const keep = (cls: MonteCarloClass, key: keyof MonteCarloClassOverride, value: number) => {
    classes[cls] = { ...classes[cls], [key]: value };
    keptCount += 1;
  };
  const inflationWritten = isFiniteNumber(base?.inflationRate) && !sameNumber(base.inflationRate, LEGACY_V1_DEFAULT_INFLATION);
  const overrides: MonteCarloMarketOverrides = { classes, ...(inflationWritten ? { inflationRate: base!.inflationRate } : {}) };
  if (inflationWritten) keptCount += 1;

  const premiumClasses: MonteCarloClass[] = ['trendFollowing', 'carry'];
  const typedReal = {} as Partial<Record<MonteCarloClass, number>>;
  for (const cls of MONTE_CARLO_CLASSES) {
    const entry = base?.classes?.[cls];
    const def = legacy.scenarios.base.classes[cls];
    if (isFiniteNumber(entry?.cagr) && !sameNumber(entry.cagr, def.cagr)) {
      const real = pct((1 + entry.cagr / 100) / (1 + pi1 / 100) - 1);
      if (premiumClasses.includes(cls)) typedReal[cls] = real;
      else keep(cls, 'cagr', real);
    }
    if (isFiniteNumber(entry?.volatility) && !sameNumber(entry.volatility, def.volatility)) keep(cls, 'volatility', entry.volatility / (1 + pi1 / 100));
  }
  // Trend and Carry: the real CAGR becomes a premium over the Liquidità IN FORCE at read time.
  if (Object.keys(typedReal).length > 0) {
    const cash = buildMarketNumbers(overrides, anchors).classes.cash.cagr;
    for (const cls of premiumClasses) {
      const real = typedReal[cls];
      if (real !== undefined) keep(cls, 'premium', pct((1 + real / 100) / (1 + cash / 100) - 1));
    }
  }

  let bearBullDropped = false;
  for (const key of ['bear', 'bull'] as const) {
    const scenario = settings.scenarios?.[key];
    if (!scenario) continue;
    if (isFiniteNumber(scenario.inflationRate) && !sameNumber(scenario.inflationRate, LEGACY_V1_DEFAULT_INFLATION)) bearBullDropped = true;
    for (const cls of MONTE_CARLO_CLASSES) {
      const entry = scenario.classes?.[cls];
      const def = legacy.scenarios[key].classes[cls];
      if ((isFiniteNumber(entry?.cagr) && !sameNumber(entry.cagr, def.cagr)) || (isFiniteNumber(entry?.volatility) && !sameNumber(entry.volatility, def.volatility))) bearBullDropped = true;
    }
  }

  // Correlations: pair by pair; if one is the user's, the whole matrix is kept with the new default under the others.
  let correlations: number[] | undefined;
  const saved = settings.correlations;
  if (Array.isArray(saved) && saved.length === pairCount(MONTE_CARLO_CLASSES.length) && saved.every(isFiniteNumber)) {
    const edited = saved.some((value, index) => !sameNumber(value, LEGACY_V1_DEFAULT_CORRELATIONS[index]));
    if (edited) {
      const fresh = defaultCorrelations();
      correlations = saved.map((value, index) => (sameNumber(value, LEGACY_V1_DEFAULT_CORRELATIONS[index]) ? fresh[index] : value));
    }
  }
  return { overrides, correlations, keptCount, bearBullDropped };
}

/**
 * v2 when present; otherwise a v1 or the legacy `monteCarloScenarios` migrated (RQ8, in reading: the document is
 * not rewritten); otherwise the defaults. `commoditySubCategories` (the names the user has configured under
 * Materie prime) resolves the Oro sub-category when nothing is saved.
 */
export function resolveMonteCarloMarket(
  settings: Pick<AssetAllocationSettings, 'monteCarloMarket' | 'monteCarloScenarios'> | null | undefined,
  commoditySubCategories: readonly string[] = [],
  anchors: MonteCarloAnchors = MONTE_CARLO_FROZEN_ANCHORS,
): ResolvedMonteCarloMarket {
  const saved = settings?.monteCarloMarket;
  const legacy = settings?.monteCarloScenarios;

  let overrides: MonteCarloMarketOverrides = { classes: {} };
  let origin: MonteCarloMarketOrigin = 'default';
  let migration: ResolvedMonteCarloMarket['migration'];
  let savedCorrelations: number[] | undefined;
  let goldSource: { goldSubCategory?: string | null } | undefined;
  let leverageSource: number | undefined;

  if (saved && saved.version === 2) {
    origin = 'saved';
    for (const cls of MONTE_CARLO_CLASSES) {
      const entry = saved.classes?.[cls];
      if (!entry) continue;
      const clean: MonteCarloClassOverride = {};
      for (const key of ['cagr', 'premium', 'volatility', 'uncertainty'] as const) {
        // `cagr` never belongs to Trend and Carry, `premium` only to them (RQ0).
        if (!isFiniteNumber(entry[key])) continue;
        const premiumClass = MONTE_CARLO_CLASS_DEFAULTS[cls].kind === 'premium';
        if (key === 'cagr' && premiumClass) continue;
        if (key === 'premium' && !premiumClass) continue;
        clean[key] = entry[key];
      }
      if (Object.keys(clean).length > 0) overrides.classes[cls] = clean;
    }
    if (isFiniteNumber(saved.inflationRate)) overrides.inflationRate = saved.inflationRate;
    // Q4: only a `true` is a choice; a document with every switch off carries none.
    const savedHedge = normalizeHedge(saved.hedged);
    if (Object.values(savedHedge).some(Boolean)) overrides.hedged = Object.fromEntries(MONTE_CARLO_HEDGEABLE_CLASSES.filter((cls) => savedHedge[cls]).map((cls) => [cls, true]));
    savedCorrelations = saved.correlations;
    goldSource = saved;
    leverageSource = saved.leverageSpread;
  } else {
    const v1 = saved ?? (legacy?.base && legacy.bear && legacy.bull ? migrateLegacyScenarios(legacy) : undefined);
    if (v1) {
      const migrated = migrateV1(v1 as MonteCarloMarketSettingsV1, anchors);
      origin = 'migrated';
      overrides = migrated.overrides;
      migration = { keptCount: migrated.keptCount, bearBullDropped: migrated.bearBullDropped };
      savedCorrelations = migrated.correlations;
      if (saved) {
        goldSource = saved;
        leverageSource = (saved as MonteCarloMarketSettingsV1).leverageSpread;
      }
    }
  }

  const numbers = buildMarketNumbers(overrides, anchors);
  // `undefined` = never chosen → the default rule; `null` = chosen «Nessuna».
  const goldSubCategory = goldSource?.goldSubCategory === undefined ? findDefaultGoldSubCategory(commoditySubCategories) : goldSource.goldSubCategory;

  // A saved matrix of the wrong length or with a non-number is not a matrix: the defaults stand in.
  const hasSavedCorrelations = Array.isArray(savedCorrelations) && savedCorrelations.length === pairCount(MONTE_CARLO_CLASSES.length) && savedCorrelations.every(isFiniteNumber);
  const hedged = hedgeOf(overrides);
  const correlations = hasSavedCorrelations ? [...savedCorrelations!] : defaultCorrelations(hedged);
  const leverageSpread = isFiniteNumber(leverageSource) ? leverageSource : MONTE_CARLO_DEFAULT_LEVERAGE_SPREAD;

  return {
    ...numbers,
    overrides,
    anchors,
    hedged,
    goldSubCategory,
    correlations,
    correlationOrigin: hasSavedCorrelations ? 'saved' : 'default',
    leverageSpread,
    origin,
    editedClasses: countEditedClasses(overrides),
    ...(migration ? { migration } : {}),
  };
}

/**
 * The settings to write from the form's draft (AQ20): ONLY the fields that differ from the default in force, so
 * a later improvement of the defaults reaches whoever never touched the field.
 */
export function toMonteCarloMarketSettings(
  overrides: MonteCarloMarketOverrides,
  goldSubCategory: string | null | undefined,
  correlations?: readonly number[],
  leverageSpread?: number,
  anchors: MonteCarloAnchors = MONTE_CARLO_FROZEN_ANCHORS,
): MonteCarloMarketSettingsV2 {
  // The defaults in force depend on the inflation the draft carries (Obbligazioni and Liquidità follow it).
  const inflationWritten = isFiniteNumber(overrides.inflationRate) && !sameNumber(overrides.inflationRate, anchors.inflation);
  const hedged = hedgeOf(overrides);
  const hedgedWritten = MONTE_CARLO_HEDGEABLE_CLASSES.filter((cls) => hedged[cls]);
  const inForce = buildMarketNumbers({ classes: {}, ...(inflationWritten ? { inflationRate: overrides.inflationRate } : {}), ...(hedgedWritten.length > 0 ? { hedged } : {}) }, anchors).classes;
  const classes: NonNullable<MonteCarloMarketSettingsV2['classes']> = {};
  for (const cls of MONTE_CARLO_CLASSES) {
    const entry = overrides.classes[cls];
    if (!entry) continue;
    const def = MONTE_CARLO_CLASS_DEFAULTS[cls];
    const written: MonteCarloClassOverride = {};
    if (isFiniteNumber(entry.cagr) && def.kind !== 'premium' && !sameNumber(entry.cagr, inForce[cls].cagr)) written.cagr = entry.cagr;
    if (isFiniteNumber(entry.premium) && def.kind === 'premium' && !sameNumber(entry.premium, def.premium!)) written.premium = entry.premium;
    if (isFiniteNumber(entry.volatility) && !sameNumber(entry.volatility, inForce[cls].volatility)) written.volatility = entry.volatility;
    if (isFiniteNumber(entry.uncertainty) && !sameNumber(entry.uncertainty, def.uncertainty)) written.uncertainty = entry.uncertainty;
    if (Object.keys(written).length > 0) classes[cls] = written;
  }
  // The matrix is written only when it differs from the defaults, the spread likewise.
  const custom = correlations && countEditedCorrelations(correlations, hedged) > 0;
  const customSpread = leverageSpread !== undefined && leverageSpread !== MONTE_CARLO_DEFAULT_LEVERAGE_SPREAD;
  return {
    version: 2,
    ...(Object.keys(classes).length > 0 ? { classes } : {}),
    ...(inflationWritten ? { inflationRate: overrides.inflationRate } : {}),
    ...(hedgedWritten.length > 0 ? { hedged: Object.fromEntries(hedgedWritten.map((cls) => [cls, true])) } : {}),
    ...(goldSubCategory !== undefined ? { goldSubCategory } : {}),
    ...(custom ? { correlations: [...correlations] } : {}),
    ...(customSpread ? { leverageSpread } : {}),
  };
}

/**
 * The v2 document completed with explicit deletions, for a MERGE write. `setDoc(…, { merge: true })` merges maps
 * recursively, so writing a v2 over a stored v1 (or over an older v2) would leave behind the 42 numbers of
 * `scenarios` and every class field the user has since restored. Every key the v2 knows and the document does not
 * carry becomes `remove` (Firestore's `deleteField()`), so the stored document ends up EXACTLY as the v2.
 */
export function monteCarloMarketForMergeWrite(market: MonteCarloMarketSettingsV2, remove: unknown): Record<string, unknown> {
  const classes: Record<string, Record<string, unknown>> = {};
  for (const cls of MONTE_CARLO_CLASSES) {
    const entry = market.classes?.[cls];
    classes[cls] = { cagr: entry?.cagr ?? remove, premium: entry?.premium ?? remove, volatility: entry?.volatility ?? remove, uncertainty: entry?.uncertainty ?? remove };
  }
  return {
    version: 2,
    classes,
    inflationRate: market.inflationRate ?? remove,
    // Per key, like the classes: a switch turned off must not survive the merge. No switch on = the whole map goes.
    hedged: MONTE_CARLO_HEDGEABLE_CLASSES.some((cls) => market.hedged?.[cls])
      ? Object.fromEntries(MONTE_CARLO_HEDGEABLE_CLASSES.map((cls) => [cls, market.hedged?.[cls] ? true : remove]))
      : remove,
    correlations: market.correlations ?? remove,
    leverageSpread: market.leverageSpread ?? remove,
    goldSubCategory: market.goldSubCategory === undefined ? remove : market.goldSubCategory,
    // The v1 body, gone for good.
    scenarios: remove,
  };
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
  anchors: MonteCarloAnchors = MONTE_CARLO_FROZEN_ANCHORS,
): ResolvedMonteCarloMarket {
  return resolveMonteCarloMarket(settings, collectCommoditySubCategories(assets, settings), anchors);
}
