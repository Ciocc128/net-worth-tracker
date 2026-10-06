import { describe, expect, it } from 'vitest';
import type { EvalChecks } from '@/lib/utils/aiEvalChecks';
import { isFailedRun, pickWinner, scoreModels, type EvalRun } from '@/lib/utils/aiEvalScore';

const PASS: EvalChecks = {
  figures: { pass: true, details: [] },
  words: { pass: true, details: [] },
  form: { pass: true, details: [] },
  promises: { pass: true, details: [] },
  italian: { pass: true, details: [] },
};
const FIGURE_FAIL: EvalChecks = { ...PASS, figures: { pass: false, details: ['3,7 p.p.'] } };

function run(model: string, bundleId: string, cost: number, overrides: Partial<EvalRun> = {}): EvalRun {
  return { model, bundleId, outcome: 'ok', input: 5000, output: 900, reasoning: 300, cost, latencyMs: 1000, checks: PASS, ...overrides };
}

const MODELS = [
  { model: 'cheap', role: 'candidate' as const },
  { model: 'mid', role: 'candidate' as const },
  { model: 'ctrl', role: 'control' as const },
  { model: 'sonnet', role: 'reference' as const },
  { model: 'haiku', role: 'reference' as const },
];

function votes(byModel: Record<string, number>) {
  return {
    b1: Object.fromEntries(Object.entries(byModel).map(([model, vote]) => [model, { utilita: vote, tono: vote }])),
  };
}

describe('isFailedRun', () => {
  it('fails a truncation, and a failed check', () => {
    expect(isFailedRun(run('m', 'b', 0, { outcome: 'truncated', checks: undefined }))).toBe(true);
    expect(isFailedRun(run('m', 'b', 0, { checks: FIGURE_FAIL }))).toBe(true);
    expect(isFailedRun(run('m', 'b', 0))).toBe(false);
  });
  it('fails a Wiki check (F6), and ignores the Wiki checks a bundle without the vault never ran', () => {
    expect(isFailedRun(run('m', 'b', 0, { checks: { ...PASS, macro: { pass: false, details: ['+3,7%'] } } }))).toBe(true);
    expect(isFailedRun(run('m', 'b', 0, { checks: { ...PASS, principles: { pass: true, details: [] } } }))).toBe(false);
  });
});

describe('scoreModels (F6)', () => {
  it('counts the Wiki checks and averages the third vote apart from the rule’s mean', () => {
    const [score] = scoreModels(
      [{ model: 'm', role: 'candidate' }],
      [run('m', 'b1', 0.002, { checks: { ...PASS, crossover: { pass: false, details: ['x'] } } }), run('m', 'b2', 0.002)],
      { b1: { m: { utilita: 4, tono: 4, collegamento: 2 } }, b2: { m: { utilita: 4, tono: 4 } } }
    );
    expect(score.failuresByCheck.crossover).toBe(1);
    expect(score.failuresByCheck.macro).toBe(0);
    expect(score.meanCollegamento).toBe(2);
    expect(score.meanVote).toBe(4);
  });
});

describe('scoreModels', () => {
  it('averages the cost over every run, failed ones included', () => {
    const [score] = scoreModels(
      [{ model: 'm', role: 'candidate' }],
      [run('m', 'b1', 0.002), run('m', 'b2', 0.004, { outcome: 'truncated', checks: undefined })],
      {}
    );
    expect(score.meanCost).toBeCloseTo(0.003);
    expect(score.failedRuns).toBe(1);
    expect(score.truncated).toBe(1);
    expect(score.unverifiedFigures).toBe(0);
  });
});

describe('pickWinner', () => {
  const runs = [
    run('cheap', 'b1', 0.001),
    run('mid', 'b1', 0.004),
    run('ctrl', 'b1', 0.0005),
    run('sonnet', 'b1', 0.04),
    run('haiku', 'b1', 0.02),
  ];

  it('picks the cheapest candidate within half a point of the best reference', () => {
    const scores = scoreModels(MODELS, runs, votes({ cheap: 4, mid: 4.5, ctrl: 5, sonnet: 4.5, haiku: 3 }));
    const verdict = pickWinner(scores);
    expect(verdict.winner).toBe('cheap');
    expect(verdict.bestReference?.model).toBe('sonnet');
    expect(verdict.reasons.ctrl).toMatch(/controllo/);
  });

  it('skips a candidate more than half a point below the best reference', () => {
    const scores = scoreModels(MODELS, runs, votes({ cheap: 3.5, mid: 4.5, ctrl: 5, sonnet: 4.5, haiku: 3 }));
    expect(pickWinner(scores).winner).toBe('mid');
  });

  it('skips a candidate that fails more runs than the best reference', () => {
    const failing = runs.map((r) => (r.model === 'cheap' ? { ...r, checks: FIGURE_FAIL } : r));
    const scores = scoreModels(MODELS, failing, votes({ cheap: 5, mid: 4.5, ctrl: 5, sonnet: 4.5, haiku: 3 }));
    const verdict = pickWinner(scores);
    expect(verdict.winner).toBe('mid');
    expect(verdict.reasons.cheap).toMatch(/perde nei controlli/);
  });

  it('measures failed runs against the CLEANEST reference, not the best voted one', () => {
    // Sonnet has the best vote but fails its run; Haiku fails none, so the bar is zero.
    const failing = runs.map((r) => (r.model === 'cheap' || r.model === 'sonnet' ? { ...r, checks: FIGURE_FAIL } : r));
    const scores = scoreModels(MODELS, failing, votes({ cheap: 5, mid: 4.5, ctrl: 5, sonnet: 4.5, haiku: 3 }));
    const verdict = pickWinner(scores);
    expect(verdict.bestReference?.model).toBe('sonnet');
    expect(verdict.winner).toBe('mid');
    expect(verdict.reasons.cheap).toMatch(/1 esecuzioni fallite contro 0 del riferimento più pulito/);
  });

  it('never picks a control, however cheap and well voted', () => {
    const scores = scoreModels(MODELS, runs, votes({ cheap: 1, mid: 1, ctrl: 5, sonnet: 4.5, haiku: 3 }));
    expect(pickWinner(scores).winner).toBeNull();
  });
});
