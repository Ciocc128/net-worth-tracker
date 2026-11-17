/**
 * DELETE /api/assets/[assetId] — RS6b of doc/sicurezza/README.md (§ 6, AD1): the future
 * dividends deleted with the asset are the account's own, never another account's that happens
 * to carry the same `assetId`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

import { fake, bearer } from './helpers/adminFake';
import { DELETE } from '@/app/api/assets/[assetId]/route';

const FUTURE = Timestamp.fromDate(new Date('2099-03-10T12:00:00Z'));
const PAST = Timestamp.fromDate(new Date('2020-03-10T12:00:00Z'));

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'member-1', 'stranger');
  fake.set('assets/asset-a', { userId: 'owner-1', type: 'etf', name: 'Ornitorinco ETF' });
  fake.set('dividends/own-future', { userId: 'owner-1', assetId: 'asset-a', exDate: FUTURE });
  fake.set('dividends/own-past', { userId: 'owner-1', assetId: 'asset-a', exDate: PAST });
  fake.set('dividends/other-future', { userId: 'stranger', assetId: 'asset-a', exDate: FUTURE });
});

describe('DELETE /api/assets/[assetId]', () => {
  it('AD1 — deletes the asset and the account’s future dividends, not another account’s', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/assets/asset-a', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...bearer('owner-1') },
        body: JSON.stringify({ userId: 'owner-1' }),
      }),
      { params: Promise.resolve({ assetId: 'asset-a' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).deletedFutureDividends).toBe(1);
    expect(fake.get('assets/asset-a')).toBeUndefined();
    expect(fake.get('dividends/own-future')).toBeUndefined();
    expect(fake.get('dividends/own-past')).toBeDefined();
    expect(fake.get('dividends/other-future')).toBeDefined();
  });
});
