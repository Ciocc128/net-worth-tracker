import { describe, it, expect, vi, beforeEach } from 'vitest';

// server-only guard is a no-op in the test environment
vi.mock('server-only', () => ({}));

// Import after mocking server-only
const { isRegistrationAllowed } = await import('@/lib/server/registrationPolicy');

describe('isRegistrationAllowed', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('registrations enabled, whitelist disabled (open)', () => {
    it('allows any email', () => {
      vi.stubEnv('NEXT_PUBLIC_REGISTRATIONS_ENABLED', 'true');
      vi.stubEnv('NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED', 'false');
      vi.stubEnv('REGISTRATION_WHITELIST', '');
      expect(isRegistrationAllowed('anyone@example.com')).toBe(true);
    });
  });

  describe('registrations disabled, whitelist disabled (fully closed)', () => {
    it('blocks every email', () => {
      vi.stubEnv('NEXT_PUBLIC_REGISTRATIONS_ENABLED', 'false');
      vi.stubEnv('NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED', 'false');
      vi.stubEnv('REGISTRATION_WHITELIST', 'allowed@example.com');
      expect(isRegistrationAllowed('allowed@example.com')).toBe(false);
    });
  });

  describe('whitelist enabled', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_REGISTRATIONS_ENABLED', 'true');
      vi.stubEnv('NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED', 'true');
      vi.stubEnv('REGISTRATION_WHITELIST', 'alice@example.com,bob@example.com');
    });

    it('allows an email that is in the list', () => {
      expect(isRegistrationAllowed('alice@example.com')).toBe(true);
    });

    it('blocks an email that is not in the list', () => {
      expect(isRegistrationAllowed('charlie@example.com')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isRegistrationAllowed('ALICE@EXAMPLE.COM')).toBe(true);
      expect(isRegistrationAllowed('Bob@Example.Com')).toBe(true);
    });
  });

  describe('registrations disabled, whitelist enabled', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_REGISTRATIONS_ENABLED', 'false');
      vi.stubEnv('NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED', 'true');
      vi.stubEnv('REGISTRATION_WHITELIST', 'alice@example.com');
    });

    it('allows a whitelisted email even when registrations are globally disabled', () => {
      expect(isRegistrationAllowed('alice@example.com')).toBe(true);
    });

    it('blocks a non-whitelisted email', () => {
      expect(isRegistrationAllowed('stranger@example.com')).toBe(false);
    });
  });

  describe('empty whitelist env var', () => {
    it('blocks everyone when whitelist is enabled but the list is empty', () => {
      vi.stubEnv('NEXT_PUBLIC_REGISTRATIONS_ENABLED', 'true');
      vi.stubEnv('NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED', 'true');
      vi.stubEnv('REGISTRATION_WHITELIST', '');
      expect(isRegistrationAllowed('anyone@example.com')).toBe(false);
    });
  });
});
