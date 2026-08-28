import { describe, it, expect } from 'vitest';
import {
  resolvePerformanceExclusions,
  toPerformanceBaseSnapshots,
} from '@/lib/utils/performanceBase';
import type { Asset, MonthlySnapshot } from '@/types/assets';

function makeSnapshot(
  overrides: Partial<MonthlySnapshot> & { totalNetWorth: number; illiquidNetWorth: number }
): MonthlySnapshot {
  return {
    userId: 'user-1',
    year: 2026,
    month: 1,
    liquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(2026, 0, 31),
    ...overrides,
  } as MonthlySnapshot;
}

describe('toPerformanceBaseSnapshots', () => {
  it('returns snapshots unchanged for the netWorth base', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 400,
        byAsset: [{ assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 }],
      }),
    ];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1'], 'netWorth');

    expect(result).toBe(snapshots);
  });

  it('subtracts the pension fund value from totalNetWorth and illiquidNetWorth on the portfolio base', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 400,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 },
          { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 10, price: 70, totalValue: 700 },
        ],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result.totalNetWorth).toBe(700);
    expect(result.illiquidNetWorth).toBe(100);
  });

  it('clamps illiquidNetWorth at 0 rather than going negative', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 100,
        byAsset: [{ assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 }],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result.totalNetWorth).toBe(700);
    expect(result.illiquidNetWorth).toBe(0);
  });

  it('passes a snapshot through untouched when no byAsset entry matches a pension id', () => {
    const snapshot = makeSnapshot({
      totalNetWorth: 1000,
      illiquidNetWorth: 400,
      byAsset: [{ assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 10, price: 100, totalValue: 1000 }],
    });

    const [result] = toPerformanceBaseSnapshots([snapshot], ['pension-1']);

    expect(result).toBe(snapshot);
  });

  it('returns snapshots unchanged when pensionAssetIds is empty (no pension funds exist)', () => {
    const snapshots = [makeSnapshot({ totalNetWorth: 1000, illiquidNetWorth: 400 })];

    const result = toPerformanceBaseSnapshots(snapshots, []);

    expect(result).toBe(snapshots);
  });

  it('sums multiple pension funds in the same snapshot', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 600,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo A', quantity: 1, price: 200, totalValue: 200 },
          { assetId: 'pension-2', ticker: '', name: 'Fondo B', quantity: 1, price: 150, totalValue: 150 },
          { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 6.5, price: 100, totalValue: 650 },
        ],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1', 'pension-2']);

    expect(result.totalNetWorth).toBe(650);
    expect(result.illiquidNetWorth).toBe(250);
  });
});

/**
 * Il backfill è la correzione del 2026-07-27: senza, il capitale escluso restava dentro il
 * patrimonio finché gli snapshot non avevano `byAsset` e ne usciva al primo mese che ce l'aveva,
 * producendo uno scalino letto come crollo di mercato (sui dati reali: −9,37% a novembre 2025).
 */
describe('toPerformanceBaseSnapshots — backfill sugli snapshot senza byAsset', () => {
  /** Rendimento mensile come lo calcolano heatmap e TWR: (V_fine − cashflow) / V_inizio − 1. */
  function monthlyReturn(startNetWorth: number, endNetWorth: number, cashFlow = 0): number {
    return (endNetWorth - cashFlow) / startNetWorth - 1;
  }

  const withBreakdown = (year: number, month: number, totalNetWorth: number, pensionValue: number) =>
    makeSnapshot({
      year,
      month,
      totalNetWorth,
      illiquidNetWorth: pensionValue,
      byAsset: [
        { assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: pensionValue, totalValue: pensionValue },
        {
          assetId: 'etf-1',
          ticker: 'VWCE',
          name: 'ETF',
          quantity: 1,
          price: totalNetWorth - pensionValue,
          totalValue: totalNetWorth - pensionValue,
        },
      ],
    });

  const withoutBreakdown = (year: number, month: number, totalNetWorth: number) =>
    makeSnapshot({ year, month, totalNetWorth, illiquidNetWorth: 0, byAsset: [] });

  it('subtracts the earliest known excluded value from the months that predate byAsset', () => {
    const snapshots = [
      withoutBreakdown(2025, 9, 250_000),
      withoutBreakdown(2025, 10, 256_424),
      withBreakdown(2025, 11, 256_801, 23_597),
    ];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result[0].totalNetWorth).toBe(250_000 - 23_597);
    expect(result[1].totalNetWorth).toBe(256_424 - 23_597);
    expect(result[2].totalNetWorth).toBe(256_801 - 23_597);
  });

  it('leaves no return artifact at the join between backfilled and real breakdown months', () => {
    // Scenario reale: ottobre → novembre 2025, patrimonio praticamente piatto (+377 €).
    const snapshots = [
      withoutBreakdown(2025, 10, 256_424),
      withBreakdown(2025, 11, 256_801, 23_597),
    ];

    const [october, november] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);
    const joinReturn = monthlyReturn(october.totalNetWorth, november.totalNetWorth, 819);

    // Prima del fix questo valeva −9,37%; ora è il movimento reale, sotto il mezzo punto.
    expect(Math.abs(joinReturn)).toBeLessThan(0.005);
  });

  it('keeps the returns inside the pre-breakdown block identical to the unadjusted ones', () => {
    // Una costante si semplifica al numeratore, quindi il rendimento cambia solo per il
    // denominatore: il segno e l'ordine di grandezza restano quelli veri, senza salti.
    const snapshots = [
      withoutBreakdown(2025, 8, 200_000),
      withoutBreakdown(2025, 9, 210_000),
      withBreakdown(2025, 10, 215_000, 20_000),
    ];

    const [august, september] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(september.totalNetWorth - august.totalNetWorth).toBe(10_000);
    expect(monthlyReturn(august.totalNetWorth, september.totalNetWorth)).toBeCloseTo(
      10_000 / 180_000,
      10
    );
  });

  it('subtracts nothing when a breakdown exists but the asset is absent from it', () => {
    // Evidenza genuina che l'asset non esisteva quel mese — qui NON si backfilla.
    const snapshots = [
      withBreakdown(2026, 1, 100_000, 10_000),
      makeSnapshot({
        year: 2026,
        month: 2,
        totalNetWorth: 105_000,
        illiquidNetWorth: 0,
        byAsset: [{ assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 1, price: 105_000, totalValue: 105_000 }],
      }),
    ];

    const [january, february] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(january.totalNetWorth).toBe(90_000);
    expect(february.totalNetWorth).toBe(105_000);
  });

  it('picks the chronologically earliest breakdown even when the input is unsorted', () => {
    const snapshots = [
      withBreakdown(2026, 3, 300_000, 30_000),
      withoutBreakdown(2025, 5, 200_000),
      withBreakdown(2025, 11, 256_801, 23_597),
    ];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    // L'ordine di input è preservato: l'elemento backfillato resta il secondo.
    expect(result[1].totalNetWorth).toBe(200_000 - 23_597);
  });

  it('subtracts nothing anywhere when no snapshot has a breakdown at all', () => {
    const snapshots = [withoutBreakdown(2024, 1, 100_000), withoutBreakdown(2024, 2, 110_000)];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result[0].totalNetWorth).toBe(100_000);
    expect(result[1].totalNetWorth).toBe(110_000);
  });

  it('backfills pension funds and non-allocated assets together', () => {
    const snapshots = [
      withoutBreakdown(2025, 10, 256_424),
      makeSnapshot({
        year: 2025,
        month: 11,
        totalNetWorth: 256_801,
        illiquidNetWorth: 82_815,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 23_597, totalValue: 23_597 },
          { assetId: 'house-1', ticker: '', name: 'Casa', quantity: 1, price: 59_218, totalValue: 59_218 },
        ],
      }),
    ];

    const [october, november] = toPerformanceBaseSnapshots(snapshots, ['pension-1', 'house-1']);

    expect(october.totalNetWorth).toBe(256_424 - 82_815);
    expect(november.totalNetWorth).toBe(256_801 - 82_815);
    expect(november.illiquidNetWorth).toBe(0);
  });
});

describe('resolvePerformanceExclusions', () => {
  const makeAsset = (overrides: Partial<Asset> & { id: string }): Asset =>
    ({ userId: 'user-1', name: 'Asset', type: 'etf', assetClass: 'equity', quantity: 1, ...overrides }) as Asset;

  it('excludes pension funds and non-allocated assets by default', () => {
    const assets = [
      makeAsset({ id: 'pension-1', type: 'pensionFund', allocationRole: 'frozen' }),
      makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
      makeAsset({ id: 'etf-1' }),
    ];

    expect(resolvePerformanceExclusions(assets).sort()).toEqual(['house-1', 'pension-1']);
  });

  it('honours the legacy excludeFromAllocation flag via resolveAllocationRole', () => {
    const assets = [makeAsset({ id: 'house-1', type: 'realestate', excludeFromAllocation: true })];

    expect(resolvePerformanceExclusions(assets)).toEqual(['house-1']);
  });

  it('keeps pension funds in the base when the user opted them in', () => {
    const assets = [
      makeAsset({ id: 'pension-1', type: 'pensionFund' }),
      makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
    ];

    expect(resolvePerformanceExclusions(assets, { includePensionFunds: true })).toEqual(['house-1']);
  });

  it('returns nothing when both categories are opted in', () => {
    const assets = [
      makeAsset({ id: 'pension-1', type: 'pensionFund', allocationRole: 'excluded' }),
      makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
    ];

    expect(
      resolvePerformanceExclusions(assets, { includePensionFunds: true, includeExcludedAssets: true })
    ).toEqual([]);
  });

  it('lists an asset once when it matches both rules', () => {
    const assets = [makeAsset({ id: 'pension-1', type: 'pensionFund', allocationRole: 'excluded' })];

    expect(resolvePerformanceExclusions(assets)).toEqual(['pension-1']);
  });
});
