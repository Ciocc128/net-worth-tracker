/**
 * ME1–ME3 — `POST /api/user/monthly-email/send` on the helper, with a limit of sends
 * (doc/sicurezza/S2-utenti-ammessi.md RU9, D-SI16).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

const mocks = vi.hoisted(() => ({
  getSettingsAdmin: vi.fn(),
  buildAndSendForPeriod: vi.fn(),
}));

vi.mock('@/lib/server/monthlyEmailService', () => ({
  getSettingsAdmin: mocks.getSettingsAdmin,
  buildAndSendForPeriod: mocks.buildAndSendForPeriod,
  getMostRecentCompletedQuarterEnd: vi.fn(() => ({ year: 2026, month: 3 })),
  getMostRecentCompletedHalfYearEnd: vi.fn(() => ({ year: 2025, month: 12 })),
  getMostRecentCompletedYearEnd: vi.fn(() => ({ year: 2025, month: 12 })),
}));
vi.mock('@/lib/server/weeklyBudgetEmailService', () => ({ buildAndSendWeeklyBudget: vi.fn() }));

import { fake, bearer } from './helpers/adminFake';
import { POST } from '@/app/api/user/monthly-email/send/route';

const send = (uid: string) =>
  POST(new NextRequest('http://localhost/api/user/monthly-email/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bearer(uid) },
    body: JSON.stringify({ periodType: 'monthly' }),
  }));

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'owner-2', 'owner-3');
  mocks.getSettingsAdmin.mockReset().mockResolvedValue({ monthlyEmailEnabled: true, monthlyEmailRecipients: ['fenicottero@example.com'] });
  mocks.buildAndSendForPeriod.mockReset().mockResolvedValue(true);
});

describe('POST /api/user/monthly-email/send', () => {
  it('ME1 — a user the server never admitted is 403 and the builder is not called', async () => {
    const response = await send('outsider');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'account/not-allowed' });
    expect(mocks.buildAndSendForPeriod).not.toHaveBeenCalled();
  });

  it('ME2 — six sends in an hour: five reach the builder, the sixth is 429 with Retry-After', async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await send('owner-2');
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(mocks.buildAndSendForPeriod).toHaveBeenCalledTimes(5);
    expect(Number(last!.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await last!.json()).error).toBe('Hai raggiunto il limite di invii. Riprova più tardi.');
  });

  it('ME3 — a builder that throws answers 500 without the message of the error', async () => {
    mocks.buildAndSendForPeriod.mockRejectedValueOnce(new Error('Ornitorinco'));
    const response = await send('owner-3');
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Ornitorinco');
  });
});
