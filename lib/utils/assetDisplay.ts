/**
 * Asset display helpers.
 *
 * The single source of truth for turning an asset's machine `ticker` into the label the user
 * actually sees. `ticker` is kept in Yahoo Finance format ("CL2.MI") so automatic price retrieval
 * works, but that format is noisy to read; the user can set an optional `displayTicker` alias
 * ("CL2") that every UI surface shows instead. Keep this the ONLY place that resolves the
 * fallback, so the choice stays consistent across Patrimonio, Allocazione, charts, dividends, etc.
 */

/** The minimal shape needed to resolve a display ticker — anything carrying ticker + alias. */
export interface DisplayTickerSource {
  ticker: string;
  displayTicker?: string | null;
}

/**
 * The user-facing label for an instrument: its alias when set, otherwise the raw ticker.
 * A blank/whitespace-only alias falls back to the ticker.
 */
export function getAssetDisplayTicker(asset: DisplayTickerSource): string {
  const alias = asset.displayTicker?.trim();
  return alias && alias.length > 0 ? alias : asset.ticker;
}
