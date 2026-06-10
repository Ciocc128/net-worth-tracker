import 'server-only';

/**
 * Server-only registration policy.
 *
 * The whitelist is read from REGISTRATION_WHITELIST (no NEXT_PUBLIC_ prefix) so
 * it is never inlined into the client bundle by Next.js. The two boolean flags
 * stay in NEXT_PUBLIC_* because the register page needs them to decide which UI
 * variant to render.
 *
 * WARNING: If you add sensitive registration config, keep it in this module —
 * never in lib/constants/appConfig.ts (which is imported by client components).
 */

function getWhitelist(): string[] {
  return (process.env.REGISTRATION_WHITELIST || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * Returns true if the given (already-lowercased) email is allowed to register,
 * based on the NEXT_PUBLIC_REGISTRATIONS_ENABLED and
 * NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED flags plus the server-only whitelist.
 */
export function isRegistrationAllowed(email: string): boolean {
  const registrationsEnabled = process.env.NEXT_PUBLIC_REGISTRATIONS_ENABLED !== 'false';
  const whitelistEnabled = process.env.NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED === 'true';

  if (!registrationsEnabled) {
    if (whitelistEnabled) {
      return getWhitelist().includes(email.toLowerCase());
    }
    return false;
  }

  if (whitelistEnabled) {
    return getWhitelist().includes(email.toLowerCase());
  }

  return true;
}
