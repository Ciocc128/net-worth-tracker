/**
 * Baseline della finestra di misura — spec 10 fase 1 (finding A1, A2, A3, A10).
 *
 * Il primo snapshot di un periodo è SEMPRE la valutazione di partenza, mai un mese misurato: la
 * misura si apre il mese dopo. Questa suite fissa le conseguenze di quella regola unica:
 *   - i cash flow del primo mese non vengono contati due volte (sono già dentro `startNW`);
 *   - n snapshot producono n−1 rendimenti mensili, annualizzati su n−1 mesi;
 *   - `resolveHasBaseline` distingue una baseline pre-periodo dal primo mese di storia dell'utente
 *     guardando i dati, non il tipo di periodo;
 *   - la pagina riseleziona ESATTAMENTE la finestra che il service ha misurato.
 *
 * Le scadenze temporali sono deterministiche (`vi.setSystemTime`), e le serie crescono di un 1%
 * mensile esatto: qualunque periodo di quella serie deve annualizzare a 1,01¹² − 1 = 12,6825%,
 * indipendentemente da quanti mesi dura. È il modo più diretto per vedere un off-by-one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firebase-dependent modules to prevent initialization errors in tests
vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/assetAllocationService', () => ({}));

import {
  calculatePerformanceForPeriod,
  getSnapshotsForPeriod,
  preparePerformanceChartData,
  prepareMonthlyReturnsHeatmap,
  prepareUnderwaterDrawdownData,
  resolveNominalPeriodStart,
  selectSnapshotsForMetrics,
} from '@/lib/services/performanceService';
import { resolveHasBaseline } from '@/lib/utils/performanceBase';
import type { MonthlySnapshot } from '@/types/assets';
import type { Expense, ExpenseType } from '@/types/expenses';

const USER = 'user-1';
const RISK_FREE = 2.5;

/** Rendimento annualizzato di una serie che cresce dell'1% al mese, in percentuale. */
const ANNUALIZED_1_PCT = (Math.pow(1.01, 12) - 1) * 100; // 12.6825%

function snapshot(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return { year, month, totalNetWorth, isDummy: false } as MonthlySnapshot;
}

/**
 * `count` mesi consecutivi a partire da (year, month), ciascuno +1% sul precedente.
 * Il primo vale `first`, così i valori attesi restano calcolabili a mano: first × 1.01^k.
 */
function monthlySeries(year: number, month: number, count: number, first = 100000): MonthlySnapshot[] {
  return Array.from({ length: count }, (_, k) => {
    const date = new Date(year, month - 1 + k, 1);
    return snapshot(date.getFullYear(), date.getMonth() + 1, first * Math.pow(1.01, k));
  });
}

function expense(year: number, month: number, type: ExpenseType, amount: number): Expense {
  return {
    id: `exp-${year}-${month}-${type}-${amount}`,
    userId: USER,
    type,
    categoryId: 'cat-salary',
    categoryName: 'Stipendio',
    amount,
    currency: 'EUR',
    date: new Date(year, month - 1, 15),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Expense;
}

/** Le metriche di un periodo, sempre con spese pre-fetchate (nessun accesso a Firestore). */
function metricsFor(
  snapshots: MonthlySnapshot[],
  timePeriod: 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL' | 'CUSTOM',
  expenses: Expense[] = [],
  customStart?: Date,
  customEnd?: Date
) {
  return calculatePerformanceForPeriod(
    USER,
    snapshots,
    timePeriod,
    RISK_FREE,
    customStart,
    customEnd,
    expenses,
    undefined
  );
}

// ─── resolveHasBaseline ───

describe('resolveHasBaseline', () => {
  const jan2026 = { year: 2026, month: 1 };

  it('riconosce la baseline: il primo snapshot precede il periodo', () => {
    expect(resolveHasBaseline([snapshot(2025, 12, 1), snapshot(2026, 1, 1)], jan2026)).toBe(true);
  });

  it('nega la baseline quando il primo snapshot è dentro il periodo', () => {
    // Uno YTD senza lo snapshot di dicembre: gennaio è il primo mese, non una baseline.
    expect(resolveHasBaseline([snapshot(2026, 1, 1), snapshot(2026, 2, 1)], jan2026)).toBe(false);
  });

  it('nega la baseline quando lo storico è più corto della finestra', () => {
    // 3Y chiesto nel 2026 su una storia che inizia nel 2025: il primo mese reale non è una baseline.
    expect(resolveHasBaseline([snapshot(2025, 2, 1)], { year: 2023, month: 4 })).toBe(false);
  });

  it('non guarda l ordine di input: conta il più vecchio', () => {
    const unordered = [snapshot(2026, 2, 1), snapshot(2025, 12, 1), snapshot(2026, 1, 1)];
    expect(resolveHasBaseline(unordered, jan2026)).toBe(true);
  });

  it('senza inizio nominale (ALL) non c e baseline', () => {
    expect(resolveHasBaseline([snapshot(2020, 1, 1), snapshot(2020, 2, 1)], null)).toBe(false);
    expect(resolveHasBaseline([snapshot(2020, 1, 1)], undefined)).toBe(false);
  });

  it('senza snapshot non c e baseline', () => {
    expect(resolveHasBaseline([], jan2026)).toBe(false);
  });
});

// ─── resolveNominalPeriodStart ───

describe('resolveNominalPeriodStart', () => {
  const now = new Date(2026, 1, 15); // 15 feb 2026

  it('YTD parte da gennaio dell anno corrente', () => {
    expect(resolveNominalPeriodStart('YTD', undefined, now)).toEqual({ year: 2026, month: 1 });
  });

  it('1Y copre 12 mesi di rendimenti fino al mese corrente', () => {
    // Feb 2026 incluso → si parte da marzo 2025 (12 mesi), non da febbraio 2025 (che è la baseline).
    expect(resolveNominalPeriodStart('1Y', undefined, now)).toEqual({ year: 2025, month: 3 });
  });

  it('3Y e 5Y coprono 36 e 60 mesi', () => {
    expect(resolveNominalPeriodStart('3Y', undefined, now)).toEqual({ year: 2023, month: 3 });
    expect(resolveNominalPeriodStart('5Y', undefined, now)).toEqual({ year: 2021, month: 3 });
  });

  it('CUSTOM usa il mese scelto, ALL non ha inizio nominale', () => {
    expect(resolveNominalPeriodStart('CUSTOM', new Date(2024, 5, 10), now)).toEqual({ year: 2024, month: 6 });
    expect(resolveNominalPeriodStart('ALL', undefined, now)).toBeNull();
    expect(resolveNominalPeriodStart('CUSTOM', undefined, now)).toBeNull();
  });

  it('l inizio nominale è sempre un mese dopo il limite inferiore della finestra', () => {
    // La finestra include un mese di baseline: è l invariante che lega le due funzioni.
    const dense = monthlySeries(2020, 1, 80);
    for (const period of ['YTD', '1Y', '3Y', '5Y'] as const) {
      const nominal = resolveNominalPeriodStart(period, undefined, now)!;
      const window = getSnapshotsForPeriod(dense, period, undefined, undefined, now);
      const expectedBaseline = new Date(nominal.year, nominal.month - 2, 1);
      expect(`${window[0].year}-${window[0].month}`).toBe(
        `${expectedBaseline.getFullYear()}-${expectedBaseline.getMonth() + 1}`
      );
    }
  });
});

// ─── Storico (ALL): il periodo senza baseline, dove A2 e A3 mordevano ───

describe('calculatePerformanceForPeriod — Storico (ALL)', () => {
  // Gen 2024 → Dic 2024, +1% al mese. Un unico stipendio da 1.000 € a gennaio: quel risparmio è
  // GIÀ dentro il patrimonio di fine gennaio, cioè dentro startNW.
  const snapshots = monthlySeries(2024, 1, 12);
  const januaryIncome = [expense(2024, 1, 'income', 1000)];

  it('apre la misura il mese DOPO il primo snapshot', async () => {
    const metrics = await metricsFor(snapshots, 'ALL', januaryIncome);

    expect(metrics.startDate).toEqual(new Date(2024, 1, 1)); // 1 febbraio, non 1 gennaio
    expect(metrics.numberOfMonths).toBe(11); // 12 snapshot → 11 rendimenti mensili
    expect(metrics.nominalPeriodStart).toBeNull();
  });

  it('non conta due volte il cash flow del primo mese (A2)', async () => {
    const metrics = await metricsFor(snapshots, 'ALL', januaryIncome);

    // Prima del fix i CF partivano dal 1° gennaio: i 1.000 € entravano in startNW E venivano
    // ri-sottratti dal guadagno, deprimendo ROI e CAGR di un intero mese di risparmi.
    expect(metrics.netCashFlow).toBe(0);
    expect(metrics.totalIncome).toBe(0);
    expect(metrics.roi!).toBeCloseTo((Math.pow(1.01, 11) - 1) * 100, 6); // 11.5668%, non 10.5668%
  });

  it('annualizza TWR e CAGR sui mesi che ha davvero misurato (A3)', async () => {
    const metrics = await metricsFor(snapshots, 'ALL', januaryIncome);

    // 11 rendimenti dell 1% annualizzati su 11 mesi → 1.01¹² − 1. Con il conteggio inclusivo
    // (11 rendimenti su 12 mesi) usciva 11.57%: un punto percentuale evaporato.
    expect(metrics.timeWeightedReturn!).toBeCloseTo(ANNUALIZED_1_PCT, 6);
    expect(metrics.cagr!).toBeCloseTo(ANNUALIZED_1_PCT, 6);
  });

  it('lascia intatta la catena dei rendimenti mensili (Max Drawdown invariato)', async () => {
    // Regressione: il fix del "Max Drawdown fantasma" (2026-07-27b) non deve essere toccato.
    // La finestra si apre più tardi solo per i cash flow, non per l indice TWR.
    const withDip = [
      snapshot(2024, 1, 100000),
      snapshot(2024, 2, 105000),
      snapshot(2024, 3, 94500), // −10% dal picco
      snapshot(2024, 4, 100000),
    ];
    const metrics = await metricsFor(withDip, 'ALL');

    expect(metrics.maxDrawdown!).toBeCloseTo(-10, 6);
    expect(metrics.maxDrawdownDate).toBe('03/24');
  });
});

// ─── YTD: con e senza lo snapshot di dicembre ───

describe('calculatePerformanceForPeriod — YTD', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 15)); // 15 feb 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('con lo snapshot di dicembre: dicembre è baseline, i numeri restano quelli di prima', async () => {
    const snapshots = monthlySeries(2025, 10, 5); // ott 2025 → feb 2026
    const metrics = await metricsFor(snapshots, 'YTD');
    const window = getSnapshotsForPeriod(snapshots, 'YTD');

    expect(metrics.nominalPeriodStart).toEqual({ year: 2026, month: 1 });
    expect(resolveHasBaseline(window, metrics.nominalPeriodStart)).toBe(true);
    expect(metrics.startDate).toEqual(new Date(2026, 0, 1));
    expect(metrics.numberOfMonths).toBe(2); // gennaio e febbraio
    expect(metrics.startNetWorth).toBeCloseTo(100000 * Math.pow(1.01, 2), 6); // dicembre
    expect(metrics.roi!).toBeCloseTo((Math.pow(1.01, 2) - 1) * 100, 6);
    expect(metrics.timeWeightedReturn!).toBeCloseTo(ANNUALIZED_1_PCT, 6);
  });

  it('senza lo snapshot di dicembre: gennaio è dentro il periodo, non una baseline (A1)', async () => {
    const snapshots = monthlySeries(2026, 1, 2); // solo gen e feb 2026
    const metrics = await metricsFor(snapshots, 'YTD', [expense(2026, 1, 'income', 1000)]);
    const window = getSnapshotsForPeriod(snapshots, 'YTD');

    expect(resolveHasBaseline(window, metrics.nominalPeriodStart)).toBe(false);
    // Gennaio resta la valutazione di partenza (è l unica disponibile), ma il suo risparmio non
    // viene ri-sottratto e il mese non viene contato come misurato.
    expect(metrics.startDate).toEqual(new Date(2026, 1, 1));
    expect(metrics.numberOfMonths).toBe(1);
    expect(metrics.netCashFlow).toBe(0);
    expect(metrics.timeWeightedReturn!).toBeCloseTo(ANNUALIZED_1_PCT, 6);
  });

  it('senza baseline il grafico Evoluzione mostra anche il primo mese (A10)', async () => {
    const snapshots = monthlySeries(2026, 1, 3); // gen → mar 2026
    vi.setSystemTime(new Date(2026, 2, 15));
    const metrics = await metricsFor(snapshots, 'YTD');
    const window = getSnapshotsForPeriod(snapshots, 'YTD');
    const hasBaseline = resolveHasBaseline(window, metrics.nominalPeriodStart);

    // La pagina prima decideva dal tipo di periodo ("YTD ⇒ salta il primo") e cancellava
    // gennaio dal grafico pur essendo dentro l anno.
    expect(hasBaseline).toBe(false);
    const chart = preparePerformanceChartData(window, metrics.cashFlows, hasBaseline);
    expect(chart.map(p => p.date)).toEqual(['01/2026', '02/2026', '03/2026']);
  });
});

// ─── Finestre più lunghe dello storico ───

describe('calculatePerformanceForPeriod — 3Y su 14 mesi di storico', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // 15 mar 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('non scarta il primo mese reale come se fosse una baseline (A1)', async () => {
    const snapshots = monthlySeries(2025, 2, 14); // feb 2025 → mar 2026
    const metrics = await metricsFor(snapshots, '3Y');
    const window = getSnapshotsForPeriod(snapshots, '3Y');

    expect(metrics.nominalPeriodStart).toEqual({ year: 2023, month: 4 });
    expect(resolveHasBaseline(window, metrics.nominalPeriodStart)).toBe(false);
    expect(metrics.startDate).toEqual(new Date(2025, 2, 1)); // marzo 2025
    expect(metrics.numberOfMonths).toBe(13); // 14 snapshot → 13 rendimenti
    expect(metrics.timeWeightedReturn!).toBeCloseTo(ANNUALIZED_1_PCT, 6);
  });
});

// ─── CUSTOM ───

describe('calculatePerformanceForPeriod — CUSTOM', () => {
  it('usa il mese precedente come baseline quando esiste', async () => {
    const snapshots = monthlySeries(2025, 11, 5); // nov 2025 → mar 2026
    const metrics = await metricsFor(
      snapshots,
      'CUSTOM',
      [],
      new Date(2026, 0, 1),
      new Date(2026, 2, 31)
    );

    expect(metrics.nominalPeriodStart).toEqual({ year: 2026, month: 1 });
    expect(metrics.startDate).toEqual(new Date(2026, 0, 1));
    expect(metrics.numberOfMonths).toBe(3);
    expect(metrics.startNetWorth).toBeCloseTo(100000 * Math.pow(1.01, 1), 6); // dicembre
  });

  it('con un buco nella serie apre comunque la misura il mese dopo la baseline', async () => {
    // Dic 2025 e poi il salto a mar 2026: i tre mesi di cash flow in mezzo appartengono a quel
    // rendimento. Prendere il secondo snapshot come inizio (marzo) li perdeva tutti.
    const snapshots = [snapshot(2025, 12, 100000), snapshot(2026, 3, 103030)];
    const metrics = await metricsFor(
      snapshots,
      'CUSTOM',
      [expense(2026, 1, 'income', 500)],
      new Date(2026, 0, 1),
      new Date(2026, 2, 31)
    );

    expect(metrics.startDate).toEqual(new Date(2026, 0, 1));
    expect(metrics.numberOfMonths).toBe(3);
    expect(metrics.netCashFlow).toBe(500);
    expect(metrics.roi!).toBeCloseTo(2.53, 6); // (103030 − 100000 − 500) / 100000
  });

  it('segnala dati insufficienti quando i due snapshot cadono nello stesso mese', async () => {
    const snapshots = [snapshot(2026, 1, 100000), snapshot(2026, 1, 101000)];
    const metrics = await metricsFor(
      snapshots,
      'CUSTOM',
      [],
      new Date(2026, 0, 1),
      new Date(2026, 0, 31)
    );

    expect(metrics.hasInsufficientData).toBe(true);
    expect(metrics.errorMessage).toContain('shorter than one month');
  });
});

// ─── selectSnapshotsForMetrics: la pagina rilegge la finestra del service ───

describe('selectSnapshotsForMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ricostruisce la stessa finestra per ogni periodo standard', async () => {
    const snapshots = monthlySeries(2020, 1, 74); // gen 2020 → feb 2026

    for (const period of ['YTD', '1Y', '3Y', '5Y', 'ALL'] as const) {
      const metrics = await metricsFor(snapshots, period);
      const serviceWindow = getSnapshotsForPeriod(snapshots, period);
      const pageWindow = selectSnapshotsForMetrics(snapshots, metrics);

      expect(pageWindow.map(s => `${s.year}-${s.month}`)).toEqual(
        serviceWindow.map(s => `${s.year}-${s.month}`)
      );
    }
  });

  it('ricostruisce la finestra CUSTOM senza il giro fragile su getSnapshotsForPeriod (A10)', async () => {
    const snapshots = monthlySeries(2025, 11, 5); // nov 2025 → mar 2026
    const customStart = new Date(2026, 0, 1);
    const customEnd = new Date(2026, 2, 31);
    const metrics = await metricsFor(snapshots, 'CUSTOM', [], customStart, customEnd);

    const pageWindow = selectSnapshotsForMetrics(snapshots, metrics);
    // Dicembre (baseline) + gen/feb/mar: novembre resta fuori.
    expect(pageWindow.map(s => `${s.year}-${s.month}`)).toEqual([
      '2025-12',
      '2026-1',
      '2026-2',
      '2026-3',
    ]);
  });

  it('non risale oltre il mese di baseline quando quello giusto manca', async () => {
    // Nov c è, dic no: novembre NON è una valutazione di partenza valida per un periodo che inizia
    // a gennaio — il primo rendimento "mensile" coprirebbe due mesi.
    const snapshots = [
      snapshot(2025, 11, 99000),
      snapshot(2026, 1, 100000),
      snapshot(2026, 2, 101000),
    ];
    const metrics = await metricsFor(snapshots, 'CUSTOM', [], new Date(2026, 0, 1), new Date(2026, 1, 28));

    expect(selectSnapshotsForMetrics(snapshots, metrics).map(s => `${s.year}-${s.month}`)).toEqual([
      '2026-1',
      '2026-2',
    ]);
  });
});

// ─── Invariante di riconciliazione: Heatmap e Underwater raccontano la stessa storia ───

describe('invariante Heatmap ↔ Underwater', () => {
  it('l underwater è il concatenamento dei rendimenti della heatmap (< 1e-9)', async () => {
    const snapshots = [
      snapshot(2025, 1, 100000),
      snapshot(2025, 2, 108000),
      snapshot(2025, 3, 95000),
      snapshot(2025, 4, 99000),
      snapshot(2025, 5, 130000), // salita gonfiata da un versamento
      snapshot(2025, 6, 128000),
    ];
    const expenses = [expense(2025, 5, 'income', 28000), expense(2025, 3, 'variable', 2000)];
    const metrics = await metricsFor(snapshots, 'ALL', expenses);

    const heatmap = prepareMonthlyReturnsHeatmap(snapshots, metrics.cashFlows);
    const underwater = prepareUnderwaterDrawdownData(snapshots, metrics.cashFlows);

    // Ricostruzione indipendente: concatena i rendimenti mensili della heatmap e misura la
    // distanza dal massimo corrente. Deve coincidere punto per punto con l underwater, che parte
    // dal mese di valutazione (drawdown 0) e ha quindi un punto in più.
    const monthlyReturns = heatmap.flatMap(year =>
      year.months.filter(m => m.return !== null).map(m => m.return!)
    );
    let index = 100;
    let peak = 100;
    const expected = monthlyReturns.map(monthlyReturn => {
      index *= 1 + monthlyReturn / 100;
      peak = Math.max(peak, index);
      return (index / peak - 1) * 100;
    });

    expect(underwater[0].drawdown).toBe(0);
    expect(underwater.length).toBe(expected.length + 1);
    underwater.slice(1).forEach((point, i) => {
      expect(Math.abs(point.drawdown - expected[i])).toBeLessThan(1e-9);
    });

    // E il Max Drawdown è il minimo di quella stessa serie: una sola verità, tre superfici.
    expect(metrics.maxDrawdown!).toBeCloseTo(Math.min(...expected), 9);
  });
});
