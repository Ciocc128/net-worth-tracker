/**
 * weightOptimizerNarrative — every word the weight optimizer's PAC panel and report speak
 * (doc/weight-optimizer-ate.md §9.3). Pure: no Firebase, no DOM. A signed figure always carries
 * the typographic minus «−», never the ASCII hyphen (same rule as `accumulationNarrative.ts`).
 *
 * `describeObjectiveLabel` moved here from `weightOptimizer.ts` (O1 kept a local `labelForRow`
 * only so that module compiled and reported on its own before this one existed — see its header
 * comment) and fixes the factor label to match this file's own convention: "Momentum nell'azionario",
 * not "Momentum (Azioni)".
 */
import type { AssetClass } from '@/types/assets';
import type { GeoArea } from '@/lib/constants/geoAreas';
import type { ConflictReport, ObjectiveReport, OptimizerMode, OptimizerWarning } from './weightOptimizer';
import { ASSET_CLASS_LABELS } from './allocationUtils';
import { GEO_AREA_LABELS } from '@/lib/constants/geoAreas';
import { formatNumberIt, formatPercentageIt } from './formatters';

// ---------------------------------------------------------------------------
// Objective labels
// ---------------------------------------------------------------------------

/** "Momentum nell'azionario", "X nell'obbligazionario" — the same idiom the geography rows use
 *  ("Stati Uniti nell'azionario"), never "Momentum (Azioni)". */
const CLASS_SCOPE_PHRASE: Partial<Record<AssetClass, string>> = {
  equity: "nell'azionario",
  bonds: "nell'obbligazionario",
};

function classScopePhrase(assetClass: AssetClass | undefined): string {
  if (!assetClass) return '';
  return CLASS_SCOPE_PHRASE[assetClass] ?? `nella classe ${ASSET_CLASS_LABELS[assetClass] ?? assetClass}`;
}

export function describeObjectiveLabel(
  kind: ObjectiveReport['kind'],
  assetClass?: AssetClass,
  subCategory?: string,
  area?: GeoArea,
  groupLabel?: string
): string {
  switch (kind) {
    case 'class':
      return `Classe ${ASSET_CLASS_LABELS[assetClass as string] ?? assetClass}`;
    case 'leverage':
      return 'Leva';
    case 'factor':
      return `${subCategory} ${classScopePhrase(assetClass)}`;
    case 'geo':
      return `${GEO_AREA_LABELS[area as GeoArea]} nell'azionario`;
    case 'group':
      return `Gruppo ${groupLabel}`;
  }
}

// ---------------------------------------------------------------------------
// Gap / target / achieved formatting — pp with one decimal, leverage with two and "×"
// ---------------------------------------------------------------------------

function isLeverageObjective(objective: Pick<ObjectiveReport, 'kind'>): boolean {
  return objective.kind === 'leverage';
}

export function formatObjectiveTarget(objective: ObjectiveReport): string {
  return isLeverageObjective(objective) ? `${formatNumberIt(objective.targetValue, 2)}×` : formatPercentageIt(objective.targetValue, 1);
}

export function formatObjectiveAchieved(objective: ObjectiveReport): string {
  return isLeverageObjective(objective) ? `${formatNumberIt(objective.achievedValue, 2)}×` : formatPercentageIt(objective.achievedValue, 1);
}

/** «+0,4 pp» / «−0,4 pp» / «+0,04×» / «−0,04×» — typographic minus, never the ASCII hyphen. */
export function formatObjectiveGap(objective: ObjectiveReport): string {
  const leverage = isLeverageObjective(objective);
  const value = leverage ? objective.gapPp / 100 : objective.gapPp;
  const amount = formatNumberIt(Math.abs(value), leverage ? 2 : 1);
  const suffix = leverage ? '×' : ' pp';
  if (value < -1e-9) return `−${amount}${suffix}`;
  if (value > 1e-9) return `+${amount}${suffix}`;
  return `${amount}${suffix}`;
}

/** «Azioni 102,0% → 101,6% (−0,4 pp)» — one line of the optimizer's report (§9.2 point 6). */
export function describeObjectiveRow(objective: ObjectiveReport): string {
  return `${objective.label} ${formatObjectiveTarget(objective)} → ${formatObjectiveAchieved(objective)} (${formatObjectiveGap(objective)})`;
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/** «Senza l'obiettivo «Leva»: Stati Uniti nell'azionario da 66,1% a 62,0%.» — `fromGapPp`/`toGapPp`
 *  are gaps, not raw values, so the sentence rebuilds the achieved figure from each objective's
 *  own `targetValue` (looked up by id in the same `objectives` list the report carries). */
export function describeConflict(conflict: ConflictReport, objectives: ObjectiveReport[]): string {
  const removed = objectives.find((o) => o.id === conflict.removedObjectiveId);
  const removedLabel = removed?.label ?? conflict.removedObjectiveId;

  const parts = conflict.improvements
    .map((improvement) => {
      const objective = objectives.find((o) => o.id === improvement.objectiveId);
      if (!objective) return null;
      const leverage = isLeverageObjective(objective);
      const fromValue = objective.targetValue + improvement.fromGapPp;
      const toValue = objective.targetValue + improvement.toGapPp;
      const fromText = leverage ? `${formatNumberIt(fromValue, 2)}×` : formatPercentageIt(fromValue, 1);
      const toText = leverage ? `${formatNumberIt(toValue, 2)}×` : formatPercentageIt(toValue, 1);
      return `${objective.label} da ${fromText} a ${toText}`;
    })
    .filter((text): text is string => text !== null);

  return `Senza l'obiettivo «${removedLabel}»: ${parts.join('; ')}.`;
}

// ---------------------------------------------------------------------------
// Warnings — one text per OptimizerWarning.code
// ---------------------------------------------------------------------------

/** `labelOf` resolves a candidate/position key to its display label — the report only carries the
 *  key, the panel is the one that knows the positions. */
export function describeOptimizerWarning(warning: OptimizerWarning, labelOf: (key: string) => string): string {
  switch (warning.code) {
    case 'geo_uncovered':
      return `«${labelOf(warning.key)}»: nessun dato di geografia, escluso dall'obiettivo geografico.`;
    case 'geo_estimated':
      return `«${labelOf(warning.key)}»: circa ${formatPercentageIt(warning.estimatedPct, 0)} della sua geografia è stimata, non da un factsheet.`;
    case 'reference_estimated':
      return `Circa ${formatPercentageIt(warning.estimatedPct, 0)} della geografia di riferimento è stimata.`;
    case 'factor_unmapped':
      return `«${warning.subCategory}» (${ASSET_CLASS_LABELS[warning.assetClass] ?? warning.assetClass}) non ha un peso tra i sotto-obiettivi: pesa zero nel calcolo.`;
    case 'proxy_mismatch':
      return `«${labelOf(warning.key)}»: i membri del gruppo hanno un'esposizione diversa dallo strumento che compra; il calcolo usa solo quella dello strumento che compra.`;
    case 'bound_conflict':
      return `«${labelOf(warning.key)}»: i limiti impostati si escludono a vicenda, il massimo è stato allineato al minimo.`;
    case 'not_converged':
      return "Il calcolo non ha raggiunto la convergenza entro le iterazioni disponibili: il risultato resta un'approssimazione.";
    case 'stale_profile':
      return `«${labelOf(warning.key)}»: i dati di geografia risalgono al ${warning.asOf}.`;
  }
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export const OPTIMIZER_MODE_LABELS: Record<OptimizerMode, string> = {
  reachable: 'Raggiungibile col PAC',
  ideal: 'Ideale',
};

/** The one-line difference shown under the mode toggle (§9.2 point 3). */
export function describeOptimizerMode(mode: OptimizerMode): string {
  return mode === 'reachable'
    ? 'Raggiungibile non scende sotto ciò che possiedi, perché il PAC non vende.'
    : 'Ideale ignora quanto possiedi oggi: propone i pesi più vicini agli obiettivi, anche sotto il posseduto.';
}

/** §9.2 point 7 — shown before applying Ideale weights that would sell nothing but ask for it. */
export const OPTIMIZER_IDEAL_BELOW_HELD_CONFIRM =
  'In modalità Ideale alcuni pesi sono sotto ciò che possiedi: il PAC non vende, quindi quelle posizioni riceveranno zero acquisti.';

/** §9.2 point 1 — the panel's whole content when `idealAllocation` is off or unset. */
export const OPTIMIZER_DISABLED_READING = 'Nessuna allocazione ideale impostata: definiscila in Impostazioni → Allocazione.';

// ---------------------------------------------------------------------------
// Panel copy — no PAC component carries an Italian literal of its own (accumulationNarrative.ts's rule)
// ---------------------------------------------------------------------------

export const OPTIMIZER_STEP2_MANUAL = 'Manuale';
export const OPTIMIZER_STEP2_OPTIMIZED = 'Ottimizzato';
export const OPTIMIZER_ACTION_MODIFY_IN_SETTINGS = 'Modifica in Impostazioni';
export const OPTIMIZER_ACTION_CALCULATE = 'Calcola';
export const OPTIMIZER_ACTION_APPLY = 'Usa questi pesi';
export const OPTIMIZER_COL_INSTRUMENT = 'Strumento';
export const OPTIMIZER_COL_CURRENT = 'Peso oggi';
export const OPTIMIZER_COL_PROPOSED = 'Proposto';
export const OPTIMIZER_OBJECTIVES_TITLE = 'Obiettivi attivi';
export const OPTIMIZER_REPORT_TITLE = 'Rapporto';
export const OPTIMIZER_CONFLICTS_TITLE = 'Conflitti';
export const OPTIMIZER_WARNINGS_TITLE = 'Avvisi';
export const OPTIMIZER_LOADING_PROFILES = 'Carico i profili degli strumenti…';
export const OPTIMIZER_STATUS_NO_CANDIDATES = 'Nessuno strumento nel piano su cui proporre pesi.';
export const OPTIMIZER_STATUS_INFEASIBLE_BOUNDS = 'I limiti minimi impostati superano da soli il 100%: nessun peso proponibile.';
export const OPTIMIZER_STEP2_ARIA_LABEL = 'Come compilare i pesi target';
export const OPTIMIZER_MODE_ARIA_LABEL = 'Modalità di calcolo dei pesi';
export const OPTIMIZER_PROFILES_FAILURE_SUBJECT = 'Profili strumenti';
export const OPTIMIZER_PROFILES_FAILURE_CONSEQUENCE = 'il calcolo non può partire';

// ---------------------------------------------------------------------------
// The step-3 snapshot provenance row (§9.4)
// ---------------------------------------------------------------------------

export interface OptimizerSnapshotSummary {
  computedAt: Date;
  mode: OptimizerMode;
  weights: Array<{ key: string; proposedPct: number }>;
}

/** «Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile), poi modificati a mano.» — only the
 *  clause that changes, never re-run the optimizer to know it: compares the snapshot's proposed
 *  weights against the draft's CURRENT ones by position key. */
export function describeOptimizerSnapshot(
  snapshot: OptimizerSnapshotSummary,
  currentPositions: Array<{ id: string; targetPercentage: number }>
): string {
  const day = String(snapshot.computedAt.getDate()).padStart(2, '0');
  const month = String(snapshot.computedAt.getMonth() + 1).padStart(2, '0');
  const modeLabel = OPTIMIZER_MODE_LABELS[snapshot.mode];
  const currentByKey = new Map(currentPositions.map((p) => [p.id, p.targetPercentage]));
  const edited = snapshot.weights.some((w) => {
    const current = currentByKey.get(w.key);
    return current !== undefined && Math.abs(current - w.proposedPct) > 0.01;
  });
  const base = `Pesi proposti dall'ottimizzatore il ${day}/${month} (${modeLabel})`;
  return edited ? `${base}, poi modificati a mano.` : `${base}.`;
}
