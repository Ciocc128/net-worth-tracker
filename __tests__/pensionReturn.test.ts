import { describe, it, expect } from 'vitest';
import {
  buildPensionValueSeries,
  computePensionReturn,
  resolvePensionReturnStart,
} from '@/lib/utils/pensionReturn';
import type { MonthlySnapshot } from '@/types/assets';
import type { ContributionSource, PensionContribution } from '@/types/pension';

function snapshotWithFund(
  year: number,
  month: number,
  fundValue: number | null,
  otherValue = 50_000
): MonthlySnapshot {
  const byAsset = [
    { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 1, price: otherValue, totalValue: otherValue },
    ...(fundValue === null
      ? []
      : [{ assetId: 'fund-1', ticker: '', name: 'Fondo', quantity: 1, price: fundValue, totalValue: fundValue }]),
  ];

  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth: otherValue + (fundValue ?? 0),
    liquidNetWorth: otherValue,
    illiquidNetWorth: fundValue ?? 0,
    byAssetClass: {},
    byAsset,
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  } as MonthlySnapshot;
}

function contribution(
  year: number,
  month: number,
  amount: number,
  source: ContributionSource = 'voluntary',
  /** Quando il versamento è stato REGISTRATO (default: stesso mese della data). */
  recordedAt?: Date
): PensionContribution {
  return {
    id: `${year}-${month}-${source}-${recordedAt?.getTime() ?? 0}`,
    userId: 'user-1',
    assetId: 'fund-1',
    source,
    amount,
    date: new Date(year, month - 1, 15),
    taxYear: year,
    deductible: source !== 'tfr',
    createdAt: recordedAt ?? new Date(year, month - 1, 15),
  };
}

describe('buildPensionValueSeries', () => {
  it('sums the funds month by month, chronologically', () => {
    const series = buildPensionValueSeries(
      [snapshotWithFund(2026, 2, 11_000), snapshotWithFund(2026, 1, 10_000)],
      ['fund-1']
    );

    expect(series).toEqual([
      { year: 2026, month: 1, value: 10_000 },
      { year: 2026, month: 2, value: 11_000 },
    ]);
  });

  it('skips snapshots with no per-asset breakdown', () => {
    const legacy = { ...snapshotWithFund(2025, 5, 9_000), byAsset: [] } as MonthlySnapshot;

    const series = buildPensionValueSeries([legacy, snapshotWithFund(2026, 1, 10_000)], ['fund-1']);

    expect(series).toEqual([{ year: 2026, month: 1, value: 10_000 }]);
  });

  it('skips months where the fund is absent — it did not exist, it was not worth zero', () => {
    const series = buildPensionValueSeries(
      [snapshotWithFund(2025, 12, null), snapshotWithFund(2026, 1, 10_000)],
      ['fund-1']
    );

    expect(series).toEqual([{ year: 2026, month: 1, value: 10_000 }]);
  });

  it('returns nothing when there are no funds', () => {
    expect(buildPensionValueSeries([snapshotWithFund(2026, 1, 10_000)], [])).toEqual([]);
  });
});

describe('resolvePensionReturnStart', () => {
  it('prefers the configured start month over the data', () => {
    expect(resolvePensionReturnStart([contribution(2024, 3, 500)], '2026-01')).toBe('2026-01');
  });

  it('falls back to the earliest recorded contribution', () => {
    const start = resolvePensionReturnStart([contribution(2026, 6, 383), contribution(2026, 2, 500)]);

    expect(start).toBe('2026-02');
  });

  it('returns null when nothing was ever recorded', () => {
    expect(resolvePensionReturnStart([])).toBeNull();
  });
});

describe('computePensionReturn', () => {
  const series = (values: [number, number, number][]) =>
    values.map(([year, month, value]) => ({ year, month, value }));

  it('reads a contribution-only month as zero return', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [contribution(2026, 2, 1_000)],
      '2026-01'
    );

    expect(result!.twr).toBeCloseTo(0, 10);
    expect(result!.marketGain).toBeCloseTo(0, 10);
    expect(result!.valueGrowth).toBe(1_000);
  });

  it('reads pure market growth as return', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_500],
      ]),
      [],
      '2026-01'
    );

    expect(result!.twr).toBeCloseTo(5, 10);
    expect(result!.marketGain).toBe(500);
  });

  it('keeps the employer contribution out of the TWR but inside the personal return', () => {
    // 10.000 € → 11.000 €, di cui 1.000 € regalati dal datore: mercato fermo, ma il capitale
    // proprio (10.000 €) ha comunque prodotto un beneficio del 10%.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [contribution(2026, 2, 1_000, 'employer')],
      '2026-01'
    );

    expect(result!.twr).toBeCloseTo(0, 10);
    expect(result!.contributions.employer).toBe(1_000);
    expect(result!.personalReturn).toBeCloseTo(10, 10);
  });

  it('counts TFR as own capital, not as a benefit', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [contribution(2026, 2, 1_000, 'tfr')],
      '2026-01'
    );

    // Denominatore 10.000 + 1.000 di TFR, numeratore zero: nessun beneficio, solo capitale spostato.
    expect(result!.personalReturn).toBeCloseTo(0, 10);
    expect(result!.contributions.tfr).toBe(1_000);
  });

  it('ignores contributions dated in the opening month — already inside its value', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_000],
      ]),
      [contribution(2026, 1, 5_000)],
      '2026-01'
    );

    expect(result!.contributions.total).toBe(0);
    expect(result!.twr).toBeCloseTo(0, 10);
  });

  it('starts at the configured month, ignoring earlier history', () => {
    const result = computePensionReturn(
      series([
        [2025, 11, 20_000],
        [2026, 1, 25_000],
        [2026, 2, 26_000],
      ]),
      [],
      '2026-01'
    );

    expect(result!.windowStart).toBe('2026-01');
    expect(result!.startValue).toBe(25_000);
    expect(result!.monthsCovered).toBe(1);
  });

  it('suppresses annualisation below three months of coverage', () => {
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_500],
      ]),
      [],
      '2026-01'
    );

    expect(result!.annualizedTwr).toBeNull();
    expect(result!.isCoverageSuspicious).toBe(false);
  });

  it('annualises once there are at least three months', () => {
    // +1% al mese per 4 mesi → circa +12,7% annualizzato.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_100],
        [2026, 3, 10_201],
        [2026, 4, 10_303.01],
        [2026, 5, 10_406.04],
      ]),
      [],
      '2026-01'
    );

    expect(result!.monthsCovered).toBe(4);
    expect(result!.annualizedTwr).toBeCloseTo(12.68, 1);
  });

  it('flags an implausible return as missing contributions, not a brilliant fund', () => {
    // Lo scenario reale: il fondo cresce del 30% in 8 mesi con un solo versamento registrato.
    const result = computePensionReturn(
      series([
        [2025, 11, 23_597],
        [2026, 1, 24_758],
        [2026, 3, 27_827],
        [2026, 5, 29_841],
        [2026, 7, 31_031],
      ]),
      [contribution(2026, 6, 383, 'tfr')],
      '2025-11'
    );

    expect(result!.annualizedTwr).toBeGreaterThan(20);
    expect(result!.isCoverageSuspicious).toBe(true);
  });

  it('attributes a back-dated contribution to the month its value actually moved', () => {
    // Il caso reale: TFR datato 30/06 ma registrato il 24/07. Lo snapshot di giugno era già
    // congelato, quindi i 382,86 € compaiono nel valore di luglio. Attribuirli a giugno li
    // farebbe sparire dai versamenti del periodo e la crescita di luglio verrebbe letta come
    // guadagno di mercato.
    const result = computePensionReturn(
      series([
        [2026, 6, 30_648.53],
        [2026, 7, 31_031.39],
      ]),
      [contribution(2026, 6, 382.86, 'tfr', new Date(2026, 6, 24))],
      '2026-06'
    );

    expect(result!.contributions.tfr).toBeCloseTo(382.86, 2);
    expect(result!.marketGain).toBeCloseTo(0, 2);
    expect(result!.twr).toBeCloseTo(0, 6);
  });

  it('still ignores a contribution recorded inside the opening month', () => {
    // Registrato a gennaio con data gennaio: il valore di apertura lo contiene già.
    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 10_000],
      ]),
      [contribution(2026, 1, 5_000, 'voluntary', new Date(2026, 0, 20))],
      '2026-01'
    );

    expect(result!.contributions.total).toBe(0);
    expect(result!.twr).toBeCloseTo(0, 10);
  });

  it('falls back to the accounting date when createdAt is missing', () => {
    const legacy = {
      ...contribution(2026, 2, 1_000),
      createdAt: undefined,
    } as unknown as PensionContribution;

    const result = computePensionReturn(
      series([
        [2026, 1, 10_000],
        [2026, 2, 11_000],
      ]),
      [legacy],
      '2026-01'
    );

    expect(result!.contributions.total).toBe(1_000);
    expect(result!.twr).toBeCloseTo(0, 10);
  });

  it('returns null when the window holds fewer than two months', () => {
    expect(computePensionReturn(series([[2026, 1, 10_000]]), [], '2026-01')).toBeNull();
    expect(computePensionReturn(series([[2025, 1, 10_000]]), [], '2026-01')).toBeNull();
  });
});
