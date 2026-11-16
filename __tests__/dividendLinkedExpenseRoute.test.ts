/**
 * PUT and DELETE /api/dividends/[dividendId] with a linked expense of ANOTHER account — A4 of the
 * security review of 2026-11-11 (doc/sicurezza/README.md § 4 RS5, § 6 DR1–DR2, D-SI4): the
 * foreign expense and its balance stay untouched, the dividend itself is edited or deleted.
 *
 * Real routes and services over the in-memory Admin fake. Figures invented (WORKFLOW § 1.7).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);
vi.mock('@/lib/services/currencyConversionService', () => ({
  convertMultipleToEur: vi.fn(),
  getExchangeRateToEur: vi.fn(),
}));

import { fake, bearer } from './helpers/adminFake';
import { DELETE, PUT } from '@/app/api/dividends/[dividendId]/route';

const PAID = Timestamp.fromDate(new Date('2026-03-10T12:00:00Z'));
const VICTIM_ROW = { userId: 'owner-1', type: 'income', amount: 50, notes: 'Ornitorinco', linkedCashAssetId: 'acc-owner' };

const params = (dividendId: string) => ({ params: Promise.resolve({ dividendId }) });

beforeEach(() => {
  fake.reset();
  fake.set('assets/acc-owner', { userId: 'owner-1', type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 8000 });
  fake.set('expenses/exp-v', { ...VICTIM_ROW });
  // The stranger's own dividend, written (before the rule was closed) with a link to the victim's row.
  fake.set('dividends/div-s', {
    userId: 'stranger', assetId: 'asset-s', assetTicker: 'FENI', assetName: 'Fenicottero',
    exDate: PAID, paymentDate: PAID, netAmount: 50, currency: 'EUR', expenseId: 'exp-v',
  });
  // The stranger has a dividend category, so the PUT really reaches the linked-row update.
  fake.set('assetAllocationTargets/stranger', { dividendIncomeCategoryId: 'cat-s' });
  fake.set('expenseCategories/cat-s', { userId: 'stranger', name: 'Fenicottero', type: 'income', subCategories: [] });
});

describe('a dividend linked to another account’s expense', () => {
  it('DR1 — DELETE removes the dividend and leaves the victim’s row and balance', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/dividends/div-s', { method: 'DELETE', headers: bearer('stranger') }),
      params('div-s'),
    );

    expect(response.status).toBe(200);
    expect(fake.get('expenses/exp-v')).toEqual(VICTIM_ROW);
    expect(fake.get('assets/acc-owner')?.quantity).toBe(8000);
    expect(fake.get('dividends/div-s')).toBeUndefined();
  });

  it('DR2 — PUT edits the dividend and leaves the victim’s row as it was', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/dividends/div-s', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...bearer('stranger') },
        body: JSON.stringify({ updates: { netAmount: 2500 } }),
      }),
      params('div-s'),
    );

    expect(response.status).toBe(200);
    expect(fake.get('dividends/div-s')?.netAmount).toBe(2500);
    expect(fake.get('expenses/exp-v')).toEqual(VICTIM_ROW);
    expect(fake.get('assets/acc-owner')?.quantity).toBe(8000);
  });
});
