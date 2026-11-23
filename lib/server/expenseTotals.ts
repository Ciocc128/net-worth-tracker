/**
 * Who WRITES the monthly totals (doc/totali-mensili/README.md § 5): the server alone, rebuilding a
 * month from its rows (D-TM5). Three entries:
 *
 *   - `rebuildExpenseTotals(userId, months)` after a write on a month that is not the running one
 *     (the rebuild route, the server writers, § 5.2);
 *   - `verifyExpenseTotals(userId)`, the nightly check in the cron (§ 5.3): the running month, the
 *     rows changed since the last run, a `count` + `sum` per year, the years with no document;
 *   - `rebuildAllExpenseTotals(userId)`, the whole history from one read of every row (§ 5.4): the
 *     migration script, a new `schemaVersion`, «Aggiorna i record» of the Hall of Fame.
 *
 * A failure here never undoes the write that asked for it: the nightly check repairs (CU5).
 * `expenseFlowSourceAdmin` is the Admin twin of the client reader, for the Hall of Fame in the cron.
 */

import { AggregateField, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { Expense } from '@/types/expenses';
import {
  EXPENSE_TOTALS_COLLECTION,
  EXPENSE_TOTALS_META_COLLECTION,
  EXPENSE_TOTALS_SCHEMA_VERSION,
  expenseTotalsDocId,
  type ExpenseTotalsMonth,
  type ExpenseTotalsYear,
  type ItalyMonth,
} from '@/types/expenseTotals';
import {
  buildMonthTotals,
  buildYearTotals,
  italyMonthEnd,
  italyMonthLabel,
  italyMonthOf,
  italyMonthStart,
  monthFromIndex,
  monthIndex,
  monthKeyOf,
  monthsToRebuild,
  totalsDiffer,
  yearTotalsSummary,
  expenseTotalsYearFromData,
  type ExpenseFlowSource,
} from '@/lib/utils/expenseTotals';
import { toDate } from '@/lib/utils/dateHelpers';
import { rebuildAllExpenseTotalsIn, type RebuildAllResult } from '@/lib/server/expenseTotalsRebuildAll';

const EXPENSES = 'expenses';

// ─── Reading ────────────────────────────────────────────────────────────────

function expenseFromDoc(id: string, data: FirebaseFirestore.DocumentData): Expense {
  return {
    id,
    ...data,
    date: toDate(data.date),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Expense;
}

/** A stored year document as the pure layer reads it: the shared parser, re-exported for the tests. */
export { expenseTotalsYearFromData };

async function readRows(userId: string, from: Date, to: Date): Promise<Expense[]> {
  const snap = await adminDb
    .collection(EXPENSES)
    .where('userId', '==', userId)
    .where('date', '>=', Timestamp.fromDate(from))
    .where('date', '<=', Timestamp.fromDate(to))
    .get();
  return snap.docs.map((doc) => expenseFromDoc(doc.id, doc.data()));
}

async function readBounds(userId: string): Promise<{ oldest: Date; newest: Date } | null> {
  const edge = (direction: 'asc' | 'desc') =>
    adminDb.collection(EXPENSES).where('userId', '==', userId).orderBy('date', direction).limit(1).get();
  const [oldest, newest] = await Promise.all([edge('asc'), edge('desc')]);
  const first = oldest.docs[0]?.data().date;
  const last = newest.docs[0]?.data().date;
  if (!first || !last) return null;
  return { oldest: toDate(first), newest: toDate(last) };
}

async function readYearDocs(userId: string): Promise<ExpenseTotalsYear[]> {
  const snap = await adminDb.collection(EXPENSE_TOTALS_COLLECTION).where('userId', '==', userId).get();
  return snap.docs.map((doc) => expenseTotalsYearFromData(doc.data()));
}

/** The Admin reader of `loadExpenseFlows` (lib/utils/expenseTotals.ts). */
export function expenseFlowSourceAdmin(userId: string): ExpenseFlowSource {
  return {
    readBounds: () => readBounds(userId),
    readYears: async (years) => {
      if (years.length === 0) return [];
      const refs = years.map((year) => adminDb.collection(EXPENSE_TOTALS_COLLECTION).doc(expenseTotalsDocId(userId, year)));
      const snaps = await adminDb.getAll(...refs);
      return snaps.filter((snap) => snap.exists).map((snap) => expenseTotalsYearFromData(snap.data()!));
    },
    readRows: (from, to) => readRows(userId, from, to),
    readCategoryRows: async (categoryId) => {
      const snap = await adminDb.collection(EXPENSES).where('userId', '==', userId).where('categoryId', '==', categoryId).get();
      return snap.docs.map((doc) => expenseFromDoc(doc.id, doc.data()));
    },
  };
}

// ─── Rebuilding ─────────────────────────────────────────────────────────────

const yearRef = (userId: string, year: number) => adminDb.collection(EXPENSE_TOTALS_COLLECTION).doc(expenseTotalsDocId(userId, year));

/** Contiguous runs of month indexes: one query each. */
function runsOf(indexes: number[]): Array<[number, number]> {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const index of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  }
  return runs;
}

async function writeWholeYear(userId: string, year: number, builtAt: Date): Promise<ExpenseTotalsYear> {
  const rows = await readRows(userId, italyMonthStart({ year, month: 1 }), italyMonthEnd({ year, month: 12 }));
  const doc = buildYearTotals(userId, year, rows, builtAt);
  await yearRef(userId, year).set(doc);
  return doc;
}

export interface RebuildResult {
  /** `YYYY-MM` of every month written. */
  months: string[];
  /** Years written whole (no document, or an old `schemaVersion`). */
  wholeYears: number[];
}

/**
 * The year documents a caller already holds, by year (`null` = known to be missing): the nightly
 * check reads them once and lets every rebuild skip its own read and leave the result here, so the
 * Hall of Fame after it reads none (CA8).
 */
export type KnownYears = Map<number, ExpenseTotalsYear | null>;

/**
 * Rebuilds `months` from their rows (§ 5.1). Months of one year go into one write; a year with no
 * document — or one with an old `schemaVersion` — is built WHOLE, so a document always holds its
 * twelve months. Em reads and one write per month (the year's rows and one write for a whole year).
 */
export async function rebuildExpenseTotals(
  userId: string,
  months: ItalyMonth[],
  now: Date = new Date(),
  known?: KnownYears,
): Promise<RebuildResult> {
  const result: RebuildResult = { months: [], wholeYears: [] };
  const byYear = new Map<number, number[]>();
  for (const m of months) {
    const list = byYear.get(m.year) ?? [];
    list.push(monthIndex(m));
    byYear.set(m.year, list);
  }
  for (const [year, indexes] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
    const ref = yearRef(userId, year);
    let current: ExpenseTotalsYear | null;
    if (known?.has(year)) current = known.get(year) ?? null;
    else {
      const snap = await ref.get();
      current = snap.exists ? expenseTotalsYearFromData(snap.data()!) : null;
    }
    if (!current || current.schemaVersion !== EXPENSE_TOTALS_SCHEMA_VERSION) {
      // Never `known?.set(year, await …)`: optional chaining would skip the write itself.
      const written = await writeWholeYear(userId, year, now);
      known?.set(year, written);
      result.wholeYears.push(year);
      for (let month = 1; month <= 12; month++) result.months.push(italyMonthLabel({ year, month }));
      continue;
    }
    const patch: Record<string, ExpenseTotalsMonth> = {};
    const next: ExpenseTotalsYear = { ...current, months: { ...current.months } };
    for (const [first, last] of runsOf(indexes)) {
      const rows = await readRows(userId, italyMonthStart(monthFromIndex(first)), italyMonthEnd(monthFromIndex(last)));
      for (let index = first; index <= last; index++) {
        const m = monthFromIndex(index);
        const ofMonth = rows.filter((row) => monthIndex(italyMonthOf(row.date)) === index);
        const entry = { builtAt: now, ...buildMonthTotals(ofMonth) };
        patch[`months.${monthKeyOf(m.month)}`] = entry;
        next.months[monthKeyOf(m.month)] = entry;
        result.months.push(italyMonthLabel(m));
      }
    }
    await ref.update(patch);
    known?.set(year, next);
  }
  return result;
}

/** Rebuilds the months of `dates` that are not the running one: the server writers' call (§ 5.2). Never throws. */
export async function rebuildExpenseTotalsForDates(
  userId: string,
  dates: Array<Date | null | undefined>,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  const months = monthsToRebuild(dates, now);
  if (months.length === 0) return;
  try {
    await rebuildExpenseTotals(userId, months, now);
  } catch (error) {
    // Not critical: the write stands, the nightly check repairs (CU5).
    console.error('[expense-totals] rebuild failed', { userId, reason, months: months.map(italyMonthLabel), error });
  }
}

export type { RebuildAllResult } from '@/lib/server/expenseTotalsRebuildAll';

/**
 * The whole history from one read of every row (§ 5.4), on the app's Admin SDK. The body lives in
 * `expenseTotalsRebuildAll.ts`, which takes the Firestore it writes to, so the seeds and the
 * migration script run the same code on their own instance.
 */
export async function rebuildAllExpenseTotals(userId: string, now: Date = new Date()): Promise<RebuildAllResult> {
  return rebuildAllExpenseTotalsIn(adminDb, userId, now);
}

// ─── The nightly check ──────────────────────────────────────────────────────

/** `count()` + `sum('amount')` of the rows in `[from, to]`: 1 read per 1.000 index entries. */
export async function aggregateRows(userId: string, from: Date, to: Date): Promise<{ rowCount: number; amountSum: number }> {
  const snap = await adminDb
    .collection(EXPENSES)
    .where('userId', '==', userId)
    .where('date', '>=', Timestamp.fromDate(from))
    .where('date', '<=', Timestamp.fromDate(to))
    .aggregate({ rows: AggregateField.count(), amount: AggregateField.sum('amount') })
    .get();
  const data = snap.data();
  return { rowCount: Number(data.rows ?? 0), amountSum: Number(data.amount ?? 0) };
}

export interface VerifyReport {
  /** The months rebuilt, `YYYY-MM`, by the step that found them. */
  current: string[];
  changed: string[];
  mismatched: string[];
  missingYears: number[];
}

export interface VerifyResult {
  report: VerifyReport;
  /** The year documents as the check left them, and the rows' bounds: the Hall of Fame reads these, not Firestore. */
  years: ExpenseTotalsYear[];
  bounds: { oldest: Date; newest: Date } | null;
  /** The check's clock: the Hall of Fame reads with it, so «the running month» is the one just rebuilt. */
  now: Date;
}

/**
 * The nightly check (§ 5.3), for one account, AFTER the snapshot and BEFORE the Hall of Fame:
 *
 *   0. the year documents (Y) and the rows' bounds (2), read once;
 *   1. the running month, rebuilt from its rows (Em);
 *   2. the rows changed since the last run (`updatedAt >`): their months, rebuilt — a row edited in
 *      the running month costs nothing more, one in a closed month costs that month's rows;
 *   3. per year document, `count` + `sum` over the year against Σ of its months; a year that
 *      differs is measured month by month (12 aggregations) and the months that differ are rebuilt
 *      — it finds the rows added or deleted by a writer that did not ask (CU5);
 *   4. the years with rows and no document (or an old `schemaVersion`), built whole (§ 7.1);
 *   5. `lastVerifiedAt` = the start of the run.
 *
 * Each step's failure is logged and the next still runs; the cron goes on to the Hall of Fame,
 * which reads every month it cannot trust from its rows.
 */
export async function verifyExpenseTotals(userId: string, now: Date = new Date()): Promise<VerifyResult> {
  const report: VerifyReport = { current: [], changed: [], mismatched: [], missingYears: [] };
  const step = async (name: string, body: () => Promise<void>) => {
    try {
      await body();
    } catch (error) {
      console.error(`[expense-totals] nightly check, step «${name}» failed`, { userId, error });
    }
  };
  const currentMonth = italyMonthOf(now);
  const known: KnownYears = new Map();
  let bounds: { oldest: Date; newest: Date } | null = null;

  await step('lettura', async () => {
    const [docs, edges] = await Promise.all([readYearDocs(userId), readBounds(userId)]);
    for (const doc of docs) known.set(doc.year, doc);
    bounds = edges;
  });

  await step('mese in corso', async () => {
    if (!known.has(currentMonth.year)) known.set(currentMonth.year, null);
    report.current = (await rebuildExpenseTotals(userId, [currentMonth], now, known)).months;
  });

  const metaRef = adminDb.collection(EXPENSE_TOTALS_META_COLLECTION).doc(userId);
  await step('righe modificate', async () => {
    const meta = await metaRef.get();
    const lastVerifiedAt = meta.exists ? meta.data()?.lastVerifiedAt : null;
    if (!lastVerifiedAt) return;
    const changed = await adminDb
      .collection(EXPENSES)
      .where('userId', '==', userId)
      .where('updatedAt', '>', lastVerifiedAt)
      .get();
    const months = monthsToRebuild(changed.docs.map((doc) => toDate(doc.data().date)), now);
    for (const m of months) if (!known.has(m.year)) known.set(m.year, null);
    if (months.length > 0) report.changed = (await rebuildExpenseTotals(userId, months, now, known)).months;
  });

  await step('conteggio e somma', async () => {
    const toRebuild: ItalyMonth[] = [];
    for (const doc of [...known.values()]) {
      if (!doc || doc.schemaVersion !== EXPENSE_TOTALS_SCHEMA_VERSION) continue; // step 4
      const year = await aggregateRows(userId, italyMonthStart({ year: doc.year, month: 1 }), italyMonthEnd({ year: doc.year, month: 12 }));
      if (!totalsDiffer(year, yearTotalsSummary(doc))) continue;
      for (let month = 1; month <= 12; month++) {
        const m = { year: doc.year, month };
        const entry = doc.months[monthKeyOf(month)];
        const measured = await aggregateRows(userId, italyMonthStart(m), italyMonthEnd(m));
        if (!entry || totalsDiffer(measured, entry)) toRebuild.push(m);
      }
    }
    if (toRebuild.length > 0) report.mismatched = (await rebuildExpenseTotals(userId, toRebuild, now, known)).months;
  });

  await step('anni mancanti', async () => {
    const edges = bounds as { oldest: Date; newest: Date } | null;
    if (!edges) return;
    const last = Math.max(italyMonthOf(edges.newest).year, currentMonth.year);
    for (let year = italyMonthOf(edges.oldest).year; year <= last; year++) {
      const doc = known.get(year);
      if (doc && doc.schemaVersion === EXPENSE_TOTALS_SCHEMA_VERSION) continue;
      known.set(year, await writeWholeYear(userId, year, now));
      report.missingYears.push(year);
    }
  });

  await step('ultima verifica', async () => {
    await metaRef.set({ userId, lastVerifiedAt: now });
  });

  const years = [...known.values()].filter((doc): doc is ExpenseTotalsYear => doc !== null);
  return { report, years, bounds, now };
}
