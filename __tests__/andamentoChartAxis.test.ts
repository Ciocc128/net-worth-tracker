import { describe, expect, it } from 'vitest';
import { formatTrendTick } from '@/components/cashflow/tiles/AndamentoChart';

describe('formatTrendTick', () => {
  it('keeps the half thousands apart (500 € steps are not «1k, 1k, 2k»)', () => {
    const labels = [0, 500, 1000, 1500, 2000].map(formatTrendTick);
    expect(new Set(labels).size).toBe(5);
    expect(labels[1]).toBe('500 €');
    expect(labels[3]).toBe('1,5k €');
  });
  it('prints whole thousands and millions without decimals noise', () => {
    expect(formatTrendTick(3000)).toBe('3k €');
    expect(formatTrendTick(2_500_000)).toBe('2,5 Mln €');
  });
});
