import { describe, expect, it } from 'vitest';
import {
  checkNarrativeForm,
  checkCrossover,
  checkFigures,
  checkForm,
  checkItalian,
  checkMacroFacts,
  checkPrinciples,
  checkPromises,
  checkWords,
  countSentences,
  countWords,
  extractFigures,
  failedChecks,
  readNumber,
  runEvalChecks,
  traceFigures,
} from '@/lib/utils/aiEvalChecks';

describe('readNumber', () => {
  it('reads an it-IT grouped integer both ways', () => {
    expect(readNumber('1.234').map((r) => r.value).sort()).toEqual([1.234, 1234]);
  });
  it('reads an it-IT decimal as a decimal only', () => {
    expect(readNumber('3,6')).toEqual([{ value: 3.6, decimals: 1 }]);
  });
  it('reads an it-IT amount with grouping and decimals', () => {
    expect(readNumber('1.234,56')).toEqual([{ value: 1234.56, decimals: 2 }]);
  });
  it('drops sign and spaces', () => {
    expect(readNumber('−1 063')).toEqual([{ value: 1063, decimals: 0 }]);
  });
});

describe('extractFigures', () => {
  it('finds €, % and p.p. with their units', () => {
    const figures = extractFigures('Il mercato ha tolto −1.250 €, il TWR è +2,4% e le azioni −3,6 p.p. dal target.');
    expect(figures.map((f) => [f.unit, f.raw])).toEqual([
      ['pp', '−3,6 p.p.'],
      ['pct', '+2,4%'],
      ['eur', '−1.250 €'],
    ]);
  });
  it('reads «mila euro» and a leading €', () => {
    const figures = extractFigures('circa 5,1 mila euro, poi € 250');
    expect(figures.map((f) => f.values[0])).toEqual([5100, 250]);
  });
  it('reads «punti percentuali» as p.p., not as %', () => {
    expect(extractFigures('sotto di 3,6 punti percentuali').map((f) => f.unit)).toEqual(['pp']);
  });
  it('reads a bare «punti» as p.p. only with decimals', () => {
    expect(extractFigures('sotto di 3,7 punti').map((f) => f.raw)).toEqual(['3,7 punti']);
    expect(extractFigures('ci sono 3 punti di attenzione')).toEqual([]);
  });
});

describe('checkFigures', () => {
  const prompt = 'scarto −3,6 p.p. (−2.100 €) | TWR +2,43% | spese 1.250,40 € | liquidità 5.240 €';

  it('fails the F1b slip: −3,7 p.p. against −3,6 in the prompt', () => {
    const result = checkFigures('Le azioni sono sotto di 3,7 p.p.', prompt);
    expect(result).toEqual({ pass: false, details: ['3,7 p.p.'] });
  });
  it('passes a figure that is in the prompt, whatever its sign', () => {
    expect(checkFigures('Le azioni sono sotto di 3,6 p.p., cioè 2.100 €.', prompt).pass).toBe(true);
  });
  it('accepts rounding to the written precision', () => {
    expect(checkFigures('TWR del 2,4%, spese per 1.250 €, circa 5.000 € di liquidità.', prompt).pass).toBe(true);
  });
  it('refuses rounding beyond the written precision', () => {
    expect(checkFigures('TWR del 2,5%', prompt).pass).toBe(false);
  });
  it('does not match a p.p. figure against a % one', () => {
    expect(checkFigures('+2,43 p.p. di rendimento', prompt).pass).toBe(false);
  });
  it('reads a toFixed decimal in the prompt', () => {
    expect(checkFigures('sotto di 3,6 p.p.', 'gap -3.6 p.p.').pass).toBe(true);
  });
  it('pairs each reading with its own tolerance (F6: «€3.688» passed on any «4 €»)', () => {
    expect(checkFigures('Hai investito €3.688 nel mese.', 'Abbonamenti 4 € | acquisti 4.609 €')).toEqual({
      pass: false,
      details: ['€3.688'],
    });
    expect(checkFigures('Hai investito €4.609 nel mese.', 'Abbonamenti 4 € | acquisti 4.609 €').pass).toBe(true);
  });
  it('ignores zero', () => {
    expect(checkFigures('nessuna spesa: 0 €', prompt).pass).toBe(true);
  });
  it('reads the weekly prompt «1234€» format', () => {
    expect(checkFigures('Hai speso 1.234 € su 1.500 €.', 'speso 1234€ su un limite di 1500€').pass).toBe(true);
  });
});

describe('checkWords', () => {
  it('counts words without markdown', () => {
    expect(countWords('## In sintesi\n**Mese** positivo: +1.250 €.')).toBe(5);
  });
  it('fails over the limit and says by how much', () => {
    expect(checkWords('uno due tre quattro', 3)).toEqual({ pass: false, details: ['4 parole su 3'] });
  });
});

const SIX = [
  '**In sintesi** — testo',
  '**Patrimonio e investimenti** — testo',
  '**Rispetto al periodo precedente** — testo',
  "**Confronto con l'anno precedente** — testo",
  '**Entrate e spese: di quanto e perché** — testo',
  '**Azioni o attenzioni** — testo',
];

describe('checkForm (periodic)', () => {
  const contract = { kind: 'periodic' as const, wordLimit: 500 };
  it('passes the six sections in bold', () => {
    expect(checkForm(SIX.join('\n\n'), contract).pass).toBe(true);
  });
  it('passes the six sections as ## headings and numbered', () => {
    const text = SIX.map((line, index) => (index % 2 ? `## ${line.replace(/\*\*/g, '')}` : `${index + 1}. ${line}`)).join('\n');
    expect(checkForm(text, contract).pass).toBe(true);
  });
  it('accepts section 4 with its period named', () => {
    const text = SIX.map((line, index) => (index === 3 ? '## Confronto con giugno 2024' : line)).join('\n');
    expect(checkForm(text, contract).pass).toBe(true);
  });
  it('names a missing section', () => {
    expect(checkForm(SIX.filter((_, index) => index !== 4).join('\n'), contract).details).toEqual(['manca «Entrate e spese»']);
  });
  it('fails sections out of order', () => {
    const swapped = [SIX[1], SIX[0], ...SIX.slice(2)].join('\n');
    expect(checkForm(swapped, contract).details).toEqual(['sezioni fuori ordine']);
  });
  it('does not take a mention inside prose for a heading', () => {
    const text = [SIX[0] + ' come visto in entrate e spese', ...SIX.slice(1, 4), SIX[5]].join('\n');
    expect(checkForm(text, contract).pass).toBe(false);
  });
  it('lets a yearly email with coinciding comparisons merge sections 3 and 4', () => {
    const merged = [SIX[0], SIX[1], SIX[2], SIX[4], SIX[5]].join('\n');
    expect(checkForm(merged, { ...contract, comparisonsMerged: true }).pass).toBe(true);
    expect(checkForm(merged, contract).pass).toBe(false);
  });
});

describe('checkForm (weekly)', () => {
  const contract = { kind: 'weekly' as const, wordLimit: 45 };
  it('passes two sentences with a thousands dot inside', () => {
    expect(countSentences('Hai speso 1.234 € su 1.500 €. Rinvia gli acquisti non urgenti.')).toBe(2);
    expect(checkForm('Hai speso 1.234 € su 1.500 €. Rinvia gli acquisti non urgenti.', contract).pass).toBe(true);
  });
  it('fails three sentences and a list', () => {
    expect(checkForm('Uno. Due. Tre.', contract).details).toEqual(['3 frasi invece di 2']);
    expect(checkForm('- Uno.\n- Due.', contract).details).toContain('contiene un elenco');
  });
});

describe('checkPromises', () => {
  it('flags an offer the email cannot keep', () => {
    expect(checkPromises('Se vuoi posso approfondire le spese.', '').details).toEqual([
      'promessa: «posso approfondire»',
      'promessa: «Se vuoi posso»',
    ]);
  });
  it('lets conditional advice through (a false positive of the first run)', () => {
    expect(checkPromises('Se vuoi rientrare nel budget, riduci il bar.', '').pass).toBe(true);
  });
  it('flags a macro fact with no macro block in the prompt', () => {
    expect(checkPromises('Il taglio della BCE ha aiutato i bond.', 'dati del portafoglio').details).toEqual(['blocco assente: BCE']);
  });
  it('lets a block through when the prompt carries it', () => {
    expect(checkPromises('Terzo posto nella Hall of Fame.', '--- HALL OF FAME ---').pass).toBe(true);
  });
});

describe('checkItalian', () => {
  it('passes Italian prose', () => {
    expect(checkItalian('Il mese è andato bene: la liquidità è scesa per gli acquisti del piano.').pass).toBe(true);
  });
  it('fails English prose', () => {
    expect(checkItalian('The month was good and the portfolio is growing with your savings.').pass).toBe(false);
  });
  it('fails a foreign script and leaked reasoning', () => {
    expect(checkItalian('Il mese 很好 è andato bene.').pass).toBe(false);
    expect(checkItalian('<think>calcolo</think> Il mese è andato bene.').details).toContain('ragionamento nel testo');
  });
});

// ─── The Wiki (F6) ──────────────────────────────────────────────────────────────────────────

describe('the Wiki checks (F6)', () => {
  // A synthetic macro block in the vault's own shape (facts by area, theses, the index table).
  const macro = [
    '--- CONTESTO MACRO (newsletter TheBull, settembre 2026) ---',
    '## Macro di settembre 2026',
    '### Tassi',
    '- Il decennale americano è salito al 4,96%. — _Stati Uniti_ (2026-W37)',
    '- L’indice fenicottero è salito del 3,7% in una settimana. (2026-W38)',
    '### Banche centrali',
    '- La BCE ha alzato i tassi al 2,5%. — _Eurozona_ (2026-W37)',
    '| MSCI All Country World | +1.39% | +20.07% |',
  ].join('\n');
  const data = '--- DATI DEL PERIODO ---\nTWR del mese +2,1%. Azioni 62,0% contro target 70%. Liquidità 2,5% del patrimonio.';
  const prompt = `${data}\n${macro}`;
  const principles = [
    '## Allocazione e leva',
    '- **Mai spostare pesi per motivi di mercato.** In accumulo i nuovi soldi vanno a ciò che è sotto target.',
    '- La regola dell’ornitorinco: il ribilanciamento si fa a porzioni.',
  ].join('\n');
  const wiki = { macro, principles };

  describe('traceFigures', () => {
    it('tells a macro figure, a portfolio figure and an ambiguous one apart', () => {
      const traced = traceFigures('Il decennale al 4,96%. Il TWR è +2,1%. La BCE al 2,5%.', prompt, macro);
      expect(traced.map((t) => [t.figure.raw, t.origin])).toEqual([
        ['4,96%', 'macro'],
        ['+2,1%', 'portfolio'],
        ['2,5%', 'both'],
      ]);
    });
    it('reads the index table’s toFixed decimals', () => {
      expect(traceFigures('L’MSCI ACWI ha fatto +1,39% nel mese.', prompt, macro)[0].origin).toBe('macro');
    });
  });

  describe('checkMacroFacts', () => {
    it('passes a macro figure cited with its subject', () => {
      expect(checkMacroFacts('Il decennale americano è arrivato al 4,96%.', prompt, wiki).pass).toBe(true);
      expect(checkMacroFacts('L’indice fenicottero è salito del 3,7%.', prompt, wiki).pass).toBe(true);
    });
    it('fails the F5 collaudo slip: the decoy figure under another subject', () => {
      const result = checkMacroFacts('Il Bloomberg Euro momentum su +3,7% ha spinto le azioni.', prompt, wiki);
      expect(result.pass).toBe(false);
      expect(result.details[0]).toMatch(/^\+3,7% senza il suo soggetto/);
    });
    it('reads a subject with an ampersand («S&P»), the first paid run’s crash', () => {
      const page = `${macro}\n- L’S&P 500 è cresciuto di oltre il 12% da inizio anno. — _Stati Uniti_ (2026-W38)`;
      const ctx = { macro: page, principles };
      expect(checkMacroFacts('L’S&P 500 fa +12% da gennaio.', `${data}\n${page}`, ctx).pass).toBe(true);
      expect(checkMacroFacts('Il Nikkei fa +12% da gennaio.', `${data}\n${page}`, ctx).pass).toBe(false);
    });
    it('leaves an ambiguous figure alone (in the data and in the page)', () => {
      expect(checkMacroFacts('Il Nikkei al 2,5%.', prompt, wiki).pass).toBe(true);
    });
    it('passes when the bundle had no macro page', () => {
      expect(checkMacroFacts('Qualcosa al 4,96%.', prompt, { macro: null, principles }).pass).toBe(true);
    });
  });

  describe('checkCrossover', () => {
    it('fails a macro figure presented as the portfolio’s', () => {
      const result = checkCrossover('Il tuo portafoglio ha reso il 4,96% nel mese.', prompt, wiki);
      expect(result).toEqual({ pass: false, details: ['cifra macro come del portafoglio: 4,96%'] });
    });
    it('fails a portfolio figure presented as the market’s', () => {
      const result = checkCrossover('La Fed ha spinto i Treasury a +2,1%.', prompt, wiki);
      expect(result).toEqual({ pass: false, details: ['cifra del portafoglio come macro: +2,1%'] });
    });
    it('passes a sentence that keeps the two sides apart', () => {
      const text = 'Il tuo TWR è +2,1% mentre il decennale americano saliva al 4,96%.';
      expect(checkCrossover(text, prompt, wiki).pass).toBe(true);
    });
  });

  describe('checkPrinciples', () => {
    it('passes a principle named as the digest names it', () => {
      const text = 'Coerente con il principio «Mai spostare pesi per motivi di mercato», i nuovi soldi vanno alle azioni.';
      expect(checkPrinciples(text, wiki).pass).toBe(true);
    });
    it('passes the decoy rule named in bold', () => {
      expect(checkPrinciples('Vale il principio **regola dell’ornitorinco**.', wiki).pass).toBe(true);
    });
    it('fails an invented principle', () => {
      const result = checkPrinciples('Segui il tuo principio «comprare sempre sui ribassi».', wiki);
      expect(result).toEqual({ pass: false, details: ['principio non nel digest: «comprare sempre sui ribassi»'] });
    });
    it('fails a principle named when no digest was sent', () => {
      const result = checkPrinciples('Il tuo principio «Mai spostare pesi» regge.', { macro, principles: null });
      expect(result.pass).toBe(false);
    });
    it('ignores a quote in a sentence that does not speak of principles', () => {
      expect(checkPrinciples('La newsletter titola «La fed alza».', wiki).pass).toBe(true);
    });
  });

  // The false positives of the first paid F6 run (2026-10-05), kept as regression guards.
  describe('the first run’s false positives', () => {
    const page = `${macro}\n| MSCI All Country World | +2.80% | +18.00% |\n- Il Treasury decennale americano è arrivato al 5,22%. — _Stati Uniti_ (2026-W39)`;
    const ctx = { macro: page, principles };
    const full = `${data}\n${page}`;
    it('reads «ACWI» as the index table’s «MSCI All Country World»', () => {
      expect(checkMacroFacts('Sul mercato il +2,8% dell’ACWI è coerente con gli utili.', full, ctx).pass).toBe(true);
    });
    it('reads a subject with another ending and a country by its adjective', () => {
      expect(checkMacroFacts('I rendimenti americani a lungo termine sono saliti al 5,22%.', full, ctx).pass).toBe(true);
      expect(checkMacroFacts('Il Nikkei è salito al 5,22%.', full, ctx).pass).toBe(false);
    });
    it('never reads a euro amount as the market’s (instruments carry index names)', () => {
      const prompt2 = `${data} Acquisti ETF MSCI World 1.457 €.\n${page}`;
      expect(checkCrossover('L’MSCI World ha assorbito 1.457 €.', prompt2, ctx).pass).toBe(true);
    });
    it('counts a macro figure in a portfolio sentence once, as a crossover', () => {
      const text = 'Il tuo portafoglio ha reso il 4,96% nel mese.';
      expect(checkMacroFacts(text, full, ctx).pass).toBe(true);
      expect(checkCrossover(text, full, ctx).pass).toBe(false);
    });
  });

  describe('runEvalChecks', () => {
    const contract = { kind: 'periodic' as const, wordLimit: 500 };
    it('runs the three Wiki checks only with a Wiki context', () => {
      expect(Object.keys(runEvalChecks('testo', prompt, contract))).not.toContain('macro');
      expect(Object.keys(runEvalChecks('testo', prompt, contract, wiki))).toEqual(
        expect.arrayContaining(['macro', 'crossover', 'principles'])
      );
    });
    it('lists a failed Wiki check among the failed ones', () => {
      const checks = runEvalChecks('Il Bloomberg Euro momentum su +3,7%.', prompt, contract, wiki);
      expect(failedChecks(checks)).toContain('macro');
    });
  });
});

describe('checkNarrativeForm — the F6b letter', () => {
  const para = 'Un paragrafo di prosa che racconta il mese senza elenchi.';
  it('passes 3-5 headings of prose', () => {
    expect(checkNarrativeForm(`## Il mese delle vacanze\n${para}\n\n## Il mondo\n${para}\n\n## Il filo\n${para}`).pass).toBe(true);
  });
  it('counts the headings and the list lines it finds', () => {
    const result = checkNarrativeForm(`## Uno\n${para}\n\n## Due\n- primo punto\n- secondo punto\n1. terzo`);
    expect(result.details).toEqual(['2 titoletti invece di 3-5', '3 righe di elenco']);
  });
  it('is the form check of a bundle frozen with the narrative contract, never of an old one', () => {
    const text = `## A\n${para}\n## B\n${para}\n## C\n${para}`;
    expect(checkForm(text, { kind: 'periodic', wordLimit: 450, form: 'narrative' }).pass).toBe(true);
    expect(checkForm(text, { kind: 'periodic', wordLimit: 450 }).pass).toBe(false);
  });
});
