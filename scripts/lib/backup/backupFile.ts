/**
 * The backup file: its shape, its name, and which old copies to delete (doc/backup/README.md § 5–6).
 * Pure: the scripts do the disk and Firestore work around it.
 */
import type { EncodedValue } from './serializer';

export const BACKUP_FORMAT = 'nwt-backup';
export const BACKUP_FORMAT_VERSION = 1;

export type BackupScope = { kind: 'all' } | { kind: 'user'; uid: string; email: string | null };

/** An Authentication account, WITHOUT password hashes (those move with `firebase auth:export`). */
export interface BackupAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  emailVerified: boolean;
  providers: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
}

export interface BackupDocument {
  /** full document path, e.g. `monthly-snapshots/u1-2025-3/versions/abc` */
  path: string;
  data: Record<string, EncodedValue>;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  projectId: string;
  /** `production` or `emulator`: a restore checks it */
  source: 'production' | 'emulator';
  scope: BackupScope;
  withCaches: boolean;
  /** documents per collection key (`countKeyOf`), what the restore re-counts */
  counts: Record<string, number>;
  /** top-level collections found in Firestore and missing from the registry: copied anyway */
  unknownCollections: string[];
  auth: BackupAuthUser[];
  documents: BackupDocument[];
}

export function assertBackupFile(value: unknown): asserts value is BackupFile {
  const v = value as Partial<BackupFile> | null;
  if (!v || v.format !== BACKUP_FORMAT) throw new Error('not a net-worth-tracker backup file');
  if (v.version !== BACKUP_FORMAT_VERSION) throw new Error(`unsupported backup version ${String(v.version)}`);
  if (!Array.isArray(v.documents) || !v.counts || !v.scope) throw new Error('backup file is incomplete');
}

/** `2026-11-22T21-15` in Italy's time: sorts by name, readable in Finder, no `:` (macOS shows it as `/`). */
export function formatBackupStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}-${get('minute')}`;
}

const SAFE = /[^A-Za-z0-9_-]/g;

export function backupFileName(projectId: string, scope: BackupScope, date: Date): string {
  const who = scope.kind === 'all' ? 'all' : `user-${scope.uid.replace(SAFE, '_')}`;
  return `nwt-backup-${projectId.replace(SAFE, '_')}-${who}-${formatBackupStamp(date)}.json`;
}

const FULL_NAME = /^nwt-backup-(.+)-all-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})\.json$/;

/**
 * Which FULL backups of `projectId` to delete (D-BK2): keep the `keepLatest` newest, plus the oldest of each
 * calendar month, forever. Single-account exports (`-user-`), other projects' backups and foreign
 * files are never touched.
 * Names sort in time order because the stamp does.
 */
export function selectBackupsToPrune(fileNames: readonly string[], projectId: string, keepLatest = 8): string[] {
  const project = projectId.replace(SAFE, '_');
  const full = fileNames.filter((n) => FULL_NAME.exec(n)?.[1] === project).sort();
  const keep = new Set(full.slice(-keepLatest));
  const firstOfMonth = new Map<string, string>();
  for (const name of full) {
    const m = FULL_NAME.exec(name)!;
    const month = `${m[2]}-${m[3]}`;
    if (!firstOfMonth.has(month)) firstOfMonth.set(month, name);
  }
  for (const name of firstOfMonth.values()) keep.add(name);
  return full.filter((n) => !keep.has(n));
}

/** Top-level keys that differ between two encoded documents (`null` = the document is missing). */
export function diffKeys(current: Record<string, EncodedValue> | null, backup: Record<string, EncodedValue>) {
  const cur = current ?? {};
  const keys = [...new Set([...Object.keys(cur), ...Object.keys(backup)])].sort();
  return {
    added: keys.filter((k) => !(k in cur) && k in backup),
    removed: keys.filter((k) => k in cur && !(k in backup)),
    changed: keys.filter((k) => k in cur && k in backup && JSON.stringify(cur[k]) !== JSON.stringify(backup[k])),
  };
}
