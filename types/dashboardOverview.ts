import { PieChartData } from '@/types/assets';

export interface DashboardOverviewSparklinePoint {
  month: number;
  year: number;
  totalNetWorth: number;
}

interface DashboardOverviewVariation {
  value: number;
  percentage: number;
}

// Single category amount used in the cashflow breakdown (top-5 spese/entrate per categoria).
export interface DashboardOverviewCategoryAmount {
  // Display label; carries a type qualifier when two same-named categories collide.
  category: string;
  // Category document id (name-fallback for legacy rows) — the row's identity.
  // Optional only because payloads cached before source version 5 lack it.
  categoryKey?: string;
  amount: number;
  // Percentage of the total expenses (or total income) for the current month.
  percentage: number;
}

// Compact asset summary used in the "N Asset in Portafoglio" overview card.
export interface DashboardOverviewTopAsset {
  id: string;
  name: string;
  // Raw AssetType value ('stock' | 'etf' | 'bond' | ...) — mapped to Italian labels in UI.
  assetType: string;
  // Raw AssetClass value ('equity' | 'bonds' | ...) — used to derive the icon color.
  assetClass: string;
  totalValue: number;
  portfolioPercent: number;
  // Null when the asset has no cost basis (cash, imported positions).
  returnPercent: number | null;
}

// One instrument's share of the annual management cost (value × TER), largest first
// (see rankCostDrivers in lib/utils/dashboardOverviewUtils.ts).
export interface DashboardOverviewCostDriver {
  id: string;
  name: string;
  totalExpenseRatio: number;
  annualCost: number;
}

// One asset class whose MARKET PRICE moved the portfolio this month, most-significant
// first — the user's own buys and sells are excluded by construction
// (see computeTopMovers in lib/utils/dashboardOverviewUtils.ts).
export interface DashboardOverviewMover {
  assetClass: string;
  label: string;
  delta: number;
}

// The single most relevant in-progress Goal-Based Investing goal, surfaced on the
// companion card footer (see pickFeaturedGoalProgress in lib/utils/dashboardOverviewUtils.ts).
export interface DashboardOverviewGoalProgress {
  goalId: string;
  goalName: string;
  goalColor: string;
  currentValue: number;
  targetAmount: number;
  progressPercentage: number;
}

export interface DashboardOverviewExpenseStats {
  currentMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  previousMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  delta: {
    income: number;
    expenses: number;
    net: number;
  };
  // Top-5 expense categories for the current month, sorted by amount desc.
  topExpenseCategories: DashboardOverviewCategoryAmount[];
  // Top-5 income categories for the current month, sorted by amount desc.
  topIncomeCategories: DashboardOverviewCategoryAmount[];
}

export interface DashboardOverviewPayload {
  metrics: {
    totalValue: number;
    liquidNetWorth: number;
    illiquidNetWorth: number;
    // Liquid sub-breakdown for the redesigned Liquid card.
    cashNetWorth: number;              // assets where assetClass === 'cash'
    liquidInvestmentsNetWorth: number; // liquid assets that are not cash
    netTotal: number;
    liquidNetTotal: number;
    unrealizedGains: number;
    estimatedTaxes: number;
    liquidEstimatedTaxes: number;
    portfolioTER: number;
    annualPortfolioCost: number;
    annualStampDuty: number;
  };
  variations: {
    monthly: DashboardOverviewVariation | null;
    yearly: DashboardOverviewVariation | null;
  };
  expenseStats: DashboardOverviewExpenseStats | null;
  charts: {
    assetClassData: PieChartData[];
    assetData: PieChartData[];
    liquidityData: PieChartData[];
  };
  flags: {
    assetCount: number;
    hasCostBasisTracking: boolean;
    hasTERTracking: boolean;
    hasStampDuty: boolean;
    currentMonthSnapshotExists: boolean;
  };
  freshness: {
    source: 'materialized_summary' | 'live_recompute';
    updatedAt: string;
    computedAt: string;
    sourceVersion: number;
    stale: boolean;
  };
  // Top assets sorted by totalValue desc (up to 15 active assets) for the
  // portfolio list card. Optional so old cached docs degrade gracefully.
  topAssets?: DashboardOverviewTopAsset[];
  // Last 3 historical snapshots for the hero sparkline — optional so old cached
  // docs degrade gracefully (no sparkline shown until next recompute).
  sparklineData?: DashboardOverviewSparklinePoint[];
  // All-time-high check for the "Nuovo massimo storico" chip next to the hero
  // variation chips. Optional so old cached docs degrade gracefully (no badge
  // until next recompute). previousAllTimeHigh is null when there's no prior
  // snapshot to compare against (first-ever snapshot).
  ath?: {
    previousAllTimeHigh: number | null;
    isNewATH: boolean;
  };
  // Every asset class whose market price moved this month vs the previous snapshot,
  // largest effect first — the "Mercato:" digest under the hero sparkline. Optional so
  // old cached docs degrade gracefully (line simply doesn't render).
  topMovers?: DashboardOverviewMover[];
  // Portfolio-wide market (price) effect this month — the part of the monthly change
  // that is return rather than the user's own flows. null = not attributable (no prior
  // snapshot, or one without a per-asset breakdown), distinct from a measured 0.
  // Optional so old cached docs degrade gracefully.
  marketEffect?: number | null;
  // Single most relevant in-progress goal (Goal-Based Investing), only present
  // when the user has the feature enabled and at least one goal in progress.
  goalProgress?: DashboardOverviewGoalProgress | null;
  // Every in-progress goal in featured order (head = goalProgress) — the Obiettivi tile
  // shows the first few. Optional so old cached docs degrade to the single goal.
  goalProgressList?: DashboardOverviewGoalProgress[];
  // Held instruments with a TER, by annual cost — the Costi tile names the top few.
  // Optional so old cached docs degrade gracefully.
  costDrivers?: DashboardOverviewCostDriver[];
}
