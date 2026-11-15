/**
 * An in-memory Admin SDK (`adminDb` + `adminAuth`) for route tests that must read what Firestore
 * would hold after a call, and for the authorization table, which must see every document path a
 * handler touched.
 *
 * Documents live in one Map keyed `collection/id` (a sub-collection is `a/b/c/d`). Queries support
 * `where` with `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `array-contains`, then `orderBy`/`limit`
 * (ordering is ignored: no test here depends on it). `runTransaction` and `batch()` apply to the
 * same Map. Every path read is pushed to `reads`, every path written to `writes`.
 *
 * Tokens: `adminAuth.verifyIdToken('token:<uid>')` decodes to `{ uid }`; anything else throws, as
 * an invalid token does.
 *
 * Use it from a `vi.mock` factory, which can import (the module registry gives the test file the
 * same instance):
 *
 *   vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);
 *   import { fake } from './helpers/adminFake';
 *
 * It does not evaluate Firestore's reads-before-writes rule in transactions, nor security rules.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

const docs = new Map<string, Data>();
const reads: string[] = [];
const writes: string[] = [];
let nextId = 0;

function comparable(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return value;
}

/** What Firestore stores for a written value: a `Date` comes back as a `Timestamp`. */
function stored(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(stored);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, stored(inner)]));
  }
  return value;
}

function applyPatch(current: Data | undefined, patch: Data): Data {
  const next: Data = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) {
      delete next[key];
    } else {
      next[key] = stored(value);
    }
  }
  return next;
}

function snapshotOf(path: string) {
  const id = path.split('/').pop() as string;
  const data = docs.get(path);
  return {
    exists: data !== undefined,
    id,
    ref: docRef(path),
    data: () => (data === undefined ? undefined : { ...data }),
    get: (field: string) => data?.[field],
  };
}

function docRef(path: string) {
  const id = path.split('/').pop() as string;
  return {
    id,
    path,
    get: async () => {
      reads.push(path);
      return snapshotOf(path);
    },
    set: async (data: Data, options?: { merge?: boolean }) => {
      writes.push(path);
      docs.set(path, options?.merge ? applyPatch(docs.get(path), data) : applyPatch(undefined, data));
    },
    update: async (patch: Data) => {
      writes.push(path);
      if (!docs.has(path)) throw new Error(`NOT_FOUND: ${path}`);
      docs.set(path, applyPatch(docs.get(path), patch));
    },
    delete: async () => {
      writes.push(path);
      docs.delete(path);
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}
type DocRef = ReturnType<typeof docRef>;

type Filter = { field: string; op: string; value: unknown };

function matches(data: Data, { field, op, value }: Filter): boolean {
  const actual = comparable(data[field]);
  const expected = comparable(value);
  switch (op) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '<': return (actual as number) < (expected as number);
    case '<=': return (actual as number) <= (expected as number);
    case '>': return (actual as number) > (expected as number);
    case '>=': return (actual as number) >= (expected as number);
    case 'in': return Array.isArray(value) && value.map(comparable).includes(actual);
    case 'array-contains': return Array.isArray(data[field]) && (data[field] as unknown[]).includes(value);
    default: throw new Error(`adminFake: unsupported operator ${op}`);
  }
}

function query(collectionPath: string, filters: Filter[], max?: number) {
  const run = () => {
    const prefix = `${collectionPath}/`;
    const found = [...docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .filter(([, data]) => filters.every((filter) => matches(data, filter)))
      .slice(0, max);
    found.forEach(([path]) => reads.push(path));
    // A query on an empty collection still names the collection it read.
    if (found.length === 0) reads.push(collectionPath);
    const snaps = found.map(([path]) => snapshotOf(path));
    return { docs: snaps, empty: snaps.length === 0, size: snaps.length, forEach: (fn: (s: (typeof snaps)[number]) => void) => snaps.forEach(fn) };
  };
  const chain = {
    where: (field: string, op: string, value: unknown) => query(collectionPath, [...filters, { field, op, value }], max),
    orderBy: () => chain,
    limit: (n: number) => query(collectionPath, filters, n),
    select: () => chain,
    get: async () => run(),
    count: () => ({ get: async () => ({ data: () => ({ count: run().size }) }) }),
  };
  return chain;
}

function collectionRef(path: string) {
  return {
    ...query(path, []),
    id: path.split('/').pop(),
    doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++nextId}`}`),
    add: async (data: Data) => {
      const ref = docRef(`${path}/auto-${++nextId}`);
      await ref.set(data);
      return ref;
    },
  };
}

const tx = {
  get: async (refOrQuery: DocRef | { get: () => Promise<unknown> }) => refOrQuery.get(),
  getAll: async (...refs: DocRef[]) => Promise.all(refs.map((ref) => ref.get())),
  set: (ref: DocRef, data: Data, options?: { merge?: boolean }) => {
    void ref.set(data, options);
    return tx;
  },
  update: (ref: DocRef, patch: Data) => {
    writes.push(ref.path);
    docs.set(ref.path, applyPatch(docs.get(ref.path), patch));
    return tx;
  },
  delete: (ref: DocRef) => {
    void ref.delete();
    return tx;
  },
  create: (ref: DocRef, data: Data) => {
    void ref.set(data);
    return tx;
  },
};

function batch() {
  const ops: Array<() => Promise<unknown>> = [];
  const b = {
    set: (ref: DocRef, data: Data, options?: { merge?: boolean }) => (ops.push(() => ref.set(data, options)), b),
    update: (ref: DocRef, patch: Data) => (ops.push(() => ref.update(patch)), b),
    delete: (ref: DocRef) => (ops.push(() => ref.delete()), b),
    commit: async () => {
      for (const op of ops) await op();
    },
  };
  return b;
}

export const adminDb = {
  collection: (name: string) => collectionRef(name),
  doc: (path: string) => docRef(path),
  runTransaction: async <T,>(body: (t: typeof tx) => Promise<T>) => body(tx),
  batch,
  getAll: async (...refs: DocRef[]) => Promise.all(refs.map((ref) => ref.get())),
};

export const adminAuth = {
  verifyIdToken: async (token: string) => {
    if (!token.startsWith('token:')) throw new Error('auth/argument-error');
    const uid = token.slice('token:'.length);
    return { uid, email: `${uid}@example.com` };
  },
  getUserByEmail: async () => {
    throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
  },
  getUser: async (uid: string) => ({ uid, email: `${uid}@example.com` }),
};

/** What `vi.mock('@/lib/firebase/admin', …)` returns. */
export const adminModule = { adminDb, adminAuth, default: { adminDb, adminAuth } };

export const fake = {
  docs,
  reads,
  writes,
  reset() {
    docs.clear();
    reads.length = 0;
    writes.length = 0;
    nextId = 0;
  },
  /** Forget what was read and written so far, keep the documents. */
  clearLog() {
    reads.length = 0;
    writes.length = 0;
  },
  get: (path: string) => docs.get(path),
  set: (path: string, data: Data) => void docs.set(path, data),
};

/** A request header for `uid`'s token. */
export const bearer = (uid: string) => ({ authorization: `Bearer token:${uid}` });
