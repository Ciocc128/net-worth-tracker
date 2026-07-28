/**
 * Tests for lib/utils/assetDisplay.ts — the single fallback resolver for an instrument's
 * user-facing label (alias when set, else the raw ticker, else the asset name).
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

  it('falls back to the name when ticker is empty (tickerless assets: cash/realestate/pensionFund)', () => {
    expect(getAssetDisplayTicker({ ticker: '', name: 'Conto Corrente' })).toBe('Conto Corrente');
  });

  it('falls back to the name when ticker is whitespace-only', () => {
    expect(getAssetDisplayTicker({ ticker: '   ', name: 'Fondo Pensione' })).toBe('Fondo Pensione');
  });

  it('trims surrounding whitespace from the name fallback', () => {
    expect(getAssetDisplayTicker({ ticker: '', name: '  Casa  ' })).toBe('Casa');
  });

  it('returns the raw (empty) ticker when both ticker and name are missing/blank', () => {
    expect(getAssetDisplayTicker({ ticker: '', name: '' })).toBe('');
    expect(getAssetDisplayTicker({ ticker: '' })).toBe('');
  });

  it('prefers the ticker over the name when both are present', () => {
    expect(getAssetDisplayTicker({ ticker: 'AAPL', name: 'Apple Inc.' })).toBe('AAPL');
  });
});
