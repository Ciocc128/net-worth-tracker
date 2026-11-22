/**
 * F03 — the backup file's name, its check and the retention (doc/backup/README.md § 5–6, D-BK2).
 */
import { describe, expect, it } from 'vitest';
import { assertBackupFile, backupFileName, diffKeys, formatBackupStamp, selectBackupsToPrune } from '@/scripts/lib/backup/backupFile';

describe('formatBackupStamp', () => {
  it("uses Italy's clock: 20:15 UTC on 22 Nov is 21:15 in Rome (CET, +1)", () => {
    expect(formatBackupStamp(new Date('2026-11-22T20:15:00Z'))).toBe('2026-11-22T21-15');
  });
  it('and in summer Rome is +2: 23:30 UTC on 30 Jun is 01:30 on 1 Jul', () => {
    expect(formatBackupStamp(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01T01-30');
  });
});

describe('backupFileName', () => {
  const at = new Date('2026-11-22T20:15:00Z');
  it('names the whole database and one account apart', () => {
    expect(backupFileName('my-proj', { kind: 'all' }, at)).toBe('nwt-backup-my-proj-all-2026-11-22T21-15.json');
    expect(backupFileName('my-proj', { kind: 'user', uid: 'abc/1', email: null }, at)).toBe('nwt-backup-my-proj-user-abc_1-2026-11-22T21-15.json');
  });
});

describe('selectBackupsToPrune', () => {
  const full = (stamp: string, project = 'p') => `nwt-backup-${project}-all-${stamp}.json`;

  it('keeps everything while there are 8 or fewer', () => {
    const names = ['2026-01-04T21-00', '2026-01-11T21-00', '2026-01-18T21-00'].map((s) => full(s));
    expect(selectBackupsToPrune(names, 'p')).toEqual([]);
  });

  it('keeps the newest 8 plus the first of each month', () => {
    // 12 Sundays, Jan 4 → Mar 22. Newest 8: Feb 1 … Mar 22. First of each month: Jan 4, Feb 1, Mar 1.
    // Deleted: Jan 11, Jan 18, Jan 25 (January, not the first, not among the newest 8).
    const stamps = ['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25', '2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22', '2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22'];
    const names = stamps.map((d) => full(`${d}T21-00`));
    expect(selectBackupsToPrune(names, 'p')).toEqual([full('2026-01-11T21-00'), full('2026-01-18T21-00'), full('2026-01-25T21-00')]);
  });

  it("never touches single-account exports, another project's backups, or other files", () => {
    const names = Array.from({ length: 10 }, (_, i) => full(`2026-01-${String(i + 10).padStart(2, '0')}T21-00`));
    const others = ['nwt-backup-p-user-u1-2026-01-01T10-00.json', full('2026-01-01T10-00', 'other'), 'notes.txt', 'backup.log'];
    // 10 January files of p: newest 8 = 12…19, first of January = 10; deleted = 11.
    expect(selectBackupsToPrune([...others, ...names], 'p')).toEqual([full('2026-01-11T21-00')]);
  });
});

describe('assertBackupFile', () => {
  it('refuses a JSON that is not a backup, or of another version', () => {
    expect(() => assertBackupFile({ hello: 1 })).toThrow(/not a net-worth-tracker backup/);
    expect(() => assertBackupFile({ format: 'nwt-backup', version: 2 })).toThrow(/unsupported backup version 2/);
    expect(() => assertBackupFile({ format: 'nwt-backup', version: 1, documents: [], counts: {}, scope: { kind: 'all' } })).not.toThrow();
  });
});

describe('diffKeys', () => {
  it('says which top-level fields come back, go away or change', () => {
    expect(diffKeys({ a: 1, b: 2, c: { x: 1 } }, { a: 1, c: { x: 2 }, d: 4 })).toEqual({ added: ['d'], removed: ['b'], changed: ['c'] });
    expect(diffKeys(null, { a: 1 })).toEqual({ added: ['a'], removed: [], changed: [] });
  });
});
