import { describe, expect, it } from 'vitest';

import { buildDrawPlan, cagrFromArithmeticMean, drawYear, portfolioReturn, toLogNormal } from '@/lib/utils/monteCarloDraw';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { monteCarloClassRecord, MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';
import type { MonteCarloMarketScenario } from '@/types/assets';

const marketOf = (cagr: number, volatility: number): MonteCarloMarketScenario => ({
  classes: monteCarloClassRecord(() => ({ cagr, volatility })),
  inflationRate: 3,
});

describe('toLogNormal — rule R1 (dossier A1–A3)', () => {
  it('A1: g = 7%, σa = 18%', () => {
    const result = toLogNormal({ cagr: 7, volatility: 18 });
    expect(result.m).toBeCloseTo(0.067659, 6);
    expect(result.s).toBeCloseTo(0.164829, 6);
    expect(result.arithmeticMean * 100).toBeCloseTo(8.4634, 3);
  });

  it('A2: g = 3%, σa = 6%', () => {
    const result = toLogNormal({ cagr: 3, volatility: 6 });
    expect(result.m).toBeCloseTo(0.029559, 6);
    expect(result.s).toBeCloseTo(0.058105, 6);
    expect(result.arithmeticMean * 100).toBeCloseTo(3.174, 3);
  });

  it('A3: g = 0%, σa = 60% (high volatility)', () => {
    const result = toLogNormal({ cagr: 0, volatility: 60 });
    expect(result.m).toBe(0);
    expect(result.s).toBeCloseTo(0.497655, 6);
    expect(result.arithmeticMean * 100).toBeCloseTo(13.1824, 3);
  });

  it('zero volatility has no spread and returns exactly the CAGR', () => {
    const result = toLogNormal({ cagr: 7, volatility: 0 });
    expect(result.s).toBe(0);
    expect(result.arithmeticMean).toBeCloseTo(0.07, 12);
  });
});

describe('cagrFromArithmeticMean — rule R2 (dossier A4)', () => {
  it('μ = 7%, σ = 18% gives g = 5,5174%, and R1 gives the mean back', () => {
    const g = cagrFromArithmeticMean(7, 18);
    expect(g).toBeCloseTo(5.5174, 3);
    expect(toLogNormal({ cagr: g, volatility: 18 }).arithmeticMean * 100).toBeCloseTo(7, 6);
  });
});

describe('drawYear', () => {
  it('A5: 200.000 seeded draws, g = 7%, σa = 18% — median 7% ± 0,2 pp, mean 8,46% ± 0,2 pp', () => {
    const plan = buildDrawPlan(marketOf(7, 18));
    const random = createSeededRandom(2026);
    const draws: number[] = [];
    // Each year draws the seven classes; the first one is enough for the statistics.
    for (let i = 0; i < 200_000; i++) draws.push(drawYear(plan, random)[0]);
    const sorted = [...draws].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] * 100;
    const mean = (draws.reduce((sum, value) => sum + value, 0) / draws.length) * 100;
    expect(Math.abs(median - 7)).toBeLessThan(0.2);
    expect(Math.abs(mean - 8.4634)).toBeLessThan(0.2);
  });

  it('A6: volatility 0 on every class — each class returns exactly its CAGR', () => {
    const market: MonteCarloMarketScenario = {
      classes: monteCarloClassRecord((cls) => ({ cagr: MONTE_CARLO_CLASSES.indexOf(cls) + 0.5, volatility: 0 })),
      inflationRate: 0,
    };
    const returns = drawYear(buildDrawPlan(market), createSeededRandom(1));
    MONTE_CARLO_CLASSES.forEach((cls, index) => expect(returns[index]).toBeCloseTo((index + 0.5) / 100, 12));
  });

  it('never returns −100% or worse, even at σa = 200% over a million draws', () => {
    const plan = buildDrawPlan(marketOf(0, 200));
    const random = createSeededRandom(99);
    let worst = Infinity;
    for (let i = 0; i < 1_000_000 / 7; i++) {
      for (const value of drawYear(plan, random)) worst = Math.min(worst, value);
    }
    expect(worst).toBeGreaterThan(-1);
  });

  it('draws the same number of uniforms whatever the volatility (a seeded run stays comparable)', () => {
    const counter = () => {
      let calls = 0;
      const source = createSeededRandom(5);
      return { random: () => (calls++, source()), calls: () => calls };
    };
    const flat = counter();
    drawYear(buildDrawPlan(marketOf(5, 0)), flat.random);
    const wild = counter();
    drawYear(buildDrawPlan(marketOf(5, 30)), wild.random);
    expect(flat.calls()).toBe(wild.calls());
  });
});

describe('portfolioReturn — rule R3', () => {
  it('weights the (1 + r) of the classes', () => {
    expect(portfolioReturn([50, 50, 0], [0.1, -0.2, 0.9])).toBeCloseTo(-0.05, 12);
  });
});
