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
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@fenicottero.example');
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

  // CS5 (D-CS4): without the transport the answer is 503 BEFORE the rate limit and the builder, so no
  // AI comment is paid for an email that cannot leave.
  it('CS5 — no mail transport: 503, builder not called, the limit untouched', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await send('owner-1')).status);
    expect(statuses).toEqual([503, 503, 503, 503, 503, 503, 503]);
    expect(mocks.buildAndSendForPeriod).not.toHaveBeenCalled();
    const response = await send('owner-1');
    expect((await response.json()).error).toBe("L'invio delle email non è configurato sul server.");
  });

  // CS12 (D-CS9): the manual send honours the allowlist too.
  it('CS12 — an allowlist without the user’s address: 400, builder not called', async () => {
    vi.stubEnv('EMAIL_RECIPIENT_ALLOWLIST', 'altro@example.com');
    const response = await send('owner-1');
    expect(response.status).toBe(400);
    expect(mocks.buildAndSendForPeriod).not.toHaveBeenCalled();
  });
});
