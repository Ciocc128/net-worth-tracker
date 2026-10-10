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
 *   RP5  the capital: the PORTFOLIO plus the share of the cash to invest the user chose (K1, `fireCapital.ts`);
 *        the net worth is declared, what stays out is declared, never simulated (replaces `K` of L2, D4).
 *   RP6  the expenses: the plan's (`plannedAnnualExpenses`), else the Cashflow's (L2, D5).
 *   RC   the recurring costs (TER, stamp duty) taken off the capital every year after the return, in every
 *        rate this module returns (`fireCosts.ts`, doc/fire-ipotesi § 9).
 *
 * Pure: every collaborator is another pure module (`toLogNormal`, the correlation matrix, the weights seeds).
 */
import type { Asset, AssetAllocationSettings, FIREScenarioParams, MonteCarloMarketScenario } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import type { AnnualCashflowData } from '@/lib/services/fireService';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { resolveEffectiveTargets } from './allocationComparison';
import { expandUpperTriangle, identityMatrix, nearestCorrelation, pairCount } from './correlationMatrix';
import { toLogNormal } from './monteCarloDraw';
import { resolveFireCapitalDetail, type FireCapital, type FireCapitalDetail } from './fireCapital';
import type { MonteCarloAnchors } from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_BAND_YEARS, MONTE_CARLO_BAND_Z, marketUncertainty, resolveMonteCarloMarketForPortfolio, type ResolvedMonteCarloMarket } from './monteCarloMarket';
import { realReturn } from './realReturn';
import { seedWeightsFromTargets, weightsForFireCapital, weightsFromHoldings, type SeededWeights } from './monteCarloWeights';
import { portfolioCost, resolveClassCosts, type FireCosts, type PortfolioCost } from './fireCosts';

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

export type { FireCapital, FireCashToInvest } from './fireCapital';
export { resolveFireCapital } from './fireCapital';

export type FireWeightsOrigin = 'targets' | 'holdings' | 'default';

/** RP6: the yearly spending of the plan and where the figure comes from. */
export interface FireExpenses {
  annual: number;
  /** `settings` = typed by the user (`plannedAnnualExpenses`), `cashflow` = read off the Cashflow. */
  origin: 'settings' | 'cashflow';
  /** The Cashflow year read, only with `origin: 'cashflow'`. */
  referenceYear?: number;
  /** True when the reference year is the running one, scaled to twelve months. */
  isAnnualized?: boolean;
}

export interface FireAssumptions {
  scenarios: Record<FireScenarioKey, PortfolioScenario>;
  /** Percent per class; they sum to `leverage × 100`. */
  weights: Record<MonteCarloClass, number>;
  weightsOrigin: FireWeightsOrigin;
  /** K1 (RK7): the two seeds of the Monte Carlo and Proiezione buttons — the targets of Allocazione and the portfolio held today, both on the page's capital. Null = not available. */
  weightSeeds?: { targets: SeededWeights | null; holdings: SeededWeights | null };
  /** `Σ weights / 100`, 1 when the weights sum to 100. */
  leverage: number;
  market: ResolvedMonteCarloMarket;
  /** RP5, present when `resolveFireAssumptions` was given the value function. */
  capital?: FireCapital;
  /** RK6: the share (0–1) of an instrument's leg inside `capital`, present with it; the goals' flows read what lies outside (doc/fire-ipotesi/README.md § 13, RO1). */
  legShare?: FireCapitalDetail['legShare'];
  /** RP6, present when the Cashflow was read or the plan's expenses are typed. */
  expenses?: FireExpenses;
  /** RC1–RC2: the cost per class, present when `resolveFireAssumptions` was given the value function (like `capital`). */
  costs?: FireCosts;
  /** § 12: how many dated flows the tab's numbers run on; set by the tab that reads them (Calcolatore, Coast FIRE), absent elsewhere. */
  datedFlowsCount?: number;
  /** The Flussi chip's popover: the flows in use as sentences and the excluded ones with the reason (`withFlowsDetail`). */
  datedFlowsDetail?: { lines: string[]; excluded: string[] };
  /** RC3: the cost of THIS page's weights, percent a year; the rates in `scenarios` are already net of it. */
  cost?: PortfolioCost;
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

interface PortfolioMoments {
  /** Weights in decimals, the debt of a leverage as negative Liquidità (R4). */
  v: number[];
  logNormals: ReturnType<typeof toLogNormal>[];
  /** `G_i = 1 + μa_i`. */
  growth: number[];
  /** Gross `M`: the arithmetic mean factor of the portfolio, after the leverage spread. */
  mean: number;
  /** Gross `V`: the variance of the annual factor. */
  variance: number;
}

function portfolioMoments(
  weightsPct: Readonly<Record<MonteCarloClass, number>>,
  scenario: MonteCarloMarketScenario,
  correlations: readonly number[] | undefined,
  leverageSpreadPct: number,
): PortfolioMoments {
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
  return { v, logNormals, growth, mean, variance };
}

/**
 * RP1. `weightsPct` in percent per class (they may sum above 100: that is leverage, the debt being
 * negative Liquidità, R4), `correlations` the 21 upper-triangle values of Impostazioni (absent or of
 * the wrong length = independent classes), `leverageSpreadPct` the spread on the debt.
 *
 *   M = Σ v_i·G_i − max(W−1, 0)·sp         G_i = 1 + μa_i, the arithmetic mean of the factor (R1)
 *   V = Σ_ij v_i·v_j·G_i·G_j·(exp(ρ_ij·s_i·s_j) − 1)
 *   g_p = M / √(1 + V/M²) − 1               R2 on M and √V
 *
 * RC4: `costPct` (percent) scales the factor of every year by `f = 1 − c/100`, so `M` and `√V` both scale by
 * `f` and `g_net = (1 + g_p)·f − 1` exactly. Zero = gross, float for float.
 */
export function portfolioCompoundReturn(
  weightsPct: Readonly<Record<MonteCarloClass, number>>,
  scenario: MonteCarloMarketScenario,
  correlations?: readonly number[],
  leverageSpreadPct = 0,
  costPct = 0,
): PortfolioReturn {
  const moments = portfolioMoments(weightsPct, scenario, correlations, leverageSpreadPct);
  let { mean, variance } = moments;
  if (costPct) {
    const factor = 1 - costPct / 100;
    mean *= factor;
    variance *= factor * factor;
  }
  // A portfolio that cannot be positive on average has no compound return to speak of.
  if (!(mean > 0)) return { cagr: -100, arithmeticMean: (mean - 1) * 100, volatility: Math.sqrt(Math.max(variance, 0)) * 100 };
  const cagr = mean / Math.sqrt(1 + variance / (mean * mean)) - 1;
  return { cagr: cagr * 100, arithmeticMean: (mean - 1) * 100, volatility: Math.sqrt(variance) * 100 };
}

/** Compound return of the portfolio in the three scenarios, nominal percent (RQ3). */
export interface PortfolioBand {
  bear: number;
  base: number;
  bull: number;
}

/**
 * RQ3–RQ4: Bear and Bull of the portfolio, closed form — the 15th and 85th percentile of its 30-year CAGR WITH the
 * uncertainty on the parameter (the PEPP KID rule, V-D11). With `m_p = ln(1 + g_p)` the Base on the nominal classes,
 * `s_p² = ln(1 + V/M²)` its annual dispersion and `SE_p² = Σ (v_i·G_i/M)²·u_i²` the delta-method error on the mean
 * (independent errors across classes):
 *
 *   Bear/Bull = exp(m_p ∓ z·√(s_p²/H + SE_p²)) − 1       H = 30,  z = Φ⁻¹(0,85)
 *
 * The costs scale the factor of every year, `(1 + x)·f − 1` (RQ4), after the band is computed gross. The Base is
 * `portfolioCompoundReturn`'s, untouched. `uncertaintyPct` in points per class.
 */
export function portfolioScenarioBand(
  weightsPct: Readonly<Record<MonteCarloClass, number>>,
  baseScenario: MonteCarloMarketScenario,
  uncertaintyPct: Readonly<Record<MonteCarloClass, number>>,
  correlations?: readonly number[],
  leverageSpreadPct = 0,
  costPct = 0,
): PortfolioBand {
  const base = portfolioCompoundReturn(weightsPct, baseScenario, correlations, leverageSpreadPct, costPct).cagr;
  const { v, growth, mean, variance } = portfolioMoments(weightsPct, baseScenario, correlations, leverageSpreadPct);
  // Without a positive mean there is no compound return, nor a band around it.
  if (!(mean > 0)) return { bear: base, base, bull: base };
  const gross = mean / Math.sqrt(1 + variance / (mean * mean)) - 1;
  const m = Math.log(1 + gross);
  const annualVariance = Math.log(1 + variance / (mean * mean));
  let standardError2 = 0;
  MONTE_CARLO_CLASSES.forEach((cls, i) => {
    const u = (uncertaintyPct[cls] || 0) / 100;
    standardError2 += ((v[i] * growth[i]) / mean) ** 2 * u * u;
  });
  const spread = MONTE_CARLO_BAND_Z * Math.sqrt(annualVariance / MONTE_CARLO_BAND_YEARS + standardError2);
  const factor = 1 - costPct / 100;
  const net = (x: number) => ((1 + x) * factor - 1) * 100;
  return { bear: net(Math.exp(m - spread) - 1), base, bull: net(Math.exp(m + spread) - 1) };
}

/** RP2: the Fisher real return, percent in, percent out (the leaf module re-exported: one function for the page). */
export { realReturn };

export interface ResolveFireAssumptionsInput {
  settings: Pick<AssetAllocationSettings, 'monteCarloMarket' | 'monteCarloScenarios' | 'targets' | 'goalBasedInvestingEnabled' | 'goalDrivenAllocationEnabled' | 'plannedAnnualExpenses' | 'coastFireCustomExpenses' | 'stampDutyEnabled' | 'stampDutyRate' | 'checkingAccountSubCategory' | 'fireEmergencyFund' | 'fireCashToInvestPct'> | null | undefined;
  assets: readonly Asset[] | null | undefined;
  /** The funds the pension lock keeps closed: outside the weights' base (RK). */
  lockedAssetIds?: ReadonlySet<string>;
  /** The goal data, read only when goal-driven allocation is on. */
  goalData?: GoalBasedInvestingData | null;
  /** `calculateAssetValue`, injected so this module stays free of the Firestore-coupled service; no function, no `capital`. */
  assetValue?: (asset: Asset) => number;
  /** The Cashflow's yearly figures (`getAnnualCashflowData`); absent = not read (yet), so no `expenses` unless typed. */
  cashflowData?: Pick<AnnualCashflowData, 'annualExpensesFromCashflow' | 'referenceYear' | 'isAnnualized'> | null;
  /** The ECB anchors in force (Q3, `useMarketAnchors`); absent = the frozen ones. */
  anchors?: MonteCarloAnchors;
}

/**
 * RP6: the spending of the plan. `plannedAnnualExpenses` when typed; the Coast FIRE «spesa
 * personalizzata» of before D5 stands in for it until the next save moves it (it is never dropped
 * silently); else the Cashflow's last full year (or the running one, annualised). Null while
 * neither is known — the Cashflow still unread.
 */
export function resolvePlanExpenses(
  settings: Pick<AssetAllocationSettings, 'plannedAnnualExpenses' | 'coastFireCustomExpenses'> | null | undefined,
  cashflowData: ResolveFireAssumptionsInput['cashflowData'],
): FireExpenses | null {
  const typed = [settings?.plannedAnnualExpenses, settings?.coastFireCustomExpenses].find((value) => value !== undefined && Number.isFinite(value) && value > 0);
  if (typed !== undefined) return { annual: typed, origin: 'settings' };
  if (!cashflowData) return null;
  return {
    annual: cashflowData.annualExpensesFromCashflow,
    origin: 'cashflow',
    referenceYear: cashflowData.referenceYear,
    isAnnualized: cashflowData.isAnnualized,
  };
}

/**
 * RP4: the weights of the page. With the capital's detail (K1, RK5): the targets of Allocazione on the portfolio, else the
 * portfolio held today, else 60/40. Without it (no value function): the R6 seeds on the instruments held.
 */
export function resolveFireWeights(
  input: ResolveFireAssumptionsInput,
  goldSubCategory: string | null,
  detail?: FireCapitalDetail,
): { weights: Record<MonteCarloClass, number>; origin: FireWeightsOrigin; leverage: number; seeds?: { targets: SeededWeights | null; holdings: SeededWeights | null } } {
  const assets = input.assets ?? [];
  const fallback = { weights: { ...DEFAULT_FIRE_WEIGHTS }, origin: 'default' as const, leverage: 1 };
  if (assets.length === 0) return fallback;
  const options = { lockedAssetIds: input.lockedAssetIds, goldSubCategory };
  const { targets } = resolveEffectiveTargets({ settings: input.settings, goalData: input.goalData, assets: [...assets] });
  if (detail) {
    const fromTargets = weightsForFireCapital(targets, detail.weightsInput, options);
    const targetSeed = fromTargets?.origin === 'targets' ? fromTargets : null;
    const holdingsSeed = weightsForFireCapital(null, detail.weightsInput, options);
    const seeds = { targets: targetSeed, holdings: holdingsSeed };
    if (targetSeed) return { ...targetSeed, origin: 'targets', seeds };
    if (holdingsSeed) return { ...holdingsSeed, origin: 'holdings', seeds };
    return { ...fallback, seeds };
  }
  const fromTargets = seedWeightsFromTargets(targets, assets, options);
  if (fromTargets) return { ...fromTargets, origin: 'targets' };
  const fromHoldings = weightsFromHoldings(assets, options);
  if (fromHoldings) return { ...fromHoldings, origin: 'holdings' };
  return fallback;
}

/**
 * The three scenarios of the page, from the weights and the resolved market. Base = RP1 on the nominal Base classes; Bear
 * and Bull = the portfolio band (RQ3), not RP1 on a stress.
 */
export function buildPortfolioScenarios(weights: Readonly<Record<MonteCarloClass, number>>, market: ResolvedMonteCarloMarket, costPct = 0): Record<FireScenarioKey, PortfolioScenario> {
  const base = portfolioCompoundReturn(weights, market.scenarios.base, market.correlations, market.leverageSpread, costPct);
  const band = portfolioScenarioBand(weights, market.scenarios.base, marketUncertainty(market), market.correlations, market.leverageSpread, costPct);
  const one = (growthRate: number): PortfolioScenario => ({
    growthRate,
    inflationRate: market.inflationRate,
    realReturnRate: realReturn(growthRate, market.inflationRate),
    arithmeticMean: base.arithmeticMean,
    volatility: base.volatility,
  });
  return { bear: one(band.bear), base: one(base.cagr), bull: one(band.bull) };
}

/** The ONE call every tab of the FIRE page makes. */
export function resolveFireAssumptions(input: ResolveFireAssumptionsInput): FireAssumptions {
  const market = resolveMonteCarloMarketForPortfolio(input.settings, input.assets ? [...input.assets] : undefined, input.anchors);
  const hasValues = !!input.assetValue && !!input.assets;
  // K1: the capital reads the effective targets (RK2), so they are resolved once and shared with the weights.
  const targets = hasValues && input.assets!.length > 0 ? resolveEffectiveTargets({ settings: input.settings, goalData: input.goalData, assets: [...input.assets!] }).targets : null;
  const detail = hasValues
    ? resolveFireCapitalDetail(input.assets!, input.assetValue!, {
        lockedAssetIds: input.lockedAssetIds,
        goldSubCategory: market.goldSubCategory,
        targets,
        emergencyFund: input.settings?.fireEmergencyFund,
        cashToInvestPct: input.settings?.fireCashToInvestPct,
      })
    : undefined;
  const { weights, origin, leverage, seeds } = resolveFireWeights(input, market.goldSubCategory, detail);
  const capital = detail?.capital;
  const expenses = resolvePlanExpenses(input.settings, input.cashflowData) ?? undefined;
  // RC1–RC3: the costs need the instruments' values like the capital does (and its shares, RK6); without them the rates stay gross.
  const costs = detail
    ? resolveClassCosts(input.assets!, input.settings, { lockedAssetIds: input.lockedAssetIds, goldSubCategory: market.goldSubCategory, legShare: detail.legShare })
    : undefined;
  const cost = costs ? portfolioCost(weights, costs) : undefined;
  return { scenarios: buildPortfolioScenarios(weights, market, cost?.total ?? 0), weights, weightsOrigin: origin, weightSeeds: seeds, leverage, market, capital, legShare: detail?.legShare, expenses, costs, cost };
}
