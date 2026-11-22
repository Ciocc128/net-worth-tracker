/**
 * UM3, point 7: the Cashflow trio draws the cents smaller. `splitEuroCents` cuts a formatted euro
 * figure in two pieces whose join is the original text (the DOM still reads «12.345,67 €»).
 * Reference by hand: 12345,67 € → «12.345» + «,67 €» (it-IT groups from five digits: 1234,56 prints «1234,56 €»); −80,00 € → «−80» + «,00 €»; 2500 € whole → no cents.
 */
import { describe, expect, it } from 'vitest';
import { cachedFormatCurrencyEUR, formatEuroMinus, splitEuroCents } from '@/lib/utils/formatters';

describe('splitEuroCents', () => {
  it('cuts 12345,67 € into the whole part and the cents', () => {
    const { whole, cents } = splitEuroCents(cachedFormatCurrencyEUR(12345.67));
    expect(whole).toBe('12.345');
    expect(cents.startsWith(',67')).toBe(true);
    expect(cents.endsWith('€')).toBe(true);
    expect(whole + cents).toBe(cachedFormatCurrencyEUR(12345.67));
  });

  it('keeps the typographic minus with the whole part', () => {
    const text = formatEuroMinus(-80, false);
    const { whole, cents } = splitEuroCents(text);
    expect(whole).toBe('−80');
    expect(cents.startsWith(',00')).toBe(true);
  });

  it('leaves a figure with no cents whole', () => {
    expect(splitEuroCents(cachedFormatCurrencyEUR(2500, true))).toEqual({ whole: cachedFormatCurrencyEUR(2500, true), cents: '' });
  });
});
