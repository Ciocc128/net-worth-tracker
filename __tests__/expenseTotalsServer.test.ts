/**
 * Who writes the monthly totals (doc/totali-mensili/README.md § 5, § 13 CA6–CA8), on the fake Admin
 * SDK (`__tests__/helpers/adminFake.ts`, which logs every document read and answers `count` + `sum`).
 * Figures invented and round (WORKFLOW.md rule 7); expected values worked out by hand (rule 9).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

import { fake } from './helpers/adminFake';
import {
  expenseTotalsYearFromData,
  rebuildAllExpenseTotals,
  rebuildExpenseTotals,
  verifyExpenseTotals,
} from '@/lib/server/expenseTotals';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import { buildHallOfFameRankings, calculateMonthlyRecords, calculateYearlyRecords } from '@/lib/utils/hallOfFameRecords';
import type { Expense } from '@/types/expenses';
import type { MonthlySnapshot } from '@/types/assets';

const italy = (iso: string) => fromZonedTime(iso, 'Europe/Rome');
const pad = (n: number) => String(n).padStart(2, '0');
const UID = 'owner';

function storeRow(id: string, fields: { amount: number; date: Date; type?: string; categoryId?: string; categoryName?: string; subCategoryId?: string; updatedAt?: Date }) {
  const updatedAt = fields.updatedAt ?? fields.date;
  fake.set(`expenses/${id}`, {
    userId: UID,
    type: fields.type ?? 'variable',
    categoryId: fields.categoryId ?? 'spesa',
    categoryName: fields.categoryName ?? 'Spesa',
    ...(fields.subCategoryId ? { subCategoryId: fields.subCategoryId, subCategoryName: 'Supermercato' } : {}),
    amount: fields.amount,
    currency: 'EUR',
    date: Timestamp.fromDate(fields.date),
    createdAt: Timestamp.fromDate(fields.date),
    updatedAt: Timestamp.fromDate(updatedAt),
  });
}

const yearDoc = (year: number) => {
  const data = fake.get(`expense-totals/${UID}_${year}`);
  return data ? expenseTotalsYearFromData(data) : null;
};

/** § 13's March 2025 (r1–r7). */
function storeMarch() {
  storeRow('r1', { type: 'income', categoryId: 'stipendio', categoryName: 'Stipendio', amount: 2500, date: italy('2025-03-27T12:00:00') });
  storeRow('r2', { subCategoryId: 'super', amount: -120.4, date: italy('2025-03-10T12:00:00') });
  storeRow('r3', { subCategoryId: 'super', amount: -79.6, date: italy('2025-03-15T12:00:00') });
  storeRow('r4', { type: 'fixed', categoryId: 'casa', categoryName: 'Casa', amount: -800, date: italy('2025-03-05T12:00:00') });
  storeRow('r5', { type: 'transfer', categoryId: 'trasf', categoryName: 'Trasferimenti', amount: 300, date: italy('2025-03-20T12:00:00') });
  storeRow('r6', { categoryId: 'comm', categoryName: 'Commissioni', amount: -2.5, date: italy('2025-03-12T12:00:00') });
  storeRow('r7', { type: 'income', categoryId: 'dividendi', categoryName: 'Dividendi', amount: 50, date: italy('2025-03-01T00:00:00') });
}

const NOW = italy('2025-05-20T19:00:00');

beforeEach(() => fake.reset());

describe('rebuildExpenseTotals', () => {
  it('builds a missing year whole, twelve months, empty ones included', async () => {
    storeMarch();
    const result = await rebuildExpenseTotals(UID, [{ year: 2025, month: 3 }], NOW);
    expect(result.wholeYears).toEqual([2025]);
    const doc = yearDoc(2025)!;
    expect(Object.keys(doc.months)).toHaveLength(12);
    // 7 rows; 1847,50 (CA1)
    expect(doc.months['03']).toMatchObject({ rowCount: 7 });
    expect(doc.months['03']!.amountSum).toBeCloseTo(1847.5, 9);
    expect(doc.months['01']).toMatchObject({ rowCount: 0, amountSum: 0, cells: [] });
  });

  it('CA6 — a row moved from March to April: both months rebuilt to the hand-worked figures', async () => {
    storeMarch();
    await rebuildExpenseTotals(UID, [{ year: 2025, month: 3 }], NOW);
    const moved = italy('2025-04-15T12:00:00');
    fake.set('expenses/r3', { ...fake.get('expenses/r3')!, date: Timestamp.fromDate(moved) });
    // The writer names the old date and the new one.
    await rebuildExpenseTotals(UID, [{ year: 2025, month: 3 }, { year: 2025, month: 4 }], NOW);
    const doc = yearDoc(2025)!;
    // March: 6 rows, 1847,50 + 79,60 = 1927,10, Supermercato −120,40 (1)
    expect(doc.months['03']!.rowCount).toBe(6);
    expect(doc.months['03']!.amountSum).toBeCloseTo(1927.1, 9);
    expect(doc.months['03']!.cells.find((c) => c.subCategoryId === 'super')).toMatchObject({ sum: -120.4, count: 1 });
    // April: Supermercato −79,60 (1)
    expect(doc.months['04']!.cells).toEqual([expect.objectContaining({ subCategoryId: 'super', sum: -79.6, count: 1 })]);
  });
});

describe('rebuildAllExpenseTotals', () => {
  it('writes every year from the oldest row to the running one and deletes a year left without rows', async () => {
    storeMarch();
    storeRow('old', { amount: -10, date: italy('2023-06-10T12:00:00') });
    fake.set(`expense-totals/${UID}_2021`, { userId: UID, year: 2021, schemaVersion: 1, months: {} });
    const result = await rebuildAllExpenseTotals(UID, NOW);
    expect(result).toMatchObject({ rowsRead: 8, years: [2023, 2024, 2025], deletedYears: [2021] });
    // 2023 holds only the 'old' row (−10 €, June); 2024 none; no year had a document before.
    expect(result.perYear.map((y) => [y.year, y.after.rowCount, y.monthsWithRows, y.before])).toEqual([
      [2023, 1, 1, null],
      [2024, 0, 0, null],
      [2025, 7, expect.any(Number), null],
    ]);
    expect(result.perYear[0].after.amountSum).toBe(-10);
    expect(yearDoc(2024)!.months['06']).toMatchObject({ rowCount: 0 });
    expect(yearDoc(2021)).toBeNull();
  });
});

describe('the nightly check', () => {
  it('CA7 — a March row deleted with the Admin, without asking: the year, then the month, is found and rebuilt', async () => {
    storeMarch();
    await rebuildAllExpenseTotals(UID, NOW);
    fake.docs.delete('expenses/r6');
    const first = await verifyExpenseTotals(UID, NOW);
    // count 6 against 7 → the twelve months measured → March rebuilt
    expect(first.report.mismatched).toEqual(['2025-03']);
    expect(yearDoc(2025)!.months['03']!.rowCount).toBe(6);
    const second = await verifyExpenseTotals(UID, italy('2025-05-21T19:00:00'));
    expect(second.report.mismatched).toEqual([]);
    expect(second.report.changed).toEqual([]);
  });

  it('rebuilds the closed month of a row edited since the last run, even when count and sum agree', async () => {
    storeMarch();
    await rebuildAllExpenseTotals(UID, NOW);
    await verifyExpenseTotals(UID, NOW);
    // r2 moved to another category: same count, same sum — only `updatedAt` says it changed.
    fake.set('expenses/r2', { ...fake.get('expenses/r2')!, categoryId: 'svago', categoryName: 'Svago', updatedAt: Timestamp.fromDate(italy('2025-05-21T10:00:00')) });
    const result = await verifyExpenseTotals(UID, italy('2025-05-21T19:00:00'));
    expect(result.report.changed).toEqual(['2025-03']);
    expect(yearDoc(2025)!.months['03']!.cells.some((c) => c.categoryId === 'svago')).toBe(true);
  });

  it('builds the years with rows and no document (the lazy migration, § 7.1)', async () => {
    storeMarch();
    storeRow('old', { amount: -10, date: italy('2023-06-10T12:00:00') });
    const result = await verifyExpenseTotals(UID, NOW);
    expect(result.report.missingYears).toEqual([2023, 2024]);
    expect(yearDoc(2023)!.months['06']).toMatchObject({ rowCount: 1 });
  });
});

describe('CA8 — the cron\'s reads for one account', () => {
  it('reads at most 160 documents for the totals and the Hall of Fame on five years of history, and ranks as the rows do', async () => {
    // Five years (2021–2025) of 80 rows a month = 4.800 rows, and the running month (June 2026) so far.
    const now = italy('2026-06-20T19:00:00');
    let n = 0;
    const rows: Array<{ id: string; amount: number; date: Date; type: string }> = [];
    const add = (amount: number, date: Date, type = 'variable') => {
      const id = `row-${++n}`;
      // Saved on its date, or — a row already in the calendar — at the start of the month.
      const savedAt = date < italy('2026-06-01T09:00:00') ? date : italy('2026-06-01T09:00:00');
      storeRow(id, { amount, date, type, categoryId: type === 'income' ? 'stipendio' : 'spesa', updatedAt: savedAt });
      rows.push({ id, amount, date, type });
    };
    for (let year = 2021; year <= 2026; year++) {
      for (let month = 1; month <= 12; month++) {
        if (year === 2026 && month > 6) break;
        const count = year === 2026 && month === 6 ? 40 : 80;
        add(2500, italy(`${year}-${pad(month)}-27T12:00:00`), 'income');
        for (let i = 1; i < count; i++) add(-(10 + ((i * 7 + month) % 50)), italy(`${year}-${pad(month)}-${pad(1 + (i % 18))}T12:00:00`));
      }
    }
    // 60 snapshots: June 2021 … May 2026
    const snapshots: MonthlySnapshot[] = [];
    for (let i = 0; i < 60; i++) {
      const year = 2021 + Math.floor((5 + i) / 12);
      const month = ((5 + i) % 12) + 1;
      const snap = { userId: UID, year, month, totalNetWorth: 100_000 + i * 1000 - (i % 7) * 900, createdAt: italy(`${year}-${pad(month)}-28T19:00:00`) };
      fake.set(`monthly-snapshots/${UID}-${year}-${month}`, snap);
      snapshots.push(snap as unknown as MonthlySnapshot);
    }

    // The state of the evening before: totals built, the check run.
    const yesterday = italy('2026-06-19T19:00:00');
    await rebuildAllExpenseTotals(UID, yesterday);
    fake.set(`expense-totals-meta/${UID}`, { userId: UID, lastVerifiedAt: Timestamp.fromDate(yesterday) });
    // Three rows of the running month edited today.
    for (const id of ['row-5210', 'row-5220', 'row-5230']) {
      expect(fake.get(`expenses/${id}`)?.userId).toBe(UID);
      fake.set(`expenses/${id}`, { ...fake.get(`expenses/${id}`)!, updatedAt: Timestamp.fromDate(italy('2026-06-20T10:00:00')) });
    }
    fake.clearLog();

    const verified = await verifyExpenseTotals(UID, now);
    await updateHallOfFame(UID, { verified });
    const documentReads = fake.reads.filter((path) => !path.startsWith('aggregate:') && path.includes('/'));
    const aggregations = fake.reads.filter((path) => path.startsWith('aggregate:'));
    // 6 year docs + 2 bounds + 40 running-month rows + 1 meta + 3 changed rows + 60 snapshots
    // + 1 Hall of Fame document = 113 documents, and 6 aggregations (one per year, 1 read each) ≤ 160
    expect(documentReads.length + aggregations.length).toBeLessThanOrEqual(160);
    expect(documentReads.length).toBe(113);
    expect(aggregations).toHaveLength(6);

    // The rankings are those of the rows.
    const expenses = rows.map((r) => ({ ...r, userId: UID, categoryId: r.type === 'income' ? 'stipendio' : 'spesa', categoryName: 'x', currency: 'EUR', createdAt: r.date, updatedAt: r.date }) as unknown as Expense);
    const expected = buildHallOfFameRankings(calculateMonthlyRecords(snapshots, expenses), calculateYearlyRecords(snapshots, expenses));
    const stored = fake.get(`hall-of-fame/${UID}`)!;
    expect(stored.bestMonthsBySavings).toEqual(expected.bestMonthsBySavings!.map((r) => expect.objectContaining({ year: r.year, month: r.month })));
    for (const [a, b] of (stored.worstYearsByExpenses as Array<{ totalExpenses: number }>).map((r, i) => [r.totalExpenses, expected.worstYearsByExpenses![i].totalExpenses])) {
      expect(Math.abs(a - b)).toBeLessThanOrEqual(0.005);
    }
  });
});
