/**
 * The month page as the vault holds it (vault SCHEMA.md § 4.2): what `reduceMacroMonthPage` looks
 * for by TEXT, proved on a real page — `wiki/macro/mesi/2026-09.md` of Ciocc128/finance-wiki,
 * copied 2026-10-11 with each bullet's sentence cut to 30 characters (the newsletter's text stays
 * in the private vault; headings, area names, week suffixes and the index table are verbatim).
 * If the vault renames a heading, this fails; if the app does, it fails too.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REDUCED_FACTS_PER_AREA,
  REDUCED_THESES,
  cleanMacroMonthPage,
  reduceMacroMonthPage,
} from '@/lib/utils/emailWiki';

const page = readFileSync(join(__dirname, 'fixtures', 'vault-macro-mese-2026-09.md'), 'utf8');
const cleaned = cleanMacroMonthPage(page);
const reduced = reduceMacroMonthPage(cleaned);
const bullets = (text: string) => text.split('\n').filter((line) => line.startsWith('- '));

/** The `### <area>` blocks of the `## Fatti` section, by area name. */
function factAreas(text: string): Map<string, string[]> {
  const fatti = text.split(/\n(?=## )/).find((s) => s.startsWith('## Fatti')) ?? '';
  const areas = new Map<string, string[]>();
  for (const block of fatti.split(/\n(?=### )/).slice(1)) {
    const [head, ...rest] = block.split('\n');
    areas.set(head.replace('### ', ''), bullets(rest.join('\n')));
  }
  return areas;
}

const weekOf = (bullet: string) => bullet.match(/\((\d{4}-W\d\d)\)$/)?.[1] ?? '';

describe('a real vault month page (SCHEMA § 4.2)', () => {
  it('opens with the headings the app looks for, in order, and drops «Le settimane»', () => {
    const headings = cleaned.split('\n').filter((line) => line.startsWith('## '));
    expect(headings).toEqual(['## Fatti', "## Tesi dell'autore", '## Rendimenti degli indici (ultima settimana del mese)']);
    expect(cleaned).not.toContain('Le settimane');
    expect(cleaned).not.toContain('[[');
    expect(cleaned).not.toContain('tipo:');
  });

  it('has facts by area, each bullet ordered by week with the latest last', () => {
    const areas = factAreas(cleaned);
    expect(areas.size).toBeGreaterThanOrEqual(5);
    for (const [area, facts] of areas) {
      expect(facts.length, area).toBeGreaterThan(0);
      const weeks = facts.map(weekOf);
      expect(weeks.every(Boolean), area).toBe(true);
      expect(weeks, area).toEqual([...weeks].sort());
    }
  });

  it('keeps per area the most recent facts and the most recent theses, and the index table whole', () => {
    const before = factAreas(cleaned);
    const after = factAreas(reduced);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [area, facts] of before) {
      expect(after.get(area), area).toEqual(facts.slice(-REDUCED_FACTS_PER_AREA));
    }
    const theses = (text: string) => bullets(text.split(/\n(?=## )/).find((s) => s.startsWith("## Tesi dell'autore")) ?? '');
    expect(theses(cleaned).length).toBeGreaterThan(REDUCED_THESES);
    expect(theses(reduced)).toEqual(theses(cleaned).slice(-REDUCED_THESES));

    const table = (text: string) => text.split('\n').filter((line) => line.startsWith('|'));
    expect(table(cleaned).length).toBeGreaterThan(2);
    expect(table(reduced)).toEqual(table(cleaned));
    expect(reduced).toContain('_Opinioni di TheBull, non fatti._');
    expect(reduced).toContain('_Variazioni in %');
  });
});
