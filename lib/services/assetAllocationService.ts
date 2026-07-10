import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { Asset, AssetClass, AssetAllocationTarget, AssetAllocationSettings, AllocationResult, SubCategoryTarget, SpecificAssetAllocation, AllocationData, CurrentAllocationSnapshot, AllocationBasisSnapshot, AllocationBasis } from '@/types/assets';
import { calculateAssetValue, calculateTotalValue } from './assetService';
import { DEFAULT_SUB_CATEGORIES } from '@/lib/constants/defaultSubCategories';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';

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

/**
 * Get allocation settings for a user
 *
 * Includes: targets, userAge, riskFreeRate, withdrawalRate, plannedAnnualExpenses,
 * coastFireRetirementAge, coastFirePensions, coastFireTaxBrackets,
 * includePrimaryResidenceInFIRE, dividendIncomeCategoryId, dividendIncomeSubCategoryId
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
      dividendIncomeCategoryId: data.dividendIncomeCategoryId,
      dividendIncomeSubCategoryId: data.dividendIncomeSubCategoryId,
      fireProjectionScenarios: data.fireProjectionScenarios,
      monteCarloScenarios: data.monteCarloScenarios,
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
      monthlyEmailEnabled: data.monthlyEmailEnabled,
      quarterlyEmailEnabled: data.quarterlyEmailEnabled,
      semiAnnualEmailEnabled: data.semiAnnualEmailEnabled,
      yearlyEmailEnabled: data.yearlyEmailEnabled,
      weeklyBudgetEmailEnabled: data.weeklyBudgetEmailEnabled,
      monthlyEmailRecipients: data.monthlyEmailRecipients,
      targetLeverageRatio: data.targetLeverageRatio,
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
      const docData: any = {
        ...existingData, // Keep all existing fields
        userId,
        targets: settings.targets, // COMPLETELY REPLACE targets (not merge)
        updatedAt: new Date(),
      };

      // Override with new values for defined fields
      if (settings.userAge !== undefined) {
        docData.userAge = settings.userAge;
      }
      if (settings.riskFreeRate !== undefined) {
        docData.riskFreeRate = settings.riskFreeRate;
      }
      if (settings.withdrawalRate !== undefined) {
        docData.withdrawalRate = settings.withdrawalRate;
      }
      if (settings.plannedAnnualExpenses !== undefined) {
        docData.plannedAnnualExpenses = settings.plannedAnnualExpenses;
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
      if (settings.dividendIncomeCategoryId !== undefined) {
        docData.dividendIncomeCategoryId = settings.dividendIncomeCategoryId;
      }
      if (settings.dividendIncomeSubCategoryId !== undefined) {
        docData.dividendIncomeSubCategoryId = settings.dividendIncomeSubCategoryId;
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
      if (settings.targetLeverageRatio !== undefined) {
        docData.targetLeverageRatio = settings.targetLeverageRatio;
      }

      // Use setDoc WITHOUT merge to completely replace targets
      await setDoc(targetRef, docData);
    } else {
      // No targets update, use normal merge behavior
      const docData: any = {
        userId,
        updatedAt: new Date(),
      };

      if (settings.userAge !== undefined) {
        docData.userAge = settings.userAge;
      }
      if (settings.riskFreeRate !== undefined) {
        docData.riskFreeRate = settings.riskFreeRate;
      }
      if (settings.withdrawalRate !== undefined) {
        docData.withdrawalRate = settings.withdrawalRate;
      }
      if (settings.plannedAnnualExpenses !== undefined) {
        docData.plannedAnnualExpenses = settings.plannedAnnualExpenses;
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
      if (settings.dividendIncomeCategoryId !== undefined) {
        docData.dividendIncomeCategoryId = settings.dividendIncomeCategoryId;
      }
      if (settings.dividendIncomeSubCategoryId !== undefined) {
        docData.dividendIncomeSubCategoryId = settings.dividendIncomeSubCategoryId;
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
      if (settings.targetLeverageRatio !== undefined) {
        docData.targetLeverageRatio = settings.targetLeverageRatio;
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
 * Set allocation targets for a user (legacy function for backward compatibility)
 */
export async function setTargets(
  userId: string,
  targets: AssetAllocationTarget
): Promise<void> {
  await setSettings(userId, { targets });
}

/**
 * Calculate current allocation from assets
 *
 * Handles both simple assets and composite assets (e.g., mixed pension funds or leveraged ETF).
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
    const exposureComponents = expandAssetExposure(asset);

    exposureComponents.forEach((comp) => {
      const exposureValue = comp.notionalValue ?? comp.marketValue;

      // Aggregate by asset class
      if (!byAssetClass[comp.assetClass]) {
        byAssetClass[comp.assetClass] = 0;
      }
      byAssetClass[comp.assetClass] += exposureValue;

      // Aggregate by sub-category if present in composition
      // Each component can have its own specific sub-category
      // Use composite key "assetClass:subCategory" to avoid collisions
      if (comp.subCategory) {
        const subCategoryKey = `${comp.assetClass}:${comp.subCategory}`;
        if (!bySubCategory[subCategoryKey]) {
          bySubCategory[subCategoryKey] = 0;
        }
        bySubCategory[subCategoryKey] += exposureValue;
      }
    });
  });

  return {
    byAssetClass,
    bySubCategory,
    totalValue,
  };
}

export function calculateCurrentAllocationSnapshot(
  assets: Asset[],
  assetClasses: AssetClass[]
): CurrentAllocationSnapshot {
  const createAssetClassMap = (): Record<string, number> =>
    assetClasses.reduce<Record<string, number>>((acc, assetClass) => {
      acc[assetClass] = 0;
      return acc;
    }, {});

  const marketByAssetClass = createAssetClassMap();
  const notionalByAssetClass = createAssetClassMap();

  const marketBySubCategory: Record<string, Record<string, number>> = {};
  const notionalBySubCategory: Record<string, Record<string, number>> = {};

  const marketBySpecificAsset: Record<string, Record<string, number>> = {};
  const notionalBySpecificAsset: Record<string, Record<string, number>> = {};

  let totalMarketValue = 0;
  let totalNotionalValue = 0;

  const ensureNestedBucket = (
    container: Record<string, Record<string, number>>,
    parentKey: string
  ): Record<string, number> => {
    if (!container[parentKey]) {
      container[parentKey] = {};
    }
    return container[parentKey];
  };

  const addToBucket = (
    bucket: Record<string, number>,
    key: string | undefined,
    value: number
  ) => {
    if (!key) return;
    bucket[key] = (bucket[key] ?? 0) + value;
  };

  for (const asset of assets) {
    const components = expandAssetExposure(asset);
    const specificAssetKey = asset.id || asset.name;

    for (const component of components) {
      const marketValue = component.marketValue ?? 0;
      const notionalValue = component.notionalValue ?? marketValue;
      const assetClass = component.assetClass;
      const subCategory = component.subCategory?.trim();

      totalMarketValue += marketValue;
      totalNotionalValue += notionalValue;

      addToBucket(marketByAssetClass, assetClass, marketValue);
      addToBucket(notionalByAssetClass, assetClass, notionalValue);

      if (subCategory) {
        addToBucket(
          ensureNestedBucket(marketBySubCategory, assetClass),
          subCategory,
          marketValue
        );
        addToBucket(
          ensureNestedBucket(notionalBySubCategory, assetClass),
          subCategory,
          notionalValue
        );
      }

      if (specificAssetKey) {
        addToBucket(
          ensureNestedBucket(marketBySpecificAsset, assetClass),
          specificAssetKey,
          marketValue
        );
        addToBucket(
          ensureNestedBucket(notionalBySpecificAsset, assetClass),
          specificAssetKey,
          notionalValue
        );
      }
    }
  }

  const buildBasisSnapshot = (
    totalValue: number,
    byAssetClass: Record<string, number>,
    bySubCategory: Record<string, Record<string, number>>,
    bySpecificAsset: Record<string, Record<string, number>>
  ): AllocationBasisSnapshot => ({
    totalValue,
    byAssetClass,
    bySubCategory,
    bySpecificAsset,
  });

  const leverageRatio =
    totalMarketValue > 0 ? totalNotionalValue / totalMarketValue : 1;

  const hasLeveragedExposure =
    totalMarketValue > 0 && Math.abs(totalNotionalValue - totalMarketValue) > 0.01;

  return {
    market: buildBasisSnapshot(
      totalMarketValue,
      marketByAssetClass,
      marketBySubCategory,
      marketBySpecificAsset
    ),
    notional: buildBasisSnapshot(
      totalNotionalValue,
      notionalByAssetClass,
      notionalBySubCategory,
      notionalBySpecificAsset
    ),
    metadata: {
      marketValue: totalMarketValue,
      notionalValue: totalNotionalValue,
      leverageRatio,
      hasLeveragedExposure,
    },
  };
}

/** Shared ±2 p.p. threshold that decides COMPRA/VENDI/OK everywhere in this file. */
function classifyAction(difference: number): AllocationData['action'] {
  if (difference > 2) return 'VENDI';
  if (difference < -2) return 'COMPRA';
  return 'OK';
}

/**
 * Turn a `CurrentAllocationSnapshot` into the legacy `AllocationResult` shape (current
 * vs. target, per asset class / sub-category / specific asset), computed self-consistently
 * on ONE chosen basis — every percentage is relative to that basis's own total, so they
 * always sum to 100% even when leveraged ETFs inflate notional exposure beyond market value.
 *
 * `assets` is only needed for the specific-asset level, which (like the pre-migration
 * `compareAllocations`) matches by ticker/name via `findMatchingAssets` and sums plain
 * `calculateAssetValue` — specific-asset targets are individual stocks, not composite/
 * leveraged instruments, so market value is an adequate proxy there.
 */
export function toLegacyAllocationResult(
  snapshot: CurrentAllocationSnapshot,
  basis: AllocationBasis,
  targets: AssetAllocationTarget | null,
  assets: Asset[]
): AllocationResult {
  const source = basis === 'market' ? snapshot.market : snapshot.notional;

  if (!targets || source.totalValue === 0) {
    return {
      byAssetClass: {},
      bySubCategory: {},
      bySpecificAsset: {},
      totalValue: source.totalValue,
    };
  }

  // Check if cash is using fixed amount
  const cashTarget = targets['cash'];
  const useCashFixedAmount = cashTarget?.useFixedAmount || false;
  const cashFixedAmount = useCashFixedAmount ? (cashTarget?.fixedAmount || 0) : 0;

  // Calculate remaining value (total - fixed cash) — the base on which other asset
  // classes' percentages are applied.
  const remainingValue = useCashFixedAmount
    ? Math.max(0, source.totalValue - cashFixedAmount)
    : source.totalValue;

  const byAssetClass: AllocationResult['byAssetClass'] = {};
  const bySubCategory: AllocationResult['bySubCategory'] = {};
  const bySpecificAsset: AllocationResult['bySpecificAsset'] = {};

  Object.keys(targets).forEach((assetClass) => {
    const targetData = targets[assetClass];
    const currentValue = source.byAssetClass[assetClass] || 0;
    const currentPercentage = source.totalValue > 0 ? (currentValue / source.totalValue) * 100 : 0;

    let targetValue: number;
    let targetPercentage: number;

    // Special handling for cash if using fixed amount
    if (assetClass === 'cash' && targetData.useFixedAmount) {
      targetValue = targetData.fixedAmount || 0;
      targetPercentage = source.totalValue > 0 ? (targetValue / source.totalValue) * 100 : 0;
    } else {
      const baseValue = useCashFixedAmount ? remainingValue : source.totalValue;
      targetValue = (baseValue * targetData.targetPercentage) / 100;
      targetPercentage = source.totalValue > 0
        ? (targetValue / source.totalValue) * 100
        : targetData.targetPercentage;
    }

    const difference = currentPercentage - targetPercentage;
    const differenceValue = currentValue - targetValue;

    byAssetClass[assetClass] = {
      currentPercentage,
      currentValue,
      targetPercentage,
      targetValue,
      difference,
      differenceValue,
      action: classifyAction(difference),
    };

    // Compare sub-categories if they exist
    if (targetData.subTargets) {
      const assetClassCurrentTotal = currentValue;
      const assetClassTargetTotal = targetValue;
      const subCurrentValues = source.bySubCategory[assetClass] ?? {};

      Object.keys(targetData.subTargets).forEach((subCategory) => {
        const subTargetData = targetData.subTargets![subCategory];

        // Support both old format (number) and new format (SubCategoryTarget)
        const subTargetPercentage = typeof subTargetData === 'number'
          ? subTargetData
          : subTargetData.targetPercentage;

        // Use composite key "assetClass:subCategory" to avoid collisions
        const subCategoryKey = `${assetClass}:${subCategory}`;
        const subCurrentValue = subCurrentValues[subCategory] || 0;

        // Sub-category percentage is relative to its asset class current value
        const subCurrentPercentage =
          assetClassCurrentTotal > 0 ? (subCurrentValue / assetClassCurrentTotal) * 100 : 0;

        // Target value is percentage of the asset class target value
        const subTargetValue = (assetClassTargetTotal * subTargetPercentage) / 100;
        const subDifference = subCurrentPercentage - subTargetPercentage;
        const subDifferenceValue = subCurrentValue - subTargetValue;

        bySubCategory[subCategoryKey] = {
          currentPercentage: subCurrentPercentage,
          currentValue: subCurrentValue,
          targetPercentage: subTargetPercentage,
          targetValue: subTargetValue,
          difference: subDifference,
          differenceValue: subDifferenceValue,
          action: classifyAction(subDifference),
        };

        // Compare specific assets if enabled
        if (typeof subTargetData === 'object' && subTargetData.specificAssetsEnabled && subTargetData.specificAssets) {
          subTargetData.specificAssets.forEach((specificAsset) => {
            // Use composite key "assetClass:subCategory:assetName"
            const specificAssetKey = `${assetClass}:${subCategory}:${specificAsset.name}`;

            // Find matching assets in the portfolio and sum their (market) value
            const matchingAssets = findMatchingAssets(assets, specificAsset.name, assetClass, subCategory);
            const specificCurrentValue = matchingAssets.reduce(
              (sum, asset) => sum + calculateAssetValue(asset),
              0
            );

            // Calculate percentage relative to subcategory current value
            const specificCurrentPercentage = subCurrentValue > 0
              ? (specificCurrentValue / subCurrentValue) * 100
              : 0;

            // Target value is percentage of the subcategory target value
            const specificTargetValue = (subTargetValue * specificAsset.targetPercentage) / 100;
            const specificTargetPercentage = specificAsset.targetPercentage;
            const specificDifference = specificCurrentPercentage - specificTargetPercentage;
            const specificDifferenceValue = specificCurrentValue - specificTargetValue;

            bySpecificAsset[specificAssetKey] = {
              currentPercentage: specificCurrentPercentage,
              currentValue: specificCurrentValue,
              targetPercentage: specificTargetPercentage,
              targetValue: specificTargetValue,
              difference: specificDifference,
              differenceValue: specificDifferenceValue,
              action: classifyAction(specificDifference),
            };
          });
        }
      });
    }
  });

  return {
    byAssetClass,
    bySubCategory,
    bySpecificAsset,
    totalValue: source.totalValue,
  };
}

/**
 * Find assets that match a specific asset name/ticker
 *
 * Matching is case-insensitive and checks both ticker and name fields.
 * Only returns assets that match the specified asset class and subcategory.
 *
 * @param assets - Array of all portfolio assets
 * @param specificAssetName - Name or ticker to search for (e.g., "Enel", "AAPL")
 * @param assetClass - Asset class to filter by
 * @param subCategory - Subcategory to filter by
 * @returns Array of matching assets
 */
function findMatchingAssets(
  assets: Asset[],
  specificAssetName: string,
  assetClass: string,
  subCategory: string
): Asset[] {
  const searchTerm = specificAssetName.trim().toLowerCase();

  return assets.filter(asset => {
    // Must match asset class
    if (asset.assetClass !== assetClass) return false;

    // Must match subcategory
    if (asset.subCategory !== subCategory) return false;

    // Match on ticker or name (case-insensitive, partial match)
    const tickerMatch = asset.ticker.toLowerCase().includes(searchTerm);
    const nameMatch = asset.name.toLowerCase().includes(searchTerm);

    return tickerMatch || nameMatch;
  });
}

/** Fixed set of top-level asset classes, used to seed a `CurrentAllocationSnapshot`. */
export const ALL_ASSET_CLASSES: AssetClass[] = ['equity', 'bonds', 'crypto', 'realestate', 'cash', 'commodity', 'trendFollowing', 'carry'];

/**
 * Compare current allocation against targets and generate rebalancing actions.
 *
 * Basis: NOTIONAL (leverage-adjusted) exposure, self-consistent — current/target
 * percentages are always relative to the total notional exposure, so they sum to 100%
 * even when leveraged ETFs push notional above market value. This is the economically
 * correct basis for a risk-exposure target (a target says "I want 60% of my exposure in
 * equity", not "60% of my cash"). The € amounts this implies (`differenceValue`, and the
 * Ribilancia/Versa plans built from it) close the gap correctly as long as the trade is
 * executed through an unleveraged instrument — see `buildLeverageAwarePlan` for a version
 * that reuses the leveraged instruments already in the portfolio instead.
 */
export function compareAllocations(
  assets: Asset[],
  targets: AssetAllocationTarget | null
): AllocationResult {
  const snapshot = calculateCurrentAllocationSnapshot(assets, ALL_ASSET_CLASSES);
  return toLegacyAllocationResult(snapshot, 'notional', targets, assets);
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
 * Validate specific assets allocation
 * Returns error message if validation fails, null if valid
 */
export function validateSpecificAssets(
  specificAssets: SpecificAssetAllocation[]
): string | null {
  if (!specificAssets || specificAssets.length === 0) {
    return 'At least one specific asset is required';
  }

  // Check for empty names
  for (const asset of specificAssets) {
    if (!asset.name || asset.name.trim() === '') {
      return 'All specific assets must have a name';
    }
    if (asset.targetPercentage < 0 || asset.targetPercentage > 100) {
      return 'Specific asset percentages must be between 0 and 100';
    }
  }

  // Check for duplicate names
  const names = specificAssets.map(a => a.name.trim().toLowerCase());
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size) {
    return 'Duplicate specific asset names are not allowed';
  }

  // Check if sum equals 100%
  const sum = specificAssets.reduce((acc, asset) => acc + asset.targetPercentage, 0);
  const tolerance = 0.01; // Allow 0.01% tolerance for floating point arithmetic

  if (Math.abs(sum - 100) > tolerance) {
    return `Specific asset percentages must sum to exactly 100% (current: ${sum.toFixed(2)}%)`;
  }

  return null; // Valid
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

/**
 * Build an AssetAllocationTarget from goal-derived allocation percentages.
 *
 * Overrides targetPercentage at the asset class level with goal-derived values
 * while preserving sub-category structure (subCategoryConfig, subTargets) from
 * existing user targets. This keeps the drill-down experience intact.
 *
 * Asset classes not present in the derived allocation get 0% target.
 */
export function buildTargetsFromGoalAllocation(
  derived: Partial<Record<AssetClass, number>>,
  existingTargets?: AssetAllocationTarget | null
): AssetAllocationTarget {
  const targets: AssetAllocationTarget = {};

  for (const cls of ALL_ASSET_CLASSES) {
    const existing = existingTargets?.[cls];
    targets[cls] = {
      // Override asset class percentage with goal-derived value
      targetPercentage: derived[cls] ?? 0,
      // Preserve sub-category structure from user Settings
      ...(existing?.useFixedAmount != null && { useFixedAmount: existing.useFixedAmount }),
      ...(existing?.fixedAmount != null && { fixedAmount: existing.fixedAmount }),
      ...(existing?.subCategoryConfig && { subCategoryConfig: existing.subCategoryConfig }),
      ...(existing?.subTargets && { subTargets: existing.subTargets }),
    };
  }

  return targets;
}

/**
 * Get default allocation targets for a new user
 * Default: 60% equity, 40% bonds
 */
export function getDefaultTargets(): AssetAllocationTarget {
  return {
    equity: {
      targetPercentage: 60,
      subCategoryConfig: {
        enabled: false,
        categories: [],
      },
    },
    bonds: {
      targetPercentage: 40,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.bonds,
      },
    },
    crypto: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.crypto,
      },
    },
    realestate: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.realestate,
      },
    },
    cash: {
      targetPercentage: 0,
      useFixedAmount: false,
      fixedAmount: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.cash,
      },
    },
    commodity: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.commodity,
      },
    },
    trendFollowing: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.trendFollowing,
      },
    },
    carry: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.carry,
      },
    },
  };
}
