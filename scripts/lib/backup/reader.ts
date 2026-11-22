/**
 * The READER of a backup: what `backup:export` takes from Firestore, with nothing but `.get()`
 * (doc/backup/README.md § 4). The registry (`registry.ts`) says what belongs to whom.
 *
 *   - whole database: every top-level collection Firestore lists (a collection the registry does not
 *     know is read anyway and reported), plus the declared subcollections through a collection group;
 *   - one account: the rows with its `userId`, the documents whose id is its uid, their declared
 *     subcollections, and the `account-access` documents that name it as a member.
 */
import type { Auth } from 'firebase-admin/auth';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import type { BackupAuthUser, BackupDocument } from './backupFile';
import { collectionsToExport, findBackupCollection, type BackupCollection } from './registry';
import { encodeDocument, type FirestoreKinds } from './serializer';

export interface ReadResult {
  documents: BackupDocument[];
  unknownCollections: string[];
  /** billed reads, roughly: one per document, one per query that returned nothing */
  reads: number;
}

class Collector {
  readonly documents = new Map<string, BackupDocument>();
  reads = 0;
  constructor(private readonly kinds: FirestoreKinds) {}
  add(snaps: DocumentSnapshot[]) {
    this.reads += Math.max(1, snaps.length);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      this.documents.set(snap.ref.path, { path: snap.ref.path, data: encodeDocument(snap.data() ?? {}, this.kinds) });
    }
  }
  result(unknownCollections: string[]): ReadResult {
    const documents = [...this.documents.values()].sort((a, b) => a.path.localeCompare(b.path));
    return { documents, unknownCollections, reads: this.reads };
  }
}

export async function readWholeDatabase(db: Firestore, kinds: FirestoreKinds, withCaches: boolean): Promise<ReadResult> {
  const out = new Collector(kinds);
  const wanted = new Set(collectionsToExport('all', withCaches).map((c) => c.name));
  const unknown: string[] = [];
  const topLevel = (await db.listCollections()).map((c) => c.id).sort();
  for (const name of topLevel) {
    const entry = findBackupCollection(name);
    if (!entry) unknown.push(name);
    else if (!wanted.has(name)) continue;
    out.add((await db.collection(name).get()).docs);
  }
  for (const entry of collectionsToExport('all', withCaches)) {
    for (const sub of entry.subcollections ?? []) {
      const group = await db.collectionGroup(sub).get();
      // A collection group spans every parent: keep the ones under THIS collection, one level deep.
      out.add(group.docs.filter((d) => d.ref.path.split('/').length === 4 && d.ref.path.startsWith(`${entry.name}/`)));
    }
  }
  return out.result(unknown);
}

export async function readOneAccount(db: Firestore, kinds: FirestoreKinds, uid: string, withCaches: boolean): Promise<ReadResult> {
  const out = new Collector(kinds);
  for (const entry of collectionsToExport('user', withCaches)) {
    const parents = await readParents(db, entry, uid, out);
    for (const sub of entry.subcollections ?? []) {
      for (const parentPath of parents) out.add((await db.doc(parentPath).collection(sub).get()).docs);
    }
  }
  return out.result([]);
}

/** The account's documents of one collection; returns the parent paths its subcollections hang from. */
async function readParents(db: Firestore, entry: BackupCollection, uid: string, out: Collector): Promise<string[]> {
  if (entry.ownership === 'userField') {
    const snap = await db.collection(entry.name).where('userId', '==', uid).get();
    out.add(snap.docs);
    return snap.docs.map((d) => d.ref.path);
  }
  // docId: the parent may be a phantom (budgetHistory/{uid} holds only `months/`), so its path
  // counts as a parent whether or not the document exists.
  const own = await db.doc(`${entry.name}/${uid}`).get();
  out.add([own]);
  if (entry.memberArrayField) {
    out.add((await db.collection(entry.name).where(entry.memberArrayField, 'array-contains', uid).get()).docs);
  }
  return [`${entry.name}/${uid}`];
}

function toAuthUser(u: Awaited<ReturnType<Auth['getUser']>>): BackupAuthUser {
  const iso = (s: string | undefined) => (s ? new Date(s).toISOString() : null);
  return {
    uid: u.uid,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    disabled: u.disabled,
    emailVerified: u.emailVerified,
    providers: u.providerData.map((p) => p.providerId),
    createdAt: iso(u.metadata.creationTime),
    lastSignInAt: iso(u.metadata.lastSignInTime),
  };
}

export async function readAuthUsers(auth: Auth, uid?: string): Promise<BackupAuthUser[]> {
  if (uid) return [toAuthUser(await auth.getUser(uid))];
  const users: BackupAuthUser[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.map(toAuthUser));
    pageToken = page.pageToken;
  } while (pageToken);
  return users.sort((a, b) => a.uid.localeCompare(b.uid));
}
