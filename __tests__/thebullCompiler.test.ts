/**
 * TheBull → the vault (lib/server/wiki/thebullCompiler.ts) on an in-memory vault and a scripted
 * extractor: one commit per operation, the raw never lost when the model fails, the month rebuilt
 * from its weeks, and the retry counter the daily cron advances (three retries, then `failed`).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ingestTheBull, recompileTheBull, retryPendingTheBull, type Extractor } from '@/lib/server/wiki/thebullCompiler';
import type { VaultClient, VaultFile } from '@/lib/server/wiki/githubVault';
import { compileStates, type MacroWeekRecord } from '@/lib/utils/wikiMacro';
import { DECOY_SUBSCRIBER, FAITHFUL_EXTRACTION, theBullPlainBody } from './thebullFixture';

function memoryVault(initial: Record<string, string> = { 'log.md': '# Log\n' }) {
  const files = new Map(Object.entries(initial));
  const commits: { message: string; paths: string[] }[] = [];
  const vault: VaultClient = {
    readFile: async (path) => files.get(path) ?? null,
    listDir: async (dir) =>
      [...files.keys()].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')).map((p) => p.slice(dir.length + 1)),
    commit: async (message, build) => {
      const built: VaultFile[] = await build();
      if (built.length === 0) return null;
      built.forEach((f) => files.set(f.path, f.content));
      commits.push({ message, paths: built.map((f) => f.path) });
      return { sha: `sha${commits.length}` };
    },
  };
  return { vault, files, commits };
}

const faithful: Extractor = async () => FAITHFUL_EXTRACTION;
const broken: Extractor = async () => null;
const now = () => new Date('2026-06-14T09:30:00.000Z');
const input = { receivedAt: '2026-06-14T06:32:27Z', subject: 'Il fenicottero vola', text: theBullPlainBody() };

describe('ingestTheBull', () => {
  it('commits the raw, the week, its record, the month and two log lines in ONE commit', async () => {
    const { vault, files, commits } = memoryVault();
    const outcome = await ingestTheBull(input, { vault, extract: faithful, now });
    expect(outcome).toEqual({ status: 'ingested', date: '2026-06-14', week: '2026-W24', compiled: true });
    expect(commits).toEqual([
      {
        message: 'ingest: thebull/2026-06-14',
        paths: [
          'raw/thebull/2026-06-14.md',
          'wiki/macro/settimane/2026-W24.md',
          'wiki/macro/settimane/2026-W24.json',
          'wiki/macro/mesi/2026-06.md',
          'log.md',
        ],
      },
    ]);
    expect(files.get('log.md')).toBe('# Log\n- 2026-06-14T09:30Z · ingest · thebull/2026-06-14 · ok\n- 2026-06-14T09:30Z · compile · thebull/2026-06-14 · ok\n');
  });

  it('stores the CLEANED raw, with its provenance, never the subscriber id', async () => {
    const { vault, files } = memoryVault();
    await ingestTheBull(input, { vault, extract: faithful, now });
    const raw = files.get('raw/thebull/2026-06-14.md')!;
    expect(raw).toMatch(/^---\nfonte: "thebull"\nnumero: 7\ndata: "2026-06-14"\noggetto: "Il fenicottero vola"\n/);
    expect(raw).toContain('filtro: "thebull-clean-v1"');
    expect(raw).not.toContain(DECOY_SUBSCRIBER);
    expect(raw).toContain('Il fenicottero decennale è arrivato al 4,25%');
  });

  it('is idempotent on the date: the same issue again commits nothing', async () => {
    const { vault, commits } = memoryVault();
    await ingestTheBull(input, { vault, extract: faithful, now });
    const extract = vi.fn(faithful);
    expect(await ingestTheBull(input, { vault, extract, now })).toEqual({ status: 'duplicate', date: '2026-06-14' });
    expect(commits).toHaveLength(1);
    expect(extract).not.toHaveBeenCalled();
  });

  it('when the model fails, still commits the raw, with a pending line and no page', async () => {
    const { vault, files, commits } = memoryVault();
    const outcome = await ingestTheBull(input, { vault, extract: broken, now });
    expect(outcome).toMatchObject({ status: 'ingested', compiled: false, reason: 'nessuna risposta valida dal modello' });
    expect(commits[0].paths).toEqual(['raw/thebull/2026-06-14.md', 'log.md']);
    expect(files.get('log.md')).toContain('· compile · thebull/2026-06-14 · pending 0/3 (nessuna risposta valida dal modello)');
  });

  it('when more than a third of the quotes are invented, refuses the week the same way', async () => {
    const { vault, files } = memoryVault();
    const invent: Extractor = async () => ({
      ...FAITHFUL_EXTRACTION,
      fatti: [...FAITHFUL_EXTRACTION.fatti, ...[1, 2, 3].map((i) => ({ area: 'altro' as const, paese: '', sintesi: `x${i}`, citazione: `inventata ${i}` }))],
    });
    const outcome = await ingestTheBull(input, { vault, extract: invent, now });
    expect(outcome).toMatchObject({ compiled: false, reason: 'citazioni non verificate: 3 scartate su 7' });
    expect(files.has('wiki/macro/settimane/2026-W24.md')).toBe(false);
  });

  it('dates an issue without its «#n» line by the Italian day of receipt', async () => {
    const { vault } = memoryVault();
    // 23:30 UTC on the 13th is already the 14th in Rome.
    const outcome = await ingestTheBull(
      { ...input, receivedAt: '2026-06-13T23:30:00Z', text: theBullPlainBody({ issueLine: '' }) },
      { vault, extract: faithful, now }
    );
    expect(outcome).toMatchObject({ date: '2026-06-14' });
  });

  it('rebuilds the month from every week of that month, and only that month', async () => {
    const { vault, files } = memoryVault();
    await ingestTheBull(input, { vault, extract: faithful, now });
    await ingestTheBull(
      { ...input, text: theBullPlainBody({ issueLine: '#8 - 21/06/2026' }) },
      { vault, extract: faithful, now }
    );
    // 5 July closes W27, a week that starts on 29 June: the record's DATE, not its week, picks the month.
    await ingestTheBull(
      { ...input, text: theBullPlainBody({ issueLine: '#9 - 05/07/2026' }) },
      { vault, extract: faithful, now }
    );
    const june = files.get('wiki/macro/mesi/2026-06.md')!;
    expect(june).toContain('settimane:\n  - 2026-W24\n  - 2026-W25\n');
    expect(files.get('wiki/macro/mesi/2026-07.md')).toContain('settimane:\n  - 2026-W27\n');
    const record = JSON.parse(files.get('wiki/macro/settimane/2026-W25.json')!) as MacroWeekRecord;
    expect(record).toMatchObject({ week: '2026-W25', date: '2026-06-21', issue: 8, model: 'z-ai/glm-5.3-flash' });
  });
});

describe('the retry: three chances, then failed', () => {
  it('retries a pending week each day, then marks it failed after the third failure', async () => {
    const { vault, files } = memoryVault();
    await ingestTheBull(input, { vault, extract: broken, now });
    for (let day = 0; day < 3; day++) await retryPendingTheBull({ vault, extract: broken, now });
    expect(compileStates(files.get('log.md')!).get('thebull/2026-06-14')).toEqual({ status: 'failed' });
    // A failed week is left alone by the cron.
    const extract = vi.fn(faithful);
    expect(await retryPendingTheBull({ vault, extract, now })).toEqual({ retried: 0, compiled: 0 });
    expect(extract).not.toHaveBeenCalled();
  });

  it('a retry that succeeds writes the pages and closes the week as ok', async () => {
    const { vault, files } = memoryVault();
    await ingestTheBull(input, { vault, extract: broken, now });
    expect(await retryPendingTheBull({ vault, extract: faithful, now })).toEqual({ retried: 1, compiled: 1 });
    expect(files.has('wiki/macro/settimane/2026-W24.md')).toBe(true);
    expect(compileStates(files.get('log.md')!).get('thebull/2026-06-14')).toEqual({ status: 'ok' });
  });

  it('the manual recompile works on a failed week, from the stored raw alone', async () => {
    const { vault, files } = memoryVault();
    await ingestTheBull(input, { vault, extract: broken, now });
    for (let day = 0; day < 3; day++) await retryPendingTheBull({ vault, extract: broken, now });
    expect(await recompileTheBull('2026-06-14', 'manual', { vault, extract: faithful, now })).toEqual({ ok: true });
    expect(files.get('wiki/macro/settimane/2026-W24.md')).toContain('Il fenicottero decennale è arrivato al 4,25%');
    expect(files.get('log.md')!.trim().split('\n').at(-1)).toBe('- 2026-06-14T09:30Z · compile · thebull/2026-06-14 · ok (manuale)');
  });

  it('a manual recompile of a missing raw says so and commits nothing', async () => {
    const { vault, commits } = memoryVault();
    expect(await recompileTheBull('2026-01-01', 'manual', { vault, extract: faithful, now })).toEqual({ ok: false, reason: 'raw/thebull/2026-01-01.md non esiste' });
    expect(commits).toHaveLength(0);
  });
});
