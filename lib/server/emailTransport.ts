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
