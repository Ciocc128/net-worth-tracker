/**
 * doc/pac-ottimizzatore/README.md § RM2 — what a set of proposed weights can keep when it becomes a PAC
 * (today) or a model portfolio (A2): only tradable instruments, never a `frozen` or `excluded` asset and
 * never a liquidity account. The kept weights are rescaled to Σ = 100 at a 0,01 step.
 */
import type { Asset } from '@/types/assets';
import type { ModelPortfolioWeight } from '@/types/modelPortfolio';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';

export type ModelExclusionReason = 'frozen' | 'cashAccount' | 'excluded';

export interface ModelWeight {
  assetId: string;
  pct: number;
}

export interface ModelExclusion {
  assetId: string;
  reason: ModelExclusionReason;
}

export interface ModelWeightsResult {
  weights: ModelWeight[];
  excluded: ModelExclusion[];
}

function exclusionReason(asset: Asset): ModelExclusionReason | null {
  // A cash ACCOUNT is out whatever its role; a money-market fund (`assetClass === 'cash'`, other type) stays.
  if (asset.type === 'cash') return 'cashAccount';
  const role = resolveAllocationRole(asset);
  if (role === 'frozen') return 'frozen';
  if (role === 'excluded') return 'excluded';
  return null;
}

export function toModelWeights(proposed: ModelWeight[], assetsById: Map<string, Asset>): ModelWeightsResult {
  const kept: ModelWeight[] = [];
  const excluded: ModelExclusion[] = [];
  for (const entry of proposed) {
    const asset = assetsById.get(entry.assetId);
    const reason = asset ? exclusionReason(asset) : null;
    if (reason) excluded.push({ assetId: entry.assetId, reason });
    else kept.push(entry);
  }

  const total = kept.reduce((sum, entry) => sum + entry.pct, 0);
  if (total <= 0) return { weights: [], excluded };

  // Work in hundredths of a point so the remainder is an exact integer.
  const cents = kept.map((entry) => Math.round((entry.pct / total) * 10000));
  const remainder = 10000 - cents.reduce((sum, c) => sum + c, 0);
  if (remainder !== 0) {
    let largest = 0;
    for (let i = 1; i < cents.length; i++) if (cents[i] > cents[largest]) largest = i;
    cents[largest] += remainder;
  }

  return {
    weights: kept.map((entry, i) => ({ assetId: entry.assetId, pct: cents[i] / 100 })),
    excluded,
  };
}

const EXCLUSION_TEXT: Record<ModelExclusionReason, string> = {
  frozen: 'bloccato in Impostazioni',
  cashAccount: 'è un conto di liquidità',
  excluded: 'escluso dall’allocazione',
};

/** «FONDO resta fuori: bloccato in Impostazioni. CONTO resta fuori: è un conto di liquidità.» */
export function describeModelExclusions(excluded: ModelExclusion[], labelOf: (assetId: string) => string): string {
  return excluded.map((e) => `${labelOf(e.assetId)} resta fuori: ${EXCLUSION_TEXT[e.reason]}.`).join(' ');
}

export const MODEL_NO_TRADABLE_INSTRUMENTS = 'Nessuno strumento acquistabile fra i pesi proposti.';

// ─── RM1 / RM3 / RM4: the saved model ────────────────────────────────────────

/** Σ of the weights must be 100 within this tolerance (RM1). */
export const MODEL_WEIGHT_SUM_TOLERANCE = 0.01;

export const MODEL_ERROR_EMPTY = 'Il portafoglio modello non ha strumenti.';
export const MODEL_ERROR_SUM = 'I pesi del portafoglio modello devono sommare 100%.';
export const MODEL_ERROR_UNKNOWN_ASSET = 'Uno strumento del portafoglio modello non esiste più.';
export const MODEL_ERROR_NOT_ALLOWED = 'Un conto di liquidità o uno strumento bloccato non può stare nel portafoglio modello.';

/**
 * The reason a set of weights cannot be saved as the model, or null when it can: not empty, Σ = 100
 * (±0,01), every instrument still in the portfolio and none a frozen/excluded asset or a liquidity
 * account (RM2) — the service refuses with this sentence (PZ3).
 */
export function validateModelWeights(weights: ModelPortfolioWeight[], assetsById: Map<string, Asset>): string | null {
  if (weights.length === 0) return MODEL_ERROR_EMPTY;
  for (const weight of weights) {
    const asset = assetsById.get(weight.assetId);
    if (!asset) return MODEL_ERROR_UNKNOWN_ASSET;
    if (exclusionReason(asset)) return MODEL_ERROR_NOT_ALLOWED;
  }
  const total = weights.reduce((sum, weight) => sum + weight.targetPercentage, 0);
  if (Math.abs(total - 100) > MODEL_WEIGHT_SUM_TOLERANCE) return MODEL_ERROR_SUM;
  return null;
}

/**
 * A calculation's proposed weights as the model's rows (RM2 on the way in). `candidateIds` are the
 * instruments evaluated at 0 shares: they keep the flag only while they still hold nothing (RM3).
 */
export function proposalToModelWeights(
  proposed: ModelWeight[],
  assetsById: Map<string, Asset>,
  quantityOf: (asset: Asset) => number,
): ModelWeightsResult & { portfolioWeights: ModelPortfolioWeight[] } {
  const fit = toModelWeights(proposed, assetsById);
  const portfolioWeights = fit.weights.map((weight): ModelPortfolioWeight => {
    const asset = assetsById.get(weight.assetId);
    const candidate = !!asset && quantityOf(asset) <= 0;
    return { assetId: weight.assetId, targetPercentage: weight.pct, ...(candidate ? { candidate: true } : {}) };
  });
  return { ...fit, portfolioWeights };
}

/**
 * PO1 — a model written by hand from nothing starts from what is held: the tradable instruments with
 * value, at today's market weights (Σ = 100, 0,01 step). Empty when nothing tradable is held.
 */
export function seedModelFromToday(allAssets: Asset[], valueOf: (asset: Asset) => number): ModelPortfolioWeight[] {
  const held = allAssets
    .map((asset) => ({ assetId: asset.id, pct: Math.max(0, valueOf(asset)) }))
    .filter((entry, i) => entry.pct > 0 && exclusionReason(allAssets[i]) === null);
  return toModelWeights(held, new Map(allAssets.map((asset) => [asset.id, asset]))).weights.map((weight) => ({
    assetId: weight.assetId,
    targetPercentage: weight.pct,
  }));
}

/** Adds an instrument to evaluate (RM3): weight 0, `candidate`; a no-op when it is already there. */
export function addModelCandidate(weights: ModelPortfolioWeight[], assetId: string): ModelPortfolioWeight[] {
  if (weights.some((weight) => weight.assetId === assetId)) return weights;
  return [...weights, { assetId, targetPercentage: 0, candidate: true }];
}

/** Drops the `candidate` flag from every instrument that now holds shares (RM3, at the next save). */
export function clearHeldCandidates(
  weights: ModelPortfolioWeight[],
  assetsById: Map<string, Asset>,
  quantityOf: (asset: Asset) => number,
): ModelPortfolioWeight[] {
  return weights.map((weight) => {
    if (!weight.candidate) return weight;
    const asset = assetsById.get(weight.assetId);
    if (!asset || quantityOf(asset) <= 0) return weight;
    const { candidate: _candidate, ...rest } = weight;
    void _candidate;
    return rest;
  });
}

export interface ModelVsTodayRow {
  assetId: string;
  modelPct: number;
  todayPct: number;
  /** (modello% − oggi%)/100 · M — positive = to buy. */
  diffEur: number;
  candidate: boolean;
}

export interface ModelVsToday {
  /** M = Σ value of the model's instruments. */
  baseEur: number;
  rows: ModelVsTodayRow[];
  /** Tradable instruments held but not in the model (not part of M). */
  outside: { assetIds: string[]; valueEur: number };
}

/**
 * RM4 — «oggi contro modello». Base `M` = Σ value of the model's instruments; per row `oggi% =
 * value / M · 100` and `differenza € = (modello% − oggi%)/100 · M`. Rows by model weight, the
 * candidates last; a tradable instrument held outside the model is summed apart.
 */
export function describeModelVsToday(
  weights: ModelPortfolioWeight[],
  allAssets: Asset[],
  valueOf: (asset: Asset) => number,
): ModelVsToday {
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const inModel = new Set(weights.map((weight) => weight.assetId));
  const valueById = new Map(weights.map((weight) => [weight.assetId, Math.max(0, valueOf(assetsById.get(weight.assetId) as Asset))]));
  const baseEur = [...valueById.values()].reduce((sum, value) => sum + value, 0);

  const rows = weights
    .map((weight, index): ModelVsTodayRow & { index: number } => {
      const value = valueById.get(weight.assetId) ?? 0;
      const todayPct = baseEur > 0 ? (value / baseEur) * 100 : 0;
      return {
        index,
        assetId: weight.assetId,
        modelPct: weight.targetPercentage,
        todayPct,
        diffEur: ((weight.targetPercentage - todayPct) / 100) * baseEur,
        candidate: !!weight.candidate,
      };
    })
    .sort((a, b) => Number(a.candidate) - Number(b.candidate) || b.modelPct - a.modelPct || a.index - b.index)
    .map(({ index: _index, ...row }) => {
      void _index;
      return row;
    });

  const outsideAssets = allAssets.filter(
    (asset) => !inModel.has(asset.id) && asset.type !== 'cash' && resolveAllocationRole(asset) === 'tradable' && valueOf(asset) > 0,
  );
  return {
    baseEur,
    rows,
    outside: { assetIds: outsideAssets.map((asset) => asset.id), valueEur: outsideAssets.reduce((sum, asset) => sum + valueOf(asset), 0) },
  };
}
