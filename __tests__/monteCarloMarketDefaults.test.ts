import { describe, expect, it } from 'vitest';

import {
  LEGACY_V1_DEFAULT_CORRELATIONS,
  MONTE_CARLO_CLASS_DEFAULTS,
  MONTE_CARLO_CLASS_SOURCES,
  MONTE_CARLO_DEFAULT_CORRELATIONS,
  MONTE_CARLO_FROZEN_ANCHORS,
  getDefaultMonteCarloCorrelations,
  getLegacyV1DefaultMarket,
} from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';
import { expandUpperTriangle, symmetricEigen } from '@/lib/utils/correlationMatrix';
import { buildMarketNumbers } from '@/lib/utils/monteCarloMarket';

describe('Monte Carlo market defaults (R0-bis, dossier § 14.6)', () => {
  it('AQ1: the classes resolved with the frozen anchors, real, to 1e-6', () => {
    const { classes } = buildMarketNumbers({ classes: {} });
    expect(classes.equity.cagr).toBeCloseTo(5.74, 6);
    expect(classes.bonds.cagr).toBeCloseTo(1.45271, 5);
    expect(classes.gold.cagr).toBeCloseTo(1.79, 6);
    expect(classes.commodity.cagr).toBeCloseTo(0.52, 6);
    expect(classes.cash.cagr).toBeCloseTo(0.394073, 5);
    expect(classes.trendFollowing.cagr).toBeCloseTo(3.927944, 5);
    expect(classes.carry.cagr).toBeCloseTo(3.686999, 5);
  });

  it('freezes the ECB anchors of 08/10/2026', () => {
    expect(MONTE_CARLO_FROZEN_ANCHORS).toEqual({ estr: 2.439, aaa10y: 3.5192, inflation: 2.0369, asOf: '08/10/2026' });
  });

  it('holds the volatility, hedged volatility and uncertainty of the table', () => {
    expect(MONTE_CARLO_CLASS_DEFAULTS.equity).toMatchObject({ kind: 'historical', cagr: 5.74, volatility: 19.49, volatilityHedged: 17.15, uncertainty: 2.7 });
    expect(MONTE_CARLO_CLASS_DEFAULTS.trendFollowing).toMatchObject({ kind: 'premium', premium: 3.52, volatility: 14.76, volatilityHedged: 11, uncertainty: 2.5 });
    expect(MONTE_CARLO_CLASS_DEFAULTS.carry).toMatchObject({ kind: 'premium', premium: 3.28, volatility: 12.26, volatilityHedged: 10.03, uncertainty: 2.91 });
    expect(MONTE_CARLO_CLASS_DEFAULTS.bonds.kind).toBe('anchor');
    expect(MONTE_CARLO_CLASS_DEFAULTS.cash.kind).toBe('anchor');
  });

  it('AQ21: the default matrix is positive semi-definite as it stands (minimum eigenvalue 0,417)', () => {
    expect(MONTE_CARLO_DEFAULT_CORRELATIONS).toHaveLength(21);
    const { values } = symmetricEigen(expandUpperTriangle(MONTE_CARLO_DEFAULT_CORRELATIONS, MONTE_CARLO_CLASSES.length));
    expect(Math.min(...values)).toBeCloseTo(0.417, 2);
    // Equity–Commodity, Bonds–Cash, Gold–Cash, Trend–Carry are the only non-zero pairs.
    expect(MONTE_CARLO_DEFAULT_CORRELATIONS.filter((value) => value !== 0)).toEqual([0.35, 0.5, -0.3, 0.5]);
  });

  it('names a source, period and date for every class, and returns a fresh matrix on every call', () => {
    for (const cls of MONTE_CARLO_CLASSES) {
      const source = MONTE_CARLO_CLASS_SOURCES[cls];
      expect(source.series.length).toBeGreaterThan(0);
      expect(source.period).toMatch(/\d{4}/);
      expect(source.asOf).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
    const copy = getDefaultMonteCarloCorrelations();
    copy[0] = 0.9;
    expect(getDefaultMonteCarloCorrelations()[0]).toBe(0);
  });

  it('keeps the v1 defaults for the migration only (RQ8)', () => {
    const legacy = getLegacyV1DefaultMarket();
    expect(legacy.version).toBe(1);
    expect(legacy.scenarios.base.classes.equity).toEqual({ cagr: 10.02, volatility: 19.4 });
    expect(legacy.scenarios.base.inflationRate).toBe(3.04);
    expect(LEGACY_V1_DEFAULT_CORRELATIONS).toHaveLength(21);
  });
});
