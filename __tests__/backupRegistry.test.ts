/**
 * F03 — the backup registry knows EVERY collection the app writes (doc/backup/README.md § 4).
 * A collection named by `firestore.rules`, by a `*_COLLECTION` constant or by a `.collection('…')`
 * / `collection(db, '…')` / `doc(db, '…')` literal in the app's code must be in
 * `scripts/lib/backup/registry.ts`: otherwise a single-account export would leave it out.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_COLLECTIONS,
  backupSubcollectionNames,
  collectionsToExport,
  countByCollection,
  countKeyOf,
} from '@/scripts/lib/backup/registry';

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['lib', 'app', 'components', 'contexts', 'types', 'hooks'];

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

const known = new Set([...BACKUP_COLLECTIONS.map((c) => c.name), ...backupSubcollectionNames()]);

describe('backup registry', () => {
  it('lists every collection of firestore.rules, subcollections included', () => {
    const rules = readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const names = new Set<string>();
    for (const m of rules.matchAll(/match \/([^{}\s]+?)\/\{/g)) {
      if (m[1] === 'databases') continue;
      names.add(m[1]);
    }
    // nested path segments, e.g. /budgetHistory/{userId}/months/{month}
    for (const m of rules.matchAll(/\}\/([A-Za-z_-]+)\/\{/g)) names.add(m[1]);
    const missing = [...names].filter((n) => !known.has(n));
    expect(missing).toEqual([]);
    expect(names.size).toBeGreaterThan(20); // the parse found the rules at all
  });

  it('lists every collection the code names', () => {
    const names = new Set<string>();
    const patterns = [
      /_COLLECTION\w*\s*=\s*['"]([A-Za-z_-]+)['"]/g,
      /\.collection\(\s*['"]([A-Za-z_-]+)['"]/g,
      /\.collectionGroup\(\s*['"]([A-Za-z_-]+)['"]/g,
      /\bcollection\(\s*db\s*,\s*['"]([A-Za-z_-]+)['"]/g,
      /\bdoc\(\s*db\s*,\s*['"]([A-Za-z_-]+)['"]/g,
    ];
    for (const file of SOURCE_DIRS.flatMap(sourceFiles)) {
      const text = readFileSync(path.join(ROOT, file), 'utf8');
      for (const re of patterns) for (const m of text.matchAll(re)) names.add(m[1]);
    }
    const missing = [...names].filter((n) => !known.has(n)).sort();
    expect(missing).toEqual([]);
    expect(names.has('assets') && names.has('versions') && names.has('messages')).toBe(true);
  });

  it('holds the capacity report list (capacita § 10) and has no duplicates', () => {
    for (const name of ['goalBasedInvesting', 'assistantMemory', 'allowed-users', 'account-access']) expect(known.has(name)).toBe(true);
    expect(BACKUP_COLLECTIONS.find((c) => c.name === 'budgetHistory')?.subcollections).toEqual(['months']);
    expect(BACKUP_COLLECTIONS.find((c) => c.name === 'monthly-snapshots')?.subcollections).toEqual(['versions']);
    expect(BACKUP_COLLECTIONS.find((c) => c.name === 'assistantThreads')?.subcollections).toEqual(['messages']);
    const names = BACKUP_COLLECTIONS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never puts a shared cache into one account, and skips caches unless asked', () => {
    expect(collectionsToExport('user', true).some((c) => c.ownership === 'global')).toBe(false);
    expect(collectionsToExport('all', false).some((c) => c.cache)).toBe(false);
    expect(collectionsToExport('all', true)).toHaveLength(BACKUP_COLLECTIONS.length);
    expect(collectionsToExport('user', false).map((c) => c.name)).toContain('allowed-users');
  });
});

describe('countKeyOf', () => {
  it('names a top-level document by its collection and a nested one by parent/*/sub', () => {
    expect(countKeyOf('assets/a1')).toBe('assets');
    expect(countKeyOf('monthly-snapshots/u1-2025-3/versions/v1')).toBe('monthly-snapshots/*/versions');
    expect(countKeyOf('budgetHistory/u1/months/2025-03')).toBe('budgetHistory/*/months');
    expect(() => countKeyOf('assets')).toThrow();
  });

  it('counts by key, sorted', () => {
    expect(countByCollection(['expenses/e2', 'assets/a1', 'expenses/e1', 'assistantThreads/t1/messages/m1']))
      .toEqual({ assets: 1, 'assistantThreads/*/messages': 1, expenses: 2 });
  });
});
