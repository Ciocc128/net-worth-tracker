import { describe, expect, it } from 'vitest';

import { buildDrawPlan, cagrFromArithmeticMean, drawPathMeans, drawYear, portfolioReturn, toLogNormal, weightsLeverage } from '@/lib/utils/monteCarloDraw';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { monteCarloClassRecord, MONTE_CARLO_CLASSES, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { MONTE_CARLO_DEFAULT_CORRELATIONS } from '@/lib/constants/monteCarloMarketDefaults';
import { pairIndices } from '@/lib/utils/correlationMatrix';
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

describe('correlated draws (T2)', () => {
  const sampleCorrelation = (a: number[], b: number[]) => {
    const n = a.length;
    const ma = a.reduce((x, y) => x + y, 0) / n;
    const mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < n; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return sab / Math.sqrt(saa * sbb);
  };

  it('A8: ρ = 0,5 between two classes → sample correlation of the log-returns 0,50 ± 0,01 on 200.000 draws', () => {
    const correlations = new Array(21).fill(0);
    correlations[0] = 0.5; // Azioni–Obbligazioni
    const plan = buildDrawPlan(marketOf(7, 18), correlations);
    const random = createSeededRandom(2026);
    const first: number[] = [];
    const second: number[] = [];
    for (let i = 0; i < 200_000; i++) {
      const year = drawYear(plan, random);
      first.push(Math.log(1 + year[0]));
      second.push(Math.log(1 + year[1]));
    }
    expect(Math.abs(sampleCorrelation(first, second) - 0.5)).toBeLessThan(0.01);
  });

  it('draws the default matrix: every sampled pair is within 0,02 of the typed one', () => {
    const plan = buildDrawPlan(marketOf(5, 15), MONTE_CARLO_DEFAULT_CORRELATIONS);
    const random = createSeededRandom(7);
    const logs = MONTE_CARLO_CLASSES.map(() => [] as number[]);
    for (let i = 0; i < 100_000; i++) drawYear(plan, random).forEach((value, k) => logs[k].push(Math.log(1 + value)));
    pairIndices(MONTE_CARLO_CLASSES.length).forEach(([i, j], index) => {
      expect(Math.abs(sampleCorrelation(logs[i], logs[j]) - MONTE_CARLO_DEFAULT_CORRELATIONS[index])).toBeLessThan(0.02);
    });
  });

  it('with the identity (no matrix, or all zeros) the draws are identical to the independent ones with the same seed', () => {
    const market = marketOf(6, 20);
    const independent = buildDrawPlan(market);
    const zeros = buildDrawPlan(market, new Array(21).fill(0));
    expect(independent.cholesky).toBeNull();
    expect(zeros.cholesky).toBeNull();
    const a = createSeededRandom(11);
    const b = createSeededRandom(11);
    for (let year = 0; year < 50; year++) expect(drawYear(zeros, b)).toEqual(drawYear(independent, a));
  });

  it('consumes the same uniforms with and without correlations', () => {
    const market = marketOf(6, 20);
    let withCount = 0;
    let withoutCount = 0;
    drawYear(buildDrawPlan(market, MONTE_CARLO_DEFAULT_CORRELATIONS), () => (withCount++, 0.5));
    drawYear(buildDrawPlan(market), () => (withoutCount++, 0.5));
    expect(withCount).toBe(withoutCount);
  });

  it('a matrix that is not valid never fails a run: it is corrected silently', () => {
    const plan = buildDrawPlan(marketOf(5, 15), new Array(21).fill(-0.9));
    expect(plan.cholesky).not.toBeNull();
    for (const value of drawYear(plan, createSeededRandom(3))) expect(Number.isFinite(value)).toBe(true);
  });

  it('a matrix of the wrong length is ignored (independent classes)', () => {
    expect(buildDrawPlan(marketOf(5, 15), [0.3, 0.2]).cholesky).toBeNull();
  });

  it('zero volatility still returns exactly the CAGR with correlations on', () => {
    const returns = drawYear(buildDrawPlan(marketOf(4, 0), MONTE_CARLO_DEFAULT_CORRELATIONS), createSeededRandom(5));
    for (const value of returns) expect(value).toBeCloseTo(0.04, 12);
  });
});

describe('portfolioReturn — rule R4 (dossier A10, A11)', () => {
  const weights = (named: Record<string, number>) => MONTE_CARLO_CLASSES.map((cls) => named[cls] ?? 0);
  const returns = (named: Record<string, number>) => MONTE_CARLO_CLASSES.map((cls) => named[cls] ?? 0);

  it('A10: equity 150%, cash 2% + 1% spread, equity 7% → 9,0%', () => {
    expect(portfolioReturn(weights({ equity: 150 }), returns({ equity: 0.07, cash: 0.02 }), 1)).toBeCloseTo(0.09, 12);
  });

  it('A11: equity −60% at leverage 2,5 and a 4% debt → 1 + r_p = −0,56', () => {
    expect(1 + portfolioReturn(weights({ equity: 250 }), returns({ equity: -0.6, cash: 0.04 }), 0)).toBeCloseTo(-0.56, 12);
  });

  it('A12: the debt term does not exist at leverage 1 or below — the spread changes nothing, float for float', () => {
    const w = weights({ equity: 60, bonds: 40 });
    const r = returns({ equity: 0.1, bonds: 0.02, cash: 0.03 });
    expect(portfolioReturn(w, r, 9)).toBe(portfolioReturn(w, r));
    expect(weightsLeverage(w)).toBe(1);
    expect(weightsLeverage(weights({ equity: 90, bonds: 60 }))).toBeCloseTo(1.5, 12);
  });
});

// ─── Q2 · RQ6: the uncertainty on the parameter (doc/montecarlo/README.md § 14.10) ──────────────

describe('drawPathMeans — rule RQ6 (AQ23–AQ26)', () => {
  /** The real Base of § 14.6, rounded as in the spec's control script (s1_controllo.py): CAGR, volatility, uncertainty. */
  const REAL: Record<MonteCarloClass, [number, number, number]> = {
    equity: [5.74, 19.49, 2.7],
    bonds: [1.45, 8.0, 0.98],
    gold: [1.79, 15.82, 2.3],
    commodity: [0.52, 23.88, 3.5],
    cash: [0.39, 2.82, 2.37],
    trendFollowing: [3.93, 14.76, 2.5],
    carry: [3.69, 12.26, 2.91],
  };
  const realMarket: MonteCarloMarketScenario = {
    classes: monteCarloClassRecord((cls) => ({ cagr: REAL[cls][0], volatility: REAL[cls][1] })),
    inflationRate: 0,
  };
  const realUncertainty = monteCarloClassRecord((cls) => REAL[cls][2]);
  const counting = (seed: number) => {
    let calls = 0;
    const source = createSeededRandom(seed);
    return { random: () => (calls++, source()), calls: () => calls };
  };

  it('AQ23: with no uncertainty (absent, or every class at 0) it returns the plan means and consumes nothing', () => {
    for (const uncertainty of [undefined, monteCarloClassRecord(() => 0)]) {
      const plan = buildDrawPlan(realMarket, MONTE_CARLO_DEFAULT_CORRELATIONS, uncertainty);
      const source = counting(1);
      expect(drawPathMeans(plan, source.random)).toBe(plan.m);
      expect(source.calls()).toBe(0);
    }
  });

  it('AQ23: a year drawn with the plan means is the year of before, float for float', () => {
    const plan = buildDrawPlan(realMarket, MONTE_CARLO_DEFAULT_CORRELATIONS);
    const a = createSeededRandom(4);
    const b = createSeededRandom(4);
    for (let i = 0; i < 100; i++) expect(drawYear(plan, a, drawPathMeans(plan, createSeededRandom(9)))).toEqual(drawYear(plan, b));
  });

  it('consumes two uniforms per class whenever one class has an uncertainty, whatever the others', () => {
    const one = counting(2);
    drawPathMeans(buildDrawPlan(realMarket, undefined, monteCarloClassRecord((cls) => (cls === 'carry' ? 1 : 0))), one.random);
    const all = counting(2);
    drawPathMeans(buildDrawPlan(realMarket, undefined, realUncertainty), all.random);
    expect(one.calls()).toBe(7 * 2);
    expect(all.calls()).toBe(7 * 2);
  });

  it('a class without uncertainty keeps its mean exactly', () => {
    const plan = buildDrawPlan(realMarket, undefined, monteCarloClassRecord((cls) => (cls === 'carry' ? 1 : 0)));
    const means = drawPathMeans(plan, createSeededRandom(3));
    MONTE_CARLO_CLASSES.forEach((cls, index) => {
      if (cls === 'carry') expect(means[index]).not.toBe(plan.m[index]);
      else expect(means[index]).toBe(plan.m[index]);
    });
  });

  it('at zero volatility a class returns the median of its own path mean', () => {
    const flat: MonteCarloMarketScenario = { classes: monteCarloClassRecord(() => ({ cagr: 4, volatility: 0 })), inflationRate: 0 };
    const plan = buildDrawPlan(flat, undefined, monteCarloClassRecord(() => 2));
    const means = drawPathMeans(plan, createSeededRandom(8));
    const year = drawYear(plan, createSeededRandom(1), means);
    means.forEach((mean, index) => expect(year[index]).toBeCloseTo(Math.exp(mean) - 1, 14));
  });

  it('AQ26: on 100.000 paths the means are N(m, u²): sample mean m ± 3·u/√n, sample deviation u ± 1%', () => {
    const plan = buildDrawPlan(realMarket, MONTE_CARLO_DEFAULT_CORRELATIONS, realUncertainty);
    const random = createSeededRandom(2610);
    const n = 100_000;
    const sum = new Array<number>(7).fill(0);
    const sumSq = new Array<number>(7).fill(0);
    for (let path = 0; path < n; path++) {
      const means = drawPathMeans(plan, random);
      for (let i = 0; i < 7; i++) {
        sum[i] += means[i];
        sumSq[i] += means[i] * means[i];
      }
    }
    MONTE_CARLO_CLASSES.forEach((cls, i) => {
      const u = realUncertainty[cls] / 100;
      const mean = sum[i] / n;
      const sd = Math.sqrt(sumSq[i] / n - mean * mean);
      expect(Math.abs(mean - plan.m[i]), cls).toBeLessThan((3 * u) / Math.sqrt(n));
      expect(Math.abs(sd / u - 1), cls).toBeLessThan(0.01);
    });
  });

  /** The 15th, 50th and 85th percentile of the 30-year real CAGR of a portfolio rebalanced every year (percent). */
  function cagrPercentiles(weights: Record<MonteCarloClass, number>): [number, number, number] {
    const plan = buildDrawPlan(realMarket, MONTE_CARLO_DEFAULT_CORRELATIONS, realUncertainty);
    const vector = MONTE_CARLO_CLASSES.map((cls) => weights[cls]);
    const years = createSeededRandom(1);
    const parameters = createSeededRandom(2);
    const n = 100_000;
    const cagr = new Float64Array(n);
    for (let path = 0; path < n; path++) {
      const means = drawPathMeans(plan, parameters);
      let logSum = 0;
      for (let year = 0; year < 30; year++) logSum += Math.log(1 + portfolioReturn(vector, drawYear(plan, years, means)));
      cagr[path] = Math.exp(logSum / 30) - 1;
    }
    cagr.sort();
    const at = (p: number) => cagr[Math.floor((p / 100) * n)] * 100;
    return [at(15), at(50), at(85)];
  }

  it('AQ24: 100% Azioni over 30 years — 15° · 50° · 85° of the real CAGR = 1,18 · 5,74 · 10,50 ± 0,15 points', () => {
    const [p15, p50, p85] = cagrPercentiles(monteCarloClassRecord((cls) => (cls === 'equity' ? 100 : 0)));
    expect(Math.abs(p15 - 1.18)).toBeLessThan(0.15);
    expect(Math.abs(p50 - 5.74)).toBeLessThan(0.15);
    expect(Math.abs(p85 - 10.5)).toBeLessThan(0.15);
  }, 30_000);

  it('AQ25: 60/40 over 30 years — 1,61 · 4,49 · 7,46 ± 0,15 points', () => {
    const [p15, p50, p85] = cagrPercentiles(monteCarloClassRecord((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0)));
    expect(Math.abs(p15 - 1.61)).toBeLessThan(0.15);
    expect(Math.abs(p50 - 4.49)).toBeLessThan(0.15);
    expect(Math.abs(p85 - 7.46)).toBeLessThan(0.15);
  }, 30_000);
});
