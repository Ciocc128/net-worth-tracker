/**
 * EVERY Firestore collection the app writes, and who owns each document (doc/backup/README.md § 4).
 *
 * The ONE place that says what belongs to a user: `backup:export --uid` reads it to pick an
 * account's rows, the full export to tell a known collection from a new one, `backup:restore` to
 * count. `__tests__/backupRegistry.test.ts` fails when `firestore.rules`, a `*_COLLECTION` constant
 * or a `.collection('…')` literal in the code names a collection that is missing here — so a new
 * collection cannot silently stay out of the backup.
 *
 * Pure: no Firebase import, so the test reads it without an app.
 */

/** How a document is tied to its account. */
export type BackupOwnership =
  /** a `userId` field on each document (`where('userId', '==', uid)`) */
  | 'userField'
  /** the document id IS the uid (`collection/{uid}`); its parent may be a phantom with only subcollections */
  | 'docId'
  /** shared by every account (market caches): never part of a single-account export */
  | 'global';

export interface BackupCollection {
  name: string;
  ownership: BackupOwnership;
  /** recomputed by the app or a cron: skipped unless `--with-caches` */
  cache: boolean;
  /** subcollections under each document of this collection (one level: the app has no deeper) */
  subcollections?: readonly string[];
  /** extra documents of a single-account export: other owners' docs that list the uid in this array field */
  memberArrayField?: string;
  /** what lives there, in one line */
  note: string;
}

export const BACKUP_COLLECTIONS: readonly BackupCollection[] = [
  // ── rows with a userId field ────────────────────────────────────────────────────────────────
  { name: 'assets', ownership: 'userField', cache: false, note: 'strumenti, conti, immobili, prestiti' },
  { name: 'expenses', ownership: 'userField', cache: false, note: 'spese, entrate, trasferimenti' },
  { name: 'expenseCategories', ownership: 'userField', cache: false, note: 'categorie e sottocategorie' },
  { name: 'monthly-snapshots', ownership: 'userField', cache: false, subcollections: ['versions'], note: 'snapshot mensili (id {uid}-{y}-{m}) e i mesi sostituiti in versions/' },
  { name: 'assetTransactions', ownership: 'userField', cache: false, note: 'registro operazioni' },
  { name: 'pensionContributions', ownership: 'userField', cache: false, note: 'contributi previdenza' },
  { name: 'dividends', ownership: 'userField', cache: false, note: 'dividendi e cedole' },
  { name: 'costCenters', ownership: 'userField', cache: false, note: 'centri di costo' },
  { name: 'accumulationPlans', ownership: 'userField', cache: false, note: 'piani di accumulo (PAC)' },
  { name: 'assistantThreads', ownership: 'userField', cache: false, subcollections: ['messages'], note: "conversazioni dell'assistente" },
  { name: 'deliveries', ownership: 'userField', cache: false, note: "consegne delle email e di dati/ per periodo (id {uid}_{periodo}; il commento AI pagato resta qui finché l'invio non riesce)" },
  { name: 'expense-totals', ownership: 'userField', cache: true, note: 'totali mensili delle spese per anno (id {uid}_{anno}; ricostruiti da expense-totals:build)' },
  // ── one document per account, id = uid ─────────────────────────────────────────────────────
  { name: 'users', ownership: 'docId', cache: false, note: 'profilo' },
  { name: 'assetAllocationTargets', ownership: 'docId', cache: false, note: 'impostazioni e target di allocazione' },
  { name: 'assetTransactionsMeta', ownership: 'docId', cache: false, note: 'stato della migrazione del registro' },
  { name: 'budgets', ownership: 'docId', cache: false, note: 'budget' },
  { name: 'budgetHistory', ownership: 'docId', cache: false, subcollections: ['months'], note: 'tetti del budget storicizzati, mese per mese' },
  { name: 'goalBasedInvesting', ownership: 'docId', cache: false, note: 'obiettivi' },
  { name: 'modelPortfolios', ownership: 'docId', cache: false, note: 'portafoglio modello' },
  { name: 'userPreferences', ownership: 'docId', cache: false, note: 'preferenze (tema, fascia)' },
  { name: 'assistantMemory', ownership: 'docId', cache: false, note: "memoria dell'assistente" },
  { name: 'allowed-users', ownership: 'docId', cache: false, note: 'utente ammesso (S2)' },
  { name: 'account-access', ownership: 'docId', cache: false, memberArrayField: 'memberUids', note: "membri dell'account condiviso" },
  { name: 'hall-of-fame', ownership: 'docId', cache: false, note: 'classifiche (ricalcolate dal cron, ma tenute: costano poco)' },
  { name: 'performance-cache', ownership: 'docId', cache: true, note: 'cache dei rendimenti' },
  { name: 'exposure-cache', ownership: 'docId', cache: true, note: "cache dell'esposizione" },
  { name: 'dashboardOverviewSummaries', ownership: 'docId', cache: true, note: 'riepilogo della Panoramica' },
  { name: 'expense-totals-meta', ownership: 'docId', cache: true, note: 'ultima verifica notturna dei totali mensili' },
  // ── shared by every account ─────────────────────────────────────────────────────────────────
  { name: 'cron-runs', ownership: 'global', cache: true, note: 'esiti dei tre cron serali, un documento per giorno e lavoro (90 giorni)' },
  { name: 'benchmark-cache', ownership: 'global', cache: true, note: 'storico dei benchmark' },
  { name: 'fx-rate-cache', ownership: 'global', cache: true, note: 'cambi' },
  { name: 'ecb-rate-cache', ownership: 'global', cache: true, note: 'tassi e ancore BCE' },
  { name: 'instrument-profile-cache', ownership: 'global', cache: true, note: 'profili curati degli strumenti (Esposizione)' },
];

export function findBackupCollection(name: string): BackupCollection | undefined {
  return BACKUP_COLLECTIONS.find((c) => c.name === name);
}

/** Every subcollection name the registry declares (`versions`, `months`, `messages`). */
export function backupSubcollectionNames(): string[] {
  return [...new Set(BACKUP_COLLECTIONS.flatMap((c) => c.subcollections ?? []))];
}

/** The collections a run reads: caches only with `withCaches`; a single account never reads the global ones. */
export function collectionsToExport(scope: 'all' | 'user', withCaches: boolean): BackupCollection[] {
  return BACKUP_COLLECTIONS.filter((c) => (withCaches || !c.cache) && (scope === 'all' || c.ownership !== 'global'));
}

/**
 * The count key of a document path: the collection for a top-level document (`assets/abc` →
 * `assets`), `parent/*\/sub` for a subcollection (`monthly-snapshots/u-2025-1/versions/x` →
 * `monthly-snapshots/*\/versions`). The file's `counts` and the restore's check use it.
 */
export function countKeyOf(path: string): string {
  const parts = path.split('/');
  if (parts.length % 2 !== 0 || parts.length < 2) throw new Error(`not a document path: ${path}`);
  if (parts.length === 2) return parts[0];
  const keys: string[] = [parts[0]];
  for (let i = 2; i < parts.length; i += 2) keys.push('*', parts[i]);
  return keys.join('/');
}

export function countByCollection(paths: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of paths) {
    const key = countKeyOf(p);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
