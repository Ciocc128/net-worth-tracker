/**
 * Asset display helpers.
 *
 * The single source of truth for turning an asset's machine `ticker` into the label the user
 * actually sees. `ticker` is kept in Yahoo Finance format ("CL2.MI") so automatic price retrieval
 * works, but that format is noisy to read; the user can set an optional `displayTicker` alias
 * ("CL2") that every UI surface shows instead. Assets without a ticker at all (cash, realestate,
 * pensionFund — the form hides ticker/alias for these types) fall back to `name` as a last resort,
 * so charts and lists never show a blank label. Keep this the ONLY place that resolves the
 * fallback, so the choice stays consistent across Patrimonio, Allocazione, charts, dividends, etc.
 */

/** The minimal shape needed to resolve a display ticker — anything carrying ticker + alias. */
export interface DisplayTickerSource {
  ticker: string;
  displayTicker?: string | null;
  /** Human name, used as last-resort label for tickerless assets (cash/realestate/pensionFund). */
  name?: string;
}

/**
 * The user-facing label for an instrument: its alias when set, otherwise the raw ticker,
 * otherwise the asset name. A blank/whitespace-only alias or ticker falls through to the next
 * step; if name is also missing/blank, returns the raw ticker (empty string) — no invented placeholder.
 */
export function getAssetDisplayTicker(asset: DisplayTickerSource): string {
  const alias = asset.displayTicker?.trim();
  if (alias) return alias;
  const ticker = asset.ticker?.trim();
  if (ticker) return ticker;
  return asset.name?.trim() ?? asset.ticker;
}
