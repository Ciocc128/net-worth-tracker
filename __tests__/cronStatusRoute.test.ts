/**
 * CS9 — `GET /api/user/cron-status` (doc/cron-serale/README.md § 5.7): the caller's account only,
 * the latest run of each job, a member reads the owner's, no other uid in the body.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

import { fake, bearer } from './helpers/adminFake';
import { GET } from '@/app/api/user/cron-status/route';

const get = (uid: string, ownerId?: string) =>
  GET(new NextRequest(`http://localhost/api/user/cron-status${ownerId ? `?ownerId=${ownerId}` : ''}`, { headers: bearer(uid) }));

const finished = Timestamp.fromDate(new Date('2026-11-13T19:05:00Z'));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'owner-2', 'member-1');
  fake.set('account-access/owner-1', { memberUids: ['member-1'] });
  fake.set('cron-runs/2026-11-12_recap', { job: 'recap', date: '2026-11-12', outcome: 'ok', finishedAt: finished, phases: [], users: {} });
  fake.set('cron-runs/2026-11-13_recap', {
    job: 'recap', date: '2026-11-13', outcome: 'partial', finishedAt: finished,
    phases: [{ name: 'period-emails', status: 'failed' }, { name: 'weekly-budget', status: 'ok' }],
    users: {
      'owner-1': { deliveries: { 'monthly-2026-10': { outcome: 'failed', reason: 'email-not-configured' } } },
      'owner-2': { deliveries: { 'monthly-2026-10': { outcome: 'sent' } } },
    },
  });
  fake.set('cron-runs/2026-11-13_snapshot', { job: 'snapshot', date: '2026-11-13', outcome: 'ok', finishedAt: finished, phases: [], users: { 'owner-1': { snapshot: 'updated' }, 'owner-2': { snapshot: 'updated' } } });
  // 8 days before 14 Nov is 6 Nov: older than that is not listed.
  fake.set('cron-runs/2026-11-05_dividends', { job: 'dividends', date: '2026-11-05', outcome: 'ok', finishedAt: finished, phases: [], users: {} });
});

describe('CS9 — cron status', () => {
  it('the owner sees the latest run of each job in the last 8 days, only its own users[] entry', async () => {
    const response = await get('owner-1');
    expect(response.status).toBe(200);
    const body = await response.json();
    const recap = body.jobs.find((j: { job: string }) => j.job === 'recap');
    expect(recap).toMatchObject({ date: '2026-11-13', outcome: 'partial', failedPhases: ['period-emails'] });
    expect(recap.account.deliveries['monthly-2026-10']).toEqual({ outcome: 'failed', reason: 'email-not-configured' });
    expect(body.jobs.map((j: { job: string }) => j.job).sort()).toEqual(['recap', 'snapshot']);
  });

  it("another account's uid and entries never appear in the body", async () => {
    const text = JSON.stringify(await (await get('owner-1')).json());
    expect(text).not.toContain('owner-2');
  });

  it('a delegated member reads the owner’s; a stranger asking for it is 403', async () => {
    const member = await get('member-1', 'owner-1');
    expect(member.status).toBe(200);
    expect((await member.json()).ownerId).toBe('owner-1');
    expect((await get('owner-2', 'owner-1')).status).toBe(403);
  });
});
