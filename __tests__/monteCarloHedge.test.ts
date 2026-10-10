import { describe, expect, it } from 'vitest';

import {
  MONTE_CARLO_DEFAULT_CORRELATIONS,
  MONTE_CARLO_HEDGEABLE_CLASSES,
  defaultCorrelations,
  type MonteCarloHedgeSwitches,
} from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';
import { expandUpperTriangle, pairIndices, symmetricEigen } from '@/lib/utils/correlationMatrix';
import {
  buildMarketNumbers,
  countEditedCorrelations,
  monteCarloMarketForMergeWrite,
  resolveMonteCarloMarket,
  toMonteCarloMarketSettings,
} from '@/lib/utils/monteCarloMarket';

const ALL = { equity: true, gold: true, trendFollowing: true, carry: true } as const;
const NONE = { equity: false, gold: false, trendFollowing: false, carry: false } as const;

/** The non-zero pairs of a matrix by name, «equity-commodity». */
function nonZero(matrix: readonly number[]): Record<string, number> {
  const pairs = pairIndices(MONTE_CARLO_CLASSES.length);
  const out: Record<string, number> = {};
  matrix.forEach((value, index) => {
    if (value !== 0) out[`${MONTE_CARLO_CLASSES[pairs[index][0]]}-${MONTE_CARLO_CLASSES[pairs[index][1]]}`] = value;
  });
  return out;
}

const combinations: MonteCarloHedgeSwitches[] = Array.from({ length: 16 }, (_, mask) => ({
  equity: !!(mask & 1),
  gold: !!(mask & 2),
  trendFollowing: !!(mask & 4),
  carry: !!(mask & 8),
}));

describe('Q4 — copertura del cambio (dossier § 14.12, RQ7)', () => {
  it('AQ36: everything hedged — real volatilities and the matrix of the dossier', () => {
    const { classes } = buildMarketNumbers({ classes: {}, hedged: ALL });
    expect(classes.equity.volatility).toBe(17.15);
    expect(classes.gold.volatility).toBe(17.98);
    expect(classes.trendFollowing.volatility).toBe(11);
    expect(classes.carry.volatility).toBe(10.03);
    expect(nonZero(defaultCorrelations(ALL))).toEqual({ 'bonds-cash': 0.5, 'commodity-carry': -0.4, 'cash-trendFollowing': 0.1, 'cash-carry': 0.45 });
  });

  it('AQ37: all 16 combinations are positive semi-definite as they stand (minimum eigenvalue ≥ 0,19)', () => {
    for (const combo of combinations) {
      const matrix = defaultCorrelations(combo);
      expect(matrix).toHaveLength(21);
      const { values } = symmetricEigen(expandUpperTriangle(matrix, MONTE_CARLO_CLASSES.length));
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0.19);
    }
    const { values } = symmetricEigen(expandUpperTriangle(defaultCorrelations({ trendFollowing: true, carry: true }), MONTE_CARLO_CLASSES.length));
    expect(Math.min(...values)).toBeCloseTo(0.198, 2);
  });

  it('nothing hedged is the matrix of today, and the unhedged volatilities are unchanged', () => {
    expect(defaultCorrelations(NONE)).toEqual([...MONTE_CARLO_DEFAULT_CORRELATIONS]);
    expect(defaultCorrelations()).toEqual([...MONTE_CARLO_DEFAULT_CORRELATIONS]);
    const { classes } = buildMarketNumbers({ classes: {} });
    expect([classes.equity.volatility, classes.gold.volatility, classes.trendFollowing.volatility, classes.carry.volatility]).toEqual([19.49, 15.82, 14.76, 12.26]);
  });

  it('AQ38: only Azioni hedged — Azioni–Materie prime 0, Azioni–Trend −0,40, Trend–Carry 0,50', () => {
    expect(nonZero(defaultCorrelations({ equity: true }))).toEqual({ 'bonds-cash': 0.5, 'gold-cash': -0.3, 'equity-trendFollowing': -0.4, 'trendFollowing-carry': 0.5 });
  });

  it('AQ39: the hedge never moves the Base (± 1e-12)', () => {
    const plain = buildMarketNumbers({ classes: {} });
    for (const combo of combinations) {
      const hedged = buildMarketNumbers({ classes: {}, hedged: combo });
      for (const cls of MONTE_CARLO_CLASSES) {
        expect(Math.abs(hedged.classes[cls].cagr - plain.classes[cls].cagr)).toBeLessThan(1e-12);
        expect(Math.abs(hedged.scenarios.base.classes[cls].cagr - plain.scenarios.base.classes[cls].cagr)).toBeLessThan(1e-12);
      }
    }
  });

  it('AQ40: a typed volatility stays when the switch changes, and is written only if it differs from the default in force', () => {
    const typed = { classes: { equity: { volatility: 21 } } };
    expect(buildMarketNumbers({ ...typed, hedged: { equity: true } }).classes.equity.volatility).toBe(21);
    expect(buildMarketNumbers(typed).classes.equity.volatility).toBe(21);
    expect(toMonteCarloMarketSettings({ ...typed, hedged: { equity: true } }, undefined).classes?.equity?.volatility).toBe(21);
    // 17.15 is the hedged default: typed under the hedge it is not a choice, typed without it is.
    expect(toMonteCarloMarketSettings({ classes: { equity: { volatility: 17.15 } }, hedged: { equity: true } }, undefined).classes).toBeUndefined();
    expect(toMonteCarloMarketSettings({ classes: { equity: { volatility: 17.15 } } }, undefined).classes?.equity?.volatility).toBe(17.15);
  });

  it('AQ41: a custom matrix stays under any switch, and the edited count is on the combination in force', () => {
    const custom = [...MONTE_CARLO_DEFAULT_CORRELATIONS];
    custom[0] = 0.2;
    const saved = toMonteCarloMarketSettings({ classes: {}, hedged: ALL }, null, custom);
    expect(saved.correlations).toEqual(custom);
    expect(resolveMonteCarloMarket({ monteCarloMarket: saved }).correlations).toEqual(custom);
    // The defaults of the combination in force are not «edited».
    expect(countEditedCorrelations(defaultCorrelations(ALL), ALL)).toBe(0);
    expect(countEditedCorrelations(defaultCorrelations(ALL))).toBeGreaterThan(0);
    expect(toMonteCarloMarketSettings({ classes: {}, hedged: ALL }, null, defaultCorrelations(ALL))).not.toHaveProperty('correlations');
  });

  it('resolves and saves the switches: written only with at least one true, default none', () => {
    expect(resolveMonteCarloMarket({}).hedged).toEqual(NONE);
    const resolved = resolveMonteCarloMarket({ monteCarloMarket: { version: 2, hedged: { trendFollowing: true, carry: true, gold: false } } });
    expect(resolved.hedged).toEqual({ equity: false, gold: false, trendFollowing: true, carry: true });
    expect(resolved.overrides.hedged).toEqual({ trendFollowing: true, carry: true });
    expect(resolved.classes.trendFollowing.volatility).toBe(11);
    expect(resolved.correlations).toEqual(defaultCorrelations({ trendFollowing: true, carry: true }));
    expect(toMonteCarloMarketSettings({ classes: {}, hedged: { trendFollowing: true } }, undefined).hedged).toEqual({ trendFollowing: true });
    expect(toMonteCarloMarketSettings({ classes: {}, hedged: { trendFollowing: false } }, undefined)).not.toHaveProperty('hedged');
    expect(toMonteCarloMarketSettings({ classes: {} }, undefined)).not.toHaveProperty('hedged');
  });

  it('a merge write deletes a switch turned off, and the whole map when none is on', () => {
    const remove = Symbol('delete');
    const partial = monteCarloMarketForMergeWrite({ version: 2, hedged: { equity: true } }, remove).hedged as Record<string, unknown>;
    expect(partial).toEqual({ equity: true, gold: remove, trendFollowing: remove, carry: remove });
    expect(monteCarloMarketForMergeWrite({ version: 2 }, remove).hedged).toBe(remove);
  });

  it('keeps the four switches in the order of the classes', () => {
    expect([...MONTE_CARLO_HEDGEABLE_CLASSES]).toEqual(['equity', 'gold', 'trendFollowing', 'carry']);
  });
});
