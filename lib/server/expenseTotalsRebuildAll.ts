/**
 * `rebuildAllExpenseTotals` on ANY Admin Firestore (doc/totali-mensili/README.md § 5.4, § 7): the
 * app passes `adminDb`; the seeds, `mirror:seed`, `backup:restore` and `expense-totals:build` pass
 * their own instance and never import the app's `lib/firebase/admin` (like `scripts/lib/allowUser.ts`).
 *
 * One read of every row of the account (E), every year from the oldest row's to the newest's (the
 * running year included) written whole, and a year document left without rows deleted.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { Expense } from '@/types/expenses';
import { EXPENSE_TOTALS_COLLECTION, expenseTotalsDocId } from '@/types/expenseTotals';
import { buildYearTotals, italyMonthOf, yearTotalsSummary } from '@/lib/utils/expenseTotals';
import type { ExpenseTotalsYear } from '@/types/expenseTotals';
import { toDate } from '@/lib/utils/dateHelpers';

/** One year of a run: what the rows give now against the document that was there (null: none). */
export interface RebuildAllYear {
  year: number;
  /** months of the year with at least one row */
  monthsWithRows: number;
  after: { rowCount: number; amountSum: number };
  before: { rowCount: number; amountSum: number } | null;
}

export interface RebuildAllResult {
  rowsRead: number;
  years: number[];
  deletedYears: number[];
  perYear: RebuildAllYear[];
}

/** Firestore's ceiling on the operations of one batch. */
const BATCH_LIMIT = 450;

export async function rebuildAllExpenseTotalsIn(db: Firestore, userId: string, now: Date = new Date(), options: { dryRun?: boolean } = {}): Promise<RebuildAllResult> {
  const [rowsSnap, existingSnap] = await Promise.all([
    db.collection('expenses').where('userId', '==', userId).get(),
    db.collection(EXPENSE_TOTALS_COLLECTION).where('userId', '==', userId).get(),
  ]);
  const rows = rowsSnap.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, ...data, date: toDate(data.date), createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) } as Expense;
  });
  const years: number[] = [];
  if (rows.length > 0) {
    const yearsOfRows = rows.map((row) => italyMonthOf(row.date).year);
    const last = Math.max(...yearsOfRows, italyMonthOf(now).year);
    for (let year = Math.min(...yearsOfRows); year <= last; year++) years.push(year);
  }
  const kept = new Set(years);
  const deletedYears = existingSnap.docs.map((doc) => Number(doc.data().year)).filter((year) => !kept.has(year));
  const built = new Map(years.map((year) => [year, buildYearTotals(userId, year, rows, now)]));
  const existing = new Map(existingSnap.docs.map((doc) => [Number(doc.data().year), doc.data() as ExpenseTotalsYear]));
  const perYear: RebuildAllYear[] = years.map((year) => {
    const doc = built.get(year)!;
    const before = existing.get(year);
    return {
      year,
      monthsWithRows: Object.values(doc.months).filter((entry) => entry && entry.rowCount > 0).length,
      after: yearTotalsSummary(doc),
      before: before ? yearTotalsSummary(before) : null,
    };
  });
  if (!options.dryRun) {
    const ref = (year: number) => db.collection(EXPENSE_TOTALS_COLLECTION).doc(expenseTotalsDocId(userId, year));
    const ops = [
      ...years.map((year) => (batch: FirebaseFirestore.WriteBatch) => batch.set(ref(year), built.get(year)!)),
      ...deletedYears.map((year) => (batch: FirebaseFirestore.WriteBatch) => batch.delete(ref(year))),
    ];
    for (let start = 0; start < ops.length; start += BATCH_LIMIT) {
      const batch = db.batch();
      for (const op of ops.slice(start, start + BATCH_LIMIT)) op(batch);
      await batch.commit();
    }
  }
  return { rowsRead: rows.length, years, deletedYears, perYear };
}
