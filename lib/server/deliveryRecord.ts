import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { CLAIM_TTL_MS } from '@/lib/utils/periodRecapDue';

/**
 * The delivery record (C5, doc/cron-serale § 5.4, D-CS5): one document per user and period saying
 * whether its email (or the month's `dati/`) went out, so a duplicate run sends nothing and a missed
 * one is caught up. Admin SDK only (`firestore.rules` denies the client).
 */
export const DELIVERIES_COLLECTION = 'deliveries';

export type DeliveryStatus = 'sending' | 'sent' | 'failed' | 'skipped';
export type DeliverySource = 'cron' | 'manual';

export interface DeliveryRecord {
  userId: string;
  period: string;
  status: DeliveryStatus;
  reason?: string;
  source: DeliverySource;
  claimedAt: Timestamp;
  sentAt?: Timestamp;
  attempts: number;
  aiComment?: string;
  recipientsCount?: number;
}

export const deliveryId = (userId: string, periodKey: string) => `${userId}_${periodKey}`;

const deliveryRef = (userId: string, periodKey: string) =>
  adminDb.collection(DELIVERIES_COLLECTION).doc(deliveryId(userId, periodKey));

export type ClaimResult =
  | { claimed: true; attempts: number; aiComment?: string }
  | { claimed: false; reason: 'already-sent' | 'in-flight' | 'skipped' };

/**
 * Takes the period in a transaction. Stops when it is already `sent`, or `sending` with a claim
 * younger than ten minutes (twice `maxDuration`: a run killed mid-send leaves a claim the next run
 * reclaims). A manual send skips the `sent` stop: it is an explicit re-send. A `skipped` record
 * (no snapshot) is not retried by the cron; a manual send takes it.
 */
export async function claimDelivery(
  userId: string,
  periodKey: string,
  { source, now = new Date(), recipientsCount }: { source: DeliverySource; now?: Date; recipientsCount?: number }
): Promise<ClaimResult> {
  const ref = deliveryRef(userId, periodKey);
  return adminDb.runTransaction(async (transaction): Promise<ClaimResult> => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data() as Partial<DeliveryRecord> | undefined;

    if (existing?.status === 'sent' && source === 'cron') return { claimed: false, reason: 'already-sent' };
    if (existing?.status === 'skipped' && source === 'cron') return { claimed: false, reason: 'skipped' };
    if (existing?.status === 'sending' && existing.claimedAt) {
      if (now.getTime() - existing.claimedAt.toMillis() < CLAIM_TTL_MS) return { claimed: false, reason: 'in-flight' };
    }

    const attempts = (existing?.attempts ?? 0) + 1;
    transaction.set(ref, {
      ...(existing ?? {}),
      userId,
      period: periodKey,
      status: 'sending',
      reason: null,
      source,
      claimedAt: Timestamp.fromDate(now),
      attempts,
      ...(recipientsCount !== undefined ? { recipientsCount } : {}),
    });
    return { claimed: true, attempts, ...(existing?.aiComment ? { aiComment: existing.aiComment } : {}) };
  });
}

/** Moves a claimed record to its end state; the paid comment stays on it. */
export async function settleDelivery(
  userId: string,
  periodKey: string,
  status: Exclude<DeliveryStatus, 'sending'>,
  { reason, now = new Date() }: { reason?: string; now?: Date } = {}
): Promise<void> {
  await deliveryRef(userId, periodKey).set(
    {
      status,
      reason: reason ?? null,
      ...(status === 'sent' ? { sentAt: Timestamp.fromDate(now) } : {}),
    },
    { merge: true }
  );
}

/** Keeps the paid AI comment on the record BEFORE the send is attempted (UC6). */
export async function storeDeliveryComment(userId: string, periodKey: string, aiComment: string): Promise<void> {
  await deliveryRef(userId, periodKey).set({ aiComment }, { merge: true });
}

/** The records of a user's recent periods, as the due logic needs them. */
export async function readDeliveryStates(
  userId: string,
  periodKeys: string[]
): Promise<Record<string, { status: DeliveryStatus; claimedAtMs?: number }>> {
  const out: Record<string, { status: DeliveryStatus; claimedAtMs?: number }> = {};
  await Promise.all(
    periodKeys.map(async (key) => {
      const snapshot = await deliveryRef(userId, key).get();
      if (!snapshot.exists) return;
      const data = snapshot.data() as Partial<DeliveryRecord>;
      if (!data.status) return;
      out[key] = { status: data.status, claimedAtMs: data.claimedAt?.toMillis() };
    })
  );
  return out;
}
