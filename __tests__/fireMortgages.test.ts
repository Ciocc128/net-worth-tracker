/**
 * The FIRE plan's mortgage flow survives the debts becoming loan assets (dossier doc/allineamento-upstream/README.md § 5,
 * S2): a flow saved with `source.propertyId` finds the same instalments before and after the migration, and the readers of
 * the fork leave a loan out of the portfolio like upstream does.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({}));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
import { debtAssetIdsOf, resolvePropertyMortgages, type MortgageInstalmentRow } from '@/lib/utils/fireMortgages';
import { buildLoanFromProperty, planLoanMigration } from '@/lib/utils/loanMigration';
import { resolveDatedFlows } from '@/lib/utils/datedFlows';
import { resolveFireCapital } from '@/lib/utils/fireCapital';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { calculateAssetValue } from '@/lib/services/assetService';
import type { Asset, DatedFlow } from '@/types/assets';

const asset = (overrides: Partial<Asset>): Asset =>
  ({ id: 'a', userId: 'u', ticker: '', name: 'Asset', type: 'cash', assetClass: 'cash', currency: 'EUR', quantity: 0, currentPrice: 1, lastPriceUpdate: new Date(), createdAt: new Date(), updatedAt: new Date(), ...overrides }) as Asset;

const NOW = new Date(2026, 9, 17, 12);
// The legacy shape: the debt is two fields of the property, the instalments point at the property.
const LEGACY_HOUSE = asset({ id: 'house', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 250_000, outstandingDebt: 95_000, debtInterestRate: 3.2, isLiquid: false, allocationRole: 'excluded' });
const row = (id: string, debtAssetId: string, month: number): MortgageInstalmentRow => ({ id, amount: -700, date: new Date(2026, month, 5, 12), balancePending: true, debtAssetId });
const instalments = (debtAssetId: string) => [row('r1', debtAssetId, 10), row('r2', debtAssetId, 11), row('r3', debtAssetId, 0)];

// A migrated account: the property is gross, the loan carries the debt, the rows point at the loan.
const migratedAssets = (): Asset[] => {
  const [step] = planLoanMigration([LEGACY_HOUSE], []);
  return [{ ...LEGACY_HOUSE, currentPrice: 250_000, outstandingDebt: undefined, debtInterestRate: undefined }, asset({ ...step.loan, id: 'loan' } as Partial<Asset>)];
};

const FLOW = { id: 'f1', label: 'Mutuo Casa', kind: 'expense', amount: 1, start: { anchor: 'year', year: 2026 }, source: { kind: 'mortgage', propertyId: 'house' } } as unknown as DatedFlow;

describe('resolvePropertyMortgages — the property id stays valid across the migration', () => {
  it('should read the same schedule before the migration (rows on the property) and after it (rows on the loan)', () => {
    const before = resolvePropertyMortgages([LEGACY_HOUSE], instalments('house'), NOW);
    const after = resolvePropertyMortgages(migratedAssets(), instalments('loan'), NOW);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0].propertyId).toBe('house');
    expect(after[0].propertyName).toBe('Casa');
    expect(after[0].schedule).toEqual(before[0].schedule);
    expect(after[0].schedule.kind).toBe('schedule');
  });

  it('should keep a saved flow resolved to the mortgage (not excluded) after the migration', () => {
    const mortgages = new Map(resolvePropertyMortgages(migratedAssets(), instalments('loan'), NOW).map((m) => [m.propertyId, { propertyName: m.propertyName, schedule: m.schedule }]));
    const { resolved, excluded } = resolveDatedFlows([FLOW], { currentYear: 2026, mortgages });
    expect(excluded).toEqual([]);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('should add the instalments of two loans on the same property into one mortgage', () => {
    const [house, loan] = migratedAssets();
    const second = asset({ ...loan, id: 'loan2', name: 'Ristrutturazione', quantity: 20_000 });
    const rows = [...instalments('loan'), ...instalments('loan2')];
    const [only] = resolvePropertyMortgages([house, loan, second], rows, NOW);
    const [single] = resolvePropertyMortgages([house, loan], instalments('loan'), NOW);
    if (only.schedule.kind !== 'schedule' || single.schedule.kind !== 'schedule') throw new Error('schedule expected');
    expect(only.schedule.instalment).toBeCloseTo(single.schedule.instalment * 2, 2);
  });

  it('should offer nothing for a property with no linked instalment', () => {
    expect(resolvePropertyMortgages(migratedAssets(), [], NOW)).toEqual([]);
  });

  it('should list the ids whose instalments are read: every loan and a not-yet-migrated property', () => {
    expect(debtAssetIdsOf([LEGACY_HOUSE])).toEqual(['house']);
    expect(debtAssetIdsOf(migratedAssets())).toEqual(['loan']);
  });
});

describe('the fork readers leave a loan out of the portfolio', () => {
  const car = asset({ id: 'car', name: 'Prestito auto', type: 'loan', assetClass: 'cash', quantity: 8_000, isLiquid: true });

  it('should read a loan as excluded whatever role was typed on it', () => {
    expect(resolveAllocationRole({ ...car, allocationRole: 'tradable' })).toBe('excluded');
    expect(resolveAllocationRole(buildLoanFromProperty(LEGACY_HOUSE) as unknown as Asset)).toBe('excluded');
  });

  it('should leave the portfolio of the FIRE capital unchanged when a tradable-typed personal loan is added', () => {
    const etf = asset({ id: 'etf', name: 'ETF', type: 'etf', assetClass: 'equity', quantity: 100, currentPrice: 500, allocationRole: 'tradable' });
    const without = resolveFireCapital([etf], calculateAssetValue, {});
    const withLoan = resolveFireCapital([etf, { ...car, allocationRole: 'tradable' }], calculateAssetValue, {});
    expect(withLoan.portfolio).toBe(without.portfolio);
    expect(withLoan.total).toBe(without.total);
    expect(withLoan.netWorth).toBe(without.netWorth - 8_000);
  });

  it('should net a property and the loan that finances it to the legacy value in «fuori dal capitale»', () => {
    const legacy = resolveFireCapital([LEGACY_HOUSE], calculateAssetValue, {});
    const migrated = resolveFireCapital(migratedAssets(), calculateAssetValue, {});
    expect(migrated.outside.realestate).toBeCloseTo(legacy.outside.realestate, 2);
    expect(migrated.netWorth).toBeCloseTo(legacy.netWorth, 2);
    expect(migrated.total).toBe(legacy.total);
  });
});
