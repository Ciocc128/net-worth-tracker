/**
 * Tests for lib/utils/allocazioneSummary.ts — the numbers of Allocazione: what each tile
 * reads from the banded AllocationResult, the plans and the exposure payload. The domain rules
 * (band, roles, plans) stay in allocationUtils; this layer only derives what the page shows.
 */

import { describe, expect, it, vi } from 'vitest';

// `leverageAwareAllocationUtils` reaches the client SDK through the asset display helpers; mocked away as in every `*Narrative.test.ts`.
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import {
  buildCompositionLegend,
  buildCompositionPair,
  buildPensionLookThrough,
  buildPlanView,
  largestGapByValue,
  offTargetGaps,
  summarizeClassGaps,
  summarizeExposure,
  summarizeExposureCoverage,
  summarizeExposureHighlights,
  summarizeHoldings,
  summarizeNextMoney,
  untargetedClassLabels,
  MIN_VISIBLE_AMOUNT,
} from '@/lib/utils/allocazioneSummary';
import type { AllocationData, Asset } from '@/types/assets';
import type { PortfolioExposureData } from '@/types/exposure';
import type { AllocatableHolding } from '@/lib/utils/allocationUtils';

function data({ currentValue, targetPercentage, ...rest }: Partial<AllocationData> & { currentValue: number; targetPercentage: number }): AllocationData {
  const total = 245000;
  const currentPercentage = (currentValue / total) * 100;
  const difference = currentPercentage - targetPercentage;
  return {
    currentPercentage,
    currentValue,
    targetPercentage,
    targetValue: (targetPercentage / 100) * total,
    difference,
    differenceValue: currentValue - (targetPercentage / 100) * total,
    action: Math.abs(difference) > 2 ? (difference > 0 ? 'VENDI' : 'COMPRA') : 'OK',
    ...rest,
  };
}

const BY_CLASS: Record<string, AllocationData> = {
  crypto: data({ currentValue: 11750, targetPercentage: 5 }),
  equity: data({ currentValue: 143000, targetPercentage: 55 }),
  bonds: data({ currentValue: 53500, targetPercentage: 25 }),
  cash: data({ currentValue: 23800, targetPercentage: 10 }),
  commodity: data({ currentValue: 12950, targetPercentage: 5 }),
};

const holding = (overrides: Partial<AllocatableHolding>): AllocatableHolding => ({
  id: 'h',
  label: 'Holding',
  assetClass: 'equity',
  value: 1000,
  tradable: true,
  ...overrides,
});

describe('summarizeClassGaps', () => {
  it('orders classes by the app-wide sequence and carries the rounded figures', () => {
    const gaps = summarizeClassGaps(BY_CLASS);
    expect(gaps.map((g) => g.assetClass)).toEqual(['equity', 'bonds', 'crypto', 'cash', 'commodity']);
    expect(gaps[0]).toMatchObject({ label: 'Azioni', action: 'VENDI', differenceValue: 8250 });
    expect(gaps[0].differencePp).toBeCloseTo(3.4, 1);
  });

  it('finds the largest gap by euro and the off-target ones by points', () => {
    const gaps = summarizeClassGaps(BY_CLASS);
    expect(largestGapByValue(gaps)?.assetClass).toBe('equity');
    expect(offTargetGaps(gaps).map((g) => g.assetClass)).toEqual(['equity', 'bonds']);
    expect(largestGapByValue([])).toBeNull();
  });
});

describe('buildCompositionPair', () => {
  it('draws the current mix on the notional total and the target on the effective percentages of the comparison', () => {
    const pair = buildCompositionPair(BY_CLASS, 245000, false);
    expect(pair.current[0]).toMatchObject({ key: 'equity', label: 'Azioni', chartIndex: 0 });
    expect(pair.current[0].pct).toBeCloseTo(58.4, 1);
    expect(pair.current.reduce((s, seg) => s + seg.pct, 0)).toBeCloseTo(100, 5);
    expect(pair.target.map((s) => [s.key, s.pct])).toEqual([
      ['equity', 55],
      ['bonds', 25],
      ['cash', 10],
      ['crypto', 5],
      ['commodity', 5],
    ]);
  });

  it('keeps the leveraged percentage as the label under leverage and skips empty targets', () => {
    const leveraged = { equity: { ...BY_CLASS.equity, currentPercentage: 87.5, targetPercentage: 150 }, bonds: data({ currentValue: 0, targetPercentage: 0 }) };
    const pair = buildCompositionPair(leveraged, 143000, true);
    expect(pair.current[0].pct).toBeCloseTo(100, 5);
    expect(pair.current[0].displayPct).toBe(87.5);
    expect(pair.target).toEqual([{ key: 'equity', label: 'Azioni', pct: 100, displayPct: 150, chartIndex: 0 }]);
  });
});

describe('buildCompositionLegend', () => {
  it('keeps the current order, appends target-only classes and leaves a gap where a side is missing', () => {
    // A targeted class that is not held reaches the pair as a comparison row at 0 (compareAllocations iterates the targets).
    const pair = buildCompositionPair({ equity: BY_CLASS.equity, crypto: { ...BY_CLASS.crypto, targetPercentage: 0 }, bonds: data({ currentValue: 0, targetPercentage: 45 }) }, 154750, false);
    const legend = buildCompositionLegend(pair);
    expect(legend.map((e) => [e.key, e.current === null ? null : Math.round(e.current), e.target])).toEqual([
      ['equity', 92, 55],
      ['crypto', 8, null],
      ['bonds', null, 45],
    ]);
    expect(legend[2].chartIndex).toBe(1);
  });
});

describe('buildPlanView / summarizeNextMoney', () => {
  const holdings = [
    holding({ id: 'e1', label: 'iShares World', ticker: 'IWDA', assetClass: 'equity', value: 143000 }),
    holding({ id: 'b1', label: 'Fondo Cometa', assetClass: 'bonds', value: 42000, tradable: false }),
    holding({ id: 'b2', label: 'Euro Govt', ticker: 'IBGL', assetClass: 'bonds', value: 11500 }),
    holding({ id: 'c1', label: 'Conto deposito', assetClass: 'cash', value: 23800 }),
    holding({ id: 'k1', label: 'Gold', ticker: 'SGLD', assetClass: 'commodity', value: 12950 }),
    holding({ id: 'x1', label: 'Bitcoin', assetClass: 'crypto', value: 11750 }),
  ];
  const inputs = { byAssetClass: BY_CLASS, bySubCategory: {}, bySpecificAsset: {}, holdings, tradableByClass: { equity: 143000, bonds: 11500, cash: 23800, commodity: 12950, crypto: 11750 } };

  it('builds the rebalance view from the banded moves', () => {
    const view = buildPlanView('rebalance', 0, inputs);
    expect(view.mode).toBe('rebalance');
    if (view.mode !== 'rebalance') throw new Error('mode');
    expect(view.moves.map((m) => [m.assetClass, m.action])).toEqual([
      ['equity', 'VENDI'],
      ['bonds', 'COMPRA'],
    ]);
    expect(view.trades).toBeNull();
  });

  it('builds the contribution view and names the classes over target that get nothing', () => {
    const view = buildPlanView('contribute', 1000, inputs);
    if (view.mode !== 'contribute') throw new Error('mode');
    expect(view.nodes.map((n) => n.key)).toEqual(['bonds', 'cash', 'crypto']);
    expect(view.nodes.reduce((sum, n) => sum + n.amount, 0)).toBeCloseTo(1000, 5);
    expect(view.overTarget).toEqual(['Azioni']);
    expect(view.nodes.every((n) => n.amount >= MIN_VISIBLE_AMOUNT)).toBe(true);
  });

  it('builds the withdrawal view with the tradable total and the overflow flag', () => {
    const view = buildPlanView('withdraw', 1000, inputs);
    if (view.mode !== 'withdraw') throw new Error('mode');
    expect(view.tradableTotal).toBe(203000);
    expect(view.exceedsPortfolio).toBe(false);
    expect(view.nodes[0].key).toBe('equity');
    expect(buildPlanView('withdraw', 300000, inputs)).toMatchObject({ exceedsPortfolio: true });
  });

  it('summarizes the next money as class slices, largest first', () => {
    const next = summarizeNextMoney(inputs, 1000);
    expect(next.amount).toBe(1000);
    expect(next.slices.map((s) => s.key)).toEqual(['bonds', 'cash', 'crypto']);
    expect(next.slices[0]).toMatchObject({ label: 'Obbligazioni', kind: 'class' });
    expect(summarizeNextMoney(inputs, 0).slices).toEqual([]);
  });
});

describe('untargetedClassLabels', () => {
  it('names the held classes the targets do not mention, in the app order', () => {
    const held = [holding({ assetClass: 'realestate', value: 250000 }), holding({ assetClass: 'cash', value: 8000 }), holding({ assetClass: 'equity', value: 100 }), holding({ assetClass: 'carry', value: 0 })];
    expect(untargetedClassLabels(held, BY_CLASS)).toEqual(['Immobili']);
    expect(untargetedClassLabels(held, { equity: BY_CLASS.equity })).toEqual(['Immobili', 'Liquidità']);
  });
});

describe('summarizeHoldings', () => {
  it('counts, sums and sorts the holdings largest first', () => {
    const group = summarizeHoldings([holding({ id: 'a', value: 100 }), holding({ id: 'b', value: 900 })]);
    expect(group).toMatchObject({ count: 2, total: 1000 });
    expect(group.holdings.map((h) => h.id)).toEqual(['b', 'a']);
    expect(summarizeHoldings([])).toEqual({ count: 0, total: 0, holdings: [], rows: [] });
    expect(group.rows.map((r) => Math.round(r.sharePct ?? -1))).toEqual([90, 10]);
  });

  it('counts a composite asset once, however many legs it has', () => {
    const legs = [holding({ id: 'fund:0', value: 29400 }), holding({ id: 'fund:1', value: 12600 }), holding({ id: 'house', value: 180000 })];
    expect(summarizeHoldings(legs)).toMatchObject({ count: 2, total: 222000 });
  });
});

function emptyExposureView(): PortfolioExposureData['geography'] {
  return { entries: [], coverage: { baseEur: 0, read: { amountEur: 0, instruments: [] }, notApplicable: { amountEur: 0, instruments: [] }, unread: { amountEur: 0, instruments: [] } } };
}

function fullyReadView(
  entries: Array<{ key: string; label: string; exposureEur: number; sources?: PortfolioExposureData['holdings']['entries'][number]['sources'] }>,
  baseEur: number
): PortfolioExposureData['holdings'] {
  return {
    entries: entries.map((e) => ({ ...e, exposurePct: baseEur > 0 ? e.exposureEur / baseEur : 0, sources: e.sources ?? [] })),
    coverage: { baseEur, read: { amountEur: baseEur, instruments: [] }, notApplicable: { amountEur: 0, instruments: [] }, unread: { amountEur: 0, instruments: [] } },
  };
}

describe('summarizeExposure', () => {
  const exposure: PortfolioExposureData = {
    holdings: fullyReadView(
      [
        {
          key: 'AAPL',
          label: 'Apple',
          exposureEur: 10045,
          sources: [
            { assetName: 'A', ticker: 'IWDA', contributionEur: 5000, weight: 0.05, baseValueEur: 100000 },
            { assetName: 'B', ticker: 'CSPX', contributionEur: 5045, weight: 0.07, baseValueEur: 72071 },
          ],
        },
        { key: 'MSFT', label: 'Microsoft', exposureEur: 9310 },
        { key: 'NVDA', label: 'Nvidia', exposureEur: 8575 },
      ],
      245000
    ),
    sectors: fullyReadView(
      [
        { key: 'technology', label: 'Tecnologia', exposureEur: 59535 },
        { key: 'financial', label: 'Finanza', exposureEur: 30000 },
      ],
      245000
    ),
    issuers: fullyReadView(
      [
        { key: 'iShares', label: 'iShares', exposureEur: 100000 },
        { key: 'Vanguard', label: 'Vanguard', exposureEur: 64000 },
      ],
      245000
    ),
    geography: emptyExposureView(),
    currency: emptyExposureView(),
    allocatableMarketValueEur: 245000,
    allocatableAssets: 12,
    totalAssets: 16,
    quotationCurrencies: ['EUR'],
    computedAt: '2026-08-24T06:15:00.000Z',
    cacheKey: 'k',
    oldestProfileAsOf: null,
  };

  it('turns a view into ranked rows in percent of the VIEW\'S OWN base, closed by the read residual', () => {
    const view = summarizeExposure(exposure, 'holdings', 2);
    expect(view.rows.map((r) => [r.key, r.amount, r.percentage])).toEqual([
      ['AAPL', 10045, 4.1],
      ['MSFT', 9310, 3.8],
    ]);
    expect(view.remainder).toEqual({ label: 'Resto del portafoglio', amount: 245000 - 10045 - 9310, percentage: 92.1 });
    expect(summarizeExposure(exposure, 'sectors', 5).rows[0]).toMatchObject({ key: 'technology', label: 'Tecnologia' });
    expect(summarizeExposure(exposure, 'issuers', 5).remainder?.label).toBe('Resto del portafoglio');
  });

  it('has no residual when the rows cover the read base, and keeps drill-down sources', () => {
    const view = summarizeExposure({ ...exposure, holdings: fullyReadView([{ key: 'ALL', label: 'Tutto', exposureEur: 245000 }], 245000) }, 'holdings', 5);
    expect(view.remainder).toBeNull();
    expect(summarizeExposure(exposure, 'holdings', 5).rows[0].sources).toHaveLength(2);
  });

  it('extracts the highlights the reading names, on the allocatable base — no ETF-only re-normalisation needed', () => {
    expect(summarizeExposureHighlights(exposure)).toEqual({
      topHolding: { name: 'Apple', pct: 4.1, sourceCount: 2 },
      topSector: { label: 'Tecnologia', pct: 24.3 },
      topIssuer: { family: 'iShares', pct: 40.8 },
      topGeography: null,
      topCurrency: null,
      currencyQuotationContrast: false,
    });
    expect(
      summarizeExposureHighlights({ ...exposure, holdings: emptyExposureView(), sectors: emptyExposureView(), issuers: emptyExposureView() })
    ).toEqual({ topHolding: null, topSector: null, topIssuer: null, topGeography: null, topCurrency: null, currencyQuotationContrast: false });
  });

  it('summarizeExposureCoverage reports the base, the read share, and the two declared-gap buckets', () => {
    const withGaps: PortfolioExposureData = {
      ...exposure,
      holdings: {
        entries: exposure.holdings.entries,
        coverage: {
          baseEur: 74400,
          read: { amountEur: 65064, instruments: ['NTSG'] },
          notApplicable: { amountEur: 0, instruments: [] },
          unread: { amountEur: 9336, instruments: ['CL2'] },
        },
      },
    };
    const coverage = summarizeExposureCoverage(withGaps, 'holdings');
    expect(coverage).toEqual({
      view: 'holdings',
      baseLabel: 'azionario',
      baseEur: 74400,
      readEur: 65064,
      readPct: 87.5,
      notApplicableEur: 0,
      notApplicableInstruments: [],
      unreadEur: 9336,
      unreadInstruments: ['CL2'],
    });
  });
});

describe('buildPensionLookThrough', () => {
  const asset = (overrides: Partial<Asset>): Asset => ({ id: 'x', userId: 'u', name: 'X', type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 1, ...overrides } as Asset);
  const fund = asset({ id: 'f', name: 'Cometa', type: 'pensionFund', assetClass: 'bonds', quantity: 42000, allocationRole: 'frozen', composition: [{ assetClass: 'bonds', percentage: 70 }, { assetClass: 'equity', percentage: 30 }] } as Partial<Asset>);
  const house = asset({ id: 'h', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 180000, allocationRole: 'excluded' } as Partial<Asset>);
  const etf = asset({ id: 'e', name: 'World', quantity: 100, currentPrice: 1428.35 });
  const valueOf = (a: Asset) => a.quantity * a.currentPrice;

  it('is null without a pension fund', () => {
    expect(buildPensionLookThrough([etf, house], valueOf)).toBeNull();
  });

  it('splits the fund by its composition and the whole wealth by class', () => {
    const look = buildPensionLookThrough([fund, house, etf], valueOf);
    expect(look).not.toBeNull();
    expect(look!.fundCount).toBe(1);
    expect(look!.fundValue).toBe(42000);
    expect(look!.fundSlices.map((s) => [s.assetClass, s.value, Math.round(s.percentage)])).toEqual([
      ['bonds', 29400, 70],
      ['equity', 12600, 30],
    ]);
    expect(look!.combinedTotal).toBeCloseTo(364835, 2);
    expect(look!.combinedSlices[0].assetClass).toBe('realestate');
    expect(look!.hasExcluded).toBe(true);
    expect(look!.allFrozen).toBe(true);
  });
});
