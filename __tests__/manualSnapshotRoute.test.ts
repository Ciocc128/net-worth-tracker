/**
 * POST /api/portfolio/snapshot/manual and POST /api/portfolio/snapshot/restore over the in-memory
 * Admin fake — doc/snapshot-integri/README.md § 6, SM1–SM7 and RS1–RS3; CA2 (a).
 *
 * «Now» is 2026-11-14 12:00 Europe/Rome; figures invented and round; decoys «Fenicottero»,
 * «Ornitorinco».
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);
vi.mock('@/lib/services/hallOfFameService.server', () => ({ updateHallOfFame: vi.fn().mockResolvedValue(undefined) }));

import { fake, bearer } from './helpers/adminFake';
import { POST as manualRoute } from '@/app/api/portfolio/snapshot/manual/route';
import { POST as restoreRoute } from '@/app/api/portfolio/snapshot/restore/route';

const NOW = new Date('2026-11-14T11:00:00.000Z');
const OCT = 'monthly-snapshots/owner-1-2026-10';
const CRON_WRITE = new Date('2026-10-31T18:02:00.000Z'); // 31/10 19:02 in Rome

function call(route: (request: NextRequest) => Promise<Response>, url: string, body: unknown, uid: string | null = 'owner-1') {
  return route(
    new NextRequest(`http://localhost/api/${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(uid ? bearer(uid) : {}) },
      body: JSON.stringify(body),
    })
  );
}

const manual = (body: unknown, uid: string | null = 'owner-1') => call(manualRoute, 'portfolio/snapshot/manual', body, uid);
const restore = (uid: string | null = 'owner-1') => call(restoreRoute, 'portfolio/snapshot/restore', { userId: 'owner-1', year: 2026, month: 10 }, uid);

/** A coherent October 2026 at `total`: classes 60/40, liquid 70%. */
function october(total: number, extra: Record<string, unknown> = {}) {
  return {
    userId: 'owner-1', year: 2026, month: 10,
    totalNetWorth: total, liquidNetWorth: total * 0.7, illiquidNetWorth: total * 0.3,
    byAssetClass: { equity: total * 0.6, bonds: total * 0.4 },
    ...extra,
  };
}

/** The October the cron wrote on 31/10 at 19:02: 10.000, a note. */
function seedCronOctober() {
  fake.set(OCT, {
    userId: 'owner-1', year: 2026, month: 10,
    totalNetWorth: 10000, liquidNetWorth: 7000, illiquidNetWorth: 3000,
    byAssetClass: { equity: 6000, bonds: 4000 }, byAsset: [], assetAllocation: { equity: 60, bonds: 40 },
    fireNetWorth: 10000, pension: { totalValue: 0, byAssetClass: {} },
    createdAt: Timestamp.fromDate(new Date('2026-10-01T17:00:00.000Z')),
    updatedAt: Timestamp.fromDate(CRON_WRITE),
    writtenBy: 'cron',
    prices: { status: 'fresh', failed: [], anomalies: [], oldest: null },
    note: 'Fenicottero',
  });
}

const versionsOf = (path: string) => [...fake.docs.keys()].filter((key) => key.startsWith(`${path}/versions/`));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  fake.allow('owner-1', 'member-1', 'stranger');
  fake.set('account-access/owner-1', { memberUids: ['member-1'] });
  fake.clearLog();
});

describe('SM1 — the schema (P7)', () => {
  it.each([
    ['a fractional month', { month: 1.5 }],
    ['a string total', { totalNetWorth: 'abc' }],
    ['a list for a number', { liquidNetWorth: [1] }],
    ['an unknown class', { byAssetClass: { fenicottero: 10000 } }],
    ['an unknown key', { assetAllocation: { equity: 100 } }],
  ])('%s: 400, zero writes', async (_label, patch) => {
    const response = await manual({ ...october(10000), ...patch });
    expect(response.status).toBe(400);
    expect(fake.writes).toEqual([]);
  });
});

describe('SM2–SM3 — coherence and the future', () => {
  it('SM2: classes summing 9.000 on a total of 10.000: 400', async () => {
    const response = await manual(october(10000, { byAssetClass: { equity: 5000, bonds: 4000 } }));
    expect(response.status).toBe(400);
    expect(fake.writes).toEqual([]);
  });

  it('SM2: liquid 7.000 + illiquid 2.000 on 10.000: 400', async () => {
    const response = await manual(october(10000, { liquidNetWorth: 7000, illiquidNetWorth: 2000 }));
    expect(response.status).toBe(400);
    expect(fake.writes).toEqual([]);
  });

  it('SM3: December 2026 is a future month: 400', async () => {
    const response = await manual(october(10000, { month: 12 }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Un mese futuro non ha uno snapshot');
    expect(fake.writes).toEqual([]);
  });
});

describe('SM4–SM6 — writing a closed month', () => {
  it('SM4: a free closed month: 200, manual, the uid, the allocation derived', async () => {
    const response = await manual(october(10000));
    expect(response.status).toBe(200);
    const written = fake.get(OCT)!;
    expect(written.writtenBy).toBe('manual');
    expect(written.writtenByUid).toBe('owner-1');
    expect(written.assetAllocation).toEqual({ equity: 60, bonds: 40 });
    expect(written).not.toHaveProperty('pension');
    expect(written).not.toHaveProperty('fireNetWorth');
    expect(written).not.toHaveProperty('prices');
  });

  it('SM5: an existing closed month without replace: 409 with who wrote it, zero writes', async () => {
    seedCronOctober();
    const response = await manual(october(12000));
    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.error).toBe('snapshot_exists');
    expect(payload.existing.writtenBy).toBe('cron');
    expect(payload.existing.updatedAt).toBe(CRON_WRITE.toISOString());
    expect(fake.writes).toEqual([]);
    expect(fake.get(OCT)!.totalNetWorth).toBe(10000);
  });

  it('SM6: with replace, the old one is kept whole as a version and the note rides across', async () => {
    seedCronOctober();
    const before = { ...fake.get(OCT)! };
    const response = await manual(october(12000, { replace: true }));
    expect(response.status).toBe(200);

    const [versionPath] = versionsOf(OCT);
    expect(versionsOf(OCT)).toHaveLength(1);
    const version = fake.get(versionPath)!;
    const { archivedAt, archivedByUid, ...copied } = version;
    expect(copied).toEqual(before);
    expect(archivedByUid).toBe('owner-1');
    expect((archivedAt as Timestamp).toMillis()).toBe(NOW.getTime());

    const written = fake.get(OCT)!;
    expect(written.totalNetWorth).toBe(12000);
    expect(written.writtenBy).toBe('manual');
    expect(written.note).toBe('Fenicottero');
    expect((written.previous as { versionId: string }).versionId).toBe(versionPath.split('/').pop());
    expect((written.previous as { writtenBy: string }).writtenBy).toBe('cron');
  });

  it('a legacy note-only document is completed, not «existing»: no 409, the note kept', async () => {
    fake.set(OCT, { userId: 'owner-1', note: 'Ornitorinco' });
    const response = await manual(october(10000));
    expect(response.status).toBe(200);
    expect(fake.get(OCT)!.note).toBe('Ornitorinco');
    expect(versionsOf(OCT)).toEqual([]);
  });
});

describe('SM7 — who may write', () => {
  it('no token: 401', async () => {
    expect((await manual(october(10000), null)).status).toBe(401);
    expect(fake.writes).toEqual([]);
  });

  it('a stranger: 403', async () => {
    expect((await manual(october(10000), 'stranger')).status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  it('a member of the shared account writes, with their own uid', async () => {
    expect((await manual(october(10000), 'member-1')).status).toBe(200);
    expect(fake.get(OCT)!.writtenByUid).toBe('member-1');
  });
});

describe('RS1–RS3 — undo is a swap (CA2 a)', () => {
  it('RS1: after a replacement 10.000 → 12.000, restore brings back the cron October field for field', async () => {
    seedCronOctober();
    const original = { ...fake.get(OCT)! };
    await manual(october(12000, { replace: true }));
    fake.clearLog();

    const response = await restore();
    expect(response.status).toBe(200);
    const restored = fake.get(OCT)!;
    const { previous, ...rest } = restored;
    expect(rest).toEqual(original);
    expect(restored.writtenBy).toBe('cron');
    expect((restored.updatedAt as Timestamp).toMillis()).toBe(CRON_WRITE.getTime());

    // A second version holds the 12.000 one, and the pointer names it.
    expect(versionsOf(OCT)).toHaveLength(2);
    const pointer = previous as { versionId: string; writtenBy: string };
    expect(pointer.writtenBy).toBe('manual');
    expect(fake.get(`${OCT}/versions/${pointer.versionId}`)!.totalNetWorth).toBe(12000);
  });

  it('RS2: restoring again brings 12.000 back', async () => {
    seedCronOctober();
    await manual(october(12000, { replace: true }));
    await restore();
    const response = await restore();
    expect(response.status).toBe(200);
    expect(fake.get(OCT)!.totalNetWorth).toBe(12000);
    expect(fake.get(OCT)!.writtenBy).toBe('manual');
    expect(fake.get(OCT)!.note).toBe('Fenicottero');
  });

  it('the CURRENT note rides on the restored version', async () => {
    seedCronOctober();
    await manual(october(12000, { replace: true }));
    fake.set(OCT, { ...fake.get(OCT)!, note: 'Ornitorinco' });
    await restore();
    expect(fake.get(OCT)!.note).toBe('Ornitorinco');
    expect(fake.get(OCT)!.totalNetWorth).toBe(10000);
  });

  it('RS3: no previous version: 404, zero writes', async () => {
    seedCronOctober();
    fake.clearLog();
    expect((await restore()).status).toBe(404);
    expect(fake.writes).toEqual([]);
  });

  it('RS3: a stranger: 403, zero writes', async () => {
    seedCronOctober();
    await manual(october(12000, { replace: true }));
    fake.clearLog();
    expect((await restore('stranger')).status).toBe(403);
    expect(fake.writes).toEqual([]);
  });

  it('a pointer whose version is gone: 404, zero writes', async () => {
    seedCronOctober();
    fake.set(OCT, { ...fake.get(OCT)!, previous: { versionId: 'missing', archivedAt: NOW.toISOString() } });
    fake.clearLog();
    expect((await restore()).status).toBe(404);
    expect(fake.writes).toEqual([]);
  });
});
