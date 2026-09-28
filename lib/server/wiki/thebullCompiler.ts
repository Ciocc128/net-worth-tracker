import 'server-only';

/**
 * TheBull → the vault (doc/ai-open-models-wiki.md § 5.2–5.3): the raw file, the week's page and
 * its record, the month rebuilt from its weeks, and the log line — one commit per operation.
 *
 * Three entry points: `ingestTheBull` (the Apps Script's POST, every Sunday and for the archive),
 * `retryPendingTheBull` (the daily cron, three retries then `failed`) and `recompileTheBull`
 * (`npm run wiki:compile -- <date>`, by hand). A compilation that fails never loses the raw: it is
 * committed first-class and the log line says what is owed.
 */

import { AI_MODELS } from '@/lib/constants/aiModels';
import { extractStructured } from '@/lib/server/llm';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { THEBULL_CLEAN_VERSION, cleanTheBullText, isTheBullIssue, isoWeekOf, parseTheBull, pointText, type TheBullIssue } from '@/lib/utils/thebullParse';
import {
  MACRO_EXTRACTION_JSON_SCHEMA,
  MACRO_EXTRACTION_SYSTEM,
  appendLogLines,
  buildMacroExtractionUser,
  compileStates,
  formatCompileOutcome,
  formatLogLine,
  isExtractionAcceptable,
  macroExtractionSchema,
  monthPagePath,
  nextFailedState,
  rawPathFor,
  renderMonthPage,
  renderRawFile,
  renderWeekPage,
  verifyExtraction,
  weekPagePath,
  weekRecordPath,
  type CompileState,
  type MacroExtraction,
  type MacroWeekRecord,
} from '@/lib/utils/wikiMacro';
import type { VaultClient, VaultFile } from './githubVault';

/** Output budget of one extraction: ~30 items of ~80 tokens, with room; reasoning capped apart. */
const EXTRACTION_MAX_TOKENS = 8000;
const EXTRACTION_REASONING_MAX_TOKENS = 2000;
const LOG_PATH = 'log.md';

export type Extractor = (system: string, user: string) => Promise<MacroExtraction | null>;

export interface CompilerDeps {
  vault: VaultClient;
  extract?: Extractor;
  now?: () => Date;
}

const defaultExtractor: Extractor = (system, user) =>
  extractStructured('THEBULL_COMPILE', {
    system,
    user,
    schema: macroExtractionSchema,
    jsonSchema: MACRO_EXTRACTION_JSON_SCHEMA,
    name: 'thebull_week',
    maxTokens: EXTRACTION_MAX_TOKENS,
    reasoningMaxTokens: EXTRACTION_REASONING_MAX_TOKENS,
  });

type CompileResult = { ok: true; record: MacroWeekRecord } | { ok: false; reason: string };

/** The model's pass over «Il punto della settimana», held to its quotes. */
export async function compileIssue(
  issue: TheBullIssue,
  date: string,
  compiledAt: string,
  extract: Extractor = defaultExtractor
): Promise<CompileResult> {
  const point = pointText(issue);
  if (!point.trim()) return { ok: false, reason: 'punto della settimana assente' };
  const extraction = await extract(MACRO_EXTRACTION_SYSTEM, buildMacroExtractionUser(issue, point));
  if (!extraction) return { ok: false, reason: 'nessuna risposta valida dal modello' };
  const verified = verifyExtraction(extraction, point);
  if (!isExtractionAcceptable(verified)) {
    return { ok: false, reason: `citazioni non verificate: ${verified.dropped.length} scartate su ${verified.dropped.length + verified.kept.fatti.length + verified.kept.tesi.length + verified.kept.spunti.length}` };
  }
  return {
    ok: true,
    record: {
      week: isoWeekOf(date),
      date,
      issue: issue.issue,
      headline: issue.headline,
      subtitle: issue.subtitle,
      model: AI_MODELS.THEBULL_COMPILE.model,
      compiledAt,
      rawPath: rawPathFor(date),
      extraction: verified.kept,
      dropped: verified.dropped,
      indices: issue.indices,
      readings: issue.readings,
      episodes: issue.episodes,
    },
  };
}

/** Every ISO week that has a day in `month` (`YYYY-MM`): the only week records a month reads. */
function weeksOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = new Set<string>();
  for (let d = 1; d <= days; d++) weeks.add(isoWeekOf(`${month}-${String(d).padStart(2, '0')}`));
  return [...weeks];
}

/** The week's page and record, plus its month rebuilt from every record of that month. */
async function compiledFiles(vault: VaultClient, record: MacroWeekRecord, compiledAt: string): Promise<VaultFile[]> {
  const month = record.date.slice(0, 7);
  const existing = new Set(await vault.listDir('wiki/macro/settimane'));
  const records: MacroWeekRecord[] = [record];
  for (const week of weeksOfMonth(month)) {
    if (week === record.week || !existing.has(`${week}.json`)) continue;
    const text = await vault.readFile(weekRecordPath(week));
    if (!text) continue;
    const other = JSON.parse(text) as MacroWeekRecord;
    if (other.date.slice(0, 7) === month) records.push(other);
  }
  return [
    { path: weekPagePath(record.week), content: renderWeekPage(record) },
    { path: weekRecordPath(record.week), content: `${JSON.stringify(record, null, 2)}\n` },
    { path: monthPagePath(month), content: renderMonthPage(month, records, compiledAt) },
  ];
}

async function withLog(vault: VaultClient, lines: string[]): Promise<VaultFile> {
  const log = (await vault.readFile(LOG_PATH)) ?? '# Log\n\n';
  return { path: LOG_PATH, content: appendLogLines(log, lines) };
}

export interface IngestInput {
  receivedAt: string;
  subject: string;
  text: string;
}

export type IngestOutcome =
  | { status: 'ignored'; reason: string }
  | { status: 'duplicate'; date: string }
  | { status: 'ingested'; date: string; week: string; compiled: boolean; reason?: string };

export async function ingestTheBull(input: IngestInput, { vault, extract, now = () => new Date() }: CompilerDeps): Promise<IngestOutcome> {
  const cleaned = cleanTheBullText(input.text);
  const issue = parseTheBull(cleaned);
  // A mail from the sender that is not an issue (the subscription confirmation): nothing to write.
  if (!isTheBullIssue(issue)) return { status: 'ignored', reason: 'non è un numero della newsletter' };
  // The issue line dates the newsletter; the receipt's Italian day only when the line is missing.
  const date = issue.date ?? getItalyDateIso(new Date(input.receivedAt));
  const rawPath = rawPathFor(date);
  if ((await vault.readFile(rawPath)) !== null) return { status: 'duplicate', date };

  const at = now().toISOString();
  const compiled = await compileIssue(issue, date, at, extract);
  const raw: VaultFile = {
    path: rawPath,
    content: renderRawFile({ date, issue: issue.issue, subject: input.subject, receivedAt: input.receivedAt, filter: THEBULL_CLEAN_VERSION, cleanedText: cleaned }),
  };
  const subject = `thebull/${date}`;
  const compileState: CompileState = compiled.ok ? { status: 'ok' } : { status: 'pending', retries: 0 };

  await vault.commit(`ingest: ${subject}`, async () => [
    raw,
    ...(compiled.ok ? await compiledFiles(vault, compiled.record, at) : []),
    await withLog(vault, [
      formatLogLine(at, 'ingest', subject, 'ok'),
      formatLogLine(at, 'compile', subject, formatCompileOutcome(compileState, compiled.ok ? undefined : compiled.reason)),
    ]),
  ]);
  return {
    status: 'ingested',
    date,
    week: isoWeekOf(date),
    compiled: compiled.ok,
    ...(compiled.ok ? {} : { reason: compiled.reason }),
  };
}

/**
 * Compiles an already-stored raw again. `retry` (the cron) advances the pending counter on a
 * failure; `manual` (the script) ends in `ok` or `failed`, whatever the state before.
 */
export async function recompileTheBull(
  date: string,
  mode: 'retry' | 'manual',
  { vault, extract, now = () => new Date() }: CompilerDeps
): Promise<{ ok: boolean; reason?: string }> {
  const raw = await vault.readFile(rawPathFor(date));
  if (raw === null) return { ok: false, reason: `${rawPathFor(date)} non esiste` };
  const at = now().toISOString();
  const compiled = await compileIssue(parseTheBull(raw), date, at, extract);
  const subject = `thebull/${date}`;

  await vault.commit(`compile: ${subject}`, async () => {
    let state: CompileState;
    if (compiled.ok) state = { status: 'ok' };
    else if (mode === 'manual') state = { status: 'failed' };
    else state = nextFailedState(compileStates((await vault.readFile(LOG_PATH)) ?? '').get(subject));
    const detail = [mode === 'manual' ? 'manuale' : '', compiled.ok ? '' : compiled.reason].filter(Boolean).join(' · ');
    return [
      ...(compiled.ok ? await compiledFiles(vault, compiled.record, at) : []),
      await withLog(vault, [formatLogLine(at, 'compile', subject, formatCompileOutcome(state, detail || undefined))]),
    ];
  });
  return compiled.ok ? { ok: true } : { ok: false, reason: compiled.reason };
}

/** The daily cron's pass: one retry for every week whose last compile line is `pending`. */
export async function retryPendingTheBull(deps: CompilerDeps): Promise<{ retried: number; compiled: number }> {
  const states = compileStates((await deps.vault.readFile(LOG_PATH)) ?? '');
  let retried = 0;
  let compiled = 0;
  for (const [subject, state] of states) {
    if (state.status !== 'pending' || !subject.startsWith('thebull/')) continue;
    retried++;
    const result = await recompileTheBull(subject.slice('thebull/'.length), 'retry', deps);
    if (result.ok) compiled++;
  }
  return { retried, compiled };
}
