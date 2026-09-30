/**
 * The vault's `dati/` files (lib/utils/vaultMarkdown.ts): the email's data block turned into
 * markdown headings, the frontmatter that dates it, and the portfolio table.
 */

import { describe, expect, it } from 'vitest';
import {
  exportSubject,
  headingText,
  monthDataPath,
  promptLinesToMarkdown,
  renderMonthDataFile,
  renderPortfolioFile,
  type PortfolioHolding,
} from '@/lib/utils/vaultMarkdown';

const GENERATED = '2026-09-30T18:00:00.000Z';

describe('headingText', () => {
  it('lowers the upper-case words before the parenthesis and keeps the parenthesis as written', () => {
    expect(headingText('ALLOCAZIONE vs TARGET (come la pagina Allocazione)')).toBe('Allocazione vs target (come la pagina Allocazione)');
    expect(headingText('SPESE PER CATEGORIA E SOTTOCATEGORIA (elenco completo del periodo)')).toBe(
      'Spese per categoria e sottocategoria (elenco completo del periodo)'
    );
    expect(headingText("SPESE SINGOLE PIU' GRANDI")).toBe("Spese singole piu' grandi");
  });

  it('keeps acronyms upper case', () => {
    expect(headingText('RENDIMENTO DEL PERIODO TWR')).toBe('Rendimento del periodo TWR');
  });
});

describe('promptLinesToMarkdown', () => {
  it('turns section markers into headings, drops the bundle title and collapses blank lines', () => {
    const lines = ['=== DATI FINANZIARI: Agosto 2026 ===', '', '--- PATRIMONIO ---', 'Fine periodo: 1 €', '', '', '', '--- HALL OF FAME ---', 'Ornitorinco: 3°', ''];
    expect(promptLinesToMarkdown(lines)).toBe('## Patrimonio\n\nFine periodo: 1 €\n\n## Hall of fame\n\nOrnitorinco: 3°');
  });

  it('splits lines that already hold several rows', () => {
    expect(promptLinesToMarkdown(['--- CASHFLOW ---\nEntrate: 2 €\nUscite: -1 €'])).toBe('## Cashflow\n\nEntrate: 2 €\nUscite: -1 €');
  });
});

describe('renderMonthDataFile', () => {
  it('dates the file in the frontmatter and in the text, and says when the month is still running', () => {
    const text = renderMonthDataFile({ year: 2026, month: 9, generatedAt: GENERATED, partial: true, sections: ['--- PATRIMONIO ---', 'Fenicottero: 5 €'] });
    expect(text.startsWith('---\ntipo: "dati"\nmese: "2026-09"\ngenerato: "2026-09-30T18:00:00.000Z"\nparziale: true\n')).toBe(true);
    expect(text).toContain('# Dati di settembre 2026');
    expect(text).toContain("_Generato dall'app il 2026-09-30 alle 18:00 UTC.");
    expect(text).toContain('**Mese in corso:**');
    expect(text).toContain('## Patrimonio\n\nFenicottero: 5 €');
  });

  it('says nothing about a running month when the month is closed', () => {
    const text = renderMonthDataFile({ year: 2026, month: 8, generatedAt: GENERATED, partial: false, sections: [] });
    expect(text).toContain('parziale: false');
    expect(text).not.toContain('Mese in corso');
  });
});

describe('renderPortfolioFile', () => {
  const holding = (name: string, value: number, classLabel: string | null = 'Azioni'): PortfolioHolding => ({
    name,
    ticker: name.slice(0, 4).toUpperCase(),
    classLabel,
    subCategory: null,
    quantity: 1,
    price: value,
    value,
  });

  it('lists the instruments largest first with their weight, counts the empty ones, and names the snapshot', () => {
    const text = renderPortfolioFile({
      year: 2026,
      month: 9,
      generatedAt: GENERATED,
      holdings: [holding('Ornitorinco', 250, 'Azioni 60%, Obbligazioni 40%'), holding('Fenicottero', 750), holding('Conto chiuso', 0, 'Liquidità')],
      sections: ['--- ALLOCAZIONE vs TARGET (come la pagina Allocazione) ---', 'Azioni: attuale 70%'],
    });
    const fenicottero = text.indexOf('| Fenicottero |');
    const ornitorinco = text.indexOf('| Ornitorinco |');
    expect(fenicottero).toBeGreaterThan(0);
    expect(ornitorinco).toBeGreaterThan(fenicottero);
    expect(text).toContain('| Azioni 60%, Obbligazioni 40% |');
    expect(text).toContain('| 75,0 % |');
    expect(text).not.toContain('Conto chiuso');
    expect(text).toContain('Più 1 strumento a zero');
    expect(text).toContain('snapshot: "2026-09"');
    expect(text).toContain('Snapshot di settembre 2026');
    expect(text).toContain('## Allocazione vs target (come la pagina Allocazione)');
  });

  it('names an instrument no longer on file instead of inventing a class', () => {
    const text = renderPortfolioFile({ year: 2026, month: 9, generatedAt: GENERATED, holdings: [holding('Vecchio', 10, null)], sections: [] });
    expect(text).toContain('| non più in archivio |');
  });

  it('escapes a pipe in a name so the table keeps its columns', () => {
    const text = renderPortfolioFile({ year: 2026, month: 9, generatedAt: GENERATED, holdings: [holding('A|B', 10)], sections: [] });
    expect(text).toContain('| A\\|B |');
  });
});

describe('paths and subjects', () => {
  it('names the month file and the export subject', () => {
    expect(monthDataPath('2026-01')).toBe('dati/2026-01.md');
    expect(exportSubject(['2026-01'])).toBe('dati/2026-01');
    expect(exportSubject(['2026-01', '2026-02', '2026-03'])).toBe('dati/2026-01…2026-03');
    expect(exportSubject([])).toBe('dati/portafoglio');
  });
});
