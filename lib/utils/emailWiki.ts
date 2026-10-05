/**
 * The Wiki in the periodic emails (F5, doc/ai-open-models-wiki.md § 5.4): which vault pages a
 * period reads, how they are cleaned for a prompt, and the rules the model gets with them.
 *
 * Retrieval is DETERMINISTIC by date, never a search: a monthly email reads its month's macro
 * page, a quarter, a semester or a year the pages of the months in its window, every one the
 * Principles digest. Pure — the vault is read by `lib/server/wiki/wikiReader.ts`.
 *
 * Absence is never promised: a month without a page is named as such, and with no page at all
 * (or the vault unreachable) neither the block nor its rules reach the prompt.
 */

import { MONTH_NAMES } from '@/lib/constants/months';
import type { EmailPeriodicPeriodType } from '@/lib/server/assistant/prompts';

/** Vault paths (doc/ai-open-models-wiki.md § 5.1). */
export const PRINCIPLES_DIGEST_PATH = 'wiki/principi/_digest.md';
export function macroMonthPath(month: string): string {
  return `wiki/macro/mesi/${month}.md`;
}

/** `full`: the month page as compiled. `reduced`: the per-month cut of `reduceMacroMonthPage`. */
export type MacroDepth = 'full' | 'reduced';

/**
 * Owner's call (2026-10-05): whole pages up to a quarter (~3k tokens a month, ~10k for a
 * quarter), the code-made cut from a semester up — twelve whole months are ~45k tokens, nine
 * times the period's own data, and the portfolio would drown in them.
 */
export const MACRO_DEPTH: Record<EmailPeriodicPeriodType, MacroDepth> = {
  monthly: 'full',
  quarterly: 'full',
  semiannual: 'reduced',
  yearly: 'reduced',
};

/** The reduced cut: the most recent facts per area and theses, plus the index table. */
export const REDUCED_FACTS_PER_AREA = 2;
export const REDUCED_THESES = 8;

export interface EmailWikiMonth {
  /** `YYYY-MM`. */
  month: string;
  /** The page as it goes in the prompt (cleaned, and reduced when the depth says so). */
  page: string;
}

export interface EmailWikiContext {
  /** The Principles digest, cleaned; null when it is missing, empty or unreadable. */
  principles: string | null;
  /** The window's months that have a page, in calendar order. */
  months: EmailWikiMonth[];
  /** The window's months without a page (or whose read failed), `YYYY-MM`. */
  missingMonths: string[];
  depth: MacroDepth;
}

/** The window's months as `YYYY-MM`, from `startMonth` to `endMonth` of `year` (1-12). */
export function emailWikiMonths(year: number, startMonth: number, endMonth: number): string[] {
  const months: string[] = [];
  for (let m = startMonth; m <= endMonth; m++) months.push(`${year}-${String(m).padStart(2, '0')}`);
  return months;
}

/** «settembre 2026» from `2026-09`. */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1].toLowerCase()} ${year}`;
}

function stripFrontmatter(text: string): string {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/**
 * Obsidian links mean nothing to the model: «[[path|Testo]]» keeps its text, «([[path]])» after a
 * heading goes, a bare «[[path]]» keeps the page's name.
 */
export function stripWikiLinks(text: string): string {
  return text
    .replace(/\s*\(\[\[[^\]]+\]\]\)/g, '')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, (_, path: string) => path.split('/').pop() ?? path);
}

/** Splits a page body into its `## ` sections (heading line included), dropping what precedes the first. */
function sections(body: string): string[] {
  const parts = body.split(/\n(?=## )/);
  return parts.filter((part) => part.startsWith('## '));
}

/**
 * A month page as it goes in the prompt: no frontmatter, no title, no preamble, no list of the
 * weeks (wiki links, and the sources of a page the model does not need) — the facts by area,
 * the author's theses and the month-end index table, as the server compiled them.
 */
export function cleanMacroMonthPage(text: string): string {
  const body = stripFrontmatter(text.replace(/\r\n/g, '\n'));
  return sections(body)
    .filter((section) => !section.startsWith('## Le settimane'))
    .map((section) => stripWikiLinks(section).trim())
    .join('\n\n');
}

/** Keeps the last `n` bullet lines of a block and every other line, in order. */
function keepLastBullets(lines: string[], n: number): string[] {
  const bullets = lines.map((line, index) => (line.startsWith('- ') ? index : -1)).filter((index) => index >= 0);
  const dropped = new Set(bullets.slice(0, Math.max(0, bullets.length - n)));
  return lines.filter((_, index) => !dropped.has(index));
}

/**
 * The code-made cut of a cleaned month page (owner's call, 2026-10-05: never a summary written by
 * a model): per area the `REDUCED_FACTS_PER_AREA` most recent facts — a page lists them by week,
 * oldest first, so the last ones are where the month ended — the `REDUCED_THESES` most recent
 * theses, and the index table whole.
 */
export function reduceMacroMonthPage(cleaned: string): string {
  return sections(`\n${cleaned}`)
    .map((section) => {
      const lines = section.trim().split('\n');
      if (section.startsWith('## Fatti')) {
        const [heading, ...rest] = lines;
        const areas = rest.join('\n').split(/\n(?=### )/);
        return [heading, ...areas.map((area) => keepLastBullets(area.split('\n'), REDUCED_FACTS_PER_AREA).join('\n'))].join('\n');
      }
      if (section.startsWith("## Tesi dell'autore")) return keepLastBullets(lines, REDUCED_THESES).join('\n');
      return lines.join('\n');
    })
    .map((section) => section.replace(/\n{3,}/g, '\n\n').trim())
    .join('\n\n');
}

/** A page prepared at the period's depth. */
export function prepareMacroMonthPage(text: string, depth: MacroDepth): string {
  const cleaned = cleanMacroMonthPage(text);
  return depth === 'reduced' ? reduceMacroMonthPage(cleaned) : cleaned;
}

/**
 * The digest as it goes in the system block: no frontmatter, no title and no preamble (the
 * vault's own note on its token ceiling), links reduced to text. Null when nothing is left.
 */
export function cleanPrinciplesDigest(text: string): string | null {
  const body = stripFrontmatter(text.replace(/\r\n/g, '\n'));
  const themed = sections(`\n${body}`);
  const kept = themed.length > 0 ? themed.join('\n\n') : body.replace(/^# .*\n?/m, '');
  const cleaned = stripWikiLinks(kept).replace(/\n{3,}/g, '\n\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Whether the context carries anything for the prompt. */
export function hasEmailWiki(context: EmailWikiContext | null): context is EmailWikiContext {
  return context !== null && (context.principles !== null || context.months.length > 0);
}

/**
 * The macro block of the user message: one sub-heading per month, and — when the window has
 * months without a page — the months it does NOT cover, so the model cannot read a silence as
 * a quiet month. Empty when no month has a page.
 */
export function formatMacroForPrompt(context: EmailWikiContext): string[] {
  if (context.months.length === 0) return [];
  const covered = context.months.map((entry) => monthLabel(entry.month)).join(', ');
  const lines = [
    `--- CONTESTO MACRO (newsletter TheBull, ${covered}) ---`,
    context.depth === 'reduced'
      ? `Per ogni mese: i ${REDUCED_FACTS_PER_AREA} fatti più recenti per area, le ${REDUCED_THESES} tesi più recenti dell'autore e i rendimenti degli indici a fine mese.`
      : "Per ogni mese: i fatti per area, le tesi dell'autore e i rendimenti degli indici a fine mese.",
  ];
  if (context.missingMonths.length > 0) {
    lines.push(`Nessuna pagina macro per ${context.missingMonths.map(monthLabel).join(', ')}: per quei mesi non hai contesto macro.`);
  }
  lines.push('');
  for (const entry of context.months) {
    // The page's own headings go one level down, under the month's.
    lines.push(`## Macro di ${monthLabel(entry.month)}`, '', entry.page.replace(/^(#{2,5}) /gm, '#$1 '), '');
  }
  return lines;
}

/**
 * The rules and the digest for the system block, or null when the Wiki brought nothing. Each
 * rule appears only with the block it governs, so the prompt never names a block it did not send
 * (owner's wording, 2026-10-05).
 */
export function buildWikiSystemBlock(context: EmailWikiContext | null): string | null {
  if (!hasEmailWiki(context)) return null;
  const hasMacro = context.months.length > 0;
  const hasPrinciples = context.principles !== null;
  const title =
    hasMacro && hasPrinciples
      ? "# Contesto macro e principi dell'investitore"
      : hasMacro
        ? '# Contesto macro'
        : "# Principi dell'investitore";
  const rules: string[] = [];
  if (hasMacro) {
    rules.push(
      "- Il blocco CONTESTO MACRO riassume la newsletter TheBull nei mesi del periodo: i fatti sono accaduti, le tesi sono opinioni dell'autore e si riportano come sue, mai come fatti.",
      '- Il contesto macro spiega il MERCATO del portafoglio, mai le entrate e le spese personali.',
      "- Nessuna cifra del portafoglio viene dal contesto macro, e nessuna cifra macro si presenta come del portafoglio: una cifra macro si cita con il suo soggetto (l'indice, il paese, la banca centrale)."
    );
  }
  if (hasPrinciples) {
    rules.push(
      "- I PRINCIPI DELL'INVESTITORE orientano il GIUDIZIO, non i NUMERI: non cambiano una cifra e non ne aggiungono.",
      "- Un'osservazione che poggia su un principio lo nomina.",
      '- Se i dati del periodo contraddicono un principio, dillo apertamente invece di piegare la lettura.'
    );
  }
  const parts = [title, ...rules];
  if (hasPrinciples) parts.push('', "--- PRINCIPI DELL'INVESTITORE ---", context.principles!);
  return parts.join('\n');
}
