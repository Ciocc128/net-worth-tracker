import { describe, expect, it } from 'vitest';
import { navGroups, groupedNav, primaryNav, secondaryHrefs } from '@/lib/constants/navigation';

describe('navGroups — the one source of the menu groups (RU1)', () => {
  it('orders the groups by object: Panoramica loose, then four labelled groups', () => {
    expect(navGroups.map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([
      [null, ['Panoramica']],
      ['Entrate e spese', ['Cashflow', 'Analisi spese']],
      ['Investimenti', ['Patrimonio', 'Allocazione', 'Rendimenti']],
      ['Futuro', ['FIRE', 'Traguardi', 'Previdenza']],
      ['Storia', ['Storico', 'Hall of Fame']],
    ]);
  });

  it('lists every route once and keeps the three pill routes', () => {
    const hrefs = groupedNav.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const p of primaryNav) expect(hrefs).toContain(p.href);
  });

  it('derives the «Altro» hrefs from the groups, without the pill routes', () => {
    for (const p of primaryNav) expect(secondaryHrefs).not.toContain(p.href);
    expect(secondaryHrefs).toContain('/dashboard/analisi');
    expect(secondaryHrefs).toContain('/dashboard/settings');
  });
});
