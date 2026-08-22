export const DASHBOARD_OVERVIEW_SUMMARY_COLLECTION = 'dashboardOverviewSummaries';
// Bumped from 1→2: sparklineData expanded from slice(-11) to slice(-40)
// to support 3A and All period selectors in the hero card.
// Bumped from 2→3: cashNetWorth/liquidInvestmentsNetWorth/liquidEstimatedTaxes added to
// metrics; topAssets array added; topExpenseCategories/topIncomeCategories added to
// expenseStats — all needed for the Panoramica redesign (liquid card, asset list, cashflow).
// Bumped from 3→4: ath (all-time-high check), topMovers (monthly asset-class digest), and
// goalProgress (featured Goal-Based Investing progress) added — all needed for the
// Panoramica critique follow-up (2026-07-16).
// Bumped from 4→5: top categories keyed by category id instead of name — two same-named
// categories are now two rows (with a type qualifier on collision), no longer one merged one.
// Bumped from 5→6: topMovers now measures the MARKET price effect per class (quantity held at
// the start × unit-value change), no longer the raw class value delta that mixed in the
// user's own buys and sells; marketEffect (the portfolio-wide total) added alongside it.
// Bumped from 6→7: goalProgressList (every in-progress goal, featured order) added; pension funds
// and real estate measured differently in topMovers/marketEffect.
// Bumped from 7→8: costDrivers (held instruments by annual TER cost) added for the Costi tile.
export const DASHBOARD_OVERVIEW_SOURCE_VERSION = 8;
export const DASHBOARD_OVERVIEW_SUMMARY_TTL_MS = 5 * 60 * 1000;
