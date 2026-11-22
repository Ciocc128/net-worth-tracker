/**
 * The BACKUP of the database, run from the owner's Mac (doc/backup/README.md, D1 of the security
 * review, F03). Firebase Spark has no point-in-time recovery and no scheduled backups: this file is
 * the only «yesterday» the data has.
 *
 *   npm run backup:export                      # whole database (production, read-only) → one dated JSON
 *   npm run backup:export -- --uid <uid>       # ONE account: a backup of it, or its moving package
 *   npm run backup:export -- --email <email>   # the same, by the Auth email
 *   npm run backup:export -- --with-caches     # also the recomputable caches (skipped by default)
 *   npm run backup:export -- --out <dir>       # another folder than BACKUP_DIR
 *   npm run backup:export:emulator -- …        # the same against the emulators (tests, the cloud)
 *
 * Production by default, with the service account of `.env.local`; only `.get()` and Auth reads.
 * The file goes to `BACKUP_DIR` (`.env.local`) or `~/Documents/net-worth-tracker-backup`, never into
 * the repository; the folder is 700 and the file 600. After writing, the file is read back and its
 * documents re-counted; then the old FULL backups beyond the retention are deleted
 * (`selectBackupsToPrune`: the last 8 plus the first of each month). Single-account exports are
 * never deleted.
 */
import { chmod, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { backupAdminApp } from './lib/backup/adminApp';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  assertBackupFile,
  backupFileName,
  selectBackupsToPrune,
  type BackupFile,
  type BackupScope,
} from './lib/backup/backupFile';
import { adminFirestoreKinds } from './lib/backup/firestoreKinds';
import { readAuthUsers, readOneAccount, readWholeDatabase } from './lib/backup/reader';
import { countByCollection } from './lib/backup/registry';

const USAGE = 'usage: npm run backup:export [-- --uid <uid> | --email <email>] [--with-caches] [--out <dir>]';

const DEFAULT_BACKUP_DIR = path.join(homedir(), 'Documents', 'net-worth-tracker-backup');

function parseArgs(argv: string[]) {
  const options: { uid?: string; email?: string; withCaches: boolean; out?: string } = { withCaches: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${arg} needs a value\n${USAGE}`);
      return v;
    };
    if (arg === '--uid') options.uid = value();
    else if (arg === '--email') options.email = value().trim().toLowerCase();
    else if (arg === '--with-caches') options.withCaches = true;
    else if (arg === '--out') options.out = value();
    else throw new Error(`unknown argument ${arg}\n${USAGE}`);
  }
  if (options.uid && options.email) throw new Error(`--uid and --email are alternatives\n${USAGE}`);
  return options;
}

function expandHome(dir: string): string {
  return dir === '~' || dir.startsWith('~/') ? path.join(homedir(), dir.slice(1)) : dir;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = await backupAdminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const db = getFirestore(target.app);
  const auth = getAuth(target.app);
  const kinds = adminFirestoreKinds(db);

  let scope: BackupScope = { kind: 'all' };
  if (options.uid || options.email) {
    const user = options.uid ? await auth.getUser(options.uid) : await auth.getUserByEmail(options.email!);
    scope = { kind: 'user', uid: user.uid, email: user.email ?? null };
    console.info(`account: ${user.email ?? '(senza email)'} (${user.uid})`);
  }

  const startedAt = new Date();
  const read = scope.kind === 'all'
    ? await readWholeDatabase(db, kinds, options.withCaches)
    : await readOneAccount(db, kinds, scope.uid, options.withCaches);
  const authUsers = await readAuthUsers(auth, scope.kind === 'user' ? scope.uid : undefined);

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    createdAt: startedAt.toISOString(),
    projectId: target.projectId,
    source: target.source,
    scope,
    withCaches: options.withCaches,
    counts: countByCollection(read.documents.map((d) => d.path)),
    unknownCollections: read.unknownCollections,
    auth: authUsers,
    documents: read.documents,
  };

  // Outside the repository, private to the Mac's user, written whole or not at all.
  const dir = path.resolve(expandHome(options.out ?? process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR));
  if (dir === process.cwd() || dir.startsWith(process.cwd() + path.sep)) {
    throw new Error(`the backup folder ${dir} is inside the repository: pick one outside (BACKUP_DIR or --out).`);
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const finalPath = path.join(dir, backupFileName(target.projectId, scope, startedAt));
  const tmpPath = `${finalPath}.partial`;
  await writeFile(tmpPath, JSON.stringify(file), { mode: 0o600 });

  // Read it back before trusting it: same documents, same counts.
  const reread: unknown = JSON.parse(await readFile(tmpPath, 'utf8'));
  assertBackupFile(reread);
  const recount = countByCollection(reread.documents.map((d) => d.path));
  if (JSON.stringify(recount) !== JSON.stringify(file.counts)) throw new Error('the written file does not re-count as the read: kept as .partial, not trusted.');
  await rename(tmpPath, finalPath);

  console.info('');
  for (const [key, n] of Object.entries(file.counts)) console.info(`  ${key.padEnd(36)} ${n}`);
  console.info(`  ${'utenti Authentication'.padEnd(36)} ${authUsers.length}`);
  if (file.unknownCollections.length > 0) {
    console.warn(`⚠ collezioni non nel registro (copiate comunque): ${file.unknownCollections.join(', ')} — aggiungile a scripts/lib/backup/registry.ts`);
  }
  console.info(`\n✓ ${read.documents.length} documenti, circa ${read.reads} letture → ${finalPath}`);

  if (scope.kind === 'all') {
    const toDelete = selectBackupsToPrune(await readdir(dir), target.projectId);
    for (const name of toDelete) await unlink(path.join(dir, name));
    if (toDelete.length > 0) console.info(`  cancellate ${toDelete.length} copie vecchie (tengo le ultime 8 e la prima di ogni mese)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
