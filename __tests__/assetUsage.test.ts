/**
 * buildAssetUsage — doc/cancellazione-strumenti/README.md § 4.1–4.3 and § 7 (AU1, AU7, AU9).
 * Figures are invented and round (WORKFLOW.md rule 7); the expected values are worked out by hand
 * in the comments, never copied from the code's output.
 */
import { describe, expect, it } from 'vitest';
import { buildAssetUsage, type AssetUsageInput } from '@/lib/utils/assetUsage';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const TODAY = day('2026-06-15');

function input(overrides: Partial<AssetUsageInput> = {}): AssetUsageInput {
  return {
    asset: { id: 'ETF-A', name: 'Ornitorinco ETF', type: 'etf', quantity: 0 },
    today: TODAY,
    transactions: [{ date: day('2024-01-10') }, { date: day('2024-03-10') }, { date: day('2025-02-10') }],
    settlingTransactions: 0,
    dividends: [{ exDate: day('2026-03-01') }, { exDate: day('2026-09-01') }, { exDate: day('2026-12-01') }],
    plans: [],
    model: null,
    idealAllocation: null,
    pointers: null,
    goals: [],
    goalAssignments: [],
    otherAssets: [],
    fireDatedFlows: [],
    expenseRows: 0,
    pensionContributionsInto: 0,
    pensionContributionsFrom: 0,
    ...overrides,
  };
}

describe('buildAssetUsage', () => {
  it('AU1 — counts the ledger and the dividends; sorts the references into blockers, cleanups, kept', () => {
    // 3 ledger rows (buy 10×50, buy 5×60, sell 15×70 → quantity 0); dividends: 1 past (March),
    // 2 after 15 June (September, December).
    const usage = buildAssetUsage(
      input({
        plans: [{ name: 'P1', status: 'active', positions: [{ memberAssetIds: ['ETF-A'], buyAssetId: 'ETF-A' }] }],
        model: { weights: [{ assetId: 'ETF-A', targetPercentage: 30 }, { assetId: 'ETF-B', targetPercentage: 70 }] },
        idealAllocation: {
          instrumentLimits: [{ assetId: 'ETF-A', maxPct: 60 }],
          groupLimits: [{ id: 'G1', label: 'Mondo', assetIds: ['ETF-A', 'ETF-B'] }],
        },
        goals: [{ id: 'g1', name: 'Casa' }],
        goalAssignments: [{ goalId: 'g1', assetId: 'ETF-A' }],
      }),
    );
    expect(usage.ledger).toEqual({ count: 3, quantity: 0, firstDate: '2024-01-10', lastDate: '2025-02-10' });
    expect(usage.dividends).toEqual({ future: 2, past: 1 });
    expect(usage.blockers.map((l) => l.code)).toEqual(['R4', 'R6']);
    expect(usage.cleanups.map((l) => l.code)).toEqual(['R7', 'R8', 'R9']);
    expect(usage.plan.groupLimitIds).toEqual(['G1']);
    expect(usage.plan.emptiedGroupIds).toEqual([]);
  });

  it('R4 — any reference of an open plan stops the deletion; a closed plan only stays', () => {
    const base = { name: 'P', status: 'draft' };
    const cases = [
      { ...base, positions: [{ memberAssetIds: ['ETF-A', 'ETF-B'], buyAssetId: 'ETF-B' }] }, // a group member that does not buy
      { ...base, disposals: [{ assetId: 'ETF-A' }] },
      { ...base, liquidity: { sourceCashAssetIds: ['ETF-A'] } },
      { ...base, installments: [{ lines: [{ assetId: 'ETF-A' }] }] },
    ];
    for (const plan of cases) {
      expect(buildAssetUsage(input({ plans: [plan] })).blockers.map((l) => l.code)).toEqual(['R4']);
    }
    const closed = buildAssetUsage(input({ plans: [{ name: 'Old', status: 'completed', disposals: [{ assetId: 'ETF-A' }] }] }));
    expect(closed.blockers).toEqual([]);
    expect(closed.kept.map((l) => l.code)).toEqual(['R5']);
  });

  it('R6 — a model weight stops it, also as a group member', () => {
    const usage = buildAssetUsage(input({ model: { weights: [{ assetId: 'ETF-B', memberAssetIds: ['ETF-B', 'ETF-A'], targetPercentage: 100 }] } }));
    expect(usage.blockers.map((l) => l.code)).toEqual(['R6']);
  });

  it('AU7 — a group left without members is emptied', () => {
    const usage = buildAssetUsage(input({ idealAllocation: { groupLimits: [{ id: 'G2', label: 'Solo', assetIds: ['ETF-A'] }] } }));
    expect(usage.plan.emptiedGroupIds).toEqual(['G2']);
  });

  it('R10, R11 — the pointers to an account are cleaned, on the settings and on other assets', () => {
    const usage = buildAssetUsage(
      input({
        asset: { id: 'CONTO-X', name: 'Conto X', type: 'cash', quantity: 100 },
        transactions: [],
        pointers: { defaultDebitCashAssetId: 'CONTO-X', dividendCashAssetId: 'CONTO-X', defaultCreditCashAssetId: 'CONTO-Y' },
        otherAssets: [{ id: 'ETF-A', name: 'ETF A', type: 'etf', dividendCashAssetId: 'CONTO-X' }],
      }),
    );
    expect(usage.plan.pointers).toEqual(['defaultDebitCashAssetId', 'dividendCashAssetId']);
    expect(usage.plan.assetsToUnlinkDividendAccount).toEqual(['ETF-A']);
    expect(usage.cleanups.map((l) => l.code)).toEqual(['R10', 'R10', 'R11']);
  });

  it('AU9 — a property with a loan is blocked; the loan itself is free', () => {
    const loan = { id: 'MUTUO', name: 'Mutuo Casa', type: 'loan', financedAssetId: 'CASA' };
    const property = buildAssetUsage(input({ asset: { id: 'CASA', name: 'Casa', type: 'realestate', quantity: 1 }, transactions: [], otherAssets: [loan] }));
    expect(property.blockers.map((l) => l.code)).toEqual(['R12']);
    const loanUsage = buildAssetUsage(input({ asset: { id: 'MUTUO', name: 'Mutuo Casa', type: 'loan', quantity: 1 }, transactions: [], otherAssets: [{ id: 'CASA', name: 'Casa', type: 'realestate' }] }));
    expect(loanUsage.blockers).toEqual([]);
  });

  it('R13, R14, R2, R15 — stay, and are counted', () => {
    const usage = buildAssetUsage(
      input({
        asset: { id: 'CASA', name: 'Casa', type: 'realestate', quantity: 1 },
        transactions: [],
        fireDatedFlows: [{ source: { kind: 'mortgage', propertyId: 'CASA' } }, { source: { kind: 'goal' } }],
        expenseRows: 12,
        settlingTransactions: 4,
        pensionContributionsFrom: 2,
      }),
    );
    expect(usage.kept.map((l) => `${l.code}:${l.count}`)).toEqual(['R2:4', 'R13:1', 'R14:12', 'R15:2']);
  });

  it('D-CA2b — the default ledger choice: sold everything → keep; shares in hand → none', () => {
    expect(buildAssetUsage(input()).defaultLedgerChoice).toBe('keep');
    expect(buildAssetUsage(input({ asset: { id: 'ETF-A', name: 'x', type: 'etf', quantity: 4 } })).defaultLedgerChoice).toBeNull();
    expect(buildAssetUsage(input({ transactions: [] })).needsLedgerChoice).toBe(false);
  });

  it('R15 — pension contributions into the fund follow the ledger choice, with no default', () => {
    const usage = buildAssetUsage(
      input({ asset: { id: 'FP', name: 'Fondo', type: 'pensionFund', quantity: 0 }, transactions: [], pensionContributionsInto: 3 }),
    );
    expect(usage.needsLedgerChoice).toBe(true);
    expect(usage.defaultLedgerChoice).toBeNull();
    expect(usage.pensionContributions).toBe(3);
  });
});

describe('the readers say the truth about a deleted instrument (§ 4.7)', () => {
  it('names the missing members of a group limit, in the singular and the plural', async () => {
    const { describeMissingGroupMembers } = await import('@/lib/utils/assetUsageNarrative');
    expect(describeMissingGroupMembers(0)).toBeNull();
    expect(describeMissingGroupMembers(1)).toContain('Uno strumento del gruppo');
    expect(describeMissingGroupMembers(2)).toContain('2 strumenti del gruppo');
  });
});

describe('the words for an instrument that is gone (§ 4.7)', () => {
  it('never prints a raw id: a fixed label and a plan note that points at the revision', async () => {
    const { DELETED_INSTRUMENT_LABEL, DELETED_INSTRUMENT_PLAN_NOTE } = await import('@/lib/utils/accumulationNarrative');
    expect(DELETED_INSTRUMENT_LABEL).toBe('Strumento eliminato');
    expect(DELETED_INSTRUMENT_PLAN_NOTE).toBe('Strumento eliminato: rivedi il piano');
  });
});
