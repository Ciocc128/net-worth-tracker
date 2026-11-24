/**
 * CS4 — the delivery record (doc/cron-serale/README.md § 5.4, D-CS5) over the in-memory Admin fake:
 * claim, duplicate, stale claim (10 minutes), manual re-send, the paid comment kept.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

import { fake } from './helpers/adminFake';
import { claimDelivery, deliveryId, readDeliveryStates, settleDelivery, storeDeliveryComment } from '@/lib/server/deliveryRecord';

const T0 = new Date('2026-11-01T19:30:00Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);
const PATH = `deliveries/${deliveryId('owner-1', 'monthly-2026-10')}`;

beforeEach(() => fake.reset());

describe('claim', () => {
  it('a first claim writes `sending`, attempts 1, the claim time', async () => {
    const result = await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0, recipientsCount: 2 });
    expect(result).toEqual({ claimed: true, attempts: 1 });
    expect(fake.get(PATH)).toMatchObject({ userId: 'owner-1', period: 'monthly-2026-10', status: 'sending', source: 'cron', attempts: 1, recipientsCount: 2 });
    expect((fake.get(PATH)!.claimedAt as Timestamp).toMillis()).toBe(T0.getTime());
  });

  it('a duplicate delivery of the cron finds `sent` and stops (UC2)', async () => {
    await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0 });
    await settleDelivery('owner-1', 'monthly-2026-10', 'sent', { now: T0 });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: minutes(1) })).toEqual({ claimed: false, reason: 'already-sent' });
  });

  // 9 minutes is under the 10-minute claim (twice maxDuration), 11 is over: worked out, not read from the code.
  it('a `sending` claim of 9 minutes ago blocks; one of 11 minutes ago is reclaimed with attempts 2', async () => {
    await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0 });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: minutes(9) })).toEqual({ claimed: false, reason: 'in-flight' });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: minutes(11) })).toEqual({ claimed: true, attempts: 2 });
  });

  it('a `failed` record is claimed again by the next run', async () => {
    await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0 });
    await settleDelivery('owner-1', 'monthly-2026-10', 'failed', { reason: 'send-failed', now: T0 });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: minutes(1440) })).toMatchObject({ claimed: true, attempts: 2 });
    expect(fake.get(PATH)!.reason).toBeNull();
  });

  it('a `skipped` record (no snapshot) is not retried by the cron, but a manual send takes it', async () => {
    await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0 });
    await settleDelivery('owner-1', 'monthly-2026-10', 'skipped', { reason: 'no-snapshot', now: T0 });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: minutes(1440) })).toEqual({ claimed: false, reason: 'skipped' });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'manual', now: minutes(1440) })).toMatchObject({ claimed: true });
  });

  it('a manual send of a `sent` period is an explicit re-send and leaves `sent` (UC8)', async () => {
    await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0 });
    await settleDelivery('owner-1', 'monthly-2026-10', 'sent', { now: T0 });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'manual', now: minutes(60) })).toMatchObject({ claimed: true, attempts: 2 });
    await settleDelivery('owner-1', 'monthly-2026-10', 'sent', { now: minutes(60) });
    expect(fake.get(PATH)).toMatchObject({ status: 'sent', source: 'manual' });
  });
});

describe('the paid AI comment (UC6)', () => {
  it('stays on the record after a failed send and comes back with the next claim', async () => {
    await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0 });
    await storeDeliveryComment('owner-1', 'monthly-2026-10', 'Commento ornitorinco.');
    await settleDelivery('owner-1', 'monthly-2026-10', 'failed', { reason: 'send-failed', now: T0 });
    expect(await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: minutes(1440) })).toEqual({
      claimed: true,
      attempts: 2,
      aiComment: 'Commento ornitorinco.',
    });
  });
});

describe('readDeliveryStates', () => {
  it('reads only the keys asked, with the claim time in milliseconds', async () => {
    await claimDelivery('owner-1', 'monthly-2026-10', { source: 'cron', now: T0 });
    await claimDelivery('owner-2', 'monthly-2026-10', { source: 'cron', now: T0 });
    const states = await readDeliveryStates('owner-1', ['monthly-2026-10', 'yearly-2026']);
    expect(states).toEqual({ 'monthly-2026-10': { status: 'sending', claimedAtMs: T0.getTime() } });
  });
});
