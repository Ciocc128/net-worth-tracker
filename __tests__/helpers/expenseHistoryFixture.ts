/**
 * The invented history of the monthly totals' invariance tests (doc/totali-mensili/README.md § 13,
 * CA5): five years and a quarter of ~80 rows a month, a recurring instalment in the calendar until
 * 2030, refunds, rows without `type`, transfers, trade fees and dividends — invented and round
 * (WORKFLOW.md rule 7). Shared by Fase A (`expenseTotalsInvariance.test.ts`) and Fase B
 * (`analisiExpensesInvariance.test.ts`).
 */
import { expect } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import type { Expense, ExpenseType } from '@/types/expenses';
import type { MonthlySnapshot } from '@/types/assets';
import type { ExpenseTotalsYear } from '@/types/expenseTotals';
import { buildYearTotals, type ExpenseFlowSource } from '@/lib/utils/expenseTotals';

export const italy = (iso: string) => fromZonedTime(iso, 'Europe/Rome');
export const pad = (n: number) => String(n).padStart(2, '0');

// ─── The invented history ──────────────────────────────────────────────────

/** A small deterministic generator (mulberry32): the same history on every run. */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CATEGORIES: Array<{ id: string; name: string; type: ExpenseType; subs: string[] }> = [
  { id: 'stipendio', name: 'Stipendio', type: 'income', subs: ['', 'tredicesima'] },
  { id: 'regali', name: 'Regali', type: 'income', subs: [''] },
  { id: 'dividendi', name: 'Dividendi', type: 'income', subs: [''] },
  { id: 'spesa', name: 'Spesa', type: 'variable', subs: ['super', 'mercato', ''] },
  { id: 'svago', name: 'Svago', type: 'variable', subs: ['cinema', ''] },
  { id: 'casa', name: 'Casa', type: 'fixed', subs: ['affitto', 'bollette'] },
  { id: 'mutuo', name: 'Mutuo', type: 'debt', subs: [''] },
  { id: 'giroconto', name: 'Giroconto', type: 'transfer', subs: [''] },
];

export function history(): Expense[] {
  const random = rng(42);
  const rows: Expense[] = [];
  let n = 0;
  const push = (date: Date, cat: (typeof CATEGORIES)[number], amount: number, extra: Partial<Expense> = {}) => {
    const sub = cat.subs[Math.floor(random() * cat.subs.length)];
    rows.push({
      id: `row-${++n}`,
      userId: 'owner',
      type: cat.type,
      categoryId: cat.id,
      categoryName: cat.name,
      ...(sub ? { subCategoryId: sub, subCategoryName: sub.toUpperCase() } : {}),
      amount,
      currency: 'EUR',
      date,
      createdAt: date,
      updatedAt: date,
      ...extra,
    } as Expense);
  };
  for (let year = 2021; year <= 2026; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 2026 && month > 4) break;
      const day = (d: number, h = 12) => italy(`${year}-${pad(month)}-${pad(Math.min(d, 28))}T${pad(h)}:00:00`);
      push(day(27), CATEGORIES[0], 2500);
      if (month === 12) push(day(20), CATEGORIES[0], 1250);
      if (random() < 0.2) push(day(5 + Math.floor(random() * 20)), CATEGORIES[1], 50 * Math.ceil(random() * 4));
      push(day(10), CATEGORIES[2], 12.34 + month);
      push(day(1), CATEGORIES[5], -800);
      for (let i = 0; i < 70; i++) {
        const cat = CATEGORIES[3 + Math.floor(random() * 2)];
        const refund = random() < 0.05;
        push(day(1 + Math.floor(random() * 28), 8 + Math.floor(random() * 12)), cat, (refund ? 1 : -1) * Math.round(random() * 9000) / 100);
      }
      push(day(15), CATEGORIES[7], 300);
      if (random() < 0.5) push(day(12), CATEGORIES[3], -2.5, { feeOfTradeId: `trade-${year}-${month}` });
      if (random() < 0.1) push(day(14), { ...CATEGORIES[4], type: undefined as unknown as ExpenseType }, -40);
    }
  }
  // A recurring instalment in the calendar until December 2030.
  for (let year = 2024; year <= 2030; year++) {
    for (let month = 1; month <= 12; month++) push(italy(`${year}-${pad(month)}-05T12:00:00`), CATEGORIES[6], -600, { isRecurring: true, recurringParentId: 'mutuo-1', createdAt: italy('2024-01-02T12:00:00'), updatedAt: italy('2024-01-02T12:00:00') });
  }
  return rows;
}

export const ROWS = history();

export const snapshotsUntil = (last: { year: number; month: number }): MonthlySnapshot[] => {
  const out: MonthlySnapshot[] = [];
  let value = 50_000;
  for (let year = 2021; year <= last.year; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === last.year && month > last.month) break;
      value += 1000 + ((year * 7 + month * 13) % 9) * 250 - 1000;
      out.push({
        id: `owner-${year}-${month}`,
        userId: 'owner',
        year,
        month,
        totalNetWorth: value,
        liquidNetWorth: value,
        illiquidNetWorth: 0,
        byAsset: [],
        createdAt: italy(`${year}-${pad(month)}-28T19:00:00`),
      } as unknown as MonthlySnapshot);
    }
  }
  return out;
};

/** The year documents as the cron leaves them at `builtAt`, from the rows saved by then. */
export function totalsAt(rows: Expense[], builtAt: Date): ExpenseTotalsYear[] {
  const saved = rows.filter((r) => r.createdAt <= builtAt);
  const years = [...new Set(saved.map((r) => Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Rome', year: 'numeric' }).format(r.date))))];
  return years.map((year) => buildYearTotals('owner', year, saved, builtAt));
}

export function sourceOf(rows: Expense[], years: ExpenseTotalsYear[]): ExpenseFlowSource {
  return {
    readBounds: async () => {
      if (rows.length === 0) return null;
      const times = rows.map((r) => r.date.getTime());
      return { oldest: new Date(Math.min(...times)), newest: new Date(Math.max(...times)) };
    },
    readYears: async (wanted) => years.filter((y) => wanted.includes(y.year)),
    readRows: async (from, to) => rows.filter((r) => r.date >= from && r.date <= to),
    readCategoryRows: async (categoryId) => rows.filter((r) => r.categoryId === categoryId),
  };
}

// ─── Comparing ─────────────────────────────────────────────────────────────

/** Deep equality with numbers within half a cent (D-TM1) and arrays of named rows in any order. */
export function expectSame(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected)) return expect(Number.isNaN(actual), path).toBe(true);
    expect(Math.abs(actual - expected), `${path}: ${actual} vs ${expected}`).toBeLessThanOrEqual(0.005);
    return;
  }
  if (expected instanceof Date) {
    expect(actual instanceof Date && actual.getTime(), path).toBe(expected.getTime());
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const a = actual as unknown[];
    expect(a.length, `${path}.length`).toBe(expected.length);
    const keyed = (list: unknown[]) =>
      list.every((x) => x && typeof x === 'object' && ('categoryId' in x || 'subCategoryId' in x))
        ? [...list].sort((x, y) => JSON.stringify([(x as Record<string, unknown>).categoryId, (x as Record<string, unknown>).subCategoryId]).localeCompare(JSON.stringify([(y as Record<string, unknown>).categoryId, (y as Record<string, unknown>).subCategoryId])))
        : list;
    const [sa, se] = [keyed(a), keyed(expected)];
    se.forEach((item, i) => expectSame(sa[i], item, `${path}[${i}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    expect(actual && typeof actual === 'object', path).toBe(true);
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual as object)]);
    for (const key of keys) expectSame((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    return;
  }
  expect(actual, path).toEqual(expected);
}

