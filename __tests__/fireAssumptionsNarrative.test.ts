import { describe, expect, it, vi } from 'vitest';

// The narrative formats through chartService, which top-level-imports the client Firebase SDK.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { buildPortfolioScenarios, type FireAssumptions } from '@/lib/utils/fireAssumptions';
import { describeFireAssumptions } from '@/lib/utils/fireAssumptionsNarrative';
import { resolveMonteCarloMarket } from '@/lib/utils/monteCarloMarket';
import { narrativeToText } from '@/lib/utils/narrative';

const market = resolveMonteCarloMarket(null);
const build = (partial: Partial<FireAssumptions>, weights = monteCarloClassRecord<number>((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0))): FireAssumptions => ({
  scenarios: buildPortfolioScenarios(weights, market),
  weights,
  weightsOrigin: 'targets',
  leverage: 1,
  market,
  ...partial,
});

describe('describeFireAssumptions', () => {
  it('reads the target portfolio: Base with its real return, Bear, Bull, inflation (A3, A10)', () => {
    expect(narrativeToText(describeFireAssumptions(build({})))).toBe('Portafoglio target · Base 8,3% (reale 5,1%), Bear 6,0%, Bull 11,1% · inflazione 3,0%');
  });

  it('says it when there is no target and the portfolio held today stands in', () => {
    expect(narrativeToText(describeFireAssumptions(build({ weightsOrigin: 'holdings' })))).toMatch(/^Portafoglio di oggi \(nessun target in Allocazione\) · Base 8,3%/);
  });

  it('says it when there is no asset at all', () => {
    expect(narrativeToText(describeFireAssumptions(build({ weightsOrigin: 'default' })))).toMatch(/^Portafoglio 60\/40 predefinito/);
  });

  it('names the leverage when the weights sum above 100% (A6)', () => {
    const weights = monteCarloClassRecord<number>((cls) => (cls === 'equity' ? 90 : cls === 'bonds' ? 60 : 0));
    expect(narrativeToText(describeFireAssumptions(build({ leverage: 1.5 }, weights)))).toBe('Portafoglio target · Base 9,2% (reale 6,0%), Bear 6,6%, Bull 12,7% · inflazione 3,0% · leva 1,5×');
  });
});
