/**
 * CS6 — the snapshot cron (doc/cron-serale/README.md § 5.2, § 5.5, CA9, CA10): it calls
 * `createPortfolioSnapshot` directly (no fetch, C7), updates the Hall of Fame only for a written
 * snapshot, keeps a run record per user, and answers 500 when something failed (D-CS2).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

const mocks = vi.hoisted(() => ({
  createPortfolioSnapshot: vi.fn(),
  updateHallOfFame: vi.fn(),
  verifyExpenseTotals: vi.fn(),
  refreshEcbRatesIfStale: vi.fn(),
  refreshMarketAnchorsIfStale: vi.fn(),
  evaluateActiveGoals: vi.fn(),
  captureBudgetHistory: vi.fn(),
}));
vi.mock('@/lib/server/portfolioSnapshot', () => ({ createPortfolioSnapshot: mocks.createPortfolioSnapshot }));
vi.mock('@/lib/services/hallOfFameService.server', () => ({ updateHallOfFame: mocks.updateHallOfFame }));
vi.mock('@/lib/server/expenseTotals', () => ({ verifyExpenseTotals: mocks.verifyExpenseTotals }));
vi.mock('@/lib/server/ecbRatesService', () => ({ refreshEcbRatesIfStale: mocks.refreshEcbRatesIfStale }));
vi.mock('@/lib/server/marketAnchorsService', () => ({ refreshMarketAnchorsIfStale: mocks.refreshMarketAnchorsIfStale }));
vi.mock('@/lib/server/assistant/goalEvaluationService', () => ({ evaluateActiveGoals: mocks.evaluateActiveGoals }));
vi.mock('@/lib/server/budgetHistoryService', () => ({ captureBudgetHistory: mocks.captureBudgetHistory }));

import { fake } from './helpers/adminFake';
import { GET } from '@/app/api/cron/monthly-snapshot/route';

const fetchMock = vi.fn();
const run = async (iso = '2026-11-14') => {
  vi.setSystemTime(new Date(`${iso}T18:30:00Z`));
  const response = await GET(
    new NextRequest('http://localhost/api/cron/monthly-snapshot', { headers: { authorization: 'Bearer cron-secret-test' } })
  );
  return { response, body: await response.json() };
};
const record = (iso = '2026-11-14') => fake.get(`cron-runs/${iso}_snapshot`)!;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', 'cron-secret-test');
  vi.stubGlobal('fetch', fetchMock);
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'owner-2');
  fetchMock.mockReset();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.createPortfolioSnapshot.mockResolvedValue({ status: 'updated', snapshotId: 'x' });
  mocks.verifyExpenseTotals.mockResolvedValue({ report: { changed: [], mismatched: [], missingYears: [] } });
  mocks.refreshEcbRatesIfStale.mockResolvedValue(undefined);
  mocks.refreshMarketAnchorsIfStale.mockResolvedValue(false);
  mocks.evaluateActiveGoals.mockResolvedValue({ skippedReason: 'no-goals' });
  mocks.captureBudgetHistory.mockResolvedValue({ captured: 2, skipped: 0, errors: 0 });
});

describe('CS6 — the snapshot cron', () => {
  it('CA10: every admitted user is photographed by a direct call as `cron`, with no outbound fetch', async () => {
    const { response, body } = await run();
    expect(response.status).toBe(200);
    expect(body.outcome).toBe('ok');
    expect(mocks.createPortfolioSnapshot.mock.calls.map((c) => [c[0], c[1].writtenBy])).toEqual([
      ['owner-1', 'cron'],
      ['owner-2', 'cron'],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the Hall of Fame follows a written snapshot, not an account with no assets', async () => {
    mocks.createPortfolioSnapshot.mockImplementation(async (uid: string) =>
      uid === 'owner-1' ? { status: 'created', snapshotId: 'a' } : { status: 'no-assets', snapshotId: null }
    );
    const { response } = await run();
    expect(response.status).toBe(200);
    expect(mocks.updateHallOfFame.mock.calls.map((c) => c[0])).toEqual(['owner-1']);
    const users = record().users as Record<string, { snapshot: string }>;
    expect(users['owner-1'].snapshot).toBe('created');
    expect(users['owner-2'].snapshot).toBe('no-assets');
  });

  it('one user failing: the other is photographed, the record says `failed` for that user, status 500', async () => {
    mocks.createPortfolioSnapshot.mockImplementation(async (uid: string) => {
      if (uid === 'owner-1') throw new Error('Yahoo down');
      return { status: 'updated', snapshotId: 'b' };
    });
    const { response, body } = await run();
    expect(response.status).toBe(500);
    expect(body.outcome).toBe('partial');
    const users = record().users as Record<string, { snapshot: string }>;
    expect(users['owner-1'].snapshot).toBe('failed');
    expect(users['owner-2'].snapshot).toBe('updated');
    expect(mocks.updateHallOfFame.mock.calls.map((c) => c[0])).toEqual(['owner-2']);
  });

  it('CA9: an ECB fetch that throws leaves goals and budget history written, outcome partial, status 500', async () => {
    mocks.refreshEcbRatesIfStale.mockRejectedValue(new Error('ECB down'));
    const { response } = await run();
    expect(response.status).toBe(500);
    expect(mocks.evaluateActiveGoals).toHaveBeenCalledTimes(2);
    expect(mocks.captureBudgetHistory).toHaveBeenCalledTimes(1);
    const phases = record().phases as Array<{ name: string; status: string; error?: string }>;
    expect(phases.find((p) => p.name === 'ecb-rates')).toMatchObject({ status: 'failed', error: 'ECB down' });
    expect(phases.find((p) => p.name === 'budget-history')).toMatchObject({ status: 'ok' });
  });

  it('a second invocation the same day overwrites the record and counts', async () => {
    await run();
    await run();
    expect(record().invocations).toBe(2);
  });

  it('records older than 90 days are deleted; younger ones stay', async () => {
    // 2026-11-14 minus 90 days is 2026-08-16: the cutoff is exclusive.
    fake.set('cron-runs/2026-08-15_snapshot', { job: 'snapshot', date: '2026-08-15' });
    fake.set('cron-runs/2026-08-16_snapshot', { job: 'snapshot', date: '2026-08-16' });
    await run();
    expect(fake.get('cron-runs/2026-08-15_snapshot')).toBeUndefined();
    expect(fake.get('cron-runs/2026-08-16_snapshot')).toBeDefined();
  });
});
