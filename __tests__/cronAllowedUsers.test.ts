/**
 * CR1 — the crons walk the ADMITTED users, never `users` (doc/sicurezza/S2-utenti-ammessi.md
 * RU5, D-SI14). `users` holds `owner-1` and `outsider`; `allowed-users` only `owner-1`: the
 * snapshot is asked once, for `owner-1`, and the three dividend phases receive only `owner-1`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

const mocks = vi.hoisted(() => ({
  runDividendScraping: vi.fn(async () => ({ assetsScraped: 0, newDividends: 0, errors: 0 })),
  runExpenseCreation: vi.fn(async () => ({ processedCount: 0, errorCount: 0 })),
  runNextCouponScheduling: vi.fn(async () => ({ scheduled: 0, skipped: 0, errors: 0 })),
  createPortfolioSnapshot: vi.fn<(userId: string, options: unknown) => Promise<{ status: string; snapshotId: string }>>(async () => ({ status: 'updated', snapshotId: 's-1' })),
  evaluateActiveGoals: vi.fn<(userId: string) => Promise<{ skippedReason: string }>>(async () => ({ skippedReason: 'no-goals' })),
}));

vi.mock('@/lib/server/dividendProcessor', () => ({
  COUPON_CATCHUP_LOOKBACK_DAYS: 7,
  runDividendScraping: mocks.runDividendScraping,
  runExpenseCreation: mocks.runExpenseCreation,
  runNextCouponScheduling: mocks.runNextCouponScheduling,
}));
vi.mock('@/lib/services/hallOfFameService.server', () => ({ updateHallOfFame: vi.fn() }));
// C7: the snapshot is a function the cron calls, not a route it fetches.
vi.mock('@/lib/server/portfolioSnapshot', () => ({ createPortfolioSnapshot: mocks.createPortfolioSnapshot }));
vi.mock('@/lib/server/ecbRatesService', () => ({ refreshEcbRatesIfStale: vi.fn() }));
vi.mock('@/lib/server/marketAnchorsService', () => ({ refreshMarketAnchorsIfStale: vi.fn(async () => false) }));
vi.mock('@/lib/server/assistant/goalEvaluationService', () => ({ evaluateActiveGoals: mocks.evaluateActiveGoals }));
vi.mock('@/lib/server/budgetHistoryService', () => ({ captureBudgetHistory: vi.fn(async () => ({ captured: 0 })) }));

import { fake } from './helpers/adminFake';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response('{}'));

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CRON_SECRET', 'cron-secret-test');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  fake.set('users/owner-1', { email: 'owner-1@example.com', displayName: 'Fenicottero' });
  fake.set('users/outsider', { email: 'outsider@example.com', displayName: 'Ornitorinco' });
  fake.allow('owner-1');
  fetchMock.mockClear();
  mocks.createPortfolioSnapshot.mockClear();
  mocks.runDividendScraping.mockClear();
  mocks.runExpenseCreation.mockClear();
  mocks.runNextCouponScheduling.mockClear();
  mocks.evaluateActiveGoals.mockClear();
});

const cronRequest = (route: string) =>
  new NextRequest(`http://localhost/api/cron/${route}`, { headers: { authorization: 'Bearer cron-secret-test' } });

const idsOf = (call: unknown[]) => (call[0] as Array<{ id: string }>).map((doc) => doc.id);

describe('CR1 — the crons process only the admitted users', () => {
  it('monthly-snapshot asks the snapshot once, for owner-1', async () => {
    const { GET } = await import('@/app/api/cron/monthly-snapshot/route');
    const response = await GET(cronRequest('monthly-snapshot'));
    expect(response.status).toBe(200);

    expect(mocks.createPortfolioSnapshot.mock.calls.map((call) => call[0])).toEqual(['owner-1']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.evaluateActiveGoals.mock.calls.map((call) => call[0])).toEqual(['owner-1']);
  }, 60_000);

  it('daily-dividend-processing hands only owner-1 to its three phases', async () => {
    const { GET } = await import('@/app/api/cron/daily-dividend-processing/route');
    const response = await GET(cronRequest('daily-dividend-processing'));
    expect(response.status).toBe(200);

    expect(idsOf(mocks.runDividendScraping.mock.calls[0])).toEqual(['owner-1']);
    expect(idsOf(mocks.runExpenseCreation.mock.calls[0])).toEqual(['owner-1']);
    expect(idsOf(mocks.runNextCouponScheduling.mock.calls[0])).toEqual(['owner-1']);
  }, 60_000);
});
