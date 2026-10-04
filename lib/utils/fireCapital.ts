/**
 * The capital the FIRE tabs start from — the PORTFOLIO, not the net worth (doc/fire-ipotesi/README.md § 11, K1).
 *
 *   RK1  `N` = the legs outside Liquidità of the instruments the allocation counts (`tradable` or `frozen`),
 *        `C` = their Liquidità legs. `excluded` instruments are not portfolio.
 *   RK2  `C_in` = the Liquidità the target keeps in the portfolio; `P = N + C_in`; `X = C − C_in` the excess.
 *   RK3  `L = max(0, X + E)`: the cash to invest, `E` the Liquidità legs of the `excluded` instruments.
 *   RK4  capital = `P + q·L`, `q` the user's share (`fireCashToInvestPct`, default 0).
 *   RK6  every instrument enters the capital with a share `s`: the tax profile, the liquid part and the
 *        recurring costs read the same shares.
 *   RK8  the net worth, for context; what stays out is declared, never simulated.
 *
 * Pure: the value function is injected (`calculateAssetValue`), like in `computeSimulatedCapital`.
 */
import type { Asset, AssetAllocationTarget } from '@/types/assets';
import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { resolveAllocationRole } from './allocationUtils';
import { suggestIsLiquid } from './assetLiquidity';
import { legMonteCarloClass, modelledClassTargets, type FireCapitalWeightsInput, type FirePortfolioLeg } from './monteCarloWeights';
import { resolvePortfolioTaxProfile, type WithdrawalTaxProfile } from './withdrawalTax';

/** RK3–RK4: the cash outside the portfolio and the part of it that enters the capital. */
export interface FireCashToInvest {
  /** `L`: the cash that could be invested, EUR. */
  total: number;
  /** `q·L`: what enters the capital, EUR. */
  used: number;
  /** `q`, percent (0–100). */
  pct: number;
  /** `E`: the Liquidità of the accounts excluded from the allocation, EUR (a negative balance reduces it). */
  excludedAccounts: number;
  /** `X`: the Liquidità of the included accounts beyond the target, EUR. */
  overTarget: number;
}

export interface FireCapital {
  /** The capital of the tabs: `P + q·L` (RK4). */
  total: number;
  /** The part of it held in liquid assets. */
  liquid: number;
  /** `total` minus its liquid part. */
  illiquid: number;
  /** `P`: the portfolio (RK2). */
  portfolio: number;
  cashToInvest: FireCashToInvest;
  /** RK8: the net worth of the Patrimonio page, EUR. */
  netWorth: number;
  /** What the plan does not count, EUR: real estate (the residence included), crypto, the cash not invested, the other excluded instruments. */
  outside: { realestate: number; crypto: number; cash: number; otherExcluded: number };
  /** The cost basis behind the capital, for the tax on the sales; null when no instrument has one. */
  taxProfile: WithdrawalTaxProfile | null;
}

export interface FireCapitalOptions {
  lockedAssetIds?: ReadonlySet<string>;
  goldSubCategory?: string | null;
  /** The EFFECTIVE targets of Allocazione (`resolveEffectiveTargets`); null = none, the weights come from the holdings. */
  targets?: AssetAllocationTarget | null;
  /** `fireCashToInvestPct`, percent; absent = 0, out of [0, 100] is clamped. */
  cashToInvestPct?: number | null;
}

export interface FireCapitalDetail {
  capital: FireCapital;
  /** What `weightsForFireCapital` needs (RK5). */
  weightsInput: FireCapitalWeightsInput;
  /** RK6: the share (0–1) of the market value of the leg `legIndex` of `asset` that is in the capital. */
  legShare: (asset: Asset, legIndex: number) => number;
}

interface CapitalLeg {
  assetId: string;
  index: number;
  cls: MonteCarloClass;
  market: number;
  notional: number;
  included: boolean;
}

const clampPct = (value: number | null | undefined): number => (value !== undefined && value !== null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0);

/** RK1–RK6 in one pass: the capital, the inputs of RK5 and the shares of RK6. */
export function resolveFireCapitalDetail(assets: readonly Asset[], valueOf: (asset: Asset) => number, options: FireCapitalOptions = {}): FireCapitalDetail {
  const legs: CapitalLeg[] = [];
  const outside = { realestate: 0, crypto: 0, cash: 0, otherExcluded: 0 };
  const liquidAssets = new Set<string>();
  let netWorth = 0;

  for (const asset of assets) {
    const value = valueOf(asset);
    netWorth += value;
    if (options.lockedAssetIds?.has(asset.id)) continue;
    if (asset.isLiquid !== undefined ? asset.isLiquid === true : suggestIsLiquid(asset.type, asset.subCategory)) liquidAssets.add(asset.id);
    const included = resolveAllocationRole(asset) !== 'excluded';
    const leverage = asset.leverageRatio ?? 1;
    const composition = asset.composition && asset.composition.length > 0 ? asset.composition : null;
    const parts = composition
      ? composition.map((leg) => ({ assetClass: leg.assetClass, subCategory: leg.subCategory, share: leg.percentage / 100 }))
      : [{ assetClass: asset.assetClass, subCategory: asset.subCategory, share: 1 }];
    parts.forEach((part, index) => {
      const market = value * part.share;
      if (part.assetClass === 'realestate' || part.assetClass === 'crypto') {
        outside[part.assetClass] += market;
        return;
      }
      const cls = legMonteCarloClass(part, options);
      if (!cls) return;
      legs.push({ assetId: asset.id, index, cls, market, notional: market * leverage, included });
    });
  }

  // RK1
  let N = 0;
  let C = 0;
  let E = 0;
  let otherExcluded = 0;
  for (const leg of legs) {
    if (leg.cls === 'cash') {
      if (leg.included) C += leg.market;
      else E += leg.market;
    } else if (leg.included) N += leg.market;
    else otherExcluded += leg.market;
  }

  // RK2
  const info = options.targets ? modelledClassTargets(options.targets) : null;
  let cashIn = C;
  if (C > 0 && info?.anyTarget) {
    if (options.targets?.cash?.useFixedAmount) {
      cashIn = Math.min(C, info.cashFixed);
    } else {
      const t = info.classTarget.cash;
      cashIn = t >= 100 ? C : Math.min(C, Math.max(0, (t / (100 - t)) * N));
    }
  }
  const P = N + cashIn;
  const X = C > 0 ? C - cashIn : 0;

  // RK3–RK4
  const L = Math.max(0, X + E);
  const q = clampPct(options.cashToInvestPct) / 100;
  const used = q * L;
  const total = P + used;
  // `used` spread over the legs that make `X + E` in proportion to what each one adds to it.
  const factor = X + E > 0 ? q : 0;

  // RK6: the amount of each leg in the capital.
  const entering = (leg: CapitalLeg): number => {
    if (leg.cls === 'cash') {
      if (!leg.included) return factor * leg.market;
      return C > 0 ? leg.market * (cashIn / C) + factor * leg.market * (X / C) : leg.market;
    }
    return leg.included ? leg.market : 0;
  };
  const shares = new Map<string, number[]>();
  const enteringByAsset = new Map<string, number>();
  let liquid = 0;
  for (const leg of legs) {
    const amount = entering(leg);
    const list = shares.get(leg.assetId) ?? [];
    list[leg.index] = leg.market > 0 ? amount / leg.market : 0;
    shares.set(leg.assetId, list);
    enteringByAsset.set(leg.assetId, (enteringByAsset.get(leg.assetId) ?? 0) + amount);
    if (liquidAssets.has(leg.assetId)) liquid += amount;
  }

  // The cost basis of what enters: each instrument scaled by its share.
  const scaledValue = new Map<string, number>();
  const scaled: Asset[] = [];
  for (const asset of assets) {
    const amount = enteringByAsset.get(asset.id) ?? 0;
    const value = valueOf(asset);
    if (asset.quantity <= 0 || value <= 0 || amount <= 0) continue;
    const share = amount / value;
    scaledValue.set(asset.id, amount);
    scaled.push({ ...asset, quantity: asset.quantity * share });
  }
  const taxProfile = resolvePortfolioTaxProfile(scaled, (asset) => scaledValue.get(asset.id) ?? 0);

  const portfolioLegs: FirePortfolioLeg[] = legs.filter((leg) => leg.included).map((leg) => ({ cls: leg.cls, market: leg.market, notional: leg.notional }));
  return {
    capital: {
      total,
      liquid,
      illiquid: Math.max(0, total - liquid),
      portfolio: P,
      cashToInvest: { total: L, used, pct: q * 100, excludedAccounts: E, overTarget: X },
      netWorth,
      outside: { realestate: outside.realestate, crypto: outside.crypto, cash: L - used, otherExcluded },
      taxProfile,
    },
    weightsInput: { capital: total, cashIn, cashToInvest: used, legs: portfolioLegs },
    legShare: (asset, legIndex) => shares.get(asset.id)?.[legIndex] ?? 0,
  };
}

/** RK1–RK6: the capital of the FIRE tabs (the shares and the weights' inputs stay in `resolveFireCapitalDetail`). */
export function resolveFireCapital(assets: readonly Asset[], valueOf: (asset: Asset) => number, options: FireCapitalOptions = {}): FireCapital {
  return resolveFireCapitalDetail(assets, valueOf, options).capital;
}
