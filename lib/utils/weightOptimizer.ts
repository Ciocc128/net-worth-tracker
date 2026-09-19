/**
 * Weight optimizer — proposes market weights for the PAC's Target step from the owner's ideal
 * allocation objectives (Impostazioni → Allocazione → "Allocazione ideale", `doc/weight-optimizer-ate.md`).
 *
 * Convex QP, same family as `leverageAwareAllocationUtils.ts`'s planner (projected gradient
 * descent with backtracking, `projectOntoBudgetBox` shared via `./boxProjection`): every soft
 * objective (class / leverage / factor / geography / group cap) is a linear row `r_k(w)` in
 * percentage points, penalised quadratically and weighted by its priority; a small regularisation
 * term (`EPSILON`) against the candidates' current market weight makes the optimum unique. Hard
 * constraints — the budget (Σw = 1) and each candidate's `[lowerPct, upperPct]` box — apply only
 * inside the projection, never as a penalty term.
 *
 * `ObjectiveReport.label` is built by `describeObjectiveLabel` (`weightOptimizerNarrative.ts`,
 * O4 §9.3) — the one place that turns a row's (kind, class, sub-category, area, group) into the
 * Italian text the panel and the report both read.
 */
import type {
  Asset,
  AssetClass,
  AssetAllocationTarget,
  IdealAllocationSettings,
  ObjectivePriority,
} from '@/types/assets';
import type { InstrumentProfile } from '@/types/exposure';
import { GEO_AREAS, countryToArea, type GeoArea } from '@/lib/constants/geoAreas';
import { NO_SUBCATEGORY_LABEL, resolveAllocationRole } from './allocationUtils';
import { exposurePerEuro } from './accumulationPlanUtils';
import { dot, projectOntoBudgetBox } from './boxProjection';
import { describeObjectiveLabel } from './weightOptimizerNarrative';

// ---------------------------------------------------------------------------
// §5.1 — input types
// ---------------------------------------------------------------------------

export type OptimizerMode = 'reachable' | 'ideal';

export interface OptimizerCandidate {
  key: string; // positionId when coming from the PAC, else assetId
  assetIds: string[]; // members (proxy group) — the first is NOT special
  buyAssetId: string;
  label: string;
  currentValueEur: number; // Σ member values
  exposurePerEuro: Partial<Record<AssetClass, number>>; // of the BUY asset
  factorPerEuro: Partial<Record<AssetClass, Record<string, number>>>; // class → subCategory → notional per €
  areaPerEuro: Record<GeoArea, number> | null; // equity-leg notional per € by area; null = no geography
  areaEstimatedPerEuro: number; // part of areaPerEuro that comes from an ESTIMATED "Altri paesi"
  fixedValueEur: number; // Σ value of non-buy members (proxy) — held, never bought, never sold
  lowerPct: number; // 0..100, resolved bounds (§5.5)
  upperPct: number;
}

export interface OptimizerInput {
  candidates: OptimizerCandidate[];
  baseEur: number; // B
  targets: AssetAllocationTarget; // the page's EFFECTIVE targets
  settings: IdealAllocationSettings;
  referenceAreas: Record<GeoArea, number> | null; // from the reference index (§5.4), sums to 1
  referenceEstimatedShare: number; // part of referenceAreas that is estimated
  mode: OptimizerMode;
  /** L* — `deriveTargetLeverageRatio(targets)`, passed in by the caller (§6.1). */
  targetLeverageRatio: number;
}

// ---------------------------------------------------------------------------
// §6 — result types
// ---------------------------------------------------------------------------

export type OptimizerWarning =
  | { code: 'geo_uncovered'; key: string }
  | { code: 'geo_estimated'; key: string; estimatedPct: number }
  | { code: 'reference_estimated'; estimatedPct: number }
  | { code: 'factor_unmapped'; assetClass: AssetClass; subCategory: string }
  | { code: 'proxy_mismatch'; key: string }
  | { code: 'bound_conflict'; key: string }
  | { code: 'not_converged' }
  | { code: 'stale_profile'; key: string; asOf: string };

export interface ObjectiveReport {
  id: string; // e.g. 'class:equity', 'factor:equity:Momentum', 'geo:us', 'leverage', 'group:<id>'
  kind: 'class' | 'factor' | 'geo' | 'leverage' | 'group';
  label: string; // Italian, from the narrative module
  priority: ObjectivePriority;
  targetValue: number; // pp or ×, as displayed
  achievedValue: number;
  gapPp: number; // signed, in pp (leverage: 1 pp = 0.01×)
  coveragePct?: number; // geo only: share of scope exposure with data
}

export interface ConflictReport {
  removedObjectiveId: string;
  improvements: Array<{ objectiveId: string; fromGapPp: number; toGapPp: number }>;
}

export interface OptimizerResult {
  status: 'ok' | 'infeasible_bounds' | 'no_candidates';
  weights: Array<{ key: string; label: string; currentPct: number; proposedPct: number }>;
  objectives: ObjectiveReport[];
  conflicts: ConflictReport[]; // at most 3, largest improvement first
  warnings: OptimizerWarning[];
  iterations: number;
  converged: boolean;
}

/** Injectable only from tests (§10), to force `not_converged` without waiting out 8000 iterations. */
export interface SolverOptions {
  maxIterations?: number;
}

// ---------------------------------------------------------------------------
// §7.1 — default settings (the type lives in types/assets.ts; the applicative default lives here,
// same split as every other Impostazioni default — see doc/guide/impostazioni.md)
// ---------------------------------------------------------------------------

export const DEFAULT_IDEAL_ALLOCATION: IdealAllocationSettings = {
  enabled: false,
  classPriority: 'essential',
  leveragePriority: 'high',
  factorObjectives: [],
  geography: null,
  instrumentLimits: [],
  groupLimits: [],
};

// ---------------------------------------------------------------------------
// §5.3 — "Altri paesi" attribution
// ---------------------------------------------------------------------------

/**
 * Splits a profile's country weights (curated `code`/`ExposureLegSlice.key`, mapped to `key` by
 * the caller) into the three geo areas, resolving the un-itemised `'OTHER'` slice in order:
 * regional (all explicit countries share one area) → curated `otherAreaSplit` → estimated from
 * the reference's own countries (excluding this profile's explicit ones and the reference's own
 * `OTHER`) → developedExUs fallback. Called with `referenceCountries = null` for the reference
 * index's OWN `OTHER` slice, which then estimates from the reference's own explicit non-US
 * countries instead (§5.3's "il riferimento stesso").
 */
export function areasFromCountries(
  countries: Array<{ key: string; weight: number }>,
  otherAreaSplit: Partial<Record<GeoArea, number>> | undefined,
  referenceCountries: Array<{ key: string; weight: number }> | null
): { areas: Record<GeoArea, number>; estimatedShare: number } {
  const areas: Record<GeoArea, number> = { us: 0, developedExUs: 0, emerging: 0 };
  const explicitKeys = new Set<string>();
  const explicitAreas = new Set<GeoArea>();
  let other = 0;

  for (const country of countries) {
    if (country.key === 'OTHER') {
      other += country.weight;
      continue;
    }
    explicitKeys.add(country.key);
    const area = countryToArea(country.key);
    if (area) {
      areas[area] += country.weight;
      explicitAreas.add(area);
    }
  }

  let estimatedShare = 0;

  if (other > 0) {
    if (explicitAreas.size === 1) {
      // Step 3: regional.
      const [onlyArea] = [...explicitAreas];
      areas[onlyArea] += other;
    } else if (otherAreaSplit) {
      // Step 4: curated.
      for (const area of GEO_AREAS) areas[area] += other * (otherAreaSplit[area] ?? 0);
    } else {
      // Step 5: estimated — from the reference's countries (generic case), or from this
      // profile's own explicit non-US countries when it IS the reference (referenceCountries null).
      const pool =
        referenceCountries !== null
          ? referenceCountries.filter((rc) => rc.key !== 'OTHER' && !explicitKeys.has(rc.key))
          : countries.filter((c) => c.key !== 'OTHER' && c.key !== 'US');

      const poolByArea: Record<GeoArea, number> = { us: 0, developedExUs: 0, emerging: 0 };
      let poolTotal = 0;
      for (const entry of pool) {
        const area = countryToArea(entry.key);
        if (area) {
          poolByArea[area] += entry.weight;
          poolTotal += entry.weight;
        }
      }

      if (poolTotal > 0) {
        for (const area of GEO_AREAS) areas[area] += other * (poolByArea[area] / poolTotal);
        estimatedShare = other;
      } else {
        // Step 6: fallback.
        areas.developedExUs += other;
        estimatedShare = other;
      }
    }
  }

  // Step 7: normalise to sum 1 (curated profiles sum to 1 ± 0.005).
  const total = GEO_AREAS.reduce((sum, area) => sum + areas[area], 0);
  if (total > 0) {
    for (const area of GEO_AREAS) areas[area] = areas[area] / total;
    estimatedShare = estimatedShare / total;
  }

  return { areas, estimatedShare };
}

// ---------------------------------------------------------------------------
// §5.4 — candidate construction
// ---------------------------------------------------------------------------

/** Notional € per € per (class, subCategory) — same rule as `exposurePerEuro`, one level deeper. */
function factorPerEuroOf(asset: Asset): Partial<Record<AssetClass, Record<string, number>>> {
  const leverage = asset.leverageRatio ?? 1;
  const result: Partial<Record<AssetClass, Record<string, number>>> = {};

  if (!asset.composition || asset.composition.length === 0) {
    const sub = asset.subCategory?.trim() || NO_SUBCATEGORY_LABEL;
    result[asset.assetClass] = { [sub]: leverage };
    return result;
  }

  for (const component of asset.composition) {
    const sub = component.subCategory?.trim() || NO_SUBCATEGORY_LABEL;
    const contribution = (component.percentage / 100) * leverage;
    const bucket = result[component.assetClass] ?? {};
    bucket[sub] = (bucket[sub] ?? 0) + contribution;
    result[component.assetClass] = bucket;
  }

  return result;
}

interface AreaResolution {
  areaPerEuro: Record<GeoArea, number> | null;
  areaEstimatedPerEuro: number;
  uncovered: boolean;
}

/** §5.4's `areaPerEuro` rule for one asset, reused for the buy asset and (for the proxy-mismatch
 *  check) for its fixed members. `otherAreaSplit` comes from the curated `INDEX_PROFILES` entry
 *  `profileResolver.ts` propagated onto the equity leg (`doc/weight-optimizer-ate.md` §5.3). */
function resolveAreaPerEuro(
  asset: Asset,
  exposure: Partial<Record<AssetClass, number>>,
  profilesByTicker: Map<string, InstrumentProfile>,
  referenceCountries: Array<{ key: string; weight: number }> | null
): AreaResolution {
  const equityPerEuro = exposure.equity ?? 0;
  if (equityPerEuro === 0) return { areaPerEuro: null, areaEstimatedPerEuro: 0, uncovered: false };

  const equityLeg = profilesByTicker.get(asset.ticker)?.legs?.equity;
  const countries = equityLeg?.countries;
  if (!countries || countries.length === 0) {
    return { areaPerEuro: null, areaEstimatedPerEuro: 0, uncovered: true };
  }

  const { areas, estimatedShare } = areasFromCountries(
    countries.map((c) => ({ key: c.key, weight: c.weight })),
    equityLeg?.otherAreaSplit,
    referenceCountries
  );

  const areaPerEuro: Record<GeoArea, number> = { us: 0, developedExUs: 0, emerging: 0 };
  for (const area of GEO_AREAS) areaPerEuro[area] = equityPerEuro * areas[area];

  return { areaPerEuro, areaEstimatedPerEuro: equityPerEuro * estimatedShare, uncovered: false };
}

function resolveCandidateBounds(
  key: string,
  buyAssetId: string,
  currentValueEur: number,
  fixedValueEur: number,
  settings: IdealAllocationSettings,
  mode: OptimizerMode,
  baseEur: number,
  warnings: OptimizerWarning[]
): { lowerPct: number; upperPct: number } {
  let lower = 0;
  let upper = 100;

  const limit = settings.instrumentLimits.find((l) => l.assetId === buyAssetId);
  if (limit) {
    if (limit.minPct !== undefined) lower = Math.max(lower, limit.minPct);
    if (limit.maxPct !== undefined) upper = Math.min(upper, limit.maxPct);
  }

  if (mode === 'reachable') {
    lower = Math.max(lower, baseEur > 0 ? (currentValueEur / baseEur) * 100 : 0);
  } else {
    lower = Math.max(lower, baseEur > 0 ? (fixedValueEur / baseEur) * 100 : 0);
  }

  if (lower > upper) {
    upper = lower;
    warnings.push({ code: 'bound_conflict', key });
  }

  return { lowerPct: lower, upperPct: upper };
}

export function buildOptimizerCandidates(input: {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  assetsById: Map<string, Asset>;
  profilesByTicker: Map<string, InstrumentProfile>;
  referenceCountries: Array<{ key: string; weight: number }> | null;
  settings: IdealAllocationSettings;
  mode: OptimizerMode;
  baseEur: number;
  valueOf: (a: Asset) => number;
}): { candidates: OptimizerCandidate[]; warnings: OptimizerWarning[] } {
  const { positions, assetsById, profilesByTicker, referenceCountries, settings, mode, baseEur, valueOf } = input;
  const candidates: OptimizerCandidate[] = [];
  const warnings: OptimizerWarning[] = [];

  for (const position of positions) {
    const buyAsset = assetsById.get(position.buyAssetId);
    if (!buyAsset) continue;

    const memberAssets = position.memberAssetIds
      .map((id) => assetsById.get(id))
      .filter((a): a is Asset => a !== undefined);
    const currentValueEur = memberAssets.reduce((sum, a) => sum + valueOf(a), 0);
    const fixedValueEur = memberAssets
      .filter((a) => a.id !== position.buyAssetId)
      .reduce((sum, a) => sum + valueOf(a), 0);

    const exposure = exposurePerEuro(buyAsset);
    const factor = factorPerEuroOf(buyAsset);
    const area = resolveAreaPerEuro(buyAsset, exposure, profilesByTicker, referenceCountries);
    if (area.uncovered) warnings.push({ code: 'geo_uncovered', key: position.key });

    let proxyMismatch = false;
    for (const member of memberAssets) {
      if (member.id === position.buyAssetId) continue;
      const memberExposure = exposurePerEuro(member);
      const classes = new Set<AssetClass>([
        ...(Object.keys(exposure) as AssetClass[]),
        ...(Object.keys(memberExposure) as AssetClass[]),
      ]);
      for (const assetClass of classes) {
        if (Math.abs((exposure[assetClass] ?? 0) - (memberExposure[assetClass] ?? 0)) > 0.05) {
          proxyMismatch = true;
          break;
        }
      }
      if (!proxyMismatch && area.areaPerEuro) {
        const memberArea = resolveAreaPerEuro(member, memberExposure, profilesByTicker, referenceCountries);
        if (memberArea.areaPerEuro) {
          for (const geoArea of GEO_AREAS) {
            if (Math.abs(area.areaPerEuro[geoArea] - memberArea.areaPerEuro[geoArea]) > 0.05) {
              proxyMismatch = true;
              break;
            }
          }
        }
      }
      if (proxyMismatch) break;
    }
    if (proxyMismatch) warnings.push({ code: 'proxy_mismatch', key: position.key });

    const { lowerPct, upperPct } = resolveCandidateBounds(
      position.key,
      position.buyAssetId,
      currentValueEur,
      fixedValueEur,
      settings,
      mode,
      baseEur,
      warnings
    );

    candidates.push({
      key: position.key,
      assetIds: position.memberAssetIds,
      buyAssetId: position.buyAssetId,
      label: position.label,
      currentValueEur,
      exposurePerEuro: exposure,
      factorPerEuro: factor,
      areaPerEuro: area.areaPerEuro,
      areaEstimatedPerEuro: area.areaEstimatedPerEuro,
      fixedValueEur,
      lowerPct,
      upperPct,
    });
  }

  return { candidates, warnings };
}

// ---------------------------------------------------------------------------
// §5.4b — second-level gaps (G5): instruments the optimizer's factor objectives cannot place,
// shown as a preventive warning (Impostazioni's IdealAllocationTile, OptimizerPanel before
// "Calcola") — never blocks the calculation, it just says which euros the sub-category rows will
// silently attribute to "Senza sottocategoria" or drop as `factor_unmapped`.
// ---------------------------------------------------------------------------

export interface SecondLevelGap {
  assetId: string;
  assetName: string;
  assetClass: AssetClass;
  /** Set only for a gap found on one component of a composite asset. */
  componentIndex?: number;
  /** 'missing' = no sub-category at all; 'unknown' = a sub-category the class's `subCategoryConfig` does not list. */
  reason: 'missing' | 'unknown';
}

/** Same normalisation as `factorPerEuroOf`/`calculateCurrentAllocationSnapshot`: trim, empty → `NO_SUBCATEGORY_LABEL`. */
function normalizeSubCategory(sub: string | undefined): string {
  return sub?.trim() || NO_SUBCATEGORY_LABEL;
}

/**
 * §3.5/G2 — true when at least one of the given classes carries an enabled third-level
 * (`specificAssets`) target. Those targets are never a soft objective here: they are what the
 * optimizer computes, so the caller shows a declarative note instead of feeding them into `J(w)`.
 */
export function hasSpecificAssetTargets(targets: AssetAllocationTarget, assetClasses: AssetClass[]): boolean {
  return assetClasses.some((assetClass) => {
    const subTargets = targets[assetClass]?.subTargets;
    if (!subTargets) return false;
    return Object.values(subTargets).some(
      (value) => typeof value !== 'number' && (value.specificAssetsEnabled ?? (value.specificAssets?.length ?? 0) > 0)
    );
  });
}

export function findSecondLevelGaps(
  assets: Asset[],
  targets: AssetAllocationTarget,
  assetClasses: AssetClass[],
  valueOf: (a: Asset) => number
): SecondLevelGap[] {
  const scopedClasses = new Set(assetClasses);
  const gaps: SecondLevelGap[] = [];

  for (const asset of assets) {
    const role = resolveAllocationRole(asset);
    if (role !== 'tradable' && role !== 'frozen') continue;
    if (valueOf(asset) <= 0) continue;

    const checkSub = (assetClass: AssetClass, sub: string | undefined, componentIndex?: number) => {
      if (!scopedClasses.has(assetClass)) return;
      const categories = targets[assetClass]?.subCategoryConfig?.categories ?? [];
      const normalized = normalizeSubCategory(sub);
      if (normalized === NO_SUBCATEGORY_LABEL) {
        gaps.push({ assetId: asset.id, assetName: asset.name, assetClass, componentIndex, reason: 'missing' });
      } else if (!categories.includes(normalized)) {
        gaps.push({ assetId: asset.id, assetName: asset.name, assetClass, componentIndex, reason: 'unknown' });
      }
    };

    if (asset.composition && asset.composition.length > 0) {
      asset.composition.forEach((component, index) => checkSub(component.assetClass, component.subCategory, index));
    } else {
      checkSub(asset.assetClass, asset.subCategory);
    }
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// §6.1 — objective rows
// ---------------------------------------------------------------------------

const LAMBDA: Record<ObjectivePriority, number> = { essential: 1000, high: 100, medium: 10, low: 1 };
const EPSILON = 0.01;
/**
 * Raised from the ATE's original 3000 (owner's call, PR review, 2026-09-19): the leva+geografia
 * fixture of §10 — the flagship combination of objectives — needed 3112 iterations to converge and
 * was hitting the old cap on every run (`not_converged` warned routinely on realistic input, even
 * though the rounded weights at iteration 3000 already matched the converged ones). n ≤ 40
 * candidates keeps even 20000 iterations under 100ms, so the extra headroom is free.
 */
const MAX_ITERATIONS_DEFAULT = 8000;

interface ObjectiveRow {
  id: string;
  kind: ObjectiveReport['kind'];
  label: string;
  priority: ObjectivePriority;
  coeffs: number[]; // a_k, one per candidate
  constant: number; // b_k
  hinge: boolean;
  unit: 'pp' | 'x';
  targetValue: number;
}

function classTargetFraction(targetData: AssetAllocationTarget[string], baseEur: number): number {
  if (targetData.useFixedAmount) {
    return baseEur > 0 ? (targetData.fixedAmount ?? 0) / baseEur : 0;
  }
  return (targetData.targetPercentage || 0) / 100;
}

function classLeverageOf(candidate: OptimizerCandidate): number {
  return Object.values(candidate.exposurePerEuro).reduce((sum: number, v) => sum + (v ?? 0), 0);
}

function buildClassRows(candidates: OptimizerCandidate[], targets: AssetAllocationTarget, priority: ObjectivePriority, baseEur: number): ObjectiveRow[] {
  const rows: ObjectiveRow[] = [];
  for (const [assetClassKey, targetData] of Object.entries(targets)) {
    const assetClass = assetClassKey as AssetClass;
    const tc = classTargetFraction(targetData, baseEur);
    const exposureSum = candidates.reduce((sum, c) => sum + (c.exposurePerEuro[assetClass] ?? 0), 0);
    if (tc <= 0 && exposureSum <= 0) continue; // ignored: no target, no exposure

    rows.push({
      id: `class:${assetClass}`,
      kind: 'class',
      label: describeObjectiveLabel('class', assetClass),
      priority,
      coeffs: candidates.map((c) => 100 * (c.exposurePerEuro[assetClass] ?? 0)),
      constant: 100 * tc,
      hinge: false,
      unit: 'pp',
      targetValue: 100 * tc,
    });
  }
  return rows;
}

function buildLeverageRow(candidates: OptimizerCandidate[], priority: ObjectivePriority | 'off', targetLeverageRatio: number): ObjectiveRow | null {
  if (priority === 'off') return null;
  return {
    id: 'leverage',
    kind: 'leverage',
    label: describeObjectiveLabel('leverage'),
    priority,
    coeffs: candidates.map((c) => 100 * classLeverageOf(c)),
    constant: 100 * targetLeverageRatio,
    hinge: false,
    unit: 'x',
    targetValue: targetLeverageRatio,
  };
}

function subCategoryWeight(value: number | { targetPercentage: number }): number {
  return typeof value === 'number' ? value : value.targetPercentage;
}

function buildFactorRows(
  candidates: OptimizerCandidate[],
  targets: AssetAllocationTarget,
  factorObjectives: IdealAllocationSettings['factorObjectives'],
  baseEur: number,
  warnings: OptimizerWarning[]
): ObjectiveRow[] {
  const rows: ObjectiveRow[] = [];

  for (const { assetClass, priority } of factorObjectives) {
    const targetData = targets[assetClass];
    if (!targetData?.subCategoryConfig?.enabled) continue;
    const subTargets = targetData.subTargets;
    if (!subTargets || Object.keys(subTargets).length === 0) continue;
    const tc = classTargetFraction(targetData, baseEur);
    if (tc <= 0) continue;

    const weights: Record<string, number> = {};
    let weightSum = 0;
    for (const [sub, value] of Object.entries(subTargets)) {
      const pct = subCategoryWeight(value);
      weights[sub] = pct;
      weightSum += pct;
    }

    const subs = new Set<string>();
    for (const candidate of candidates) {
      const bucket = candidate.factorPerEuro[assetClass];
      if (bucket) for (const sub of Object.keys(bucket)) subs.add(sub);
    }
    for (const sub of Object.keys(weights)) subs.add(sub);

    for (const sub of subs) {
      const mapped = sub in weights && weightSum > 0;
      const rs = mapped ? weights[sub] / weightSum : 0;
      if (!mapped) warnings.push({ code: 'factor_unmapped', assetClass, subCategory: sub });

      rows.push({
        id: `factor:${assetClass}:${sub}`,
        kind: 'factor',
        label: describeObjectiveLabel('factor', assetClass, sub),
        priority,
        coeffs: candidates.map((c) => {
          const f = c.factorPerEuro[assetClass]?.[sub] ?? 0;
          const e = c.exposurePerEuro[assetClass] ?? 0;
          return (100 * (f - rs * e)) / tc;
        }),
        constant: 0,
        hinge: false,
        unit: 'pp',
        targetValue: rs * 100,
      });
    }
  }

  return rows;
}

function buildGeoRows(
  candidates: OptimizerCandidate[],
  targets: AssetAllocationTarget,
  settings: IdealAllocationSettings,
  referenceAreas: Record<GeoArea, number> | null,
  baseEur: number
): ObjectiveRow[] {
  if (!settings.geography?.enabled || !referenceAreas) return [];
  const equityTarget = targets.equity;
  if (!equityTarget) return [];
  const tEquity = classTargetFraction(equityTarget, baseEur);
  if (tEquity <= 0) return [];

  const priority = settings.geography.priority;
  return GEO_AREAS.map((area) => {
    const rho = referenceAreas[area];
    return {
      id: `geo:${area}`,
      kind: 'geo' as const,
      label: describeObjectiveLabel('geo', undefined, undefined, area),
      priority,
      coeffs: candidates.map((c) => {
        if (!c.areaPerEuro) return 0;
        const g = c.areaPerEuro[area];
        const e = c.exposurePerEuro.equity ?? 0;
        return (100 * (g - rho * e)) / tEquity;
      }),
      constant: 0,
      hinge: false,
      unit: 'pp' as const,
      targetValue: rho * 100,
    };
  });
}

function buildGroupRows(candidates: OptimizerCandidate[], groupLimits: IdealAllocationSettings['groupLimits']): ObjectiveRow[] {
  return groupLimits.map((group) => {
    const memberSet = new Set(group.assetIds);
    return {
      id: `group:${group.id}`,
      kind: 'group',
      label: describeObjectiveLabel('group', undefined, undefined, undefined, group.label),
      priority: group.priority,
      coeffs: candidates.map((c) => (memberSet.has(c.buyAssetId) ? 100 : 0)),
      constant: group.maxPct,
      hinge: true,
      unit: 'pp',
      targetValue: group.maxPct,
    };
  });
}

function buildObjectiveRows(
  candidates: OptimizerCandidate[],
  targets: AssetAllocationTarget,
  settings: IdealAllocationSettings,
  targetLeverageRatio: number,
  referenceAreas: Record<GeoArea, number> | null,
  baseEur: number,
  warnings: OptimizerWarning[]
): ObjectiveRow[] {
  const rows: ObjectiveRow[] = [];
  rows.push(...buildClassRows(candidates, targets, settings.classPriority, baseEur));
  const leverageRow = buildLeverageRow(candidates, settings.leveragePriority, targetLeverageRatio);
  if (leverageRow) rows.push(leverageRow);
  rows.push(...buildFactorRows(candidates, targets, settings.factorObjectives, baseEur, warnings));
  rows.push(...buildGeoRows(candidates, targets, settings, referenceAreas, baseEur));
  rows.push(...buildGroupRows(candidates, settings.groupLimits));
  return rows;
}

function evaluateRow(row: ObjectiveRow, x: number[]): number {
  const raw = dot(row.coeffs, x) - row.constant;
  return row.hinge ? Math.max(0, raw) : raw;
}

/**
 * The row's un-hinged value — for a group cap this is the ACTUAL current metric (e.g. the
 * group's real weight sum minus its cap), never clamped to 0 when the cap isn't binding.
 * `evaluateRow`'s hinge clamp is right for the penalty (§6.1/6.3) and for `gapPp` ("how much
 * over the cap", §6.7), but using it for `achievedValue` made a group under its cap always
 * report as sitting exactly AT the cap (fix, review rilievo B1, 2026-09-19: `targetValue +
 * gapPp` was `targetValue + 0` whenever the group was compliant, hiding its real weight).
 */
function evaluateRowRaw(row: ObjectiveRow, x: number[]): number {
  return dot(row.coeffs, x) - row.constant;
}

// ---------------------------------------------------------------------------
// §6.2 — regularisation reference
// ---------------------------------------------------------------------------

function computeWRef(candidates: OptimizerCandidate[], mode: OptimizerMode, baseEur: number): number[] {
  const n = candidates.length;
  const raw = candidates.map((c) => (mode === 'reachable' && baseEur > 0 ? c.currentValueEur / baseEur : c.currentValueEur));
  const sum = raw.reduce((s, v) => s + v, 0);
  if (sum <= 0) return new Array(n).fill(1 / n);
  return raw.map((v) => v / sum);
}

// ---------------------------------------------------------------------------
// §6.3 — solver
// ---------------------------------------------------------------------------

function buildObjective(rows: ObjectiveRow[], wRef: number[], n: number): (x: number[]) => number {
  return (x: number[]): number => {
    let j = 0;
    for (const row of rows) {
      const r = evaluateRow(row, x);
      j += LAMBDA[row.priority] * r * r;
    }
    for (let i = 0; i < n; i++) {
      const d = 100 * (x[i] - wRef[i]);
      j += EPSILON * d * d;
    }
    return j;
  };
}

function buildGradient(rows: ObjectiveRow[], wRef: number[], n: number): (x: number[]) => number[] {
  return (x: number[]): number[] => {
    const g = new Array(n).fill(0);
    for (const row of rows) {
      const raw = dot(row.coeffs, x) - row.constant;
      if (row.hinge && raw <= 0) continue; // inactive hinge: no contribution
      const factor = 2 * LAMBDA[row.priority] * raw;
      for (let i = 0; i < n; i++) g[i] += factor * row.coeffs[i];
    }
    for (let i = 0; i < n; i++) g[i] += 2 * EPSILON * 100 * 100 * (x[i] - wRef[i]);
    return g;
  };
}

interface SolveResult {
  x: number[];
  iterations: number;
  converged: boolean;
}

function solveQP(
  n: number,
  wRef: number[],
  lo: number[],
  hi: number[],
  objective: (x: number[]) => number,
  gradient: (x: number[]) => number[],
  solverOptions?: SolverOptions
): SolveResult {
  const maxIterations = solverOptions?.maxIterations ?? MAX_ITERATIONS_DEFAULT;

  let x = projectOntoBudgetBox(wRef, lo, hi, 1);
  let fx = objective(x);
  let eta = 1;
  let plateauCount = 0;
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    const g = gradient(x);
    if (Math.sqrt(dot(g, g)) < 1e-10) {
      converged = true;
      break;
    }

    let step = eta * 1.5;
    let accepted = false;
    let xCandidate = x;
    let fCandidate = fx;

    for (let tries = 0; tries < 40; tries++) {
      const candidate = projectOntoBudgetBox(
        x.map((xi, i) => xi - step * g[i]),
        lo,
        hi,
        1
      );
      const fCand = objective(candidate);
      if (fCand <= fx - 1e-12 * Math.max(1, Math.abs(fx))) {
        xCandidate = candidate;
        fCandidate = fCand;
        accepted = true;
        eta = step;
        break;
      }
      step /= 2;
    }

    if (!accepted) {
      converged = true;
      break;
    }

    const prevFx = fx;
    x = xCandidate;
    fx = fCandidate;

    if (Math.abs(prevFx - fx) < 1e-12 * Math.max(1, Math.abs(fx))) {
      plateauCount += 1;
      if (plateauCount >= 25) {
        converged = true;
        break;
      }
    } else {
      plateauCount = 0;
    }
  }

  return { x, iterations, converged };
}

// ---------------------------------------------------------------------------
// §6.4 — 2% heuristic
// ---------------------------------------------------------------------------

function applyMinWeightHeuristic(
  n: number,
  wRef: number[],
  lo: number[],
  hiInit: number[],
  objective: (x: number[]) => number,
  gradient: (x: number[]) => number[],
  solverOptions?: SolverOptions
): { result: SolveResult; hi: number[] } {
  let hi = [...hiInit];
  let result = solveQP(n, wRef, lo, hi, objective, gradient, solverOptions);

  for (let pass = 0; pass < 5; pass++) {
    const small: number[] = [];
    for (let i = 0; i < n; i++) {
      if (result.x[i] < 0.02 && lo[i] === 0 && result.x[i] > 0) small.push(i);
    }
    if (small.length === 0) break;

    const candidateHi = [...hi];
    for (const i of small) candidateHi[i] = 0;
    const sumHi = candidateHi.reduce((s, v) => s + v, 0);
    if (sumHi < 1) break; // undo: keep the previous pass's result

    hi = candidateHi;
    result = solveQP(n, wRef, lo, hi, objective, gradient, solverOptions);
  }

  return { result, hi };
}

// ---------------------------------------------------------------------------
// §6.5 — rounding to 0.5pp, largest-remainder method
// ---------------------------------------------------------------------------

function roundToHalfPoints(x: number[], hi: number[]): number[] {
  const n = x.length;
  const units = x.map((xi) => Math.floor(200 * xi + 1e-9));
  const totalUnits = units.reduce((s, v) => s + v, 0);
  let remaining = Math.max(0, 200 - totalUnits);
  const fractional = x.map((xi, i) => 200 * xi - units[i]);

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    if (fractional[b] !== fractional[a]) return fractional[b] - fractional[a];
    if (x[b] !== x[a]) return x[b] - x[a];
    return a - b;
  });

  const result = [...units];
  for (const i of order) {
    if (remaining <= 0) break;
    if ((result[i] + 1) / 200 <= hi[i] + 1e-9) {
      result[i] += 1;
      remaining -= 1;
    }
  }

  return result.map((u) => u / 2);
}

// ---------------------------------------------------------------------------
// §6.7 — conflicts
// ---------------------------------------------------------------------------

function computeConflicts(
  rows: ObjectiveRow[],
  finalGaps: Map<string, number>,
  n: number,
  lo: number[],
  hi: number[],
  wRef: number[],
  solverOptions?: SolverOptions
): ConflictReport[] {
  const flagged = rows.filter((row) => Math.abs(finalGaps.get(row.id) ?? 0) > 0.25);
  const scored: Array<ConflictReport & { weightedSum: number }> = [];

  for (const removed of flagged) {
    const remainingRows = rows.filter((row) => row.id !== removed.id);
    const objective = buildObjective(remainingRows, wRef, n);
    const gradient = buildGradient(remainingRows, wRef, n);
    const solved = solveQP(n, wRef, lo, hi, objective, gradient, solverOptions);

    const improvements: ConflictReport['improvements'] = [];
    let weightedSum = 0;

    for (const other of flagged) {
      if (other.id === removed.id) continue;
      const fromGapPp = finalGaps.get(other.id) ?? 0;
      const toGapPp = evaluateRow(other, solved.x);
      const improvement = Math.abs(fromGapPp) - Math.abs(toGapPp);
      if (improvement >= 0.25) {
        improvements.push({ objectiveId: other.id, fromGapPp, toGapPp });
        weightedSum += improvement * LAMBDA[other.priority];
      }
    }

    if (improvements.length > 0) {
      scored.push({ removedObjectiveId: removed.id, improvements, weightedSum });
    }
  }

  scored.sort((a, b) => b.weightedSum - a.weightedSum || a.removedObjectiveId.localeCompare(b.removedObjectiveId));
  return scored.slice(0, 3).map(({ removedObjectiveId, improvements }) => ({ removedObjectiveId, improvements }));
}

// ---------------------------------------------------------------------------
// §6 — optimizeWeights
// ---------------------------------------------------------------------------

export function optimizeWeights(input: OptimizerInput, solverOptions?: SolverOptions): OptimizerResult {
  const { candidates, baseEur, targets, settings, referenceAreas, referenceEstimatedShare, mode, targetLeverageRatio } = input;
  const n = candidates.length;

  if (n === 0) {
    return { status: 'no_candidates', weights: [], objectives: [], conflicts: [], warnings: [], iterations: 0, converged: false };
  }

  const sumLowerPct = candidates.reduce((sum, c) => sum + c.lowerPct, 0);
  if (sumLowerPct > 100) {
    return { status: 'infeasible_bounds', weights: [], objectives: [], conflicts: [], warnings: [], iterations: 0, converged: false };
  }

  const warnings: OptimizerWarning[] = [];
  const lo = candidates.map((c) => c.lowerPct / 100);
  const hiInit = candidates.map((c) => c.upperPct / 100);
  const wRef = computeWRef(candidates, mode, baseEur);

  const rows = buildObjectiveRows(candidates, targets, settings, targetLeverageRatio, referenceAreas, baseEur, warnings);
  const objective = buildObjective(rows, wRef, n);
  const gradient = buildGradient(rows, wRef, n);

  const { result, hi } = applyMinWeightHeuristic(n, wRef, lo, hiInit, objective, gradient, solverOptions);
  if (!result.converged) warnings.push({ code: 'not_converged' });

  const roundedPct = roundToHalfPoints(result.x, hi);
  const xRounded = roundedPct.map((p) => p / 100);

  if (referenceEstimatedShare > 0) {
    warnings.push({ code: 'reference_estimated', estimatedPct: referenceEstimatedShare * 100 });
  }
  for (const c of candidates) {
    if (!c.areaPerEuro || c.areaEstimatedPerEuro <= 0) continue;
    const totalArea = GEO_AREAS.reduce((sum, area) => sum + c.areaPerEuro![area], 0);
    if (totalArea > 0) {
      warnings.push({ code: 'geo_estimated', key: c.key, estimatedPct: (c.areaEstimatedPerEuro / totalArea) * 100 });
    }
  }

  let geoCoveragePct: number | undefined;
  if (rows.some((row) => row.kind === 'geo')) {
    let numerator = 0;
    let denominator = 0;
    candidates.forEach((c, i) => {
      const e = c.exposurePerEuro.equity ?? 0;
      denominator += e * xRounded[i];
      if (c.areaPerEuro) numerator += e * xRounded[i];
    });
    geoCoveragePct = denominator > 0 ? (numerator / denominator) * 100 : 0;
  }

  const finalGaps = new Map<string, number>();
  const objectives: ObjectiveReport[] = rows.map((row) => {
    const gapPp = evaluateRow(row, xRounded);
    finalGaps.set(row.id, gapPp);
    const rawValue = evaluateRowRaw(row, xRounded);
    const achievedValue = row.unit === 'x' ? row.targetValue + rawValue / 100 : row.targetValue + rawValue;
    return {
      id: row.id,
      kind: row.kind,
      label: row.label,
      priority: row.priority,
      targetValue: row.targetValue,
      achievedValue,
      gapPp,
      ...(row.kind === 'geo' ? { coveragePct: geoCoveragePct } : {}),
    };
  });

  const conflicts = computeConflicts(rows, finalGaps, n, lo, hi, wRef, solverOptions);

  const weights = candidates.map((c, i) => ({
    key: c.key,
    label: c.label,
    currentPct: baseEur > 0 ? (c.currentValueEur / baseEur) * 100 : 0,
    proposedPct: roundedPct[i],
  }));

  return {
    status: 'ok',
    weights,
    objectives,
    conflicts,
    warnings,
    iterations: result.iterations,
    converged: result.converged,
  };
}

// ---------------------------------------------------------------------------
// §4.3 — shared candidate + solve pipeline (extracted from OptimizerPanel's own `result` useMemo,
// so the PAC's Ottimizzato view and Allocazione's standalone `IdealCompositionDialog` never
// duplicate the "build candidates, then optimize" wiring). The geography reference
// (`referenceAreas`/`referenceEstimatedShare`) is still the CALLER's concern — it depends only on
// `settings.geography`, not on the candidates, and both callers already memoise it once per render
// via `useOptimizerGeographyReference` (`lib/hooks/useOptimizerGeographyReference.ts`).
// ---------------------------------------------------------------------------

export function runOptimizer(input: {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  assetsById: Map<string, Asset>;
  profilesByTicker: Map<string, InstrumentProfile>;
  referenceCountries: Array<{ key: string; weight: number }> | null;
  settings: IdealAllocationSettings;
  mode: OptimizerMode;
  baseEur: number;
  valueOf: (a: Asset) => number;
  targets: AssetAllocationTarget;
  referenceAreas: Record<GeoArea, number> | null;
  referenceEstimatedShare: number;
  targetLeverageRatio: number;
  /** §4.2 — a frozen candidate is fixed to its current share (lowerPct = upperPct); applied to the
   *  freshly-built candidates, before `optimizeWeights` runs. `OptimizerPanel` never passes it: a
   *  PAC position already resolves this through `resolveCandidateBounds`'s own `fixedValueEur` term. */
  fixBounds?: (candidate: OptimizerCandidate) => Partial<Pick<OptimizerCandidate, 'lowerPct' | 'upperPct'>>;
}): OptimizerResult {
  const { candidates } = buildOptimizerCandidates({
    positions: input.positions,
    assetsById: input.assetsById,
    profilesByTicker: input.profilesByTicker,
    referenceCountries: input.referenceCountries,
    settings: input.settings,
    mode: input.mode,
    baseEur: input.baseEur,
    valueOf: input.valueOf,
  });
  const finalCandidates = input.fixBounds ? candidates.map((c) => ({ ...c, ...input.fixBounds!(c) })) : candidates;

  return optimizeWeights({
    candidates: finalCandidates,
    baseEur: input.baseEur,
    targets: input.targets,
    settings: input.settings,
    referenceAreas: input.referenceAreas,
    referenceEstimatedShare: input.referenceEstimatedShare,
    mode: input.mode,
    targetLeverageRatio: input.targetLeverageRatio,
  });
}

// ---------------------------------------------------------------------------
// §4.2 — Allocazione's standalone tool (`IdealCompositionDialog`): one candidate per instrument,
// never a proxy group. A `frozen` asset is fixed to its current share (`fixBounds`, §4.2's own
// rule — distinct from the PAC's `resolveCandidateBounds`, which has no such case: every PAC
// position is either freely tradable or a proxy group's fixed member, never a lone frozen row).
// ---------------------------------------------------------------------------

export interface StandaloneCandidates {
  positions: Array<{ key: string; label: string; memberAssetIds: string[]; buyAssetId: string }>;
  fixBounds: (candidate: OptimizerCandidate) => Partial<Pick<OptimizerCandidate, 'lowerPct' | 'upperPct'>>;
}

export function buildStandaloneCandidates(
  assets: Asset[],
  baseEur: number,
  valueOf: (a: Asset) => number
): StandaloneCandidates {
  const scoped = assets.filter((a) => {
    const role = resolveAllocationRole(a);
    return (role === 'tradable' || role === 'frozen') && valueOf(a) > 0;
  });
  const frozenValueById = new Map(
    scoped.filter((a) => resolveAllocationRole(a) === 'frozen').map((a) => [a.id, valueOf(a)])
  );

  return {
    positions: scoped.map((a) => ({ key: a.id, label: a.name, memberAssetIds: [a.id], buyAssetId: a.id })),
    fixBounds: (candidate) => {
      const frozenValue = frozenValueById.get(candidate.buyAssetId);
      if (frozenValue === undefined || baseEur <= 0) return {};
      const pct = (frozenValue / baseEur) * 100;
      return { lowerPct: pct, upperPct: pct };
    },
  };
}
