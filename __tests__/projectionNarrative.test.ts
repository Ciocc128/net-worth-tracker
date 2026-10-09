import { describe, it, expect, vi } from 'vitest';

// chartService pulls in the Firebase client at module level; the narrative only needs its percentage formatter.
vi.mock('@/lib/services/chartService', () => ({
  formatPercentage: (value: number, decimals = 1) => `${value.toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`,
}));

import {
  buildProjectionVerdict,
  describeFireThresholdPlaceholder,
  describeProjectionParametri,
  describeProjectionFooter,
  describeTappe,
  describeTappeFooter,
  describeVentaglioFooter,
  PROJECTION_THRESHOLD_HINT_EMPTY,
  PROJECTION_THRESHOLD_HINT_FIRE,
  PROJECTION_THRESHOLD_HINT_FIXED,
  projectionScenariFooter,
} from '@/lib/utils/projectionNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import type { ProjectionFigures, ProjectionSummary, ScenarioProjection } from '@/lib/utils/projectionSummary';

const figures = (overrides: Partial<ProjectionFigures> = {}): ProjectionFigures => ({
  year: 30,
  calendarYear: 2056,
  age: null,
  p10: 213_000,
  p25: 378_000,
  p50: 714_000,
  p75: 1_351_000,
  p90: 2_397_000,
  p50Nominal: 1_754_000,
  threshold: 800_000,
  probabilityAtLeast: 45.2,
  probabilityBelowStart: 1.9,
  ...overrides,
});

function summaryWith(base: Partial<ProjectionFigures> = {}, zeroedShare = 0, threshold: number | null = 800_000, endAge: number | null = null): ProjectionSummary {
  const at = figures(base);
  const scenario = (key: 'bear' | 'base' | 'bull'): ScenarioProjection => ({ key, series: [], atHorizon: at, milestones: [at], leverageZeroedCount: 0, leverageZeroedShare: key === 'base' ? zeroedShare : 0 });
  return {
    horizon: 30,
    endCalendarYear: 2056,
    endAge,
    simulations: 10_000,
    threshold,
    startingCapital: 100_000,
    scenarios: { bear: scenario('bear'), base: scenario('base'), bull: scenario('bull') },
  };
}

const text = (summary: ProjectionSummary | null, options: { thresholdIsFireNumber?: boolean; leverage?: number; runnable?: boolean } = {}) => {
  const verdict = buildProjectionVerdict({ runnable: options.runnable ?? true, summary, thresholdIsFireNumber: options.thresholdIsFireNumber ?? true, leverage: options.leverage ?? 1 });
  return { verdict, sentence: narrativeToText(verdict.sentence).replace(/ /g, ' ') };
};

describe('buildProjectionVerdict', () => {
  it('with the FIRE-number threshold: median, the worst tenth, the best tenth and the probability', () => {
    const { verdict, sentence } = text(summaryWith());
    expect(verdict.headline.replace(/ /g, ' ')).toBe('Tra 30 anni, 714.000 € di oggi in mediana.');
    expect(sentence).toBe(
      'Tra 30 anni (nel 2056) il portafoglio vale 714.000 € di oggi in mediana; più di 213.000 € in nove simulazioni su dieci, più di 2.397.000 € in una su dieci. Supera il tuo numero FIRE di quell\'anno (800.000 € di oggi) nel 45,2% delle simulazioni.',
    );
    // 45% is below the 80% floor: the FIRE-number probability reads as a negative tone, like the success rate.
    expect(verdict.tone).toBe('negative');
  });

  it('a typed threshold carries no tone, and names «di oggi»', () => {
    const { verdict, sentence } = text(summaryWith({ probabilityAtLeast: 36.1 }, 0, 1_000_000), { thresholdIsFireNumber: false });
    expect(verdict.tone).toBe('neutral');
    expect(sentence).toContain('Supera la soglia di 1.000.000 € di oggi nel 36,1% delle simulazioni.');
    expect(sentence).not.toContain('numero FIRE');
  });

  it('without a threshold the probability sentence is absent', () => {
    const { sentence } = text(summaryWith({ probabilityAtLeast: null }, 0, null));
    expect(sentence).not.toContain('Supera');
  });

  it('elides before an 11 or an 80: «nell\'11%», «nell\'85%»', () => {
    expect(text(summaryWith({ probabilityAtLeast: 11 })).sentence).toContain("nell'11%");
    expect(text(summaryWith({ probabilityAtLeast: 85 })).sentence).toContain("nell'85%");
  });

  it('says the age when it is known', () => {
    expect(text(summaryWith({}, 0, 800_000, 70)).sentence).toContain('Tra 30 anni (a 70 anni, nel 2056)');
  });

  it('adds the leverage sentence only with leverage and wiped-out paths', () => {
    expect(text(summaryWith({}, 3), { leverage: 1.5 }).sentence).toContain('Con leva 1,5× il 3% delle simulazioni azzera il capitale almeno una volta.');
    expect(text(summaryWith({}, 0), { leverage: 1.5 }).sentence).not.toContain('azzera');
    expect(text(summaryWith({}, 3), { leverage: 1 }).sentence).not.toContain('azzera');
  });

  it('not runnable and not yet run speak plainly', () => {
    expect(text(null, { runnable: false }).verdict.headline).toBe('Proiezione non calcolabile.');
    expect(text(null).verdict.headline).toBe('Proiezione non ancora eseguita.');
  });
});

describe('tile readings', () => {
  it('Parametri: with and without savings, with the allocation', () => {
    const allocation = [{ key: 'equity' as const, label: 'azioni', pct: 100 }];
    const withSavings = narrativeToText(describeProjectionParametri({ initialPortfolio: 100_000, annualSavings: 12_000, savingsYears: 15, horizon: 30, simulations: 10_000, allocation })).replace(/ /g, ' ');
    expect(withSavings).toBe("Parti da 100.000 € e versi 12.000 € l'anno, cresciuti con l'inflazione, per 15 anni; guardi a 30 anni, con il 100% in azioni.");
    const without = narrativeToText(describeProjectionParametri({ initialPortfolio: 100_000, annualSavings: 0, savingsYears: 15, horizon: 1, simulations: 10_000, allocation: [] })).replace(/ /g, ' ');
    expect(without).toBe('Parti da 100.000 €, senza versamenti; guardi a 1 anno.');
  });

  it('Tappe: first and last row', () => {
    const rows = [figures({ year: 20, p50: 371_000 }), figures({ year: 50, p50: 2_650_000, p10: 555_000 })];
    expect(narrativeToText(describeTappe(rows)).replace(/ /g, ' ')).toBe('Tra 20 anni la mediana è 371.000 €, tra 50 anni 2.650.000 €; il 10° percentile a 50 anni è 555.000 €.');
  });

  it('footers: stale vs fresh, gross values and the threshold line', () => {
    expect(narrativeToText(describeProjectionFooter({ stale: true, simulations: 10_000 }))).toContain('premi Prova per aggiornarli');
    expect(narrativeToText(describeProjectionFooter({ stale: false, simulations: 10_000 }))).toContain('30.000 traiettorie');
    const footer = narrativeToText(describeVentaglioFooter(3.04, 'fixed'));
    expect(footer).toContain('3,04%');
    expect(footer).toContain('Nessun costo ricorrente');
    expect(narrativeToText(describeVentaglioFooter(3.04, 'fixed', 0.36))).toContain("Al netto di TER e bollo (0,36% l'anno)");
    expect(footer).toContain('soglia');
  });
});

describe('T6 — the threshold in words', () => {
  it('Ventaglio footer: the dashed line is the FIRE number year by year, a typed threshold, or absent', () => {
    expect(narrativeToText(describeVentaglioFooter(3.04, 'fire'))).toContain('la linea tratteggiata è il tuo numero FIRE anno per anno (Calcolatore)');
    expect(narrativeToText(describeVentaglioFooter(3.04, 'fixed'))).toContain('la linea tratteggiata è la soglia.');
    expect(narrativeToText(describeVentaglioFooter(3.04, 'none'))).not.toContain('tratteggiata');
  });

  it('Tappe footer: the row figure under the percentage (fire), the one figure for all rows (fixed), nothing (none)', () => {
    expect(narrativeToText(describeTappeFooter('fire'))).toContain('Sotto la percentuale, il numero FIRE di quell’anno');
    expect(narrativeToText(describeTappeFooter('fixed', 1_000_000)).replace(/\s/g, " ")).toContain('La soglia è la stessa per ogni riga: 1.000.000 € di oggi.');
    expect(narrativeToText(describeTappeFooter('none'))).not.toContain('soglia');
  });

  it('Scenari footer names the threshold only when there is one', () => {
    expect(narrativeToText(projectionScenariFooter('fire'))).toContain('probabilità di superare la soglia');
    expect(narrativeToText(projectionScenariFooter('none'))).not.toContain('soglia');
  });

  it('the field hint has three states and the seed placeholder says today, then year by year', () => {
    expect(PROJECTION_THRESHOLD_HINT_FIRE).toContain('numero FIRE del Calcolatore, anno per anno');
    expect(PROJECTION_THRESHOLD_HINT_FIRE).toContain('non segue il capitale e il versamento');
    expect(PROJECTION_THRESHOLD_HINT_FIXED).toBe('una cifra fissa in euro di oggi');
    expect(PROJECTION_THRESHOLD_HINT_EMPTY).toContain('scrivi una soglia');
    expect(describeFireThresholdPlaceholder(606_961).replace(/\s/g, " ")).toBe('oggi 606.961 €');
  });
});

