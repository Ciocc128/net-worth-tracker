/**
 * TheBull's compilation by hand (doc/ai-open-models-wiki.md § 5.2).
 *
 *   npm run wiki:compile -- 2026-09-27              # recompiles raw/thebull/2026-09-27.md in the vault
 *   npm run wiki:compile -- --dry-run <plain.txt>   # compiles a local newsletter, prints, writes NOTHING
 *
 * The first reads and commits through the vault (`WIKI_GITHUB_TOKEN`, `WIKI_GITHUB_REPO`) and ends
 * in `ok` or `failed`, whatever the log said before. The second needs only `OPENROUTER_API_KEY`:
 * it is how a new template, or a new model, is tried before the Sunday run. Keys from `.env.local`.
 */
import { readFileSync } from 'node:fs';
import { createVaultClient, readVaultConfig } from '@/lib/server/wiki/githubVault';
import { compileIssue, recompileTheBull } from '@/lib/server/wiki/thebullCompiler';
import { cleanTheBullText, isoWeekOf, parseTheBull } from '@/lib/utils/thebullParse';
import { renderWeekPage } from '@/lib/utils/wikiMacro';

const args = process.argv.slice(2);

if (args[0] === '--dry-run') {
  const file = args[1];
  if (!file) throw new Error('usage: wiki:compile -- --dry-run <plain.txt>');
  const issue = parseTheBull(cleanTheBullText(readFileSync(file, 'utf8')));
  if (!issue.date) throw new Error('no «#<n> - DD/MM/YYYY» line: cannot date the issue');
  console.error(`[wiki] n. ${issue.issue} del ${issue.date} (${isoWeekOf(issue.date)}), ${issue.point.length} paragrafi nel punto`);
  const result = await compileIssue(issue, issue.date, new Date().toISOString());
  if (!result.ok) {
    console.error(`[wiki] compilation failed: ${result.reason}`);
    process.exit(1);
  }
  const { extraction, dropped } = result.record;
  console.error(`[wiki] fatti ${extraction.fatti.length} · tesi ${extraction.tesi.length} · spunti ${extraction.spunti.length} · scartate ${dropped.length}`);
  process.stdout.write(renderWeekPage(result.record));
} else {
  const date = args[0];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('usage: wiki:compile -- <YYYY-MM-DD> | --dry-run <plain.txt>');
  const config = readVaultConfig();
  if (!config) throw new Error('WIKI_GITHUB_TOKEN and WIKI_GITHUB_REPO are required');
  const result = await recompileTheBull(date, 'manual', { vault: createVaultClient(config) });
  console.info(result.ok ? `[wiki] thebull/${date} compiled` : `[wiki] thebull/${date} failed: ${result.reason}`);
  if (!result.ok) process.exit(1);
}
