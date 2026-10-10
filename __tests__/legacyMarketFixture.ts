/**
 * The engines' fixture: the nominal-USD market of format v1 (the defaults before doc/montecarlo/README.md § 14),
 * WRITTEN HERE so that a change of the product defaults never moves a test of the engines (S10 and the others).
 */
import type { MonteCarloMarketScenario, MonteCarloMarketScenarios } from '@/types/assets';
import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';

type Triple = { bear: [number, number]; base: [number, number]; bull: [number, number] };

const TABLE: Record<MonteCarloClass, Triple> = {
  equity: { bear: [8.01, 17.02], base: [10.02, 19.4], bull: [12.19, 21.33] },
  bonds: { bear: [2.08, 5.69], base: [4.53, 7.9], bull: [8.01, 11.05] },
  gold: { bear: [2.94, 27.31], base: [8.89, 27.31], bull: [15.19, 27.31] },
  commodity: { bear: [-1.98, 22.46], base: [2.98, 22.46], bull: [8.19, 22.46] },
  cash: { bear: [1.81, 4.1], base: [3.37, 3.04], bull: [4.8, 2.38] },
  trendFollowing: { bear: [4.64, 7.9], base: [6.46, 7.9], bull: [8.32, 7.9] },
  carry: { bear: [1.47, 18.41], base: [5.6, 18.41], bull: [9.9, 18.41] },
};

function scenario(key: 'bear' | 'base' | 'bull'): MonteCarloMarketScenario {
  const classes = {} as MonteCarloMarketScenario['classes'];
  for (const cls of Object.keys(TABLE) as MonteCarloClass[]) {
    const [cagr, volatility] = TABLE[cls][key];
    classes[cls] = { cagr, volatility };
  }
  return { classes, inflationRate: 3.04 };
}

/** The old `getDefaultMonteCarloMarket()`: `.scenarios` is what the engines read. */
export function getDefaultMonteCarloMarket(): { version: 1; scenarios: MonteCarloMarketScenarios } {
  return { version: 1, scenarios: { bear: scenario('bear'), base: scenario('base'), bull: scenario('bull') } };
}

/** The old default correlations (R0, 1928–2025). */
export const MONTE_CARLO_DEFAULT_CORRELATIONS: readonly number[] = [
  0.0224, -0.1676, 0.2441, -0.0043, -0.2708, -0.2868,
  -0.0586, -0.1891, 0.2664, 0.1022, 0.2108,
  0.1615, -0.0072, 0.1658, -0.0069,
  0.1645, 0.1763, -0.2316,
  0.0817, 0.3524,
  -0.0008,
];

export function getDefaultMonteCarloCorrelations(): number[] {
  return [...MONTE_CARLO_DEFAULT_CORRELATIONS];
}
