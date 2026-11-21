import { describe, expect, it } from 'vitest';
import { bandPages, buildFolders, findOpenFolder, findOpenPage, folderTarget, rememberFolderPage } from '@/lib/utils/folderNav';

/** A Map behind the two methods the helpers use. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('folder row', () => {
  const folders = buildFolders(true);

  it('has one folder per group and the Assistente last', () => {
    // navGroups: Panoramica · Entrate e spese · Investimenti · Futuro · Storia = 5, plus the Assistente = 6.
    expect(folders.map((f) => f.label)).toEqual([
      'Panoramica', 'Entrate e spese', 'Investimenti', 'Futuro', 'Storia', 'Assistente AI',
    ]);
    expect(buildFolders(false)).toHaveLength(5);
  });

  it('opens the folder of the page, and none outside the groups', () => {
    expect(findOpenFolder(folders, '/dashboard/analisi')?.label).toBe('Entrate e spese');
    expect(findOpenFolder(folders, '/dashboard/allocation')?.label).toBe('Investimenti');
    expect(findOpenFolder(folders, '/dashboard')?.label).toBe('Panoramica');
    expect(findOpenFolder(folders, '/dashboard/assistant')?.label).toBe('Assistente AI');
    expect(findOpenFolder(folders, '/dashboard/settings')).toBeUndefined();
  });

  it('names the open page inside the folder', () => {
    const invest = findOpenFolder(folders, '/dashboard/performance')!;
    expect(findOpenPage(invest, '/dashboard/performance')?.name).toBe('Rendimenti');
  });

  it('opens a folder on the last page read in it, the first otherwise (D-FD11)', () => {
    const invest = folders[2];
    const storage = fakeStorage();
    expect(folderTarget(invest, storage)).toBe('/dashboard/assets');
    // Investimenti → Allocazione → Panoramica → Investimenti lands on Allocazione.
    rememberFolderPage(invest, '/dashboard/allocation', storage);
    expect(folderTarget(invest, storage)).toBe('/dashboard/allocation');
    expect(folderTarget(folders[3], storage)).toBe('/dashboard/fire-simulations');
  });

  it('ignores a stored page that is no longer in the folder', () => {
    const invest = folders[2];
    const storage = fakeStorage({ [`nwt:folder-last:${invest.key}`]: '/dashboard/gone' });
    expect(folderTarget(invest, storage)).toBe('/dashboard/assets');
  });

  // D-FD19: the band's tabs carry the menu's names, so Analisi is «Analisi spese» wherever it is read.
  it('lists the open group\'s pages by their menu names on the band\'s edge', () => {
    const money = findOpenFolder(folders, '/dashboard/analisi');
    expect(bandPages(money, '/dashboard/analisi')).toEqual([
      { href: '/dashboard/cashflow', name: 'Cashflow' },
      { href: '/dashboard/analisi', name: 'Analisi spese' },
    ]);
    // The same two tabs from Cashflow: the name never changes with the page you are on.
    expect(bandPages(findOpenFolder(folders, '/dashboard/cashflow'), '/dashboard/cashflow')).toEqual(bandPages(money, '/dashboard/analisi'));
  });

  it('gives a page outside the groups its own single tab, and nothing to an unknown route', () => {
    expect(bandPages(undefined, '/dashboard/settings')).toEqual([{ href: '/dashboard/settings', name: 'Impostazioni' }]);
    expect(bandPages(findOpenFolder(folders, '/dashboard/assistant'), '/dashboard/assistant').map((p) => p.name)).toEqual(['Assistente AI']);
    expect(bandPages(undefined, '/dashboard/nowhere')).toEqual([]);
  });
});
