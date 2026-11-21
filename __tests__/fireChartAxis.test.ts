import { describe, expect, it } from 'vitest';
import { formatAxisEuro, niceStep, resolveFireAxis } from '@/lib/utils/fireChartAxis';

describe('niceStep', () => {
  it('picks the smallest m × 10^k ≥ y, m in {1, 2, 2.5, 5}', () => {
    expect(niceStep(396_000)).toBe(500_000);
    expect(niceStep(660_000)).toBe(1_000_000);
    expect(niceStep(200_000)).toBe(200_000);
    expect(niceStep(210_000)).toBe(250_000);
  });
});

describe('resolveFireAxis', () => {
  it('1. cuts a far-out outer series and says its maximum', () => {
    // C = 1.800.000 → 1,1 × C / 5 = 396.000 → step 500.000; top = ceil(1.980.000 / 500.000) × 500.000 = 2.000.000.
    // O = 9.000.000 > 1,5 × 2.000.000 = 3.000.000 → cut.
    const axis = resolveFireAxis([[1_000_000, 1_800_000]], [[3_000_000, 9_000_000]])!;
    expect(axis.top).toBe(2_000_000);
    expect(axis.step).toBe(500_000);
    expect(axis.ticks).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(axis.cut).toBe(true);
    expect(axis.outerMax).toBe(9_000_000);
  });

  it('2. keeps a near outer series in the chart, on round ticks, with no cut', () => {
    // C = 1.200.000 → top 1.500.000; O = 2.000.000 ≤ 2.250.000 → axisFor(2 Mln): 2.200.000 / 5 = 440.000 → 500.000, top 2.500.000.
    const axis = resolveFireAxis([[1_200_000]], [[2_000_000]])!;
    expect(axis.cut).toBe(false);
    expect(axis.step).toBe(500_000);
    expect(axis.top).toBe(2_500_000);
  });

  it('3. sizes the axis on the maximum over the horizon, not on the last year (decumulation)', () => {
    // p50 falls 1.000.000 → 200.000, p75 peaks at 1.300.000: C = 1.300.000 → 1.430.000 / 5 = 286.000 → 500.000; top = 1.500.000.
    // p90 ends at 6.000.000 > 2.250.000 → cut.
    const axis = resolveFireAxis([[1_000_000, 600_000, 200_000], [1_300_000, 800_000, 300_000]], [[1_500_000, 3_000_000, 6_000_000]])!;
    expect(axis.top).toBe(1_500_000);
    expect(axis.cut).toBe(true);
  });

  it('4. returns null with nothing to draw and ignores null, NaN and negatives', () => {
    expect(resolveFireAxis([], [])).toBeNull();
    expect(resolveFireAxis([[null, undefined, NaN]], [])).toBeNull();
    expect(resolveFireAxis([[-5, 0]], [[9_000_000]])).toBeNull();
    expect(resolveFireAxis([[null, 1_000_000, -3]], [])!.top).toBeGreaterThanOrEqual(1_000_000);
  });

  it('4b. a typed threshold is core: 3.000.000 above a median peaking at 1.800.000 stays inside (D-RU13)', () => {
    // C = max(1.800.000, 3.000.000) = 3.000.000 → 3.300.000 / 5 = 660.000 → step 1.000.000; top = ceil(3,3) = 4 → 4.000.000.
    const axis = resolveFireAxis([[1_800_000], [3_000_000]], [])!;
    expect(axis.step).toBe(1_000_000);
    expect(axis.top).toBe(4_000_000);
    expect(axis.cut).toBe(false);
  });
});

describe('formatAxisEuro', () => {
  it('5. writes Mln with the decimals the step needs and keeps it on one line', () => {
    expect(formatAxisEuro(1_500_000, 500_000)).toBe('1,5 Mln €');
    expect(formatAxisEuro(2_000_000, 500_000)).toBe('2\u00A0Mln\u00A0€');
    expect(formatAxisEuro(2_000_000, 1_000_000)).toBe('2 Mln €');
    expect(formatAxisEuro(1_250_000, 250_000)).toBe('1,25 Mln €');
    expect(formatAxisEuro(750_000, 250_000)).toBe('750k €');
    expect(formatAxisEuro(0, 250_000)).toBe('0 €');
  });
});
