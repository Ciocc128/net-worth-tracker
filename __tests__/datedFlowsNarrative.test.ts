/**
 * The words of the dated flows (doc/fire-ipotesi/README.md § 12.7): the row of the list, the Base di calcolo row (D-F12,
 * F23), the clause of «Ipotesi usate», the signs of the lumps, and the pace of Coast with the change of the saving.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DatedFlow } from '@/types/assets';
import { describeFlowRow, describeFlowsDeclaration, describeFlowsRow, describeMortgageOption, describeSimulationFlowsRow } from '@/lib/utils/datedFlowsNarrative';
import { describeFireAssumptions } from '@/lib/utils/fireAssumptionsNarrative';
import { buildFlowSchedule, lumpMarkersOf, resolveDatedFlows } from '@/lib/utils/datedFlows';
import { resolveCoastPace } from '@/lib/utils/coastFireView';
import type { FireAssumptions } from '@/lib/utils/fireAssumptions';
import type { CoastFIREProjectionPoint } from '@/lib/services/fireService';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));

const base: Pick<DatedFlow, 'indexed' | 'durationYears'> = { indexed: true, durationYears: null };
const text = (assumptions: FireAssumptions) => describeFireAssumptions(assumptions).map((segment) => segment.text).join('');

describe('describeFlowRow', () => {
  it('should write each form the way the spec shows it', () => {
    const partTime: DatedFlow = { ...base, id: 'a', label: 'Part-time', kind: 'income', amount: 9600, start: { anchor: 'fire', afterYears: 0 }, durationYears: 10 };
    expect(describeFlowRow(partTime)).toMatch(/^Part-time · entrata · 9\.?600\s?€\/anno · dal FIRE per 10 anni$/);
    const inheritance: DatedFlow = { ...base, id: 'b', label: 'Eredità', kind: 'lumpIn', amount: 100000, indexed: false, start: { anchor: 'year', year: 2036 } };
    expect(describeFlowRow(inheritance)).toMatch(/^Eredità · entrata una tantum · 100\.000\s?€ fissi · 2036$/);
    const rent: DatedFlow = { ...base, id: 'c', label: 'Affitto', kind: 'income', amount: 6000, start: { anchor: 'year', year: 2026 }, inCashflowToday: true };
    expect(describeFlowRow(rent)).toMatch(/per sempre · già nel Cashflow$/);
  });

  it('should name the mortgage by its instalment and its end', () => {
    const schedule = { kind: 'schedule', instalment: 800, months: 87, endDate: new Date(2034, 2, 15, 12), byYear: new Map() } as const;
    const flow: DatedFlow = { ...base, id: 'm', label: 'Mutuo Casa', kind: 'expense', amount: 9600, indexed: false, start: { anchor: 'year', year: 2026 }, source: { kind: 'mortgage', propertyId: 'casa' } };
    expect(describeFlowRow(flow, schedule)).toMatch(/^Mutuo Casa · spesa · 800\s?€\/mese fissi · fino a marzo 2034 · già nel Cashflow$/);
    expect(describeMortgageOption({ kind: 'never' })).toContain('non finisce');
  });
});

describe('describeFlowsRow — the Base di calcolo', () => {
  it('should say how far the flows move the FIRE year', () => {
    expect(describeFlowsRow({ count: 4, excluded: [], yearWithout: 2034, yearWith: 2029 })).toEqual({ value: '4', caption: 'spostano il FIRE dal 2034 al 2029' });
    expect(describeFlowsRow({ count: 4, excluded: [], yearWithout: 2034, yearWith: 2034 })).toEqual({ value: '4', caption: "non spostano l'anno FIRE" });
    expect(describeFlowsRow({ count: 1, excluded: [], yearWithout: 2034, yearWith: 2031 }).caption).toBe('sposta il FIRE dal 2034 al 2031');
  });

  it('should say "none" with no flows, and F23 what was left out', () => {
    expect(describeFlowsRow({ count: 0, excluded: [], yearWithout: null, yearWith: null })).toEqual({ value: null, caption: 'nessuno: aggiungili in Il mio piano' });
    const row = describeFlowsRow({ count: 3, excluded: [{ id: 'x', label: 'x', reason: "manca l'età" }], yearWithout: 2034, yearWith: 2034 });
    expect(row.caption).toBe("non spostano l'anno FIRE · 1 escluso: manca l'età");
  });

  it('should declare the count in Impostazioni', () => {
    expect(describeFlowsDeclaration(0)).toBe('nessuno');
    expect(describeFlowsDeclaration(4)).toBe('4');
  });
});

describe('the clause of «Ipotesi usate»', () => {
  const assumptions = {
    scenarios: {
      bear: { growthRate: 5, inflationRate: 3, realReturnRate: 2, arithmeticMean: 6, volatility: 10 },
      base: { growthRate: 7, inflationRate: 3, realReturnRate: 4, arithmeticMean: 8, volatility: 10 },
      bull: { growthRate: 9, inflationRate: 3, realReturnRate: 6, arithmeticMean: 10, volatility: 10 },
    },
    weightsOrigin: 'targets',
    leverage: 1,
  } as unknown as FireAssumptions;

  it('should add «4 flussi datati» only when flows are in use', () => {
    expect(text({ ...assumptions, datedFlowsCount: 4 })).toMatch(/ · 4 flussi datati$/);
    expect(text({ ...assumptions, datedFlowsCount: 1 })).toMatch(/ · 1 flusso datato$/);
    expect(text(assumptions)).not.toContain('flussi');
    expect(text({ ...assumptions, datedFlowsCount: 0 })).not.toContain('flusso');
  });
});

describe('lumpMarkersOf', () => {
  it('should mark the lumps from next year on, with their direction', () => {
    const { resolved } = resolveDatedFlows(
      [
        { ...base, id: 'in', label: 'Eredità', kind: 'lumpIn', amount: 1, start: { anchor: 'year', year: 2036 } },
        { ...base, id: 'out', label: 'Auto', kind: 'lumpOut', amount: 1, start: { anchor: 'year', year: 2029 } },
        { ...base, id: 'now', label: 'Oggi', kind: 'lumpIn', amount: 1, start: { anchor: 'year', year: 2026 } },
        { ...base, id: 'rec', label: 'Figlio', kind: 'expense', amount: 1, start: { anchor: 'year', year: 2028 } },
      ],
      { currentYear: 2026 },
    );
    expect(lumpMarkersOf(resolved, 2026)).toEqual([
      { calendarYear: 2036, label: 'Eredità', direction: 'in' },
      { calendarYear: 2029, label: 'Auto', direction: 'out' },
    ]);
  });
});

describe('resolveCoastPace with the change of the saving', () => {
  const point = (yearOffset: number, basePortfolioValue: number, fireNumberTarget: number): CoastFIREProjectionPoint => ({ yearOffset, calendarYear: 2026 + yearOffset, age: 35 + yearOffset, bearPortfolioValue: 0, basePortfolioValue, bullPortfolioValue: 0, fireNumberTarget });
  const series = Array.from({ length: 11 }, (_, index) => point(index, 100_000 * 1.04 ** index, 200_000));

  it('should be the pace of before without a change', () => {
    expect(resolveCoastPace(series, 10_000, 4, false, () => 0)).toEqual(resolveCoastPace(series, 10_000, 4, false));
  });

  it('should reach the Coast curve sooner when the saving grows', () => {
    const plain = resolveCoastPace(series, 10_000, 4, false)!;
    const boosted = resolveCoastPace(series, 10_000, 4, false, () => 10_000)!;
    expect(boosted.reached!.yearOffset).toBeLessThanOrEqual(plain.reached!.yearOffset);
    expect(boosted.series.at(-1)!).toBeGreaterThan(plain.series.at(-1)!);
  });
});

describe('buildFlowSchedule.horizon', () => {
  it('should reach the last year a flow starts or ends', () => {
    const { resolved } = resolveDatedFlows([{ ...base, id: 'c', label: 'Figlio', kind: 'expense', amount: 6000, start: { anchor: 'year', year: 2028 }, durationYears: 20 }], { currentYear: 2026 });
    expect(buildFlowSchedule(resolved, { inflationRate: 2, planExpensesFromCashflow: true }).horizon(0)).toBe(21);
  });
});

describe('describeSimulationFlowsRow (Monte Carlo and Proiezione › Parametri)', () => {
  const excluded = [{ id: 'a', label: 'Bonus', reason: "manca l'età" }];
  it('should say none, the count, and what the FIRE anchor means in each view', () => {
    expect(describeSimulationFlowsRow({ count: 0, excluded: [], fireAnchored: 0, view: 'monteCarlo' })).toBe('Flussi nel tempo: nessuno');
    expect(describeSimulationFlowsRow({ count: 4, excluded: [], fireAnchored: 0, view: 'monteCarlo' })).toBe('Flussi nel tempo: 4');
    expect(describeSimulationFlowsRow({ count: 4, excluded: [], fireAnchored: 2, view: 'monteCarlo' })).toBe('Flussi nel tempo: 4 (quelli dal FIRE partono dal primo anno)');
    expect(describeSimulationFlowsRow({ count: 1, excluded: [], fireAnchored: 1, view: 'monteCarlo' })).toBe('Flussi nel tempo: 1 (dal FIRE: partono dal primo anno)');
    expect(describeSimulationFlowsRow({ count: 4, excluded: [], fireAnchored: 1, view: 'projection' })).toBe('Flussi nel tempo: 4 (quello dal FIRE non vale nella Proiezione)');
    expect(describeSimulationFlowsRow({ count: 2, excluded: [], fireAnchored: 2, view: 'projection' })).toBe('Flussi nel tempo: 2 (dal FIRE: non valgono nella Proiezione)');
  });
  it('should name what was left out', () => {
    expect(describeSimulationFlowsRow({ count: 3, excluded, fireAnchored: 0, view: 'projection' })).toBe("Flussi nel tempo: 3 · 1 escluso: manca l'età");
    expect(describeSimulationFlowsRow({ count: 0, excluded, fireAnchored: 0, view: 'monteCarlo' })).toBe("Flussi nel tempo: nessuno · 1 escluso: manca l'età");
  });
});

describe('describeGoalFlowRow (doc/fire-ipotesi/README.md § 13.7)', () => {
  it('should write the amount and the year of a goal that counts, and the reason of one left out', async () => {
    const { describeGoalFlowRow } = await import('@/lib/utils/datedFlowsNarrative');
    expect(describeGoalFlowRow('Acquisto Casa', { amount: 50_000, year: 2029 })).toMatch(/^Acquisto Casa · obiettivo · 50\.000\s€ · 2029 · si modifica in Obiettivi$/);
    expect(describeGoalFlowRow('Auto', { reason: 'scadenza passata' })).toBe('Auto · obiettivo · escluso: scadenza passata · si modifica in Obiettivi');
  });
});
