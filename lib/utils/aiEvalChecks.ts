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
  /** Half the unit of the last written digit: how far rounding may have moved it. */
  tolerance: number;
}

export interface CheckResult {
  pass: boolean;
  /** What failed, in words a reader can check against the text. Empty when it passes. */
  details: string[];
}

export type EvalCheckId = 'figures' | 'words' | 'form' | 'promises' | 'italian';

export type EvalChecks = Record<EvalCheckId, CheckResult>;

export interface EvalBundleContract {
  kind: 'periodic' | 'weekly';
  wordLimit: number;
  /** Yearly email whose two comparisons coincide: sections 3 and 4 may be one. */
  comparisonsMerged?: boolean;
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
      const tolerance = Math.max(
        ...readings.map((reading) => {
          // «5.000 €» may be a rounded 5.240: trailing zeros of an integer widen the tolerance.
          const trailingZeros =
            reading.decimals === 0 && reading.value !== 0 ? (String(reading.value).match(/0+$/)?.[0].length ?? 0) : 0;
          const unitOfLastDigit = reading.decimals > 0 ? 10 ** -reading.decimals : 10 ** trailingZeros;
          return (unitOfLastDigit / 2) * factor;
        })
      );
      figures.push({
        raw: match[0].trim(),
        unit,
        values: readings.map((reading) => Math.abs(reading.value * factor)),
        tolerance,
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
    const found = figure.values.some((value) => pool.some((candidate) => Math.abs(candidate - value) <= figure.tolerance + EPSILON));
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
  return contract.kind === 'weekly' ? checkWeeklyForm(text) : checkPeriodicSections(text, Boolean(contract.comparisonsMerged));
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

// ─── All together ───────────────────────────────────────────────────────────────────────────

export function runEvalChecks(text: string, prompt: string, contract: EvalBundleContract): EvalChecks {
  return {
    figures: checkFigures(text, prompt),
    words: checkWords(text, contract.wordLimit),
    form: checkForm(text, contract),
    promises: checkPromises(text, prompt),
    italian: checkItalian(text),
  };
}

export function failedChecks(checks: EvalChecks): EvalCheckId[] {
  return (Object.keys(checks) as EvalCheckId[]).filter((id) => !checks[id].pass);
}
