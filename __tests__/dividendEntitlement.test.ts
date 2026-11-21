import { describe, it, expect } from 'vitest';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { Dividend } from '@/types/dividend';
import {
  entitledQuantity,
  computeDividendAmounts,
  resolveDividendWithholding,
  isOpenPayment,
  findQuantityMismatches,
} from '@/lib/utils/dividendEntitlement';

// Every date at noon: a midnight fixture would hide timezone bugs.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);
const NOW = d(2026, 11, 15);

let seq = 0;
function tx(
  type: AssetTransaction['type'],
  date: Date,
  quantity: number,
  extra: Partial<AssetTransaction> = {},
): AssetTransaction {
  seq += 1;
  return {
    id: `t${seq}`,
    userId: 'u1',
    assetId: 'a1',
    type,
    date,
    quantity,
    pricePerUnit: 10,
    priceEur: 10,
    createdAt: new Date(2020, 0, 1),
    updatedAt: new Date(2020, 0, 1),
    ...extra,
  };
}

const asset = (quantity: number, taxRate?: number) => ({ quantity, taxRate });
const qty = (txs: AssetTransaction[], ex: Date, current = 999) =>
  entitledQuantity({ asset: asset(current), transactions: txs, referenceDate: ex, now: NOW });

describe('entitledQuantity — dividends (DQ1–DQ9)', () => {
  const two = [tx('buy', d(2024, 3, 1), 100), tx('buy', d(2026, 10, 5), 100)];

  it('DQ1: a later buy does not touch an older ex-date', () => {
    expect(qty(two, d(2025, 5, 19), 200)).toBe(100);
    expect(computeDividendAmounts(1, 100, asset(200, 26))).toEqual({
      grossAmount: 100,
      taxAmount: 26,
      netAmount: 74,
    });
  });
  it('DQ1b: the October 2026 buy is after the May 2026 ex-date', () => {
    expect(qty(two, d(2026, 5, 18), 200)).toBe(100);
  });
  it('DQ2: a buy on the ex-date itself does not count', () => {
    const t = [tx('buy', d(2024, 3, 1), 100), tx('buy', d(2026, 5, 18), 50)];
    expect(qty(t, d(2026, 5, 18), 150)).toBe(100);
  });
  it('DQ3: a sell on the ex-date does not remove the right', () => {
    const t = [tx('buy', d(2024, 3, 1), 100), tx('sell', d(2026, 5, 18), 100)];
    expect(qty(t, d(2026, 5, 18), 0)).toBe(100);
  });
  it('DQ4: sold the day before = zero', () => {
    const t = [tx('buy', d(2024, 3, 1), 100), tx('sell', d(2026, 5, 15), 100)];
    expect(qty(t, d(2026, 5, 18), 0)).toBe(0);
  });
  it('DQ5: partial sell', () => {
    const t = [tx('buy', d(2024, 3, 1), 200), tx('sell', d(2026, 3, 10), 80)];
    const q = qty(t, d(2026, 5, 18), 120);
    expect(q).toBe(120);
    const a = computeDividendAmounts(1, q, asset(120, 26));
    expect(a.grossAmount).toBe(120);
    expect(a.taxAmount).toBeCloseTo(31.2, 10);
    expect(a.netAmount).toBeCloseTo(88.8, 10);
  });
  it('DQ6: an adjustment is an absolute reset', () => {
    const t = [tx('buy', d(2024, 3, 1), 100), tx('adjustment', d(2026, 4, 1), 130)];
    expect(qty(t, d(2026, 5, 18), 130)).toBe(130);
  });
  it('DQ7: ex-date before the baseline reads the baseline quantity', () => {
    const t = [tx('buy', d(2026, 9, 1), 150, { isBaseline: true })];
    expect(qty(t, d(2026, 5, 18), 150)).toBe(150);
  });
  it('a real first buy after the ex-date = zero', () => {
    const t = [tx('buy', d(2026, 9, 1), 150)];
    expect(qty(t, d(2026, 5, 18), 150)).toBe(0);
  });
  it('DQ8: no operations = the asset quantity', () => {
    expect(qty([], d(2026, 5, 18), 40)).toBe(40);
  });
  it('DQ9: a future reference is a forecast on today’s quantity', () => {
    const t = [tx('buy', d(2024, 3, 1), 100)];
    expect(qty(t, d(2027, 5, 17), 100)).toBe(100);
  });
  it('an invalid prefix falls back to the asset quantity', () => {
    const t = [tx('buy', d(2024, 3, 1), 10), tx('sell', d(2024, 4, 1), 50)];
    expect(qty(t, d(2026, 5, 18), 7)).toBe(7);
  });
});

describe('entitledQuantity — coupons (CQ6)', () => {
  it('a buy on the payment day does not receive that coupon', () => {
    const t = [tx('buy', d(2025, 1, 10), 5000), tx('buy', d(2026, 12, 1), 5000)];
    const now = d(2026, 11, 15);
    expect(
      entitledQuantity({ asset: asset(10000), transactions: t, referenceDate: d(2026, 12, 1), now }),
    ).toBe(10000); // future payment: forecast = today's quantity
    const later = d(2026, 12, 2);
    expect(
      entitledQuantity({ asset: asset(10000), transactions: t, referenceDate: d(2026, 12, 1), now: later }),
    ).toBe(5000); // payment day passed: the buy of that same day is excluded
  });
  it('CQ1: a buy before the payment doubles an open coupon', () => {
    const t = [tx('buy', d(2025, 1, 10), 5000), tx('buy', d(2026, 11, 10), 5000)];
    const q = entitledQuantity({ asset: asset(10000), transactions: t, referenceDate: d(2027, 1, 15), now: NOW });
    expect(q).toBe(10000);
    const a = computeDividendAmounts(0.01, q, asset(10000, 12.5));
    expect(a.grossAmount).toBeCloseTo(100, 10);
    expect(a.taxAmount).toBeCloseTo(12.5, 10);
    expect(a.netAmount).toBeCloseTo(87.5, 10);
  });
  it('CQ2: a partial sell', () => {
    const a = computeDividendAmounts(0.01, 2000, asset(2000, 12.5));
    expect(a.grossAmount).toBeCloseTo(20, 10);
    expect(a.taxAmount).toBeCloseTo(2.5, 10);
    expect(a.netAmount).toBeCloseTo(17.5, 10);
  });
  it('CQ4: after selling everything and rebuying 4000', () => {
    const a = computeDividendAmounts(0.01, 4000, asset(4000, 12.5));
    expect(a.grossAmount).toBeCloseTo(40, 10);
    expect(a.netAmount).toBeCloseTo(35, 10);
  });
});

describe('withholding (TX1–TX4)', () => {
  it.each([
    [26, 26, 74],
    [undefined, 26, 74],
    [12.5, 12.5, 87.5],
    [0, 0, 100],
  ])('rate %s on 100 gross', (rate, tax, net) => {
    expect(resolveDividendWithholding(100, { taxRate: rate })).toEqual({ taxAmount: tax, netAmount: net });
  });
});

function div(o: Partial<Dividend>): Dividend {
  return {
    id: 'd1',
    userId: 'u1',
    assetId: 'a1',
    assetTicker: 'X',
    assetName: 'X',
    exDate: d(2025, 5, 19),
    paymentDate: d(2025, 5, 21),
    dividendPerShare: 1,
    quantity: 100,
    grossAmount: 100,
    taxAmount: 26,
    netAmount: 74,
    currency: 'EUR',
    dividendType: 'ordinary',
    isAutoGenerated: true,
    createdAt: d(2026, 1, 1),
    updatedAt: d(2026, 1, 1),
    ...o,
  };
}

describe('isOpenPayment', () => {
  it('open only when auto, unpaid, uncorrected and not past', () => {
    const future = d(2026, 12, 1);
    expect(isOpenPayment(div({ paymentDate: future }), NOW)).toBe(true);
    expect(isOpenPayment(div({ paymentDate: NOW }), NOW)).toBe(true);
    expect(isOpenPayment(div({ paymentDate: d(2026, 11, 14) }), NOW)).toBe(false);
    expect(isOpenPayment(div({ paymentDate: future, expenseId: 'e1' }), NOW)).toBe(false);
    expect(isOpenPayment(div({ paymentDate: future, manuallyEdited: true }), NOW)).toBe(false);
    expect(isOpenPayment(div({ paymentDate: future, isAutoGenerated: false }), NOW)).toBe(false);
  });
});

describe('findQuantityMismatches (MM1–MM2)', () => {
  const t = [tx('buy', d(2024, 3, 1), 100), tx('buy', d(2026, 10, 5), 100)];
  const a = asset(200);
  const stored = [
    div({ id: 'd1', exDate: d(2025, 5, 19), quantity: 200, expenseId: 'e1' }),
    div({ id: 'd2', exDate: d(2026, 5, 18), paymentDate: d(2026, 5, 20), quantity: 200, expenseId: 'e2' }),
  ];
  it('MM1: lists both closed records with recorded vs entitled', () => {
    const list = findQuantityMismatches(stored, t, a, NOW);
    expect(list.map((m) => [m.dividendId, m.recordedQuantity, m.entitledQuantity])).toEqual([
      ['d1', 200, 100],
      ['d2', 200, 100],
    ]);
  });
  it('MM2: a hand-corrected record is never listed', () => {
    const list = findQuantityMismatches(stored.map((s) => ({ ...s, manuallyEdited: true })), t, a, NOW);
    expect(list).toEqual([]);
  });
  it('a record that matches is not listed', () => {
    expect(findQuantityMismatches([div({ quantity: 100, expenseId: 'e1' })], t, a, NOW)).toEqual([]);
  });
});
