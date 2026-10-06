/**
 * Tests for lib/utils/emailPortfolio.ts — the periodic email's portfolio half, measured with the
 * pages' own functions (F1b of doc/ai-open-models-wiki.md).
 *
 * The Driver fixture is __tests__/growthDrivers.test.ts's settembre 2026 in miniature, with asset
 * classes added: the per-instrument figures below are worked out by hand, and their market sums to
 * the 270 € that test pins for the whole month — the email and Storico cannot disagree.
 *
 * `calculateAssetValue` (reached through the allocation) lives in assetService, which pulls in the
 * client Firebase SDK at load.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));

import {
  buildEmailClassMoves,
  measureEmailDrivers,
  resolveEmailPeriodReturn,
  summarizeEmailAllocation,
  summarizeTradesByInstrument,
  resolveAssetLegs,
} from '@/lib/utils/emailPortfolio';
import { buildMonthlyGrowthDrivers, createGrowthDriverMeter, type GrowthDriverContext } from '@/lib/utils/growthDrivers';
import { sumByMarketBand, tradedMoney } from '@/lib/utils/marketEffect';
import { PENSION_BAND_KEY } from '@/lib/utils/historyComposition';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { AssetTransaction, AssetTransactionType } from '@/types/assetTransactions';
import type { PensionContribution } from '@/types/pension';

type Row = MonthlySnapshot['byAsset'][number];

const row = (assetId: string, quantity: number, price: number, totalValue: number): Row => ({ assetId, ticker: assetId, name: assetId, quantity, price, totalValue });

function snap(year: number, month: number, byAsset: Row[], totalNetWorth = byAsset.reduce((sum, r) => sum + r.totalValue, 0)): MonthlySnapshot {
  return { userId: 'u', year, month, totalNetWorth, liquidNetWorth: totalNetWorth, illiquidNetWorth: 0, byAssetClass: {}, byAsset, assetAllocation: {}, createdAt: new Date(year, month - 1, 28, 12) } as MonthlySnapshot;
}

let seq = 0;
function flow(type: Expense['type'], amount: number, year: number, month: number, day = 5): Expense {
  seq += 1;
  return { id: `e${seq}`, userId: 'u', type, categoryId: 'c', categoryName: 'c', amount, currency: 'EUR', date: new Date(year, month - 1, day, 12), createdAt: new Date(), updatedAt: new Date() } as Expense;
}

function trade(assetId: string, type: AssetTransactionType, date: Date, quantity: number, priceEur: number, extra: Partial<AssetTransaction> = {}): AssetTransaction {
  seq += 1;
  return { id: `t${seq}`, userId: 'u', assetId, type, date, quantity, pricePerUnit: priceEur, priceEur, createdAt: date, updatedAt: date, ...extra } as AssetTransaction;
}

function contribution(assetId: string, amount: number, createdAt: Date): PensionContribution {
  seq += 1;
  return { id: `p${seq}`, userId: 'u', assetId, source: 'tfr', amount, date: createdAt, taxYear: createdAt.getFullYear(), deductible: false, createdAt } as PensionContribution;
}

// The pension fund is a 60/40 composite: its market must still land in Previdenza, never in Azioni.
const ASSETS = [
  { id: 'vwce', name: 'VWCE', ticker: 'VWCE', type: 'etf', assetClass: 'equity', taxRate: 26 },
  { id: 'copper', name: 'Copper', ticker: 'COPA', type: 'etf', assetClass: 'commodity', taxRate: 26 },
  { id: 'cash', name: 'Conto', type: 'cash', assetClass: 'cash' },
  { id: 'house', name: 'Casa', type: 'realestate', assetClass: 'realestate' },
  { id: 'fund', name: 'Fondo', type: 'pensionFund', assetClass: 'equity', composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }] },
] as unknown as Asset[];

const AUGUST = snap(2026, 8, [row('vwce', 10, 100, 1000), row('cash', 500, 1, 500), row('house', 1, 100000, 40000), row('fund', 2000, 1, 2000)]);
const SEPTEMBER = snap(2026, 9, [row('vwce', 0, 120, 0), row('copper', 5, 104, 520), row('cash', 1343, 1, 1343), row('house', 1, 100000, 40500), row('fund', 2150, 1, 2150)]);

const LEDGER = [
  trade('vwce', 'buy', new Date(2026, 0, 10, 12), 10, 50),
  trade('vwce', 'sell', new Date(2026, 8, 2, 12), 10, 120),
  trade('copper', 'buy', new Date(2026, 8, 3, 12), 5, 100),
];

function context(overrides: Partial<GrowthDriverContext> = {}): GrowthDriverContext {
  return {
    expenses: [flow('income', 1000, 2026, 9, 5), flow('fixed', -700, 2026, 9, 6), flow('fixed', -400, 2026, 9, 25)],
    transactions: LEDGER,
    assets: ASSETS,
    pension: { contributions: [contribution('fund', 100, new Date(2026, 8, 10, 12))], startMonth: '2026-01' },
    today: new Date(2026, 8, 19, 12),
    ...overrides,
  };
}

describe('tradedMoney', () => {
  it('nets buys (with fees) against sells (net of fees), and ignores a migration baseline', () => {
    const trades = [
      trade('a', 'buy', new Date(2026, 8, 1), 2, 100, { fees: 3 }),
      trade('a', 'sell', new Date(2026, 8, 2), 1, 110, { fees: 2 }),
      trade('a', 'buy', new Date(2026, 8, 3), 5, 100, { isBaseline: true }),
    ];
    // In: 2 × 100 + 3 = 203; out: 1 × 110 − 2 = 108 ⇒ 95 in, one quote.
    expect(tradedMoney(trades)).toEqual({ moneyIn: 95, quantity: 1 });
    expect(tradedMoney([trades[2]])).toBeNull();
  });
});

describe('measureAssets — the Driver per instrument', () => {
  it('splits the month per instrument and sums to the Driver’s own market', () => {
    const meter = createGrowthDriverMeter(context());
    const moves = meter.measureAssets(AUGUST, SEPTEMBER)!;
    // VWCE sold 10 at 120 held at 100: +200 of market, 1200 taken out.
    expect(moves.get('vwce')).toEqual({ market: 200, traded: -1200, paidIn: 0, valueChange: -1000 });
    // Copper bought 5 at 100, worth 104: +20 of market, 500 put in.
    expect(moves.get('copper')).toEqual({ market: 20, traded: 500, paidIn: 0, valueChange: 520 });
    // The fund: 2150 − 2000 − 100 paid in = +50.
    expect(moves.get('fund')).toEqual({ market: 50, traded: 0, paidIn: 100, valueChange: 150 });
    // Cash and the house (gross of debt) have no market; their change is flows.
    expect(moves.get('cash')?.market).toBe(0);
    expect(moves.get('house')).toEqual({ market: 0, traded: 0, paidIn: 0, valueChange: 500 });

    const total = [...moves.values()].reduce((sum, move) => sum + move.market, 0);
    const [september] = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context());
    expect(total).toBeCloseTo(september.market, 9);
  });

  it('is null when a snapshot has no per-instrument detail', () => {
    const meter = createGrowthDriverMeter(context());
    expect(meter.measureAssets(snap(2026, 8, [], 44000), SEPTEMBER)).toBeNull();
  });
});

describe('sumByMarketBand — the Panoramica’s grouping', () => {
  it('puts a pension fund in its own band, splits a composite, keeps the rest in its class', () => {
    const composite = { id: 'mix', type: 'etf', assetClass: 'equity', composition: [{ assetClass: 'equity', percentage: 70 }, { assetClass: 'bonds', percentage: 30 }] } as unknown as Asset;
    const bands = sumByMarketBand([...ASSETS, composite], (id) => ({ vwce: 10, fund: 5, mix: 100 } as Record<string, number>)[id]);
    expect(Object.fromEntries(bands)).toEqual({ equity: 80, [PENSION_BAND_KEY]: 5, bonds: 30 });
  });
});

describe('measureEmailDrivers', () => {
  it('gives the Driver of the window and the class moves, market apart from the money moved', () => {
    const measured = measureEmailDrivers([SEPTEMBER, AUGUST], context())!;
    expect(measured.drivers.market).toBeCloseTo(270, 6);
    expect(measured.drivers.isMarketMeasured).toBe(true);

    const rows = measured.classMoves!.rows;
    // Largest market first; cash and the house (no market) close the list by their change.
    expect(rows.map((r) => r.label)).toEqual(['Azioni', 'Previdenza', 'Materie Prime', 'Liquidità', 'Immobili']);
    expect(rows[0]).toMatchObject({ market: 200, traded: -1200, valueChange: -1000, other: 0 });
    expect(rows[1]).toMatchObject({ band: PENSION_BAND_KEY, market: 50, paidIn: 100, other: 0 });
    // Cash: 500 → 1343 with no market and no trade of its own — deposits, the sale's proceeds.
    expect(rows[3]).toMatchObject({ market: 0, traded: 0, other: 843 });
    expect(measured.classMoves!.unassigned).toBeNull();
  });

  it('sums a quarter over its months, and drops the class moves when one month is not measured', () => {
    const july = snap(2026, 7, [row('vwce', 10, 90, 900), row('cash', 500, 1, 500), row('house', 1, 100000, 40000), row('fund', 2000, 1, 2000)]);
    const measured = measureEmailDrivers([july, AUGUST, SEPTEMBER], context())!;
    // July → August: VWCE 10 × (100 − 90) = +100 more market.
    expect(measured.drivers.market).toBeCloseTo(370, 6);
    expect(measured.classMoves!.rows.find((r) => r.band === 'equity')?.market).toBeCloseTo(300, 6);

    const legacyJuly = snap(2026, 7, [], 43400);
    const partial = measureEmailDrivers([legacyJuly, AUGUST, SEPTEMBER], context())!;
    expect(partial.drivers.isMarketMeasured).toBe(false);
    expect(partial.classMoves).toBeNull();
  });

  it('is null without two snapshots', () => {
    expect(measureEmailDrivers([SEPTEMBER], context())).toBeNull();
  });

  it('keeps an instrument deleted since then out of the bands, and says how much', () => {
    const measured = measureEmailDrivers([AUGUST, SEPTEMBER], context({ assets: ASSETS.filter((a) => a.id !== 'copper') }))!;
    expect(measured.classMoves!.unassigned).toEqual({ market: 20, traded: 500, paidIn: 0, valueChange: 520 });
  });
});

describe('buildEmailClassMoves', () => {
  it('drops a band whose every figure is under a euro', () => {
    const moves = new Map([['cash', { market: 0, traded: 0, paidIn: 0, valueChange: 0.4 }]]);
    expect(buildEmailClassMoves(ASSETS, moves).rows).toEqual([]);
  });
});

describe('summarizeTradesByInstrument', () => {
  it('lists the window’s trades per instrument, the tax of the sale beside it', () => {
    const trades = summarizeTradesByInstrument({
      assets: ASSETS,
      trades: [...LEDGER, trade('copper', 'buy', new Date(2026, 9, 1, 12), 1, 100)],
      months: { from: { year: 2026, month: 9 }, to: { year: 2026, month: 9 } },
      sales: { proceeds: 1200, realizedGain: 700, estimatedTax: 182, instruments: [{ id: 'vwce', name: 'VWCE', proceeds: 1200, realizedGain: 700, estimatedTax: 182 }], brokenLedgers: 0 },
    });
    // January's buy and October's are outside the window.
    expect(trades).toEqual([
      { assetId: 'vwce', name: 'VWCE', buys: 0, sells: 1, boughtQuantity: 0, soldQuantity: 10, invested: 0, proceeds: 1200, estimatedTax: 182, legs: expect.any(Array), leverageRatio: 1 },
      { assetId: 'copper', name: 'COPA', buys: 1, sells: 0, boughtQuantity: 5, soldQuantity: 0, invested: 500, proceeds: 0, estimatedTax: null, legs: expect.any(Array), leverageRatio: 1 },
    ]);
  });
});

describe('resolveAssetLegs', () => {
  it('names a plain asset by its class and sleeve, a composite by its legs', () => {
    expect(resolveAssetLegs({ assetClass: 'equity', subCategory: 'Momentum' } as Asset)).toEqual([{ assetClass: 'equity', percentage: 100, subCategory: 'Momentum' }]);
    expect(resolveAssetLegs(ASSETS[4])).toEqual([{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }]);
    expect(resolveAssetLegs(undefined)).toEqual([]);
  });
});

describe('summarizeEmailAllocation', () => {
  const asset = (id: string, overrides: Partial<Asset>): Asset =>
    ({ id, userId: 'u', ticker: id, name: id, type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 1, currentPrice: 1, lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), ...overrides }) as Asset;

  const assets = [
    asset('etf', { assetClass: 'equity' }),
    asset('bond', { assetClass: 'bonds' }),
    asset('gold', { assetClass: 'commodity' }),
    asset('fund', { type: 'pensionFund', assetClass: 'bonds', allocationRole: 'frozen' }),
    asset('house', { type: 'realestate', assetClass: 'realestate', allocationRole: 'excluded' }),
  ];
  const snapshot = {
    byAsset: [
      row('etf', 10, 700, 7000),
      row('bond', 1, 1500, 1500),
      row('gold', 1, 1230, 1230),
      row('fund', 1, 300, 300),
      row('house', 1, 200000, 200000),
    ],
  };
  const targets = { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 30 }, commodity: { targetPercentage: 10 } };

  it('measures the allocated base (frozen in, excluded out) against the effective targets, on the 5/25 band', () => {
    const summary = summarizeEmailAllocation({ assets, snapshot, targets, fromGoals: false })!;
    // Base: 7000 + 1500 + 1230 + 300 = 10.030; the house is out.
    expect(summary.marketValue).toBe(10030);
    expect(summary.excluded.total).toBe(200000);
    expect(summary.frozen.total).toBe(300);
    const byClass = Object.fromEntries(summary.classes.map((gap) => [gap.assetClass, gap]));
    // Equity 69,8% vs 60%: +9,8 pp > 5 ⇒ off. Bonds 17,9% vs 30% ⇒ off. Gold 12,3% vs 10%: +2,3 pp,
    // inside 25% of 10 = 2,5 pp ⇒ in line — the page's ±2 band would call it off.
    expect(byClass.equity.action).toBe('VENDI');
    expect(byClass.bonds.action).toBe('COMPRA');
    expect(byClass.commodity.action).toBe('OK');
    expect(summary.offTarget.map((gap) => gap.assetClass)).toEqual(['bonds', 'equity']);
  });

  it('is null when the snapshot has no per-instrument detail', () => {
    expect(summarizeEmailAllocation({ assets, snapshot: { byAsset: [] }, targets, fromGoals: false })).toBeNull();
  });
});

describe('resolveEmailPeriodReturn', () => {
  it('states a month’s return as the month’s, like Rendimenti’s hero', () => {
    // 12,68% a year over one month ⇒ (1,1268)^(1/12) − 1 ≈ 1,0%.
    const result = resolveEmailPeriodReturn({ timeWeightedReturn: 12.68, numberOfMonths: 1, hasInsufficientData: false }, 'Base: portafoglio gestito.');
    expect(result?.label).toBe('nel mese');
    expect(result?.value).toBeCloseTo(1.0, 1);
    expect(result?.baseLabel).toBe('Base: portafoglio gestito.');
  });

  it('is null when the window cannot be measured', () => {
    expect(resolveEmailPeriodReturn({ timeWeightedReturn: null, numberOfMonths: 0, hasInsufficientData: true }, 'x')).toBeNull();
    expect(resolveEmailPeriodReturn({ timeWeightedReturn: null, numberOfMonths: 1, hasInsufficientData: false }, 'x')).toBeNull();
  });
});
