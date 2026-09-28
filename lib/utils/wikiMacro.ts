/**
 * The macro side of the vault (doc/ai-open-models-wiki.md § 5.3, § 5.5): what the model extracts
 * from TheBull, the check that holds every item to its quote, and the pages the SERVER renders —
 * the model never writes a file. Pure: no I/O, no clock.
 */

import { z } from 'zod';
import type { TheBullIssue } from './thebullParse';

export const MACRO_AREAS = [
  'tassi',
  'banche-centrali',
  'inflazione',
  'crescita',
  'azionario',
  'obbligazionario',
  'debito-pubblico',
  'cambio',
  'materie-prime',
  'politica',
  'altro',
] as const;
export type MacroArea = (typeof MACRO_AREAS)[number];

const AREA_LABELS: Record<MacroArea, string> = {
  tassi: 'Tassi',
  'banche-centrali': 'Banche centrali',
  inflazione: 'Inflazione',
  crescita: 'Crescita',
  azionario: 'Azionario',
  obbligazionario: 'Obbligazionario',
  'debito-pubblico': 'Debito pubblico',
  cambio: 'Cambio',
  'materie-prime': 'Materie prime',
  politica: 'Politica',
  altro: 'Altro',
};

// ── The extraction contract ────────────────────────────────────────────────────────────────────

const quoted = { citazione: z.string().min(1) };
const factSchema = z.object({ area: z.enum(MACRO_AREAS), paese: z.string(), sintesi: z.string().min(1), ...quoted });
const thesisSchema = z.object({ area: z.enum(MACRO_AREAS), sintesi: z.string().min(1), ...quoted });
const hintSchema = z.object({ sintesi: z.string().min(1), ...quoted });

export const macroExtractionSchema = z.object({
  fatti: z.array(factSchema),
  tesi: z.array(thesisSchema),
  spunti: z.array(hintSchema),
});
export type MacroExtraction = z.infer<typeof macroExtractionSchema>;
export type MacroFact = z.infer<typeof factSchema>;
export type MacroThesis = z.infer<typeof thesisSchema>;
export type MacroHint = z.infer<typeof hintSchema>;

const str = { type: 'string' } as const;
const area = { type: 'string', enum: [...MACRO_AREAS] } as const;
function strictObject(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

/** What the model is told (OpenRouter strict mode: every property required, nothing extra). */
export const MACRO_EXTRACTION_JSON_SCHEMA = strictObject({
  fatti: { type: 'array', items: strictObject({ area, paese: str, sintesi: str, citazione: str }) },
  tesi: { type: 'array', items: strictObject({ area, sintesi: str, citazione: str }) },
  spunti: { type: 'array', items: strictObject({ sintesi: str, citazione: str }) },
});

export const MACRO_EXTRACTION_SYSTEM = `Estrai informazioni da una newsletter finanziaria italiana. Non scrivi un commento: compili una scheda.

Tre liste, tutte in italiano, nell'ordine del testo:
- "fatti" (al più 20, i più rilevanti): ciò che è accaduto o è stato misurato NELLA SETTIMANA o che descrive la situazione attuale — livelli e movimenti di tassi e rendimenti, decisioni di banche centrali, dati di inflazione e crescita, debito e deficit pubblici, cambi, materie prime, eventi politici con effetto sui mercati. I richiami storici (il 2011, gli ultimi 40 anni) non sono fatti della settimana.
- "tesi" (al più 8, le principali): le interpretazioni e le previsioni dell'autore — perché accade, cosa è probabile, cosa rischia di succedere. Sono opinioni: non trasformarle in fatti, e un dato misurato non è una tesi.
- "spunti" (al più 5): i consigli generali per chi investe che l'autore ne ricava (comportamento, orizzonte, diversificazione).

Regole per ogni voce:
1. "citazione" è una frase COPIATA ALLA LETTERA dal testo, carattere per carattere, senza tagli interni né parafrasi. Una sola frase, la più corta che basta.
2. "sintesi" dice la voce in al più 25 parole. Ogni numero della sintesi deve comparire identico nella citazione (stesse cifre, stessa virgola).
3. "area" è una di: ${MACRO_AREAS.join(', ')}.
4. "paese" (solo nei fatti) è il paese o l'area a cui si riferisce (Stati Uniti, Italia, Eurozona, …), oppure "" se non ce n'è uno.
5. Una frase del testo si cita in UNA sola voce di UNA sola lista: niente doppioni, niente fatto ripetuto come tesi.
6. Non aggiungere nulla che il testo non dica: niente conoscenze esterne, niente date o cifre ricavate.`;

export function buildMacroExtractionUser(issue: TheBullIssue, point: string): string {
  return `Newsletter del ${issue.date ?? 'data sconosciuta'}, «${issue.headline}».\n\n${point}`;
}

// ── The check: every item holds to its quote ───────────────────────────────────────────────────

/** Whitespace, quotes and apostrophes normalised, so a faithful copy matches the source. */
export function normalizeForQuote(text: string): string {
  return text
    .replace(/[‘’‚′`]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The numbers a sentence states («4,25%» → «4,25»; «1.6» and «1,6» are the same number). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/\./g, ','));
}

export type DropReason = 'citazione-assente' | 'numero-fuori-citazione' | 'doppione';

export interface DroppedItem {
  kind: 'fatti' | 'tesi' | 'spunti';
  sintesi: string;
  reason: DropReason;
}

/** Why an item is dropped, or null when its quote is in the source and holds its numbers. */
export function checkQuotedItem(item: { sintesi: string; citazione: string }, normalizedSource: string): DropReason | null {
  const quote = normalizeForQuote(item.citazione).replace(/^["']|["']$/g, '');
  if (!quote || !normalizedSource.includes(quote)) return 'citazione-assente';
  const quoteNumbers = new Set(numbersIn(quote));
  if (numbersIn(item.sintesi).some((n) => !quoteNumbers.has(n))) return 'numero-fuori-citazione';
  return null;
}

export interface VerifiedExtraction {
  kept: MacroExtraction;
  dropped: DroppedItem[];
}

/**
 * Keeps the items that hold to their quotes, facts first. An item whose quote repeats — or sits
 * inside — the quote of an item already kept is a `doppione`: the same sentence said twice, the
 * second time often as a «thesis».
 */
export function verifyExtraction(extraction: MacroExtraction, source: string): VerifiedExtraction {
  const normalizedSource = normalizeForQuote(source);
  const dropped: DroppedItem[] = [];
  const keptQuotes: string[] = [];
  const keep = <T extends { sintesi: string; citazione: string }>(kind: DroppedItem['kind'], items: T[]): T[] =>
    items.filter((item) => {
      let reason = checkQuotedItem(item, normalizedSource);
      const quote = normalizeForQuote(item.citazione);
      if (!reason && keptQuotes.some((kept) => kept.includes(quote))) reason = 'doppione';
      if (reason) dropped.push({ kind, sintesi: item.sintesi, reason });
      else keptQuotes.push(quote);
      return reason === null;
    });
  return {
    kept: {
      fatti: keep('fatti', extraction.fatti),
      tesi: keep('tesi', extraction.tesi),
      spunti: keep('spunti', extraction.spunti),
    },
    dropped,
  };
}

/**
 * Whether a verified extraction is good enough to publish. A week with no fact, or one where more
 * than a third of the items failed their quote, is a model that did not copy: it fails VISIBLY
 * (§ 9, «newsletter che cambia formato») and is retried, rather than a thin page that looks fine.
 */
export function isExtractionAcceptable({ kept, dropped }: VerifiedExtraction): boolean {
  if (kept.fatti.length === 0) return false;
  // A duplicate is untidy, not unfaithful: only the items that failed their quote count.
  const failed = dropped.filter((d) => d.reason !== 'doppione').length;
  const keptCount = kept.fatti.length + kept.tesi.length + kept.spunti.length;
  return failed * 3 <= keptCount + failed;
}

// ── Pages ──────────────────────────────────────────────────────────────────────────────────────

/** The machine-readable record of a compiled week, kept beside its page to rebuild the month. */
export interface MacroWeekRecord {
  week: string;
  date: string;
  issue: number | null;
  headline: string;
  subtitle: string;
  model: string;
  compiledAt: string;
  rawPath: string;
  extraction: MacroExtraction;
  dropped: DroppedItem[];
  indices: TheBullIssue['indices'];
  readings: TheBullIssue['readings'];
  episodes: TheBullIssue['episodes'];
}

export const rawPathFor = (date: string) => `raw/thebull/${date}.md`;
export const weekPagePath = (week: string) => `wiki/macro/settimane/${week}.md`;
export const weekRecordPath = (week: string) => `wiki/macro/settimane/${week}.json`;
export const monthPagePath = (month: string) => `wiki/macro/mesi/${month}.md`;

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function frontmatter(fields: Record<string, string | number | string[]>): string {
  const lines = Object.entries(fields).map(([key, value]) => {
    if (!Array.isArray(value)) return `${key}: ${typeof value === 'number' ? value : yamlString(value)}`;
    return value.length === 0 ? `${key}: []` : `${key}:\n${value.map((v) => `  - ${v}`).join('\n')}`;
  });
  return `---\n${lines.join('\n')}\n---\n`;
}

/** An ALL-CAPS headline in sentence case: a capital at the start and after each full stop. */
export function sentenceCase(title: string): string {
  if (title !== title.toUpperCase()) return title;
  return title.toLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

function groupByArea<T extends { area: MacroArea }>(items: T[]): [MacroArea, T[]][] {
  return MACRO_AREAS.map((a) => [a, items.filter((item) => item.area === a)] as [MacroArea, T[]]).filter(
    ([, list]) => list.length > 0
  );
}

function quoteLine(citazione: string): string {
  return `  > ${citazione.replace(/\s+/g, ' ').trim()}`;
}

function indexTable(indices: NonNullable<TheBullIssue['indices']>): string {
  const head = `| Indice | ${indices.horizons.join(' | ')} |`;
  const sep = `| --- | ${indices.horizons.map(() => '---:').join(' | ')} |`;
  const rows = indices.rows.map((row) => `| ${row.name} | ${row.values.join(' | ')} |`);
  return [head, sep, ...rows, '', indices.caption ? `_${indices.caption}_` : ''].join('\n').trim();
}

/** The raw file: the cleaned text under a frontmatter that says where it came from. */
export function renderRawFile(input: {
  date: string;
  issue: number | null;
  subject: string;
  receivedAt: string;
  filter: string;
  cleanedText: string;
}): string {
  return (
    frontmatter({
      fonte: 'thebull',
      ...(input.issue !== null ? { numero: input.issue } : {}),
      data: input.date,
      oggetto: input.subject,
      ricevuto: input.receivedAt,
      filtro: input.filter,
    }) +
    '\n' +
    input.cleanedText
  );
}

export function renderWeekPage(record: MacroWeekRecord): string {
  const { extraction: x } = record;
  const parts: string[] = [
    frontmatter({
      tipo: 'macro-settimana',
      settimana: record.week,
      data: record.date,
      ...(record.issue !== null ? { numero: record.issue } : {}),
      aggiornato: record.compiledAt.slice(0, 10),
      modello: record.model,
      scartate: record.dropped.length,
      fonti: [record.rawPath],
    }),
    `# ${record.week} — ${sentenceCase(record.headline)}`,
    '',
    record.subtitle ? `> ${record.subtitle.replace(/\s+/g, ' ')}\n` : '',
    `Fonte: TheBull n. ${record.issue ?? '?'} del ${record.date} ([[${record.rawPath.replace(/\.md$/, '')}]]). Pagina compilata dal server: non modificarla a mano (CLAUDE.md § 2).`,
    '',
    '## Fatti',
    '',
  ];
  for (const [a, facts] of groupByArea(x.fatti)) {
    parts.push(`### ${AREA_LABELS[a]}`, '');
    for (const f of facts) parts.push(`- ${f.sintesi}${f.paese ? ` — _${f.paese}_` : ''}`, quoteLine(f.citazione));
    parts.push('');
  }
  if (x.tesi.length > 0) {
    parts.push("## Tesi dell'autore", '', '_Opinioni di TheBull, non fatti._', '');
    for (const t of x.tesi) parts.push(`- **${AREA_LABELS[t.area]}** — ${t.sintesi}`, quoteLine(t.citazione));
    parts.push('');
  }
  if (x.spunti.length > 0) {
    parts.push('## Spunti per i Principi', '', '_Il lint mensile propone quali promuovere (CLAUDE.md § 4.3)._', '');
    for (const s of x.spunti) parts.push(`- ${s.sintesi}`, quoteLine(s.citazione));
    parts.push('');
  }
  if (record.indices) parts.push('## Rendimenti degli indici', '', indexTable(record.indices), '');
  if (record.readings.length > 0) {
    parts.push('## Letture consigliate', '');
    for (const r of record.readings) parts.push(`- [${r.title}](${r.url}) — ${r.source}`);
    parts.push('');
  }
  if (record.episodes.length > 0) {
    parts.push('## Episodi della settimana', '');
    for (const e of record.episodes) parts.push(`- ${e.url ? `[${e.title}](${e.url})` : e.title}${e.summary ? ` — ${e.summary}` : ''}`);
    parts.push('');
  }
  if (record.dropped.length > 0) {
    parts.push('## Voci scartate', '', '_La citazione non era nel testo, un numero della sintesi non era nella citazione, o la frase era già citata._', '');
    for (const d of record.dropped) parts.push(`- ${d.kind} · ${d.reason} · ${d.sintesi}`);
    parts.push('');
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** The month, rebuilt from its weeks' records: facts and theses by area, the last index table. */
export function renderMonthPage(month: string, records: MacroWeekRecord[], compiledAt: string): string {
  const weeks = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const parts: string[] = [
    frontmatter({
      tipo: 'macro-mese',
      mese: month,
      aggiornato: compiledAt.slice(0, 10),
      settimane: weeks.map((w) => w.week),
      fonti: weeks.map((w) => weekPagePath(w.week)),
    }),
    `# Macro — ${month}`,
    '',
    'Rigenerata dal server a ogni settimana del mese, dalle pagine settimanali. Le citazioni stanno nelle settimane.',
    '',
    '## Le settimane',
    '',
    ...weeks.map((w) => `- [[${weekPagePath(w.week).replace(/\.md$/, '')}|${w.week}]] — ${sentenceCase(w.headline)}`),
    '',
    '## Fatti',
    '',
  ];
  const allFacts = weeks.flatMap((w) => w.extraction.fatti.map((f) => ({ ...f, week: w.week })));
  for (const [a, facts] of groupByArea(allFacts)) {
    parts.push(`### ${AREA_LABELS[a]}`, '');
    for (const f of facts) parts.push(`- ${f.sintesi}${f.paese ? ` — _${f.paese}_` : ''} (${f.week})`);
    parts.push('');
  }
  const allTheses = weeks.flatMap((w) => w.extraction.tesi.map((t) => ({ ...t, week: w.week })));
  if (allTheses.length > 0) {
    parts.push("## Tesi dell'autore", '', '_Opinioni di TheBull, non fatti._', '');
    for (const t of allTheses) parts.push(`- **${AREA_LABELS[t.area]}** — ${t.sintesi} (${t.week})`);
    parts.push('');
  }
  const lastIndices = [...weeks].reverse().find((w) => w.indices)?.indices;
  if (lastIndices) parts.push("## Rendimenti degli indici (ultima settimana del mese)", '', indexTable(lastIndices), '');
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ── log.md ─────────────────────────────────────────────────────────────────────────────────────

export const MAX_COMPILE_RETRIES = 3;

export type CompileState = { status: 'ok' } | { status: 'pending'; retries: number } | { status: 'failed' };

/** `- 2026-09-28T10:05Z · compile · thebull/2026-09-27 · pending 1/3` (vault CLAUDE.md § 5). */
export function formatLogLine(at: string, operation: string, subject: string, outcome: string): string {
  return `- ${at.replace(/:\d{2}(\.\d+)?Z$/, 'Z')} · ${operation} · ${subject} · ${outcome}`;
}

export function formatCompileOutcome(state: CompileState, detail?: string): string {
  const base = state.status === 'pending' ? `pending ${state.retries}/${MAX_COMPILE_RETRIES}` : state.status;
  return detail ? `${base} (${detail})` : base;
}

const LOG_LINE_RE = /^- (\S+) · (\S+) · (\S+) · (.+)$/;

/** The LAST compile state of each raw subject (`thebull/<date>`), read from log.md. */
export function compileStates(log: string): Map<string, CompileState> {
  const states = new Map<string, CompileState>();
  for (const line of log.split('\n')) {
    const match = line.trim().match(LOG_LINE_RE);
    if (!match || match[2] !== 'compile') continue;
    const outcome = match[4];
    const pending = outcome.match(/^pending (\d+)\/\d+/);
    if (pending) states.set(match[3], { status: 'pending', retries: Number(pending[1]) });
    else if (outcome.startsWith('ok')) states.set(match[3], { status: 'ok' });
    else if (outcome.startsWith('failed')) states.set(match[3], { status: 'failed' });
  }
  return states;
}

/** The state after one more failed retry: `pending n+1`, or `failed` once the retries run out. */
export function nextFailedState(previous: CompileState | undefined): CompileState {
  const retries = previous?.status === 'pending' ? previous.retries + 1 : 1;
  return retries >= MAX_COMPILE_RETRIES ? { status: 'failed' } : { status: 'pending', retries };
}

export function appendLogLines(log: string, lines: string[]): string {
  const base = log.endsWith('\n') || log === '' ? log : `${log}\n`;
  return base + lines.map((line) => `${line}\n`).join('');
}
