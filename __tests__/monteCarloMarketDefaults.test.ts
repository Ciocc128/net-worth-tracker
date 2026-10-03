import { describe, expect, it } from 'vitest';

import {
  getDefaultMonteCarloMarket,
  MONTE_CARLO_CLASS_SOURCES,
  MONTE_CARLO_DEFAULT_INFLATION,
} from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASSES, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { toLogNormal } from '@/lib/utils/monteCarloDraw';

const Z90 = 1.2816;

describe('Monte Carlo market defaults (research R0, dossier § 2.3)', () => {
  const { scenarios } = getDefaultMonteCarloMarket();

  it('A14: Azioni, Base — 10,02% / 19,40%, the Damodaran geometric average 1928–2025 (10,0177%)', () => {
    expect(scenarios.base.classes.equity).toEqual({ cagr: 10.02, volatility: 19.4 });
    expect(Math.abs(scenarios.base.classes.equity.cagr - 10.0177)).toBeLessThan(0.005);
  });

  it('A16: Trend (branch 2) — Orso 4,64% and Toro 8,32% from the Base lognormal over 30 years', () => {
    const { m, s } = toLogNormal(scenarios.base.classes.trendFollowing);
    expect((Math.exp(m - (Z90 * s) / Math.sqrt(30)) - 1) * 100).toBeCloseTo(4.64, 1);
    expect((Math.exp(m + (Z90 * s) / Math.sqrt(30)) - 1) * 100).toBeCloseTo(8.32, 1);
    expect(Math.abs((Math.exp(m - (Z90 * s) / Math.sqrt(30)) - 1) * 100 - scenarios.bear.classes.trendFollowing.cagr)).toBeLessThan(0.02);
    expect(Math.abs((Math.exp(m + (Z90 * s) / Math.sqrt(30)) - 1) * 100 - scenarios.bull.classes.trendFollowing.cagr)).toBeLessThan(0.02);
  });

  it.each((['gold', 'commodity', 'carry'] as MonteCarloClass[]))('branch 2 recomputes Orso and Toro of %s from the Base within 0,02 pp', (cls) => {
    const { m, s } = toLogNormal(scenarios.base.classes[cls]);
    expect(Math.abs((Math.exp(m - (Z90 * s) / Math.sqrt(30)) - 1) * 100 - scenarios.bear.classes[cls].cagr)).toBeLessThan(0.02);
    expect(Math.abs((Math.exp(m + (Z90 * s) / Math.sqrt(30)) - 1) * 100 - scenarios.bull.classes[cls].cagr)).toBeLessThan(0.02);
    // Branch 2 keeps the Base volatility.
    expect(scenarios.bear.classes[cls].volatility).toBe(scenarios.base.classes[cls].volatility);
    expect(scenarios.bull.classes[cls].volatility).toBe(scenarios.base.classes[cls].volatility);
  });

  it('keeps Orso < Base < Toro for the CAGR of every class', () => {
    for (const cls of MONTE_CARLO_CLASSES) {
      expect(scenarios.bear.classes[cls].cagr).toBeLessThan(scenarios.base.classes[cls].cagr);
      expect(scenarios.base.classes[cls].cagr).toBeLessThan(scenarios.bull.classes[cls].cagr);
    }
  });

  it('uses one inflation, 3,04%, in the three scenarios', () => {
    expect(MONTE_CARLO_DEFAULT_INFLATION).toBe(3.04);
    for (const key of ['bear', 'base', 'bull'] as const) expect(scenarios[key].inflationRate).toBe(3.04);
  });

  it('names a source, period and date for every class, and is a fresh copy on every call', () => {
    for (const cls of MONTE_CARLO_CLASSES) {
      const source = MONTE_CARLO_CLASS_SOURCES[cls];
      expect(source.series.length).toBeGreaterThan(0);
      expect(source.period).toMatch(/\d{4}/);
      expect(source.asOf).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
    const copy = getDefaultMonteCarloMarket();
    copy.scenarios.base.classes.equity.cagr = 0;
    expect(getDefaultMonteCarloMarket().scenarios.base.classes.equity.cagr).toBe(10.02);
  });
});
