/**
 * The settings document fixtures shared by `settingsRoundTrip.test.ts` (the service's read and
 * write whitelists) and `settingsDraft.test.ts` (the page's draft: slice → compose must give the
 * document back). One fixture, two suites: a field added to the type reaches both guards or
 * neither, and the round-trip stays green while the draft is still dropping it — which is
 * exactly the regression the two tests exist for (2026-07-27 for the service, 2026-09-25 for the
 * page's sub-targets).
 */

import type { AssetAllocationSettings, DatedFlow, IdealAllocationSettings } from '@/types/assets';

/** Allocazione ideale (doc/weight-optimizer-ate.md §7) — every field diverges from
 *  DEFAULT_IDEAL_ALLOCATION so a field lost on either write chain or the read mapping shows. */
export const STORED_IDEAL_ALLOCATION: IdealAllocationSettings = {
  enabled: true,
  classPriority: 'high',
  leveragePriority: 'medium',
  factorObjectives: [{ assetClass: 'equity', priority: 'low' }],
  geography: { enabled: true, referenceIndexId: 'ftse-all-world', priority: 'medium' },
  instrumentLimits: [{ assetId: 'asset-1', minPct: 5, maxPct: 40 }],
  groupLimits: [{ id: 'group-1', label: 'Leva', assetIds: ['asset-1', 'asset-2'], maxPct: 20, priority: 'high' }],
};

/** Un mercato Monte Carlo v2 (Q1) con numeri scritti diversi dal default, l'inflazione, la scelta «Nessuna» per l'oro, la matrice e lo spread. */
export const STORED_MONTE_CARLO_MARKET = {
  version: 2 as const,
  classes: { equity: { cagr: 6.5, uncertainty: 3 }, carry: { premium: 2.5, volatility: 21 } },
  inflationRate: 2.5,
  goldSubCategory: null,
  correlations: [0.3, ...new Array(20).fill(-0.05)],
  leverageSpread: 3,
};

export const STORED_DATED_FLOWS: DatedFlow[] = [
  { id: 'f1', label: 'Eredità', kind: 'lumpIn', amount: 100_000, indexed: false, start: { anchor: 'year', year: 2036 }, durationYears: null },
  { id: 'f2', label: 'Part-time', kind: 'income', amount: 9_600, indexed: true, start: { anchor: 'fire', afterYears: 0 }, durationYears: 10 },
];

/** Gli scaglioni IRPEF di Impostazioni › Simulazioni (RP8). */
export const STORED_TAX_BRACKETS = [{ id: 'b1', upTo: 28_000, rate: 23 }, { id: 'b2', upTo: null, rate: 43 }];

/** Ogni valore è scelto per essere DIVERSO dal default, così un campo perso si vede. */
export const STORED_SETTINGS = {
  targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } },
  performanceIncludesPensionFunds: true,
  performanceIncludesExcludedAssets: true,
  performanceExcludesCash: true,
  pensionReturnStartMonth: '2026-07',
  costCentersEnabled: true,
  includePrimaryResidenceInFIRE: true,
  respectPensionLockInFire: true,
  pensionInpsRetirementAge: 68,
  pensionRitaLongUnemployment: true,
  cashflowHistoryStartYear: 2019,
  familyMembers: [{ id: 'm1', name: 'Giuseppe' }],
  expenseSplitEnabled: true,
  spendingRolesEnabled: true,
  idealAllocation: STORED_IDEAL_ALLOCATION,
  monteCarloMarket: STORED_MONTE_CARLO_MARKET,
  coastFireTaxBrackets: STORED_TAX_BRACKETS,
  dividendCashAssetId: 'cash-1',
  transferFeeCategoryId: 'cat-fee',
  transferFeeSubCategoryId: 'sub-fee',
  plannedAnnualExpenses: 31_000,
  fireEmergencyFund: 24_000,
  fireCashToInvestPct: 35,
  fireDatedFlows: STORED_DATED_FLOWS,
  coastFireCustomExpenses: 29_000,
};

/**
 * Every field Impostazioni's «Salva» writes, each at a value no default produces, with the
 * target tree in BOTH saved shapes (a plain number, a `SubCategoryTarget` with specific assets)
 * and the cash class as a fixed euro amount. `composeSettingsDocument(sliceSettings(doc), doc)`
 * must deep-equal this document — the identity the draft is built to keep.
 */
export const FULL_PAGE_SETTINGS: AssetAllocationSettings = {
  userAge: 41,
  riskFreeRate: 3.25,
  autoCalculateEquityBonds: false,
  includePrimaryResidenceInFIRE: true,
  goalBasedInvestingEnabled: true,
  goalDrivenAllocationEnabled: true,
  withdrawalRate: 3.5,
  plannedAnnualExpenses: 24000,
  // The FIRE plan's and the optimizer's fields: owned by other pages, CARRIED THROUGH «Salva»
  // from the document read just before it (the fork's gate S1, tenth realignment T3).
  fireEmergencyFund: 24000,
  fireCashToInvestPct: 35,
  fireDatedFlows: STORED_DATED_FLOWS,
  idealAllocation: STORED_IDEAL_ALLOCATION,
  targets: {
    equity: {
      targetPercentage: 55.5,
      subCategoryConfig: { enabled: true, categories: ['World', 'Small Cap'] },
      subTargets: {
        World: {
          targetPercentage: 70,
          specificAssetsEnabled: true,
          specificAssets: [
            { name: 'SWDA', targetPercentage: 60 },
            { name: 'VWCE', targetPercentage: 40 },
          ],
        },
        'Small Cap': 30,
      },
    },
    bonds: { targetPercentage: 20, subCategoryConfig: { enabled: false, categories: [] } },
    commodity: {
      targetPercentage: 5,
      subCategoryConfig: { enabled: true, categories: ['Oro'] },
      subTargets: { Oro: 100 },
    },
    realestate: { targetPercentage: 4, subCategoryConfig: { enabled: false, categories: [] } },
    cash: {
      targetPercentage: 0,
      useFixedAmount: true,
      fixedAmount: 15000,
      subCategoryConfig: { enabled: true, categories: ['Conto corrente', 'Deposito'] },
      subTargets: { 'Conto corrente': 40, Deposito: 60 },
    },
    crypto: { targetPercentage: 7.5, subCategoryConfig: { enabled: false, categories: [] } },
    trendFollowing: { targetPercentage: 6, subCategoryConfig: { enabled: false, categories: [] } },
    carry: { targetPercentage: 2, subCategoryConfig: { enabled: false, categories: [] } },
  },
  dividendIncomeCategoryId: 'cat-div',
  dividendIncomeSubCategoryId: 'sub-div',
  dividendCashAssetId: 'cash-div',
  defaultDebitCashAssetId: 'cash-debit',
  defaultCreditCashAssetId: 'cash-credit',
  transferFeeCategoryId: 'cat-fee',
  transferFeeSubCategoryId: 'sub-fee',
  stampDutyEnabled: true,
  stampDutyRate: 0.25,
  checkingAccountSubCategory: 'Conto corrente',
  cashflowHistoryStartYear: 2019,
  laborIncomeCategoryIds: ['cat-salary', 'cat-bonus'],
  costCentersEnabled: true,
  expenseSplitEnabled: true,
  spendingRolesEnabled: true,
  performanceIncludesPensionFunds: true,
  performanceIncludesExcludedAssets: true,
  performanceExcludesCash: true,
  pensionReturnStartMonth: '2026-07',
  monthlyEmailEnabled: true,
  quarterlyEmailEnabled: true,
  semiAnnualEmailEnabled: true,
  yearlyEmailEnabled: true,
  weeklyBudgetEmailEnabled: true,
  monthlyEmailRecipients: ['a@example.com', 'b@example.com'],
  familyMembers: [
    { id: 'm1', name: 'Giuseppe', grossAnnualIncome: 42000, isFirstEmploymentPost2007: true, firstEmploymentYear: 2015 },
    { id: 'm2', name: 'Marcella', grossAnnualIncome: 38000.5, isFirstEmploymentPost2007: false },
  ],
};
