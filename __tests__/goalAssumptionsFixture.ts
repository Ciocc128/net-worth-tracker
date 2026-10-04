/**
 * The page's hypotheses for the goal tests: the Impostazioni defaults and a 60/40 target portfolio
 * (doc/fire-ipotesi/README.md A3: Base 8,2623% compound). Import after the firebase mocks.
 */
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import { buildPortfolioScenarios } from '@/lib/utils/fireAssumptions';
import type { GoalAssumptions } from '@/lib/utils/goalTrajectory';
import { resolveMonteCarloMarket } from '@/lib/utils/monteCarloMarket';

export const GOAL_TEST_MARKET = resolveMonteCarloMarket(null);
const weights6040 = monteCarloClassRecord<number>((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0));

export const GOAL_TEST_ASSUMPTIONS: GoalAssumptions = {
  market: GOAL_TEST_MARKET,
  scenarios: buildPortfolioScenarios(weights6040, GOAL_TEST_MARKET),
};
