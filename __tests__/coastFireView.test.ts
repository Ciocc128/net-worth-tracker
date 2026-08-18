import { describe, it, expect, vi } from 'vitest';

// The view layer formats through chartService, which top-level-imports the client Firebase SDK.
// Mocked away exactly like __tests__/fireService.test.ts does for the same reason.
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));

import {
  buildBaseScenarioInterpretation,
  buildCoastBasisParts,
  buildCoastCoverageSteps,
  buildCoastInflowEvents,
  buildCoastVerdict,
  buildPensionDraftIssues,
  buildPensionSnapshotKey,
  getPensionConfigurationState,
  parsePensionDrafts,
  resolveCoastHeroValueClass,
  resolveCoastIncompleteReason,
  toPensionDrafts,
  type CoastFirePensionDraft,
} from '@/lib/utils/coastFireView';
import {
  calculateCoastFIREProjection,
  getDefaultCoastFireTaxBrackets,
  getDefaultScenarios,
} from '@/lib/services/fireService';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';

/**
 * The fixture the Playwright suite runs on, with a FIXED reference date so every figure is
 * reproducible: age 35 → Coast target 60, two state pensions after the target, and a pension
 * fund unlocking at 22 years (the bridge model).
 */
const REFERENCE_DATE = new Date('2026-08-18T12:00:00Z');
const PENSIONS = [
  {
    id: 'inps',
    label: 'Pensione INPS',
    grossMonthlyAmount: 2200,
    monthsPerYear: 13,
    startDate: '2058-01-01',
  },
  {
    id: 'estera',
    label: 'Pensione estera',
    grossMonthlyAmount: 600,
    monthsPerYear: 12,
    startDate: '2052-06-01',
  },
];
const PENSION_FUND_INFLOWS = [{ yearsFromNow: 22, amountToday: 29_800 }];

function buildProjection() {
  return calculateCoastFIREProjection(
    51_955,
    30_000,
    4,
    35,
    60,
    getDefaultScenarios(),
    PENSIONS,
    getDefaultCoastFireTaxBrackets(),
    REFERENCE_DATE,
    PENSION_FUND_INFLOWS
  );
}

describe('coastFireView — the hero verdict', () => {
  it('should report the shortfall, the patrimonio and the target verbatim from the base scenario', () => {
    const base = buildProjection().scenarios.base;
    const verdict = buildCoastVerdict(base, 51_955, null);

    expect(verdict.tone).toBe('neutral');
    expect(verdict.headline).toBe('Non ancora: continua a versare.');
    // The dominant value IS the scenario's own gap — never a subtraction done here.
    expect(verdict.heroValue).toBe(formatCurrency(base.gapToCoastFI));
    expect(verdict.detail).toContain(formatCurrency(51_955));
    expect(verdict.detail).toContain(formatPercentage(base.progressToCoastFI));
    expect(verdict.detail).toContain(formatCurrency(base.coastFireNumberToday));
  });

  it('should switch to the surplus once the Coast number is behind', () => {
    const base = buildProjection().scenarios.base;
    const netWorth = base.coastFireNumberToday + 10_000;
    const verdict = buildCoastVerdict({ ...base, isCoastReached: true }, netWorth, null);

    expect(verdict.tone).toBe('positive');
    expect(verdict.headline).toBe('Sì, puoi smettere di versare.');
    expect(verdict.heroValue).toBe(formatCurrency(10_000));
    expect(verdict.heroQualifier).toBe('oltre il Coast FIRE Number');
  });

  it('should carry the incomplete reason instead of inventing an answer', () => {
    const verdict = buildCoastVerdict(null, 0, 'Serve un patrimonio FIRE positivo.');

    expect(verdict.heroValue).toBe('—');
    expect(verdict.tone).toBe('muted');
    expect(verdict.detail).toBe('Serve un patrimonio FIRE positivo.');
  });

  it('should step the hero size down only for long strings', () => {
    expect(resolveCoastHeroValueClass('9.999,00 €')).toContain('text-[44px]');
    expect(resolveCoastHeroValueClass('1.234.567,00 €')).toContain('text-[32px]');
  });
});

describe('coastFireView — the basis line', () => {
  it('should name every assumption, unlock year included', () => {
    const parts = buildCoastBasisParts({
      currentAge: 35,
      retirementAge: 60,
      annualExpenses: 30_000,
      usesCustomExpenses: true,
      withdrawalRate: 4,
      baseRealReturn: 4.5,
      respectPensionLockIn: true,
      pensionUnlockCalendarYear: 2048,
    });

    expect(parts).toEqual([
      '35 anni → target 60',
      `spese ${formatCurrency(30_000)} (personalizzate)`,
      `SWR ${formatPercentage(4)}`,
      `rendimento reale base ${formatPercentage(4.5)}`,
      'fondo pensione bloccato fino al 2048',
    ]);
  });

  it('should distinguish "toggle on but nothing locked" from "toggle off"', () => {
    const common = {
      currentAge: 35,
      retirementAge: 60,
      annualExpenses: 30_000,
      usesCustomExpenses: false,
      withdrawalRate: 4,
      baseRealReturn: null,
      pensionUnlockCalendarYear: null,
    };

    expect(buildCoastBasisParts({ ...common, respectPensionLockIn: true })).toContain(
      'vincolo fondo pensione attivo, nessun fondo bloccato'
    );
    expect(buildCoastBasisParts({ ...common, respectPensionLockIn: false })).toContain(
      'fondo pensione non vincolato'
    );
  });

  it('should say the expenses are the detected ones when no custom figure is used', () => {
    const parts = buildCoastBasisParts({
      currentAge: null,
      retirementAge: null,
      annualExpenses: 24_000,
      usesCustomExpenses: false,
      withdrawalRate: 3.5,
      baseRealReturn: null,
      respectPensionLockIn: false,
      pensionUnlockCalendarYear: null,
    });

    expect(parts[0]).toBe('età da impostare');
    expect(parts[1]).toBe(`spese ${formatCurrency(24_000)} (ultimo anno completo)`);
  });
});

describe('coastFireView — the inflow timeline', () => {
  it('should list state pensions and the fund unlock in calendar order', () => {
    const base = buildProjection().scenarios.base;
    const events = buildCoastInflowEvents(base.pensionBreakdown, PENSION_FUND_INFLOWS, 2026);

    expect(events.map((event) => event.year)).toEqual([2048, 2052, 2058]);
    expect(events.map((event) => event.kind)).toEqual([
      'pensionFund',
      'statePension',
      'statePension',
    ]);
  });

  it('should print each amount exactly as the scenario computed it', () => {
    const base = buildProjection().scenarios.base;
    const events = buildCoastInflowEvents(base.pensionBreakdown, PENSION_FUND_INFLOWS, 2026);
    const estera = base.pensionBreakdown.find((pension) => pension.id === 'estera')!;

    expect(events.find((event) => event.title === 'Pensione estera')?.amount).toBe(
      formatCurrency(estera.netAnnualRealAtStart)
    );
    // The fund arrives at TODAY's value — the walk grows it, the timeline must not.
    expect(events.find((event) => event.kind === 'pensionFund')?.amount).toBe(
      formatCurrency(29_800)
    );
  });

  it('should render nothing when there is neither a pension nor a locked fund', () => {
    expect(buildCoastInflowEvents([], [], 2026)).toEqual([]);
  });
});

describe('coastFireView — coverage steps and interpretation', () => {
  it('should add the steady-state step only when a bridge exists', () => {
    const base = buildProjection().scenarios.base;
    const sorted = [...base.pensionBreakdown].sort((a, b) => a.startAge - b.startAge);

    const withBridge = buildCoastCoverageSteps(base, sorted, 60, 7);
    expect(withBridge.map((step) => step.id)).toEqual(['target', 'estera', 'inps', 'steady-state']);
    expect(withBridge[0].badge).toBe(`${formatCurrency(base.retirementCapitalRequired)} richiesti`);

    const withoutBridge = buildCoastCoverageSteps(base, sorted, 60, 0);
    expect(withoutBridge.map((step) => step.id)).toEqual(['target', 'estera', 'inps']);
  });

  it('should explain the multi-pension case in terms of the phases, not of one number', () => {
    const base = buildProjection().scenarios.base;
    const lines = buildBaseScenarioInterpretation(base, 30_000, 7, 60);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('2 pensioni con decorrenze diverse');
    expect(lines[2]).toContain('ponte di 7 anni');
  });

  it('should state plainly that nothing reduces the need when no pension is configured', () => {
    const base = buildProjection().scenarios.base;
    const lines = buildBaseScenarioInterpretation({ ...base, pensionBreakdown: [] }, 30_000, 0, 60);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Nessuna pensione configurata');
  });
});

describe('coastFireView — the incomplete reason', () => {
  it('should name the first missing input in the order the calculation needs them', () => {
    expect(resolveCoastIncompleteReason(0, 30_000, 35, 60)).toContain('patrimonio FIRE positivo');
    expect(resolveCoastIncompleteReason(50_000, undefined, 35, 60)).toContain('spese annue');
    expect(resolveCoastIncompleteReason(50_000, 30_000, null, 60)).toContain('età attuale');
    expect(resolveCoastIncompleteReason(50_000, 30_000, 35, null)).toContain('età target');
    expect(resolveCoastIncompleteReason(50_000, 30_000, 35, 60)).toBeNull();
  });
});

describe('coastFireView — the configuration drafts', () => {
  it('should round-trip saved pensions through the form without marking them dirty', () => {
    const drafts = toPensionDrafts(PENSIONS, 35, REFERENCE_DATE);
    const parsed = parsePensionDrafts(drafts);

    expect(buildPensionSnapshotKey(parsed)).toBe(
      buildPensionSnapshotKey(parsePensionDrafts(toPensionDrafts(PENSIONS, 35, REFERENCE_DATE)))
    );
    expect(parsed.map((pension) => pension.label)).toEqual(['Pensione INPS', 'Pensione estera']);
  });

  it('should flag a started-but-incomplete row and leave an untouched row alone', () => {
    const drafts: CoastFirePensionDraft[] = [
      { id: 'a', label: '', grossMonthlyAmount: '', monthsPerYear: '', startDate: '' },
      { id: 'b', label: 'Estera', grossMonthlyAmount: '0', monthsPerYear: '12', startDate: '' },
    ];
    const issues = buildPensionDraftIssues(drafts, 35, 60, REFERENCE_DATE);

    expect(issues.every((issue) => issue.pensionId === 'b')).toBe(true);
    expect(issues.some((issue) => issue.message.includes('lordo mensile'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('data di decorrenza'))).toBe(true);
  });

  /**
   * `normalizeCoastFirePensions` DROPS an unusable row, so a lone broken draft leaves the parsed
   * list empty and the state reads 'empty', not 'incomplete'. 'incomplete' is the mixed case: at
   * least one pension is in the calculation while another is still being typed. Pinned because
   * the tab reopens the settings panel on 'incomplete' and would otherwise reopen on nothing.
   */
  it('should report "empty" for a lone broken row and "incomplete" only alongside a valid one', () => {
    const brokenOnly: CoastFirePensionDraft[] = [
      { id: 'b', label: 'Estera', grossMonthlyAmount: '0', monthsPerYear: '12', startDate: '' },
    ];
    expect(
      getPensionConfigurationState(
        parsePensionDrafts(brokenOnly),
        buildPensionDraftIssues(brokenOnly, 35, 60, REFERENCE_DATE)
      )
    ).toBe('empty');

    const mixed: CoastFirePensionDraft[] = [
      {
        id: 'inps',
        label: 'Pensione INPS',
        grossMonthlyAmount: '2200',
        monthsPerYear: '13',
        startDate: '2058-01-01',
      },
      ...brokenOnly,
    ];
    expect(
      getPensionConfigurationState(
        parsePensionDrafts(mixed),
        buildPensionDraftIssues(mixed, 35, 60, REFERENCE_DATE)
      )
    ).toBe('incomplete');
  });

  it('should treat a decorrenza after the target as information, not as an error', () => {
    const drafts: CoastFirePensionDraft[] = [
      {
        id: 'inps',
        label: 'Pensione INPS',
        grossMonthlyAmount: '2200',
        monthsPerYear: '13',
        startDate: '2058-01-01',
      },
    ];
    const issues = buildPensionDraftIssues(drafts, 35, 60, REFERENCE_DATE);

    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('informational');
    expect(issues[0].message).toContain('dopo il target');
    expect(getPensionConfigurationState(parsePensionDrafts(drafts), issues)).toBe('informational');
  });
});

/**
 * The acceptance criterion of the redesign: the split must not change a single rendered number. Every
 * figure the sections receive is read off the projection, so a regression here means the view
 * layer started computing instead of reading.
 */
describe('coastFireView — parity with the projection', () => {
  it('should surface only figures fireService produced', () => {
    const projection = buildProjection();
    const base = projection.scenarios.base;
    const verdict = buildCoastVerdict(base, projection.currentNetWorth, null);
    const events = buildCoastInflowEvents(base.pensionBreakdown, PENSION_FUND_INFLOWS, 2026);
    const steps = buildCoastCoverageSteps(base, base.pensionBreakdown, 60, 7);

    const rendered = [verdict.heroValue, verdict.detail, ...events.map((e) => e.amount), ...steps.map((s) => s.badge)].join(
      ' | '
    );
    const allowed = [
      base.gapToCoastFI,
      base.coastFireNumberToday,
      base.retirementCapitalRequired,
      base.steadyStatePortfolioNeed,
      projection.currentNetWorth,
      29_800,
      ...base.pensionBreakdown.map((pension) => pension.netAnnualRealAtStart),
    ].map((value) => formatCurrency(value));

    // Every euro amount printed must be one of the projection's own numbers.
    const printed = rendered.match(/[\d.]+,\d{2}\s?€/g) ?? [];
    expect(printed.length).toBeGreaterThan(0);
    printed.forEach((amount) => {
      expect(allowed.some((candidate) => candidate.replace(/\s/g, ' ') === amount.replace(/\s/g, ' '))).toBe(true);
    });
  });
});
