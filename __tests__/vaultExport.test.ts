/**
 * The app's numbers → the vault (lib/server/wiki/vaultExport.ts) on an in-memory vault and
 * injected loaders: one commit for the whole run of months, a month without a snapshot skipped
 * and named in the log, the running month marked partial except on its last day.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// The default loaders read Firestore; every test injects its own.
vi.mock('@/lib/services/assistantMonthContextService', () => ({}));
vi.mock('@/lib/server/assetAdminRepository', () => ({}));
vi.mock('@/lib/server/emailPeriodComparison', () => ({}));
vi.mock('@/lib/server/monthlyEmailService', () => ({
  isLastDayOfMonthItaly: (now: Date) => now.toISOString().startsWith('2026-09-30'),
}));

import { exportToVault, monthsBetween, type MonthExport, type YearMonth } from '@/lib/server/wiki/vaultExport';
import type { VaultClient, VaultFile } from '@/lib/server/wiki/githubVault';

function memoryVault(initial: Record<string, string> = { 'log.md': '# Log\n' }) {
  const files = new Map(Object.entries(initial));
  const commits: { message: string; paths: string[] }[] = [];
  const vault: VaultClient = {
    readFile: async (path) => files.get(path) ?? null,
    listDir: async () => [],
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

const monthData = ({ year, month }: YearMonth): MonthExport => ({
  sections: ['--- PATRIMONIO ---', `Fenicottero ${year}-${month}`],
  portfolioSections: ['--- ALLOCAZIONE vs TARGET (come la pagina Allocazione) ---', `Ornitorinco ${month}`],
});

const latest = async () => ({
  year: 2026,
  month: 9,
  holdings: [{ name: 'Fenicottero ETF', ticker: 'FNCT', classLabel: 'Azioni', subCategory: null, quantity: 2, price: 50, value: 100 }],
});

describe('exportToVault', () => {
  it('writes every month, the portfolio and the log line in ONE commit', async () => {
    const { vault, files, commits } = memoryVault();
    const loadMonth = vi.fn(async (_uid: string, at: YearMonth) => monthData(at));
    const outcome = await exportToVault('owner', monthsBetween({ year: 2026, month: 7 }, { year: 2026, month: 9 }), {
      vault,
      loadMonth,
      loadLatestSnapshot: latest,
      now: () => new Date('2026-09-15T10:00:00.000Z'),
    });

    expect(outcome).toEqual({ written: ['2026-07', '2026-08', '2026-09'], skipped: [], portfolio: true, sha: 'sha1' });
    expect(commits).toEqual([
      { message: 'export: dati/2026-07…2026-09', paths: ['dati/2026-07.md', 'dati/2026-08.md', 'dati/2026-09.md', 'dati/portafoglio.md', 'log.md'] },
    ]);
    expect(files.get('log.md')).toBe('# Log\n- 2026-09-15T10:00Z · export · dati/2026-07…2026-09 · ok\n');
    // The portfolio reuses the month already loaded: no second read of September.
    expect(loadMonth).toHaveBeenCalledTimes(3);
    expect(files.get('dati/portafoglio.md')).toContain('Ornitorinco 9');
    expect(files.get('dati/2026-08.md')).toContain('Fenicottero 2026-8');
  });

  it('marks the running month partial and the closed ones final', async () => {
    const { vault, files } = memoryVault();
    await exportToVault('owner', monthsBetween({ year: 2026, month: 8 }, { year: 2026, month: 9 }), {
      vault,
      loadMonth: async (_uid, at) => monthData(at),
      loadLatestSnapshot: latest,
      now: () => new Date('2026-09-15T10:00:00.000Z'),
    });
    expect(files.get('dati/2026-08.md')).toContain('parziale: false');
    expect(files.get('dati/2026-09.md')).toContain('parziale: true');
  });

  it('treats the last day of the month as closed, as the monthly email does', async () => {
    const { vault, files } = memoryVault();
    await exportToVault('owner', [{ year: 2026, month: 9 }], {
      vault,
      loadMonth: async (_uid, at) => monthData(at),
      loadLatestSnapshot: latest,
      now: () => new Date('2026-09-30T18:00:00.000Z'),
    });
    expect(files.get('dati/2026-09.md')).toContain('parziale: false');
  });

  it('skips a month without a snapshot and names it in the log, never an empty file', async () => {
    const { vault, files, commits } = memoryVault();
    const outcome = await exportToVault('owner', monthsBetween({ year: 2026, month: 1 }, { year: 2026, month: 2 }), {
      vault,
      loadMonth: async (_uid, at) => (at.month === 1 ? null : monthData(at)),
      loadLatestSnapshot: latest,
      now: () => new Date('2026-09-15T10:00:00.000Z'),
    });
    expect(outcome.skipped).toEqual(['2026-01']);
    expect(files.has('dati/2026-01.md')).toBe(false);
    expect(commits[0].paths).toEqual(['dati/2026-02.md', 'dati/portafoglio.md', 'log.md']);
    expect(files.get('log.md')).toContain('· export · dati/2026-02 · ok · senza snapshot: 2026-01');
  });

  it('commits nothing when there is neither a month nor a snapshot', async () => {
    const { vault, commits } = memoryVault();
    const outcome = await exportToVault('owner', [{ year: 2026, month: 1 }], {
      vault,
      loadMonth: async () => null,
      loadLatestSnapshot: async () => null,
    });
    expect(outcome).toEqual({ written: [], skipped: ['2026-01'], portfolio: false, sha: null });
    expect(commits).toEqual([]);
  });
});

describe('monthsBetween', () => {
  it('crosses the year and includes both ends', () => {
    expect(monthsBetween({ year: 2025, month: 11 }, { year: 2026, month: 2 })).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it('is empty when the range is reversed', () => {
    expect(monthsBetween({ year: 2026, month: 3 }, { year: 2026, month: 1 })).toEqual([]);
  });
});
