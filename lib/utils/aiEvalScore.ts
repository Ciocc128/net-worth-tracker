/**
 * The score of the AI eval (doc/ai-open-models-wiki.md § 7): per-model aggregates of the runs,
 * the owner's blind votes, and the winning rule. Pure — `scripts/aiEval.mts score` feeds it.
 *
 * The rule, as § 7 states it: the CHEAPEST eligible open model that does not lose on the
 * automatic checks and sits within half a point of the best reference's vote. Three readings
 * made explicit here:
 *
 *   - «costo vero» is what the provider billed, averaged per email over EVERY run of the model
 *     — the failed ones too (a truncated answer was paid and thrown away) — so a model that
 *     reasons at length pays for it, whatever its price per token (§ 4.5);
 *   - «non perde nei controlli» = no more failed runs than the CLEANEST reference (fewest failed
 *     runs, which need not be the best voted — the stricter reading, kept at F2's close on
 *     2026-09-28); a run fails on any outcome other than `ok` (a truncation is the candidate's failure) or any failed check;
 *   - only `candidate` models can win: a declared `control` (non-hallucination below 0,5 on
 *     Artificial Analysis, § 7.1) is measured, never chosen.
 */

import type { EvalCheckId, EvalChecks } from './aiEvalChecks';

export type EvalRole = 'candidate' | 'control' | 'reference';
export type EvalOutcome = 'ok' | 'empty' | 'truncated' | 'error';

export interface EvalRun {
  model: string;
  bundleId: string;
  outcome: EvalOutcome;
  input: number | null;
  output: number | null;
  reasoning: number | null;
  /** Dollars billed, as OpenRouter reports it. */
  cost: number | null;
  latencyMs: number;
  checks?: EvalChecks;
}

export interface EvalVote {
  utilita: number;
  tono: number;
}

export interface EvalModelScore {
  model: string;
  role: EvalRole;
  runs: number;
  ok: number;
  truncated: number;
  failedRuns: number;
  failuresByCheck: Record<EvalCheckId, number>;
  /** Figures of the text found nowhere in the prompt, summed over the runs: finer than a pass/fail. */
  unverifiedFigures: number;
  meanInput: number | null;
  meanOutput: number | null;
  meanReasoning: number | null;
  /** Mean dollars per email over every run (failed ones included). */
  meanCost: number | null;
  meanLatencyMs: number;
  votes: number;
  meanUtilita: number | null;
  meanTono: number | null;
  /** The mean of utilità and tono: the figure the half-point rule reads. */
  meanVote: number | null;
}

export interface EvalVerdict {
  winner: string | null;
  bestReference: { model: string; meanVote: number | null; failedRuns: number } | null;
  /** Why each candidate won or did not, one line each. */
  reasons: Record<string, string>;
}

/** Half a point on the 1–5 scale (§ 7). */
export const VOTE_MARGIN = 0.5;

const CHECK_IDS: EvalCheckId[] = ['figures', 'words', 'form', 'promises', 'italian'];

function mean(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number');
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0) / present.length;
}

export function isFailedRun(run: EvalRun): boolean {
  if (run.outcome !== 'ok') return true;
  return run.checks ? CHECK_IDS.some((id) => !run.checks![id].pass) : false;
}

/**
 * Aggregates per model. `votes` holds the owner's blind votes already mapped back to models
 * (bundleId → model → vote).
 */
export function scoreModels(
  models: Array<{ model: string; role: EvalRole }>,
  runs: EvalRun[],
  votes: Record<string, Record<string, EvalVote>>
): EvalModelScore[] {
  return models.map(({ model, role }) => {
    const own = runs.filter((run) => run.model === model);
    const failuresByCheck = Object.fromEntries(
      CHECK_IDS.map((id) => [id, own.filter((run) => run.checks && !run.checks[id].pass).length])
    ) as Record<EvalCheckId, number>;
    const ownVotes = Object.values(votes)
      .map((byModel) => byModel[model])
      .filter((vote): vote is EvalVote => Boolean(vote));
    const meanUtilita = mean(ownVotes.map((vote) => vote.utilita));
    const meanTono = mean(ownVotes.map((vote) => vote.tono));
    return {
      model,
      role,
      runs: own.length,
      ok: own.filter((run) => run.outcome === 'ok').length,
      truncated: own.filter((run) => run.outcome === 'truncated').length,
      failedRuns: own.filter(isFailedRun).length,
      failuresByCheck,
      unverifiedFigures: own.reduce((sum, run) => sum + (run.checks?.figures.details.length ?? 0), 0),
      meanInput: mean(own.map((run) => run.input)),
      meanOutput: mean(own.map((run) => run.output)),
      meanReasoning: mean(own.map((run) => run.reasoning)),
      meanCost: mean(own.map((run) => run.cost)),
      meanLatencyMs: mean(own.map((run) => run.latencyMs)) ?? 0,
      votes: ownVotes.length,
      meanUtilita,
      meanTono,
      meanVote: meanUtilita === null || meanTono === null ? null : (meanUtilita + meanTono) / 2,
    };
  });
}

/** The § 7 rule over the aggregates. */
export function pickWinner(scores: EvalModelScore[]): EvalVerdict {
  const references = scores.filter((score) => score.role === 'reference');
  // The best reference (best vote) sets the vote bar; the CLEANEST one (fewest failed runs) the checks bar.
  const bestReference =
    [...references].sort((a, b) => (b.meanVote ?? -Infinity) - (a.meanVote ?? -Infinity))[0] ?? null;
  const checksBar = references.length > 0 ? Math.min(...references.map((score) => score.failedRuns)) : 0;
  const voteBar = bestReference?.meanVote != null ? bestReference.meanVote - VOTE_MARGIN : null;

  const reasons: Record<string, string> = {};
  const eligible: EvalModelScore[] = [];
  for (const score of scores) {
    if (score.role === 'reference') continue;
    if (score.role === 'control') {
      reasons[score.model] = 'controllo dichiarato: misurato, non candidabile';
      continue;
    }
    if (score.failedRuns > checksBar) {
      reasons[score.model] = `perde nei controlli: ${score.failedRuns} esecuzioni fallite contro ${checksBar} del riferimento più pulito`;
      continue;
    }
    if (voteBar !== null && (score.meanVote === null || score.meanVote < voteBar)) {
      reasons[score.model] =
        score.meanVote === null ? 'non votato: senza voto non può vincere' : `voto ${score.meanVote.toFixed(2)} sotto la soglia ${voteBar.toFixed(2)}`;
      continue;
    }
    eligible.push(score);
  }

  eligible.sort((a, b) => (a.meanCost ?? Infinity) - (b.meanCost ?? Infinity));
  const winner = eligible[0] ?? null;
  for (const score of eligible) {
    reasons[score.model] =
      score === winner ? 'vince: il più economico tra chi passa controlli e voto' : 'passa, ma costa di più del vincitore';
  }

  return {
    winner: winner?.model ?? null,
    bestReference: bestReference
      ? { model: bestReference.model, meanVote: bestReference.meanVote, failedRuns: bestReference.failedRuns }
      : null,
    reasons,
  };
}
