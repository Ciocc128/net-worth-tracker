/**
 * Every file that touches the `expenses` collection says whether it asks for the monthly totals to
 * be rebuilt (doc/totali-mensili/README.md § 5.2, CA6). A closed month is read from its total, so a
 * writer that forgets the call leaves a figure wrong until the nightly verification repairs it:
 * this test makes the choice explicit and fails on a NEW file that names the collection without
 * being declared here, and on a «calls» file that no longer calls.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SCANNED_DIRS = ['app', 'lib', 'scripts', 'components'];

/**
 * The collection named as a literal: `collection(db, 'expenses')`, `.collection('expenses')`,
 * `= 'expenses';`, or inside a constant list of collections a script copies (`const USER_COLLECTIONS = ['assets', 'expenses', …]`).
 */
const NAMES_EXPENSES = /collection\([^)]*'expenses'|=\s*'expenses';|const [A-Z_]+ = \[[^\]\n]*'expenses'[^\]\n]*\]/;
const REBUILD_CALLS = /markExpenseMonthsChanged|rebuildExpenseTotals|rebuildAllExpenseTotals|rebuildExpenseTotalsFor/;

type Declaration = { kind: 'calls' } | { kind: 'no-call'; reason: string };

const DECLARED: Record<string, Declaration> = {
  // ── writers that change a cell (date, amount, type, category, sub-category, fee, sign) ──
  'lib/services/expenseService.ts': { kind: 'calls' },
  'lib/services/expenseImportService.ts': { kind: 'calls' },
  'lib/services/dividendIncomeService.ts': { kind: 'calls' },
  'lib/services/dividendService.ts': { kind: 'calls' },
  'lib/server/assetTransactionUseCase.ts': { kind: 'calls' },
  'lib/services/dummyDataService.ts': { kind: 'calls' },
  'lib/services/dummySnapshotGenerator.ts': { kind: 'calls' },
  'scripts/seedEmulator.ts': { kind: 'calls' },
  'scripts/seedAnalisiE2E.mts': { kind: 'calls' },
  'scripts/seedCensusE2E.mts': { kind: 'calls' },
  'scripts/seedCostCentersE2E.mts': { kind: 'calls' },
  'scripts/seedSplitE2E.mts': { kind: 'calls' },
  'scripts/seedHallOfFameE2E.mts': { kind: 'calls' },
  'scripts/mirrorProdAccount.mts': { kind: 'calls' },
  // ── the totals themselves ──
  'lib/server/expenseTotals.ts': { kind: 'calls' },
  'lib/server/expenseTotalsRebuildAll.ts': { kind: 'no-call', reason: 'it IS the rebuild' },
  // ── writers of fields that are not a cell dimension ──
  'lib/server/cashSettlement.ts': { kind: 'no-call', reason: 'writes balancePending only' },
  'lib/services/debtRepaymentService.ts': { kind: 'no-call', reason: 'writes debtPrincipalRepaid/debtInterestPaid only' },
  'lib/services/loanMigration.ts': { kind: 'no-call', reason: 'writes debtAssetId only' },
  'lib/services/costCenterService.ts': { kind: 'no-call', reason: 'writes costCenterId/costCenterName only' },
  // ── readers ──
  'lib/server/emailPeriodComparison.ts': { kind: 'no-call', reason: 'reads only' },
  'lib/server/monthlyEmailService.ts': { kind: 'no-call', reason: 'reads only' },
  'lib/server/weeklyBudgetEmailService.ts': { kind: 'no-call', reason: 'reads only' },
  'lib/services/assistantMonthContextService.ts': { kind: 'no-call', reason: 'reads only' },
  'lib/services/dashboardOverviewService.ts': { kind: 'no-call', reason: 'reads only' },
  'scripts/exercisePensionContributions.mts': { kind: 'no-call', reason: 'reads only' },
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(full);
  }
  return out;
}

const touching = SCANNED_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((file) => NAMES_EXPENSES.test(readFileSync(file, 'utf8')))
  .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
  .sort();

describe('writers of expenses and the monthly totals', () => {
  it('every file naming the expenses collection is declared', () => {
    const undeclared = touching.filter((file) => !(file in DECLARED));
    expect(undeclared, 'declare each in DECLARED: «calls» if it changes a cell, else «no-call» with the reason').toEqual([]);
  });

  it('no declaration is left for a file that no longer names the collection', () => {
    const stale = Object.keys(DECLARED).filter((file) => !touching.includes(file));
    expect(stale).toEqual([]);
  });

  it('every «calls» file asks for the rebuild', () => {
    const silent = Object.entries(DECLARED)
      .filter(([, d]) => d.kind === 'calls')
      .map(([file]) => file)
      .filter((file) => !REBUILD_CALLS.test(readFileSync(path.join(ROOT, file), 'utf8')));
    expect(silent).toEqual([]);
  });
});
