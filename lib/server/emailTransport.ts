import { Resend } from 'resend';

/**
 * The ONE door to the mail transport (C2, doc/cron-serale § 5.6, D-CS4).
 *
 * `RESEND_API_KEY` and `RESEND_FROM_EMAIL` must both be set. There is no sender fallback: the old
 * `'noreply@example.com'` hid a missing variable behind a Resend error that came AFTER the AI
 * comment was paid (the 31/10/2026 case).
 */
export function isEmailTransportConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim()) && Boolean(process.env.RESEND_FROM_EMAIL?.trim());
}

/**
 * D-CS9 (doc/cron-serale § 8): `EMAIL_RECIPIENT_ALLOWLIST`, comma-separated addresses, case-insensitive.
 * Set, only those addresses receive email (Resend without a verified domain delivers to the owner
 * alone, and refuses the whole send if one address is foreign); empty or absent, nothing is filtered.
 */
export function filterAllowedRecipients(recipients: string[]): string[] {
  const allowlist = (process.env.EMAIL_RECIPIENT_ALLOWLIST ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return recipients;
  return recipients.filter((address) => allowlist.includes(address.trim().toLowerCase()));
}

export const EMAIL_NOT_CONFIGURED_MESSAGE = "L'invio delle email non è configurato sul server.";

export class EmailTransportNotConfiguredError extends Error {
  constructor() {
    super('email-not-configured');
    this.name = 'EmailTransportNotConfiguredError';
  }
}

/** Sends one email to all `to`; throws when the transport is not configured or Resend refuses. */
export async function sendEmail(message: { to: string[]; subject: string; html: string }): Promise<void> {
  if (!isEmailTransportConfigured()) throw new EmailTransportNotConfiguredError();

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: message.to,
    subject: message.subject,
    html: message.html,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
