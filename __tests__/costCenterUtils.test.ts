import { describe, it, expect } from 'vitest';
import { Expense } from '@/types/expenses';
import {
  filterExpensesByPeriod,
  computeCenterStats,
  rankCentersBySpend,
  projectAnnualCost,
  evaluateCenterBudget,
  buildCategoryComposition,
  buildSubCategoryComposition,
  splitRecurringVsOneOff,
  buildMonthlySeriesByCategory,
  buildComparisonSeries,
  getLifecycleStatus,
  computePeriodComparison,
  resolveLastActivityDate,
  DORMANT_THRESHOLD_DAYS,
} from '@/lib/utils/costCenterUtils';

// --- Fixtures ---------------------------------------------------------------

// Minimal expense factory. Expenses are stored negative (outgoing); the pure layer
// flips them to positive costs. `date` is a local Date; tests pin `now` explicitly.
function expense(partial: Partial<Expense> & { date: Date; amount: number }): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    type: 'variable',
    categoryId: 'c1',
    categoryName: 'Carburante',
    currency: 'EUR',
    createdAt: partial.date,
    updatedAt: partial.date,
    ...partial,
  };
}

// 2025-06-15 in Italy (summer = UTC+2). Use a fixed reference for determinism.
const NOW = new Date('2025-06-15T10:00:00+02:00');

describe('filterExpensesByPeriod', () => {
  const expenses = [
    expense({ date: new Date('2024-03-10T12:00:00+01:00'), amount: -100 }), // last year
    expense({ date: new Date('2025-01-20T12:00:00+01:00'), amount: -200 }), // this year, >12mo? no, within rolling12
    expense({ date: new Date('2025-06-05T12:00:00+02:00'), amount: -300 }), // this month
    expense({ date: new Date('2024-06-30T12:00:00+02:00'), amount: -50 }),  // 13 months back → out of rolling12
  ];

  it('returns only current-month expenses for month', () => {
    const out = filterExpensesByPeriod(expenses, 'month', NOW);
    expect(out.map((e) => e.amount)).toEqual([-300]);
  });

  it('returns only current-year expenses for year', () => {
    const out = filterExpensesByPeriod(expenses, 'year', NOW);
    expect(out.map((e) => e.amount).sort()).toEqual([-300, -200].sort());
  });

  it('includes the trailing 12 calendar months for rolling12', () => {
    const out = filterExpensesByPeriod(expenses, 'rolling12', NOW);
    // Window is Jul 2024 → Jun 2025 (12 months ending on the current month).
    // 2024-06 and 2024-03 both fall before the lower bound and are excluded.
    expect(out.map((e) => e.amount).sort()).toEqual([-300, -200].sort());
  });

  it('returns everything for all', () => {
    expect(filterExpensesByPeriod(expenses, 'all', NOW)).toHaveLength(4);
  });
});

describe('computeCenterStats', () => {
  it('returns zeros for an empty list', () => {
    const stats = computeCenterStats([], 'all', NOW);
    expect(stats).toEqual({
      totalSpent: 0,
      transactionCount: 0,
      averageMonthly: 0,
      firstActivityDate: null,
      lastActivityDate: null,
    });
  });

  it('sums absolute amounts and divides by elapsed months in the year window', () => {
    const expenses = [
      expense({ date: new Date('2025-02-10T12:00:00+01:00'), amount: -600 }),
      expense({ date: new Date('2025-05-10T12:00:00+02:00'), amount: -600 }),
    ];
    const stats = computeCenterStats(expenses, 'year', NOW);
    expect(stats.totalSpent).toBe(1200);
    expect(stats.transactionCount).toBe(2);
    // June = month 6 elapsed → 1200 / 6 = 200
    expect(stats.averageMonthly).toBe(200);
  });

  it('uses true monthly average (calendar months, not active months) for sporadic spend', () => {
    // Two purchases 6 months apart in the same year: average must reflect 6 elapsed months.
    const expenses = [
      expense({ date: new Date('2025-01-01T12:00:00+01:00'), amount: -300 }),
      expense({ date: new Date('2025-06-01T12:00:00+02:00'), amount: -300 }),
    ];
    const stats = computeCenterStats(expenses, 'year', NOW);
    expect(stats.averageMonthly).toBe(100); // 600 / 6, not 600 / 2
  });
});

describe('rankCentersBySpend', () => {
  it('orders rows by totalSpent descending without mutating the input', () => {
    const rows = [{ totalSpent: 50 }, { totalSpent: 300 }, { totalSpent: 120 }];
    const ranked = rankCentersBySpend(rows);
    expect(ranked.map((r) => r.totalSpent)).toEqual([300, 120, 50]);
    expect(rows.map((r) => r.totalSpent)).toEqual([50, 300, 120]); // untouched
  });
});

describe('projectAnnualCost', () => {
  it('projects from the YTD pace when there is no prior-year history', () => {
    // Spent 600 over ~166 days → daily pace ~3.61 → ×365 ≈ 1320
    const expenses = [expense({ date: new Date('2025-03-01T12:00:00+01:00'), amount: -600 })];
    const fc = projectAnnualCost(expenses, NOW);
    expect(fc.spentYtd).toBe(600);
    expect(fc.projectedTotal).toBeGreaterThan(600);
    expect(fc.yearProgress).toBeGreaterThan(0);
    expect(fc.yearProgress).toBeLessThan(1);
  });

  it('blends toward the prior-year total early in the year', () => {
    const expenses = [
      // Prior year: 1200 total
      expense({ date: new Date('2024-04-01T12:00:00+02:00'), amount: -1200 }),
      // This year: one small early purchase
      expense({ date: new Date('2025-01-05T12:00:00+01:00'), amount: -100 }),
    ];
    // Early January reference: blended projection should sit between the naive YTD
    // extrapolation and stay anchored near the prior-year pace.
    const earlyNow = new Date('2025-01-10T10:00:00+01:00');
    const fc = projectAnnualCost(expenses, earlyNow);
    expect(fc.spentYtd).toBe(100);
    // Pulled up toward the ~1200 prior-year pace rather than the runaway YTD extrapolation.
    expect(fc.projectedTotal).toBeGreaterThan(900);
    expect(fc.projectedTotal).toBeLessThan(1500);
  });
});

describe('evaluateCenterBudget', () => {
  const expenses = [
    expense({ date: new Date('2025-06-05T12:00:00+02:00'), amount: -800 }),
    expense({ date: new Date('2025-02-05T12:00:00+01:00'), amount: -400 }),
  ];

  it('returns null when no budget is set', () => {
    expect(evaluateCenterBudget({}, expenses, NOW)).toBeNull();
    expect(evaluateCenterBudget({ budgetAmount: 0, budgetPeriod: 'annual' }, expenses, NOW)).toBeNull();
  });

  it('measures a monthly ceiling against the current month', () => {
    const v = evaluateCenterBudget({ budgetAmount: 1000, budgetPeriod: 'monthly' }, expenses, NOW)!;
    expect(v.spent).toBe(800); // only June
    expect(v.ratio).toBeCloseTo(0.8);
    expect(v.status).toBe('ok');
  });

  it('measures an annual ceiling against the year-to-date and flags overruns', () => {
    const v = evaluateCenterBudget({ budgetAmount: 1000, budgetPeriod: 'annual' }, expenses, NOW)!;
    expect(v.spent).toBe(1200); // June + February
    expect(v.status).toBe('over');
    expect(v.remaining).toBe(-200);
  });

  it('flags warning at >=90%', () => {
    const v = evaluateCenterBudget({ budgetAmount: 850, budgetPeriod: 'monthly' }, expenses, NOW)!;
    expect(v.status).toBe('warning');
  });
});

describe('buildCategoryComposition', () => {
  it('collapses categories past the cap into Altro and sorts by amount', () => {
    // Distinct ids: grouping is by category id, and distinct categories always
    // have distinct documents in real data.
    const expenses = [
      expense({ date: NOW, amount: -100, categoryId: 'c-carb', categoryName: 'Carburante' }),
      expense({ date: NOW, amount: -50, categoryId: 'c-assi', categoryName: 'Assicurazione' }),
      expense({ date: NOW, amount: -30, categoryId: 'c-manu', categoryName: 'Manutenzione' }),
      expense({ date: NOW, amount: -20, categoryId: 'c-boll', categoryName: 'Bollo' }),
      expense({ date: NOW, amount: -10, categoryId: 'c-peda', categoryName: 'Pedaggi' }),
      expense({ date: NOW, amount: -5, categoryId: 'c-mult', categoryName: 'Multe' }), // 6th → Altro
    ];
    const comp = buildCategoryComposition(expenses);
    expect(comp[0].categoryName).toBe('Carburante');
    expect(comp[comp.length - 1].categoryName).toBe('Altro');
    expect(comp[comp.length - 1].total).toBe(5);
    const totalPct = comp.reduce((s, c) => s + c.pct, 0);
    expect(totalPct).toBeCloseTo(1);
  });
  it('keeps two same-named categories apart, qualifying their labels', () => {
    // "Casa" exists twice (fixed and variable): two slices, never one merged bucket.
    const expenses = [
      expense({ date: NOW, amount: -300, categoryId: 'c-fix', categoryName: 'Casa', type: 'fixed' }),
      expense({ date: NOW, amount: -100, categoryId: 'c-var', categoryName: 'Casa', type: 'variable' }),
    ];
    const comp = buildCategoryComposition(expenses);
    expect(comp).toHaveLength(2);
    expect(comp[0]).toMatchObject({ key: 'c-fix', categoryName: 'Casa (Spese Fisse)', total: 300 });
    expect(comp[1]).toMatchObject({ key: 'c-var', categoryName: 'Casa (Spese Variabili)', total: 100 });
  });
});

describe('buildSubCategoryComposition', () => {
  it('aggregates by subcategory id and sorts by amount descending', () => {
    const expenses = [
      expense({ date: NOW, amount: -50, subCategoryId: 's1', subCategoryName: 'Benzina' }),
      expense({ date: NOW, amount: -130, subCategoryId: 's1', subCategoryName: 'Benzina' }),
      expense({ date: NOW, amount: -120, subCategoryId: 's2', subCategoryName: 'Manutenzione' }),
    ];
    const comp = buildSubCategoryComposition(expenses);
    expect(comp).toHaveLength(2);
    expect(comp[0]).toMatchObject({ key: 's1', subCategoryName: 'Benzina', total: 180, transactionCount: 2 });
    expect(comp[1]).toMatchObject({ key: 's2', subCategoryName: 'Manutenzione', total: 120 });
  });

  it('keys by id so same-named subcategories under different categories stay distinct', () => {
    const expenses = [
      expense({ date: NOW, amount: -40, categoryName: 'Auto', subCategoryId: 's1', subCategoryName: 'Varie' }),
      expense({ date: NOW, amount: -60, categoryName: 'Casa', subCategoryId: 's2', subCategoryName: 'Varie' }),
    ];
    const comp = buildSubCategoryComposition(expenses);
    expect(comp).toHaveLength(2);
    expect(comp.map((s) => s.categoryName).sort()).toEqual(['Auto', 'Casa']);
  });

  it('collapses expenses without a subcategory into a single "Senza sottocategoria" slice', () => {
    const expenses = [
      expense({ date: NOW, amount: -30, subCategoryName: undefined }),
      expense({ date: NOW, amount: -20, subCategoryName: undefined }),
    ];
    const comp = buildSubCategoryComposition(expenses);
    expect(comp).toHaveLength(1);
    expect(comp[0]).toMatchObject({ subCategoryName: 'Senza sottocategoria', total: 50, transactionCount: 2 });
  });

  it('returns an empty array for no expenses', () => {
    expect(buildSubCategoryComposition([])).toEqual([]);
  });
});

describe('splitRecurringVsOneOff', () => {
  it('treats recurring and installment as fixed cost', () => {
    const expenses = [
      expense({ date: NOW, amount: -100, isRecurring: true }),
      expense({ date: NOW, amount: -200, isInstallment: true }),
      expense({ date: NOW, amount: -300 }),
    ];
    const split = splitRecurringVsOneOff(expenses);
    expect(split.recurring).toBe(300);
    expect(split.oneOff).toBe(300);
    expect(split.recurringPct).toBeCloseTo(0.5);
  });
});

describe('buildMonthlySeriesByCategory', () => {
  it('ranks categories over the trimmed window, not over full history', () => {
    // "Ristrutturazione" dominates all time but is absent from the last 2 months; ranking
    // by full history handed it a band on a chart where it never appears, and pushed the
    // category that actually fills those months into "Altro".
    const expenses = [
      expense({ date: new Date('2020-01-10T12:00:00+01:00'), amount: -90000, categoryName: 'Ristrutturazione' }),
      expense({ date: new Date('2025-05-10T12:00:00+02:00'), amount: -100, categoryName: 'Carburante' }),
      expense({ date: new Date('2025-06-10T12:00:00+02:00'), amount: -120, categoryName: 'Carburante' }),
    ];
    const series = buildMonthlySeriesByCategory(expenses, 2);
    expect(series.buckets).toHaveLength(2);
    expect(series.categories).toEqual(['Carburante']);
    expect(series.categories).not.toContain('Ristrutturazione');
  });

  it('produces a gap-free month axis with stacked category values', () => {
    const expenses = [
      expense({ date: new Date('2025-01-10T12:00:00+01:00'), amount: -100, categoryName: 'Carburante' }),
      // February intentionally skipped → must still appear as an empty bucket
      expense({ date: new Date('2025-03-10T12:00:00+01:00'), amount: -50, categoryName: 'Assicurazione' }),
    ];
    const series = buildMonthlySeriesByCategory(expenses);
    expect(series.buckets).toHaveLength(3); // Jan, Feb, Mar
    expect(series.buckets[1].total).toBe(0); // February gap filled
    expect(series.categories).toContain('Carburante');
    expect(series.buckets[0].byCategory['Carburante']).toBe(100);
  });

  it('keeps only the most recent N months when maxMonths is given', () => {
    const expenses = Array.from({ length: 6 }, (_, i) =>
      expense({ date: new Date(2025, i, 10), amount: -10 }),
    );
    const series = buildMonthlySeriesByCategory(expenses, 3);
    expect(series.buckets).toHaveLength(3);
  });
});

describe('buildComparisonSeries', () => {
  it('keeps the top centers by spend and aligns them on a shared month axis', () => {
    const centers = [
      {
        id: 'a',
        name: 'Auto',
        expenses: [
          expense({ date: new Date('2025-01-10T12:00:00+01:00'), amount: -100 }),
          expense({ date: new Date('2025-02-10T12:00:00+01:00'), amount: -100 }),
        ],
      },
      {
        id: 'b',
        name: 'Casa',
        expenses: [expense({ date: new Date('2025-02-10T12:00:00+01:00'), amount: -500 })],
      },
    ];
    const series = buildComparisonSeries(centers, 'year', NOW);
    expect(series.centers.map((c) => c.id)).toEqual(['b', 'a']); // ranked by total
    expect(series.buckets).toHaveLength(2); // Jan + Feb union
    expect(series.buckets[0].byCenter['b']).toBe(0); // Casa has no January
    expect(series.buckets[1].byCenter['b']).toBe(500);
  });

  it('returns empty series when there is no spend', () => {
    expect(buildComparisonSeries([], 'all', NOW)).toEqual({ buckets: [], centers: [] });
  });
});

describe('computePeriodComparison', () => {
  it('computes a signed delta vs the previous year', () => {
    const expenses = [
      expense({ date: new Date('2024-03-10T12:00:00+01:00'), amount: -400 }), // prev year
      expense({ date: new Date('2025-03-10T12:00:00+01:00'), amount: -600 }), // this year
    ];
    const cmp = computePeriodComparison(expenses, 'year', NOW);
    expect(cmp.current).toBe(600);
    expect(cmp.previous).toBe(400);
    expect(cmp.deltaPct).toBeCloseTo(0.5); // +50%
  });

  it('returns null delta when there is no predecessor data or for the all period', () => {
    const expenses = [expense({ date: new Date('2025-03-10T12:00:00+01:00'), amount: -600 })];
    expect(computePeriodComparison(expenses, 'year', NOW).deltaPct).toBeNull();
    expect(computePeriodComparison(expenses, 'all', NOW).deltaPct).toBeNull();
  });

  it('truncates the previous month to the same day, so a partial month is not read as a collapse', () => {
    // NOW is the 15th. Spending is identical day-for-day in both months up to the 15th;
    // the previous month then keeps going. Comparing the partial current window against
    // the complete previous one reported -67% purely because the month had not finished.
    const expenses = [
      expense({ date: new Date('2025-05-05T12:00:00+02:00'), amount: -100 }),
      expense({ date: new Date('2025-05-25T12:00:00+02:00'), amount: -200 }), // after the 15th
      expense({ date: new Date('2025-06-05T12:00:00+02:00'), amount: -100 }),
    ];
    const cmp = computePeriodComparison(expenses, 'month', NOW);
    expect(cmp.current).toBe(100);
    expect(cmp.previous).toBe(100); // NOT 300
    expect(cmp.deltaPct).toBe(0);
  });

  it('truncates the previous year to the same day of year', () => {
    const expenses = [
      expense({ date: new Date('2024-02-10T12:00:00+01:00'), amount: -400 }),
      expense({ date: new Date('2024-11-10T12:00:00+01:00'), amount: -900 }), // past 15 June
      expense({ date: new Date('2025-02-10T12:00:00+01:00'), amount: -600 }),
    ];
    const cmp = computePeriodComparison(expenses, 'year', NOW);
    expect(cmp.current).toBe(600);
    expect(cmp.previous).toBe(400); // NOT 1300
    expect(cmp.deltaPct).toBeCloseTo(0.5);
  });

  it('keeps the completed months of a rolling12 predecessor and truncates only its trailing one', () => {
    const expenses = [
      // Predecessor window (Jul 2023 → Jun 2024): a completed month stays whole...
      expense({ date: new Date('2023-09-28T12:00:00+02:00'), amount: -50 }),
      // ...while its trailing month (Jun 2024) is cut at the 15th.
      expense({ date: new Date('2024-06-10T12:00:00+02:00'), amount: -70 }),
      expense({ date: new Date('2024-06-25T12:00:00+02:00'), amount: -500 }),
      expense({ date: new Date('2025-01-10T12:00:00+01:00'), amount: -120 }),
    ];
    const cmp = computePeriodComparison(expenses, 'rolling12', NOW);
    expect(cmp.previous).toBe(120); // 50 + 70, not 620
    expect(cmp.current).toBe(120);
  });

  it('does not leak the day after the anniversary into the previous year (DST off-by-one)', () => {
    // Dates built the way ExpenseDialog builds them: LOCAL midnight, not noon-with-offset.
    // Every other fixture in this file sits at 12:00, which is twelve hours clear of the DST
    // edge — so the day-of-year drift that this guards against could never surface.
    const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`);
    const now = localMidnight('2026-06-15');
    const expenses = [
      expense({ date: localMidnight('2025-06-14'), amount: -10 }), // before the anniversary
      expense({ date: localMidnight('2025-06-16'), amount: -10 }), // after → must NOT count
      expense({ date: localMidnight('2026-06-02'), amount: -10 }),
    ];
    const cmp = computePeriodComparison(expenses, 'year', now);
    expect(cmp.previous).toBe(10);
    expect(cmp.current).toBe(10);
  });

  it('clamps to the last day of a shorter previous month', () => {
    // 31 March → the predecessor is February, which has no 31st.
    const march31 = new Date('2025-03-31T12:00:00+02:00');
    const expenses = [
      expense({ date: new Date('2025-02-28T12:00:00+01:00'), amount: -80 }),
      expense({ date: new Date('2025-03-02T12:00:00+01:00'), amount: -40 }),
    ];
    const cmp = computePeriodComparison(expenses, 'month', march31);
    expect(cmp.previous).toBe(80);
    expect(cmp.current).toBe(40);
  });
});

describe('getLifecycleStatus', () => {
  it('reports archived when archivedAt is set', () => {
    expect(getLifecycleStatus({ archivedAt: NOW }, NOW, NOW)).toBe('archived');
  });

  it('reports dormant with no activity or stale activity', () => {
    expect(getLifecycleStatus({}, null, NOW)).toBe('dormant');
    const stale = new Date(NOW.getTime() - (DORMANT_THRESHOLD_DAYS + 5) * 86_400_000);
    expect(getLifecycleStatus({}, stale, NOW)).toBe('dormant');
  });

  it('reports active for recent activity', () => {
    const recent = new Date(NOW.getTime() - 5 * 86_400_000);
    expect(getLifecycleStatus({}, recent, NOW)).toBe('active');
  });
});

describe('resolveLastActivityDate', () => {
  it('returns null with no expenses', () => {
    expect(resolveLastActivityDate([])).toBeNull();
  });

  it('returns the most recent date regardless of input order', () => {
    const expenses = [
      expense({ date: new Date('2025-01-20T12:00:00+01:00'), amount: -200 }),
      expense({ date: new Date('2025-06-05T12:00:00+02:00'), amount: -300 }),
      expense({ date: new Date('2024-03-10T12:00:00+01:00'), amount: -100 }),
    ];
    expect(resolveLastActivityDate(expenses)?.toISOString()).toBe(
      new Date('2025-06-05T12:00:00+02:00').toISOString(),
    );
  });

  it('keeps a center active when the selected period happens to be empty', () => {
    // The regression this function exists for: the center last spent 35 days ago — well
    // inside the dormancy threshold — but nothing landed in the current calendar month.
    // Reading the period-scoped stats made getLifecycleStatus see null and report 'dormant',
    // so the badge tracked the axis instead of the center.
    const lastSpend = new Date(NOW.getTime() - 35 * 86_400_000);
    const expenses = [expense({ date: lastSpend, amount: -120 })];

    const periodScoped = computeCenterStats(expenses, 'month', NOW);
    expect(periodScoped.lastActivityDate).toBeNull();
    expect(getLifecycleStatus({}, periodScoped.lastActivityDate, NOW)).toBe('dormant');

    expect(getLifecycleStatus({}, resolveLastActivityDate(expenses), NOW)).toBe('active');
  });
});
