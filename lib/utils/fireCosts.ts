/**
 * The recurring costs of the FIRE page — TER and stamp duty, ONE reading every tab goes through
 * (doc/fire-ipotesi/README.md § 9, rules RC1–RC3).
 *
 * Every engine runs on the per-class returns of Impostazioni › Simulazioni, gross of what the
 * instruments cost. This module derives a yearly cost PER CLASS from the instruments of `K` (their
 * TER, the stamp duty of Impostazioni › Allocazione) and a cost of the portfolio from a weight vector;
 * the engines then take `(1 − c/100)` off the capital once a year, after the return (RC4).
 *
 *   RC1  c_i = TER_i + bollo_i, weighted on the market value of the legs of the class
 *   RC2  a class with no instrument takes the average TER of `K` and the full duty
 *   RC3  c = Σ (w_i / Σ w_j) · c_i — weights brought to 100, leverage does not multiply the costs (D-C3)
 *
 * Trend and Carry carry no TER here: their default returns are already net of it (D-C2).
 * Pure: every collaborator is another pure module.
 */
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import { MONTE_CARLO_CLASSES, monteCarloClassRecord, type MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import { isCheckingAccount } from '@/lib/constants/stampDuty';
import { expandAssetExposure } from './assetExposureUtils';
import { legMonteCarloClass } from './monteCarloWeights';

/** Percent per year of the class's capital. */
export interface ClassCost {
  ter: number;
  stampDuty: number;
  total: number;
  /** True when the class has instruments in `K` (false = RC2's fallback). */
  held: boolean;
}

export interface FireCosts {
  byClass: Record<MonteCarloClass, ClassCost>;
  stampDutyEnabled: boolean;
  stampDutyRate: number;
  /** At least one instrument of `K` (outside Trend and Carry) carries a TER. */
  anyTer: boolean;
}

export interface PortfolioCost {
  total: number;
  ter: number;
  stampDuty: number;
}

export type FireCostSettings = Pick<AssetAllocationSettings, 'stampDutyEnabled' | 'stampDutyRate' | 'checkingAccountSubCategory'>;

/** Classes whose default returns are already net of the fund's TER (D-C2). */
const NET_OF_TER = new Set<MonteCarloClass>(['trendFollowing', 'carry']);

const DEFAULT_STAMP_DUTY_RATE = 0.2;

/** RC1 + RC2: the yearly cost per class from the instruments of `K`. */
export function resolveClassCosts(
  assets: readonly Asset[],
  settings: FireCostSettings | null | undefined,
  options: { lockedAssetIds?: ReadonlySet<string>; goldSubCategory?: string | null } = {},
): FireCosts {
  const enabled = !!settings?.stampDutyEnabled;
  const rate = enabled ? (Number.isFinite(settings?.stampDutyRate) ? (settings!.stampDutyRate as number) : DEFAULT_STAMP_DUTY_RATE) : 0;

  const market = monteCarloClassRecord<number>(() => 0);
  const terWeighted = monteCarloClassRecord<number>(() => 0);
  const subject = monteCarloClassRecord<number>(() => 0);
  for (const asset of assets) {
    if (options.lockedAssetIds?.has(asset.id) || asset.quantity <= 0) continue;
    const ter = asset.totalExpenseRatio && asset.totalExpenseRatio > 0 ? asset.totalExpenseRatio : 0;
    const subjectToDuty = !asset.stampDutyExempt && !isCheckingAccount(asset, settings?.checkingAccountSubCategory);
    for (const leg of expandAssetExposure(asset)) {
      const cls = legMonteCarloClass(leg, options);
      if (!cls || !(leg.marketValue > 0)) continue;
      market[cls] += leg.marketValue;
      terWeighted[cls] += leg.marketValue * ter;
      if (subjectToDuty) subject[cls] += leg.marketValue;
    }
  }

  // RC2: the average TER of `K`, Trend and Carry (the 'trendFollowing' and 'carry' classes) out of numerator and denominator.
  let averageNumerator = 0;
  let averageDenominator = 0;
  for (const cls of MONTE_CARLO_CLASSES) {
    if (NET_OF_TER.has(cls)) continue;
    averageNumerator += terWeighted[cls];
    averageDenominator += market[cls];
  }
  const averageTer = averageDenominator > 0 ? averageNumerator / averageDenominator : 0;

  const byClass = monteCarloClassRecord<ClassCost>((cls) => {
    const held = market[cls] > 0;
    const ter = NET_OF_TER.has(cls) ? 0 : held ? terWeighted[cls] / market[cls] : averageTer;
    const stampDuty = rate * (held ? subject[cls] / market[cls] : 1);
    return { ter, stampDuty, total: ter + stampDuty, held };
  });
  const anyTer = MONTE_CARLO_CLASSES.some((cls) => !NET_OF_TER.has(cls) && terWeighted[cls] > 0);
  return { byClass, stampDutyEnabled: enabled, stampDutyRate: rate, anyTer };
}

/** RC3: the cost of a weight vector (percent per class, any sum above 0), split by component. */
export function portfolioCost(weightsPct: Readonly<Record<MonteCarloClass, number>>, costs: FireCosts | null | undefined): PortfolioCost {
  const zero = { total: 0, ter: 0, stampDuty: 0 };
  if (!costs) return zero;
  const sum = MONTE_CARLO_CLASSES.reduce((total, cls) => total + Math.max(0, weightsPct[cls] || 0), 0);
  if (!(sum > 0)) return zero;
  let ter = 0;
  let stampDuty = 0;
  for (const cls of MONTE_CARLO_CLASSES) {
    const share = Math.max(0, weightsPct[cls] || 0) / sum;
    ter += share * costs.byClass[cls].ter;
    stampDuty += share * costs.byClass[cls].stampDuty;
  }
  return { total: ter + stampDuty, ter, stampDuty };
}
