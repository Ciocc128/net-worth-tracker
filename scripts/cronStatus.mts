/**
 * What the three evening crons did in the last days (doc/cron-serale/README.md § 5.7, D-CS3), read from
 * the Mac: `cron-runs` of the last 8 days, every job, every phase, every user. READ ONLY.
 *
 *   npm run cron:status                 # production (the service account of .env.local), last 8 days
 *   npm run cron:status -- --days 3
 *   npm run cron:status:emulator        # the emulators
 *
 * Exit code 1 when the latest run of any job is not `ok` — usable in a shell prompt or a launchd check.
 */
import { backupAdminApp } from './lib/backup/adminApp';

const USAGE = 'usage: npm run cron:status [-- --days <n>]';

function parseDays(argv: string[]): number {
  const index = argv.indexOf('--days');
  if (index === -1) return 8;
  const days = Number(argv[index + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error(`--days needs a whole number from 1 to 90\n${USAGE}`);
  return days;
}

const italyIso = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(date);

async function main() {
  const days = parseDays(process.argv.slice(2));
  const target = await backupAdminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(target.app);

  const since = italyIso(new Date(Date.now() - days * 86_400_000));
  const snapshot = await db.collection('cron-runs').where('date', '>=', since).get();
  const runs = snapshot.docs.map((doc) => doc.data()).sort((a, b) => `${a.date}${a.job}`.localeCompare(`${b.date}${b.job}`));
  if (runs.length === 0) {
    console.info(`nessuna esecuzione dal ${since}`);
    process.exitCode = 1;
    return;
  }

  const latest = new Map<string, Record<string, unknown>>();
  for (const run of runs) {
    console.info(`\n${run.date} · ${String(run.job).padEnd(9)} ${String(run.outcome).toUpperCase()} · ${run.durationMs} ms · invocazioni ${run.invocations}`);
    for (const phase of (run.phases ?? []) as Array<{ name: string; status: string; durationMs: number; counts?: unknown; error?: string }>) {
      const counts = phase.counts ? ` ${JSON.stringify(phase.counts)}` : '';
      console.info(`    ${phase.status === 'failed' ? '✗' : phase.status === 'skipped' ? '–' : '✓'} ${phase.name.padEnd(16)} ${String(phase.durationMs).padStart(6)} ms${counts}${phase.error ? `  ← ${phase.error}` : ''}`);
    }
    for (const [uid, user] of Object.entries((run.users ?? {}) as Record<string, { snapshot?: string; deliveries?: Record<string, { outcome: string; reason?: string }> }>)) {
      const parts = [
        ...(user.snapshot ? [`snapshot ${user.snapshot}`] : []),
        ...Object.entries(user.deliveries ?? {}).map(([key, d]) => `${key} ${d.outcome}${d.reason ? ` (${d.reason})` : ''}`),
      ];
      console.info(`    · ${uid}: ${parts.join(' · ')}`);
    }
    latest.set(String(run.job), run);
  }

  const notOk = [...latest.values()].filter((run) => run.outcome !== 'ok');
  console.info(`\n${notOk.length === 0 ? '✓ l’ultima esecuzione di ogni lavoro è ok' : `✗ da guardare: ${notOk.map((run) => `${run.job} ${run.date}`).join(', ')}`}`);
  if (notOk.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
