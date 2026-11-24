import { buildAndSendForPeriod, type EmailPeriodType } from '@/lib/server/monthlyEmailService';
import { buildAndSendWeeklyBudget } from '@/lib/server/weeklyBudgetEmailService';
import { isEmailTransportConfigured } from '@/lib/server/emailTransport';
import {
  claimDelivery,
  settleDelivery,
  storeDeliveryComment,
  type DeliverySource,
} from '@/lib/server/deliveryRecord';
import type { RecapPeriod } from '@/lib/utils/periodRecapDue';

/**
 * One period's email, through its delivery record (doc/cron-serale § 5.4):
 *   claim → transport check → build (reusing a paid comment) → send → `sent` | `failed`.
 * Never throws: every end is an outcome the run record can hold.
 */
export type DeliveryOutcome =
  | { outcome: 'sent' }
  | { outcome: 'already-sent' | 'in-flight' }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; reason: 'email-not-configured' | 'send-failed' | 'build-failed' };

export interface DeliverPeriodEmailInput {
  userId: string;
  recipients: string[];
  /** A `monthly`, `quarterly`, `semiannual`, `yearly` or `budget-week` period. */
  period: RecapPeriod;
  source: DeliverySource;
  now?: Date;
}

export async function deliverPeriodEmail({
  userId,
  recipients,
  period,
  source,
  now = new Date(),
}: DeliverPeriodEmailInput): Promise<DeliveryOutcome> {
  const claim = await claimDelivery(userId, period.key, { source, now, recipientsCount: recipients.length });
  if (!claim.claimed) {
    return claim.reason === 'skipped'
      ? { outcome: 'skipped', reason: 'skipped-earlier' }
      : { outcome: claim.reason };
  }

  // Before any data is built and before a model is called: a missing transport costs nothing (D-CS4).
  if (!isEmailTransportConfigured()) {
    await settleDelivery(userId, period.key, 'failed', { reason: 'email-not-configured', now });
    return { outcome: 'failed', reason: 'email-not-configured' };
  }

  try {
    const hooks = {
      storedAiComment: claim.aiComment ?? null,
      onAiComment: (comment: string) => storeDeliveryComment(userId, period.key, comment),
    };
    const built =
      period.kind === 'budget-week'
        ? await buildAndSendWeeklyBudget(userId, recipients, now, hooks)
        : await buildAndSendForPeriod(
            userId,
            recipients,
            period.kind as EmailPeriodType,
            period.year,
            period.month,
            hooks
          );

    if (!built) {
      // No snapshot (or no budget): nothing later will create it by itself (D-SN3); not retried.
      const reason = period.kind === 'budget-week' ? 'no-budgets' : 'no-snapshot';
      await settleDelivery(userId, period.key, 'skipped', { reason, now });
      return { outcome: 'skipped', reason };
    }
    await settleDelivery(userId, period.key, 'sent', { now });
    return { outcome: 'sent' };
  } catch (error) {
    const reason = (error as Error).message?.startsWith('Resend error') ? 'send-failed' : 'build-failed';
    console.error(`[delivery] ${period.key} for user ${userId} failed (${reason}):`, error);
    await settleDelivery(userId, period.key, 'failed', { reason, now }).catch((settleError) =>
      console.error('[delivery] could not record the failure:', settleError)
    );
    return { outcome: 'failed', reason };
  }
}
