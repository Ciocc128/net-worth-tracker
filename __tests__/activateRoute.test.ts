/**
 * AC1–AC5 — `POST /api/auth/activate` (doc/sicurezza/S2-utenti-ammessi.md RU2, D-SI11): the token
 * is verified WITHOUT the list, the policy judges the TOKEN's email, and only an allowed email is
 * written into `allowed-users` with `source: 'registration'`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

import { adminAuth, fake, bearer } from './helpers/adminFake';
import { POST } from '@/app/api/auth/activate/route';

const call = (headers: Record<string, string> = {}, body?: unknown) =>
  POST(new NextRequest('http://localhost/api/auth/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }));

/** The policy of registrationPolicy.ts with a whitelist naming only `whitelisted`. */
function whitelistOnly(...whitelisted: string[]) {
  vi.stubEnv('NEXT_PUBLIC_REGISTRATIONS_ENABLED', 'false');
  vi.stubEnv('NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED', 'true');
  vi.stubEnv('REGISTRATION_WHITELIST', whitelisted.join(','));
}

beforeEach(() => {
  fake.reset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/auth/activate', () => {
  it('AC1 — an outsider whose email the policy allows is admitted', async () => {
    whitelistOnly('outsider@example.com');
    const response = await call(bearer('outsider'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ allowed: true });
    expect(fake.get('allowed-users/outsider')).toMatchObject({ uid: 'outsider', email: 'outsider@example.com', source: 'registration' });
  });

  it('AC2 — an email the policy refuses is 403 registration/not-allowed, nothing written', async () => {
    whitelistOnly('fenicottero@example.com');
    const response = await call(bearer('outsider'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ allowed: false, code: 'registration/not-allowed' });
    expect(fake.writes).toEqual([]);
  });

  it('AC2 — with registrations off and no whitelist nobody is admitted', async () => {
    vi.stubEnv('NEXT_PUBLIC_REGISTRATIONS_ENABLED', 'false');
    const response = await call(bearer('outsider'));
    expect(response.status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  it('AC3 — an admitted user gets 200 and nothing is written', async () => {
    whitelistOnly();
    fake.allow('owner-1');
    fake.clearLog();
    const response = await call(bearer('owner-1'));
    expect(response.status).toBe(200);
    expect(fake.writes).toEqual([]);
  });

  it('AC4 — no token is 401; a token without email is 403', async () => {
    whitelistOnly('outsider@example.com');
    expect((await call()).status).toBe(401);

    vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValueOnce({ uid: 'outsider' } as never);
    const response = await call(bearer('outsider'));
    expect(response.status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  it('AC5 — the body is ignored: the decision is on the token’s email', async () => {
    whitelistOnly('owner@example.com');
    const response = await call(bearer('outsider'), { email: 'owner@example.com' });
    expect(response.status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  // doc/essenziale/README.md § 5.2, D-ES3, acceptance 3: the FIRST admission starts the viewer in Essenziale.
  it('ES1 — a new uid is admitted in the Essenziale view', async () => {
    whitelistOnly('outsider@example.com');
    await call(bearer('outsider'));
    expect(fake.get('userPreferences/outsider')).toEqual({ viewPreset: 'essenziale' });
  });

  it('ES1 — the view the viewer already chose is kept, the theme beside it too', async () => {
    whitelistOnly('outsider@example.com');
    fake.set('userPreferences/outsider', { viewPreset: 'completa', colorTheme: 'graphite' });
    await call(bearer('outsider'));
    expect(fake.get('userPreferences/outsider')).toEqual({ viewPreset: 'completa', colorTheme: 'graphite' });
  });

  it('ES1 — preferences without a view get it, merged beside the theme', async () => {
    whitelistOnly('outsider@example.com');
    fake.set('userPreferences/outsider', { colorTheme: 'graphite' });
    await call(bearer('outsider'));
    expect(fake.get('userPreferences/outsider')).toEqual({ colorTheme: 'graphite', viewPreset: 'essenziale' });
  });

  it('ES1 — an uid already admitted gets no view (who was here stays in Completa)', async () => {
    whitelistOnly();
    fake.allow('owner-1');
    await call(bearer('owner-1'));
    expect(fake.get('userPreferences/owner-1')).toBeUndefined();
  });
});
