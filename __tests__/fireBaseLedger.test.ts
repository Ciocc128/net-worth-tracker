import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

import { buildFireLedger, type FireLedgerInput } from '@/lib/utils/fireBaseLedger';
import { getDefaultCoastFireTaxBrackets, getDefaultScenarios, resolveFireRequirement, type FireHonestInputs } from '@/lib/services/fireService';
import { buildFlowSchedule, type ResolvedFlow } from '@/lib/utils/datedFlows';

const scenario = getDefaultScenarios().base;
const NOW = new Date('2026-06-15T12:00:00');
const honest = (overrides: Partial<FireHonestInputs> = {}): FireHonestInputs => ({
  userAge: 40,
  pensions: [],
  taxBrackets: getDefaultCoastFireTaxBrackets(),
  now: NOW,
  ...overrides,
});
const inps = { id: 'inps', label: 'INPS', grossMonthlyAmount: 1500, monthsPerYear: 13, startAge: 67 };
const inheritance: ResolvedFlow = { id: 'e', label: 'Eredità', kind: 'lumpIn', sigma: 0, indexed: false, amount: 100_000, anchor: 'fixed', start: 10, durationYears: null, inCashflowToday: false };
const flows = buildFlowSchedule([inheritance], { inflationRate: scenario.inflationRate, planExpensesFromCashflow: false });
const base = { annualExpenses: 30_000, withdrawalRate: 4, scenario } as const;

const everything = (): FireLedgerInput => ({
  ...base,
  honest: honest({ pensions: [inps], withdrawalTax: { basisToday: 0, rate: 26 } }),
  gainShare: 0.2,
  bridge: { compartmentValue: 50_000, yearsToUnlock: 22 },
  flows,
});

describe('buildFireLedger (RB1, RB2, T1–T5)', () => {
  it('T1: with no ingredient it is the single line expenses ÷ SWR, the others absent', () => {
    const ledger = buildFireLedger({ ...base, honest: honest() });
    expect(ledger.base).toBe(750_000);
    expect(ledger.steps.map((step) => step.amount)).toEqual([null, null, null, null]);
    expect(ledger.total).toBe(750_000);
  });

  it('the tax step is the gross-up on the gain share', () => {
    const ledger = buildFireLedger({ ...base, honest: honest({ withdrawalTax: { basisToday: 0, rate: 26 } }), gainShare: 0.2 });
    expect(ledger.steps[0].amount).toBe(Math.round(750_000 / (1 - 0.26 * 0.2)) - 750_000);
    expect(ledger.steps.slice(1).map((step) => step.amount)).toEqual([null, null, null]);
  });

  it('T2: flows alone take the number from the base to the number the engine gives', () => {
    const ledger = buildFireLedger({ ...base, honest: honest(), flows });
    const direct = resolveFireRequirement({ ...base, yearsElapsed: 0, honest: honest(), flows }).requirement;
    expect(ledger.steps[3].amount).toBe(Math.round(direct) - 750_000);
    expect(ledger.steps[3].amount).toBeLessThan(0);
    expect(ledger.total).toBe(Math.round(direct));
  });

  it('T4: the printed steps add up to the printed number, to the euro', () => {
    const ledger = buildFireLedger(everything());
    const sum = ledger.base + ledger.steps.reduce((total, step) => total + (step.amount ?? 0), 0);
    expect(sum).toBe(ledger.total);
    expect(ledger.steps.every((step) => step.amount !== null)).toBe(true);
  });

  it('T5: the last cumulative is the requirement of the Calcolatore, in every combination of ingredients', () => {
    const full = everything();
    const combos: FireLedgerInput[] = [
      full,
      { ...full, flows: undefined },
      { ...full, bridge: undefined },
      { ...full, honest: honest({ pensions: [inps] }) },
      { ...full, honest: honest({ withdrawalTax: { basisToday: 0, rate: 26 } }), bridge: undefined },
      { ...base, honest: honest() },
    ];
    for (const combo of combos) {
      const { honest: h, bridge, flows: f, gainShare } = combo;
      const direct = resolveFireRequirement({ ...base, yearsElapsed: 0, honest: h, bridge, flows: f, gainShare }).requirement;
      const ledger = buildFireLedger(combo);
      expect(ledger.cumulative[4]).toBeCloseTo(direct, 6);
      const sum = ledger.base + ledger.steps.reduce((total, step) => total + (step.amount ?? 0), 0);
      expect(sum).toBe(ledger.total);
    }
  });

  it('the locked fund steps down the number, the pensions too', () => {
    const ledger = buildFireLedger(everything());
    expect(ledger.steps[1].amount).toBeLessThan(0);
    expect(ledger.steps[2].amount).toBeLessThan(0);
  });
});
