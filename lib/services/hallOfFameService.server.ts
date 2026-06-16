import { adminDb } from '@/lib/firebase/admin';
import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import { toDate } from '@/lib/utils/dateHelpers';
import { calculateMonthlyRecords, calculateYearlyRecords } from '@/lib/utils/hallOfFameRecords';

const COLLECTION_NAME = 'hall-of-fame';
const SNAPSHOTS_COLLECTION = 'monthly-snapshots';
const EXPENSES_COLLECTION = 'expenses';
const MAX_MONTHLY_RECORDS = 20;
const MAX_YEARLY_RECORDS = 10;

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

    return snapshotsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        createdAt: toDate(data.createdAt),
      };
    }) as MonthlySnapshot[];
  } catch (error) {
    console.error('Error getting snapshots (server):', error);
    throw error;
  }
}

/**
 * Recupera tutte le spese per un utente (versione server-side)
 */
async function getAllExpensesServer(userId: string): Promise<Expense[]> {
  try {
    const expensesSnapshot = await adminDb
      .collection(EXPENSES_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('date', 'desc')
      .get();

    return expensesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: toDate(data.date),
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      };
    }) as Expense[];
  } catch (error) {
    console.error('Error getting expenses (server):', error);
    throw error;
  }
}

/**
 * Aggiorna la Hall of Fame per un utente (versione server-side con Admin SDK)
 */
export async function updateHallOfFame(userId: string): Promise<void> {
  try {
    // Recupera tutti gli snapshot e le spese dell'utente
    const [snapshots, expenses] = await Promise.all([
      getUserSnapshotsServer(userId),
      getAllExpensesServer(userId),
    ]);

    // Calcola record mensili e annuali
    const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
    const yearlyRecords = calculateYearlyRecords(snapshots, expenses);

    // Crea i ranking
    const hallOfFameData = {
      userId,

      // Migliori mesi per crescita NW (ordinati per netWorthDiff decrescente)
      bestMonthsByNetWorthGrowth: [...monthlyRecords]
        .filter(r => r.netWorthDiff > 0)
        .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Migliori mesi per entrate
      bestMonthsByIncome: [...monthlyRecords]
        .sort((a, b) => b.totalIncome - a.totalIncome)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Peggiori mesi per decremento NW (ordinati per netWorthDiff crescente, cioè valori più negativi)
      worstMonthsByNetWorthDecline: [...monthlyRecords]
        .filter(r => r.netWorthDiff < 0)
        .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Peggiori mesi per spese
      worstMonthsByExpenses: [...monthlyRecords]
        .sort((a, b) => b.totalExpenses - a.totalExpenses)
        .slice(0, MAX_MONTHLY_RECORDS),

      // Migliori anni per crescita NW
      bestYearsByNetWorthGrowth: [...yearlyRecords]
        .filter(r => r.netWorthDiff > 0)
        .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
        .slice(0, MAX_YEARLY_RECORDS),

      // Migliori anni per entrate
      bestYearsByIncome: [...yearlyRecords]
        .sort((a, b) => b.totalIncome - a.totalIncome)
        .slice(0, MAX_YEARLY_RECORDS),

      // Peggiori anni per decremento NW
      worstYearsByNetWorthDecline: [...yearlyRecords]
        .filter(r => r.netWorthDiff < 0)
        .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
        .slice(0, MAX_YEARLY_RECORDS),

      // Peggiori anni per spese
      worstYearsByExpenses: [...yearlyRecords]
        .sort((a, b) => b.totalExpenses - a.totalExpenses)
        .slice(0, MAX_YEARLY_RECORDS),

      updatedAt: new Date(),
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
