import { describe, expect, it, vi } from 'vitest';

// The narrative formats through chartService, which top-level-imports the client Firebase SDK.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { buildPortfolioScenarios, type FireAssumptions } from '@/lib/utils/fireAssumptions';
import { describeCapitalRow, describeCostsChip, describeExpensesChip, describeFireChips, describeReturnsChip } from '@/lib/utils/fireAssumptionsNarrative';
import { resolveMonteCarloMarket } from '@/lib/utils/monteCarloMarket';

const market = resolveMonteCarloMarket(null);
const build = (partial: Partial<FireAssumptions>, weights = monteCarloClassRecord<number>((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0))): FireAssumptions => ({
  scenarios: buildPortfolioScenarios(weights, market),
  weights,
  weightsOrigin: 'targets',
  leverage: 1,
  market,
  ...partial,
});

describe('the Rendimenti chip (RC3, A3, A10)', () => {
  it('reads the target portfolio: Base with its real return; Bear, Bull and inflation in the popover', () => {
    const chip = describeReturnsChip(build({}));
    expect(chip.label).toBe('Rendimento Base 6,6% · reale 4,5%');
    expect(chip.lines).toEqual(['Portafoglio target', 'Bear 3,7%, Bull 9,6% (15° e 85° percentile a 30 anni del portafoglio, con l’incertezza sulle stime)', 'Inflazione 2,0%']);
    expect(chip.links[0]).toMatchObject({ href: '/dashboard/settings?tab=simulazioni' });
  });

  it('says it when there is no target and the portfolio held today stands in', () => {
    expect(describeReturnsChip(build({ weightsOrigin: 'holdings' })).lines[0]).toBe('Portafoglio di oggi (nessun target in Allocazione)');
  });

  it('says it when there is no asset at all', () => {
    expect(describeReturnsChip(build({ weightsOrigin: 'default' })).lines[0]).toMatch(/^Portafoglio 60\/40 predefinito/);
  });

  it('names the leverage when the weights sum above 100% (A6)', () => {
    const weights = monteCarloClassRecord<number>((cls) => (cls === 'equity' ? 90 : cls === 'bonds' ? 60 : 0));
    const chip = describeReturnsChip(build({ leverage: 1.5 }, weights));
    expect(chip.label).toBe('Rendimento Base 7,2% · reale 5,1%');
    expect(chip.lines.at(-1)).toBe('Leva 1,5×');
  });
});

describe('the other chips and the capital row (RC1–RC5, T11)', () => {
  const capital = { total: 430_000, portfolio: 400_000, cashToInvest: { used: 30_000 }, outside: { cash: 30_000, cashIsFund: true, otherExcluded: 0, realestate: 250_000, crypto: 10_000 } } as never;

  it('prints no chip for what the tab has not read yet, never a «—»', () => {
    expect(describeCostsChip(build({}))).toBeNull();
    expect(describeExpensesChip(build({}))).toBeNull();
    expect(describeCapitalRow(build({}))).toBeNull();
    expect(describeFireChips(build({})).map((chip) => chip.id)).toEqual(['returns']);
  });

  it('says the capital and its breakdown on a line of its own (E14)', () => {
    const row = describeCapitalRow(build({ capital }));
    expect(row?.figure.replace(/\u00a0/g, ' ')).toBe('430.000 €');
    expect(row?.breakdown.replace(/\u00a0/g, ' ')).toBe('portafoglio 400.000 € + 30.000 € di liquidità oltre il fondo; fuori: fondo di emergenza 30.000 €, Immobili 250.000 €, Crypto 10.000 €');
  });

  it('says the expenses and where they come from', () => {
    const typed = describeExpensesChip(build({ expenses: { annual: 25_200, origin: 'settings' } }));
    expect(typed?.label.replace(/\u00a0/g, ' ')).toBe('Spesa 25.200 €');
    expect(typed?.lines).toEqual(['Spesa del piano, da Il mio piano']);
    expect(typed?.links[0]).toEqual({ text: 'Il mio piano', planField: 'spesa' });
    expect(describeExpensesChip(build({ expenses: { annual: 0, origin: 'cashflow' } as never }))?.label).toBe('Spesa non rilevata');
  });

  it('says the costs, the three readings, and offers the stamp duty when it is off', () => {
    const costs = (anyTer: boolean, stamp: boolean) => build({ cost: { total: 0.36, ter: 0.16, stampDuty: 0.2 } as never, costs: { anyTer, stampDutyEnabled: stamp } as never });
    expect(describeCostsChip(costs(true, true))?.label).toBe('Costi 0,36%');
    expect(describeCostsChip(costs(true, false))?.links[0].text).toBe('Attiva il bollo');
    expect(describeCostsChip(costs(false, false))?.label).toBe('Nessun costo');
  });
});
