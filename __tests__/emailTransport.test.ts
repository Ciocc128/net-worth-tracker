/**
 * CS5 (part) — the mail transport needs BOTH variables and has no sender fallback
 * (doc/cron-serale/README.md § 5.6, D-CS4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock }; } }));

import { isEmailTransportConfigured, sendEmail, EmailTransportNotConfiguredError } from '@/lib/server/emailTransport';

afterEach(() => {
  vi.unstubAllEnvs();
  sendMock.mockReset();
});

describe('isEmailTransportConfigured', () => {
  it.each([
    ['the key only', 're_test', ''],
    ['the sender only', '', 'noreply@fenicottero.example'],
    ['neither', '', ''],
    ['blanks', '  ', '  '],
  ])('is false with %s', (_label, key, from) => {
    vi.stubEnv('RESEND_API_KEY', key);
    vi.stubEnv('RESEND_FROM_EMAIL', from);
    expect(isEmailTransportConfigured()).toBe(false);
  });

  it('is true with both', () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@fenicottero.example');
    expect(isEmailTransportConfigured()).toBe(true);
  });
});

describe('sendEmail', () => {
  it('without the sender it throws before Resend is called — no example.com fallback', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    await expect(sendEmail({ to: ['a@b.com'], subject: 's', html: '<p/>' })).rejects.toBeInstanceOf(EmailTransportNotConfiguredError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends from the configured sender', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@fenicottero.example');
    sendMock.mockResolvedValue({ data: {}, error: null });
    await sendEmail({ to: ['a@b.com'], subject: 's', html: '<p/>' });
    expect(sendMock).toHaveBeenCalledWith({ from: 'noreply@fenicottero.example', to: ['a@b.com'], subject: 's', html: '<p/>' });
  });

  it('a Resend error is thrown with its prefix', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM_EMAIL', 'noreply@fenicottero.example');
    sendMock.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    await expect(sendEmail({ to: ['a@b.com'], subject: 's', html: '<p/>' })).rejects.toThrow('Resend error: rate limited');
  });
});
