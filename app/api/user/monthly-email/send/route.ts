/**
 * POST /api/user/monthly-email/send
 *
 * Allows an authenticated user to trigger a periodic summary email immediately.
 * Accepts an optional JSON body with `periodType` ('monthly' | 'quarterly' | 'semiannual' | 'yearly').
 * When omitted, defaults to 'monthly'. Resolves the most recently completed period
 * automatically (e.g. April 19 2026 → March for quarterly, H2 2025 for semiannual, 2025 for yearly).
 * `periodType: 'weekly-budget'` sends the weekly budget status email for the current state instead.
 *
 * Without the mail transport (RESEND_API_KEY and RESEND_FROM_EMAIL) the answer is 503, before the
 * rate limit and before anything is built or any AI comment is paid (D-CS4, doc/cron-serale § 5.6).
 * A CLOSED period (quarter, half-year, year) goes through its delivery record as a manual send and
 * leaves it `sent`, so the cron does not send it again (UC8); the running month and the weekly
 * budget email are format tests and write no record.
 *
 * Auth: `requireFirebaseAuth` (a token of an ADMITTED user, doc/sicurezza/S2-utenti-ammessi.md RU9);
 * at most EMAIL_SEND_LIMIT_MAX sends an hour per user, counted before the email (and its AI
 * comment) is built.
 * Body: { periodType?: 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'weekly-budget' }
 * Returns: { success: true } or error JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';
import {
  getSettingsAdmin,
  buildAndSendForPeriod,
  getMostRecentCompletedQuarterEnd,
  getMostRecentCompletedHalfYearEnd,
  getMostRecentCompletedYearEnd,
  type EmailPeriodType,
} from '@/lib/server/monthlyEmailService';
import { buildAndSendWeeklyBudget } from '@/lib/server/weeklyBudgetEmailService';
import { EMAIL_NOT_CONFIGURED_MESSAGE, isEmailTransportConfigured } from '@/lib/server/emailTransport';
import { deliverPeriodEmail } from '@/lib/server/periodEmailDelivery';
import { quarterlyPeriod, semiannualPeriod, yearlyPeriod } from '@/lib/utils/periodRecapDue';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

/** RU9 (D-SI16): five sends an hour per user, in memory like the two AI routes (A6 moves all three). */
const EMAIL_SEND_LIMIT_MAX = 5;
const EMAIL_SEND_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = decodedToken.uid;

    if (!isEmailTransportConfigured()) {
      return NextResponse.json({ error: EMAIL_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const rateLimitResult = checkRateLimit(`${userId}:email-send`, EMAIL_SEND_LIMIT_MAX, EMAIL_SEND_LIMIT_WINDOW_MS);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Hai raggiunto il limite di invii. Riprova più tardi.' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfterSeconds) } }
      );
    }

    // Parse optional body — default to monthly
    const body = await request.json().catch(() => ({})) as { periodType?: string };

    // Weekly budget email is a separate builder (not a snapshot-based period summary).
    if (body.periodType === 'weekly-budget') {
      const settings = await getSettingsAdmin(userId);
      if (!settings?.weeklyBudgetEmailEnabled) {
        return NextResponse.json({ error: 'weekly budget email is not enabled for this account' }, { status: 400 });
      }
      if (!settings.monthlyEmailRecipients?.length) {
        return NextResponse.json({ error: 'No recipients configured' }, { status: 400 });
      }
      const sent = await buildAndSendWeeklyBudget(userId, settings.monthlyEmailRecipients, new Date());
      if (!sent) {
        return NextResponse.json({ error: 'No budgets configured — create a budget first' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    const periodType: EmailPeriodType =
      body.periodType === 'quarterly' ||
      body.periodType === 'semiannual' ||
      body.periodType === 'yearly'
        ? body.periodType
        : 'monthly';

    // Auto-resolve the most recently completed period for each type
    let year: number;
    let month: number;
    if (periodType === 'quarterly') {
      ({ year, month } = getMostRecentCompletedQuarterEnd(new Date()));
    } else if (periodType === 'semiannual') {
      ({ year, month } = getMostRecentCompletedHalfYearEnd(new Date()));
    } else if (periodType === 'yearly') {
      ({ year, month } = getMostRecentCompletedYearEnd(new Date()));
    } else {
      ({ year, month } = getItalyMonthYear(new Date()));
    }

    const settings = await getSettingsAdmin(userId);

    // Check the correct toggle per period type
    const enabledKey =
      periodType === 'quarterly'
        ? 'quarterlyEmailEnabled'
        : periodType === 'semiannual'
        ? 'semiAnnualEmailEnabled'
        : periodType === 'yearly'
        ? 'yearlyEmailEnabled'
        : 'monthlyEmailEnabled';

    if (!settings?.[enabledKey]) {
      return NextResponse.json(
        { error: `${periodType} email is not enabled for this account` },
        { status: 400 }
      );
    }
    if (!settings.monthlyEmailRecipients?.length) {
      return NextResponse.json({ error: 'No recipients configured' }, { status: 400 });
    }

    let sent: boolean;
    if (periodType === 'monthly') {
      // The running month: a format test, never due to the cron, so no delivery record.
      sent = await buildAndSendForPeriod(userId, settings.monthlyEmailRecipients, periodType, year, month);
    } else {
      const period =
        periodType === 'quarterly'
          ? quarterlyPeriod(year, month / 3)
          : periodType === 'semiannual'
          ? semiannualPeriod(year, month === 6 ? 1 : 2)
          : yearlyPeriod(year);
      const result = await deliverPeriodEmail({
        userId,
        recipients: settings.monthlyEmailRecipients,
        period,
        source: 'manual',
      });
      if (result.outcome === 'failed') {
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
      }
      if (result.outcome === 'in-flight') {
        return NextResponse.json({ error: 'Un invio di questo periodo è già in corso. Riprova tra qualche minuto.' }, { status: 409 });
      }
      sent = result.outcome === 'sent';
    }
    if (!sent) {
      return NextResponse.json(
        { error: 'No snapshot found for the requested period — save a snapshot first' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const authResponse = getApiAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error sending periodic email:', error);
    // No `details`: the message of a thrown error is server internals, not the caller's business.
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
