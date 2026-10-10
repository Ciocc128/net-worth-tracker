import { describe, expect, it } from 'vitest';

import {
  buildMarketNumbers,
  collectCommoditySubCategories,
  countEditedClasses,
  countEditedCorrelations,
  findDefaultGoldSubCategory,
  migrateLegacyScenarios,
  migrateV1,
  monteCarloMarketForMergeWrite,
  resolveMonteCarloMarket,
  toMonteCarloMarketSettings,
} from '@/lib/utils/monteCarloMarket';
import {
  LEGACY_V1_DEFAULT_CORRELATIONS,
  MONTE_CARLO_DEFAULT_CORRELATIONS,
  getLegacyV1DefaultMarket,
} from '@/lib/constants/monteCarloMarketDefaults';
import { toLogNormal } from '@/lib/utils/monteCarloDraw';
import type { MonteCarloMarketSettingsV2, MonteCarloScenarios } from '@/types/assets';

const LEGACY: MonteCarloScenarios = {
  bear: { equityReturn: 4, equityVolatility: 20, bondsReturn: 2, bondsVolatility: 7, realEstateReturn: 2, realEstateVolatility: 14, commoditiesReturn: 1, commoditiesVolatility: 22, inflationRate: 3.5 },
  base: { equityReturn: 7, equityVolatility: 18, bondsReturn: 3, bondsVolatility: 6, realEstateReturn: 5, realEstateVolatility: 12, commoditiesReturn: 3.5, commoditiesVolatility: 20, inflationRate: 2.5 },
  bull: { equityReturn: 10, equityVolatility: 16, bondsReturn: 4, bondsVolatility: 5, realEstateReturn: 8, realEstateVolatility: 10, commoditiesReturn: 6, commoditiesVolatility: 18, inflationRate: 1.5 },
};

const near = (actual: number, expected: number, digits = 6) => expect(actual).toBeCloseTo(expected, digits);

describe('buildMarketNumbers (RQ0–RQ2, RQ5)', () => {
  it('AQ2: the nominal Base the engines read, with the frozen anchors', () => {
    const { scenarios, inflationRate } = buildMarketNumbers({ classes: {} });
    expect(inflationRate).toBe(2.0369);
    const base = scenarios.base.classes;
    near(base.equity.cagr, 7.893818);
    near(base.bonds.cagr, 3.5192, 9);
    near(base.cash.cagr, 2.439, 9);
    near(base.trendFollowing.cagr, 6.044853);
    near(base.carry.cagr, 5.798999);
    near(base.equity.volatility, 19.886992);
    // The same R1 dispersion on the real and the nominal numbers; only m moves, by ln(1 + π).
    const real = toLogNormal({ cagr: 5.74, volatility: 19.49 });
    const nominal = toLogNormal(base.equity);
    expect(Math.abs(real.s - nominal.s)).toBeLessThan(1e-12);
    expect(nominal.m - real.m).toBeCloseTo(Math.log(1.020369), 12);
    for (const key of ['bear', 'base', 'bull'] as const) expect(scenarios[key].inflationRate).toBe(2.0369);
  });

  it('AQ3: a written inflation moves Obbligazioni and Liquidità, never the historical classes', () => {
    const before = buildMarketNumbers({ classes: {} }).classes;
    const after = buildMarketNumbers({ classes: {}, inflationRate: 3 }).classes;
    for (const cls of ['equity', 'gold', 'commodity'] as const) expect(Math.abs(after[cls].cagr - before[cls].cagr)).toBeLessThan(1e-12);
    near(after.bonds.cagr, 0.504078);
    expect(after.cash.cagr).toBeLessThan(before.cash.cagr);
    expect(after.trendFollowing.cagr).toBeLessThan(before.trendFollowing.cagr);
  });

  it('AQ4: €STR 3,00 · AAA 3,00 · π 2,50', () => {
    const { classes } = buildMarketNumbers({ classes: {} }, { estr: 3, aaa10y: 3, inflation: 2.5, asOf: 'test' });
    near(classes.bonds.cagr, 0.487805);
    near(classes.cash.cagr, 0.487805);
    near(classes.trendFollowing.cagr, 4.024976);
    near(classes.carry.cagr, 3.783805);
  });

  it('AQ5: Bear and Bull for the stochastic engines are a stress per class on the nominal figures', () => {
    const { scenarios } = buildMarketNumbers({ classes: {} });
    near(scenarios.bear.classes.equity.cagr, 4.916403);
    near(scenarios.bull.classes.equity.cagr, 10.955728);
    near(scenarios.bear.classes.equity.volatility, 19.338195);
    near(scenarios.bull.classes.equity.volatility, 20.451363);
    near(scenarios.bear.classes.cash.cagr, -0.046605);
    near(scenarios.bull.classes.cash.cagr, 4.986416);
    near(scenarios.bear.classes.carry.cagr, 2.655718);
    near(scenarios.bull.classes.carry.cagr, 9.038526);
  });

  it('a written premium moves Trend with the Liquidità; a written Liquidità moves both premiums', () => {
    const typed = buildMarketNumbers({ classes: { cash: { cagr: 1 }, trendFollowing: { premium: 2 } } }).classes;
    near(typed.cash.cagr, 1);
    near(typed.trendFollowing.cagr, (1.01 * 1.02 - 1) * 100);
    near(typed.trendFollowing.premium!, 2);
    near(typed.carry.cagr, (1.01 * 1.0328 - 1) * 100);
    expect(typed.cash.origin).toBe('saved');
    expect(typed.bonds.origin).toBe('anchor');
  });
});

describe('resolveMonteCarloMarket', () => {
  it('returns the defaults when nothing is saved', () => {
    const resolved = resolveMonteCarloMarket({}, []);
    expect(resolved.origin).toBe('default');
    expect(resolved.scenarios).toEqual(buildMarketNumbers({ classes: {} }).scenarios);
    expect(resolved.editedClasses).toEqual([]);
    expect(resolved.anchors.asOf).toBe('08/10/2026');
  });

  it('a v2 reads what is written and nothing else; an empty v2 resolves to the defaults (AQ20)', () => {
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2 } }).scenarios).toEqual(resolveMonteCarloMarket({}).scenarios);
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: { version: 2, classes: { equity: { cagr: 6 } }, inflationRate: 3 } }, []);
    expect(resolved.origin).toBe('saved');
    expect(resolved.classes.equity.cagr).toBe(6);
    expect(resolved.inflationRate).toBe(3);
    expect(resolved.inflationOrigin).toBe('saved');
    expect(resolved.editedClasses).toEqual(['equity']);
  });

  it('ignores a CAGR written for Trend or a premium written for Azioni (RQ0)', () => {
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: { version: 2, classes: { trendFollowing: { cagr: 9 }, equity: { premium: 4 } } } as MonteCarloMarketSettingsV2 });
    expect(resolved.overrides.classes).toEqual({});
  });

  it('A4: migrates the legacy scenarios with R2, then to real terms — the mean and variance stay what they were', () => {
    const resolved = resolveMonteCarloMarket({ monteCarloScenarios: LEGACY }, []);
    expect(resolved.origin).toBe('migrated');
    // The v0 Base: equity R2 5,5174 nominal with π 2,5 → real 2,9438 and volatility 18 / 1,025.
    expect(resolved.inflationRate).toBe(2.5);
    near(resolved.classes.equity.cagr, (1.055174 / 1.025 - 1) * 100, 3);
    near(resolved.classes.equity.volatility, 18 / 1.025, 9);
    expect(toLogNormal(resolved.scenarios.base.classes.equity).arithmeticMean * 100).toBeCloseTo(7, 4);
    // The classes the legacy field never knew take the new defaults; the real-estate pair is dropped.
    expect(resolved.classes.carry.origin).toBe('default');
    expect(Object.keys(resolved.scenarios.base.classes)).not.toContain('realestate');
    expect(resolved.migration?.bearBullDropped).toBe(true);
  });

  it('prefers the saved market over the legacy field', () => {
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: { version: 2, classes: { equity: { cagr: 6 } } }, monteCarloScenarios: LEGACY }, []);
    expect(resolved.origin).toBe('saved');
    expect(resolved.classes.equity.cagr).toBe(6);
  });

  it('resolves the Oro sub-category: saved choice (also «Nessuna»), else the default rule', () => {
    expect(resolveMonteCarloMarket({}, ['Other Commodities', 'Gold']).goldSubCategory).toBe('Gold');
    expect(resolveMonteCarloMarket({}, ['Other Commodities']).goldSubCategory).toBeNull();
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2, goldSubCategory: null } }, ['Gold']).goldSubCategory).toBeNull();
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2, goldSubCategory: 'Lingotti' } }, ['Gold']).goldSubCategory).toBe('Lingotti');
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2 } }, ['Oro']).goldSubCategory).toBe('Oro');
  });
});

describe('migration v1 → v2 (RQ8, DQ3)', () => {
  it('AQ15: a v1 all at the old defaults writes nothing and still says it was migrated', () => {
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: getLegacyV1DefaultMarket() });
    expect(resolved.origin).toBe('migrated');
    expect(resolved.overrides).toEqual({ classes: {} });
    expect(resolved.migration).toEqual({ keptCount: 0, bearBullDropped: false });
    expect(resolved.scenarios).toEqual(buildMarketNumbers({ classes: {} }).scenarios);
  });

  it('AQ16: Azioni at 9% and 18% with π 3,04 are kept, converted to real', () => {
    const v1 = getLegacyV1DefaultMarket();
    v1.scenarios.base.classes.equity = { cagr: 9, volatility: 18 };
    const migrated = migrateV1(v1);
    near(migrated.overrides.classes.equity!.cagr!, 5.784161);
    near(migrated.overrides.classes.equity!.volatility!, 17.468944);
    expect(migrated.keptCount).toBe(2);
    expect(migrated.overrides.inflationRate).toBeUndefined();
  });

  it('AQ17: Trend at 7% becomes a premium over the Liquidità in force', () => {
    const v1 = getLegacyV1DefaultMarket();
    v1.scenarios.base.classes.trendFollowing.cagr = 7;
    const migrated = migrateV1(v1);
    near(migrated.overrides.classes.trendFollowing!.premium!, 3.435556);
    expect(migrated.overrides.classes.trendFollowing!.cagr).toBeUndefined();
  });

  it('AQ18: a Bear or Bull typed by hand is dropped, and the reading says so', () => {
    const v1 = getLegacyV1DefaultMarket();
    v1.scenarios.bear.classes.gold.cagr = 1;
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: v1 });
    expect(resolved.migration?.bearBullDropped).toBe(true);
    expect(resolved.overrides.classes.gold).toBeUndefined();
  });

  it('AQ19: a correlation changed in the v1 stays, the other 20 take the new matrix', () => {
    const v1 = { ...getLegacyV1DefaultMarket(), correlations: [...LEGACY_V1_DEFAULT_CORRELATIONS] };
    v1.correlations![3] = 0.9;
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: v1 });
    expect(resolved.correlationOrigin).toBe('saved');
    expect(resolved.correlations[3]).toBe(0.9);
    resolved.correlations.forEach((value, index) => {
      if (index !== 3) expect(value).toBe(MONTE_CARLO_DEFAULT_CORRELATIONS[index]);
    });
  });

  it('a v1 whose matrix is all defaults carries no matrix; the inflation typed by hand is kept', () => {
    const v1 = { ...getLegacyV1DefaultMarket(), correlations: [...LEGACY_V1_DEFAULT_CORRELATIONS] };
    for (const key of ['bear', 'base', 'bull'] as const) v1.scenarios[key].inflationRate = 2.5;
    const migrated = migrateV1(v1);
    expect(migrated.correlations).toBeUndefined();
    expect(migrated.overrides.inflationRate).toBe(2.5);
  });

  it('migrates the legacy scenarios document into a v1 first', () => {
    const migrated = migrateLegacyScenarios(LEGACY);
    expect(migrated.version).toBe(1);
    expect(migrated.scenarios.bull.classes.bonds.volatility).toBe(5);
  });
});

describe('what is saved (AQ20)', () => {
  it('writes only the fields that differ from the default in force', () => {
    const saved = toMonteCarloMarketSettings(
      { classes: { equity: { cagr: 5.74, volatility: 20 }, bonds: { cagr: buildMarketNumbers({ classes: {} }).classes.bonds.cagr }, trendFollowing: { premium: 3.52, uncertainty: 4 } } },
      null,
    );
    expect(saved).toEqual({ version: 2, classes: { equity: { volatility: 20 }, trendFollowing: { uncertainty: 4 } }, goldSubCategory: null });
  });

  it('a value equal to the default of a written inflation is dropped too (the default moves with π)', () => {
    const saved = toMonteCarloMarketSettings({ classes: { cash: { cagr: ((1.02439 / 1.03) - 1) * 100 } }, inflationRate: 3 }, undefined);
    expect(saved).toEqual({ version: 2, inflationRate: 3 });
  });

  it('writes nothing for an untouched draft, and resolves back to the defaults', () => {
    const saved = toMonteCarloMarketSettings({ classes: {} }, undefined);
    expect(saved).toEqual({ version: 2 });
    expect(resolveMonteCarloMarket({ monteCarloMarket: saved }).scenarios).toEqual(resolveMonteCarloMarket({}).scenarios);
  });

  it('writes the matrix only when it differs from the defaults, the spread likewise', () => {
    expect(toMonteCarloMarketSettings({ classes: {} }, null, [...MONTE_CARLO_DEFAULT_CORRELATIONS])).not.toHaveProperty('correlations');
    const edited = [...MONTE_CARLO_DEFAULT_CORRELATIONS];
    edited[0] = 0.5;
    expect(toMonteCarloMarketSettings({ classes: {} }, null, edited).correlations).toEqual(edited);
    expect(countEditedCorrelations(edited)).toBe(1);
    expect(countEditedCorrelations(MONTE_CARLO_DEFAULT_CORRELATIONS)).toBe(0);
    expect(toMonteCarloMarketSettings({ classes: {} }, null, undefined, 2)).not.toHaveProperty('leverageSpread');
    expect(toMonteCarloMarketSettings({ classes: {} }, null, undefined, 3).leverageSpread).toBe(3);
  });

  it('counts a class once however many fields are written', () => {
    expect(countEditedClasses({ classes: { bonds: { cagr: 1, volatility: 2 }, cash: { uncertainty: 1 }, gold: {} } })).toEqual(['bonds', 'cash']);
  });

  it('the merge-write form deletes every key the v2 does not carry, the v1 body included', () => {
    const REMOVE = Symbol('remove');
    const written = monteCarloMarketForMergeWrite({ version: 2, classes: { equity: { cagr: 6 } }, goldSubCategory: null }, REMOVE) as { scenarios: unknown; classes: Record<string, Record<string, unknown>>; inflationRate: unknown; goldSubCategory: unknown; version: unknown };
    expect(written.scenarios).toBe(REMOVE);
    expect(written.classes.equity).toEqual({ cagr: 6, premium: REMOVE, volatility: REMOVE, uncertainty: REMOVE });
    expect(written.classes.carry.premium).toBe(REMOVE);
    expect(written.inflationRate).toBe(REMOVE);
    expect(written.goldSubCategory).toBeNull();
    expect(written.version).toBe(2);
  });
});

describe('findDefaultGoldSubCategory', () => {
  it('matches gold/oro exactly, any case — not «Gold ETC»', () => {
    expect(findDefaultGoldSubCategory(['Gold ETC', 'ORO'])).toBe('ORO');
    expect(findDefaultGoldSubCategory(['Gold ETC'])).toBeNull();
  });
});

describe('collectCommoditySubCategories', () => {
  it('lists the configured targets, the portfolio (assets and composite legs) and the defaults, once each', () => {
    const names = collectCommoditySubCategories(
      [
        { assetClass: 'commodity', subCategory: 'Lingotti', composition: undefined },
        { assetClass: 'equity', subCategory: 'Ignored', composition: undefined },
        { assetClass: 'equity', subCategory: undefined, composition: [{ assetClass: 'commodity', percentage: 30, subCategory: 'Gold' }, { assetClass: 'equity', percentage: 70, subCategory: 'World' }] },
      ],
      { targets: { commodity: { targetPercentage: 5, subCategoryConfig: { enabled: true, categories: ['Argento'] }, subTargets: { Argento: 50 } } } },
    );
    expect(names).toEqual(['Argento', 'Lingotti', 'Gold', 'Other Commodities']);
  });
});

describe('correlations (T2)', () => {
  it('resolves to the research defaults when nothing is saved, and says so', () => {
    const resolved = resolveMonteCarloMarket({}, []);
    expect(resolved.correlations).toEqual([...MONTE_CARLO_DEFAULT_CORRELATIONS]);
    expect(resolved.correlations).toHaveLength(21);
    expect(resolved.correlationOrigin).toBe('default');
  });

  it('takes the saved matrix, and ignores one of the wrong length or with a non-number', () => {
    const custom = new Array(21).fill(0.2);
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2, correlations: custom } }, [])).toMatchObject({ correlations: custom, correlationOrigin: 'saved' });
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2, correlations: [0.1, 0.2] } }, []).correlationOrigin).toBe('default');
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2, correlations: [...custom.slice(1), Number.NaN] } }, []).correlationOrigin).toBe('default');
  });
});

describe('leverage spread (T3)', () => {
  it('resolves to the 2,0% default when nothing is saved, and to the saved value otherwise', () => {
    expect(resolveMonteCarloMarket({}).leverageSpread).toBe(2);
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2, leverageSpread: 3.5 } }).leverageSpread).toBe(3.5);
    expect(resolveMonteCarloMarket({ monteCarloMarket: { version: 2, leverageSpread: Number.NaN } }).leverageSpread).toBe(2);
  });
});
