/**
 * The migration of the monthly expense totals (doc/totali-mensili/README.md § 7.2): rebuilds the
 * `expense-totals` year documents of one account, or of every Auth account, from its rows.
 *
 *   npm run expense-totals:build -- --email <email> [--dry-run]
 *   npm run expense-totals:build -- --uid <uid> [--dry-run]
 *   npm run expense-totals:build -- --all [--dry-run]
 *   npm run expense-totals:build:emulator -- …          # the same against the emulators
 *
 * Against PRODUCTION by default (the service account of `.env.local`, like `users:allow`): a write
 * asks for the project id typed (F11 S1), `--dry-run` only reads and writes nothing. The app does
 * not need it — a year without its document is read live (lazy migration, § 7.1) — it makes the
 * first visit fast and prints, per year, the rows' count and sum against the document already there.
 * Same code as the app and the seeds: `rebuildAllExpenseTotalsIn`.
 */
import { backupAdminApp } from './lib/backup/adminApp';
import { confirmProductionWrite } from './lib/confirmProduction';
import { rebuildAllExpenseTotalsIn, type RebuildAllYear } from '../lib/server/expenseTotalsRebuildAll';

const USAGE = 'usage: npm run expense-totals:build -- (--email <email> | --uid <uid> | --all) [--dry-run]';

function parseArgs(argv: string[]): { email?: string; uid?: string; all: boolean; dryRun: boolean } {
  const out: { email?: string; uid?: string; all: boolean; dryRun: boolean } = { all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') out.all = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--email') out.email = argv[++i]?.trim().toLowerCase();
    else if (arg === '--uid') out.uid = argv[++i]?.trim();
    else throw new Error(USAGE);
  }
  const picked = [out.all, Boolean(out.email), Boolean(out.uid)].filter(Boolean).length;
  if (picked !== 1) throw new Error(USAGE);
  return out;
}

const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function describeYear(y: RebuildAllYear): string {
  const now = `${String(y.after.rowCount).padStart(6)} righe · ${euro(y.after.amountSum).padStart(14)} € · ${String(y.monthsWithRows).padStart(2)} mesi`;
  if (!y.before) return `  ${y.year}  ${now}  (nessun documento)`;
  const same = y.before.rowCount === y.after.rowCount && Math.abs(y.before.amountSum - y.after.amountSum) <= 0.005;
  return `  ${y.year}  ${now}  ${same ? 'uguale al documento' : `documento: ${y.before.rowCount} righe · ${euro(y.before.amountSum)} €`}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = await backupAdminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const db = getFirestore(target.app);
  const auth = getAuth(target.app);

  let accounts: { uid: string; email?: string }[];
  if (args.all) {
    accounts = [];
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      accounts.push(...page.users.map((u) => ({ uid: u.uid, email: u.email })));
      pageToken = page.pageToken;
    } while (pageToken);
  } else if (args.email) {
    const user = await auth.getUserByEmail(args.email);
    accounts = [{ uid: user.uid, email: user.email }];
  } else {
    accounts = [{ uid: args.uid! }];
  }

  if (!args.dryRun && target.source === 'production') {
    await confirmProductionWrite(target.projectId, `expense-totals:build (${accounts.length} account)`);
  }

  const now = new Date();
  for (const account of accounts) {
    const result = await rebuildAllExpenseTotalsIn(db, account.uid, now, { dryRun: args.dryRun });
    console.info(`\n${account.email ?? account.uid} — ${result.rowsRead} righe lette`);
    for (const y of result.perYear) console.info(describeYear(y));
    if (result.deletedYears.length > 0) console.info(`  anni senza righe ${args.dryRun ? 'da togliere' : 'tolti'}: ${result.deletedYears.join(', ')}`);
  }
  console.info(args.dryRun ? '\n(prova: niente è stato scritto)' : `\n✓ totali scritti in ${target.source === 'production' ? 'PRODUZIONE' : 'emulatore'}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
