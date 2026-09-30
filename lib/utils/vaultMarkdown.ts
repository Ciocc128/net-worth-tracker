/**
 * The app's numbers as the vault's `dati/` files (doc/ai-open-models-wiki.md § 6.1): pure
 * rendering, no reads. The text of a month is the email's own data block
 * (`buildEmailDataSections`), so the vault, the email and the email's model read ONE version
 * of a month; this module only turns its `--- TITLE ---` markers into headings and puts a
 * frontmatter on top that says when the file was generated and from what.
 */

import { MONTH_NAMES } from '@/lib/constants/months';
import { formatCurrency, formatNumberIt } from '@/lib/utils/formatters';

export const PORTFOLIO_PATH = 'dati/portafoglio.md';

/** `2026-09` → `dati/2026-09.md`. */
export const monthDataPath = (month: string) => `dati/${month}.md`;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1].toLowerCase()} ${year}`;
}

const SECTION_MARKER = /^---\s+(.+?)\s+---$/;
/** The bundle's own title line (`=== DATI FINANZIARI: … ===`): the file's `#` title says it already. */
const TITLE_MARKER = /^===\s+.+\s+===$/;

/** Kept upper case when a heading is lowered. */
const ACRONYMS = new Set(['TWR', 'PAC', 'ETF', 'YOY', 'FIRE', 'TER']);

/**
 * `ALLOCAZIONE vs TARGET (come la pagina Allocazione)` → `Allocazione vs target (come la pagina
 * Allocazione)`: the upper-case words before the parenthesis are lowered (acronyms kept), the
 * parenthesis stays as written, and the first letter is raised.
 */
export function headingText(marker: string): string {
  const open = marker.indexOf('(');
  const head = open === -1 ? marker : marker.slice(0, open);
  const tail = open === -1 ? '' : marker.slice(open);
  const lowered = head.replace(/\p{Lu}[\p{Lu}']*/gu, (word) => (ACRONYMS.has(word.toUpperCase()) ? word : word.toLowerCase()));
  const text = `${lowered}${tail}`.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The prompt's lines as markdown: `--- ALLOCAZIONE vs TARGET (…) ---` becomes a `##` heading in
 * sentence case, everything else stays as written (Obsidian renders single newlines as breaks),
 * and runs of blank lines collapse to one.
 */
export function promptLinesToMarkdown(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines.join('\n').split('\n')) {
    if (TITLE_MARKER.test(line.trim())) continue;
    const marker = SECTION_MARKER.exec(line.trim());
    if (marker) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(`## ${headingText(marker[1])}`, '');
      continue;
    }
    if (line.trim() === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line.trimEnd());
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function frontmatter(fields: Record<string, string | boolean>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${typeof value === 'boolean' ? value : JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** The stamp every file opens with: how old it is is the first thing a reader needs. */
function generatedLine(generatedAt: string): string {
  return `_Generato dall'app il ${generatedAt.slice(0, 10)} alle ${generatedAt.slice(11, 16)} UTC. Non modificare a mano: il prossimo export lo riscrive._`;
}

export interface MonthDataFileInput {
  year: number;
  month: number;
  generatedAt: string;
  /** The month is still running: its cashflow and snapshot are not final. */
  partial: boolean;
  /** `buildEmailDataSections` for the month. */
  sections: string[];
}

export function renderMonthDataFile({ year, month, generatedAt, partial, sections }: MonthDataFileInput): string {
  const head = frontmatter({
    tipo: 'dati',
    mese: monthKey(year, month),
    generato: generatedAt,
    parziale: partial,
    fonte: "net-worth-tracker, gli stessi dati dell'email mensile",
  });
  return [
    head,
    `# Dati di ${monthLabel(year, month)}`,
    '',
    generatedLine(generatedAt),
    ...(partial ? ['', '**Mese in corso:** cashflow e snapshot non sono ancora definitivi.'] : []),
    '',
    promptLinesToMarkdown(sections),
    '',
  ].join('\n');
}

export interface PortfolioHolding {
  name: string;
  /** The display ticker (`getAssetDisplayTicker`), or the raw one for an asset no longer on file. */
  ticker: string;
  /**
   * As the Strumenti chip names it, every leg with its share for a composite («Azioni 60%,
   * Obbligazioni 40%»: `describeAssetClassChip`); null for a snapshot row whose asset is gone.
   */
  classLabel: string | null;
  subCategory: string | null;
  quantity: number;
  price: number;
  value: number;
}

export interface PortfolioFileInput {
  year: number;
  month: number;
  generatedAt: string;
  holdings: PortfolioHolding[];
  /** The composition and allocation sections of the snapshot's month, from the email's data. */
  sections: string[];
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** Every instrument with a value, largest first; the empty ones (closed accounts) are counted, not listed. */
function holdingsTable(all: PortfolioHolding[]): string {
  const holdings = all.filter((h) => h.value !== 0);
  const empty = all.length - holdings.length;
  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  const rows = [...holdings]
    .sort((a, b) => b.value - a.value)
    .map((h) => {
      const share = total > 0 ? `${formatNumberIt((h.value / total) * 100, 1)} %` : '—';
      return `| ${escapeCell(h.name)} | ${escapeCell(h.ticker)} | ${h.classLabel ?? 'non più in archivio'} | ${escapeCell(h.subCategory ?? '—')} | ${formatNumberIt(h.quantity, 4)} | ${formatCurrency(h.price)} | ${formatCurrency(h.value)} | ${share} |`;
    });
  return [
    '| Strumento | Ticker | Classe | Sottocategoria | Quantità | Prezzo | Valore | Peso |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...rows,
    `| **Totale** | | | | | | **${formatCurrency(total)}** | |`,
    ...(empty > 0 ? ['', `Più ${empty} strument${empty === 1 ? 'o' : 'i'} a zero (conti chiusi o svuotati), non elencat${empty === 1 ? 'o' : 'i'}.`] : []),
  ].join('\n');
}

/**
 * The latest snapshot: every instrument with its value, then the email's composition and
 * allocation blocks for that month. The snapshot is the daily cron's, so «latest» is the last
 * evening it ran.
 */
export function renderPortfolioFile({ year, month, generatedAt, holdings, sections }: PortfolioFileInput): string {
  return [
    frontmatter({ tipo: 'dati', snapshot: monthKey(year, month), generato: generatedAt, fonte: "net-worth-tracker, lo snapshot dell'app" }),
    '# Portafoglio',
    '',
    generatedLine(generatedAt),
    '',
    `Snapshot di ${monthLabel(year, month)}: l'app lo riscrive ogni sera fino alla fine del mese, poi resta fermo.`,
    '',
    '## Strumenti',
    '',
    holdings.length > 0 ? holdingsTable(holdings) : 'Lo snapshot non ha il dettaglio per strumento.',
    '',
    promptLinesToMarkdown(sections),
    '',
  ].join('\n');
}

/** `dati/2026-01…2026-09` for the log and the commit message. */
export function exportSubject(months: string[]): string {
  if (months.length === 0) return 'dati/portafoglio';
  return months.length === 1 ? `dati/${months[0]}` : `dati/${months[0]}…${months[months.length - 1]}`;
}
