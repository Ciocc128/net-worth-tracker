/**
 * Tests for lib/utils/assetDisplay.ts — the single fallback resolver for an instrument's
 * user-facing label (alias when set, else the raw ticker).
 */
import { describe, it, expect } from 'vitest';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';

describe('getAssetDisplayTicker', () => {
  it('returns the alias when displayTicker is set', () => {
    expect(getAssetDisplayTicker({ ticker: 'CL2.MI', displayTicker: 'CL2' })).toBe('CL2');
  });

  it('falls back to the ticker when displayTicker is empty', () => {
    expect(getAssetDisplayTicker({ ticker: 'VWCE.DE', displayTicker: '' })).toBe('VWCE.DE');
  });

  it('falls back to the ticker when displayTicker is whitespace-only', () => {
    expect(getAssetDisplayTicker({ ticker: 'VWCE.DE', displayTicker: '   ' })).toBe('VWCE.DE');
  });

  it('falls back to the ticker when displayTicker is absent', () => {
    expect(getAssetDisplayTicker({ ticker: 'AAPL' })).toBe('AAPL');
  });

  it('falls back to the ticker when displayTicker is null', () => {
    expect(getAssetDisplayTicker({ ticker: 'AAPL', displayTicker: null })).toBe('AAPL');
  });

  it('trims surrounding whitespace from a set alias', () => {
    expect(getAssetDisplayTicker({ ticker: 'CL2.MI', displayTicker: '  CL2  ' })).toBe('CL2');
  });
});
