import { describe, expect, it } from 'vitest';

import {
  collectCommoditySubCategories,
  countEditedClasses,
  findDefaultGoldSubCategory,
  migrateLegacyScenarios,
  resolveMonteCarloMarket,
} from '@/lib/utils/monteCarloMarket';
import { getDefaultMonteCarloMarket, MONTE_CARLO_DEFAULT_CORRELATIONS } from '@/lib/constants/monteCarloMarketDefaults';
import { countEditedCorrelations, toMonteCarloMarketSettings } from '@/lib/utils/monteCarloMarket';
import { toLogNormal } from '@/lib/utils/monteCarloDraw';
import type { MonteCarloScenarios } from '@/types/assets';

const LEGACY: MonteCarloScenarios = {
  bear: { equityReturn: 4, equityVolatility: 20, bondsReturn: 2, bondsVolatility: 7, realEstateReturn: 2, realEstateVolatility: 14, commoditiesReturn: 1, commoditiesVolatility: 22, inflationRate: 3.5 },
  base: { equityReturn: 7, equityVolatility: 18, bondsReturn: 3, bondsVolatility: 6, realEstateReturn: 5, realEstateVolatility: 12, commoditiesReturn: 3.5, commoditiesVolatility: 20, inflationRate: 2.5 },
  bull: { equityReturn: 10, equityVolatility: 16, bondsReturn: 4, bondsVolatility: 5, realEstateReturn: 8, realEstateVolatility: 10, commoditiesReturn: 6, commoditiesVolatility: 18, inflationRate: 1.5 },
};

describe('resolveMonteCarloMarket', () => {
  it('returns the defaults when nothing is saved', () => {
    const resolved = resolveMonteCarloMarket({}, []);
    expect(resolved.origin).toBe('default');
    expect(resolved.scenarios).toEqual(getDefaultMonteCarloMarket().scenarios);
    expect(resolved.editedClasses).toEqual([]);
  });

  it('A4: migrates the legacy scenarios with R2 — the mean and variance of 1+r stay what they were', () => {
    const resolved = resolveMonteCarloMarket({ monteCarloScenarios: LEGACY }, []);
    expect(resolved.origin).toBe('migrated');
    const equity = resolved.scenarios.base.classes.equity;
    expect(equity.cagr).toBeCloseTo(5.5174, 3);
    expect(equity.volatility).toBe(18);
    expect(toLogNormal(equity).arithmeticMean * 100).toBeCloseTo(7, 6);
    // The inflation of the legacy scenario is kept; the classes the legacy field never knew take the defaults.
    expect(resolved.scenarios.bear.inflationRate).toBe(3.5);
    expect(resolved.scenarios.base.classes.trendFollowing).toEqual(getDefaultMonteCarloMarket().scenarios.base.classes.trendFollowing);
    // «Materie prime» migrates from the legacy commodities, and the real-estate pair is dropped.
    expect(resolved.scenarios.base.classes.commodity.volatility).toBe(20);
    expect(Object.keys(resolved.scenarios.base.classes)).not.toContain('realestate');
  });

  it('prefers the saved market over the legacy field', () => {
    const saved = getDefaultMonteCarloMarket();
    saved.scenarios.base.classes.equity.cagr = 6;
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: saved, monteCarloScenarios: LEGACY }, []);
    expect(resolved.origin).toBe('saved');
    expect(resolved.scenarios.base.classes.equity.cagr).toBe(6);
    expect(resolved.editedClasses).toEqual(['equity']);
  });

  it('completes a partial saved market with the default of the missing class', () => {
    const partial = getDefaultMonteCarloMarket();
    delete (partial.scenarios.base.classes as Partial<typeof partial.scenarios.base.classes>).carry;
    partial.scenarios.bull.classes.gold = { cagr: 12 } as never;
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: partial }, []);
    const defaults = getDefaultMonteCarloMarket().scenarios;
    expect(resolved.scenarios.base.classes.carry).toEqual(defaults.base.classes.carry);
    expect(resolved.scenarios.bull.classes.gold).toEqual({ cagr: 12, volatility: defaults.bull.classes.gold.volatility });
  });

  it('resolves the Oro sub-category: saved choice (also «Nessuna»), else the default rule', () => {
    expect(resolveMonteCarloMarket({}, ['Other Commodities', 'Gold']).goldSubCategory).toBe('Gold');
    expect(resolveMonteCarloMarket({}, ['Other Commodities']).goldSubCategory).toBeNull();
    const market = getDefaultMonteCarloMarket();
    expect(resolveMonteCarloMarket({ monteCarloMarket: { ...market, goldSubCategory: null } }, ['Gold']).goldSubCategory).toBeNull();
    expect(resolveMonteCarloMarket({ monteCarloMarket: { ...market, goldSubCategory: 'Lingotti' } }, ['Gold']).goldSubCategory).toBe('Lingotti');
    expect(resolveMonteCarloMarket({ monteCarloMarket: market }, ['Oro']).goldSubCategory).toBe('Oro');
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

describe('countEditedClasses / migrateLegacyScenarios', () => {
  it('counts a class once however many scenarios differ', () => {
    const market = getDefaultMonteCarloMarket();
    market.scenarios.bear.classes.bonds.cagr += 1;
    market.scenarios.bull.classes.bonds.volatility += 1;
    market.scenarios.base.classes.cash.cagr += 0.5;
    expect(countEditedClasses(market.scenarios)).toEqual(['bonds', 'cash']);
  });

  it('migrates all three scenarios', () => {
    const migrated = migrateLegacyScenarios(LEGACY);
    expect(migrated.version).toBe(1);
    expect(migrated.scenarios.bull.classes.bonds.volatility).toBe(5);
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
    const base = getDefaultMonteCarloMarket();
    expect(resolveMonteCarloMarket({ monteCarloMarket: { ...base, correlations: custom } }, [])).toMatchObject({ correlations: custom, correlationOrigin: 'saved' });
    expect(resolveMonteCarloMarket({ monteCarloMarket: { ...base, correlations: [0.1, 0.2] } }, []).correlationOrigin).toBe('default');
    expect(resolveMonteCarloMarket({ monteCarloMarket: { ...base, correlations: [...custom.slice(1), Number.NaN] } }, []).correlationOrigin).toBe('default');
  });

  it('writes the matrix only when it differs from the defaults', () => {
    const scenarios = getDefaultMonteCarloMarket().scenarios;
    expect(toMonteCarloMarketSettings(scenarios, null, [...MONTE_CARLO_DEFAULT_CORRELATIONS])).not.toHaveProperty('correlations');
    const edited = [...MONTE_CARLO_DEFAULT_CORRELATIONS];
    edited[0] = 0.5;
    expect(toMonteCarloMarketSettings(scenarios, null, edited).correlations).toEqual(edited);
    expect(countEditedCorrelations(edited)).toBe(1);
    expect(countEditedCorrelations(MONTE_CARLO_DEFAULT_CORRELATIONS)).toBe(0);
  });
});

describe('leverage spread (T3)', () => {
  const scenarios = getDefaultMonteCarloMarket().scenarios;

  it('resolves to the 2,0% default when nothing is saved, and to the saved value otherwise', () => {
    expect(resolveMonteCarloMarket({}).leverageSpread).toBe(2);
    expect(resolveMonteCarloMarket({ monteCarloMarket: { ...getDefaultMonteCarloMarket(), leverageSpread: 3.5 } }).leverageSpread).toBe(3.5);
    expect(resolveMonteCarloMarket({ monteCarloMarket: { ...getDefaultMonteCarloMarket(), leverageSpread: Number.NaN } }).leverageSpread).toBe(2);
  });

  it('is written only when it differs from the default', () => {
    expect(toMonteCarloMarketSettings(scenarios, null, undefined, 2)).not.toHaveProperty('leverageSpread');
    expect(toMonteCarloMarketSettings(scenarios, null, undefined, 3).leverageSpread).toBe(3);
  });
});
