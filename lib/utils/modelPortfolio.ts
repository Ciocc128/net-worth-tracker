/**
 * doc/pac-ottimizzatore/README.md § RM2 — what a set of proposed weights can keep when it becomes a PAC
 * (today) or a model portfolio (A2): only tradable instruments, never a `frozen` or `excluded` asset and
 * never a liquidity account. The kept weights are rescaled to Σ = 100 at a 0,01 step.
 */
import type { Asset } from '@/types/assets';
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
