/**
 * CR1 — the two crons walk the ADMITTED users, never `users` (doc/sicurezza/S2-utenti-ammessi.md
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
  evaluateActiveGoals: vi.fn(async () => ({ skippedReason: 'no-goals' })),
}));

vi.mock('@/lib/server/dividendProcessor', () => ({
  COUPON_CATCHUP_LOOKBACK_DAYS: 7,
  runDividendScraping: mocks.runDividendScraping,
  runExpenseCreation: mocks.runExpenseCreation,
  runNextCouponScheduling: mocks.runNextCouponScheduling,
}));
vi.mock('@/lib/services/hallOfFameService.server', () => ({ updateHallOfFame: vi.fn() }));
vi.mock('@/lib/server/monthlyEmailService', () => ({
  isLastDayOfMonthItaly: vi.fn(() => false),
  isLastDayOfQuarterItaly: vi.fn(() => false),
  isLastDayOfHalfYearItaly: vi.fn(() => false),
  isLastDayOfYearItaly: vi.fn(() => false),
  monthToQuarter: vi.fn(),
  monthToSemester: vi.fn(),
  getSettingsAdmin: vi.fn(),
  buildAndSendForPeriod: vi.fn(),
  buildAndSendQuarterly: vi.fn(),
  buildAndSendSemiAnnual: vi.fn(),
  buildAndSendYearly: vi.fn(),
}));
vi.mock('@/lib/server/ecbRatesService', () => ({ refreshEcbRatesIfStale: vi.fn() }));
vi.mock('@/lib/server/marketAnchorsService', () => ({ refreshMarketAnchorsIfStale: vi.fn(async () => false) }));
vi.mock('@/lib/server/weeklyBudgetEmailService', () => ({
  isWeeklyBudgetDayItaly: vi.fn(() => false),
  buildAndSendWeeklyBudget: vi.fn(),
}));
vi.mock('@/lib/server/assistant/goalEvaluationService', () => ({ evaluateActiveGoals: mocks.evaluateActiveGoals }));
vi.mock('@/lib/server/budgetHistoryService', () => ({ captureBudgetHistory: vi.fn(async () => ({ captured: 0 })) }));
vi.mock('@/lib/server/wiki/githubVault', () => ({ createVaultClient: vi.fn(), readVaultConfig: vi.fn(() => null) }));
vi.mock('@/lib/server/wiki/thebullCompiler', () => ({ retryPendingTheBull: vi.fn() }));
vi.mock('@/lib/server/wiki/vaultExport', () => ({ exportToVault: vi.fn() }));

import { fake } from './helpers/adminFake';

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, snapshotId: 's-1' })));

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

    const snapshotBodies = fetchMock.mock.calls
      .filter((call) => String(call[0]).endsWith('/api/portfolio/snapshot'))
      .map((call) => JSON.parse(String((call[1] as RequestInit).body)).userId);
    expect(snapshotBodies).toEqual(['owner-1']);
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
