import { describe, expect, it } from 'vitest';

import { findMonteCarloMarketProblems } from '@/lib/utils/monteCarloMarketValidation';
import { getDefaultMonteCarloMarket } from '@/lib/constants/monteCarloMarketDefaults';

describe('findMonteCarloMarketProblems', () => {
  it('finds nothing in the defaults', () => {
    expect(findMonteCarloMarketProblems(getDefaultMonteCarloMarket())).toEqual([]);
  });

  it('names the class and the scenario of every field out of range', () => {
    const market = getDefaultMonteCarloMarket();
    market.scenarios.bull.classes.trendFollowing.volatility = 250;
    market.scenarios.bear.classes.carry.cagr = -60;
    market.scenarios.base.classes.equity.cagr = 101;
    market.scenarios.base.inflationRate = 21;
    const messages = findMonteCarloMarketProblems(market).map((problem) => problem.message);
    expect(messages).toContain('Azioni, Base: CAGR oltre 100%');
    expect(messages).toContain('Carry, Bear: CAGR sotto -50%');
    expect(messages).toContain('Trend, Bull: volatilità oltre 200%');
    expect(messages).toContain('Inflazione, Base: oltre 20%');
  });

  it('accepts the bounds themselves', () => {
    const market = getDefaultMonteCarloMarket();
    market.scenarios.base.classes.equity = { cagr: 100, volatility: 200 };
    market.scenarios.base.classes.bonds = { cagr: -50, volatility: 0 };
    market.scenarios.base.inflationRate = -5;
    expect(findMonteCarloMarketProblems(market)).toEqual([]);
  });

  it('checks the correlations and the spread when present, and a NaN is a problem', () => {
    const market = { ...getDefaultMonteCarloMarket(), correlations: [0.2, 1.2], leverageSpread: 25 };
    const fields = findMonteCarloMarketProblems(market).map((problem) => problem.field);
    expect(fields).toEqual(['correlation', 'spread']);
    expect(findMonteCarloMarketProblems(market)[0].message).toBe('Correlazione Azioni–Oro: fuori da −1 e 1');
    const broken = getDefaultMonteCarloMarket();
    broken.scenarios.base.classes.gold.cagr = Number.NaN;
    expect(findMonteCarloMarketProblems(broken)).toHaveLength(1);
  });
});
