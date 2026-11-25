/**
 * CS1 — `duePeriods` (doc/cron-serale/README.md § 5.3, CA1–CA3). Pure: the Italian day of the run,
 * the delivery records, the periods owed. Dates worked out by hand: 1 Jan 2026 is a Thursday, so
 * 1 Nov 2026 (+304 days = 43 weeks + 3 days) is a Sunday and 11 Nov a Wednesday.
 */
import { describe, expect, it } from 'vitest';
import { duePeriods, isoDayDiff } from '@/lib/utils/periodRecapDue';

/** The recap runs at 19:00 UTC: 20:00 or 21:00 Italian, the same Italian day. */
const at = (iso: string) => new Date(`${iso}T19:30:00Z`);
const keys = (iso: string, deliveries = {}) => duePeriods(at(iso), deliveries).map((period) => period.key);

describe('CA1 — an ordinary 1st', () => {
  it('1 Nov 2026 (a Sunday): October closed, its vault month and the Sunday budget week; the quarter is still open', () => {
    expect(keys('2026-11-01')).toEqual(['monthly-2026-10', 'budget-week-2026-11-01', 'vault-2026-10']);
  });

  it('11 Nov 2026 (a Wednesday): nothing is due', () => {
    expect(keys('2026-11-11')).toEqual([]);
  });
});

describe('CA2 — 1 January closes a month, a quarter, a half and a year', () => {
  it('2027-01-01 (a Friday)', () => {
    expect(keys('2027-01-01')).toEqual([
      'monthly-2026-12',
      'quarterly-2026-Q4',
      'semiannual-2026-H2',
      'yearly-2026',
      'vault-2026-12',
    ]);
  });

  it('1 July 2026 (a Wednesday) closes a quarter and a half: Q2 and H1', () => {
    expect(keys('2026-07-01')).toEqual(['monthly-2026-06', 'quarterly-2026-Q2', 'semiannual-2026-H1', 'vault-2026-06']);
  });
});

describe('CA3 — the catch-up window of 7 days (D-CS6)', () => {
  it('the 2nd, record absent: October is sent today (a missed 1st)', () => {
    expect(keys('2026-11-02')).toEqual(['monthly-2026-10', 'vault-2026-10']);
  });

  // 8 Nov 2026 is itself a Sunday (1 Nov + 7): only its budget week is due, October no longer.
  it('the 7th is the last day; the 8th owes no month', () => {
    expect(isoDayDiff('2026-10-31', '2026-11-07')).toBe(7);
    expect(keys('2026-11-07')).toEqual(['monthly-2026-10', 'vault-2026-10']);
    expect(keys('2026-11-08')).toEqual(['budget-week-2026-11-08']);
    expect(keys('2026-11-09')).toEqual([]);
  });

  it('a `sent` or `skipped` record closes the period; a `failed` one leaves it open', () => {
    expect(keys('2026-11-02', { 'monthly-2026-10': { status: 'sent' } })).toEqual(['vault-2026-10']);
    expect(keys('2026-11-02', { 'monthly-2026-10': { status: 'skipped' } })).toEqual(['vault-2026-10']);
    expect(keys('2026-11-02', { 'monthly-2026-10': { status: 'failed' } })).toEqual(['monthly-2026-10', 'vault-2026-10']);
  });

  it('a `sending` claim blocks for ten minutes, then the next run reclaims it', () => {
    const now = at('2026-11-02');
    const claimed = (minutesAgo: number) => ({
      'monthly-2026-10': { status: 'sending' as const, claimedAtMs: now.getTime() - minutesAgo * 60_000 },
    });
    expect(duePeriods(now, claimed(9)).map((p) => p.key)).toEqual(['vault-2026-10']);
    expect(duePeriods(now, claimed(11)).map((p) => p.key)).toEqual(['monthly-2026-10', 'vault-2026-10']);
  });
});

describe('the Italian day, not the UTC one', () => {
  it('00:30 Italian on 1 Nov (23:30 UTC on 31 Oct) already reads the 1st', () => {
    expect(duePeriods(new Date('2026-10-31T23:30:00Z')).map((p) => p.key)).toContain('monthly-2026-10');
  });
});
