import 'server-only';

import { createVaultClient, readVaultConfig, type VaultClient } from '@/lib/server/wiki/githubVault';
import {
  MACRO_DEPTH,
  PRINCIPLES_DIGEST_PATH,
  cleanPrinciplesDigest,
  emailWikiMonths,
  macroMonthPath,
  prepareMacroMonthPage,
  type EmailWikiContext,
  type EmailWikiMonth,
} from '@/lib/utils/emailWiki';
import type { EmailPeriodicPeriodType } from '@/lib/server/assistant/prompts';

/**
 * Reads the vault pages a periodic email's prompt carries (F5, doc/ai-open-models-wiki.md § 5.4):
 * the window's month pages and the Principles digest, by date, in parallel.
 *
 * Never throws: a missing page and a failed read are the same absence for the email — the page is
 * left out and named as such (lib/utils/emailWiki.ts). No cache and no ETag (owner's call,
 * 2026-10-05): an email reads 2 to 13 files against GitHub's 5.000 requests an hour, and a Vercel
 * function keeps nothing in memory from one cron run to the next.
 */
export async function readEmailWiki(
  client: VaultClient,
  window: { periodType: EmailPeriodicPeriodType; year: number; startMonth: number; endMonth: number }
): Promise<EmailWikiContext> {
  const depth = MACRO_DEPTH[window.periodType];
  const months = emailWikiMonths(window.year, window.startMonth, window.endMonth);

  const read = async (path: string): Promise<string | null> => {
    try {
      return await client.readFile(path);
    } catch (error) {
      console.error(`[emailWiki] ${error instanceof Error ? error.message : 'read failed'}`);
      return null;
    }
  };

  const [digest, ...pages] = await Promise.all([read(PRINCIPLES_DIGEST_PATH), ...months.map((month) => read(macroMonthPath(month)))]);

  const found: EmailWikiMonth[] = [];
  const missingMonths: string[] = [];
  months.forEach((month, index) => {
    const text = pages[index];
    const page = text ? prepareMacroMonthPage(text, depth) : '';
    if (page) found.push({ month, page });
    else missingMonths.push(month);
  });

  return { principles: digest ? cleanPrinciplesDigest(digest) : null, months: found, missingMonths, depth };
}

/**
 * The Wiki for `userId`'s email, or null when it does not apply: the vault is one person's
 * (`WIKI_EXPORT_UID`, the same owner as the `dati/` export — owner's call, 2026-10-05: the digest
 * is personal), and without the vault's settings the feature is off. Reuses `WIKI_GITHUB_TOKEN`
 * (owner's call: a read-only token beside the write one in the same runtime would protect nothing).
 */
export async function loadEmailWiki(
  userId: string,
  window: { periodType: EmailPeriodicPeriodType; year: number; startMonth: number; endMonth: number },
  env: Record<string, string | undefined> = process.env,
  makeClient: typeof createVaultClient = createVaultClient
): Promise<EmailWikiContext | null> {
  if (!env.WIKI_EXPORT_UID || env.WIKI_EXPORT_UID !== userId) return null;
  const config = readVaultConfig(env);
  if (!config) return null;
  return readEmailWiki(makeClient(config), window);
}
