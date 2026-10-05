/**
 * «Il mio piano» (doc/fire-ipotesi/README.md § 15, H1): the pure layer of the page's one draft — the form from the saved
 * settings, the overlay every tab previews (RP3), the payload of the one save (RP4, T8), the fixed «Agisce su» lines
 * (RP1, T12) and the links (RP10).
 */
import { describe, it, expect, vi } from 'vitest';

// The view layer formats through chartService, which top-level-imports the client Firebase SDK (mocked like coastFireView.test.ts).
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));

import {
  FIRE_PLAN_AFFECTS,
  FIRE_PLAN_FIELD_IDS,
  applyPlanOverlay,
  buildPlanOverlay,
  buildPlanPayload,
  describePlanFlows,
  describePlanSpending,
  describePlanYou,
  isFirePlanField,
  isFireTab,
  isPlanDirty,
  planFormFromSettings,
  planSeedKey,
  validateFirePlan,
} from '@/lib/utils/firePlan';
import { narrativeToText } from '@/lib/utils/narrative';
import type { DatedFlow } from '@/types/assets';
import type { Settings } from '@/types/settings';

const FLOW: DatedFlow = { id: 'f1', label: 'Eredità', kind: 'lumpIn', amount: 100_000, indexed: false, start: { anchor: 'year', year: 2036 }, durationYears: null };

const SAVED = {
  targets: {},
  userAge: 45,
  coastFireRetirementAge: 60,
  withdrawalRate: 3.5,
  plannedAnnualExpenses: 25_200,
  fireEmergencyFund: 30_000,
  fireDatedFlows: [FLOW],
  coastFirePensions: [{ id: 'p1', label: 'INPS', grossMonthlyAmount: 1500, monthsPerYear: 13, startDate: '2060-01-01' }],
  respectPensionLockInFire: true,
  pensionInpsRetirementAge: 67,
  pensionRitaLongUnemployment: false,
} as unknown as Settings;

const YEAR = 2026;

describe('planFormFromSettings', () => {
  it('turns the saved settings into the form strings', () => {
    const form = planFormFromSettings(SAVED);
    expect(form).toMatchObject({
      userAge: '45',
      targetAge: '60',
      plannedExpenses: '25200',
      withdrawalRate: '3.5',
      emergencyFund: '30000',
      fundDerived: false,
      respectPensionLock: true,
      inpsRetirementAge: '67',
      ritaLongUnemployment: false,
    });
    expect(form.datedFlows).toEqual([FLOW]);
    expect(form.pensions).toHaveLength(1);
  });

  it('seeds the defaults when nothing is saved: 4% SWR, target age 60, INPS 67, empty age and expense', () => {
    expect(planFormFromSettings(null)).toMatchObject({ userAge: '', targetAge: '60', plannedExpenses: '', withdrawalRate: '4', emergencyFund: '', inpsRetirementAge: '67', respectPensionLock: false });
  });

  it('shows the legacy custom expense as the plan expense, and a legacy share as a derived fund (RE5)', () => {
    const form = planFormFromSettings({ coastFireCustomExpenses: 29_000, fireCashToInvestPct: 35 } as Settings);
    expect(form.plannedExpenses).toBe('29000');
    expect(form.fundDerived).toBe(true);
    expect(form.emergencyFund).toBe('');
  });

  it('the seed key ignores what the plan does not edit', () => {
    expect(planSeedKey(SAVED)).toBe(planSeedKey({ ...SAVED, targets: { equity: { targetPercentage: 10 } } } as unknown as Settings));
    expect(planSeedKey(SAVED)).not.toBe(planSeedKey({ ...SAVED, withdrawalRate: 4 }));
  });
});

describe('isPlanDirty and the overlay (RP3, T6)', () => {
  const seed = planFormFromSettings(SAVED);

  it('is clean on the seed and dirty on any edited field', () => {
    expect(isPlanDirty(seed, seed)).toBe(false);
    expect(isPlanDirty({ ...seed, plannedExpenses: '30000' }, seed)).toBe(true);
    expect(isPlanDirty({ ...seed, respectPensionLock: false }, seed)).toBe(true);
    expect(isPlanDirty({ ...seed, datedFlows: [] }, seed)).toBe(true);
  });

  it('a typed expense reaches the settings the tabs read; the other fields stay the saved ones (T6)', () => {
    const overlay = buildPlanOverlay({ ...seed, plannedExpenses: '30000' }, seed);
    expect(overlay).toEqual({ plannedAnnualExpenses: 30_000, coastFireCustomExpenses: undefined });
    const previewed = applyPlanOverlay(SAVED, overlay);
    expect(previewed?.plannedAnnualExpenses).toBe(30_000);
    expect(previewed?.withdrawalRate).toBe(3.5);
  });

  it('the saved object is returned untouched when there is nothing to lay over', () => {
    expect(applyPlanOverlay(SAVED, null)).toBe(SAVED);
  });

  it('an emptied expense and an emptied fund remove the fields (D5, RE6), and a typed fund silences the legacy share (RE5)', () => {
    const emptied = buildPlanOverlay({ ...seed, plannedExpenses: '', emergencyFund: '' }, seed);
    expect(emptied.plannedAnnualExpenses).toBeUndefined();
    expect('plannedAnnualExpenses' in emptied).toBe(true);
    expect(emptied.fireEmergencyFund).toBeUndefined();
    expect('fireCashToInvestPct' in emptied).toBe(true);
  });

  it('an invalid value stays out of the preview: the saved one stands', () => {
    const overlay = buildPlanOverlay({ ...seed, withdrawalRate: '0', inpsRetirementAge: '90', plannedExpenses: '-5', targetAge: '40' }, seed);
    expect(overlay).toEqual({});
  });

  it('pensions, flows, lock and RITA edits enter the overlay', () => {
    const overlay = buildPlanOverlay({ ...seed, datedFlows: [], respectPensionLock: false, ritaLongUnemployment: true, inpsRetirementAge: '65', pensions: [] }, seed);
    expect(overlay).toEqual({ fireDatedFlows: [], respectPensionLockInFire: false, pensionRitaLongUnemployment: true, pensionInpsRetirementAge: 65, coastFirePensions: [] });
  });
});

describe('validateFirePlan', () => {
  const seed = planFormFromSettings(SAVED);

  it('passes the saved form', () => {
    expect(validateFirePlan(seed, YEAR)).toEqual({});
  });

  it('says each problem at its own field', () => {
    const problems = validateFirePlan({ ...seed, userAge: '17', targetAge: '', withdrawalRate: '101', plannedExpenses: '0', emergencyFund: '-1', inpsRetirementAge: '59' }, YEAR);
    expect(Object.keys(problems).sort()).toEqual(['emergencyFund', 'inpsRetirementAge', 'plannedExpenses', 'targetAge', 'userAge', 'withdrawalRate']);
  });

  it('a target age must be above the typed age', () => {
    expect(validateFirePlan({ ...seed, targetAge: '45' }, YEAR).targetAge).toContain('sopra la tua (45)');
    expect(validateFirePlan({ ...seed, userAge: '', targetAge: '45' }, YEAR).targetAge).toBeUndefined();
  });
});

describe('buildPlanPayload — the one save (RP4, T8)', () => {
  const seed = planFormFromSettings(SAVED);

  it('writes every Piano field together', () => {
    const result = buildPlanPayload({ ...seed, plannedExpenses: '30000' }, { derivedFund: undefined, currentYear: YEAR });
    expect(result.problem).toBeNull();
    expect(result.payload).toMatchObject({
      withdrawalRate: 3.5,
      userAge: 45,
      coastFireRetirementAge: 60,
      plannedAnnualExpenses: 30_000,
      fireEmergencyFund: 30_000,
      fireCashToInvestPct: undefined,
      fireDatedFlows: [FLOW],
      coastFireCustomExpenses: undefined,
      respectPensionLockInFire: true,
      pensionInpsRetirementAge: 67,
      pensionRitaLongUnemployment: false,
    });
    expect(Object.keys(result.payload!).sort()).toEqual(
      [
        'coastFireCustomExpenses', 'coastFirePensions', 'coastFireRetirementAge', 'fireCashToInvestPct', 'fireDatedFlows', 'fireEmergencyFund',
        'pensionInpsRetirementAge', 'pensionRitaLongUnemployment', 'plannedAnnualExpenses', 'respectPensionLockInFire', 'userAge', 'withdrawalRate',
      ].sort(),
    );
    expect(result.payload!.coastFirePensions).toHaveLength(1);
  });

  it('removes an emptied expense and an emptied fund (the keys stay, undefined)', () => {
    const { payload } = buildPlanPayload({ ...seed, plannedExpenses: '', emergencyFund: '' }, { derivedFund: undefined, currentYear: YEAR });
    expect(payload).toMatchObject({ plannedAnnualExpenses: undefined, fireEmergencyFund: undefined });
    expect(payload && 'plannedAnnualExpenses' in payload).toBe(true);
  });

  it('fixes a legacy share in euro, to the euro (RE5, E17)', () => {
    const legacy = planFormFromSettings({ fireCashToInvestPct: 35 } as Settings);
    expect(buildPlanPayload(legacy, { derivedFund: 12_345.67, currentYear: YEAR }).payload?.fireEmergencyFund).toBe(12_346);
    expect(buildPlanPayload(legacy, { derivedFund: null, currentYear: YEAR }).payload?.fireEmergencyFund).toBeUndefined();
  });

  it('rounds a typed fund to the euro; 0 is a value, not an absence (E13)', () => {
    expect(buildPlanPayload({ ...seed, emergencyFund: '0' }, { derivedFund: undefined, currentYear: YEAR }).payload?.fireEmergencyFund).toBe(0);
    expect(buildPlanPayload({ ...seed, emergencyFund: '1000,6' }, { derivedFund: undefined, currentYear: YEAR }).payload?.fireEmergencyFund).toBe(1001);
  });

  it('refuses a form that is not valid, with the sentence the toast shows', () => {
    expect(buildPlanPayload({ ...seed, withdrawalRate: '' }, { derivedFund: undefined, currentYear: YEAR })).toEqual({ payload: null, problem: 'Inserisci un SWR valido, sopra 0 e fino a 100' });
    expect(buildPlanPayload({ ...seed, targetAge: '40' }, { derivedFund: undefined, currentYear: YEAR }).problem).toBe("Inserisci un'età obiettivo sopra la tua (45) e fino a 100");
    expect(buildPlanPayload({ ...seed, inpsRetirementAge: '80' }, { derivedFund: undefined, currentYear: YEAR }).problem).toContain('INPS');
  });
});

describe('«Agisce su» (RP1, T12) and the links (RP10)', () => {
  it('says on which tabs each field acts, word for word', () => {
    expect(FIRE_PLAN_AFFECTS.age).toBe('Agisce su: tutte le schede');
    expect(FIRE_PLAN_AFFECTS.targetAge).toBe('Agisce su: Calcolatore, Coast FIRE, What If');
    expect(FIRE_PLAN_AFFECTS.expenses).toBe('Agisce su: tutte le schede');
    expect(FIRE_PLAN_AFFECTS.pensions).toBe("Agisce su: Calcolatore, Coast FIRE, What If, Dopo il FIRE (negli Obiettivi solo l'Effetto sul FIRE)");
    expect(FIRE_PLAN_AFFECTS.flows).toBe("Agisce su: tutte le schede (negli Obiettivi solo l'Effetto sul FIRE)");
  });

  it('knows the fields and the tabs a link can name', () => {
    for (const field of Object.keys(FIRE_PLAN_FIELD_IDS)) expect(isFirePlanField(field)).toBe(true);
    expect(isFirePlanField('aperto')).toBe(false);
    expect(isFirePlanField(null)).toBe(false);
    for (const tab of ['fire', 'coast', 'whatif', 'montecarlo', 'proiezione', 'goals']) expect(isFireTab(tab)).toBe(true);
    expect(isFireTab('piano')).toBe(false);
  });

  it('the control ids of the fields are unique (T13)', () => {
    const ids = Object.values(FIRE_PLAN_FIELD_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the tiles\' readings (RP2)', () => {
  it('Tu', () => {
    expect(narrativeToText(describePlanYou(45, 60))).toBe('45 anni oggi, obiettivo 60');
    expect(narrativeToText(describePlanYou(null, 60))).toContain('Scrivi la tua età');
    expect(narrativeToText(describePlanYou(45, null))).toContain('manca');
  });

  it('Spesa e prelievo', () => {
    expect(narrativeToText(describePlanSpending({ expense: 25_200, fromCashflow: false, swr: 3.5 }))).toMatch(/Spesa 25\.200\s?€ l'anno, del piano, SWR 3,5%/);
    expect(narrativeToText(describePlanSpending({ expense: 25_200, fromCashflow: true, swr: null }))).toContain('dal Cashflow');
    expect(narrativeToText(describePlanSpending({ expense: null, fromCashflow: true, swr: 4 }))).toContain('Nessuna spesa');
  });

  it('Flussi nel tempo', () => {
    expect(narrativeToText(describePlanFlows(0, 0))).toContain('Nessun flusso');
    expect(narrativeToText(describePlanFlows(4, 0))).toBe('4 flussi in uso.');
    expect(narrativeToText(describePlanFlows(1, 1))).toBe('1 flusso in uso, uno escluso: il motivo è sulla riga.');
  });
});
