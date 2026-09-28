/**
 * The macro pages (lib/utils/wikiMacro.ts): the rule that holds every extracted item to a quote
 * copied from the newsletter, the pages the server renders from what survives, and the log.md
 * grammar the daily retry reads. Synthetic fixture, decoy words only.
 */

import { describe, expect, it } from 'vitest';
import { parseTheBull, pointText } from '@/lib/utils/thebullParse';
import {
  MACRO_EXTRACTION_JSON_SCHEMA,
  appendLogLines,
  checkQuotedItem,
  compileStates,
  formatCompileOutcome,
  formatLogLine,
  isExtractionAcceptable,
  macroExtractionSchema,
  nextFailedState,
  normalizeForQuote,
  numbersIn,
  renderMonthPage,
  renderRawFile,
  renderWeekPage,
  sentenceCase,
  verifyExtraction,
  type MacroWeekRecord,
} from '@/lib/utils/wikiMacro';
import { FAITHFUL_EXTRACTION, theBullPlainBody } from './thebullFixture';

const issue = parseTheBull(theBullPlainBody());
const point = pointText(issue);

describe('the quote check', () => {
  const source = normalizeForQuote(point);

  it('accepts a quote copied from the text, typographic apostrophes and line breaks aside', () => {
    expect(checkQuotedItem({ sintesi: 'Al 4,25%.', citazione: 'Il fenicottero decennale è arrivato al 4,25%,\nil massimo da 12 anni.' }, source)).toBeNull();
    expect(checkQuotedItem({ sintesi: 'Rialzo.', citazione: 'La banca dell’ornitorinco ha alzato i tassi il 3 giugno.' }, source)).toBeNull();
  });

  it('rejects a paraphrase', () => {
    expect(checkQuotedItem({ sintesi: 'Rialzo.', citazione: 'La banca ha alzato i tassi a giugno.' }, source)).toBe('citazione-assente');
  });

  it('rejects a number in the summary that the quote does not state', () => {
    expect(checkQuotedItem({ sintesi: 'Al 4,5%.', citazione: 'Il fenicottero decennale è arrivato al 4,25%, il massimo da 12 anni.' }, source)).toBe('numero-fuori-citazione');
    // A year inferred from context is the same fault: «da allora» is not «dal 1981».
    expect(checkQuotedItem({ sintesi: 'Rialzo del 2026.', citazione: "La banca dell'ornitorinco ha alzato i tassi il 3 giugno." }, source)).toBe('numero-fuori-citazione');
  });

  it('reads 4.25 and 4,25 as the same number', () => {
    expect(numbersIn('al 4.25% e 1.000')).toEqual(['4,25', '1,000']);
    expect(checkQuotedItem({ sintesi: 'Al 4.25%.', citazione: 'Il fenicottero decennale è arrivato al 4,25%, il massimo da 12 anni.' }, source)).toBeNull();
  });
});

describe('verifyExtraction and isExtractionAcceptable', () => {
  it('keeps a faithful extraction whole', () => {
    const verified = verifyExtraction(FAITHFUL_EXTRACTION, point);
    expect(verified.kept).toEqual(FAITHFUL_EXTRACTION);
    expect(verified.dropped).toEqual([]);
    expect(isExtractionAcceptable(verified)).toBe(true);
  });

  it('drops a quote repeated, or contained, in a later item as a duplicate — not as a failure', () => {
    const repeated = {
      ...FAITHFUL_EXTRACTION,
      fatti: [...FAITHFUL_EXTRACTION.fatti, { area: 'tassi' as const, paese: '', sintesi: 'Rialzo.', citazione: 'alzato i tassi il 3 giugno.' }],
      tesi: [...FAITHFUL_EXTRACTION.tesi, { area: 'tassi' as const, sintesi: 'Al 4,25%.', citazione: FAITHFUL_EXTRACTION.fatti[0].citazione }],
    };
    const verified = verifyExtraction(repeated, point);
    expect(verified.dropped.map((d) => [d.kind, d.reason])).toEqual([
      ['fatti', 'doppione'],
      ['tesi', 'doppione'],
    ]);
    expect(verified.kept).toEqual(FAITHFUL_EXTRACTION);
    expect(isExtractionAcceptable(verified)).toBe(true);
  });

  it('refuses a week with no fact, and one where more than a third failed its quote', () => {
    expect(isExtractionAcceptable(verifyExtraction({ ...FAITHFUL_EXTRACTION, fatti: [] }, point))).toBe(false);
    const invented = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ area: 'altro' as const, paese: '', sintesi: `Invenzione ${i}.`, citazione: `Frase inventata ${i}.` }));
    // 4 kept, 2 failed: exactly a third — accepted.
    expect(isExtractionAcceptable(verifyExtraction({ ...FAITHFUL_EXTRACTION, fatti: [...FAITHFUL_EXTRACTION.fatti, ...invented(2)] }, point))).toBe(true);
    // 4 kept, 3 failed: more than a third — refused.
    expect(isExtractionAcceptable(verifyExtraction({ ...FAITHFUL_EXTRACTION, fatti: [...FAITHFUL_EXTRACTION.fatti, ...invented(3)] }, point))).toBe(false);
  });
});

describe('the extraction contract', () => {
  it('rejects an unknown area and a missing quote', () => {
    expect(macroExtractionSchema.safeParse(FAITHFUL_EXTRACTION).success).toBe(true);
    expect(macroExtractionSchema.safeParse({ ...FAITHFUL_EXTRACTION, tesi: [{ area: 'meteo', sintesi: 'x', citazione: 'y' }] }).success).toBe(false);
    expect(macroExtractionSchema.safeParse({ ...FAITHFUL_EXTRACTION, spunti: [{ sintesi: 'x' }] }).success).toBe(false);
  });

  it('tells the model a strict schema: every property required, nothing extra', () => {
    const check = (node: Record<string, unknown>): void => {
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties as object));
        Object.values(node.properties as Record<string, Record<string, unknown>>).forEach(check);
      }
      if (node.type === 'array') check(node.items as Record<string, unknown>);
    };
    check(MACRO_EXTRACTION_JSON_SCHEMA);
  });
});

function record(overrides: Partial<MacroWeekRecord> = {}): MacroWeekRecord {
  return {
    week: '2026-W24',
    date: '2026-06-14',
    issue: 7,
    headline: issue.headline,
    subtitle: issue.subtitle,
    model: 'z-ai/glm-5.3-flash',
    compiledAt: '2026-06-14T09:30:00.000Z',
    rawPath: 'raw/thebull/2026-06-14.md',
    extraction: FAITHFUL_EXTRACTION,
    dropped: [],
    indices: issue.indices,
    readings: issue.readings,
    episodes: issue.episodes,
    ...overrides,
  };
}

describe('renderWeekPage', () => {
  const page = renderWeekPage(record());

  it('opens with the frontmatter the vault schema requires, its source listed', () => {
    expect(page.startsWith('---\ntipo: "macro-settimana"\nsettimana: "2026-W24"\n')).toBe(true);
    expect(page).toContain('fonti:\n  - raw/thebull/2026-06-14.md\n---');
    expect(page).toContain('scartate: 0');
  });

  it('puts each item over its quote, facts grouped by area, theses marked as opinions', () => {
    expect(page).toContain("# 2026-W24 — La settimana del fenicottero. E dell'ornitorinco.");
    expect(page).toContain('### Obbligazionario\n\n- Il decennale al 4,25%, massimo da 12 anni. — _Fenicottero_\n  > Il fenicottero decennale è arrivato al 4,25%, il massimo da 12 anni.');
    expect(page).toContain("## Tesi dell'autore\n\n_Opinioni di TheBull, non fatti._");
    expect(page).toContain('## Spunti per i Principi');
  });

  it('renders the index table and the readings from the parse, not from the model', () => {
    expect(page).toContain('| MSCI All Country World | +1.10% | +12.50% | +60.00% | +150.25% |');
    expect(page).toContain('_Variazioni in % al 14/06/2026 in Euro._');
    expect(page).toContain('- [Perché il fenicottero conta](https://example.com/fenicottero) — Rivista Ornitorinco');
  });

  it('lists the dropped items, so a thin week says why', () => {
    const withDropped = renderWeekPage(record({ dropped: [{ kind: 'fatti', sintesi: 'Invenzione.', reason: 'citazione-assente' }] }));
    expect(withDropped).toContain('scartate: 1');
    expect(withDropped).toContain('- fatti · citazione-assente · Invenzione.');
  });
});

describe('renderMonthPage', () => {
  it('orders the weeks by date, tags each fact with its week, and shows the last table', () => {
    const later = record({
      week: '2026-W26',
      date: '2026-06-28',
      indices: { horizons: ['1 mese'], rows: [{ name: 'Oro', values: ['+9.99%'] }], caption: 'fine mese' },
    });
    const page = renderMonthPage('2026-06', [later, record()], '2026-06-28T10:00:00.000Z');
    expect(page).toContain('settimane:\n  - 2026-W24\n  - 2026-W26');
    expect(page).toContain('fonti:\n  - wiki/macro/settimane/2026-W24.md\n  - wiki/macro/settimane/2026-W26.md');
    expect(page.indexOf('[[wiki/macro/settimane/2026-W24|2026-W24]]')).toBeLessThan(page.indexOf('[[wiki/macro/settimane/2026-W26|2026-W26]]'));
    expect(page).toContain('- Il decennale al 4,25%, massimo da 12 anni. — _Fenicottero_ (2026-W24)');
    expect(page).toContain('| Oro | +9.99% |');
    expect(page).not.toContain('+150.25%');
    // Quotes stay in the weeks: the month is what the emails read, so it stays short.
    expect(page).not.toContain('  > ');
  });
});

describe('renderRawFile', () => {
  it('writes the provenance above the cleaned text', () => {
    const raw = renderRawFile({ date: '2026-06-14', issue: 7, subject: 'Il "fenicottero"', receivedAt: '2026-06-14T06:32:27Z', filter: 'thebull-clean-v1', cleanedText: 'testo\n' });
    expect(raw).toBe('---\nfonte: "thebull"\nnumero: 7\ndata: "2026-06-14"\noggetto: "Il \\"fenicottero\\""\nricevuto: "2026-06-14T06:32:27Z"\nfiltro: "thebull-clean-v1"\n---\n\ntesto\n');
  });
});

describe('sentenceCase', () => {
  it('capitalises the start and every sentence of an all-caps headline', () => {
    expect(sentenceCase('UNA SETTIMANA DA BRIVIDI. E I RISCHI PER L’EURO.')).toBe('Una settimana da brividi. E i rischi per l’euro.');
    expect(sentenceCase('Già in minuscolo')).toBe('Già in minuscolo');
  });
});

describe('log.md', () => {
  it('writes one grep-able line per event, to the minute', () => {
    expect(formatLogLine('2026-09-28T10:05:33.123Z', 'compile', 'thebull/2026-09-27', 'ok')).toBe('- 2026-09-28T10:05Z · compile · thebull/2026-09-27 · ok');
    expect(formatCompileOutcome({ status: 'pending', retries: 0 }, 'nessuna risposta')).toBe('pending 0/3 (nessuna risposta)');
  });

  it('reads the LAST compile state of each week, ignoring other operations and prose', () => {
    const log = [
      '# Log',
      '',
      '- 2026-09-28T10:05Z · ingest · thebull/2026-09-27 · ok',
      '- 2026-09-28T10:05Z · compile · thebull/2026-09-27 · pending 0/3 (modello)',
      '- 2026-09-28T18:00Z · compile · thebull/2026-09-27 · pending 1/3',
      '- 2026-09-21T10:05Z · compile · thebull/2026-09-20 · ok',
      '- 2026-08-01T10:05Z · compile · thebull/2026-07-26 · failed (manuale · citazioni)',
      '- 2026-10-03T16:20Z · lint · 2026-09 · 4 temi aggiornati',
    ].join('\n');
    expect(compileStates(log)).toEqual(
      new Map([
        ['thebull/2026-09-27', { status: 'pending', retries: 1 }],
        ['thebull/2026-09-20', { status: 'ok' }],
        ['thebull/2026-07-26', { status: 'failed' }],
      ])
    );
  });

  it('allows three retries after the first failure, then fails', () => {
    const afterIngest = { status: 'pending' as const, retries: 0 };
    const first = nextFailedState(afterIngest);
    const second = nextFailedState(first);
    const third = nextFailedState(second);
    expect([first, second, third]).toEqual([
      { status: 'pending', retries: 1 },
      { status: 'pending', retries: 2 },
      { status: 'failed' },
    ]);
  });

  it('appends on a new line whatever the file ended with', () => {
    expect(appendLogLines('# Log', ['- a'])).toBe('# Log\n- a\n');
    expect(appendLogLines('# Log\n', ['- a', '- b'])).toBe('# Log\n- a\n- b\n');
  });
});
