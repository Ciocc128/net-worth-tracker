/**
 * AU1–AU4 — `requireFirebaseAuth` asks for `allowed-users/{uid}` (doc/sicurezza/S2-utenti-ammessi.md
 * RU4, D-SI13): a positive answer remembered 60 s per instance, a negative one never.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

import { fake, bearer } from './helpers/adminFake';
import {
  ALLOWED_USER_MEMORY_MS,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
  resetAllowedUserMemory,
} from '@/lib/server/apiAuth';

const request = (headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/x', { headers });

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return { status: 200, body: null as unknown };
  } catch (error) {
    const response = getApiAuthErrorResponse(error);
    if (!response) throw error;
    return { status: response.status, body: await response.json() };
  }
}

beforeEach(() => {
  fake.reset();
  resetAllowedUserMemory();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requireFirebaseAuth and the list of admitted users', () => {
  it('AU1 — a valid token of an admitted user passes, with one read of allowed-users/{uid}', async () => {
    fake.allow('owner-1');
    const decoded = await requireFirebaseAuth(request(bearer('owner-1')));
    expect(decoded.uid).toBe('owner-1');
    expect(fake.reads).toEqual(['allowed-users/owner-1']);
  });

  it('AU2 — a valid token without the document is 403 with code account/not-allowed', async () => {
    const { status, body } = await statusOf(requireFirebaseAuth(request(bearer('outsider'))));
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'account/not-allowed' });
    expect(fake.writes).toEqual([]);
  });

  it('AU3 — two calls within 60 s read once; after the window, a second read; a 403 is never remembered', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
    fake.allow('owner-1');

    await requireFirebaseAuth(request(bearer('owner-1')));
    vi.advanceTimersByTime(ALLOWED_USER_MEMORY_MS - 1000);
    await requireFirebaseAuth(request(bearer('owner-1')));
    expect(fake.reads.filter((path) => path === 'allowed-users/owner-1')).toHaveLength(1);

    vi.advanceTimersByTime(2000);
    await requireFirebaseAuth(request(bearer('owner-1')));
    expect(fake.reads.filter((path) => path === 'allowed-users/owner-1')).toHaveLength(2);

    // A refusal is not remembered: the document added after it opens the next call.
    expect((await statusOf(requireFirebaseAuth(request(bearer('outsider'))))).status).toBe(403);
    fake.allow('outsider');
    expect((await statusOf(requireFirebaseAuth(request(bearer('outsider'))))).status).toBe(200);
  });

  it('AU4 — no token or a forged one is 401, and the list is not read', async () => {
    expect((await statusOf(requireFirebaseAuth(request()))).status).toBe(401);
    expect((await statusOf(requireFirebaseAuth(request({ authorization: 'Bearer forged' })))).status).toBe(401);
    expect(fake.reads).toEqual([]);
  });
});
