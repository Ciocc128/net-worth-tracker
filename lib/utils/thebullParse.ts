/**
 * TheBull's weekly newsletter, read by CODE (doc/ai-open-models-wiki.md § 5.2–5.3).
 *
 * The newsletter is a fixed Mailchimp template: a preamble with `#<issue> - DD/MM/YYYY`, then
 * sections opened by `** TITLE` on one line and a row of dashes on the next. Everything with a
 * fixed shape — the index table, the reading list, the episodes — is parsed here, so its figures
 * never pass through a model. Only «Il punto della settimana», free prose, goes to the model.
 *
 * One parser reads both the plain body Gmail hands over and the cleaned raw the vault keeps:
 * `cleanTheBullText` drops sections and lines but keeps the template's format, so a retry weeks
 * later re-reads the stored raw exactly as the first compilation read the email.
 */

/** Bumped whenever the cleaning rule changes; written into every raw file it produced. */
export const THEBULL_CLEAN_VERSION = 'thebull-clean-v1';

export interface TheBullSection {
  title: string;
  body: string;
}

export interface TheBullIndexRow {
  name: string;
  /** One cell per horizon, as printed («+1.39%»): the source's own figures, never recomputed. */
  values: string[];
}

export interface TheBullIndexTable {
  horizons: string[];
  rows: TheBullIndexRow[];
  /** The caption under the table («Variazioni in % al 27/09/2026 in Euro.»), verbatim. */
  caption: string;
}

export interface TheBullReading {
  title: string;
  source: string;
  url: string;
}

export interface TheBullEpisode {
  title: string;
  url: string;
  summary: string;
}

export interface TheBullIssue {
  issue: number | null;
  /** `YYYY-MM-DD`, from the `#<issue> - DD/MM/YYYY` line; null when the line is missing. */
  date: string | null;
  /** The first section's title: the week's headline. */
  headline: string;
  /** The first section's body: the one-sentence subtitle. */
  subtitle: string;
  brief: string[];
  /** «Il punto della settimana», its sub-sections in order. The only part a model reads. */
  point: TheBullSection[];
  readings: TheBullReading[];
  episodes: TheBullEpisode[];
  indices: TheBullIndexTable | null;
  nextEpisode: string;
}

const SECTION_RE = /^\*\* (.+)\n-{10,}\n?/gm;
const ISSUE_RE = /^#(\d+)\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/m;

/** The top-level markers of the template; any other title is a sub-section of the one before. */
type Marker = 'brief' | 'point' | 'readings' | 'sponsor' | 'episodes' | 'indices' | 'next' | 'social';

function markerOf(title: string): Marker | null {
  const t = title.replace(/\(\s*\)\s*$/, '').trim().toUpperCase();
  if (t.startsWith('IN BREVE')) return 'brief';
  if (t === 'IL PUNTO DELLA SETTIMANA') return 'point';
  if (t === 'LETTURE CONSIGLIATE') return 'readings';
  if (t.startsWith('SPONSORED')) return 'sponsor';
  if (t.startsWith('DAGLI EPISODI')) return 'episodes';
  if (t.startsWith('RENDIMENTO DEI PRINCIPALI INDICI')) return 'indices';
  if (t === 'NEL PROSSIMO EPISODIO') return 'next';
  if (t.startsWith('SEGUICI SU')) return 'social';
  return null;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Drops a leading YAML frontmatter (the raw files carry one). */
export function stripFrontmatter(text: string): string {
  const normalized = normalizeNewlines(text);
  if (!normalized.startsWith('---\n')) return normalized;
  const end = normalized.indexOf('\n---\n', 4);
  return end === -1 ? normalized : normalized.slice(end + 5);
}

/** The preamble and the sections, in order, with the template's markers resolved. */
export function splitSections(text: string): { preamble: string; sections: TheBullSection[] } {
  const normalized = normalizeNewlines(text);
  const matches = [...normalized.matchAll(SECTION_RE)];
  if (matches.length === 0) return { preamble: normalized, sections: [] };
  const sections = matches.map((match, i) => {
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : normalized.length;
    return { title: match[1].trim(), body: normalized.slice(start, end).trim() };
  });
  return { preamble: normalized.slice(0, matches[0].index).trim(), sections };
}

/** Groups the flat section list under the marker each one follows. */
function groupSections(sections: TheBullSection[]): {
  head: TheBullSection | null;
  groups: Map<Marker | 'unknown', TheBullSection[]>;
  markerBodies: Map<Marker, string>;
} {
  const groups = new Map<Marker | 'unknown', TheBullSection[]>();
  const markerBodies = new Map<Marker, string>();
  let head: TheBullSection | null = null;
  let current: Marker | 'unknown' | null = null;
  for (const section of sections) {
    const marker = markerOf(section.title);
    if (marker) {
      current = marker;
      markerBodies.set(marker, section.body);
      if (!groups.has(marker)) groups.set(marker, []);
      continue;
    }
    if (current === null && !head) {
      head = section;
      continue;
    }
    // Only the point and the episodes own sub-sections; an unmarked section anywhere else is
    // prose the template does not name (an older issue?) — the point's fallback.
    const owner: Marker | 'unknown' = current === 'point' || current === 'episodes' ? current : 'unknown';
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner)!.push(section);
  }
  return { head, groups, markerBodies };
}

/** Mailchimp links that carry the subscriber's own id, or lead to the list's machinery. */
const PERSONAL_LINK_RE = /(list-manage\.com|forward-to-friend\.com|mailchi\.mp|[?&]e=[0-9a-f]{6,})/i;

/**
 * The fixed cleaning rule applied BEFORE the raw is written (owner's decision, 2026-09-28): the
 * sponsor, the Academy promotion, the social links, the footer and every line carrying the
 * subscriber's id go; everything else stays word for word, in the template's own format. After
 * this the raw is immutable.
 */
export function cleanTheBullText(plainBody: string): string {
  const { preamble, sections } = splitSections(stripFrontmatter(plainBody));
  const issueLine = preamble.match(ISSUE_RE)?.[0] ?? '';
  const out: string[] = [];
  if (issueLine) out.push(issueLine, '');

  let current: Marker | null = null;
  for (const section of sections) {
    const marker = markerOf(section.title);
    if (marker) current = marker;
    if (current === 'sponsor' || current === 'social') continue;

    let body = section.body;
    if (marker === 'brief') {
      // The brief is its bullets; what follows them is the Academy promotion.
      body = body.split('\n').filter((line) => line.startsWith('* ')).join('\n');
    }
    body = body
      .split('\n')
      .filter((line) => !PERSONAL_LINK_RE.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    out.push(`** ${section.title}`, '-'.repeat(60), '', ...(body ? [body, ''] : []), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function parseIssueLine(preamble: string): { issue: number | null; date: string | null } {
  const match = preamble.match(ISSUE_RE);
  if (!match) return { issue: null, date: null };
  const [, issue, dd, mm, yyyy] = match;
  return { issue: Number(issue), date: `${yyyy}-${mm}-${dd}` };
}

function parseReadings(body: string): TheBullReading[] {
  // «* Title (Source (https://…) )» — the source's name wraps its own link.
  const re = /^\* (.+?) \((.+?) \((https?:\/\/[^\s)]+)\)\s*\)\s*$/;
  return body
    .split('\n')
    .map((line) => line.trim().match(re))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(([, title, source, url]) => ({ title: title.trim(), source: source.trim(), url }));
}

function parseEpisode(section: TheBullSection): TheBullEpisode {
  const lines = section.body.split('\n').map((line) => line.trim());
  const url = lines.find((line) => /^https?:\/\//.test(line)) ?? '';
  const summary = lines
    .filter((line) => line && line !== url && !/^Ascolta l.episodio/i.test(line))
    .join(' ');
  return { title: section.title, url, summary };
}

const PERCENT_CELL_RE = /[+-]?\d[\d.,]*%/g;

export function parseIndexTable(body: string): TheBullIndexTable | null {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  // The header names the horizons («1 mese    1 anno …»): the first line with no percentage.
  const headerIndex = lines.findIndex((line) => !line.includes('%') && /\s{2,}/.test(line));
  if (headerIndex === -1) return null;
  const horizons = lines[headerIndex].split(/\s{2,}/).map((h) => h.trim()).filter(Boolean);
  const rows: TheBullIndexRow[] = [];
  let caption = '';
  for (const line of lines.slice(headerIndex + 1)) {
    const values = line.match(PERCENT_CELL_RE) ?? [];
    const first = values[0];
    if (first !== undefined && values.length === horizons.length) {
      const name = line.slice(0, line.indexOf(first)).trim();
      rows.push({ name, values });
    } else if (/^Variazioni/i.test(line)) {
      caption = line;
    }
  }
  return rows.length > 0 ? { horizons, rows, caption } : null;
}

/**
 * The newsletter, structured. When the template's «Il punto della settimana» marker is missing
 * (an older issue?), the sections that belong to no known marker are taken as the point: prose
 * the model can still read, rather than a week lost.
 */
export function parseTheBull(text: string): TheBullIssue {
  const { preamble, sections } = splitSections(stripFrontmatter(text));
  const { head, groups, markerBodies } = groupSections(sections);
  const { issue, date } = parseIssueLine(preamble);

  const brief = (markerBodies.get('brief') ?? '')
    .split('\n')
    .filter((line) => line.startsWith('* '))
    .map((line) => line.slice(2).replace(/\s*\(#[^)]*\)\s*/g, ' ').replace(/\s+:/g, ':').trim());

  const point = groups.get('point') ?? groups.get('unknown') ?? [];
  const indicesBody = markerBodies.get('indices');
  const nextEpisode = (markerBodies.get('next') ?? '')
    .split('\n')
    .filter((line) => line.trim() && !PERSONAL_LINK_RE.test(line) && !/^https?:\/\//.test(line.trim()))
    .join(' ')
    .trim();

  return {
    issue,
    date,
    headline: head?.title ?? '',
    subtitle: head?.body ?? '',
    brief,
    point,
    readings: parseReadings(markerBodies.get('readings') ?? ''),
    episodes: (groups.get('episodes') ?? []).map(parseEpisode),
    indices: indicesBody ? parseIndexTable(indicesBody) : null,
    nextEpisode,
  };
}

/**
 * Whether the text is a newsletter issue at all: it has the `#n - date` line or a point to read.
 * The same sender also mails the subscription confirmation and the like — those are not weeks.
 */
export function isTheBullIssue(issue: TheBullIssue): boolean {
  return issue.issue !== null || issue.point.length > 0;
}

/** «Il punto della settimana» as the model reads it: each sub-section's title, then its prose. */
export function pointText(issue: TheBullIssue): string {
  return issue.point.map((section) => `## ${section.title}\n\n${section.body}`).join('\n\n');
}

/** ISO 8601 week of a `YYYY-MM-DD` date: `2026-W39`. A Sunday closes its week. */
export function isoWeekOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
