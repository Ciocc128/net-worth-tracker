/**
 * Capitale esaurito e FIRE fuori orizzonte (doc/fire-ipotesi/README.md § 21): RE1–RE10, criteri CGA1–CGA5, CGA11–CGA14.
 * Scenari Bear = Base = Bull a 0% di rendimento e inflazione, SWR 4%, nessuna pensione né tassa.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/services/chartService', () => ({ formatCurrencyCompact: (value: number) => String(Math.round(value)) }));
vi.mock('@/lib/services/whatIfService', () => ({ WHAT_IF_HORIZON_YEARS: 50, baseYearsToFIREWithFlows: vi.fn(), baseQuotaAtTargetWithFlows: vi.fn() }));

import { calculateFIREProjection, calculateFIRESensitivityMatrix } from '@/lib/services/fireService';
import { depletionCause, findDepletion, formatQuota, quotaAtTarget, targetYearsOf } from '@/lib/utils/fireDepletion';
import { resolveFireStart } from '@/lib/utils/fireStart';
import { resolveDatedFlows, type DatedFlowsInput } from '@/lib/utils/datedFlows';
import type { DatedFlow, FIREProjectionScenarios } from '@/types/assets';

const YEAR = new Date().getFullYear();
const flat = { growthRate: 0, inflationRate: 0 };
const scenarios: FIREProjectionScenarios = { bear: flat, base: flat, bull: flat };
const walk = (capital: number, expenses: number, savings: number, flows?: DatedFlowsInput) =>
  calculateFIREProjection(capital, expenses, savings, 4, scenarios, 50, undefined, undefined, false, flows);

const lump = (label: string, amount: number, offset: number): DatedFlow =>
  ({ id: label, label, kind: 'lumpOut', amount, indexed: false, durationYears: null, start: { anchor: 'year', year: YEAR + offset } }) as DatedFlow;
const flowsOf = (list: DatedFlow[]): DatedFlowsInput => ({ resolved: resolveDatedFlows(list, { currentYear: YEAR }).resolved, planExpensesFromCashflow: true });

describe('CGA1 — quota all’età obiettivo', () => {
  const projection = walk(100_000, 40_000, 10_000);
  it('nessuno scenario arriva al FIRE; riga 10: 200.000 / 1.000.000 → 20%', () => {
    expect(projection.baseYearsToFIRE).toBeNull();
    const row = projection.yearlyData.find((entry) => entry.year === 10)!;
    expect(row.baseNetWorth).toBe(200_000);
    expect(row.baseFireNumber).toBe(1_000_000);
    const quota = quotaAtTarget(projection, 10)!;
    expect(quota).toBeCloseTo(0.2, 10);
    expect(formatQuota(quota)).toBe('20%');
  });
  it('la quota è troncata, «100%+» se il FIRE arriva entro T (D-CG8)', () => {
    expect(formatQuota(0.996)).toBe('99%');
    expect(formatQuota(1.2, true)).toBe('100%+');
  });
  it('senza T o oltre il cammino: null', () => {
    expect(quotaAtTarget(projection, null)).toBeNull();
    expect(quotaAtTarget(projection, 999)).toBeNull();
    expect(targetYearsOf(50, 40)).toBe(10);
    expect(targetYearsOf(50, undefined)).toBeNull();
    expect(targetYearsOf(40, 40)).toBeNull();
  });
});

describe('CGA2 — con un’uscita di 50.000 € all’anno 5', () => {
  it('riga 10: 150.000 / 1.000.000 → 15%', () => {
    const projection = walk(100_000, 40_000, 10_000, flowsOf([lump('Auto', 50_000, 5)]));
    expect(projection.yearlyData.find((entry) => entry.year === 10)!.baseNetWorth).toBe(150_000);
    expect(formatQuota(quotaAtTarget(projection, 10)!)).toBe('15%');
  });
});

describe('CGA3 — Sensibilità fuori orizzonte', () => {
  const matrix = calculateFIRESensitivityMatrix(100_000, 40_000, 10_000, 4, scenarios, false, undefined, undefined, undefined, 10);
  it('la cella del piano è 20%', () => {
    expect(matrix.byQuota).toBe(true);
    const base = matrix.rows.flatMap((row) => row.cells).find((entry) => entry.isBaseline)!;
    expect(formatQuota(base.quotaAtTarget!)).toBe('20%');
  });
  it('risparmio ×1,5 e spesa ×0,8 → 31%; risparmio ×0,75 e spesa ×1,2 → 14% (troncato)', () => {
    const cells = matrix.rows.flatMap((row) => row.cells);
    const hi = cells.find((c) => c.annualSavings === 15_000 && Math.abs(c.annualExpenses - 32_000) < 1e-6)!;
    const lo = cells.find((c) => c.annualSavings === 7_500 && Math.abs(c.annualExpenses - 48_000) < 1e-6)!;
    expect(formatQuota(hi.quotaAtTarget!)).toBe('31%');
    expect(formatQuota(lo.quotaAtTarget!)).toBe('14%');
    expect(hi.relationToBaseline).toBe('better');
    expect(lo.relationToBaseline).toBe('worse');
  });
});

describe('CGA14 — la matrice senza targetYears è quella di prima', () => {
  it('nessuna cella porta la quota', () => {
    const matrix = calculateFIRESensitivityMatrix(100_000, 40_000, 10_000, 4, scenarios, false);
    expect(matrix.byQuota).toBeUndefined();
    expect(matrix.rows.flatMap((row) => row.cells).every((entry) => !('quotaAtTarget' in entry))).toBe(true);
  });
});

describe('CGA5 — anno e causa dell’esaurimento', () => {
  const flows = flowsOf([lump('Acquisto Casa', 41_777, 6)]);
  const projection = walk(18_283, 30_000, 0, flows);
  it('W₂₀₃₁ = 18.283, W₂₀₃₂ = −23.494 → 2032', () => {
    expect(projection.yearlyData.find((entry) => entry.year === 5)!.baseNetWorth).toBe(18_283);
    expect(projection.yearlyData.find((entry) => entry.year === 6)!.baseNetWorth).toBe(-23_494);
    expect(findDepletion(projection.yearlyData, 'baseNetWorth', 18_283)).toBe(YEAR + 6);
  });
  it('la causa è la più grande uscita dell’anno; senza una tantum, nessuna causa', () => {
    expect(depletionCause(flows.resolved, YEAR + 6, YEAR)).toEqual({ label: 'Acquisto Casa', amount: 41_777 });
    expect(depletionCause(flows.resolved, YEAR + 5, YEAR)).toBeNull();
    expect(depletionCause(undefined, YEAR + 6, YEAR)).toBeNull();
  });
  it('un capitale di partenza ≤ 0 non è un esaurimento', () => {
    expect(findDepletion(projection.yearlyData, 'baseNetWorth', 0)).toBeNull();
  });
});

describe('CGA11–CGA12 — Dopo il FIRE', () => {
  const input = { hasBaseline: true, baseInflationRate: 0, currentYear: YEAR, currentAge: 40, yearsToFIRE: null as number | null };
  it('CGA11: parte dall’età obiettivo con il capitale di allora', () => {
    const projection = walk(100_000, 40_000, 10_000);
    const start = resolveFireStart({ ...input, projection, targetYears: 10 });
    expect(start).toMatchObject({ kind: 'target', years: 10, calendarYear: YEAR + 10, ageAtFire: 50, capitalNominal: 200_000 });
    if (start.kind === 'target') expect(start.quota).toBeCloseTo(0.2, 10);
  });
  it('CGA12: capitale esaurito prima di T', () => {
    const projection = walk(18_283, 30_000, 0, flowsOf([lump('Acquisto Casa', 41_777, 6)]));
    expect(resolveFireStart({ ...input, projection, targetYears: 6 })).toEqual({ kind: 'depleted', depletionYear: YEAR + 6 });
  });
  it('senza età obiettivo resta «never»', () => {
    const projection = walk(100_000, 40_000, 10_000);
    expect(resolveFireStart({ ...input, projection, targetYears: null })).toEqual({ kind: 'today', reason: 'never' });
  });
});


// ─── Narrative: the words that read the same figures ──────────────────────────
import { describeDepletion, describeScenarios } from '@/lib/utils/fireNarrative';
import { summarizeScenarios } from '@/lib/utils/fireSummary';
import { goalFireNarrative } from '@/lib/utils/goalFire';
import { describeTappe } from '@/lib/utils/projectionNarrative';
import { clipDepletedSeries } from '@/lib/utils/fireDepletion';

const text = (segments: Array<{ text: string }>) => segments.map((segment) => segment.text).join('');

describe('CGA4 — Scenari fuori orizzonte', () => {
  it('tre righe «all’età obiettivo il 20% del numero FIRE»', () => {
    const rows = summarizeScenarios(walk(100_000, 40_000, 10_000), YEAR, 10);
    expect(rows.map((row) => row.quotaLabel)).toEqual(['20%', '20%', '20%']);
    expect(text(describeScenarios(rows))).toContain('All’età obiettivo il 20% del numero FIRE nel base.');
  });
  it('CGA13 — senza età obiettivo: come oggi più la riga che manda a Il mio piano', () => {
    const rows = summarizeScenarios(walk(100_000, 40_000, 10_000), YEAR, null);
    expect(rows.every((row) => row.quotaLabel === undefined)).toBe(true);
    expect(text(describeScenarios(rows, { quotaMissing: true }))).toContain('Imposta l’età obiettivo in Il mio piano');
  });
});

describe('CGA7–CGA8 — la frase di esaurimento', () => {
  it('con la causa', () => {
    expect(text(describeDepletion({ year: 2032, cause: { label: 'Acquisto Casa', amount: 41_777 } }))).toMatch(/^Il capitale si esaurisce nel 2032 con Acquisto Casa \(41\.777\s€\)\. $/);
  });
  it('senza una tantum: per le uscite del piano', () => {
    expect(text(describeDepletion({ year: 2032, cause: null }))).toBe('Il capitale si esaurisce nel 2032 per le uscite del piano. ');
  });
});

describe('RE3 — il grafico si ferma', () => {
  it('0 nell’anno di esaurimento, nessun punto dopo', () => {
    const projection = walk(18_283, 30_000, 0, flowsOf([lump('Acquisto Casa', 41_777, 6)]));
    const { rows, depletion } = clipDepletedSeries(projection.yearlyData, ['baseNetWorth'] as const);
    expect(depletion.baseNetWorth).toBe(YEAR + 6);
    expect(rows.find((row) => row.calendarYear === YEAR + 6)!.baseNetWorth).toBe(0);
    expect(rows.find((row) => row.calendarYear === YEAR + 7)!.baseNetWorth).toBeNull();
    expect(rows.every((row) => row.baseNetWorth === null || row.baseNetWorth >= 0)).toBe(true);
  });
});

describe('RE4 — Proiezione: «esaurito»', () => {
  it('describeTappe non stampa cifre negative', () => {
    const row = (year: number, p10: number, p50: number) => ({ year, p10, p50 }) as unknown as Parameters<typeof describeTappe>[0][number];
    const out = text(describeTappe([row(20, -100, 371_000), row(50, -4_467, -4_467)]));
    expect(out).toContain('tra 50 anni esaurita');
    expect(text(describeTappe([row(50, -4_467, -4_467), row(50, -4_467, -4_467)]))).toContain('la mediana è esaurita');
    expect(out).toContain('il 10° percentile a 50 anni è esaurito');
    expect(out).not.toMatch(/4\.467/);
  });
});

describe('RE10 — Effetto sul FIRE fuori orizzonte', () => {
  const base = { kind: 'effect' as const, counted: true, yearWith: null, yearWithout: null, horizonYear: YEAR + 50, targetCalendarYear: YEAR + 10 };
  it('CGA2: 15% invece del 20%', () => {
    expect(goalFireNarrative({ ...base, quotaWith: 0.15, quotaWithout: 0.2 })).toBe(`Con questa spesa all’età obiettivo (${YEAR + 10}) avrai il 15% del numero FIRE invece del 20% (scenario Base).`);
  });
  it('quote uguali', () => {
    expect(goalFireNarrative({ ...base, quotaWith: 0.2, quotaWithout: 0.2 })).toBe('Questa spesa non cambia la quota del numero FIRE all’età obiettivo (20%, scenario Base).');
  });
});
