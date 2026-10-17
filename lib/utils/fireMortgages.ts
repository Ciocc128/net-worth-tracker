/**
 * The mortgages of Patrimonio as the FIRE plan's dated flows read them (doc/fire-ipotesi/README.md § 12, RF1).
 *
 * A flow saved as «il mutuo di Casa» carries `source.propertyId` (the property), and that id stays valid forever. Until
 * 2026-10-10 the instalments were linked to the property itself (`debtAssetId === property.id`); since the debts are
 * `loan` assets (types/assets.ts → LOAN_ASSET_TYPE) the migration re-points them at the loan that finances the property
 * (`financedAssetId`). Resolving the flow through the loan keeps the saved `propertyId` working on both sides of the
 * migration: without it a plan saved before the first visit to Patrimonio would find zero instalments and lose its
 * mortgage with no error (dossier doc/allineamento-upstream/README.md § 5, S2).
 *
 * SDK-free: assets and instalment rows in, one schedule per property out.
 */

import { isLoanAsset, type Asset } from '@/types/assets';
import { debtBalanceOf } from '@/lib/utils/mortgageRepayment';
import { mortgageFlowSchedule, summarizeMortgage, type MortgageFlowSchedule, type MortgageRow } from '@/lib/utils/mortgageSummary';

/** An instalment row with the debt it repays. */
export type MortgageInstalmentRow = MortgageRow & { debtAssetId?: string };

/** One property whose debt has linked instalments, offered by «Collega un mutuo». */
export interface PropertyMortgage {
  propertyId: string;
  propertyName: string;
  schedule: MortgageFlowSchedule;
}

/** The properties a mortgage can hang from: the real estate the fork counts as such. */
export function mortgagePropertyIds(assets: Asset[]): string[] {
  return assets.filter((asset) => asset.type === 'realestate' && asset.assetClass === 'realestate').map((asset) => asset.id);
}

/**
 * The ids whose linked instalments are read: every loan, and every property still carrying a legacy debt (before the
 * migration reaches it). The ONE list, shared by Patrimonio's «Mutuo» tile and the FIRE plan so they share a query key.
 */
export function debtAssetIdsOf(assets: Asset[]): string[] {
  return assets.filter((asset) => isLoanAsset(asset) || (asset.type === 'realestate' && (asset.outstandingDebt ?? 0) > 0)).map((asset) => asset.id);
}

/** Two schedules of the same property laid over each other: the instalments add up, the end is the later one. */
function mergeSchedules(schedules: MortgageFlowSchedule[]): MortgageFlowSchedule {
  const live = schedules.filter((schedule) => schedule.kind !== 'none');
  if (live.length === 0) return { kind: 'none' };
  if (live.some((schedule) => schedule.kind === 'never')) return { kind: 'never' };
  const running = live.filter((schedule): schedule is Extract<MortgageFlowSchedule, { kind: 'schedule' }> => schedule.kind === 'schedule');
  if (running.length === 1) return running[0];
  const byYear = new Map<number, number>();
  for (const schedule of running) for (const [year, amount] of schedule.byYear) byYear.set(year, Math.round(((byYear.get(year) ?? 0) + amount) * 100) / 100);
  const last = running.reduce((a, b) => (b.endDate > a.endDate ? b : a));
  return {
    kind: 'schedule',
    instalment: Math.round(running.reduce((sum, schedule) => sum + schedule.instalment, 0) * 100) / 100,
    months: Math.max(...running.map((schedule) => schedule.months)),
    endDate: last.endDate,
    byYear,
  };
}

/**
 * One option per property with linked instalments. The debts of a property are the loans that finance it
 * (`financedAssetId`) and, before the migration, the property itself; a property with several loans reads as ONE
 * mortgage (the sum of their instalments), since the saved flow names the property.
 */
export function resolvePropertyMortgages(assets: Asset[], instalments: MortgageInstalmentRow[], now: Date): PropertyMortgage[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const result: PropertyMortgage[] = [];
  for (const propertyId of mortgagePropertyIds(assets)) {
    const property = byId.get(propertyId)!;
    const debts = assets.filter((asset) => asset.id === propertyId || (isLoanAsset(asset) && asset.financedAssetId === propertyId));
    const schedules: MortgageFlowSchedule[] = [];
    let linked = 0;
    for (const debt of debts) {
      const rows = instalments.filter((row) => row.debtAssetId === debt.id);
      if (rows.length === 0) continue;
      linked += rows.length;
      const summary = summarizeMortgage({ id: debt.id, name: debt.name, debt: debtBalanceOf(debt), debtInterestRate: debt.debtInterestRate, financedAssetName: property.name }, rows, now);
      schedules.push(mortgageFlowSchedule(summary));
    }
    if (linked === 0) continue;
    result.push({ propertyId, propertyName: property.name, schedule: mergeSchedules(schedules) });
  }
  return result;
}
