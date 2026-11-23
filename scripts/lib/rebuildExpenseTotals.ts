/**
 * The seeds' last step (doc/totali-mensili/README.md § 7.3): rebuild the monthly expense totals of
 * the accounts they wrote, so the E2E specs run on the totals path as production does. Same code as
 * the app (`rebuildAllExpenseTotalsIn`), on the seed's own Firestore.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { rebuildAllExpenseTotalsIn } from '../../lib/server/expenseTotalsRebuildAll';

export async function rebuildExpenseTotalsFor(db: Firestore, uids: string[]): Promise<void> {
  for (const uid of uids) {
    const result = await rebuildAllExpenseTotalsIn(db, uid);
    console.log(`  expense totals for ${uid}: ${result.rowsRead} rows → years ${result.years.join(', ') || '—'}`);
  }
}
