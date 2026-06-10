/**
 * Application Feature Flags and Configuration
 *
 * This file contains client-safe feature flags only (NEXT_PUBLIC_* env vars).
 * It is imported by client components, so NEVER add sensitive data here.
 *
 * WARNING: If you add registration config, use lib/server/registrationPolicy.ts
 * for any data that must not reach the client bundle (e.g. the email whitelist).
 */

/**
 * Registration UI Flags
 *
 * REGISTRATIONS_ENABLED: When set to false, blocks all new user registrations.
 * Existing users can still log in.
 *
 * REGISTRATION_WHITELIST_ENABLED: When true, only emails in the whitelist can
 * register. The actual list lives in the server-only REGISTRATION_WHITELIST env
 * var — see lib/server/registrationPolicy.ts.
 */
export const APP_CONFIG = {
  // When set to 'false' (string), blocks all new user registrations
  // Default: true (allows registrations)
  REGISTRATIONS_ENABLED: process.env.NEXT_PUBLIC_REGISTRATIONS_ENABLED !== 'false',

  // When set to 'true' (string), enables email whitelist for registration
  // Default: false (whitelist disabled)
  REGISTRATION_WHITELIST_ENABLED: process.env.NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED === 'true',
};
