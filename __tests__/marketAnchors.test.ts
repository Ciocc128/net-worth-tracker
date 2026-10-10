import { describe, expect, it } from 'vitest';
import { MONTE_CARLO_FROZEN_ANCHORS } from '@/lib/constants/monteCarloMarketDefaults';
import { describeAnchorLines, formatAnchorDate, formatSpfPeriod, isAnchorValueInRange, mergeStoredAnchors, toMonteCarloAnchors } from '@/lib/utils/marketAnchors';
import { buildMarketNumbers, resolveMonteCarloMarketForPortfolio } from '@/lib/utils/monteCarloMarket';

const NOW = new Date('2026-10-10T12:00:00Z');
const fmt = (value: number) => value.toFixed(2).replace('.', ',');
const near = (actual: number, expected: number, tolerance = 1e-6) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);

describe('mergeStoredAnchors (AQ31)', () => {
  const previous = { estr: { value: 2.4, date: '2026-10-01' }, aaa10y: { value: 3.5, date: '2026-10-01' }, inflation: { value: 2.0, period: '2026-Q2' } };

  it('takes the fetched observation of every series', () => {
    const next = mergeStoredAnchors(previous, { estr: { value: 2.5, period: '2026-10-08' }, aaa10y: { value: 3.6, period: '2026-10-08' }, inflation: { value: 2.1, period: '2026-Q3' } }, NOW.toISOString());
    expect(next).toEqual({ estr: { value: 2.5, date: '2026-10-08' }, aaa10y: { value: 3.6, date: '2026-10-08' }, inflation: { value: 2.1, period: '2026-Q3' }, fetchedAt: NOW.toISOString() });
  });

  it('discards an out-of-range value and keeps that series\' previous one; the others update', () => {
    const next = mergeStoredAnchors(previous, { estr: { value: 99, period: '2026-10-08' }, aaa10y: { value: 3.6, period: '2026-10-08' }, inflation: { value: 11, period: '2026-Q3' } }, NOW.toISOString());
    expect(next.estr).toEqual(previous.estr);
    expect(next.aaa10y).toEqual({ value: 3.6, date: '2026-10-08' });
    expect(next.inflation).toEqual(previous.inflation);
  });

  it('keeps the previous value of a series that failed', () => {
    const next = mergeStoredAnchors(previous, { estr: null, aaa10y: { value: 3.6, period: '2026-10-08' }, inflation: null }, NOW.toISOString());
    expect(next.estr).toEqual(previous.estr);
    expect(next.inflation).toEqual(previous.inflation);
  });

  it('leaves a series absent when it never was read', () => {
    const next = mergeStoredAnchors(null, { estr: null, aaa10y: null, inflation: null }, NOW.toISOString());
    expect(next).toEqual({ fetchedAt: NOW.toISOString() });
  });

  it('applies the limits [−2, 15] for rates and [−2, 10] for inflation', () => {
    expect(isAnchorValueInRange('estr', 15)).toBe(true);
    expect(isAnchorValueInRange('estr', 15.01)).toBe(false);
    expect(isAnchorValueInRange('aaa10y', -2.01)).toBe(false);
    expect(isAnchorValueInRange('inflation', 10.01)).toBe(false);
    expect(isAnchorValueInRange('inflation', Number.NaN)).toBe(false);
  });
});

describe('toMonteCarloAnchors (AQ32)', () => {
  it('a missing document is the frozen anchors, so AQ1 stands', () => {
    expect(toMonteCarloAnchors(null)).toEqual({ ...MONTE_CARLO_FROZEN_ANCHORS });
    expect(toMonteCarloAnchors({})).toEqual({ ...MONTE_CARLO_FROZEN_ANCHORS });
    const market = resolveMonteCarloMarketForPortfolio(null, undefined, toMonteCarloAnchors(null));
    near(market.classes.bonds.cagr, 1.45271);
    near(market.classes.cash.cagr, 0.394073);
    near(market.classes.trendFollowing.cagr, 3.927944);
  });

  it('a series missing from the document falls back to its frozen value, the others are live', () => {
    const anchors = toMonteCarloAnchors({ estr: { value: 2.5, date: '2026-10-09' } });
    expect(anchors.estr).toBe(2.5);
    expect(anchors.aaa10y).toBe(MONTE_CARLO_FROZEN_ANCHORS.aaa10y);
    expect(anchors.inflation).toBe(MONTE_CARLO_FROZEN_ANCHORS.inflation);
    expect(anchors.asOf).toBe('09/10/2026');
    expect(anchors.aaa10yDate).toBeUndefined();
  });

  it('an out-of-range stored value is not used', () => {
    expect(toMonteCarloAnchors({ estr: { value: 40, date: '2026-10-09' } })).toEqual({ ...MONTE_CARLO_FROZEN_ANCHORS });
  });
});

describe('the resolver on live anchors', () => {
  const anchors = toMonteCarloAnchors({ estr: { value: 3, date: '2026-10-09' }, aaa10y: { value: 3, date: '2026-10-09' }, inflation: { value: 2.5, period: '2026-Q3' } });

  it('AQ33: €STR 3,00 · AAA 3,00 · SPF 2,50 give the cifre of AQ4', () => {
    const { classes } = buildMarketNumbers({ classes: {} }, anchors);
    near(classes.bonds.cagr, 0.487805);
    near(classes.cash.cagr, 0.487805);
    near(classes.trendFollowing.cagr, 4.024976);
    near(classes.carry.cagr, 3.783805);
  });

  it('AQ33: the same figures through the portfolio resolver', () => {
    const market = resolveMonteCarloMarketForPortfolio(null, undefined, anchors);
    near(market.classes.bonds.cagr, 0.487805);
    expect(market.anchors.estr).toBe(3);
  });

  it('AQ34: a written inflation wins over the SPF, the rate anchors stay', () => {
    const numbers = buildMarketNumbers({ classes: {}, inflationRate: 3 }, anchors);
    expect(numbers.inflationRate).toBe(3);
    expect(numbers.inflationOrigin).toBe('saved');
    // Real value of the 3,00% AAA at the WRITTEN 3% inflation, not at the SPF's 2,5%.
    near(numbers.classes.bonds.cagr, 0);
  });
});

describe('describeAnchorLines', () => {
  it('says the value and the date of a fresh reading', () => {
    const anchors = toMonteCarloAnchors({ estr: { value: 2.41, date: '2026-10-09' }, aaa10y: { value: 3.52, date: '2026-10-08' }, inflation: { value: 2.04, period: '2026-Q3' } });
    const lines = describeAnchorLines(anchors, NOW, fmt);
    expect(lines.estr).toBe('dall’€STR 2,41% del 09/10/2026');
    expect(lines.aaa10y).toBe('dal tasso AAA 10 anni 3,52% del 08/10/2026');
    expect(lines.inflation).toBe('SPF BCE, 3° trimestre 2026');
  });

  it('flags a rate older than 10 days and an SPF older than 120', () => {
    const anchors = toMonteCarloAnchors({ estr: { value: 2.4, date: '2026-09-20' }, aaa10y: { value: 3.5, date: '2026-10-01' }, inflation: { value: 2.0, period: '2025-Q4' } });
    const lines = describeAnchorLines(anchors, NOW, fmt);
    expect(lines.estr).toBe('dall’€STR 2,40%, non aggiornato dal 20/09/2026');
    expect(lines.aaa10y).toBe('dal tasso AAA 10 anni 3,50% del 01/10/2026');
    expect(lines.inflation).toBe('SPF BCE, 4° trimestre 2025, non aggiornato');
  });

  it('never read: the frozen values, dated', () => {
    const lines = describeAnchorLines(toMonteCarloAnchors(null), NOW, fmt);
    expect(lines.estr).toBe('dall’€STR 2,44%: valori dell’08/10/2026');
    expect(lines.inflation).toBe('valore dell’08/10/2026');
  });

  it('formats dates and periods', () => {
    expect(formatAnchorDate('2026-10-08')).toBe('08/10/2026');
    expect(formatSpfPeriod('2026-Q3')).toBe('3° trimestre 2026');
  });
});
