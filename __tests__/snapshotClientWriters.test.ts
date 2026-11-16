/**
 * The two client-side writers of `monthly-snapshots` — doc/snapshot-integri/README.md § 6, SN1
 * (the note: `updateDoc` of the note alone, RI16) and DG1 (the generator: the builder, no merge,
 * never over an existing month, RI18). `firebase/firestore` is mocked: the rules that refuse
 * anything else (RI17) are proved on the emulator (CA6).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateDocMock, setDocMock, getDocsMock, deleteFieldSentinel } = vi.hoisted(() => ({
  updateDocMock: vi.fn(),
  setDocMock: vi.fn(),
  getDocsMock: vi.fn(),
  deleteFieldSentinel: { __delete: true },
}));

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  // doc(collectionRef, id) or doc(db, collection, id): the id is the last argument.
  doc: vi.fn((...args: unknown[]) => ({ id: args[args.length - 1] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: getDocsMock,
  updateDoc: updateDocMock,
  setDoc: setDocMock,
  deleteField: () => deleteFieldSentinel,
}));

import { updateSnapshotNote } from '@/lib/services/snapshotService';
import { describeDummySnapshotResult, generateDummySnapshots } from '@/lib/services/dummySnapshotGenerator';

beforeEach(() => {
  vi.clearAllMocks();
  updateDocMock.mockResolvedValue(undefined);
  setDocMock.mockResolvedValue(undefined);
});

describe('SN1 — the note', () => {
  it('updateDoc with the note alone: no userId, no merge', async () => {
    await updateSnapshotNote('owner-1', 2026, 10, '  Fenicottero  ');
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [ref, patch] = updateDocMock.mock.calls[0];
    expect((ref as { id: string }).id).toBe('owner-1-2026-10');
    expect(patch).toEqual({ note: 'Fenicottero' });
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('an empty note sends deleteField()', async () => {
    await updateSnapshotNote('owner-1', 2026, 10, '');
    expect(updateDocMock.mock.calls[0][1]).toEqual({ note: deleteFieldSentinel });
  });

  it('a month without a snapshot fails with the dialog sentence', async () => {
    updateDocMock.mockRejectedValue(Object.assign(new Error('No document to update'), { code: 'not-found' }));
    await expect(updateSnapshotNote('owner-1', 2026, 10, 'Ornitorinco')).rejects.toThrow('Questo mese non ha uno snapshot');
  });
});

describe('DG1 — the generator', () => {
  it('twelve months asked, two hold a real snapshot: ten writes, none on the two; each dummy', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T11:00:00.000Z'));
    getDocsMock.mockResolvedValue({
      docs: [
        { data: () => ({ userId: 'owner-1', year: 2026, month: 11, totalNetWorth: 10000, createdAt: { toDate: () => new Date() } }) },
        { data: () => ({ userId: 'owner-1', year: 2026, month: 6, totalNetWorth: 9000, createdAt: { toDate: () => new Date() } }) },
      ],
    });

    const result = await generateDummySnapshots({ userId: 'owner-1', initialNetWorth: 50000, monthlyGrowthRate: 1, numberOfMonths: 12 });
    vi.useRealTimers();

    expect(result).toEqual({ written: 10, skipped: 2 });
    expect(setDocMock).toHaveBeenCalledTimes(10);
    const ids = setDocMock.mock.calls.map(([ref]) => (ref as { id: string }).id);
    expect(ids).not.toContain('owner-1-2026-11');
    expect(ids).not.toContain('owner-1-2026-6');
    for (const [, data, options] of setDocMock.mock.calls) {
      expect(options).toBeUndefined();
      expect(data).toMatchObject({ isDummy: true, writtenBy: 'dummy' });
    }
  });

  it('the toast says how many months were skipped', () => {
    expect(describeDummySnapshotResult({ written: 10, skipped: 2 }, false)).toBe(
      "10 snapshot fittizi creati con successo! 2 mesi avevano già uno snapshot e sono rimasti com'erano."
    );
    expect(describeDummySnapshotResult({ written: 12, skipped: 0 }, true)).toBe('12 snapshot e dati di spese/entrate creati con successo!');
  });
});
