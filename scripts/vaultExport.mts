/**
 * The app's numbers → the vault's `dati/` by hand (doc/ai-open-models-wiki.md § 6.1).
 *
 *   npm run vault:export                          # the current month + dati/portafoglio.md
 *   npm run vault:export -- 2026-09               # one month
 *   npm run vault:export -- 2026-01 2026-09       # a run of months, one commit
 *   npm run vault:export -- --dry-run 2026-08     # prints the files, writes NOTHING
 *
 * Reads PRODUCTION with the Admin credentials of `.env.local` and writes the vault through
 * `WIKI_GITHUB_TOKEN` / `WIKI_GITHUB_REPO`. Whose data: `WIKI_EXPORT_UID`, or `--email <address>`.
 */
import { adminAuth } from '@/lib/firebase/admin';
import { createVaultClient, readVaultConfig, type VaultClient, type VaultFile } from '@/lib/server/wiki/githubVault';
import { exportToVault, monthsBetween, type YearMonth } from '@/lib/server/wiki/vaultExport';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const emailAt = args.indexOf('--email');
const email = emailAt === -1 ? undefined : args[emailAt + 1];
const positional = args.filter((a, i) => !a.startsWith('--') && (emailAt === -1 || i !== emailAt + 1));

function parseMonth(text: string): YearMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error(`not a month: ${text} (expected YYYY-MM)`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

const today = getItalyMonthYear(new Date());
const from = positional[0] ? parseMonth(positional[0]) : today;
const to = positional[1] ? parseMonth(positional[1]) : from;
const months = monthsBetween(from, to);
if (months.length === 0) throw new Error('the range is empty: the first month comes after the last');

const uid = email ? (await adminAuth.getUserByEmail(email)).uid : process.env.WIKI_EXPORT_UID;
if (!uid) throw new Error('WIKI_EXPORT_UID is not set: pass --email <address>');

// The dry run commits into memory and prints what it would have written.
function printingVault(): VaultClient {
  return {
    readFile: async () => null,
    listDir: async () => [],
    commit: async (message, build) => {
      const files: VaultFile[] = await build();
      console.info(`[vault] would commit «${message}»`);
      for (const file of files) process.stdout.write(`\n===== ${file.path} =====\n${file.content}`);
      return null;
    },
  };
}

let vault: VaultClient;
if (dryRun) vault = printingVault();
else {
  const config = readVaultConfig();
  if (!config) throw new Error('WIKI_GITHUB_TOKEN and WIKI_GITHUB_REPO are required (or --dry-run)');
  vault = createVaultClient(config);
}

const outcome = await exportToVault(uid, months, { vault });
console.info(
  `[vault] written ${outcome.written.length} month(s)${outcome.written.length ? `: ${outcome.written.join(', ')}` : ''}` +
    (outcome.skipped.length ? ` · no snapshot: ${outcome.skipped.join(', ')}` : '') +
    ` · portafoglio ${outcome.portfolio ? 'yes' : 'no'}` +
    (outcome.sha ? ` · commit ${outcome.sha.slice(0, 8)}` : '')
);
process.exit(0);
