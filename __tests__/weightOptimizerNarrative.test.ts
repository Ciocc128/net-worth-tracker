import { describe, it, expect } from 'vitest';
import type { ConflictReport, ObjectiveReport, OptimizerWarning } from '@/lib/utils/weightOptimizer';
import {
  describeConflict,
  describeObjectiveLabel,
  describeObjectiveRow,
  describeOptimizerMode,
  describeOptimizerSnapshot,
  describeOptimizerWarning,
  formatObjectiveAchieved,
  formatObjectiveGap,
  formatObjectiveTarget,
  OPTIMIZER_MODE_LABELS,
} from '@/lib/utils/weightOptimizerNarrative';

function objective(overrides: Partial<ObjectiveReport> = {}): ObjectiveReport {
  return {
    id: 'class:equity',
    kind: 'class',
    label: 'Classe Azioni',
    priority: 'essential',
    targetValue: 102.0,
    achievedValue: 101.6,
    gapPp: -0.4,
    ...overrides,
  };
}

describe('describeObjectiveLabel', () => {
  it('class', () => {
    expect(describeObjectiveLabel('class', 'equity')).toBe('Classe Azioni');
  });

  it('leverage', () => {
    expect(describeObjectiveLabel('leverage')).toBe('Leva');
  });

  it('factor: the class-scope idiom, not a parenthetical', () => {
    expect(describeObjectiveLabel('factor', 'equity', 'Momentum')).toBe("Momentum nell'azionario");
    expect(describeObjectiveLabel('factor', 'bonds', 'Governativi')).toBe("Governativi nell'obbligazionario");
  });

  it('geo', () => {
    expect(describeObjectiveLabel('geo', undefined, undefined, 'us')).toBe("Stati Uniti nell'azionario");
  });

  it('group', () => {
    expect(describeObjectiveLabel('group', undefined, undefined, undefined, 'Leva')).toBe('Gruppo Leva');
  });
});

describe('gap / target / achieved formatting', () => {
  it('a pp objective: one decimal, typographic minus', () => {
    const o = objective({ targetValue: 102.0, achievedValue: 101.6, gapPp: -0.4 });
    expect(formatObjectiveTarget(o)).toBe('102,0%');
    expect(formatObjectiveAchieved(o)).toBe('101,6%');
    expect(formatObjectiveGap(o)).toBe('−0,4 pp');
  });

  it('a positive gap carries a plus sign', () => {
    const o = objective({ targetValue: 60, achievedValue: 60.4, gapPp: 0.4 });
    expect(formatObjectiveGap(o)).toBe('+0,4 pp');
  });

  it('a leverage objective: two decimals and ×, gap in ×  not pp', () => {
    const o = objective({ kind: 'leverage', id: 'leverage', label: 'Leva', targetValue: 1.23, achievedValue: 1.19, gapPp: -4 });
    expect(formatObjectiveTarget(o)).toBe('1,23×');
    expect(formatObjectiveAchieved(o)).toBe('1,19×');
    expect(formatObjectiveGap(o)).toBe('−0,04×');
  });

  it('describeObjectiveRow composes target → achieved (gap)', () => {
    const o = objective({ label: 'Azioni', targetValue: 102.0, achievedValue: 101.6, gapPp: -0.4 });
    expect(describeObjectiveRow(o)).toBe('Azioni 102,0% → 101,6% (−0,4 pp)');
  });
});

describe('describeConflict', () => {
  it('rebuilds the achieved figures from each objective\'s own targetValue', () => {
    const objectives: ObjectiveReport[] = [
      objective({ id: 'leverage', kind: 'leverage', label: 'Leva', targetValue: 1.23, achievedValue: 1.23, gapPp: 0 }),
      objective({ id: 'geo:us', kind: 'geo', label: "Stati Uniti nell'azionario", targetValue: 66.1, achievedValue: 66.1, gapPp: 0 }),
    ];
    const conflict: ConflictReport = {
      removedObjectiveId: 'leverage',
      improvements: [{ objectiveId: 'geo:us', fromGapPp: 0, toGapPp: -4.1 }],
    };
    expect(describeConflict(conflict, objectives)).toBe(
      "Senza l'obiettivo «Leva»: Stati Uniti nell'azionario da 66,1% a 62,0%."
    );
  });

  it('drops an improvement whose objective is missing from the list', () => {
    const objectives: ObjectiveReport[] = [objective({ id: 'leverage', kind: 'leverage', label: 'Leva' })];
    const conflict: ConflictReport = {
      removedObjectiveId: 'leverage',
      improvements: [{ objectiveId: 'unknown', fromGapPp: 0, toGapPp: -1 }],
    };
    expect(describeConflict(conflict, objectives)).toBe("Senza l'obiettivo «Leva»: .");
  });
});

describe('describeOptimizerWarning', () => {
  const labelOf = (key: string) => (key === 'p1' ? 'VWCE' : key);

  it('covers every OptimizerWarning code with a non-empty text', () => {
    const warnings: OptimizerWarning[] = [
      { code: 'geo_uncovered', key: 'p1' },
      { code: 'geo_estimated', key: 'p1', estimatedPct: 16.9 },
      { code: 'reference_estimated', estimatedPct: 5 },
      { code: 'factor_unmapped', assetClass: 'equity', subCategory: 'Momentum' },
      { code: 'proxy_mismatch', key: 'p1' },
      { code: 'bound_conflict', key: 'p1' },
      { code: 'not_converged' },
      { code: 'stale_profile', key: 'p1', asOf: '2026-01-01' },
    ];
    for (const warning of warnings) {
      const text = describeOptimizerWarning(warning, labelOf);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('resolves the candidate key through labelOf', () => {
    expect(describeOptimizerWarning({ code: 'geo_uncovered', key: 'p1' }, labelOf)).toContain('VWCE');
  });

  it('factor_unmapped names the class and the sub-category without labelOf', () => {
    expect(describeOptimizerWarning({ code: 'factor_unmapped', assetClass: 'equity', subCategory: 'Momentum' }, labelOf)).toBe(
      '«Momentum» (Azioni) non ha un peso tra i sotto-obiettivi: pesa zero nel calcolo.'
    );
  });
});

describe('describeOptimizerMode', () => {
  it('names both modes distinctly', () => {
    expect(OPTIMIZER_MODE_LABELS.reachable).toBe('Raggiungibile col PAC');
    expect(OPTIMIZER_MODE_LABELS.ideal).toBe('Ideale');
    expect(describeOptimizerMode('reachable')).not.toBe(describeOptimizerMode('ideal'));
    expect(describeOptimizerMode('reachable').length).toBeGreaterThan(0);
  });
});

describe('describeOptimizerSnapshot', () => {
  const snapshot = {
    computedAt: new Date(2026, 8, 18), // 18/09
    mode: 'reachable' as const,
    weights: [{ key: 'p1', proposedPct: 60 }],
  };

  it('names the date and the mode when the weights are untouched', () => {
    const positions = [{ id: 'p1', targetPercentage: 60 }];
    expect(describeOptimizerSnapshot(snapshot, positions)).toBe(
      "Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile col PAC)."
    );
  });

  it('adds the hand-edited clause once a weight differs', () => {
    const positions = [{ id: 'p1', targetPercentage: 65 }];
    expect(describeOptimizerSnapshot(snapshot, positions)).toBe(
      "Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile col PAC), poi modificati a mano."
    );
  });

  it('ignores a position the snapshot never proposed a weight for', () => {
    const positions = [{ id: 'other', targetPercentage: 40 }];
    expect(describeOptimizerSnapshot(snapshot, positions)).toBe(
      "Pesi proposti dall'ottimizzatore il 18/09 (Raggiungibile col PAC)."
    );
  });
});
