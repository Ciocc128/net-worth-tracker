import { describe, expect, it } from 'vitest';
import {
  checkFigures,
  checkForm,
  checkItalian,
  checkPromises,
  checkWords,
  countSentences,
  countWords,
  extractFigures,
  readNumber,
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
