import { adminDb } from '@/lib/firebase/admin';
import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import { loadExpenseFlows, type ExpenseFlowSource } from '@/lib/utils/expenseTotals';
import { expenseFlowSourceAdmin, type VerifyResult } from '@/lib/server/expenseTotals';
import {
  buildHallOfFameRankings,
  calculateMonthlyRecords,
  calculateYearlyRecords,
} from '@/lib/utils/hallOfFameRecords';
import { snapshotFromData } from '@/lib/utils/snapshotDocument';

const COLLECTION_NAME = 'hall-of-fame';
const SNAPSHOTS_COLLECTION = 'monthly-snapshots';

/**
 * Recupera tutti gli snapshot per un utente (versione server-side)
 */
async function getUserSnapshotsServer(userId: string): Promise<MonthlySnapshot[]> {
  try {
    const snapshotsSnapshot = await adminDb
      .collection(SNAPSHOTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('year', 'asc')
      .orderBy('month', 'asc')
      .get();

    return snapshotsSnapshot.docs.map((doc) => snapshotFromData(doc.data()));
  } catch (error) {
    console.error('Error getting snapshots (server):', error);
    throw error;
  }
}

/**
 * The expenses as the Hall of Fame sums them: the monthly totals for every month they vouch for,
 * the rows for the others (doc/totali-mensili § 6.1, D-TM7) — never the whole collection. After the
 * nightly check (`verified`) the documents and the bounds are the ones it left in memory and the
 * running month, just rebuilt, comes from the totals too: snapshots + nothing else (CA8).
 */
async function readExpenseFlowsServer(userId: string, now: Date, verified?: VerifyResult): Promise<Expense[]> {
  const admin = expenseFlowSourceAdmin(userId);
  if (!verified) return loadExpenseFlows(userId, admin, { now });
  const source: ExpenseFlowSource = {
    ...admin,
    readBounds: async () => verified.bounds,
    readYears: async (years) => verified.years.filter((doc) => years.includes(doc.year)),
  };
  return loadExpenseFlows(userId, source, { now, trustRunningMonth: true });
}

/**
 * Aggiorna la Hall of Fame per un utente (versione server-side con Admin SDK)
 */
export async function updateHallOfFame(userId: string, options: { verified?: VerifyResult } = {}): Promise<void> {
  try {
    const now = options.verified?.now ?? new Date();
    const [snapshots, expenses] = await Promise.all([
      getUserSnapshotsServer(userId),
      readExpenseFlowsServer(userId, now, options.verified),
    ]);

    // One definition of a record and of a ranking, shared with the client writer and the
    // periodic email (lib/utils/hallOfFameRecords.ts). This file owns the Admin-SDK I/O only.
    const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
    const yearlyRecords = calculateYearlyRecords(snapshots, expenses);
    const hallOfFameData = {
      userId,
      ...buildHallOfFameRankings(monthlyRecords, yearlyRecords),
      // Both stamps here, and only here: a note's save moves `updatedAt` alone.
      rankingsUpdatedAt: now,
      updatedAt: now,
    };

    // Preserve existing notes when recalculating rankings
    // Critical: Notes must not be lost during ranking updates (which happen after every new snapshot)
    // Pattern: GET existing → merge notes → SET complete doc
    const existingDocRef = adminDb.collection(COLLECTION_NAME).doc(userId);
    const existingDoc = await existingDocRef.get();
    const existingNotes = existingDoc.exists ? existingDoc.data()?.notes || [] : [];

    // Salva su Firebase usando Admin SDK, preserving notes
    await existingDocRef.set({
      ...hallOfFameData,
      notes: existingNotes, // Preserve user notes during recalculation
    });

    console.log(`Hall of Fame updated for user ${userId} (server-side)`);
  } catch (error) {
    console.error('Error updating Hall of Fame (server):', error);
    throw error;
  }
}
