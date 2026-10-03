/**
 * The hypotheses of the FIRE page — ONE reading every tab goes through (doc/fire-ipotesi/README.md § 4.1).
 *
 * The deterministic tabs (Calcolatore, Coast, What If) used to run on three hand-typed rates, the
 * Monte Carlo on the per-class assumptions of Impostazioni › Simulazioni. Now all of them read the
 * rate of the TARGET portfolio computed on those per-class assumptions:
 *
 *   RP1  `portfolioCompoundReturn`: the compound (median) return of the portfolio per scenario — R2
 *        applied to the portfolio, so a 100% class returns exactly its CAGR and the volatility drag is in.
 *   RP2  `realReturn`: Fisher, `(1 + g) / (1 + π) − 1`, never the subtraction.
 *   RP3  the inflation of the scenario is the one of Impostazioni › Simulazioni.
 *   RP4  the weights: the effective targets of Allocazione (R6), else the portfolio held today.
 *
 * Pure: every collaborator is another pure module (`toLogNormal`, the correlation matrix, the weights seeds).
 */
import type { Asset, AssetAllocationSettings, FIREScenarioParams, MonteCarloMarketScenario } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { resolveEffectiveTargets } from './allocationComparison';
import { expandUpperTriangle, identityMatrix, nearestCorrelation, pairCount } from './correlationMatrix';
import { toLogNormal } from './monteCarloDraw';
import { resolveMonteCarloMarketForPortfolio, type ResolvedMonteCarloMarket } from './monteCarloMarket';
import { seedWeightsFromTargets, weightsFromHoldings } from './monteCarloWeights';

export type FireScenarioKey = 'bear' | 'base' | 'bull';

/** A scenario of the page: `growthRate` is the compound return of the portfolio (RP1), `inflationRate` is π (RP3). */
export interface PortfolioScenario extends FIREScenarioParams {
  /** RP2, percent. */
  realReturnRate: number;
  /** `M − 1` in percent: the arithmetic mean of the portfolio's annual return (read-only, «media 8,9%»). */
  arithmeticMean: number;
  /** `√V` in percent: the standard deviation of the portfolio's annual return (read-only). */
  volatility: number;
}

export type FireWeightsOrigin = 'targets' | 'holdings' | 'default';

export interface FireAssumptions {
  scenarios: Record<FireScenarioKey, PortfolioScenario>;
  /** Percent per class; they sum to `leverage × 100`. */
  weights: Record<MonteCarloClass, number>;
  weightsOrigin: FireWeightsOrigin;
  /** `Σ weights / 100`, 1 when the weights sum to 100. */
  leverage: number;
  market: ResolvedMonteCarloMarket;
}

export interface PortfolioReturn {
  /** Compound return `g_p`, percent. */
  cagr: number;
  /** Arithmetic mean, percent. */
  arithmeticMean: number;
  /** Standard deviation, percent. */
  volatility: number;
}

/** The weights when nothing is known (no assets yet): the classic 60/40, declared as a default. */
export const DEFAULT_FIRE_WEIGHTS: Readonly<Record<MonteCarloClass, number>> = monteCarloClassRecord<number>((cls) => (cls === 'equity' ? 60 : cls === 'bonds' ? 40 : 0));

/**
 * RP1. `weightsPct` in percent per class (they may sum above 100: that is leverage, the debt being
 * negative Liquidità, R4), `correlations` the 21 upper-triangle values of Impostazioni (absent or of
 * the wrong length = independent classes), `leverageSpreadPct` the spread on the debt.
 *
 *   M = Σ v_i·G_i − max(W−1, 0)·sp         G_i = 1 + μa_i, the arithmetic mean of the factor (R1)
 *   V = Σ_ij v_i·v_j·G_i·G_j·(exp(ρ_ij·s_i·s_j) − 1)
 *   g_p = M / √(1 + V/M²) − 1               R2 on M and √V
 */
export function portfolioCompoundReturn(
  weightsPct: Readonly<Record<MonteCarloClass, number>>,
  scenario: MonteCarloMarketScenario,
  correlations?: readonly number[],
  leverageSpreadPct = 0,
): PortfolioReturn {
  const n = MONTE_CARLO_CLASSES.length;
  const logNormals = MONTE_CARLO_CLASSES.map((cls) => toLogNormal(scenario.classes[cls]));
  const v = MONTE_CARLO_CLASSES.map((cls) => (weightsPct[cls] || 0) / 100);
  const total = v.reduce((sum, value) => sum + value, 0);
  const leverage = total > 1 + 1e-9 ? total : 1;
  // The debt is negative Liquidità (R4).
  if (leverage > 1) v[MONTE_CARLO_CLASSES.indexOf('cash')] -= leverage - 1;

  const matrix =
    correlations && correlations.length === pairCount(n) && !correlations.every((value) => value === 0)
      ? nearestCorrelation(expandUpperTriangle(correlations, n))
      : identityMatrix(n);

  const growth = logNormals.map((entry) => 1 + entry.arithmeticMean);
  let mean = -Math.max(leverage - 1, 0) * (leverageSpreadPct / 100);
  for (let i = 0; i < n; i++) mean += v[i] * growth[i];
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += v[i] * v[j] * growth[i] * growth[j] * (Math.exp(matrix[i][j] * logNormals[i].s * logNormals[j].s) - 1);
    }
  }
  // A portfolio that cannot be positive on average has no compound return to speak of.
  if (!(mean > 0)) return { cagr: -100, arithmeticMean: (mean - 1) * 100, volatility: Math.sqrt(Math.max(variance, 0)) * 100 };
  const cagr = mean / Math.sqrt(1 + variance / (mean * mean)) - 1;
  return { cagr: cagr * 100, arithmeticMean: (mean - 1) * 100, volatility: Math.sqrt(variance) * 100 };
}

/** RP2: the Fisher real return, percent in, percent out. */
export function realReturn(growthPct: number, inflationPct: number): number {
  return ((1 + growthPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}

export interface ResolveFireAssumptionsInput {
  settings: Pick<AssetAllocationSettings, 'monteCarloMarket' | 'monteCarloScenarios' | 'targets' | 'goalBasedInvestingEnabled' | 'goalDrivenAllocationEnabled'> | null | undefined;
  assets: readonly Asset[] | null | undefined;
  /** The funds the pension lock keeps closed: outside the weights' base (RK). */
  lockedAssetIds?: ReadonlySet<string>;
  /** The goal data, read only when goal-driven allocation is on. */
  goalData?: GoalBasedInvestingData | null;
}

/** RP4: the weights of the page. Targets of Allocazione (R6) when they exist, else the portfolio held today, else 60/40. */
export function resolveFireWeights(
  input: ResolveFireAssumptionsInput,
  goldSubCategory: string | null,
): { weights: Record<MonteCarloClass, number>; origin: FireWeightsOrigin; leverage: number } {
  const assets = input.assets ?? [];
  if (assets.length > 0) {
    const options = { lockedAssetIds: input.lockedAssetIds, goldSubCategory };
    const { targets } = resolveEffectiveTargets({ settings: input.settings, goalData: input.goalData, assets: [...assets] });
    const fromTargets = seedWeightsFromTargets(targets, assets, options);
    if (fromTargets) return { ...fromTargets, origin: 'targets' };
    const fromHoldings = weightsFromHoldings(assets, options);
    if (fromHoldings) return { ...fromHoldings, origin: 'holdings' };
  }
  return { weights: { ...DEFAULT_FIRE_WEIGHTS }, origin: 'default', leverage: 1 };
}

/** The three scenarios of the page, from the weights and the resolved market. */
export function buildPortfolioScenarios(weights: Readonly<Record<MonteCarloClass, number>>, market: ResolvedMonteCarloMarket): Record<FireScenarioKey, PortfolioScenario> {
  const one = (key: FireScenarioKey): PortfolioScenario => {
    const scenario = market.scenarios[key];
    const result = portfolioCompoundReturn(weights, scenario, market.correlations, market.leverageSpread);
    return {
      growthRate: result.cagr,
      inflationRate: scenario.inflationRate,
      realReturnRate: realReturn(result.cagr, scenario.inflationRate),
      arithmeticMean: result.arithmeticMean,
      volatility: result.volatility,
    };
  };
  return { bear: one('bear'), base: one('base'), bull: one('bull') };
}

/** The ONE call every tab of the FIRE page makes. */
export function resolveFireAssumptions(input: ResolveFireAssumptionsInput): FireAssumptions {
  const market = resolveMonteCarloMarketForPortfolio(input.settings, input.assets ? [...input.assets] : undefined);
  const { weights, origin, leverage } = resolveFireWeights(input, market.goldSubCategory);
  return { scenarios: buildPortfolioScenarios(weights, market), weights, weightsOrigin: origin, leverage, market };
}
