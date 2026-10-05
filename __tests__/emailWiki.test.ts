/**
 * The Wiki in the periodic emails (lib/utils/emailWiki.ts, F5 of doc/ai-open-models-wiki.md):
 * the window's months, the pages cleaned and cut by code, the macro block and the rules — each
 * rule only with the block it governs.
 */

import { describe, expect, it } from 'vitest';

import {
  MACRO_DEPTH,
  buildWikiSystemBlock,
  cleanMacroMonthPage,
  cleanPrinciplesDigest,
  emailWikiMonths,
  formatMacroForPrompt,
  hasEmailWiki,
  monthLabel,
  prepareMacroMonthPage,
  reduceMacroMonthPage,
  stripWikiLinks,
  type EmailWikiContext,
} from '@/lib/utils/emailWiki';
import { DECOY_MACRO, DECOY_PRINCIPLE, DIGEST, monthPage } from './emailWikiFixture';

const context = (overrides: Partial<EmailWikiContext> = {}): EmailWikiContext => ({
  principles: null,
  months: [],
  missingMonths: [],
  depth: 'full',
  ...overrides,
});

describe('emailWikiMonths', () => {
  it('is the month alone for a monthly window, every month of a quarter or a year otherwise', () => {
    expect(emailWikiMonths(2026, 9, 9)).toEqual(['2026-09']);
    expect(emailWikiMonths(2026, 7, 9)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(emailWikiMonths(2026, 1, 12)).toHaveLength(12);
    expect(emailWikiMonths(2026, 1, 12)[0]).toBe('2026-01');
  });

  it('names a month in Italian, lower case', () => {
    expect(monthLabel('2026-09')).toBe('settembre 2026');
  });

  it('keeps whole pages up to a quarter and cuts them from a semester up (owner, 2026-10-05)', () => {
    expect(MACRO_DEPTH).toEqual({ monthly: 'full', quarterly: 'full', semiannual: 'reduced', yearly: 'reduced' });
  });
});

describe('cleanMacroMonthPage', () => {
  const cleaned = cleanMacroMonthPage(monthPage('2026-09'));

  it('drops the frontmatter, the title, the preamble and the list of the weeks', () => {
    expect(cleaned).not.toContain('tipo:');
    expect(cleaned).not.toContain('# Macro —');
    expect(cleaned).not.toContain('Rigenerata');
    expect(cleaned).not.toContain('## Le settimane');
    expect(cleaned).not.toContain('[[');
    expect(cleaned.startsWith('## Fatti')).toBe(true);
  });

  it('keeps every fact, every thesis and the index table', () => {
    expect(cleaned).toContain('Primo fatto sui tassi.');
    expect(cleaned).toContain(DECOY_MACRO);
    expect(cleaned).toContain('Tesi numero 1 del mese.');
    expect(cleaned).toContain('Tesi numero 10 del mese.');
    expect(cleaned).toContain('MSCI All Country World');
  });
});

describe('reduceMacroMonthPage', () => {
  const reduced = reduceMacroMonthPage(cleanMacroMonthPage(monthPage('2026-09')));

  it('keeps the two most recent facts per area — the last ones, where the month ended', () => {
    expect(reduced).not.toContain('Primo fatto sui tassi.');
    expect(reduced).toContain('Secondo fatto sui tassi.');
    expect(reduced).toContain('Terzo fatto sui tassi.');
    // An area with one fact keeps it.
    expect(reduced).toContain(DECOY_MACRO);
    expect(reduced).toContain('### Tassi');
    expect(reduced).toContain('### Azionario');
  });

  it('keeps the eight most recent theses, the opinion note and the index table', () => {
    expect(reduced).not.toContain('Tesi numero 2 del mese.');
    expect(reduced).toContain('Tesi numero 3 del mese.');
    expect(reduced).toContain('Tesi numero 10 del mese.');
    expect(reduced).toContain('_Opinioni di TheBull, non fatti._');
    expect(reduced).toContain('+1.39%');
  });

  it('is what prepareMacroMonthPage gives at the reduced depth, the cleaned page at the full one', () => {
    const page = monthPage('2026-09');
    expect(prepareMacroMonthPage(page, 'reduced')).toBe(reduced);
    expect(prepareMacroMonthPage(page, 'full')).toBe(cleanMacroMonthPage(page));
    expect(reduced.length).toBeLessThan(cleanMacroMonthPage(page).length);
  });
});

describe('cleanPrinciplesDigest', () => {
  it('keeps the themes and drops the frontmatter, the title, the vault note and the links', () => {
    const digest = cleanPrinciplesDigest(DIGEST)!;
    expect(digest.startsWith('## Allocazione e leva\n')).toBe(true);
    expect(digest).toContain(DECOY_PRINCIPLE);
    expect(digest).toContain('Vedi anche il comportamento.');
    expect(digest).not.toContain('Massimo 3.000 token');
    expect(digest).not.toContain('[[');
    expect(digest).not.toContain('tipo: digest');
  });

  it('is null when nothing is left', () => {
    expect(cleanPrinciplesDigest('---\ntipo: digest\n---\n\n# Principi — digest\n')).toBeNull();
    expect(cleanPrinciplesDigest('')).toBeNull();
  });

  it('keeps a body with no themed section', () => {
    expect(cleanPrinciplesDigest('# Principi\n\n- Una regola sola.\n')).toBe('- Una regola sola.');
  });
});

describe('stripWikiLinks', () => {
  it('keeps a link text, drops a parenthesised link, names a bare one', () => {
    expect(stripWikiLinks('a [[x/y|Testo]] b')).toBe('a Testo b');
    expect(stripWikiLinks('## Tema ([[wiki/principi/tema]])')).toBe('## Tema');
    expect(stripWikiLinks('vedi [[wiki/principi/tema]]')).toBe('vedi tema');
  });
});

describe('formatMacroForPrompt', () => {
  it('is empty without a month page', () => {
    expect(formatMacroForPrompt(context({ principles: 'x', missingMonths: ['2026-09'] }))).toEqual([]);
  });

  it('names the months it covers, one heading each, the page one level below it', () => {
    const text = formatMacroForPrompt(context({ months: [{ month: '2026-09', page: '## Fatti\n\n### Tassi\n\n- F.' }] })).join('\n');
    expect(text).toContain('--- CONTESTO MACRO (newsletter TheBull, settembre 2026) ---');
    expect(text).toContain('## Macro di settembre 2026\n\n### Fatti\n\n#### Tassi');
    expect(text).not.toContain('Nessuna pagina macro');
  });

  it('says which months of the window have no page, so a silence is not read as a quiet month', () => {
    const text = formatMacroForPrompt(
      context({ months: [{ month: '2026-08', page: 'A' }, { month: '2026-09', page: 'S' }], missingMonths: ['2026-07'] })
    ).join('\n');
    expect(text).toContain('agosto 2026, settembre 2026');
    expect(text).toContain('Nessuna pagina macro per luglio 2026');
  });

  it('says how a reduced page was cut', () => {
    const text = formatMacroForPrompt(context({ months: [{ month: '2026-09', page: 'P' }], depth: 'reduced' })).join('\n');
    expect(text).toContain('i 2 fatti più recenti per area, le 8 tesi più recenti');
  });
});

describe('buildWikiSystemBlock', () => {
  const macroOnly = context({ months: [{ month: '2026-09', page: 'P' }] });
  const principlesOnly = context({ principles: `- regola del ${DECOY_PRINCIPLE}` });
  const both = context({ months: macroOnly.months, principles: principlesOnly.principles });

  it('is null without the Wiki or with an empty one', () => {
    expect(buildWikiSystemBlock(null)).toBeNull();
    expect(buildWikiSystemBlock(context({ missingMonths: ['2026-09'] }))).toBeNull();
    expect(hasEmailWiki(context())).toBe(false);
  });

  it('with the macro alone carries the macro rules and never promises principles', () => {
    const block = buildWikiSystemBlock(macroOnly)!;
    expect(block.startsWith('# Contesto macro\n')).toBe(true);
    expect(block).toContain('le tesi sono opinioni');
    expect(block).toContain('mai le entrate e le spese personali');
    expect(block).toContain('Nessuna cifra del portafoglio viene dal contesto macro');
    expect(block).not.toContain('PRINCIPI');
  });

  it('with the principles alone carries their rules and the digest, never the macro', () => {
    const block = buildWikiSystemBlock(principlesOnly)!;
    expect(block.startsWith("# Principi dell'investitore\n")).toBe(true);
    expect(block).toContain('orientano il GIUDIZIO, non i NUMERI');
    expect(block).toContain('lo nomina');
    expect(block).toContain('contraddicono un principio');
    expect(block).toContain(`--- PRINCIPI DELL'INVESTITORE ---\n- regola del ${DECOY_PRINCIPLE}`);
    expect(block).not.toContain('CONTESTO MACRO');
  });

  it('with both carries the six rules under one title', () => {
    const block = buildWikiSystemBlock(both)!;
    expect(block.startsWith("# Contesto macro e principi dell'investitore\n")).toBe(true);
    expect(block.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(7); // six rules + the digest's line
  });
});
