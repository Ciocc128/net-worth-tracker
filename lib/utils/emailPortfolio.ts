/**
 * The portfolio half of the periodic email, measured with the app's OWN rules (F1b of
 * doc/ai-open-models-wiki.md, 2026-09-28). Until then the email read a pre-ledger model: the
 * allocation on the whole net worth against the raw Settings targets, «mercato» as `Δ − risparmio`,
 * the class moves as snapshot differences that counted a PAC purchase as growth, and no trades.
 * Nothing here computes a rule of its own — every figure is a page's function, composed:
 *
 *   - allocation: `assetsAtSnapshot` (the period-end `byAsset`, today's roles) → `compareAllocations`
 *     → `applyRebalanceBand` with the 5/25 rule (owner's call for the email) → the Per classe
 *     summaries of Allocazione (`summarizeClassGaps`, `activeClassGaps`, `offTargetGaps`), with the
 *     orphaned sub-targets stripped like the page does;
 *   - class moves: Storico's Driver per instrument (`measureAssets`) grouped by the Panoramica's
 *     bands (`sumByMarketBand`: composites split, pension funds as «Previdenza»);
 *   - trades: the ledger's BUY/SELL of the window, per instrument, with the tax of
 *     `summarizePeriodSales`;
 *   - return: Rendimenti's hero rule (`resolveHeroReturn`) on the TWR of the base the page measures.
 *
 * SDK-free apart from `calculateAssetValue` (the ONE valuation, reached through the comparison).
 */

import type { Asset, AssetAllocationTarget, MonthlySnapshot } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import { createGrowthDriverMeter, sumGrowthDrivers, type AssetMove, type GrowthDriverContext, type GrowthDrivers } from '@/lib/utils/growthDrivers';
import type { PeriodSalesSummary } from '@/lib/utils/periodSales';
import { assetsAtSnapshot, compareAllocations } from '@/lib/utils/allocationComparison';
import {
  applyRebalanceBand,
  ASSET_CLASS_LABELS,
  buildHoldings,
  findOrphanedTargets,
  partitionByAllocationRole,
  stripOrphanedSubTargets,
  sumHoldingsByClass,
  sumHoldingsBySubCategory,
  NO_SUBCATEGORY_LABEL,
  type RebalanceBand,
} from '@/lib/utils/allocationUtils';
import { activeClassGaps, offTargetGaps, summarizeClassGaps, summarizeHoldings, type ClassGap, type HoldingsGroup } from '@/lib/utils/allocazioneSummary';
import { calculateAssetValue } from '@/lib/services/assetService';
import { sumByMarketBand } from '@/lib/utils/marketEffect';
import { PENSION_BAND_KEY } from '@/lib/utils/historyComposition';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';
import { resolveHeroReturn } from '@/lib/utils/performanceSummary';

// ─── The Driver over the email's window ───────────────────────────────────────

export interface EmailDrivers {
  /** Storico's Driver summed over every consecutive pair of the window's snapshots. */
  drivers: GrowthDrivers;
  /** «Andamento per classe»; null when a pair is not measured per instrument (no `byAsset`). */
  classMoves: { rows: EmailClassMove[]; unassigned: AssetMove | null } | null;
}

/**
 * The window's Driver, the way Storico measures a year: `baseline` is the snapshot the email calls
 * «periodo precedente», `chain` every snapshot from it to the period's last, and the parts are the
 * sum over consecutive pairs — so a quarter adds up to its three months by construction. Null
 * without both ends. The class moves exist only when EVERY pair was measured per instrument: a
 * class delta cannot tell a purchase from a price (the Panoramica's `computeTopMovers` rule).
 */
export function measureEmailDrivers(chain: MonthlySnapshot[], context: GrowthDriverContext): EmailDrivers | null {
  const ordered = [...chain].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  if (ordered.length < 2) return null;
  const meter = createGrowthDriverMeter(context);
  const pairs: GrowthDrivers[] = [];
  const perAsset = new Map<string, AssetMove>();
  let measuredPerAsset = true;
  for (let i = 1; i < ordered.length; i++) {
    pairs.push(meter.measure(ordered[i - 1], ordered[i]));
    const moves = meter.measureAssets(ordered[i - 1], ordered[i]);
    if (!moves) {
      measuredPerAsset = false;
      continue;
    }
    for (const [assetId, move] of moves) {
      const sum = perAsset.get(assetId);
      perAsset.set(assetId, sum ? { market: sum.market + move.market, traded: sum.traded + move.traded, paidIn: sum.paidIn + move.paidIn, valueChange: sum.valueChange + move.valueChange } : move);
    }
  }
  const drivers = sumGrowthDrivers(pairs);
  if (!drivers) return null;
  return { drivers, classMoves: measuredPerAsset ? buildEmailClassMoves(context.assets, perAsset) : null };
}

// ─── Allocation ───────────────────────────────────────────────────────────────

/** The email's band: the 5/25 rule (owner, 2026-09-28), not the page's session default of ±2. */
export const EMAIL_REBALANCE_BAND: RebalanceBand = { type: 'rule525' };

export interface EmailSubCategoryGap {
  assetClass: string;
  subCategory: string;
  /** Share of its CLASS, 0-100. */
  currentPercentage: number;
  /** Target share of its class; null for the unclassified bucket, which has none. */
  targetPercentage: number | null;
  differencePp: number | null;
  currentValue: number;
}

export interface EmailAllocationSummary {
  /** The allocated base (tradable + frozen), market value. */
  marketValue: number;
  leverageRatio: number;
  hasLeveragedExposure: boolean;
  fromGoals: boolean;
  /** Every class with money or a target, in the app-wide order, on the 5/25 band. */
  classes: ClassGap[];
  /** The classes the band calls off target, farthest in points first. */
  offTarget: ClassGap[];
  /** Sleeves with a target (orphans stripped) and the unclassified bucket, by class. */
  subCategories: EmailSubCategoryGap[];
  frozen: HoldingsGroup;
  excluded: HoldingsGroup;
  /** Snapshot rows whose asset no longer exists: no class to put them in, declared. */
  unmatched: Array<{ name: string; totalValue: number }>;
}

/**
 * Allocation at the end of the period, as the Allocazione page would measure it on that snapshot.
 * Null when the snapshot has no `byAsset` (nothing to value per instrument) or nothing is allocated.
 */
export function summarizeEmailAllocation(input: {
  assets: Asset[];
  snapshot: Pick<MonthlySnapshot, 'byAsset'>;
  targets: AssetAllocationTarget;
  fromGoals: boolean;
}): EmailAllocationSummary | null {
  if (!((input.snapshot.byAsset?.length ?? 0) > 0)) return null;
  const { assets, unmatched } = assetsAtSnapshot(input.assets, input.snapshot.byAsset);
  const allocation = applyRebalanceBand(compareAllocations(assets, input.targets), EMAIL_REBALANCE_BAND);
  if (allocation.marketValue <= 0) return null;

  const { frozen, excluded } = partitionByAllocationRole(assets);
  const excludedHoldings = buildHoldings(excluded, calculateAssetValue);
  const orphans = findOrphanedTargets(
    allocation.byAssetClass,
    allocation.bySubCategory,
    sumHoldingsByClass(excludedHoldings),
    sumHoldingsBySubCategory(excludedHoldings),
  );
  const sleeves = stripOrphanedSubTargets(allocation.bySubCategory, orphans);

  const classes = activeClassGaps(summarizeClassGaps(allocation.byAssetClass));
  const subCategories: EmailSubCategoryGap[] = Object.entries(sleeves).map(([key, data]) => {
    const separator = key.indexOf(':');
    const subCategory = key.slice(separator + 1);
    const unclassified = subCategory === NO_SUBCATEGORY_LABEL;
    return {
      assetClass: key.slice(0, separator),
      subCategory,
      currentPercentage: data.currentPercentage,
      targetPercentage: unclassified ? null : data.targetPercentage,
      differencePp: unclassified ? null : data.difference,
      currentValue: data.currentValue,
    };
  });

  return {
    marketValue: allocation.marketValue,
    leverageRatio: allocation.leverageRatio,
    hasLeveragedExposure: allocation.hasLeveragedExposure,
    fromGoals: input.fromGoals,
    classes,
    offTarget: offTargetGaps(classes),
    subCategories,
    frozen: summarizeHoldings(buildHoldings(frozen, calculateAssetValue)),
    excluded: summarizeHoldings(excludedHoldings),
    unmatched,
  };
}

// ─── Class moves ──────────────────────────────────────────────────────────────

export interface EmailClassMove {
  /** An asset class, or `PENSION_BAND_KEY` for the pension funds. */
  band: string;
  label: string;
  /** The Driver's market, measured per instrument. */
  market: number;
  /** Money the period's BUY/SELL put in (negative = taken out). */
  traded: number;
  /** Paid into the pension funds (Previdenza only). */
  paidIn: number;
  /** What none of the three explains: deposits on a cash account, a debt repaid, an adjustment. */
  other: number;
  valueChange: number;
}

/** A band whose every figure is under a euro is noise, as in the Panoramica's digest. */
const MIN_MOVE_EUR = 1;

/**
 * The period's move of every band, market and flows apart — what «Andamento per classe» prints.
 * Largest market effect first. An instrument that no longer exists has no band: its market stays
 * in the Driver's total and is returned as `unassigned`.
 */
export function buildEmailClassMoves(assets: Asset[], moves: Map<string, AssetMove>): { rows: EmailClassMove[]; unassigned: AssetMove | null } {
  const known = new Set(assets.map((asset) => asset.id));
  const part = (key: keyof AssetMove) => sumByMarketBand(assets, (assetId) => moves.get(assetId)?.[key]);
  const market = part('market');
  const traded = part('traded');
  const paidIn = part('paidIn');
  const valueChange = part('valueChange');

  const rows: EmailClassMove[] = [];
  for (const band of new Set([...market.keys(), ...valueChange.keys()])) {
    const row = {
      band,
      label: band === PENSION_BAND_KEY ? 'Previdenza' : (ASSET_CLASS_LABELS[band] ?? band),
      market: market.get(band) ?? 0,
      traded: traded.get(band) ?? 0,
      paidIn: paidIn.get(band) ?? 0,
      valueChange: valueChange.get(band) ?? 0,
      other: 0,
    };
    row.other = row.valueChange - row.market - row.traded - row.paidIn;
    if ([row.market, row.traded, row.paidIn, row.valueChange].every((value) => Math.abs(value) < MIN_MOVE_EUR)) continue;
    rows.push(row);
  }
  rows.sort((a, b) => Math.abs(b.market) - Math.abs(a.market) || Math.abs(b.valueChange) - Math.abs(a.valueChange));

  const orphans = [...moves].filter(([assetId]) => !known.has(assetId)).map(([, move]) => move);
  const unassigned = orphans.length === 0 ? null : orphans.reduce((sum, move) => ({
    market: sum.market + move.market,
    traded: sum.traded + move.traded,
    paidIn: sum.paidIn + move.paidIn,
    valueChange: sum.valueChange + move.valueChange,
  }));
  return { rows, unassigned };
}

// ─── Trades ───────────────────────────────────────────────────────────────────

/** How many instruments the prompt lists; the rest are counted in its header (like MAX_CATEGORY_DELTAS). */
export const MAX_TRADE_INSTRUMENTS = 15;

export interface EmailInstrumentTrades {
  assetId: string;
  name: string;
  buys: number;
  sells: number;
  boughtQuantity: number;
  soldQuantity: number;
  /** Σ quantity × priceEur + fees of the buys. */
  invested: number;
  /** Σ quantity × priceEur − fees of the sells. */
  proceeds: number;
  /** From `summarizePeriodSales`; null without a sell or with an unknown rate. */
  estimatedTax: number | null;
}

/**
 * The window's BUY/SELL, one entry per instrument, largest amount first. The window is a range of
 * ITALIAN months (the Driver's), so a trade late on the last day never slips across. Migration
 * baselines move no money and are left out, like everywhere a trade is read as money.
 */
export function summarizeTradesByInstrument(input: {
  assets: Asset[];
  trades: AssetTransaction[];
  months: { from: { year: number; month: number }; to: { year: number; month: number } };
  sales: PeriodSalesSummary | null;
}): EmailInstrumentTrades[] {
  const index = (year: number, month: number) => year * 12 + month - 1;
  const from = index(input.months.from.year, input.months.from.month);
  const to = index(input.months.to.year, input.months.to.month);
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const taxById = new Map((input.sales?.instruments ?? []).map((instrument) => [instrument.id, instrument.estimatedTax]));

  const byAsset = new Map<string, EmailInstrumentTrades>();
  for (const trade of input.trades) {
    if (trade.type !== 'sell' && !(trade.type === 'buy' && !trade.isBaseline)) continue;
    const at = index(getItalyYear(trade.date), getItalyMonth(trade.date));
    if (at < from || at > to) continue;
    const asset = assetsById.get(trade.assetId);
    const entry = byAsset.get(trade.assetId) ?? {
      assetId: trade.assetId,
      name: asset ? getAssetDisplayTicker(asset) : trade.assetId,
      buys: 0,
      sells: 0,
      boughtQuantity: 0,
      soldQuantity: 0,
      invested: 0,
      proceeds: 0,
      estimatedTax: null,
    };
    const fees = trade.fees ?? 0;
    if (trade.type === 'buy') {
      entry.buys += 1;
      entry.boughtQuantity += trade.quantity;
      entry.invested += trade.quantity * trade.priceEur + fees;
    } else {
      entry.sells += 1;
      entry.soldQuantity += trade.quantity;
      entry.proceeds += trade.quantity * trade.priceEur - fees;
      entry.estimatedTax = taxById.get(trade.assetId) ?? null;
    }
    byAsset.set(trade.assetId, entry);
  }
  return [...byAsset.values()].sort((a, b) => b.invested + b.proceeds - (a.invested + a.proceeds));
}

// ─── Return ───────────────────────────────────────────────────────────────────

export interface EmailPeriodReturn {
  /** In percent: the period's own return below a year, the annualised one from a year on. */
  value: number;
  /** «nel mese», «nei 3 mesi», «annualizzato» — Rendimenti's hero label. */
  label: string;
  /** `describeMeasurementBase`: which capital the figure is measured on. */
  baseLabel: string;
}

/** The TWR as Rendimenti's hero states it; null when the period cannot be measured. */
export function resolveEmailPeriodReturn(
  metrics: { timeWeightedReturn: number | null; numberOfMonths: number; hasInsufficientData: boolean },
  baseLabel: string
): EmailPeriodReturn | null {
  if (metrics.hasInsufficientData) return null;
  const hero = resolveHeroReturn(metrics.timeWeightedReturn, metrics.numberOfMonths);
  if (hero.value === null) return null;
  return { value: hero.value, label: hero.label, baseLabel };
}
