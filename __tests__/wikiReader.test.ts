/**
 * The vault reader of the periodic emails (lib/server/wiki/wikiReader.ts, F5): retrieval by date
 * over a simulated vault — a month, a quarter with a month missing, a year cut by code, a vault
 * that fails — and the owner-only gate. Nothing leaves the process.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadEmailWiki, readEmailWiki } from '@/lib/server/wiki/wikiReader';
import type { VaultClient } from '@/lib/server/wiki/githubVault';
import { DECOY_MACRO, DECOY_PRINCIPLE, DIGEST, monthPage } from './emailWikiFixture';

function fakeVault(files: Record<string, string>, failing: string[] = []): VaultClient & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    readFile: vi.fn(async (path: string) => {
      reads.push(path);
      if (failing.includes(path)) throw new Error(`[vault] read ${path} failed with HTTP 500`);
      return files[path] ?? null;
    }),
    listDir: vi.fn(async () => []),
    commit: vi.fn(async () => null),
  };
}

const VAULT = {
  'wiki/principi/_digest.md': DIGEST,
  'wiki/macro/mesi/2026-08.md': monthPage('2026-08'),
  'wiki/macro/mesi/2026-09.md': monthPage('2026-09'),
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('readEmailWiki', () => {
  it('a monthly email reads its month page and the digest — two reads, nothing else', async () => {
    const vault = fakeVault(VAULT);
    const wiki = await readEmailWiki(vault, { periodType: 'monthly', year: 2026, startMonth: 9, endMonth: 9 });
    expect(vault.reads.sort()).toEqual(['wiki/macro/mesi/2026-09.md', 'wiki/principi/_digest.md']);
    expect(wiki.months.map((m) => m.month)).toEqual(['2026-09']);
    expect(wiki.months[0].page).toContain(DECOY_MACRO);
    expect(wiki.months[0].page).toContain('Primo fatto sui tassi.'); // whole page
    expect(wiki.principles).toContain(DECOY_PRINCIPLE);
    expect(wiki.missingMonths).toEqual([]);
    expect(wiki.depth).toBe('full');
  });

  it('a quarter reads its three months; a month without a page is named, not invented', async () => {
    const vault = fakeVault(VAULT);
    const wiki = await readEmailWiki(vault, { periodType: 'quarterly', year: 2026, startMonth: 7, endMonth: 9 });
    expect(vault.reads).toHaveLength(4);
    expect(wiki.months.map((m) => m.month)).toEqual(['2026-08', '2026-09']);
    expect(wiki.missingMonths).toEqual(['2026-07']);
    expect(wiki.depth).toBe('full');
  });

  it('a year reads its twelve months and cuts each page by code', async () => {
    const vault = fakeVault(VAULT);
    const wiki = await readEmailWiki(vault, { periodType: 'yearly', year: 2026, startMonth: 1, endMonth: 12 });
    expect(vault.reads).toHaveLength(13);
    expect(wiki.depth).toBe('reduced');
    expect(wiki.missingMonths).toHaveLength(10);
    expect(wiki.months[0].page).not.toContain('Primo fatto sui tassi.');
    expect(wiki.months[0].page).toContain('Terzo fatto sui tassi.');
  });

  it('a vault that fails is an absent vault: no page, no digest, no throw', async () => {
    const vault = fakeVault(VAULT, Object.keys(VAULT));
    const wiki = await readEmailWiki(vault, { periodType: 'monthly', year: 2026, startMonth: 9, endMonth: 9 });
    expect(wiki).toEqual({ principles: null, months: [], missingMonths: ['2026-09'], depth: 'full' });
  });

  it('one failed read costs that page only', async () => {
    const vault = fakeVault(VAULT, ['wiki/principi/_digest.md']);
    const wiki = await readEmailWiki(vault, { periodType: 'monthly', year: 2026, startMonth: 9, endMonth: 9 });
    expect(wiki.principles).toBeNull();
    expect(wiki.months).toHaveLength(1);
  });
});

describe('loadEmailWiki', () => {
  const window = { periodType: 'monthly' as const, year: 2026, startMonth: 9, endMonth: 9 };
  const env = { WIKI_EXPORT_UID: 'owner', WIKI_GITHUB_TOKEN: 't', WIKI_GITHUB_REPO: 'a/finance-wiki' };

  it("reads the vault for the vault's owner, with the vault's own settings", async () => {
    const vault = fakeVault(VAULT);
    const makeClient = vi.fn(() => vault);
    const wiki = await loadEmailWiki('owner', window, env, makeClient);
    expect(makeClient).toHaveBeenCalledWith({ token: 't', repo: 'a/finance-wiki', branch: 'main' });
    expect(wiki?.months).toHaveLength(1);
  });

  it('is null for anyone else — the digest is personal — and reads nothing', async () => {
    const makeClient = vi.fn(() => fakeVault(VAULT));
    expect(await loadEmailWiki('someone-else', window, env, makeClient)).toBeNull();
    expect(await loadEmailWiki('owner', window, { ...env, WIKI_EXPORT_UID: undefined }, makeClient)).toBeNull();
    expect(makeClient).not.toHaveBeenCalled();
  });

  it('is null when the vault is not configured', async () => {
    const makeClient = vi.fn(() => fakeVault(VAULT));
    expect(await loadEmailWiki('owner', window, { WIKI_EXPORT_UID: 'owner' }, makeClient)).toBeNull();
    expect(makeClient).not.toHaveBeenCalled();
  });
});
