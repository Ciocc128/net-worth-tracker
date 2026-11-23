/**
 * The RESTORE of a backup made by `backup:export` (doc/backup/README.md § 7).
 *
 *   npm run backup:restore -- <file>                    # the whole file → the EMULATORS, then read back
 *   npm run backup:restore -- <file> --doc <path>       # one document → the emulators
 *   npm run backup:restore:prod -- <file> --doc <path>  # ONE document → PRODUCTION, after the diff
 *                                                       #   and the project id typed
 *
 * The emulators take a whole file (a full backup or one account's) — it is the dry run of a move
 * to another project, and the way to look at a backup in the app: each Auth account of the file is
 * created in the emulator with the fixture password `test1234` and admitted (`allowed-users` comes
 * with the file). Every written document is read back and compared field by field with the file.
 *
 * Production takes ONE document, never a collection: the current document and the backup's are
 * compared key by key, the person types the project id (`confirmProductionWrite`), and the
 * document is replaced whole. A file from another project is refused.
 */
import { readFile } from 'node:fs/promises';
import { backupAdminApp } from './lib/backup/adminApp';
import { assertBackupFile, diffKeys, type BackupDocument } from './lib/backup/backupFile';
import { adminFirestoreKinds } from './lib/backup/firestoreKinds';
import { countByCollection } from './lib/backup/registry';
import { decodeDocument, encodeDocument } from './lib/backup/serializer';
import { confirmProductionWrite } from './lib/confirmProduction';
import { rebuildExpenseTotalsFor } from './lib/rebuildExpenseTotals';

const USAGE = 'usage: npm run backup:restore -- <file> [--doc <path>]   |   npm run backup:restore:prod -- <file> --doc <path>';
const EMULATOR_PASSWORD = 'test1234';

function parseArgs(argv: string[]) {
  let file: string | undefined;
  let doc: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--doc') {
      doc = argv[++i];
      if (!doc) throw new Error(USAGE);
    } else if (!argv[i].startsWith('--') && !file) file = argv[i];
    else throw new Error(`unknown argument ${argv[i]}\n${USAGE}`);
  }
  if (!file) throw new Error(USAGE);
  return { file, doc };
}

async function main() {
  const { file, doc } = parseArgs(process.argv.slice(2));
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
  assertBackupFile(parsed);
  const backup = parsed;
  console.info(`backup del ${backup.createdAt} · ${backup.projectId} (${backup.source}) · ${backup.scope.kind === 'all' ? 'database intero' : `account ${backup.scope.email ?? backup.scope.uid}`} · ${backup.documents.length} documenti`);

  const target = await backupAdminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const db = getFirestore(target.app);
  const kinds = adminFirestoreKinds(db);

  if (target.source === 'production') {
    if (!doc) throw new Error('production takes ONE document: add --doc <path>. A whole file goes to the emulators (npm run backup:restore).');
    if (backup.projectId !== target.projectId) throw new Error(`the file is of project ${backup.projectId}, production is ${target.projectId}: refused.`);
  }

  const documents: BackupDocument[] = doc ? backup.documents.filter((d) => d.path === doc) : backup.documents;
  if (doc && documents.length === 0) throw new Error(`${doc} is not in the file`);

  if (doc) {
    const currentSnap = await db.doc(doc).get();
    const current = currentSnap.exists ? encodeDocument(currentSnap.data() ?? {}, kinds) : null;
    const diff = diffKeys(current, documents[0].data);
    console.info(`\n${doc}: ${current ? 'esiste' : 'non esiste'} nel database`);
    console.info(`  campi che tornano:   ${diff.added.join(', ') || '—'}`);
    console.info(`  campi che spariscono: ${diff.removed.join(', ') || '—'}`);
    console.info(`  campi che cambiano:  ${diff.changed.join(', ') || '—'}`);
    if (current && diff.added.length + diff.removed.length + diff.changed.length === 0) {
      console.info('\nil documento è già uguale al backup: niente da scrivere.');
      return;
    }
    if (target.source === 'production') await confirmProductionWrite(target.projectId, `backup:restore:prod ${doc}`);
  }

  // Write: whole documents, 400 per batch (the limit is 500).
  let batch = db.batch();
  let pending = 0;
  for (const d of documents) {
    batch.set(db.doc(d.path), decodeDocument(d.data, kinds));
    if (++pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();

  // The emulator gets the file's accounts, so the app can be opened on the restored data.
  if (target.source === 'emulator' && !doc) {
    const auth = getAuth(target.app);
    for (const u of backup.auth) {
      try {
        await auth.getUser(u.uid);
      } catch {
        await auth.createUser({ uid: u.uid, email: u.email ?? undefined, displayName: u.displayName ?? undefined, password: EMULATOR_PASSWORD });
        console.info(`  account ${u.email ?? u.uid} creato nell'emulatore (password ${EMULATOR_PASSWORD})`);
      }
    }
  }

  // Read back every written document and compare it with the file.
  const mismatched: string[] = [];
  for (let i = 0; i < documents.length; i += 300) {
    const chunk = documents.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map((d) => db.doc(d.path)));
    snaps.forEach((snap, j) => {
      const expected = chunk[j];
      const actual = snap.exists ? encodeDocument(snap.data() ?? {}, kinds) : null;
      const d = actual ? diffKeys(actual, expected.data) : null;
      if (!d || d.added.length + d.removed.length + d.changed.length > 0) mismatched.push(expected.path);
    });
  }
  const counts = countByCollection(documents.map((d) => d.path));
  console.info('');
  for (const [key, n] of Object.entries(counts)) console.info(`  ${key.padEnd(36)} ${n}`);
  if (mismatched.length > 0) {
    console.error(`\n✗ ${mismatched.length} documenti non tornano uguali al backup: ${mismatched.slice(0, 10).join(', ')}${mismatched.length > 10 ? '…' : ''}`);
    process.exit(1);
  }
  console.info(`\n✓ ${documents.length} documenti scritti in ${target.source === 'production' ? 'PRODUZIONE' : 'emulatore'} e riletti uguali al backup`);

  // The monthly totals are a cache (left out without --with-caches): the emulator rebuilds them
  // from the restored rows, so the restored accounts read as production does (doc/totali-mensili § 7.3).
  if (target.source === 'emulator' && !doc) {
    const owners = new Set(
      documents
        .filter((d) => d.path.startsWith('expenses/'))
        .map((d) => (d.data as Record<string, unknown>).userId)
        .filter((u): u is string => typeof u === 'string'),
    );
    if (owners.size > 0) await rebuildExpenseTotalsFor(db, [...owners]);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
