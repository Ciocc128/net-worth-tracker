/**
 * Tests for lib/utils/accumuloSummary.ts — the five states of the Accumulo tab's verdict (RV3, PT4)
 * and the clause the Bilanciamento verdict borrows (RV2).
 */
import { describe, it, expect } from 'vitest';
import { narrativeToText } from '@/lib/utils/narrative';
import { buildAccumuloVerdict, stepTrajectoryCursor, summarizePacMonth } from '@/lib/utils/accumuloSummary';
import type { AccumulationPlan, InstallmentLine } from '@/types/accumulationPlan';

const flat = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

function line(positionId: string, amount: number, status: InstallmentLine['status'] = 'planned'): InstallmentLine {
  return { positionId, assetId: positionId, plannedQuantity: 10, priceEurAtPlan: amount / 10, plannedAmountEur: amount, status };
}

function plan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'p',
    userId: 'u',
    name: 'Piano',
    status: 'active',
    startMonth: '2026-08',
    months: 12,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [],
    disposals: [],
    installments: [],
    createdAt: new Date('2026-07-01T12:00:00'),
    updatedAt: new Date('2026-07-01T12:00:00'),
    ...overrides,
  } as AccumulationPlan;
}

/** 12 installments from 2026-08; installment 3 (ottobre) has four lines. */
function activePlan(lines: InstallmentLine[]): AccumulationPlan {
  const installments = Array.from({ length: 12 }, (_, k) => ({
    index: k + 1,
    month: `2026-${String(8 + k > 12 ? 8 + k - 12 : 8 + k).padStart(2, '0')}` as `${number}-${number}`,
    lines: k + 1 === 3 ? lines : [line('a', 1000, 'executed')],
    carryInEur: {},
  }));
  return plan({ installments });
}

const base = { currentIndex: 3, sourceCashEur: 36500, hasModel: false, lineStates: {}, draftTotalEur: 0, reentry: '' };

describe('buildAccumuloVerdict', () => {
  it('no plan, with and without a model', () => {
    const without = buildAccumuloVerdict({ ...base, plan: undefined });
    expect(without.headline).toBe('Nessun piano di accumulo aperto.');
    expect(without.tone).toBe('neutral');
    expect(flat(narrativeToText(without.sentence))).toBe('Nei conti di liquidità hai 36.500 €: un piano li spende in rate mensili verso i pesi che scegli.');
    const withModel = buildAccumuloVerdict({ ...base, plan: undefined, hasModel: true });
    expect(flat(narrativeToText(withModel.sentence))).toContain('verso il portafoglio modello');
  });

  it('draft', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: plan({ status: 'draft', startMonth: '2026-11' }), draftTotalEur: 38496 });
    expect(flat(verdict.headline)).toBe('Bozza pronta: 12 rate da 3208 € da novembre.');
    expect(narrativeToText(verdict.sentence)).toBe('Attivala per fissare il calendario.');
    expect(verdict.tone).toBe('neutral');
  });

  it('active, one executed and one to confirm', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 800), line('c', 700), line('d', 634)]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p, lineStates: { '3:b': 'toConfirm' } });
    expect(flat(verdict.headline)).toBe('Ottobre: 3134 € in 4 acquisti, 1 registrato e 1 da confermare.');
    expect(flat(narrativeToText(verdict.sentence))).toMatch(/^Rata 3 di 12, investiti finora .* su .*\.$/);
    expect(verdict.tone).toBe('neutral');
  });

  it('active, everything registered closes the month in the positive tone', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 2134, 'executed')]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p });
    expect(flat(verdict.headline)).toBe('Ottobre: 3134 € in 2 acquisti, tutti registrati.');
    expect(verdict.tone).toBe('positive');
  });

  it('active, a late line adds «, 1 in ritardo» and warns', () => {
    const installments = activePlan([line('a', 1000)]).installments;
    installments[0] = { ...installments[0], lines: [line('z', 500)] };
    const verdict = buildAccumuloVerdict({ ...base, plan: plan({ installments }) });
    expect(verdict.headline).toContain(', 1 in ritardo.');
    expect(verdict.tone).toBe('warning');
  });

  it('appends the re-entry sentence', () => {
    const p = activePlan([line('a', 1000)]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p, reentry: 'Tutte le classi sono già in banda.' });
    expect(flat(narrativeToText(verdict.sentence))).toMatch(/\. Tutte le classi sono già in banda\.$/);
  });

  it('done', () => {
    const p = activePlan([line('a', 1000, 'executed')]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p, currentIndex: 14 });
    expect(verdict.headline).toMatch(/^Piano concluso: investiti .* su .*\.$/);
    expect(verdict.tone).toBe('positive');
    expect(narrativeToText(verdict.sentence)).toBe('Chiudilo per aprirne un altro.');
  });
});

describe('summarizePacMonth', () => {
  it('sums the open installment and counts its positions', () => {
    const p = activePlan([line('a', 1000), line('b', 800), line('c', 700), line('d', 634)]);
    expect(summarizePacMonth(p, 3)).toEqual({ monthTotalEur: 3134, instrumentCount: 4, monthLabel: 'ottobre', allClosed: false });
  });

  it('skipped lines do not count, a closed month says so', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 800, 'skipped')]);
    expect(summarizePacMonth(p, 3)).toEqual({ monthTotalEur: 1000, instrumentCount: 1, monthLabel: 'ottobre', allClosed: true });
  });

  it('is null without an active plan', () => {
    expect(summarizePacMonth(undefined, 3)).toBeNull();
    expect(summarizePacMonth(plan({ status: 'draft' }), 1)).toBeNull();
  });
});

describe('stepTrajectoryCursor (PT6)', () => {
  it('moves one month with the arrows and stops at 0 and N', () => {
    expect(stepTrajectoryCursor(3, 'ArrowRight', 13)).toBe(4);
    expect(stepTrajectoryCursor(3, 'ArrowLeft', 13)).toBe(2);
    expect(stepTrajectoryCursor(0, 'ArrowLeft', 13)).toBe(0);
    expect(stepTrajectoryCursor(12, 'ArrowRight', 13)).toBe(12);
    expect(stepTrajectoryCursor(5, 'Home', 13)).toBe(0);
    expect(stepTrajectoryCursor(5, 'End', 13)).toBe(12);
  });

  it('ignores any other key', () => {
    expect(stepTrajectoryCursor(3, 'a', 13)).toBeNull();
  });
});
