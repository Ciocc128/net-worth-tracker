import { describe, expect, it } from 'vitest';

import { findMonteCarloMarketProblems } from '@/lib/utils/monteCarloMarketValidation';

describe('findMonteCarloMarketProblems', () => {
  it('finds nothing in an empty v2 (the defaults)', () => {
    expect(findMonteCarloMarketProblems({ version: 2 })).toEqual([]);
  });

  it('names the class and the field of every value out of range', () => {
    const messages = findMonteCarloMarketProblems({
      version: 2,
      classes: { trendFollowing: { volatility: 250, premium: 31 }, carry: { uncertainty: 21 }, equity: { cagr: 101 }, gold: { cagr: -60 } },
      inflationRate: 21,
    }).map((problem) => problem.message);
    expect(messages).toContain('Azioni: CAGR oltre 100%');
    expect(messages).toContain('Oro: CAGR sotto -50%');
    expect(messages).toContain('Trend: premio oltre 30%');
    expect(messages).toContain('Trend: volatilità oltre 200%');
    expect(messages).toContain('Carry: incertezza oltre 20%');
    expect(messages).toContain('Inflazione: inflazione oltre 20%');
  });

  it('accepts the bounds themselves', () => {
    expect(
      findMonteCarloMarketProblems({
        version: 2,
        classes: { equity: { cagr: 100, volatility: 200, uncertainty: 20 }, bonds: { cagr: -50, volatility: 0, uncertainty: 0 }, carry: { premium: -20 } },
        inflationRate: -5,
      }),
    ).toEqual([]);
  });

  it('checks the correlations and the spread when present, and a NaN is a problem', () => {
    const market = { version: 2 as const, correlations: [0.2, 1.2], leverageSpread: 25 };
    const problems = findMonteCarloMarketProblems(market);
    expect(problems.map((problem) => problem.field)).toEqual(['correlation', 'spread']);
    expect(problems[0].message).toBe('Correlazione Azioni–Oro: fuori da −1 e 1');
    expect(findMonteCarloMarketProblems({ version: 2, classes: { gold: { cagr: Number.NaN } } })).toHaveLength(1);
  });
});
