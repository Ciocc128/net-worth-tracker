/**
 * DELETE and GET usage of /api/assets/[assetId] — doc/cancellazione-strumenti/README.md § 4.4, § 7
 * (AU2–AU6, AU8, AU9, AU11–AU14). Figures invented and round (WORKFLOW.md rule 7).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);
vi.mock('@/lib/server/dividendLedgerSync', () => ({ syncOpenPaymentsForAsset: vi.fn(async () => undefined) }));

import { fake, bearer, adminDb } from './helpers/adminFake';
import { DELETE } from '@/app/api/assets/[assetId]/route';
import { GET } from '@/app/api/assets/[assetId]/usage/route';
import { syncOpenPaymentsForAsset } from '@/lib/server/dividendLedgerSync';

const FUTURE = Timestamp.fromDate(new Date('2099-03-10T12:00:00Z'));
const PAST = Timestamp.fromDate(new Date('2020-03-10T12:00:00Z'));

const del = (assetId: string, body: unknown, uid = 'owner-1') =>
  DELETE(
    new NextRequest(`http://localhost/api/assets/${assetId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...bearer(uid) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ assetId }) },
  );

function seedEtf() {
  fake.set('assets/ETF-A', { userId: 'owner-1', type: 'etf', name: 'Ornitorinco ETF', quantity: 0 });
  fake.set('assets/ETF-B', { userId: 'owner-1', type: 'etf', name: 'Fenicottero ETF', quantity: 5, dividendCashAssetId: 'CONTO-X' });
  fake.set('assets/CONTO-X', { userId: 'owner-1', type: 'cash', name: 'Conto X', quantity: 1000 });
  for (const [id, type] of [['t1', 'buy'], ['t2', 'buy'], ['t3', 'sell']]) {
    fake.set(`assetTransactions/${id}`, { userId: 'owner-1', assetId: 'ETF-A', type });
  }
  fake.set('dividends/past', { userId: 'owner-1', assetId: 'ETF-A', exDate: PAST });
  fake.set('dividends/f1', { userId: 'owner-1', assetId: 'ETF-A', exDate: FUTURE });
  fake.set('dividends/f2', { userId: 'owner-1', assetId: 'ETF-A', exDate: FUTURE });
  fake.set('assetAllocationTargets/owner-1', {
    userId: 'owner-1',
    targets: { equity: 100 },
    defaultDebitCashAssetId: 'CONTO-X',
    idealAllocation: {
      enabled: true,
      instrumentLimits: [{ assetId: 'ETF-A', maxPct: 60 }, { assetId: 'ETF-B', maxPct: 50 }],
      groupLimits: [
        { id: 'G1', label: 'Mondo', assetIds: ['ETF-A', 'ETF-B'], maxPct: 80 },
        { id: 'G2', label: 'Solo', assetIds: ['ETF-A'], maxPct: 10 },
      ],
    },
  });
  fake.set('goalBasedInvesting/owner-1', {
    goals: [{ id: 'g1', name: 'Casa' }],
    assignments: [{ goalId: 'g1', assetId: 'ETF-A', percentage: 30 }, { goalId: 'g1', assetId: 'ETF-B', percentage: 20 }],
  });
}

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'stranger');
  vi.mocked(syncOpenPaymentsForAsset).mockClear();
  seedEtf();
});

describe('GET /api/assets/[assetId]/usage', () => {
  it('AU1 — reads the report for the owner', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/assets/ETF-A/usage?userId=owner-1', { headers: bearer('owner-1') }),
      { params: Promise.resolve({ assetId: 'ETF-A' }) },
    );
    const usage = await response.json();
    expect(response.status).toBe(200);
    expect(usage.ledger.count).toBe(3);
    expect(usage.dividends).toEqual({ future: 2, past: 1 });
    expect(usage.cleanups.map((l: { code: string }) => l.code)).toEqual(['R7', 'R8', 'R8', 'R9']);
  });

  it('AU13 — another account’s asset: refused, and the own one reads (positive control)', async () => {
    fake.set('assets/asset-stranger', { userId: 'stranger', type: 'etf', name: 'Altrui', quantity: 1 });
    const read = (uid: string, account: string, assetId: string) =>
      GET(new NextRequest(`http://localhost/api/assets/${assetId}/usage?userId=${account}`, { headers: bearer(uid) }), {
        params: Promise.resolve({ assetId }),
      });
    expect((await read('owner-1', 'owner-1', 'ETF-A')).status).toBe(200);
    expect((await read('owner-1', 'stranger', 'asset-stranger')).status).toBe(403);
    expect((await read('owner-1', 'owner-1', 'asset-stranger')).status).toBe(404);
  });
});

describe('DELETE /api/assets/[assetId]', () => {
  it('AU2 — a blocker answers 409 and writes nothing', async () => {
    fake.set('modelPortfolios/owner-1', { weights: [{ assetId: 'ETF-A', targetPercentage: 30 }, { assetId: 'ETF-B', targetPercentage: 70 }] });
    fake.set('accumulationPlans/p1', {
      userId: 'owner-1',
      name: 'P1',
      status: 'active',
      positions: [{ memberAssetIds: ['ETF-A'], buyAssetId: 'ETF-A' }],
    });
    const before = JSON.stringify([...fake.docs.entries()]);
    fake.clearLog();
    const response = await del('ETF-A', { userId: 'owner-1', ledger: 'keep' });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe('asset/in-use');
    expect(body.blockers.map((l: { code: string }) => l.code)).toEqual(['R4', 'R6']);
    expect(fake.writes).toEqual([]);
    expect(JSON.stringify([...fake.docs.entries()])).toBe(before);
  });

  it('AU3 — keep: the ledger stays, future dividends go, the limits, group members and quota are cleaned', async () => {
    const response = await del('ETF-A', { userId: 'owner-1', ledger: 'keep' });
    expect(response.status).toBe(200);
    expect(fake.get('assets/ETF-A')).toBeUndefined();
    expect(['t1', 't2', 't3'].every((id) => fake.get(`assetTransactions/${id}`))).toBe(true);
    expect(fake.get('dividends/f1')).toBeUndefined();
    expect(fake.get('dividends/f2')).toBeUndefined();
    expect(fake.get('dividends/past')).toBeDefined();
    const settings = fake.get('assetAllocationTargets/owner-1') as { idealAllocation: { instrumentLimits: unknown[]; groupLimits: Array<{ id: string; assetIds: string[] }> } };
    expect(settings.idealAllocation.instrumentLimits).toEqual([{ assetId: 'ETF-B', maxPct: 50 }]);
    // G1 keeps ETF-B; AU7: G2 (only ETF-A) is gone.
    expect(settings.idealAllocation.groupLimits.map((g) => [g.id, g.assetIds])).toEqual([['G1', ['ETF-B']]]);
    expect((fake.get('goalBasedInvesting/owner-1') as { assignments: unknown[] }).assignments).toEqual([
      { goalId: 'g1', assetId: 'ETF-B', percentage: 20 },
    ]);
    expect(syncOpenPaymentsForAsset).not.toHaveBeenCalled();
  });

  it('AU4 — delete: the ledger is emptied and the open payments are re-synced once', async () => {
    const response = await del('ETF-A', { userId: 'owner-1', ledger: 'delete' });
    expect(response.status).toBe(200);
    expect((await response.json()).deletedTransactions).toBe(3);
    expect(['t1', 't2', 't3'].some((id) => fake.get(`assetTransactions/${id}`))).toBe(false);
    expect(syncOpenPaymentsForAsset).toHaveBeenCalledTimes(1);
  });

  it('AU5/AU6 — the ledger choice is required with rows, not without', async () => {
    const refused = await del('ETF-A', { userId: 'owner-1' });
    expect(refused.status).toBe(400);
    expect(fake.get('assets/ETF-A')).toBeDefined();
    const free = await del('ETF-B', { userId: 'owner-1' });
    expect(free.status).toBe(200);
  });

  it('AU8 — an account deleted from its detail clears the pointers (field removed) and leaves its cashflow rows', async () => {
    fake.set('expenses/e1', { userId: 'owner-1', linkedCashAssetId: 'CONTO-X', amount: -10 });
    const response = await del('CONTO-X', { userId: 'owner-1' });
    expect(response.status).toBe(200);
    const settings = fake.get('assetAllocationTargets/owner-1') as Record<string, unknown>;
    expect('defaultDebitCashAssetId' in settings).toBe(false);
    expect('dividendCashAssetId' in (fake.get('assets/ETF-B') as object)).toBe(false);
    expect(fake.get('expenses/e1')).toEqual({ userId: 'owner-1', linkedCashAssetId: 'CONTO-X', amount: -10 });
  });

  it('AU9 — a property with a loan is refused; deleting the loan works and the property stays', async () => {
    fake.set('assets/CASA', { userId: 'owner-1', type: 'realestate', name: 'Casa', quantity: 1 });
    fake.set('assets/MUTUO', { userId: 'owner-1', type: 'loan', name: 'Mutuo Casa', quantity: 1, financedAssetId: 'CASA' });
    expect((await del('CASA', { userId: 'owner-1' })).status).toBe(409);
    expect((await del('MUTUO', { userId: 'owner-1' })).status).toBe(200);
    expect(fake.get('assets/CASA')).toBeDefined();
  });

  it('AU11 — a run interrupted after the cleanups is repeated to the same end state', async () => {
    // First run: the cleanups happened, the ledger delete never started (the asset is still there).
    const first = await del('ETF-A', { userId: 'owner-1', ledger: 'keep' });
    expect(first.status).toBe(200);
    // Simulate a stop before step 4: put the asset back as the half-done state would hold it.
    fake.set('assets/ETF-A', { userId: 'owner-1', type: 'etf', name: 'Ornitorinco ETF', quantity: 0 });
    const again = await del('ETF-A', { userId: 'owner-1', ledger: 'delete' });
    expect(again.status).toBe(200);
    expect(fake.get('assets/ETF-A')).toBeUndefined();
    expect(['t1', 't2', 't3'].some((id) => fake.get(`assetTransactions/${id}`))).toBe(false);
  });

  it('AU12 — a setting saved elsewhere in the meantime stays (only the touched fields are written)', async () => {
    const settings = fake.get('assetAllocationTargets/owner-1') as Record<string, unknown>;
    fake.set('assetAllocationTargets/owner-1', { ...settings, monteCarloMarket: { v: 2 }, fireEmergencyFund: 5000 });
    await del('ETF-A', { userId: 'owner-1', ledger: 'keep' });
    const after = fake.get('assetAllocationTargets/owner-1') as Record<string, unknown>;
    expect(after.monteCarloMarket).toEqual({ v: 2 });
    expect(after.fireEmergencyFund).toBe(5000);
    expect(after.targets).toEqual({ equity: 100 });
  });

  it('AU13 — another account: refused, nothing changed; the own asset deletes (positive control)', async () => {
    fake.set('assets/asset-stranger', { userId: 'stranger', type: 'etf', name: 'Altrui', quantity: 0 });
    expect((await del('asset-stranger', { userId: 'stranger' }, 'owner-1')).status).toBe(403);
    expect(fake.get('assets/asset-stranger')).toBeDefined();
    expect((await del('asset-stranger', { userId: 'owner-1' })).status).toBe(403);
    expect(fake.get('assets/asset-stranger')).toBeDefined();
    expect((await del('ETF-B', { userId: 'owner-1' })).status).toBe(200);
  });

  it('AU14 — 520 ledger rows go in two batches (400 + 120), none above 400', async () => {
    for (let i = 0; i < 517; i++) fake.set(`assetTransactions/x${i}`, { userId: 'owner-1', assetId: 'ETF-A', type: 'buy' });
    const original = adminDb.batch;
    const sizes: number[] = [];
    const spy = vi.spyOn(adminDb, 'batch').mockImplementation(() => {
      const b = original();
      let deletes = 0;
      const del = b.delete;
      b.delete = (ref) => {
        deletes += 1;
        return del(ref);
      };
      const commit = b.commit;
      b.commit = async () => {
        sizes.push(deletes);
        return commit();
      };
      return b;
    });
    const response = await del('ETF-A', { userId: 'owner-1', ledger: 'delete' });
    spy.mockRestore();
    // 3 seeded + 517 = 520 ledger rows. Batches that delete the ledger: 400 then 120; the future
    // dividends (2) go in their own batch afterwards.
    expect((await response.json()).deletedTransactions).toBe(520);
    expect(sizes.filter((n) => n > 0)).toEqual([400, 120, 2]);
  });
});
