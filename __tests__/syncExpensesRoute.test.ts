/**
 * POST /api/dividends/sync-expenses — A1 of the security review of 2026-11-11
 * (doc/sicurezza/README.md § 6, SX1–SX7): the route writes rows only in the verified account,
 * reads the dividends and the category itself, and never trusts a document in the request.
 *
 * The real route and the real services run over the in-memory Admin fake, so each assertion reads
 * what Firestore would hold. Figures are invented and round (WORKFLOW § 1.7).
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
import { POST } from '@/app/api/dividends/sync-expenses/route';

const PAID = Timestamp.fromDate(new Date('2026-03-10T12:00:00Z'));
const FUTURE = Timestamp.fromDate(new Date('2099-03-10T12:00:00Z'));

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/dividends/sync-expenses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function storedDividend(id: string, userId: string, overrides: Record<string, unknown> = {}) {
  fake.set(`dividends/${id}`, {
    userId,
    assetId: 'asset-a',
    assetTicker: 'ORNI',
    assetName: 'Ornitorinco SpA',
    exDate: PAID,
    paymentDate: PAID,
    netAmount: 50,
    grossAmount: 50,
    taxAmount: 0,
    currency: 'EUR',
    ...overrides,
  });
}

/** The rows of `userId` in the cashflow. */
const rowsOf = (userId: string) =>
  [...fake.docs.entries()].filter(([path, data]) => path.startsWith('expenses/') && data.userId === userId);

/** Today at the server's midnight: paid (the sync's cutoff) and due (it would credit the account). */
const todayMidnight = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
};

const forgedDividend = (netAmount: number) => ({
  id: 'forged-1',
  userId: 'owner-1',
  assetId: 'asset-a',
  assetTicker: 'ORNI',
  assetName: 'Ornitorinco SpA',
  exDate: todayMidnight(),
  paymentDate: todayMidnight(),
  netAmount,
  currency: 'EUR',
});

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'member-1', 'stranger');
  // The victim: a default dividend account at 8000 and one row already in the cashflow.
  fake.set('assets/acc-owner', { userId: 'owner-1', type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 8000 });
  fake.set('assetAllocationTargets/owner-1', { dividendCashAssetId: 'acc-owner' });
  fake.set('expenses/existing-owner', { userId: 'owner-1', type: 'income', amount: 2500 });
  fake.set('expenseCategories/cat-owner', {
    userId: 'owner-1', name: 'Dividendi', type: 'income', subCategories: [{ id: 'sub-owner', name: 'Cedole' }],
  });
  // The stranger: a valid token, no membership, a category of their own.
  fake.set('expenseCategories/cat-stranger', { userId: 'stranger', name: 'Fenicottero', type: 'income', subCategories: [] });
  // The member of owner-1's shared account.
  fake.set('account-access/owner-1', { memberUids: ['member-1'] });
});

describe('POST /api/dividends/sync-expenses', () => {
  it('SX1 — a stranger who declares the victim inside the dividend objects writes nothing in the victim’s account', async () => {
    const response = await POST(request({
      userId: 'stranger',
      dividends: [forgedDividend(2500)],
      categoryId: 'cat-stranger',
      categoryName: 'Fenicottero',
    }, bearer('stranger')));

    expect(response.status).toBe(200);
    expect((await response.json()).result.created).toBe(0);
    expect(rowsOf('owner-1')).toHaveLength(1);
  });

  it('SX2 — a forged negative dividend leaves the victim’s balance where it was', async () => {
    await POST(request({
      userId: 'stranger',
      dividends: [forgedDividend(-2500)],
      categoryId: 'cat-stranger',
      categoryName: 'Fenicottero',
    }, bearer('stranger')));

    expect(fake.get('assets/acc-owner')?.quantity).toBe(8000);
    expect(rowsOf('owner-1')).toHaveLength(1);
  });

  it('SX3 — a stranger aiming at the victim’s account is refused with 403 and writes nothing', async () => {
    fake.clearLog();
    const response = await POST(request({ userId: 'owner-1', categoryId: 'cat-owner' }, bearer('stranger')));

    expect(response.status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  it('SX4 — a category of another account answers 400 and writes nothing', async () => {
    storedDividend('div-s', 'stranger');
    fake.clearLog();
    const response = await POST(request({ userId: 'stranger', categoryId: 'cat-owner' }, bearer('stranger')));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Categoria non trovata');
    expect(fake.writes).toEqual([]);
  });

  it('SX5 — the owner: paid dividends without a row get one, with the STORED category name', async () => {
    storedDividend('div-1', 'owner-1');
    storedDividend('div-2', 'owner-1', { netAmount: 2500 });
    storedDividend('div-future', 'owner-1', { paymentDate: FUTURE, exDate: FUTURE });
    storedDividend('div-linked', 'owner-1', { expenseId: 'existing-owner' });

    const response = await POST(request({
      userId: 'owner-1',
      categoryId: 'cat-owner',
      subCategoryId: 'sub-owner',
      categoryName: 'Fenicottero', // an old tab still sends names: they are not read
      subCategoryName: 'Fenicottero',
    }, bearer('owner-1')));

    expect(response.status).toBe(200);
    expect((await response.json()).result).toEqual({ created: 2, skipped: 2, failed: 0 });
    const created = rowsOf('owner-1').filter(([path]) => path !== 'expenses/existing-owner').map(([, data]) => data);
    expect(created).toHaveLength(2);
    for (const row of created) {
      expect(row).toMatchObject({ userId: 'owner-1', categoryId: 'cat-owner', categoryName: 'Dividendi', subCategoryId: 'sub-owner', subCategoryName: 'Cedole' });
    }
    expect(created.map((row) => row.amount).sort((a, b) => Number(a) - Number(b))).toEqual([50, 2500]);
    expect(fake.get('dividends/div-1')?.expenseId).toBeTruthy();
    expect(fake.get('dividends/div-future')?.expenseId).toBeUndefined();
  });

  it('SX6 — a member of the shared account synchronises for the owner, rows in the owner’s account', async () => {
    storedDividend('div-1', 'owner-1');

    const response = await POST(request({ userId: 'owner-1', categoryId: 'cat-owner' }, bearer('member-1')));

    expect(response.status).toBe(200);
    expect((await response.json()).result.created).toBe(1);
    expect(rowsOf('owner-1')).toHaveLength(2);
    expect(rowsOf('member-1')).toHaveLength(0);
  });

  it('SX7 — without a token the answer is 401 and nothing is read', async () => {
    const response = await POST(request({ userId: 'owner-1', categoryId: 'cat-owner' }));

    expect(response.status).toBe(401);
    expect(fake.writes).toEqual([]);
  });

  it('refuses a body without a category with 400', async () => {
    const response = await POST(request({ userId: 'owner-1' }, bearer('owner-1')));

    expect(response.status).toBe(400);
  });
});
