/**
 * Tests for the weight optimizer (doc/weight-optimizer-ate.md §5-§6). No Firebase mock needed —
 * `weightOptimizer.ts` and the modules it imports (`accumulationPlanUtils.ts`, `allocationUtils.ts`,
 * `boxProjection.ts`, `geoAreas.ts`) are all Firebase-free.
 */
import { describe, it, expect } from 'vitest';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import type { InstrumentProfile } from '@/types/exposure';
import type { GeoArea } from '@/lib/constants/geoAreas';
import {
  areasFromCountries,
  buildOptimizerCandidates,
  optimizeWeights,
  DEFAULT_IDEAL_ALLOCATION,
  type OptimizerCandidate,
  type OptimizerInput,
} from '@/lib/utils/weightOptimizer';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let assetSeq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  assetSeq += 1;
  return {
    id: `a${assetSeq}`,
    userId: 'u1',
    ticker: `TCK${assetSeq}`,
    name: `Asset ${assetSeq}`,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function candidate(overrides: Partial<OptimizerCandidate> & { key: string }): OptimizerCandidate {
  return {
    key: overrides.key,
    assetIds: overrides.assetIds ?? [overrides.key],
    buyAssetId: overrides.buyAssetId ?? overrides.key,
    label: overrides.label ?? overrides.key,
    currentValueEur: overrides.currentValueEur ?? 0,
    exposurePerEuro: overrides.exposurePerEuro ?? {},
    factorPerEuro: overrides.factorPerEuro ?? {},
    areaPerEuro: overrides.areaPerEuro ?? null,
    areaEstimatedPerEuro: overrides.areaEstimatedPerEuro ?? 0,
    fixedValueEur: overrides.fixedValueEur ?? 0,
    lowerPct: overrides.lowerPct ?? 0,
    upperPct: overrides.upperPct ?? 100,
  };
}

function makeSettings(overrides: Partial<IdealAllocationSettings> = {}): IdealAllocationSettings {
  return { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, ...overrides };
}

function makeInput(
  overrides: Partial<OptimizerInput> & { candidates: OptimizerCandidate[]; targets: AssetAllocationTarget }
): OptimizerInput {
  return {
    baseEur: 1000,
    settings: makeSettings(),
    referenceAreas: null,
    referenceEstimatedShare: 0,
    mode: 'ideal',
    targetLeverageRatio: 1,
    ...overrides,
  };
}

function pctOf(result: ReturnType<typeof optimizeWeights>, key: string): number {
  return result.weights.find((w) => w.key === key)?.proposedPct ?? 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return function rand() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// §5.3 areasFromCountries
// ---------------------------------------------------------------------------

describe('areasFromCountries', () => {
  it('regionale: OTHER goes to the one area every explicit country already belongs to', () => {
    const { areas, estimatedShare } = areasFromCountries(
      [
        { key: 'JP', weight: 0.3 },
        { key: 'GB', weight: 0.33 },
        { key: 'OTHER', weight: 0.37 },
      ],
      undefined,
      null
    );
    expect(areas.developedExUs).toBeCloseTo(1, 6);
    expect(areas.us).toBeCloseTo(0, 6);
    expect(areas.emerging).toBeCloseTo(0, 6);
    expect(estimatedShare).toBeCloseTo(0, 6);
  });

  it('curato: OTHER follows the curated otherAreaSplit, not estimated', () => {
    const { areas, estimatedShare } = areasFromCountries(
      [
        { key: 'US', weight: 0.5 },
        { key: 'JP', weight: 0.2 },
        { key: 'OTHER', weight: 0.3 },
      ],
      { us: 0.5, emerging: 0.5 },
      null
    );
    expect(areas.us).toBeCloseTo(0.65, 6);
    expect(areas.developedExUs).toBeCloseTo(0.2, 6);
    expect(areas.emerging).toBeCloseTo(0.15, 6);
    expect(estimatedShare).toBeCloseTo(0, 6);
  });

  it('stimato: OTHER is split proportionally to the reference index, excluding this profile\'s own countries', () => {
    const referenceCountries = [
      { key: 'US', weight: 0.6 },
      { key: 'JP', weight: 0.06 },
      { key: 'GB', weight: 0.04 },
      { key: 'CN', weight: 0.03 },
      { key: 'DE', weight: 0.06 },
      { key: 'IN', weight: 0.04 },
      { key: 'FR', weight: 0.02 },
      { key: 'OTHER', weight: 0.15 },
    ];
    const { areas, estimatedShare } = areasFromCountries(
      [
        { key: 'US', weight: 0.5 },
        { key: 'JP', weight: 0.1 },
        { key: 'GB', weight: 0.1 },
        { key: 'CN', weight: 0.1 },
        { key: 'OTHER', weight: 0.2 },
      ],
      undefined,
      referenceCountries
    );
    expect(areas.us).toBeCloseTo(0.5, 4);
    expect(areas.developedExUs).toBeCloseTo(0.33333, 4);
    expect(areas.emerging).toBeCloseTo(0.16667, 4);
    expect(estimatedShare).toBeCloseTo(0.2, 4);
  });

  it('stimato, il riferimento stesso (referenceCountries = null): usa i propri paesi espliciti non USA', () => {
    const { areas, estimatedShare } = areasFromCountries(
      [
        { key: 'US', weight: 0.4 },
        { key: 'JP', weight: 0.3 },
        { key: 'CN', weight: 0.1 },
        { key: 'OTHER', weight: 0.2 },
      ],
      undefined,
      null
    );
    expect(areas.us).toBeCloseTo(0.4, 4);
    expect(areas.developedExUs).toBeCloseTo(0.45, 4);
    expect(areas.emerging).toBeCloseTo(0.15, 4);
    expect(estimatedShare).toBeCloseTo(0.2, 4);
  });

  it('ripiego: no usable data anywhere → OTHER falls back to developedExUs, estimated', () => {
    const { areas, estimatedShare } = areasFromCountries(
      [
        { key: 'US', weight: 0.45 },
        { key: 'JP', weight: 0.45 },
        { key: 'OTHER', weight: 0.1 },
      ],
      undefined,
      [
        { key: 'US', weight: 0.7 },
        { key: 'JP', weight: 0.3 },
      ]
    );
    expect(areas.us).toBeCloseTo(0.45, 6);
    expect(areas.developedExUs).toBeCloseTo(0.55, 6);
    expect(areas.emerging).toBeCloseTo(0, 6);
    expect(estimatedShare).toBeCloseTo(0.1, 6);
  });

  it('normalizzazione: a profile summing to 0.99 is normalised to exactly 1', () => {
    const { areas } = areasFromCountries(
      [
        { key: 'US', weight: 0.5 },
        { key: 'JP', weight: 0.49 },
      ],
      undefined,
      null
    );
    const total = areas.us + areas.developedExUs + areas.emerging;
    expect(total).toBeCloseTo(1, 9);
    expect(areas.us).toBeCloseTo(0.5 / 0.99, 6);
  });
});

// ---------------------------------------------------------------------------
// optimizeWeights — invariants on random deterministic input (seed 42, 50 cases)
// ---------------------------------------------------------------------------

describe('optimizeWeights — invariants (50 seeded random cases)', () => {
  it('sum 100, multiples of 0.5, bounds respected within 0.5, no weight in (0,2) when lower=0, deterministic', () => {
    const rand = mulberry32(42);
    const classes: Array<'equity' | 'bonds' | 'commodity'> = ['equity', 'bonds', 'commodity'];

    for (let iteration = 0; iteration < 50; iteration++) {
      const n = 2 + Math.floor(rand() * 4);
      const cappedIndex = rand() < 0.3 ? Math.floor(rand() * n) : -1; // Σupper must stay ≥ 100, so cap at most one candidate
      const candidates: OptimizerCandidate[] = [];
      for (let i = 0; i < n; i++) {
        const cls = classes[Math.floor(rand() * classes.length)];
        const lower = rand() < 0.3 ? Math.floor(rand() * 10) : 0;
        const upper = i === cappedIndex ? Math.max(lower, 50 + Math.floor(rand() * 50)) : 100;
        candidates.push(
          candidate({
            key: `c${i}`,
            currentValueEur: Math.floor(rand() * 1000),
            exposurePerEuro: { [cls]: 1 },
            lowerPct: lower,
            upperPct: upper,
          })
        );
      }

      const raw = classes.map(() => rand());
      const sum = raw.reduce((s, v) => s + v, 0);
      const targets = Object.fromEntries(
        classes.map((cls, i) => [cls, { targetPercentage: (raw[i] / sum) * 100 }])
      ) as AssetAllocationTarget;

      const testInput = makeInput({
        candidates,
        targets,
        baseEur: 10000,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
        mode: iteration % 2 === 0 ? 'ideal' : 'reachable',
        targetLeverageRatio: 1,
      });

      const result = optimizeWeights(testInput);
      expect(result.status).toBe('ok');

      const total = result.weights.reduce((s, w) => s + w.proposedPct, 0);
      expect(total).toBeCloseTo(100, 5);

      result.weights.forEach((w, i) => {
        expect(Math.abs(w.proposedPct * 2 - Math.round(w.proposedPct * 2))).toBeLessThan(1e-6);
        const c = candidates[i];
        expect(w.proposedPct).toBeGreaterThanOrEqual(c.lowerPct - 0.5 - 1e-6);
        expect(w.proposedPct).toBeLessThanOrEqual(c.upperPct + 1e-6);
        if (c.lowerPct === 0) {
          expect(w.proposedPct === 0 || w.proposedPct >= 2 - 1e-6).toBe(true);
        }
      });

      const result2 = optimizeWeights(JSON.parse(JSON.stringify(testInput)));
      expect(result2.weights).toEqual(result.weights);
    }
  });
});

// ---------------------------------------------------------------------------
// Solo classi — candidati puri
// ---------------------------------------------------------------------------

describe('optimizeWeights — pure class candidates', () => {
  it('one candidate per class → proposed weights match the targets exactly', () => {
    const candidates = [
      candidate({ key: 'eq', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'bd', exposurePerEuro: { bonds: 1 } }),
    ];
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60 },
      bonds: { targetPercentage: 40 },
    };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
      })
    );
    expect(result.status).toBe('ok');
    expect(pctOf(result, 'eq')).toBeCloseTo(60, 5);
    expect(pctOf(result, 'bd')).toBeCloseTo(40, 5);
  });
});

// ---------------------------------------------------------------------------
// Fattori
// ---------------------------------------------------------------------------

describe('optimizeWeights — factor objectives', () => {
  it('three equity candidates (Mercato/Momentum/SCV), target 70/15/15 → weights in the same proportion', () => {
    const candidates = [
      candidate({ key: 'mercato', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Mercato: 1 } } }),
      candidate({ key: 'momentum', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Momentum: 1 } } }),
      candidate({ key: 'scv', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { SCV: 1 } } }),
    ];
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 100,
        subCategoryConfig: { enabled: true, categories: ['Mercato', 'Momentum', 'SCV'] },
        subTargets: { Mercato: 70, Momentum: 15, SCV: 15 },
      },
    };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          factorObjectives: [{ assetClass: 'equity', priority: 'essential' }],
        }),
      })
    );
    expect(result.status).toBe('ok');
    expect(pctOf(result, 'mercato')).toBeCloseTo(70, 1);
    expect(pctOf(result, 'momentum')).toBeCloseTo(15, 1);
    expect(pctOf(result, 'scv')).toBeCloseTo(15, 1);
  });
});

// ---------------------------------------------------------------------------
// Scenario leva + geografia
// ---------------------------------------------------------------------------

describe('optimizeWeights — leverage + geography scenario', () => {
  const candidates = [
    candidate({ key: 'ALLW', exposurePerEuro: { equity: 1 }, areaPerEuro: { us: 0.6, developedExUs: 0.3, emerging: 0.1 } }),
    candidate({ key: 'EXUS', exposurePerEuro: { equity: 1 }, areaPerEuro: { us: 0, developedExUs: 0.85, emerging: 0.15 } }),
    candidate({ key: 'EIMI', exposurePerEuro: { equity: 1 }, areaPerEuro: { us: 0, developedExUs: 0, emerging: 1 } }),
    candidate({ key: 'XDEM', exposurePerEuro: { equity: 1 }, areaPerEuro: { us: 0.8, developedExUs: 0.15, emerging: 0.05 } }),
    candidate({ key: 'AVWS', exposurePerEuro: { equity: 1 }, areaPerEuro: { us: 0.5, developedExUs: 0.35, emerging: 0.15 } }),
    candidate({
      key: 'NTSG',
      exposurePerEuro: { equity: 0.9, bonds: 0.6 },
      areaPerEuro: { us: 0.8, developedExUs: 0.08, emerging: 0.02 },
    }),
    candidate({ key: 'CL2', exposurePerEuro: { equity: 2 }, areaPerEuro: { us: 2, developedExUs: 0, emerging: 0 } }),
    candidate({ key: 'SGLN', exposurePerEuro: { commodity: 1 } }),
    candidate({ key: 'CRRY', exposurePerEuro: { carry: 1 } }),
  ];

  const targets: AssetAllocationTarget = {
    equity: { targetPercentage: 90 },
    bonds: { targetPercentage: 20 },
    commodity: { targetPercentage: 8 },
    carry: { targetPercentage: 5 },
  };

  const referenceAreas: Record<GeoArea, number> = { us: 0.62, developedExUs: 0.28, emerging: 0.1 };

  function run(geographyEnabled: boolean) {
    return optimizeWeights(
      makeInput({
        candidates,
        targets,
        baseEur: 100000,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'high',
          geography: geographyEnabled ? { enabled: true, referenceIndexId: 'ftse-all-world', priority: 'medium' } : null,
        }),
        referenceAreas,
        referenceEstimatedShare: 0,
        targetLeverageRatio: 1.23,
      })
    );
  }

  function usShareOfEquity(result: ReturnType<typeof optimizeWeights>): number {
    let usNotional = 0;
    let equityNotional = 0;
    result.weights.forEach((w, i) => {
      const c = candidates[i];
      const x = w.proposedPct / 100;
      usNotional += (c.areaPerEuro?.us ?? 0) * x;
      equityNotional += (c.exposurePerEuro.equity ?? 0) * x;
    });
    return equityNotional > 0 ? usNotional / equityNotional : 0;
  }

  it('(a) geography active brings the US share of equity closer to the reference than without', () => {
    const withGeo = run(true);
    const withoutGeo = run(false);
    const diffWith = Math.abs(usShareOfEquity(withGeo) - referenceAreas.us);
    const diffWithout = Math.abs(usShareOfEquity(withoutGeo) - referenceAreas.us);
    expect(diffWith).toBeLessThan(diffWithout);
  });

  it('(b) CL2\'s weight with geography is never larger than without', () => {
    const withGeo = run(true);
    const withoutGeo = run(false);
    expect(pctOf(withGeo, 'CL2')).toBeLessThanOrEqual(pctOf(withoutGeo, 'CL2') + 0.5);
  });

  it('(c) EXUS + EIMI\'s combined weight with geography is at least as large as without', () => {
    const withGeo = run(true);
    const withoutGeo = run(false);
    const withSum = pctOf(withGeo, 'EXUS') + pctOf(withGeo, 'EIMI');
    const withoutSum = pctOf(withoutGeo, 'EXUS') + pctOf(withoutGeo, 'EIMI');
    expect(withSum).toBeGreaterThanOrEqual(withoutSum - 0.5);
  });

  it('(d) achieved leverage is within 0.05x of target when leverage is High and geography Medium', () => {
    const withGeo = run(true);
    const leverageObjective = withGeo.objectives.find((o) => o.id === 'leverage');
    expect(leverageObjective).toBeDefined();
    expect(Math.abs(leverageObjective!.achievedValue - 1.23)).toBeLessThanOrEqual(0.05);
  });
});

// ---------------------------------------------------------------------------
// Modalità reachable
// ---------------------------------------------------------------------------

describe('optimizeWeights — reachable mode', () => {
  it('no weight sits more than 0.5pp below its current value / B floor', () => {
    const assetA = makeAsset({ id: 'a', assetClass: 'equity', quantity: 3, currentPrice: 1000 }); // 3000
    const assetB = makeAsset({ id: 'b', assetClass: 'equity', quantity: 2, currentPrice: 1000 }); // 2000
    const assetsById = new Map([
      [assetA.id, assetA],
      [assetB.id, assetB],
    ]);

    const { candidates } = buildOptimizerCandidates({
      positions: [
        { key: 'a', label: 'A', memberAssetIds: ['a'], buyAssetId: 'a' },
        { key: 'b', label: 'B', memberAssetIds: ['b'], buyAssetId: 'b' },
      ],
      assetsById,
      profilesByTicker: new Map<string, InstrumentProfile>(),
      referenceCountries: null,
      settings: makeSettings(),
      mode: 'reachable',
      baseEur: 6000,
      valueOf: (a) => a.quantity * a.currentPrice,
    });

    expect(candidates.find((c) => c.key === 'a')?.lowerPct).toBeCloseTo(50, 6);
    expect(candidates.find((c) => c.key === 'b')?.lowerPct).toBeCloseTo((2000 / 6000) * 100, 6);

    const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        baseEur: 6000,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
        mode: 'reachable',
      })
    );

    expect(result.status).toBe('ok');
    result.weights.forEach((w, i) => {
      expect(w.proposedPct).toBeGreaterThanOrEqual(candidates[i].lowerPct - 0.5 - 1e-6);
    });
  });
});

// ---------------------------------------------------------------------------
// Gruppo proxy
// ---------------------------------------------------------------------------

describe('buildOptimizerCandidates — proxy group', () => {
  it('a single candidate keeps the fixed member\'s value as fixedValueEur, respected as the ideal-mode floor', () => {
    const buyAsset = makeAsset({ id: 'buy', assetClass: 'equity', quantity: 0, currentPrice: 100 });
    const fixedAsset = makeAsset({ id: 'fixed', assetClass: 'equity', quantity: 5, currentPrice: 1000 }); // 5000
    const assetsById = new Map([
      [buyAsset.id, buyAsset],
      [fixedAsset.id, fixedAsset],
    ]);

    const { candidates } = buildOptimizerCandidates({
      positions: [{ key: 'p1', label: 'P1', memberAssetIds: ['buy', 'fixed'], buyAssetId: 'buy' }],
      assetsById,
      profilesByTicker: new Map<string, InstrumentProfile>(),
      referenceCountries: null,
      settings: makeSettings(),
      mode: 'ideal',
      baseEur: 10000,
      valueOf: (a) => a.quantity * a.currentPrice,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].fixedValueEur).toBeCloseTo(5000, 6);
    expect(candidates[0].lowerPct).toBeCloseTo(50, 6);

    const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        baseEur: 10000,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
        mode: 'ideal',
      })
    );
    expect(result.status).toBe('ok');
    expect(pctOf(result, 'p1')).toBeGreaterThanOrEqual(candidates[0].lowerPct - 0.5 - 1e-6);
  });
});

// ---------------------------------------------------------------------------
// Tetto di gruppo
// ---------------------------------------------------------------------------

describe('optimizeWeights — group cap (hinge)', () => {
  const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };

  it('is inactive (gapPp ≈ 0) when the natural solution already sits under the cap', () => {
    const candidates = [
      candidate({ key: 'x1', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'x2', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'y', exposurePerEuro: { equity: 1 } }),
    ];
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          groupLimits: [{ id: 'g1', label: 'Rischio', assetIds: ['x1', 'x2'], maxPct: 90, priority: 'high' }],
        }),
      })
    );
    const group = result.objectives.find((o) => o.id === 'group:g1');
    expect(group).toBeDefined();
    expect(Math.abs(group!.gapPp)).toBeLessThan(0.25);
  });

  it('achievedValue is the group\'s REAL weight when the cap is not binding, not the cap itself (rilievo B1)', () => {
    // Same fixture as the test above: x1+x2 naturally settle well under the 90% cap (proven red
    // against the pre-fix code, which read `targetValue + gapPp` — 0 for an inactive hinge — so
    // achievedValue always printed 90.0 regardless of the group's actual weight).
    const candidates = [
      candidate({ key: 'x1', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'x2', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'y', exposurePerEuro: { equity: 1 } }),
    ];
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          groupLimits: [{ id: 'g1', label: 'Rischio', assetIds: ['x1', 'x2'], maxPct: 90, priority: 'high' }],
        }),
      })
    );
    const group = result.objectives.find((o) => o.id === 'group:g1');
    const actualGroupWeight = pctOf(result, 'x1') + pctOf(result, 'x2');
    expect(actualGroupWeight).toBeLessThan(80); // well under the 90% cap
    expect(group!.achievedValue).toBeCloseTo(actualGroupWeight, 1);
    expect(group!.achievedValue).not.toBeCloseTo(90, 1);
  });

  it('activates (gapPp > 0) when the class target forces the group above the cap with no alternative', () => {
    const candidates = [
      candidate({ key: 'x1', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'x2', exposurePerEuro: { equity: 1 } }),
    ];
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          groupLimits: [{ id: 'g1', label: 'Rischio', assetIds: ['x1', 'x2'], maxPct: 10, priority: 'high' }],
        }),
      })
    );
    const group = result.objectives.find((o) => o.id === 'group:g1');
    expect(group).toBeDefined();
    expect(group!.gapPp).toBeGreaterThan(0.25);
    // When the cap IS binding, achievedValue already matched the real (over-cap) weight before
    // the B1 fix too — pinned here for symmetry with the inactive case above.
    const actualGroupWeight = pctOf(result, 'x1') + pctOf(result, 'x2');
    expect(group!.achievedValue).toBeCloseTo(actualGroupWeight, 1);
  });
});

// ---------------------------------------------------------------------------
// Esiti speciali
// ---------------------------------------------------------------------------

describe('optimizeWeights — special outcomes', () => {
  it('no_candidates when there are no candidates', () => {
    const result = optimizeWeights(makeInput({ candidates: [], targets: { equity: { targetPercentage: 100 } } }));
    expect(result.status).toBe('no_candidates');
    expect(result.weights).toEqual([]);
  });

  it('infeasible_bounds when Σ lowerPct exceeds 100', () => {
    const candidates = [
      candidate({ key: 'a', exposurePerEuro: { equity: 1 }, lowerPct: 60 }),
      candidate({ key: 'b', exposurePerEuro: { equity: 1 }, lowerPct: 60 }),
    ];
    const result = optimizeWeights(makeInput({ candidates, targets: { equity: { targetPercentage: 100 } } }));
    expect(result.status).toBe('infeasible_bounds');
    expect(result.weights).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Conflitti
// ---------------------------------------------------------------------------

describe('optimizeWeights — conflicts', () => {
  it('a conflict involves both leverage and geo:us when their targets pull in opposite directions', () => {
    const candidates = [
      candidate({ key: 'CL2', exposurePerEuro: { equity: 2 }, areaPerEuro: { us: 2, developedExUs: 0, emerging: 0 } }),
      candidate({ key: 'EXUS', exposurePerEuro: { equity: 1 }, areaPerEuro: { us: 0, developedExUs: 1, emerging: 0 } }),
    ];
    const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };
    const referenceAreas: Record<GeoArea, number> = { us: 0, developedExUs: 1, emerging: 0 };

    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'medium',
          leveragePriority: 'high',
          geography: { enabled: true, referenceIndexId: 'x', priority: 'medium' },
        }),
        referenceAreas,
        referenceEstimatedShare: 0,
        targetLeverageRatio: 1.4,
      })
    );

    const involvesBoth = result.conflicts.some(
      (c) => c.removedObjectiveId === 'leverage' && c.improvements.some((i) => i.objectiveId === 'geo:us')
    );
    expect(involvesBoth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// not_converged forzabile
// ---------------------------------------------------------------------------

describe('optimizeWeights — not_converged', () => {
  it('reports not converged when maxIterations is forced to 1', () => {
    const candidates = [
      candidate({ key: 'eq', exposurePerEuro: { equity: 1 }, currentValueEur: 900 }),
      candidate({ key: 'bd', exposurePerEuro: { bonds: 1 }, currentValueEur: 100 }),
    ];
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60 },
      bonds: { targetPercentage: 40 },
    };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
      }),
      { maxIterations: 1 }
    );
    expect(result.converged).toBe(false);
    expect(result.warnings).toContainEqual({ code: 'not_converged' });
  });
});
