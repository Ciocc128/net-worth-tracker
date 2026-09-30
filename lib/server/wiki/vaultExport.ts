import 'server-only';

/**
 * The app's numbers → the vault's `dati/` (doc/ai-open-models-wiki.md § 6.1): one file per month
 * and `dati/portafoglio.md`, with ONE commit and one line in `log.md`. No model: these are the
 * app's numbers, the same block the monthly email's model reads (`buildEmailDataSections`).
 *
 * Two callers: the daily cron on the last day of the month (the month just closing), and
 * `npm run vault:export` for any run of months. The owner whose data goes to the vault is
 * `WIKI_EXPORT_UID`: the vault is one person's, never the demo's nor every user's.
 */

import { buildAssistantPeriodRangeContext } from '@/lib/services/assistantMonthContextService';
import { getUserAssetsAdmin, getUserSnapshotsAdmin } from '@/lib/server/assetAdminRepository';
import { buildPeriodComparison } from '@/lib/server/emailPeriodComparison';
import {
  buildEmailDataSections,
  buildEmailPortfolioSections,
  buildPeriodEmailData,
  isLastDayOfMonthItaly,
  resolveEmailPeriodRange,
  type MonthlyEmailData,
} from '@/lib/server/monthlyEmailService';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { describeAssetClassChip } from '@/lib/utils/assetDisplayClass';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import {
  PORTFOLIO_PATH,
  exportSubject,
  monthDataPath,
  monthKey,
  renderMonthDataFile,
  renderPortfolioFile,
  type PortfolioHolding,
} from '@/lib/utils/vaultMarkdown';
import { appendLogLines, formatLogLine } from '@/lib/utils/wikiMacro';
import type { VaultClient, VaultFile } from './githubVault';

const LOG_PATH = 'log.md';

export interface YearMonth {
  year: number;
  month: number;
}

export interface MonthExport {
  /** `buildEmailDataSections` for the month. */
  sections: string[];
  /** `buildEmailPortfolioSections` for the month. */
  portfolioSections: string[];
}

export interface PortfolioSnapshot extends YearMonth {
  holdings: PortfolioHolding[];
}

export interface VaultExportDeps {
  vault: VaultClient;
  /** The month's data as the email builds it; null when the month has no snapshot. */
  loadMonth?: (userId: string, at: YearMonth) => Promise<MonthExport | null>;
  /** The latest real snapshot, per instrument; null when there is none. */
  loadLatestSnapshot?: (userId: string) => Promise<PortfolioSnapshot | null>;
  now?: () => Date;
}

/** The email's own pipeline for one month: data, comparison, the assistant bundle on its window. */
async function defaultLoadMonth(userId: string, { year, month }: YearMonth): Promise<MonthExport | null> {
  const emailData: MonthlyEmailData | null = await buildPeriodEmailData(userId, year, month, 'monthly');
  if (!emailData) return null;
  const [comparison, bundle] = await Promise.all([
    buildPeriodComparison(userId, emailData),
    buildAssistantPeriodRangeContext(userId, resolveEmailPeriodRange(emailData)),
  ]);
  return {
    sections: buildEmailDataSections(emailData, comparison, bundle),
    portfolioSections: buildEmailPortfolioSections(emailData),
  };
}

async function defaultLoadLatestSnapshot(userId: string): Promise<PortfolioSnapshot | null> {
  const [snapshots, assets] = await Promise.all([getUserSnapshotsAdmin(userId), getUserAssetsAdmin(userId)]);
  const real = snapshots.filter((s) => !s.isDummy);
  if (real.length === 0) return null;
  const latest = real.reduce((a, b) => (b.year * 12 + b.month > a.year * 12 + a.month ? b : a));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const holdings: PortfolioHolding[] = (latest.byAsset ?? []).map((row) => {
    const asset = byId.get(row.assetId);
    const chip = asset ? describeAssetClassChip(asset) : null;
    return {
      name: row.name,
      ticker: asset ? getAssetDisplayTicker(asset) : row.ticker,
      classLabel: chip ? (chip.accessibleName ?? chip.label) : null,
      subCategory: asset?.subCategory ?? null,
      quantity: row.quantity,
      price: row.price,
      value: row.totalValue,
    };
  });
  return { year: latest.year, month: latest.month, holdings };
}

export interface VaultExportOutcome {
  /** `YYYY-MM` of every month file written. */
  written: string[];
  /** Months asked for that have no snapshot: nothing to write, said in the log. */
  skipped: string[];
  portfolio: boolean;
  sha: string | null;
}

/**
 * Writes `dati/<month>.md` for each month (in order) and rewrites `dati/portafoglio.md`, in one
 * commit. A month without a snapshot is skipped and named in the log line, never written empty.
 */
export async function exportToVault(
  userId: string,
  months: YearMonth[],
  { vault, loadMonth = defaultLoadMonth, loadLatestSnapshot = defaultLoadLatestSnapshot, now = () => new Date() }: VaultExportDeps
): Promise<VaultExportOutcome> {
  const at = now();
  const generatedAt = at.toISOString();
  const current = getItalyMonthYear(at);
  const files: VaultFile[] = [];
  const written: string[] = [];
  const skipped: string[] = [];
  const loaded = new Map<string, MonthExport>();

  for (const ym of months) {
    const key = monthKey(ym.year, ym.month);
    const data = await loadMonth(userId, ym);
    if (!data) {
      skipped.push(key);
      continue;
    }
    loaded.set(key, data);
    // The month in course, unless this is its last evening: the monthly email's own rule.
    const partial = ym.year === current.year && ym.month === current.month && !isLastDayOfMonthItaly(at);
    files.push({ path: monthDataPath(key), content: renderMonthDataFile({ ...ym, generatedAt, partial, sections: data.sections }) });
    written.push(key);
  }

  const latest = await loadLatestSnapshot(userId);
  if (latest) {
    const key = monthKey(latest.year, latest.month);
    const data = loaded.get(key) ?? (await loadMonth(userId, latest));
    files.push({
      path: PORTFOLIO_PATH,
      content: renderPortfolioFile({ ...latest, generatedAt, sections: data?.portfolioSections ?? [] }),
    });
  }

  if (files.length === 0) return { written, skipped, portfolio: false, sha: null };

  const subject = exportSubject(written);
  const outcome = skipped.length > 0 ? `ok · senza snapshot: ${skipped.join(', ')}` : 'ok';
  const commit = await vault.commit(`export: ${subject}`, async () => [
    ...files,
    { path: LOG_PATH, content: appendLogLines((await vault.readFile(LOG_PATH)) ?? '# Log\n\n', [formatLogLine(generatedAt, 'export', subject, outcome)]) },
  ]);
  return { written, skipped, portfolio: latest !== null, sha: commit?.sha ?? null };
}

/** Every month from `from` to `to`, both included. */
export function monthsBetween(from: YearMonth, to: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  for (let i = from.year * 12 + from.month - 1; i <= to.year * 12 + to.month - 1; i++) {
    out.push({ year: Math.floor(i / 12), month: (i % 12) + 1 });
  }
  return out;
}
