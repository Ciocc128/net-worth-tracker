/**
 * CS2, CS3, CS5 — the recap cron (doc/cron-serale/README.md § 5.3–5.6, CA1–CA6, CA9) with the
 * builders faked and the clock fixed. The delivery record and the run record are the real ones, over
 * the in-memory Admin fake. Names and figures are invented.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

const mocks = vi.hoisted(() => ({
  getSettingsAdmin: vi.fn(),
  buildAndSendForPeriod: vi.fn(),
  buildAndSendWeeklyBudget: vi.fn(),
  readVaultConfig: vi.fn(),
  retryPendingTheBull: vi.fn(),
  exportToVault: vi.fn(),
  aiCalls: { count: 0 },
}));

vi.mock('@/lib/server/monthlyEmailService', () => ({
  getSettingsAdmin: mocks.getSettingsAdmin,
  buildAndSendForPeriod: mocks.buildAndSendForPeriod,
}));
vi.mock('@/lib/server/weeklyBudgetEmailService', () => ({ buildAndSendWeeklyBudget: mocks.buildAndSendWeeklyBudget }));
vi.mock('@/lib/server/wiki/githubVault', () => ({ createVaultClient: vi.fn(() => ({})), readVaultConfig: mocks.readVaultConfig }));
vi.mock('@/lib/server/wiki/thebullCompiler', () => ({ retryPendingTheBull: mocks.retryPendingTheBull }));
vi.mock('@/lib/server/wiki/vaultExport', () => ({ exportToVault: mocks.exportToVault }));

import { fake } from './helpers/adminFake';
import { GET } from '@/app/api/cron/period-recap/route';

const request = () =>
  new NextRequest('http://localhost/api/cron/period-recap', { headers: { authorization: 'Bearer cron-secret-test' } });

const SETTINGS = {
  monthlyEmailEnabled: true,
  quarterlyEmailEnabled: true,
  semiAnnualEmailEnabled: true,
  yearlyEmailEnabled: true,
  weeklyBudgetEmailEnabled: true,
  monthlyEmailRecipients: ['fenicottero@example.com'],
};

/** Runs the cron at 19:30 UTC of an Italian day. */
async function runAt(iso: string) {
  vi.setSystemTime(new Date(`${iso}T19:30:00Z`));
  const response = await GET(request());
  return { response, body: await response.json() };
}

/** A builder that pays one AI comment per call that has none stored, then "sends". */
function fakeBuilder() {
  mocks.buildAndSendForPeriod.mockImplementation(
    async (_uid: string, _to: string[], _type: string, _y: number, _m: number, hooks: { storedAiComment?: string | null; onAiComment?: (c: string) => Promise<void> }) => {
      if (!hooks.storedAiComment) {
        mocks.aiCalls.count++;
        await hooks.onAiComment?.('Commento ornitorinco.');
      }
      return true;
    }
  );
}

const periodsCalled = () => mocks.buildAndSendForPeriod.mock.calls.map((call) => `${call[2]} ${call[3]}-${call[4]}`).sort();
const RUN = (day: string) => `cron-runs/${day}_recap`;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1');
  vi.stubEnv('CRON_SECRET', 'cron-secret-test');
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@fenicottero.example');
  vi.stubEnv('WIKI_EXPORT_UID', '');
  mocks.aiCalls.count = 0;
  for (const mock of [mocks.getSettingsAdmin, mocks.buildAndSendForPeriod, mocks.buildAndSendWeeklyBudget, mocks.readVaultConfig, mocks.retryPendingTheBull, mocks.exportToVault]) mock.mockReset();
  mocks.getSettingsAdmin.mockResolvedValue(SETTINGS);
  mocks.buildAndSendWeeklyBudget.mockResolvedValue(true);
  mocks.readVaultConfig.mockReturnValue(null);
  fakeBuilder();
});
afterEach(() => vi.unstubAllEnvs());

describe('CS2 — which builders are called, with which period', () => {
  it('an ordinary day (Wed 11 Nov 2026): nothing is built, the run is ok', async () => {
    const { response, body } = await runAt('2026-11-11');
    expect(response.status).toBe(200);
    expect(body.outcome).toBe('ok');
    expect(mocks.buildAndSendForPeriod).not.toHaveBeenCalled();
    expect(mocks.buildAndSendWeeklyBudget).not.toHaveBeenCalled();
  });

  it('Sun 1 Nov 2026: October, and the Sunday budget week — not the quarter, still open (CA1)', async () => {
    const { response } = await runAt('2026-11-01');
    expect(response.status).toBe(200);
    expect(periodsCalled()).toEqual(['monthly 2026-10']);
    expect(mocks.buildAndSendWeeklyBudget).toHaveBeenCalledTimes(1);
    expect(fake.get('deliveries/owner-1_monthly-2026-10')).toMatchObject({ status: 'sent' });
    expect(fake.get('deliveries/owner-1_budget-week-2026-11-01')).toMatchObject({ status: 'sent' });
  });

  it('Thu 1 Oct 2026: September and the quarter Q3 (March-style quarter end)', async () => {
    await runAt('2026-10-01');
    expect(periodsCalled()).toEqual(['monthly 2026-9', 'quarterly 2026-9']);
  });

  it('Fri 1 Jan 2027: month, quarter, half and year — four emails, four AI calls (CA2)', async () => {
    await runAt('2027-01-01');
    expect(periodsCalled()).toEqual(['monthly 2026-12', 'quarterly 2026-12', 'semiannual 2026-12', 'yearly 2026-12']);
    expect(mocks.aiCalls.count).toBe(4);
  });

  it('a user with the toggle off or no recipients gets nothing and no record', async () => {
    mocks.getSettingsAdmin.mockResolvedValue({ ...SETTINGS, monthlyEmailEnabled: false });
    await runAt('2026-11-02');
    expect(mocks.buildAndSendForPeriod).not.toHaveBeenCalled();
    expect(fake.get('deliveries/owner-1_monthly-2026-10')).toBeUndefined();
  });
});

describe('CA3–CA4 — the missed 1st and the doubled delivery', () => {
  it('the 2nd with no record sends October; the 8th does not (a Sunday: only its budget week)', async () => {
    await runAt('2026-11-02');
    expect(periodsCalled()).toEqual(['monthly 2026-10']);
    mocks.buildAndSendForPeriod.mockClear();
    fake.reset();
    fake.allow('owner-1');
    await runAt('2026-11-08');
    expect(mocks.buildAndSendForPeriod).not.toHaveBeenCalled();
  });

  it('two invocations on 1 Nov: one email, one AI call, invocations = 2 (CA4)', async () => {
    await runAt('2026-11-01');
    await runAt('2026-11-01');
    expect(mocks.buildAndSendForPeriod).toHaveBeenCalledTimes(1);
    expect(mocks.aiCalls.count).toBe(1);
    expect(fake.get(RUN('2026-11-01'))!.invocations).toBe(2);
  });
});

describe('CS5 — no mail transport (CA5, UC1)', () => {
  it('records `failed: email-not-configured`, calls no builder and no model, answers 500', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    const { response, body } = await runAt('2026-11-01');
    expect(response.status).toBe(500);
    expect(body.outcome).toBe('partial');
    expect(mocks.buildAndSendForPeriod).not.toHaveBeenCalled();
    expect(mocks.aiCalls.count).toBe(0);
    expect(fake.get('deliveries/owner-1_monthly-2026-10')).toMatchObject({ status: 'failed', reason: 'email-not-configured' });
    expect((fake.get(RUN('2026-11-01'))!.users as Record<string, { deliveries: Record<string, unknown> }>)['owner-1'].deliveries['monthly-2026-10']).toEqual({ outcome: 'failed', reason: 'email-not-configured' });
  });

  it('the next day with the variable set: sent, and the one AI call is the only one paid (CA5)', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    await runAt('2026-11-01');
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@fenicottero.example');
    const { response } = await runAt('2026-11-02');
    expect(response.status).toBe(200);
    expect(fake.get('deliveries/owner-1_monthly-2026-10')).toMatchObject({ status: 'sent', attempts: 2 });
    expect(mocks.aiCalls.count).toBe(1);
  });
});

describe('CA6 — Resend fails after the comment was paid', () => {
  it('the next run sends with the stored comment: one payment over two runs', async () => {
    let first = true;
    mocks.buildAndSendForPeriod.mockImplementation(async (_u: string, _t: string[], _ty: string, _y: number, _m: number, hooks: { storedAiComment?: string | null; onAiComment?: (c: string) => Promise<void> }) => {
      if (!hooks.storedAiComment) {
        mocks.aiCalls.count++;
        await hooks.onAiComment?.('Commento pagato.');
      } else {
        expect(hooks.storedAiComment).toBe('Commento pagato.');
      }
      if (first) {
        first = false;
        throw new Error('Resend error: rate limited');
      }
      return true;
    });
    const day1 = await runAt('2026-11-01');
    expect(day1.response.status).toBe(500);
    expect(fake.get('deliveries/owner-1_monthly-2026-10')).toMatchObject({ status: 'failed', reason: 'send-failed', aiComment: 'Commento pagato.' });
    const day2 = await runAt('2026-11-02');
    expect(day2.response.status).toBe(200);
    expect(mocks.aiCalls.count).toBe(1);
    expect(fake.get('deliveries/owner-1_monthly-2026-10')).toMatchObject({ status: 'sent' });
  });
});

describe('CS3 — a phase that throws (CA9, UC7)', () => {
  it('the others run, the status is 500 and the record names the phase', async () => {
    vi.stubEnv('WIKI_EXPORT_UID', 'owner-1');
    mocks.readVaultConfig.mockReturnValue({ repo: 'x' });
    mocks.retryPendingTheBull.mockRejectedValue(new Error('GitHub down'));
    mocks.exportToVault.mockResolvedValue({ written: ['dati/2026-10.md'], skipped: [] });
    const { response, body } = await runAt('2026-11-01');
    expect(response.status).toBe(500);
    expect(body.outcome).toBe('partial');
    const phases = fake.get(RUN('2026-11-01'))!.phases as Array<{ name: string; status: string; error?: string }>;
    expect(phases.find((p) => p.name === 'thebull-retries')).toMatchObject({ status: 'failed', error: 'GitHub down' });
    expect(phases.find((p) => p.name === 'vault-export')).toMatchObject({ status: 'ok' });
    expect(phases.find((p) => p.name === 'period-emails')).toMatchObject({ status: 'ok' });
    expect(mocks.exportToVault).toHaveBeenCalledWith('owner-1', [{ year: 2026, month: 10 }], expect.anything());
  });
});

describe('the vault export through its delivery record (D-SN12)', () => {
  beforeEach(() => {
    vi.stubEnv('WIKI_EXPORT_UID', 'owner-1');
    mocks.readVaultConfig.mockReturnValue({ repo: 'x' });
    mocks.retryPendingTheBull.mockResolvedValue({ retried: 0, compiled: 0 });
    mocks.exportToVault.mockResolvedValue({ written: ['dati/2026-10.md'], skipped: [] });
  });

  it('commits once on a doubled run, and is caught up on the 2nd after a failed 1st', async () => {
    await runAt('2026-11-01');
    await runAt('2026-11-01');
    expect(mocks.exportToVault).toHaveBeenCalledTimes(1);

    fake.reset();
    fake.allow('owner-1');
    mocks.exportToVault.mockReset().mockRejectedValueOnce(new Error('conflict')).mockResolvedValue({ written: ['dati/2026-10.md'], skipped: [] });
    const first = await runAt('2026-11-01');
    expect(first.response.status).toBe(500);
    const second = await runAt('2026-11-02');
    expect(second.response.status).toBe(200);
    expect(fake.get('deliveries/owner-1_vault-2026-10')).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('is written even when the mail transport is missing', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    await runAt('2026-11-01');
    expect(mocks.exportToVault).toHaveBeenCalledTimes(1);
  });
});
