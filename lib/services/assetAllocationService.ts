import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { Asset, AssetAllocationTarget, AssetAllocationSettings, IdealAllocationSettings } from '@/types/assets';
import { calculateAssetValue, calculateTotalValue } from './assetService';

const ALLOCATION_TARGETS_COLLECTION = 'assetAllocationTargets';

function settingsAffectDashboardOverview(settings: AssetAllocationSettings): boolean {
  return (
    settings.stampDutyEnabled !== undefined ||
    settings.stampDutyRate !== undefined ||
    settings.checkingAccountSubCategory !== undefined
  );
}

function serializeCoastFirePensions(
  pensions: AssetAllocationSettings['coastFirePensions']
) {
  if (!pensions) return pensions;

  return pensions.map((pension) => ({
    id: pension.id,
    label: pension.label,
    grossMonthlyAmount: pension.grossMonthlyAmount,
    monthsPerYear: pension.monthsPerYear,
    ...(pension.startDate ? { startDate: pension.startDate } : {}),
    ...(pension.startAge !== undefined ? { startAge: pension.startAge } : {}),
  }));
}

function serializeFamilyMembers(
  members: AssetAllocationSettings['familyMembers']
) {
  if (!members) return members;

  return members.map((member) => ({
    id: member.id,
    name: member.name,
    ...(member.grossAnnualIncome !== undefined ? { grossAnnualIncome: member.grossAnnualIncome } : {}),
    ...(member.isFirstEmploymentPost2007 !== undefined
      ? { isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 }
      : {}),
    ...(member.firstEmploymentYear !== undefined ? { firstEmploymentYear: member.firstEmploymentYear } : {}),
  }));
}

/**
 * Whitelisting serializer for `idealAllocation`: Firestore rejects `undefined` inside an array
 * element, and `instrumentLimits[].minPct/maxPct` are optional, so each entry is rebuilt with a
 * conditional spread rather than copied as-is (same pattern as `serializeFamilyMembers` above).
 */
function serializeIdealAllocation(
  settings: IdealAllocationSettings | undefined
): IdealAllocationSettings | undefined {
  if (!settings) return settings;

  return {
    enabled: settings.enabled,
    classPriority: settings.classPriority,
    leveragePriority: settings.leveragePriority,
    factorObjectives: settings.factorObjectives.map((objective) => ({
      assetClass: objective.assetClass,
      priority: objective.priority,
    })),
    geography: settings.geography
      ? {
          enabled: settings.geography.enabled,
          referenceIndexId: settings.geography.referenceIndexId,
          priority: settings.geography.priority,
        }
      : null,
    instrumentLimits: settings.instrumentLimits.map((limit) => ({
      assetId: limit.assetId,
      ...(limit.minPct !== undefined ? { minPct: limit.minPct } : {}),
      ...(limit.maxPct !== undefined ? { maxPct: limit.maxPct } : {}),
    })),
    groupLimits: settings.groupLimits.map((group) => ({
      id: group.id,
      label: group.label,
      assetIds: group.assetIds,
      maxPct: group.maxPct,
      priority: group.priority,
    })),
  };
}

/**
 * Get allocation settings for a user
 *
 * Includes: targets, userAge, riskFreeRate, withdrawalRate, plannedAnnualExpenses,
 * coastFireRetirementAge, coastFirePensions, coastFireTaxBrackets,
 * includePrimaryResidenceInFIRE, dividendIncomeCategoryId, dividendIncomeSubCategoryId,
 * transferFeeCategoryId, transferFeeSubCategoryId
 *
 * WARNING (checklist comment): the mapping below is an EXPLICIT FIELD WHITELIST, not a spread of
 * `data`. A new field on `AssetAllocationSettings` that is not added here is written to Firestore
 * by `setSettings` and then silently dropped on read — the UI shows it saved until the next reload,
 * when it reverts. Adding a setting means touching, in lock-step: the type in `types/assets.ts`,
 * this mapping, and the state/load/save/dirty-snapshot wiring in `app/dashboard/settings/page.tsx`.
 */
export async function getSettings(
  userId: string
): Promise<AssetAllocationSettings | null> {
  try {
    const targetRef = doc(db, ALLOCATION_TARGETS_COLLECTION, userId);
    const targetDoc = await getDoc(targetRef);

    if (!targetDoc.exists()) {
      return null;
    }

    const data = targetDoc.data();

    // Support both old format (only targets) and new format (with userAge, riskFreeRate, withdrawalRate, and plannedAnnualExpenses)
    return {
      userAge: data.userAge,
      riskFreeRate: data.riskFreeRate,
      withdrawalRate: data.withdrawalRate,
      plannedAnnualExpenses: data.plannedAnnualExpenses,
      coastFireRetirementAge: data.coastFireRetirementAge,
      coastFireCustomExpenses: data.coastFireCustomExpenses,
      coastFirePensions: data.coastFirePensions,
      coastFireTaxBrackets: data.coastFireTaxBrackets,
      includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE,
      respectPensionLockInFire: data.respectPensionLockInFire,
      pensionInpsRetirementAge: data.pensionInpsRetirementAge,
      pensionRitaLongUnemployment: data.pensionRitaLongUnemployment,
      dividendIncomeCategoryId: data.dividendIncomeCategoryId,
      dividendIncomeSubCategoryId: data.dividendIncomeSubCategoryId,
      dividendCashAssetId: data.dividendCashAssetId,
      transferFeeCategoryId: data.transferFeeCategoryId,
      transferFeeSubCategoryId: data.transferFeeSubCategoryId,
      fireProjectionScenarios: data.fireProjectionScenarios,
      monteCarloScenarios: data.monteCarloScenarios,
      monteCarloMarket: data.monteCarloMarket,
      goalBasedInvestingEnabled: data.goalBasedInvestingEnabled,
      goalDrivenAllocationEnabled: data.goalDrivenAllocationEnabled,
      autoCalculateEquityBonds: data.autoCalculateEquityBonds,
      defaultDebitCashAssetId: data.defaultDebitCashAssetId,
      defaultCreditCashAssetId: data.defaultCreditCashAssetId,
      stampDutyEnabled: data.stampDutyEnabled,
      stampDutyRate: data.stampDutyRate,
      checkingAccountSubCategory: data.checkingAccountSubCategory,
      cashflowHistoryStartYear: data.cashflowHistoryStartYear,
      laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
      assistantResponseStyle: data.assistantResponseStyle,
      assistantMacroContextEnabled: data.assistantMacroContextEnabled,
      assistantMemoryEnabled: data.assistantMemoryEnabled,
      costCentersEnabled: data.costCentersEnabled,
      expenseSplitEnabled: data.expenseSplitEnabled,
      spendingRolesEnabled: data.spendingRolesEnabled,
      monthlyEmailEnabled: data.monthlyEmailEnabled,
      quarterlyEmailEnabled: data.quarterlyEmailEnabled,
      semiAnnualEmailEnabled: data.semiAnnualEmailEnabled,
      yearlyEmailEnabled: data.yearlyEmailEnabled,
      weeklyBudgetEmailEnabled: data.weeklyBudgetEmailEnabled,
      monthlyEmailRecipients: data.monthlyEmailRecipients,
      familyMembers: data.familyMembers,
      performanceIncludesPensionFunds: data.performanceIncludesPensionFunds,
      performanceIncludesExcludedAssets: data.performanceIncludesExcludedAssets,
      performanceExcludesCash: data.performanceExcludesCash,
      pensionReturnStartMonth: data.pensionReturnStartMonth,
      idealAllocation: data.idealAllocation,
      targets: data.targets as AssetAllocationTarget,
    };
  } catch (error) {
    console.error('Error getting allocation settings:', error);
    throw new Error('Failed to fetch allocation settings');
  }
}

/**
 * Get allocation targets for a user (legacy function for backward compatibility)
 */
export async function getTargets(
  userId: string
): Promise<AssetAllocationTarget | null> {
  const settings = await getSettings(userId);
  return settings ? settings.targets : null;
}

/**
 * Set allocation settings for a user (includes targets, age, and risk-free rate)
 *
 * IMPORTANT: Uses Firestore merge mode to preserve fields not included in this update.
 * This prevents data loss when different parts of the app update different settings fields.
 */
export async function setSettings(
  userId: string,
  settings: AssetAllocationSettings
): Promise<void> {
  try {
    const targetRef = doc(db, ALLOCATION_TARGETS_COLLECTION, userId);

    // CRITICAL: If targets is being updated, we need to REPLACE it completely (not merge)
    // to ensure deleted subcategories are removed from Firestore.
    // Firestore merge: true does recursive merge, keeping old nested keys.
    if (settings.targets !== undefined) {
      // Get existing document to preserve other fields
      const existingDoc = await getDoc(targetRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};

      // Build complete document with all fields
      const docData: Record<string, unknown> = {
        ...existingData, // Keep all existing fields
        userId,
        targets: settings.targets, // COMPLETELY REPLACE targets (not merge)
        updatedAt: new Date(),
      };

      // Override with new values for defined fields.
      // Età and risk-free rate are USER-CLEARABLE (an emptied input sends undefined), so they
      // take the `'x' in settings` guard: with `!== undefined` the spread of existingData above
      // kept the old value and the cleared field came back on the next load.
      if ('userAge' in settings) {
        if (settings.userAge !== undefined) {
          docData.userAge = settings.userAge;
        } else {
          delete docData.userAge;
        }
      }
      if ('riskFreeRate' in settings) {
        if (settings.riskFreeRate !== undefined) {
          docData.riskFreeRate = settings.riskFreeRate;
        } else {
          delete docData.riskFreeRate;
        }
      }
      if (settings.withdrawalRate !== undefined) {
        docData.withdrawalRate = settings.withdrawalRate;
      }
      // The plan's expenses are USER-CLEARABLE (empty = «dal Cashflow», doc/fire-ipotesi/README.md D5): the key
      // present and undefined removes the field, as for the Coast FIRE custom expenses below.
      if ('plannedAnnualExpenses' in settings) {
        if (settings.plannedAnnualExpenses !== undefined) {
          docData.plannedAnnualExpenses = settings.plannedAnnualExpenses;
        } else {
          delete docData.plannedAnnualExpenses;
        }
      }
      if (settings.coastFireRetirementAge !== undefined) {
        docData.coastFireRetirementAge = settings.coastFireRetirementAge;
      }
      // When the key is present but undefined, remove the field from docData so setDoc drops it.
      // deleteField() is not allowed with setDoc() without merge:true; omitting the key achieves the same result.
      if ('coastFireCustomExpenses' in settings) {
        if (settings.coastFireCustomExpenses !== undefined) {
          docData.coastFireCustomExpenses = settings.coastFireCustomExpenses;
        } else {
          delete docData.coastFireCustomExpenses;
        }
      }
      if (settings.coastFirePensions !== undefined) {
        docData.coastFirePensions = serializeCoastFirePensions(settings.coastFirePensions);
      }
      if (settings.coastFireTaxBrackets !== undefined) {
        docData.coastFireTaxBrackets = settings.coastFireTaxBrackets;
      }
      if (settings.includePrimaryResidenceInFIRE !== undefined) {
        docData.includePrimaryResidenceInFIRE = settings.includePrimaryResidenceInFIRE;
      }
      // Also user-clearable, from the «Cancella» buttons of Impostazioni → Dividendi.
      if ('dividendIncomeCategoryId' in settings) {
        if (settings.dividendIncomeCategoryId !== undefined) {
          docData.dividendIncomeCategoryId = settings.dividendIncomeCategoryId;
        } else {
          delete docData.dividendIncomeCategoryId;
        }
      }
      if ('dividendIncomeSubCategoryId' in settings) {
        if (settings.dividendIncomeSubCategoryId !== undefined) {
          docData.dividendIncomeSubCategoryId = settings.dividendIncomeSubCategoryId;
        } else {
          delete docData.dividendIncomeSubCategoryId;
        }
      }
      if ('dividendCashAssetId' in settings) {
        if (settings.dividendCashAssetId !== undefined) {
          docData.dividendCashAssetId = settings.dividendCashAssetId;
        } else {
          delete docData.dividendCashAssetId;
        }
      }
      // User-clearable from Impostazioni → Spese (the transfer fee's category).
      if ('transferFeeCategoryId' in settings) {
        if (settings.transferFeeCategoryId !== undefined) {
          docData.transferFeeCategoryId = settings.transferFeeCategoryId;
        } else {
          delete docData.transferFeeCategoryId;
        }
      }
      if ('transferFeeSubCategoryId' in settings) {
        if (settings.transferFeeSubCategoryId !== undefined) {
          docData.transferFeeSubCategoryId = settings.transferFeeSubCategoryId;
        } else {
          delete docData.transferFeeSubCategoryId;
        }
      }
      if (settings.fireProjectionScenarios !== undefined) {
        docData.fireProjectionScenarios = settings.fireProjectionScenarios;
      }
      if (settings.monteCarloScenarios !== undefined) {
        docData.monteCarloScenarios = settings.monteCarloScenarios;
      }
      if (settings.goalBasedInvestingEnabled !== undefined) {
        docData.goalBasedInvestingEnabled = settings.goalBasedInvestingEnabled;
      }
      if (settings.goalDrivenAllocationEnabled !== undefined) {
        docData.goalDrivenAllocationEnabled = settings.goalDrivenAllocationEnabled;
      }
      if (settings.autoCalculateEquityBonds !== undefined) {
        docData.autoCalculateEquityBonds = settings.autoCalculateEquityBonds;
      }
      if (settings.respectPensionLockInFire !== undefined) {
        docData.respectPensionLockInFire = settings.respectPensionLockInFire;
      }
      // RITA rule inputs: written only by FireCalculatorTab with a complete form, not
      // clearable — same reasoning as includePrimaryResidenceInFIRE, so the !== undefined guard
      // is safe in both branches.
      if (settings.pensionInpsRetirementAge !== undefined) {
        docData.pensionInpsRetirementAge = settings.pensionInpsRetirementAge;
      }
      if (settings.pensionRitaLongUnemployment !== undefined) {
        docData.pensionRitaLongUnemployment = settings.pensionRitaLongUnemployment;
      }
      // Default cash accounts are user-clearable: a present-but-undefined value means
      // "Nessun default". setDoc here runs WITHOUT merge, so deleting the key from docData
      // (built from existingData) drops the stored value. The `in` check distinguishes
      // "clear this field" from "field not part of this update".
      if ('defaultDebitCashAssetId' in settings) {
        if (settings.defaultDebitCashAssetId !== undefined) {
          docData.defaultDebitCashAssetId = settings.defaultDebitCashAssetId;
        } else {
          delete docData.defaultDebitCashAssetId;
        }
      }
      if ('defaultCreditCashAssetId' in settings) {
        if (settings.defaultCreditCashAssetId !== undefined) {
          docData.defaultCreditCashAssetId = settings.defaultCreditCashAssetId;
        } else {
          delete docData.defaultCreditCashAssetId;
        }
      }
      if (settings.stampDutyEnabled !== undefined) {
        docData.stampDutyEnabled = settings.stampDutyEnabled;
      }
      if (settings.stampDutyRate !== undefined) {
        docData.stampDutyRate = settings.stampDutyRate;
      }
      if (settings.checkingAccountSubCategory !== undefined) {
        docData.checkingAccountSubCategory = settings.checkingAccountSubCategory;
      }
      if (settings.cashflowHistoryStartYear !== undefined) {
        docData.cashflowHistoryStartYear = settings.cashflowHistoryStartYear;
      }
      if (settings.laborIncomeCategoryIds !== undefined) {
        docData.laborIncomeCategoryIds = settings.laborIncomeCategoryIds;
      }
      if (settings.assistantResponseStyle !== undefined) {
        docData.assistantResponseStyle = settings.assistantResponseStyle;
      }
      if (settings.assistantMacroContextEnabled !== undefined) {
        docData.assistantMacroContextEnabled = settings.assistantMacroContextEnabled;
      }
      if (settings.assistantMemoryEnabled !== undefined) {
        docData.assistantMemoryEnabled = settings.assistantMemoryEnabled;
      }
      if (settings.costCentersEnabled !== undefined) {
        docData.costCentersEnabled = settings.costCentersEnabled;
      }
      if (settings.expenseSplitEnabled !== undefined) {
        docData.expenseSplitEnabled = settings.expenseSplitEnabled;
      }
      if (settings.spendingRolesEnabled !== undefined) {
        docData.spendingRolesEnabled = settings.spendingRolesEnabled;
      }
      if (settings.monthlyEmailEnabled !== undefined) {
        docData.monthlyEmailEnabled = settings.monthlyEmailEnabled;
      }
      if (settings.quarterlyEmailEnabled !== undefined) {
        docData.quarterlyEmailEnabled = settings.quarterlyEmailEnabled;
      }
      if (settings.semiAnnualEmailEnabled !== undefined) {
        docData.semiAnnualEmailEnabled = settings.semiAnnualEmailEnabled;
      }
      if (settings.yearlyEmailEnabled !== undefined) {
        docData.yearlyEmailEnabled = settings.yearlyEmailEnabled;
      }
      if (settings.weeklyBudgetEmailEnabled !== undefined) {
        docData.weeklyBudgetEmailEnabled = settings.weeklyBudgetEmailEnabled;
      }
      if (settings.monthlyEmailRecipients !== undefined) {
        docData.monthlyEmailRecipients = settings.monthlyEmailRecipients;
      }
      if (settings.familyMembers !== undefined) {
        docData.familyMembers = serializeFamilyMembers(settings.familyMembers);
      }
      if (settings.performanceIncludesPensionFunds !== undefined) {
        docData.performanceIncludesPensionFunds = settings.performanceIncludesPensionFunds;
      }
      if (settings.performanceIncludesExcludedAssets !== undefined) {
        docData.performanceIncludesExcludedAssets = settings.performanceIncludesExcludedAssets;
      }
      if (settings.performanceExcludesCash !== undefined) {
        docData.performanceExcludesCash = settings.performanceExcludesCash;
      }
      // Clearable (empty month input = "parti dal primo versamento"). Same shape as the default
      // cash accounts above: this branch writes WITHOUT merge, so dropping the key removes it.
      if ('pensionReturnStartMonth' in settings) {
        if (settings.pensionReturnStartMonth !== undefined) {
          docData.pensionReturnStartMonth = settings.pensionReturnStartMonth;
        } else {
          delete docData.pensionReturnStartMonth;
        }
      }
      // The weight optimizer's ideal-allocation settings (doc/weight-optimizer-ate.md §7.2) are
      // not user-clearable through a dedicated control, but follow the same `'x' in settings`
      // shape as the other object-valued fields above: this branch writes WITHOUT merge, so a
      // caller that omits the key must not have it silently dropped from the rebuilt document.
      if ('idealAllocation' in settings) {
        if (settings.idealAllocation !== undefined) {
          docData.idealAllocation = serializeIdealAllocation(settings.idealAllocation);
        } else {
          delete docData.idealAllocation;
        }
      }

      // The Monte Carlo market assumptions (Impostazioni › Simulazioni): same shape as idealAllocation
      // above — this branch writes WITHOUT merge, so a caller that omits the key must not have it dropped.
      if ('monteCarloMarket' in settings) {
        if (settings.monteCarloMarket !== undefined) {
          docData.monteCarloMarket = settings.monteCarloMarket;
        } else {
          delete docData.monteCarloMarket;
        }
      }

      // Use setDoc WITHOUT merge to completely replace targets
      await setDoc(targetRef, docData);
    } else {
      // No targets update, use normal merge behavior
      const docData: Record<string, unknown> = {
        userId,
        updatedAt: new Date(),
      };

      // Età and risk-free rate are user-clearable (an emptied input sends undefined):
      // with merge: true, omitting the key would leave the stale value in place.
      if ('userAge' in settings) {
        docData.userAge =
          settings.userAge !== undefined ? settings.userAge : deleteField();
      }
      if ('riskFreeRate' in settings) {
        docData.riskFreeRate =
          settings.riskFreeRate !== undefined ? settings.riskFreeRate : deleteField();
      }
      if (settings.withdrawalRate !== undefined) {
        docData.withdrawalRate = settings.withdrawalRate;
      }
      // The plan's expenses are USER-CLEARABLE (empty = «dal Cashflow», doc/fire-ipotesi/README.md D5): the key
      // present and undefined removes the field, as for the Coast FIRE custom expenses below.
      if ('plannedAnnualExpenses' in settings) {
        docData.plannedAnnualExpenses =
          settings.plannedAnnualExpenses !== undefined ? settings.plannedAnnualExpenses : deleteField();
      }
      if (settings.coastFireRetirementAge !== undefined) {
        docData.coastFireRetirementAge = settings.coastFireRetirementAge;
      }
      // Merge branch: omitting the key would leave the stale value, so an undefined one is a deleteField().
      if ('coastFireCustomExpenses' in settings) {
        docData.coastFireCustomExpenses =
          settings.coastFireCustomExpenses !== undefined ? settings.coastFireCustomExpenses : deleteField();
      }
      if (settings.coastFirePensions !== undefined) {
        docData.coastFirePensions = serializeCoastFirePensions(settings.coastFirePensions);
      }
      if (settings.coastFireTaxBrackets !== undefined) {
        docData.coastFireTaxBrackets = settings.coastFireTaxBrackets;
      }
      if (settings.includePrimaryResidenceInFIRE !== undefined) {
        docData.includePrimaryResidenceInFIRE = settings.includePrimaryResidenceInFIRE;
      }
      // Also user-clearable, from the «Cancella» buttons of Impostazioni → Dividendi.
      if ('dividendIncomeCategoryId' in settings) {
        docData.dividendIncomeCategoryId =
          settings.dividendIncomeCategoryId !== undefined ? settings.dividendIncomeCategoryId : deleteField();
      }
      if ('dividendIncomeSubCategoryId' in settings) {
        docData.dividendIncomeSubCategoryId =
          settings.dividendIncomeSubCategoryId !== undefined ? settings.dividendIncomeSubCategoryId : deleteField();
      }
      if ('dividendCashAssetId' in settings) {
        docData.dividendCashAssetId =
          settings.dividendCashAssetId !== undefined ? settings.dividendCashAssetId : deleteField();
      }
      // User-clearable from Impostazioni → Spese (the transfer fee's category).
      if ('transferFeeCategoryId' in settings) {
        docData.transferFeeCategoryId =
          settings.transferFeeCategoryId !== undefined ? settings.transferFeeCategoryId : deleteField();
      }
      if ('transferFeeSubCategoryId' in settings) {
        docData.transferFeeSubCategoryId =
          settings.transferFeeSubCategoryId !== undefined ? settings.transferFeeSubCategoryId : deleteField();
      }
      if (settings.fireProjectionScenarios !== undefined) {
        docData.fireProjectionScenarios = settings.fireProjectionScenarios;
      }
      if (settings.monteCarloScenarios !== undefined) {
        docData.monteCarloScenarios = settings.monteCarloScenarios;
      }
      if (settings.goalBasedInvestingEnabled !== undefined) {
        docData.goalBasedInvestingEnabled = settings.goalBasedInvestingEnabled;
      }
      if (settings.goalDrivenAllocationEnabled !== undefined) {
        docData.goalDrivenAllocationEnabled = settings.goalDrivenAllocationEnabled;
      }
      if (settings.autoCalculateEquityBonds !== undefined) {
        docData.autoCalculateEquityBonds = settings.autoCalculateEquityBonds;
      }
      if (settings.respectPensionLockInFire !== undefined) {
        docData.respectPensionLockInFire = settings.respectPensionLockInFire;
      }
      // RITA rule inputs: written only by FireCalculatorTab with a complete form, not
      // clearable — same reasoning as includePrimaryResidenceInFIRE, so the !== undefined guard
      // is safe in both branches.
      if (settings.pensionInpsRetirementAge !== undefined) {
        docData.pensionInpsRetirementAge = settings.pensionInpsRetirementAge;
      }
      if (settings.pensionRitaLongUnemployment !== undefined) {
        docData.pensionRitaLongUnemployment = settings.pensionRitaLongUnemployment;
      }
      // Default cash accounts are user-clearable. This branch writes with merge: true,
      // so omitting the key would leave the old value untouched — use deleteField() to
      // remove it when the user selects "Nessun default" (present-but-undefined).
      if ('defaultDebitCashAssetId' in settings) {
        docData.defaultDebitCashAssetId =
          settings.defaultDebitCashAssetId !== undefined
            ? settings.defaultDebitCashAssetId
            : deleteField();
      }
      if ('defaultCreditCashAssetId' in settings) {
        docData.defaultCreditCashAssetId =
          settings.defaultCreditCashAssetId !== undefined
            ? settings.defaultCreditCashAssetId
            : deleteField();
      }
      if (settings.stampDutyEnabled !== undefined) {
        docData.stampDutyEnabled = settings.stampDutyEnabled;
      }
      if (settings.stampDutyRate !== undefined) {
        docData.stampDutyRate = settings.stampDutyRate;
      }
      if (settings.checkingAccountSubCategory !== undefined) {
        docData.checkingAccountSubCategory = settings.checkingAccountSubCategory;
      }
      if (settings.cashflowHistoryStartYear !== undefined) {
        docData.cashflowHistoryStartYear = settings.cashflowHistoryStartYear;
      }
      if (settings.laborIncomeCategoryIds !== undefined) {
        docData.laborIncomeCategoryIds = settings.laborIncomeCategoryIds;
      }
      if (settings.assistantResponseStyle !== undefined) {
        docData.assistantResponseStyle = settings.assistantResponseStyle;
      }
      if (settings.assistantMacroContextEnabled !== undefined) {
        docData.assistantMacroContextEnabled = settings.assistantMacroContextEnabled;
      }
      if (settings.assistantMemoryEnabled !== undefined) {
        docData.assistantMemoryEnabled = settings.assistantMemoryEnabled;
      }
      if (settings.costCentersEnabled !== undefined) {
        docData.costCentersEnabled = settings.costCentersEnabled;
      }
      if (settings.expenseSplitEnabled !== undefined) {
        docData.expenseSplitEnabled = settings.expenseSplitEnabled;
      }
      if (settings.spendingRolesEnabled !== undefined) {
        docData.spendingRolesEnabled = settings.spendingRolesEnabled;
      }
      if (settings.monthlyEmailEnabled !== undefined) {
        docData.monthlyEmailEnabled = settings.monthlyEmailEnabled;
      }
      if (settings.quarterlyEmailEnabled !== undefined) {
        docData.quarterlyEmailEnabled = settings.quarterlyEmailEnabled;
      }
      if (settings.semiAnnualEmailEnabled !== undefined) {
        docData.semiAnnualEmailEnabled = settings.semiAnnualEmailEnabled;
      }
      if (settings.yearlyEmailEnabled !== undefined) {
        docData.yearlyEmailEnabled = settings.yearlyEmailEnabled;
      }
      if (settings.weeklyBudgetEmailEnabled !== undefined) {
        docData.weeklyBudgetEmailEnabled = settings.weeklyBudgetEmailEnabled;
      }
      if (settings.monthlyEmailRecipients !== undefined) {
        docData.monthlyEmailRecipients = settings.monthlyEmailRecipients;
      }
      if (settings.familyMembers !== undefined) {
        docData.familyMembers = serializeFamilyMembers(settings.familyMembers);
      }
      if (settings.performanceIncludesPensionFunds !== undefined) {
        docData.performanceIncludesPensionFunds = settings.performanceIncludesPensionFunds;
      }
      if (settings.performanceIncludesExcludedAssets !== undefined) {
        docData.performanceIncludesExcludedAssets = settings.performanceIncludesExcludedAssets;
      }
      if (settings.performanceExcludesCash !== undefined) {
        docData.performanceExcludesCash = settings.performanceExcludesCash;
      }
      // Clearable, and this branch merges — omitting the key would leave the old month in place,
      // so an explicit deleteField() is required (same as the default cash accounts above).
      if ('pensionReturnStartMonth' in settings) {
        docData.pensionReturnStartMonth =
          settings.pensionReturnStartMonth !== undefined
            ? settings.pensionReturnStartMonth
            : deleteField();
      }
      // Same shape as pensionReturnStartMonth above — this branch merges, so omitting the key
      // would leave a stale idealAllocation in place; an explicit deleteField() is required.
      if ('idealAllocation' in settings) {
        docData.idealAllocation =
          settings.idealAllocation !== undefined
            ? serializeIdealAllocation(settings.idealAllocation)
            : deleteField();
      }

      // Same shape as idealAllocation above — this branch merges, so omitting the key would leave a
      // stale monteCarloMarket in place; an explicit deleteField() is required.
      if ('monteCarloMarket' in settings) {
        docData.monteCarloMarket =
          settings.monteCarloMarket !== undefined ? settings.monteCarloMarket : deleteField();
      }

      // Use merge: true to preserve existing fields
      await setDoc(targetRef, docData, { merge: true });
    }

    if (settingsAffectDashboardOverview(settings)) {
      await invalidateDashboardOverviewSummary(userId, 'overview_settings_updated');
    }
  } catch (error) {
    console.error('Error setting allocation settings:', error);
    // Re-throw original error to preserve Firebase error codes (e.g., permission-denied)
    // This allows retry logic in AuthContext to detect and handle permission errors
    throw error;
  }
}

/**
 * Calculate current allocation from assets
 *
 * Handles both simple assets and composite assets (e.g., mixed pension funds).
 * For composite assets, distributes value across multiple asset classes based
 * on the composition percentages.
 *
 * @param assets - All user assets
 * @returns Allocation breakdown by asset class, sub-category, and total value
 */
export function calculateCurrentAllocation(assets: Asset[]): {
  byAssetClass: { [assetClass: string]: number };
  bySubCategory: { [subCategory: string]: number };
  totalValue: number;
} {
  const totalValue = calculateTotalValue(assets);

  if (totalValue === 0) {
    return {
      byAssetClass: {},
      bySubCategory: {},
      totalValue: 0,
    };
  }

  const byAssetClass: { [assetClass: string]: number } = {};
  const bySubCategory: { [subCategory: string]: number } = {};

  assets.forEach((asset) => {
    const value = calculateAssetValue(asset);

    // For composite assets, distribute value across multiple asset classes
    if (asset.composition && asset.composition.length > 0) {
      asset.composition.forEach((comp) => {
        const compValue = (value * comp.percentage) / 100;

        // Aggregate by asset class
        if (!byAssetClass[comp.assetClass]) {
          byAssetClass[comp.assetClass] = 0;
        }
        byAssetClass[comp.assetClass] += compValue;

        // Aggregate by sub-category if present in composition
        // Each component can have its own specific sub-category
        // Use composite key "assetClass:subCategory" to avoid collisions
        if (comp.subCategory) {
          const subCategoryKey = `${comp.assetClass}:${comp.subCategory}`;
          if (!bySubCategory[subCategoryKey]) {
            bySubCategory[subCategoryKey] = 0;
          }
          bySubCategory[subCategoryKey] += compValue;
        }
      });
    } else {
      // Simple asset (no composition) - standard aggregation

      // Aggregate by asset class
      if (!byAssetClass[asset.assetClass]) {
        byAssetClass[asset.assetClass] = 0;
      }
      byAssetClass[asset.assetClass] += value;

      // Aggregate by sub-category if present
      // Use composite key "assetClass:subCategory" to avoid collisions
      if (asset.subCategory) {
        const subCategoryKey = `${asset.assetClass}:${asset.subCategory}`;
        if (!bySubCategory[subCategoryKey]) {
          bySubCategory[subCategoryKey] = 0;
        }
        bySubCategory[subCategoryKey] += value;
      }
    }
  });

  return {
    byAssetClass,
    bySubCategory,
    totalValue,
  };
}


/**
 * Calculate equity percentage based on age and risk-free rate
 * Formula: 125 - age - (riskFreeRate * 5)
 */
export function calculateEquityPercentage(
  userAge: number,
  riskFreeRate: number
): number {
  const percentage = 125 - userAge - (riskFreeRate * 5);
  // Ensure percentage is between 0 and 100
  return Math.max(0, Math.min(100, percentage));
}

/**
 * Add a new subcategory to an asset class
 *
 * The subcategory is initialized with 0% target allocation.
 * This allows users to create custom sub-categories beyond the defaults.
 *
 * @param userId - The user ID
 * @param assetClass - The asset class to add the subcategory to
 * @param subCategoryName - Name of the new subcategory
 */
export async function addSubCategory(
  userId: string,
  assetClass: string,
  subCategoryName: string
): Promise<void> {
  try {
    // Load current settings
    const settings = await getSettings(userId);

    if (!settings) {
      throw new Error('Settings not found. Please configure allocation targets first.');
    }

    // Verify that the asset class exists
    if (!settings.targets[assetClass]) {
      throw new Error(`Asset class ${assetClass} not found in targets`);
    }

    // Initialize subCategoryConfig if it doesn't exist
    if (!settings.targets[assetClass].subCategoryConfig) {
      settings.targets[assetClass].subCategoryConfig = {
        enabled: true,
        categories: [],
      };
    }

    // Initialize subTargets if it doesn't exist
    if (!settings.targets[assetClass].subTargets) {
      settings.targets[assetClass].subTargets = {};
    }

    // Verify that the subcategory doesn't already exist
    const existingCategories = settings.targets[assetClass].subCategoryConfig!.categories;
    if (existingCategories.includes(subCategoryName)) {
      throw new Error(`Subcategory ${subCategoryName} already exists in ${assetClass}`);
    }

    // Add the new subcategory
    settings.targets[assetClass].subCategoryConfig!.categories.push(subCategoryName);
    settings.targets[assetClass].subCategoryConfig!.enabled = true;

    // Initialize target to 0%
    settings.targets[assetClass].subTargets![subCategoryName] = 0;

    // Save updated settings
    await setSettings(userId, settings);
  } catch (error) {
    console.error('Error adding subcategory:', error);
    throw error;
  }
}

// Pure comparison and target resolution live in lib/utils/allocationComparison.ts (SDK-free, read
// by the server-side periodic email too); re-exported so this module's importers are unchanged.
export {
  compareAllocations,
  deriveTargetLeverageRatio,
  buildTargetsFromGoalAllocation,
  getDefaultTargets,
  resolveEffectiveTargets,
} from '@/lib/utils/allocationComparison';
