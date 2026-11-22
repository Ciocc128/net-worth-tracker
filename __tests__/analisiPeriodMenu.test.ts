import { describe, it, expect } from 'vitest';
import { periodMenuValue } from '@/components/cashflow/analisi/AnalisiPeriodControls';

// UM4 P13: below `sm` the Analisi axis is one «Periodo» menu where a past year is its own item.
describe('periodMenuValue', () => {
  it('reads a mode as itself', () => {
    expect(periodMenuValue('ytd', 2026, [2025, 2024])).toBe('ytd');
    expect(periodMenuValue('current', 2026, [2025])).toBe('current');
    expect(periodMenuValue('history', null, [2025])).toBe('history');
  });

  it('reads «Anno» as the picked year', () => {
    expect(periodMenuValue('year', 2024, [2025, 2024])).toBe('year:2024');
  });

  it('falls back to the newest past year when none is picked', () => {
    expect(periodMenuValue('year', null, [2025, 2024])).toBe('year:2025');
  });
});
