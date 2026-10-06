/**
 * The automatic checks of the AI eval (doc/ai-open-models-wiki.md § 7, phase F2): pure functions
 * over a model's comment and the prompt it was given, run by `scripts/aiEval.mts` on every
 * candidate × bundle.
 *
 * Five checks, each a pass/fail with the evidence that failed it:
 *
 *   - figures   every amount in €, percentage and percentage-point delta («p.p.») in the text
 *               exists in the prompt, within the rounding its own precision allows. F1's check
 *               read € and % only, and a «−3,7 p.p.» against the prompt's −3,6 passed (§ 4.5).
 *   - words     the contract's word limit.
 *   - form      periodic email: the six sections of the contract, in order (bold, numbered or
 *               `##` headings alike); weekly email: two sentences, no list, no heading.
 *   - promises  no offer of a follow-up the email cannot keep, and no mention of a block the
 *               prompt does not carry (macro context, Hall of Fame, …).
 *   - italian   no other script, no English prose, no leaked reasoning.
 *
 * And three more on a bundle that carries the vault (F6, the second round — see «The Wiki» below):
 * macro facts cited with their subject, no figure crossing between macro and portfolio, every
 * named principle in the digest.
 *
 * The prompt mixes two number conventions — the email's own blocks are it-IT («1.234 €»,
 * «−3,6 p.p.»), some of the assistant's bundle uses `toFixed` («3.6 p.p.») — so an ambiguous
 * token is read BOTH ways and a figure matches if either reading does.
 */

export type FigureUnit = 'eur' | 'pct' | 'pp';

export interface Figure {
  raw: string;
  unit: FigureUnit;
  /** Every plausible reading of the number (absolute values; the sign is not compared). */
  values: number[];
  /** Half the unit of the last written digit: how far rounding may have moved it (the widest reading's). */
  tolerance: number;
  /**
   * The tolerance of each reading, paired with `values`. «3.688» read as 3,688 has 0,0005, read
   * as 3.688 has 0,5: until 2026-10-05 the widest one applied to both, so «€3.688» matched any
   * «4 €» of the prompt and an invented sum passed (found in F6 by reading, not by the check).
   */
  tolerances: number[];
}

export interface CheckResult {
  pass: boolean;
  /** What failed, in words a reader can check against the text. Empty when it passes. */
  details: string[];
}

export type EvalCheckId = 'figures' | 'words' | 'form' | 'promises' | 'italian' | 'macro' | 'crossover' | 'principles';

/** The five F2 checks always; the three Wiki checks (F6) only on a bundle that carried the vault. */
export type EvalChecks = Record<'figures' | 'words' | 'form' | 'promises' | 'italian', CheckResult> &
  Partial<Record<'macro' | 'crossover' | 'principles', CheckResult>>;

export interface EvalBundleContract {
  kind: 'periodic' | 'weekly';
  wordLimit: number;
  /** Yearly email whose two comparisons coincide: sections 3 and 4 may be one. */
  comparisonsMerged?: boolean;
  /**
   * The periodic contract the bundle was frozen with: the six fixed sections (F2, F6; the default,
   * so an old bundle reads as it was written) or the narrative letter of F6b — 3-5 headings of the
   * model's own, no lists (lib/server/assistant/prompts.ts, owner 2026-10-06).
   */
  form?: 'sections' | 'narrative';
}

// ─── Figures ────────────────────────────────────────────────────────────────────────────────

// A number as the two conventions write it: optional sign, digits with `.`/`,`/thin-space
// grouping, optional decimals. The space after a sign is allowed only AFTER one: a match that
// could open on a plain space would start at «di 3,7» and be dropped by the glued-token guard.
const NUMBER = String.raw`(?:[+\-−–]\s?)?\d{1,3}(?:[.  ']\d{3})+(?:,\d+)?|(?:[+\-−–]\s?)?\d+(?:[.,]\d+)?`;
const SCALE = String.raw`(?:\s?(mila|mln|milioni|k))?`;
const EUR_AFTER = String.raw`\s?(?:€|euro\b|EUR\b)`;
const PCT_AFTER = String.raw`\s?(?:%|per\s?cento\b)`;
const PP_AFTER = String.raw`\s?(?:p\.\s?p\.|pp\b|punti\s+percentuali\b)`;

const FIGURE_PATTERNS: Array<{ unit: FigureUnit; re: RegExp; numberGroup: number; scaleGroup?: number }> = [
  // Order matters only for overlap: p.p. before % so «3,6 punti percentuali» is not read twice.
  { unit: 'pp', re: new RegExp(`(${NUMBER})${PP_AFTER}`, 'gi'), numberGroup: 1 },
  // A bare «punti» is a p.p. delta only with decimals: «3,7 punti» yes, «3 punti di attenzione» no.
  { unit: 'pp', re: /((?:[+\-−–]\s?)?\d+,\d+)\s?punti\b/gi, numberGroup: 1 },
  { unit: 'pct', re: new RegExp(`(${NUMBER})${PCT_AFTER}`, 'gi'), numberGroup: 1 },
  { unit: 'eur', re: new RegExp(`(${NUMBER})${SCALE}${EUR_AFTER}`, 'gi'), numberGroup: 1, scaleGroup: 2 },
  { unit: 'eur', re: new RegExp(`€\\s?(${NUMBER})${SCALE}`, 'gi'), numberGroup: 1, scaleGroup: 2 },
];

const SCALE_FACTOR: Record<string, number> = { mila: 1e3, k: 1e3, mln: 1e6, milioni: 1e6 };

interface Reading {
  value: number;
  decimals: number;
}

/**
 * Every reading of a numeric token: «1.234» is 1234 (it-IT grouping) or 1,234 (a `toFixed`
 * decimal); «1,5» is 1,5 (it-IT) or 15 (never: a comma as an en-US thousands separator needs
 * three digits after it, «1,500»). Exported for the tests.
 */
export function readNumber(token: string): Reading[] {
  const clean = token.replace(/[+\-−–\s  ']/g, '');
  const readings: Reading[] = [];
  const push = (text: string, decimalSep: '.' | ',' | null) => {
    let intPart = text;
    let decPart = '';
    if (decimalSep) {
      const at = text.lastIndexOf(decimalSep);
      if (at >= 0) {
        intPart = text.slice(0, at);
        decPart = text.slice(at + 1);
      }
    }
    const digits = intPart.replace(/[.,]/g, '');
    if (!/^\d+$/.test(digits) || (decPart && !/^\d+$/.test(decPart))) return;
    readings.push({ value: Number(`${digits}.${decPart || '0'}`), decimals: decPart.length });
  };

  const commas = (clean.match(/,/g) ?? []).length;
  const dots = (clean.match(/\./g) ?? []).length;
  if (commas === 0 && dots === 0) push(clean, null);
  else if (commas === 1 && dots === 0) {
    push(clean, ','); // it-IT decimal
    if (/^\d{1,3}(,\d{3})+$/.test(clean)) push(clean, null); // en-US grouping
  } else if (dots === 1 && commas === 0) {
    push(clean, '.'); // toFixed decimal
    if (/^\d{1,3}(\.\d{3})+$/.test(clean)) push(clean, null); // it-IT grouping
  } else if (dots >= 1 && commas <= 1 && clean.lastIndexOf(',') > clean.lastIndexOf('.')) push(clean, ',');
  else if (commas >= 1 && dots <= 1 && clean.lastIndexOf('.') > clean.lastIndexOf(',')) push(clean, '.');
  else push(clean, null);

  const seen = new Set<string>();
  return readings.filter((reading) => {
    const key = `${reading.value}|${reading.decimals}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every € / % / p.p. figure in a text. Exported for the tests. */
export function extractFigures(text: string): Figure[] {
  const figures: Figure[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) => taken.some(([s, e]) => start < e && end > s);

  for (const { unit, re, numberGroup, scaleGroup } of FIGURE_PATTERNS) {
    re.lastIndex = 0;
    for (let match = re.exec(text); match; match = re.exec(text)) {
      const start = match.index;
      const end = start + match[0].length;
      if (overlaps(start, end)) continue;
      // A digit glued before the match is part of another token («2026-08», «Q3»).
      if (start > 0 && /[\d\w]/.test(text[start - 1]) && !/^[€+\-−–]/.test(match[0])) continue;
      const scaleWord = scaleGroup ? match[scaleGroup]?.toLowerCase() : undefined;
      const factor = scaleWord ? SCALE_FACTOR[scaleWord] ?? 1 : 1;
      const readings = readNumber(match[numberGroup]);
      if (readings.length === 0) continue;
      taken.push([start, end]);
      const tolerances = readings.map((reading) => {
        // «5.000 €» may be a rounded 5.240: trailing zeros of an integer widen the tolerance.
        const trailingZeros =
          reading.decimals === 0 && reading.value !== 0 ? (String(reading.value).match(/0+$/)?.[0].length ?? 0) : 0;
        const unitOfLastDigit = reading.decimals > 0 ? 10 ** -reading.decimals : 10 ** trailingZeros;
        return (unitOfLastDigit / 2) * factor;
      });
      figures.push({
        raw: match[0].trim(),
        unit,
        values: readings.map((reading) => Math.abs(reading.value * factor)),
        tolerance: Math.max(...tolerances),
        tolerances,
      });
    }
  }
  return figures;
}

/** Float slack on top of the rounding tolerance: 0,05 compared with 0,05 must match. */
const EPSILON = 1e-9;

/**
 * Figures of the text that no figure of the prompt, in the same unit, can have been rounded to.
 * A percentage-point delta matches only another p.p. figure: the F1b slip was exactly a p.p.
 * matched against nothing.
 */
export function checkFigures(text: string, prompt: string): CheckResult {
  const promptFigures = extractFigures(prompt);
  const promptValues: Record<FigureUnit, number[]> = { eur: [], pct: [], pp: [] };
  for (const figure of promptFigures) promptValues[figure.unit].push(...figure.values);

  const details: string[] = [];
  for (const figure of extractFigures(text)) {
    // Zero is never an invented figure («0 €», «0,0 p.p.»).
    if (figure.values.every((value) => value === 0)) continue;
    const pool = promptValues[figure.unit];
    const found = figure.values.some((value, i) =>
      pool.some((candidate) => Math.abs(candidate - value) <= figure.tolerances[i] + EPSILON)
    );
    if (!found) details.push(figure.raw);
  }
  return { pass: details.length === 0, details };
}

// ─── Words ──────────────────────────────────────────────────────────────────────────────────

/** Words of the prose, markdown stripped: a token counts if it holds a letter or a digit. */
export function countWords(text: string): number {
  return text
    .replace(/[#*_>`|]/g, ' ')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function checkWords(text: string, limit: number): CheckResult {
  const words = countWords(text);
  return words <= limit ? { pass: true, details: [] } : { pass: false, details: [`${words} parole su ${limit}`] };
}

// ─── Form ───────────────────────────────────────────────────────────────────────────────────

/** The six sections of `buildEmailPeriodicFormatContract`, in order. */
export const PERIODIC_SECTIONS: Array<{ label: string; re: RegExp }> = [
  { label: 'In sintesi', re: /in\s+sintesi/i },
  { label: 'Patrimonio e investimenti', re: /patrimonio\s+e\s+investimenti/i },
  { label: 'Rispetto al periodo precedente', re: /rispetto\s+al\s+periodo\s+precedente/i },
  // «Confronto con giugno 2024» is the same section with its period named: accepted.
  { label: "Confronto con l'anno precedente", re: /confronto\s+con\s+(l['’\s]\s*anno\s+precedente|.*\b(19|20)\d{2}\b)/i },
  { label: 'Entrate e spese', re: /entrate\s+e\s+spese/i },
  { label: 'Azioni o attenzioni', re: /azioni\s+o\s+attenzioni/i },
];

/** A line that is a heading: `## X`, `**X**`, `1. **X**`, `3) X —`, or a short line ending in `:`. */
function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^(\d+[.)]\s*)?\*\*[^*]+\*\*/.test(trimmed) ||
    /^\d+[.)]\s+\S/.test(trimmed) ||
    (trimmed.length <= 60 && /:\s*$/.test(trimmed))
  );
}

function checkPeriodicSections(text: string, comparisonsMerged: boolean): CheckResult {
  const lines = text.split('\n');
  const positions = PERIODIC_SECTIONS.map(({ re }) => lines.findIndex((line) => isHeadingLine(line) && re.test(line)));
  const details: string[] = [];

  PERIODIC_SECTIONS.forEach(({ label }, index) => {
    if (positions[index] >= 0) return;
    // A yearly email whose two comparisons coincide may merge sections 3 and 4 (the contract).
    if (comparisonsMerged && (index === 2 || index === 3) && (positions[2] >= 0 || positions[3] >= 0)) return;
    details.push(`manca «${label}»`);
  });

  const present = positions.filter((position) => position >= 0);
  if (present.some((position, index) => index > 0 && position < present[index - 1])) {
    details.push('sezioni fuori ordine');
  }
  return { pass: details.length === 0, details };
}

/** Sentences of a short text; a dot between digits («1.234») does not end one. */
export function countSentences(text: string): number {
  return text
    .trim()
    .split(/(?<!\d)[.!?]+(?=\s|$)|(?<=\d)[.!?]+(?=\s+\p{Lu}|$)/u)
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence)).length;
}

function checkWeeklyForm(text: string): CheckResult {
  const details: string[] = [];
  const sentences = countSentences(text);
  if (sentences !== 2) details.push(`${sentences} frasi invece di 2`);
  if (text.split('\n').some((line) => /^\s*([-*•]|\d+[.)])\s/.test(line))) details.push('contiene un elenco');
  if (text.split('\n').some((line) => /^\s*#/.test(line))) details.push('contiene un titolo');
  return { pass: details.length === 0, details };
}

export function checkForm(text: string, contract: EvalBundleContract): CheckResult {
  if (contract.kind === 'weekly') return checkWeeklyForm(text);
  return contract.form === 'narrative' ? checkNarrativeForm(text) : checkPeriodicSections(text, Boolean(contract.comparisonsMerged));
}

/** The F6b letter: 3-5 markdown headings and no list — the contract's «Forma». */
export function checkNarrativeForm(text: string): CheckResult {
  const lines = text.split('\n').map((line) => line.trim());
  const headings = lines.filter((line) => /^#{1,6}\s+\S/.test(line)).length;
  const listItems = lines.filter((line) => /^([-*•]|\d+[.)])\s+\S/.test(line)).length;
  const details: string[] = [];
  if (headings < 3 || headings > 5) details.push(`${headings} titoletti invece di 3-5`);
  if (listItems > 0) details.push(`${listItems} ${listItems === 1 ? 'riga' : 'righe'} di elenco`);
  return { pass: details.length === 0, details };
}

// ─── Promises of absent blocks ──────────────────────────────────────────────────────────────

/** Offers the email cannot keep: it is one message, with no reply channel and nothing attached. */
const PROMISE_PATTERNS: RegExp[] = [
  /\b(vedi|trovi|consulta)\s+(la\s+tabella|il\s+grafico|il\s+dettaglio|qui\s+sotto|sotto)\b/i,
  /\bin\s+allegato\b/i,
  /\bnel(la)?\s+prossim[oa]\s+(email|mail|report|riepilogo|analisi|commento)\b/i,
  /\bti\s+(invierò|aggiornerò|segnalerò|manderò|preparerò)\b/i,
  /\b(posso|potrei)\s+(anche\s+)?(approfondire|preparare|calcolare|analizzare|simulare)\b/i,
  // «Se vuoi rientrare nel budget, …» is conditional advice; «se vuoi, posso …» is an offer.
  /\bse\s+vuoi,?\s+(posso|ti\s+(preparo|mando|invio|calcolo))\b/i,
  /\bfammi\s+sapere\b/i,
  /\bchiedimi\b/i,
];

/**
 * Blocks the email carries only sometimes, and the macro context it never carries (no web
 * search since F1): a term in the text that the prompt does not contain is a block the model
 * made up. The prompt is searched case-insensitively for the same term.
 */
const BLOCK_TERMS: Array<{ label: string; re: RegExp }> = [
  { label: 'Hall of Fame', re: /hall\s+of\s+fame/i },
  { label: 'BCE', re: /\bBCE\b/ },
  { label: 'Fed', re: /\bFed\b/ },
  { label: 'banca centrale', re: /banc[ah]e?\s+central[ei]/i },
  { label: 'inflazione', re: /inflazion/i },
  { label: 'tassi di interesse', re: /tass[io]\s+d['’i]\s*interess/i },
  { label: 'geopolitica', re: /geopolitic/i },
  { label: 'recessione', re: /recession/i },
  { label: 'dazi', re: /\bdazi\b/i },
  { label: 'obiettivi di investimento', re: /obiettiv[oi]\s+di\s+investimento/i },
  { label: 'dividendi', re: /dividend/i },
  { label: 'spese in comune', re: /spes[ae]\s+in\s+comune/i },
];

export function checkPromises(text: string, prompt: string): CheckResult {
  const details: string[] = [];
  for (const re of PROMISE_PATTERNS) {
    const match = text.match(re);
    if (match) details.push(`promessa: «${match[0]}»`);
  }
  for (const { label, re } of BLOCK_TERMS) {
    if (re.test(text) && !re.test(prompt)) details.push(`blocco assente: ${label}`);
  }
  return { pass: details.length === 0, details };
}

// ─── Italian only ───────────────────────────────────────────────────────────────────────────

const ENGLISH_WORDS = new Set([
  'the', 'and', 'of', 'with', 'this', 'that', 'is', 'are', 'your', 'you', 'for', 'which', 'was', 'were',
  'has', 'have', 'will', 'should', 'from', 'these', 'their', 'while', 'however', 'overall',
]);
const ITALIAN_WORDS = new Set(['il', 'la', 'di', 'che', 'e', 'per', 'un', 'una', 'del', 'della', 'nel', 'è', 'non', 'sono', 'con']);
/** How many English function words the text may hold before it stops reading as Italian. */
const ENGLISH_TOLERANCE = 2;

export function checkItalian(text: string): CheckResult {
  const details: string[] = [];
  // CJK, kana, hangul, Cyrillic, Arabic, Hebrew, Thai: a script a slipping multilingual model emits.
  const foreign = text.match(/[Ѐ-ӿ֐-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/g);
  if (foreign) details.push(`caratteri non latini: ${[...new Set(foreign)].slice(0, 8).join('')}`);
  if (/<\/?think>|<\/?reasoning>/i.test(text)) details.push('ragionamento nel testo');

  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const english = words.filter((word) => ENGLISH_WORDS.has(word));
  if (english.length > ENGLISH_TOLERANCE) details.push(`parole inglesi: ${[...new Set(english)].join(', ')}`);
  const italian = words.filter((word) => ITALIAN_WORDS.has(word)).length;
  if (words.length >= 20 && italian / words.length < 0.08) details.push('poche parole funzionali italiane');
  return { pass: details.length === 0, details };
}

// ─── The Wiki (F6, second round) ────────────────────────────────────────────────────────────
//
// Three checks for a prompt that carries the vault (F5): the macro month pages at the end of the
// user message, the Principles digest at the end of the system block. All three are anchored to
// FIGURES, the one thing code can trace back to a source: a figure of the comment is «macro» when
// only the macro pages hold it, «portfolio» when only the rest of the prompt does, and ambiguous —
// left alone — when both do. A macro fact cited without a figure is not checked: that reading is
// the owner's (doc/ai-open-models-wiki.md § 7.4).

/** What the prompt carried from the vault, exactly as it went in. */
export interface EvalWikiContext {
  /** The CONTESTO MACRO block of the user message; null when the period had no page. */
  macro: string | null;
  /** The Principles digest of the system block; null when it was not sent. */
  principles: string | null;
}

/**
 * Words that name a macro subject even in lower case: a rate, an index, a commodity, a central
 * bank. «euro» is left out on purpose — «in euro» is a currency, not a subject.
 */
const MACRO_SUBJECT_WORDS = [
  'decennale', 'trentennale', 'biennale', 'treasury', 'bund', 'btp', 'oat', 'gilt', 'spread', 'inflazione', 'core',
  'headline', 'disoccupazione', 'occupazione', 'pil', 'gdpnow', 'pmi', 'manifattura', 'brent', 'wti', 'petrolio',
  'benzina', 'diesel', 'oro', 'bitcoin', 'yen', 'dollaro', 'sterlina', 'fed', 'bce', 'boj', 'msci', 's&p', 'nasdaq',
  'stoxx', 'nikkei', 'ftse', 'dax', 'cac', 'utili', 'earnings', 'debito', 'deficit', 'tesoro', 'futures', 'bond',
];

/**
 * The subjects that put a sentence on the MARKET's side whatever the page says — a figure given
 * to the Fed is the market's even when the month's page never names the Fed. Only words with no
 * second meaning in a household's money: «utili», «debito», «core» stay out.
 */
const MARKET_SUBJECTS = [
  'decennale', 'trentennale', 'treasury', 'bund', 'btp', 'oat', 'spread', 'inflazione', 'disoccupazione', 'pil', 'pmi',
  'brent', 'petrolio', 'fed', 'bce', 'boj', 'msci', 's&p', 'nasdaq', 'stoxx', 'nikkei', 'ftse', 'dax',
];

/** Lower-case tokens a subject comparison ignores: function words, units, time. */
const GENERIC_WORDS = new Set([
  'il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'uno', 'di', 'da', 'in', 'su', 'per', 'con', 'tra', 'fra', 'del', 'dello',
  'della', 'dei', 'degli', 'delle', 'dal', 'dalla', 'nel', 'nella', 'nei', 'sul', 'sulla', 'al', 'alla', 'ai', 'agli',
  'che', 'chi', 'non', 'più', 'meno', 'come', 'anche', 'ancora', 'già', 'solo', 'quasi', 'circa', 'oltre', 'sopra',
  'sotto', 'verso', 'dopo', 'prima', 'mentre', 'quando', 'se', 'ma', 'ed', 'e', 'o', 'è', 'era', 'sono', 'ha', 'hanno',
  'stato', 'stata', 'mese', 'mesi', 'anno', 'anni', 'settimana', 'giorno', 'giorni', 'oggi', 'ieri', 'punti', 'punto',
  'base', 'percentuale', 'livello', 'massimo', 'minimo', 'massimi', 'minimi', 'volta', 'sempre', 'inizio', 'fine',
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre',
  'dicembre', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica', 'questo', 'questa',
  'quello', 'quella', 'suo', 'sua', 'loro', 'nostro', 'mio', 'tuo', 'tua', 'cui', 'qui', 'lì', 'poi', 'così',
]);

/** Words that put a sentence on the PORTFOLIO's side: the owner's money, plan and classes. */
const PORTFOLIO_MARKERS =
  /\b(portafoglio|patrimonio|tu[oaei]|hai|conto|liquidità|etf|pac|risparmi[oa]?|entrate|spese|uscite|budget|allocazion[ei]|target|quot[ae]|ribilanci\w*|acquist\w*|versament\w*|twr)\b/i;

/** Sentences of a comment: a line break or end punctuation followed by a new sentence. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?;])\s+(?=[\p{Lu}«"“*(\-–—])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

function tokens(text: string): string[] {
  return (text.match(/[\p{L}\p{N}&]+/gu) ?? []).filter((token) => !/^\d+$/.test(token));
}

/**
 * The subject of a macro line: its capitalised names («Fed», «S&P», «Stati Uniti»), the subject
 * words it contains, and — for a line with neither, like a decoy «indice fenicottero» — every
 * content word it has. Lower case.
 */
export function subjectTokens(line: string): string[] {
  const all = tokens(line.replace(/[’']/g, ' '));
  const named = all.filter((token) => /^\p{Lu}/u.test(token) && !GENERIC_WORDS.has(token.toLowerCase()));
  const lower = all.map((token) => token.toLowerCase());
  const subjects = new Set([...named.map((token) => token.toLowerCase()), ...lower.filter((token) => MACRO_SUBJECT_WORDS.includes(token))]);
  if (subjects.size === 0) {
    for (const token of lower) if (token.length >= 4 && !GENERIC_WORDS.has(token)) subjects.add(token);
  }
  for (const { re, aliases } of SUBJECT_ALIASES) if (re.test(line)) aliases.forEach((alias) => subjects.add(alias));
  return [...subjects];
}

/**
 * Names a page writes one way and a comment another: the index table's «MSCI All Country World»
 * is «ACWI» in prose, a country tag is its adjective («Stati Uniti» → «americano»). Read on the
 * first paid run of F6 (2026-10-05), where both were flagged as a missing subject.
 */
const SUBJECT_ALIASES: Array<{ re: RegExp; aliases: string[] }> = [
  { re: /all\s+country\s+world/i, aliases: ['acwi'] },
  { re: /stati\s+uniti/i, aliases: ['americano', 'usa'] },
  { re: /eurozona|europa/i, aliases: ['europeo', 'eurozona'] },
  { re: /\bitalia\b/i, aliases: ['italiano'] },
  { re: /\bfrancia\b/i, aliases: ['francese'] },
  { re: /\bgiappone\b/i, aliases: ['giapponese'] },
  { re: /regno\s+unito/i, aliases: ['britannico'] },
  { re: /\bgermania\b/i, aliases: ['tedesco'] },
];

/**
 * Whether the sentence names the subject: a whole word, or — for a word of six letters or more —
 * the same word with another ending («decennale» / «decennali», «americano» / «americani»).
 */
function mentions(sentence: string, subject: string): boolean {
  const stem = subject.length >= 6 ? subject.slice(0, -1) : subject;
  // `&` («S&P») needs no escape, and under the `u` flag an unneeded escape is a SyntaxError.
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
  const tail = stem === subject ? '($|[^\\p{L}\\p{N}])' : '\\p{L}{0,2}($|[^\\p{L}\\p{N}])';
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}${tail}`, 'iu').test(sentence.replace(/[’']/g, ' '));
}

function matchesAny(figure: Figure, pool: Figure[]): boolean {
  return pool.some(
    (candidate) =>
      candidate.unit === figure.unit &&
      figure.values.some((value, i) => candidate.values.some((other) => Math.abs(other - value) <= figure.tolerances[i] + EPSILON))
  );
}

interface TracedFigure {
  figure: Figure;
  sentence: string;
  origin: 'macro' | 'portfolio' | 'both' | 'none';
  /** The macro lines (facts, theses, index rows) that hold the figure. */
  macroLines: string[];
}

/** Every figure of the comment, with its sentence and where in the prompt it can come from. */
export function traceFigures(text: string, prompt: string, macro: string): TracedFigure[] {
  const data = prompt.split(macro).join('\n');
  const dataFigures = extractFigures(data);
  const lines = macro.split('\n').filter((line) => /^\s*[-|]/.test(line));
  const lineFigures = lines.map((line) => ({ line, figures: extractFigures(line) }));
  const traced: TracedFigure[] = [];
  for (const sentence of splitSentences(text)) {
    for (const figure of extractFigures(sentence)) {
      if (figure.values.every((value) => value === 0)) continue;
      const macroLines = lineFigures.filter(({ figures }) => matchesAny(figure, figures)).map(({ line }) => line);
      const inData = matchesAny(figure, dataFigures);
      const origin = macroLines.length > 0 ? (inData ? 'both' : 'macro') : inData ? 'portfolio' : 'none';
      traced.push({ figure, sentence, origin, macroLines });
    }
  }
  return traced;
}

/**
 * Every macro figure of the comment is cited with ITS subject: the sentence names something the
 * page's line with that figure names. The F5 collaudo's slip — the decoy «indice fenicottero
 * +3,7%» cited as «Bloomberg Euro momentum su +3,7%» — fails here.
 */
export function checkMacroFacts(text: string, prompt: string, wiki: EvalWikiContext): CheckResult {
  if (!wiki.macro) return { pass: true, details: [] };
  const details: string[] = [];
  for (const { figure, sentence, origin, macroLines } of traceFigures(text, prompt, wiki.macro)) {
    // A macro figure in a sentence about the owner's money is `checkCrossover`'s: counted once.
    if (origin !== 'macro' || PORTFOLIO_MARKERS.test(sentence)) continue;
    const subjects = macroLines.flatMap(subjectTokens);
    if (!subjects.some((subject) => mentions(sentence, subject))) {
      details.push(`${figure.raw} senza il suo soggetto («${sentence.slice(0, 90)}»)`);
    }
  }
  return { pass: details.length === 0, details };
}

/**
 * No figure crosses sides: a figure only the macro pages hold, in a sentence about the owner's
 * money that names no macro subject, is a macro figure presented as the portfolio's; a figure
 * only the data holds, in a sentence that names a macro subject and nothing of the portfolio, is
 * the portfolio's presented as the market's.
 */
export function checkCrossover(text: string, prompt: string, wiki: EvalWikiContext): CheckResult {
  if (!wiki.macro) return { pass: true, details: [] };
  const details: string[] = [];
  for (const { figure, sentence, origin, macroLines } of traceFigures(text, prompt, wiki.macro)) {
    const onPortfolio = PORTFOLIO_MARKERS.test(sentence);
    if (origin === 'macro' && onPortfolio && !macroLines.flatMap(subjectTokens).some((subject) => mentions(sentence, subject))) {
      details.push(`cifra macro come del portafoglio: ${figure.raw}`);
    }
    // Only a rate or a share can pass for the market's: the pages hold no euro amounts, and the
    // owner's instruments carry index names («… MSCI World», «BTP …») that a euro sentence names.
    if (
      origin === 'portfolio' &&
      figure.unit !== 'eur' &&
      !onPortfolio &&
      MARKET_SUBJECTS.some((subject) => mentions(sentence, subject))
    ) {
      details.push(`cifra del portafoglio come macro: ${figure.raw}`);
    }
  }
  return { pass: details.length === 0, details };
}

/** «…», "…", “…”, **…** and *…*: how a comment names a principle. */
const NAMED_SPAN = /«([^»]+)»|"([^"]+)"|“([^”]+)”|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;

/** Share of a name's content words the digest must hold for the name to be the digest's. */
const PRINCIPLE_OVERLAP = 0.6;

function normalizeWords(text: string): string[] {
  return tokens(text.toLowerCase().replace(/[’']/g, ' ').normalize('NFD').replace(/\p{M}/gu, '')).filter(
    (token) => token.length >= 4 && !GENERIC_WORDS.has(token)
  );
}

/**
 * Every principle the comment names exists in the digest: a quoted or bold span in a sentence
 * that speaks of a «principio» must share most of its words with the digest. A comment that
 * names a principle when no digest was sent fails too — it is a block the prompt did not carry.
 */
export function checkPrinciples(text: string, wiki: EvalWikiContext): CheckResult {
  const digestWords = new Set(normalizeWords(wiki.principles ?? ''));
  const details: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (!/\bprincip(io|i)\b/i.test(sentence)) continue;
    // A section heading that happens to be bold is not a name: only spans inside a sentence count.
    for (const match of sentence.matchAll(NAMED_SPAN)) {
      const name = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]).trim();
      const words = normalizeWords(name);
      if (words.length === 0 || /\bprincip(io|i)\b/i.test(name)) continue;
      if (!wiki.principles) {
        details.push(`principio senza digest: «${name}»`);
        continue;
      }
      const shared = words.filter((word) => digestWords.has(word)).length;
      if (shared / words.length < PRINCIPLE_OVERLAP) details.push(`principio non nel digest: «${name}»`);
    }
  }
  return { pass: details.length === 0, details };
}

// ─── All together ───────────────────────────────────────────────────────────────────────────

/** The F2 checks always; the three Wiki checks only when the bundle carried the vault. */
export function runEvalChecks(text: string, prompt: string, contract: EvalBundleContract, wiki?: EvalWikiContext): EvalChecks {
  return {
    figures: checkFigures(text, prompt),
    words: checkWords(text, contract.wordLimit),
    form: checkForm(text, contract),
    promises: checkPromises(text, prompt),
    italian: checkItalian(text),
    ...(wiki
      ? { macro: checkMacroFacts(text, prompt, wiki), crossover: checkCrossover(text, prompt, wiki), principles: checkPrinciples(text, wiki) }
      : {}),
  };
}

export function failedChecks(checks: EvalChecks): EvalCheckId[] {
  return (Object.keys(checks) as EvalCheckId[]).filter((id) => checks[id] && !checks[id]!.pass);
}
