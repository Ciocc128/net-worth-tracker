/**
 * lib/helpers/priceUpdater.ts — what the refresh says happened (doc/snapshot-integri/README.md
 * § 5.6, RI11–RI12; § 6 PU1–PU3; CA2 b). Over the in-memory Admin fake; figures invented and round.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

const { getMultipleQuotesMock, getQuoteMock, convertToEurMock, getBondPriceByIsinMock } = vi.hoisted(() => ({
  getMultipleQuotesMock: vi.fn(),
  getQuoteMock: vi.fn(),
  convertToEurMock: vi.fn(),
  getBondPriceByIsinMock: vi.fn(),
}));
vi.mock('@/lib/services/yahooFinanceService', async () => {
  const { hasMarketPrice } = await import('@/lib/utils/assetPricing');
  return { getMultipleQuotes: getMultipleQuotesMock, getQuote: getQuoteMock, shouldUpdatePrice: hasMarketPrice };
});
vi.mock('@/lib/services/currencyConversionService', () => ({ convertToEur: convertToEurMock }));
vi.mock('@/lib/services/borsaItalianaBondScraperService', () => ({ getBondPriceByIsin: getBondPriceByIsinMock }));

import { fake } from './helpers/adminFake';
import { detectPriceJump, updateUserAssetPrices } from '@/lib/helpers/priceUpdater';

const NOW = new Date('2026-11-14T11:00:00.000Z');
const daysAgo = (n: number) => Timestamp.fromDate(new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000));

function seed(ticker: string, extra: Record<string, unknown> = {}) {
  fake.set(`assets/${ticker.toLowerCase()}`, {
    userId: 'owner-1', type: 'etf', assetClass: 'equity', ticker, name: 'Fenicottero',
    quantity: 10, currentPrice: 100, currency: 'EUR', lastPriceUpdate: daysAgo(2), ...extra,
  });
}

const quotes = (entries: Record<string, { price: number | null; currency?: string }>) =>
  new Map(Object.entries(entries).map(([ticker, q]) => [ticker, { price: q.price, currency: q.currency ?? 'EUR' }]));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe('PU1 — a jump is written and recorded (CA2 b)', () => {
  it('stored 100 two days ago: 131 is +31%, 129 is nothing, 1 (a GBp quote ÷100 gone wrong) is −99%', async () => {
    seed('AAA');
    seed('BBB');
    seed('CCC', { currency: 'GBP' });
    getMultipleQuotesMock.mockResolvedValue(quotes({ AAA: { price: 131 }, BBB: { price: 129 }, CCC: { price: 100, currency: 'GBp' } }));
    convertToEurMock.mockResolvedValue(1.2);

    const result = await updateUserAssetPrices('owner-1');

    expect(result.anomalies.map((a) => [a.ticker, Math.round(a.changePct)])).toEqual([['AAA', 31], ['CCC', -99]]);
    expect(fake.get('assets/aaa')!.currentPrice).toBe(131);
    expect(fake.get('assets/bbb')!.currentPrice).toBe(129);
    expect(fake.get('assets/ccc')!.currentPrice).toBe(1);
    expect(result.failures).toEqual([]);
  });
});

describe('PU2 — no baseline, no anomaly', () => {
  it('stored 100 ten days ago, quote 200', () => {
    const asset = { id: 'a', ticker: 'AAA', currentPrice: 100, currency: 'EUR', lastPriceUpdate: daysAgo(10).toDate() };
    expect(detectPriceJump(asset, 200, 'EUR', NOW)).toBeNull();
  });

  it('stored in USD, quote in EUR', () => {
    const asset = { id: 'a', ticker: 'AAA', currentPrice: 100, currency: 'USD', lastPriceUpdate: daysAgo(1).toDate() };
    expect(detectPriceJump(asset, 200, 'EUR', NOW)).toBeNull();
  });

  it('a bond compares in euro per unit, whatever the quote currency', () => {
    const asset = { id: 'b', ticker: 'BTP', currentPrice: 1000, currency: 'EUR', lastPriceUpdate: daysAgo(1).toDate() };
    expect(detectPriceJump(asset, 1500, undefined, NOW)?.changePct).toBe(50);
  });
});

describe('PU3 — the three reasons', () => {
  it('no quote → quote; convertToEur throws → fx (price written); the update throws → write', async () => {
    seed('NOQ');
    seed('USD1', { currency: 'USD' });
    seed('BOND', { type: 'bond', assetClass: 'bonds', isin: 'IT0005083057' });
    getMultipleQuotesMock.mockResolvedValue(quotes({ NOQ: { price: null }, USD1: { price: 100, currency: 'USD' } }));
    convertToEurMock.mockRejectedValue(new Error('Frankfurter down'));
    // The bond's document vanishes between the read and the write: the update throws.
    getBondPriceByIsinMock.mockImplementation(async () => {
      fake.docs.delete('assets/bond');
      return { price: 100, priceType: 'last' };
    });

    const result = await updateUserAssetPrices('owner-1');

    expect(result.failures).toEqual(
      expect.arrayContaining([
        { assetId: 'noq', ticker: 'NOQ', reason: 'quote' },
        { assetId: 'usd1', ticker: 'USD1', reason: 'fx' },
        { assetId: 'bond', ticker: 'BOND', reason: 'write' },
      ])
    );
    expect(result.failures).toHaveLength(3);
    // `failed` keeps its meaning for /api/prices/update: the prices NOT written.
    expect(result.failed.sort()).toEqual(['BOND', 'NOQ']);
    expect(fake.get('assets/usd1')!.currentPrice).toBe(100);
  });
});
