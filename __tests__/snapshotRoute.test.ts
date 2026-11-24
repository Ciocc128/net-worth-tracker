/**
 * POST /api/portfolio/snapshot — the automatic writer (cron and «Crea snapshot") over the in-memory
 * Admin fake. doc/snapshot-integri/README.md § 6, SR1–SR5 (SR6 stays in apiAuthRoutes.test.ts).
 *
 * «Now» is 2026-11-14 12:00 Europe/Rome; figures invented and round; decoy «Fenicottero».
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

const { updateUserAssetPricesMock } = vi.hoisted(() => ({ updateUserAssetPricesMock: vi.fn() }));
vi.mock('@/lib/helpers/priceUpdater', () => ({ updateUserAssetPrices: updateUserAssetPricesMock }));

import { fake, bearer } from './helpers/adminFake';
import { POST as snapshotRoute } from '@/app/api/portfolio/snapshot/route';
import { createPortfolioSnapshot } from '@/lib/server/portfolioSnapshot';

const NOW = new Date('2026-11-14T11:00:00.000Z'); // 12:00 in Rome
const T0 = Timestamp.fromDate(new Date('2026-11-01T18:00:00.000Z'));
const DOC = 'monthly-snapshots/owner-1-2026-11';

function post(body: Record<string, unknown>, uid?: string) {
  return snapshotRoute(
    new NextRequest('http://localhost/api/portfolio/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(uid ? bearer(uid) : {}) },
      body: JSON.stringify(body),
    })
  );
}

/** The cron's way in since C7: the function itself, no HTTP. Answers like the route did. */
const cron = async () => {
  const result = await createPortfolioSnapshot('owner-1', { writtenBy: 'cron' });
  return { status: 200, json: async () => ({ success: result.status !== 'no-assets', data: 'data' in result ? result.data : null }) };
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'member-1', 'stranger');
  updateUserAssetPricesMock.mockReset();
  updateUserAssetPricesMock.mockResolvedValue({ updated: 1, failed: [], message: 'ok', failures: [], anomalies: [] });
  fake.set('assets/asset-feni', {
    userId: 'owner-1', type: 'etf', assetClass: 'equity', ticker: 'FENI', name: 'Fenicottero',
    quantity: 50, currentPrice: 50, currency: 'EUR', lastPriceUpdate: Timestamp.fromDate(new Date('2026-11-14T10:00:00.000Z')),
  });
  fake.clearLog();
});

describe('SR1 — a closed month is refused', () => {
  it('a token, body with year 2024 and month 3: 400, no price update, zero writes', async () => {
    const response = await post({ userId: 'owner-1', year: 2024, month: 3 }, 'owner-1');
    expect(response.status).toBe(400);
    expect(updateUserAssetPricesMock).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([]);
  });
});

describe('SR2–SR3 — who and when', () => {
  it('SR2: the cron keeps the first createdAt, stamps updatedAt, writtenBy cron, no uid', async () => {
    fake.set(DOC, { userId: 'owner-1', year: 2026, month: 11, totalNetWorth: 2000, liquidNetWorth: 2000, illiquidNetWorth: 0, byAssetClass: { equity: 2000 }, byAsset: [], assetAllocation: { equity: 100 }, createdAt: T0, note: 'Fenicottero' });
    const response = await cron();
    expect(response.status).toBe(200);
    const written = fake.get(DOC)!;
    expect((written.createdAt as Timestamp).toMillis()).toBe(T0.toMillis());
    expect((written.updatedAt as Timestamp).toMillis()).toBe(NOW.getTime());
    expect(written.writtenBy).toBe('cron');
    expect(written).not.toHaveProperty('writtenByUid');
    expect(written.note).toBe('Fenicottero');
  });

  it('SR3: a token writes as the button, with its uid', async () => {
    const response = await post({ userId: 'owner-1' }, 'owner-1');
    expect(response.status).toBe(200);
    const written = fake.get(DOC)!;
    expect(written.writtenBy).toBe('button');
    expect(written.writtenByUid).toBe('owner-1');
    expect((written.createdAt as Timestamp).toMillis()).toBe(NOW.getTime());
  });
});

describe('SR4–SR5 — the price record', () => {
  it('SR4: a failed quote is recorded in the document and in the response; 200', async () => {
    updateUserAssetPricesMock.mockResolvedValue({
      updated: 0, failed: ['FENI'], message: 'x',
      failures: [{ assetId: 'asset-feni', ticker: 'FENI', reason: 'quote' }], anomalies: [],
    });
    const response = await cron();
    expect(response.status).toBe(200);
    const written = fake.get(DOC)!;
    const prices = written.prices as { status: string; failed: unknown[] };
    expect(prices.status).toBe('partial');
    expect(prices.failed).toEqual([{ assetId: 'asset-feni', ticker: 'FENI', reason: 'quote' }]);
    const payload = await response.json();
    expect(payload.data!.prices.status).toBe('partial');
  });

  it('SR5: the updater throws: status failed, the document written', async () => {
    updateUserAssetPricesMock.mockRejectedValue(new Error('Yahoo down'));
    const response = await cron();
    expect(response.status).toBe(200);
    expect((fake.get(DOC)!.prices as { status: string }).status).toBe('failed');
  });
});
