/**
 * Tests for the three-macro-area geography classification (doc/weight-optimizer-ate.md §5.2).
 * One classification (MSCI) for both instruments and the reference index — see the module's
 * own header comment for why (the Korea reclassification versus FTSE).
 */
import { describe, it, expect } from 'vitest';
import { countryToArea } from '@/lib/constants/geoAreas';

describe('countryToArea', () => {
  it('classifies the United States as us', () => {
    expect(countryToArea('US')).toBe('us');
  });

  it('classifies MSCI Emerging Markets codes as emerging', () => {
    expect(countryToArea('KR')).toBe('emerging');
    expect(countryToArea('TW')).toBe('emerging');
    expect(countryToArea('CN')).toBe('emerging');
  });

  it('classifies a developed, non-US country as developedExUs', () => {
    expect(countryToArea('JP')).toBe('developedExUs');
  });

  it('maps the curated OTHER slice to null (resolved separately by areasFromCountries)', () => {
    expect(countryToArea('OTHER')).toBeNull();
  });
});
