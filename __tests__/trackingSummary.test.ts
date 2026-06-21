/**
 * Tests for lib/utils/trackingSummary.ts — the pure layer behind the Cashflow
 * "Tracciamento" redesign hero. Covers the single health verdict that folds the
 * old ratio-chip + savings-rate-subtext pair into one tone/headline/detail.
 */

import { describe, it, expect } from 'vitest';
import { summarizeCashflowHealth } from '@/lib/utils/trackingSummary';

describe('summarizeCashflowHealth', () => {
  it('reports "Salute ottima" when income covers expenses 2x or more', () => {
    const v = summarizeCashflowHealth(2000, 800);
    expect(v.tone).toBe('excellent');
    expect(v.headline).toBe('Salute ottima');
    expect(v.ratio).toBeCloseTo(2.5);
    expect(v.savingsRate).toBe(60); // (2000-800)/2000
    expect(v.detail).toBe('Hai risparmiato il 60% delle entrate');
  });

  it('reports "Salute buona" between 1.3x and 2x coverage', () => {
    const v = summarizeCashflowHealth(1500, 1000);
    expect(v.tone).toBe('good');
    expect(v.headline).toBe('Salute buona');
    expect(v.savingsRate).toBe(33);
  });

  it('reports "In pareggio" between 1.0x and 1.3x coverage', () => {
    const v = summarizeCashflowHealth(1100, 1000);
    expect(v.tone).toBe('even');
    expect(v.headline).toBe('In pareggio');
    expect(v.detail).toBe('Entrate e uscite quasi in pareggio');
  });

  it('reports "In deficit" with a negative savings rate when spending exceeds income', () => {
    const v = summarizeCashflowHealth(800, 1000);
    expect(v.tone).toBe('deficit');
    expect(v.headline).toBe('In deficit');
    expect(v.savingsRate).toBe(-25); // (800-1000)/800
    expect(v.detail).toBe('Hai speso più di quanto hai incassato');
  });

  it('treats spending with no income as a deficit (ratio null)', () => {
    const v = summarizeCashflowHealth(0, 500);
    expect(v.tone).toBe('deficit');
    expect(v.ratio).toBe(0); // 0 income ÷ 500 expenses = 0× coverage
    expect(v.savingsRate).toBe(0);
    expect(v.detail).toBe('Spese senza entrate nel periodo');
  });

  it('treats income with no expenses as fully saved', () => {
    const v = summarizeCashflowHealth(1200, 0);
    expect(v.tone).toBe('excellent');
    expect(v.ratio).toBeNull();
    expect(v.savingsRate).toBe(100);
    expect(v.detail).toBe('Nessuna spesa: hai messo da parte tutte le entrate');
  });

  it('returns a neutral verdict when there is no movement at all', () => {
    const v = summarizeCashflowHealth(0, 0);
    expect(v.tone).toBe('neutral');
    expect(v.headline).toBe('Nessun dato');
    expect(v.detail).toBe('Nessun movimento nel periodo');
  });
});
