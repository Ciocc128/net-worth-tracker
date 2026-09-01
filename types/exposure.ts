/**
 * Types for the Esposizione tile's five look-through views (Titoli · Settori · Geografia ·
 * Valuta · Emittenti). Rewritten 2026-09 to carry five dimensions instead of three and a real
 * `coverage` breakdown — see `lib/utils/exposureEngine.ts` for the formula and
 * `docs/` / AGENTS.md → *Allocazione — Esposizione* for the two measurement rules
 * (notional for Titoli/Settori/Geografia, market value for Valuta/Emittenti; the base is the
 * `allocationRole` portfolio, not the whole patrimonio).
 */
import type { AssetClass } from './assets';

export type ExposureDimension = 'holdings' | 'sectors' | 'geography' | 'currency' | 'issuers';

/** The two legs a curated/Yahoo profile can describe — the only two `AssetClass` values with a
 *  meaningful security-level look-through in this app (a fund's equity sleeve, a fund's bond
 *  sleeve). Every other class (commodity, trendFollowing, carry, crypto, realestate, cash) is
 *  `nonApplicabile` by construction — see `NON_LOOKTHROUGH_ASSET_CLASSES` in exposureEngine.ts. */
export type ExposureLegClass = 'equity' | 'bonds';

/** One weighted slice of a leg — a holding, a sector, or a country. `weight` is 0..1 of THAT LEG
 *  (already normalised: a fund's stock weights are divided by `stockPosition`, its sector
 *  weights are not — see exposureEngine.ts's doc comment on why). */
export interface ExposureLegSlice {
  key: string;
  label: string;
  weight: number;
}

/** Curated or Yahoo-sourced data for one leg (equity or bonds) of one instrument. */
export interface ExposureLegProfile {
  holdings?: ExposureLegSlice[]; // only meaningful on an equity leg
  sectors?: ExposureLegSlice[]; // only meaningful on an equity leg
  countries?: ExposureLegSlice[]; // meaningful on both legs (a bond sleeve has a country mix too)
}

/**
 * The fully-resolved, runtime profile of ONE instrument (keyed by `asset.ticker`), ready for the
 * pure engine. Built by `lib/server/exposure/profileResolver.ts` from the curated
 * `lib/constants/instrumentProfiles.ts` tables cascaded with Yahoo Finance — the engine itself
 * never touches either source, so it stays pure and independently testable.
 */
export interface InstrumentProfile {
  ticker: string;
  asOf?: string; // ISO date of the OLDEST curated fact this profile relies on
  sourceUrl?: string;
  /** Display name for the Emittenti view; absent → `nonLetta` for that instrument. */
  issuer?: string;
  /** Whole-instrument currency mix (weight 0..1 of the instrument's MARKET value, never
   *  leg-scaled — leverage does not multiply a currency exposure, see exposureEngine.ts).
   *  Absent → `nonLetta` for that instrument in the Valuta view. */
  currencies?: Array<{ code: string; weight: number }>;
  /** Equity/bonds leg data, keyed by the leg's OWN assetClass (from `expandAssetExposure`). */
  legs?: Partial<Record<ExposureLegClass, ExposureLegProfile>>;
}

/** One instrument's contribution to one entry of one view — what the Esposizione tile's
 *  drill-down block renders under an opened row. */
export interface ExposureRowSource {
  assetName: string;
  ticker: string;
  contributionEur: number;
  /** The slice's weight inside the source leg/instrument (0..1), when known. */
  weight?: number;
  /** The source leg's notional (Titoli/Settori/Geografia) or the instrument's market value
   *  (Valuta/Emittenti) that `weight` was applied to. */
  baseValueEur?: number;
}

/** One ranked entry of a view (a company, a sector, a country, a currency, an issuer). */
export interface ExposureEntry {
  key: string;
  label: string;
  exposureEur: number;
  /** Share of the VIEW's base (0..1) — not of the whole portfolio: Titoli/Settori/Geografia's
   *  base is a notional sub-total, Valuta/Emittenti's is the allocatable market value. */
  exposurePct: number;
  sources: ExposureRowSource[];
}

/** Names of the instruments in one coverage bucket — what the tile's coverage line lists. */
export interface ExposureCoverageBucket {
  amountEur: number;
  /** Asset names, de-duplicated, in a stable (largest-first) order. */
  instruments: string[];
}

/**
 * The three distinct destinies a slice of the view's base can have — never conflated:
 *  - `read`: a profile supplied real weights for it.
 *  - `notApplicable`: the underlying leg's asset class has NO security-level look-through BY
 *    NATURE (gold, managed futures, carry — see `NON_LOOKTHROUGH_ASSET_CLASSES`). Declaring this
 *    is honest; folding it into `unread` would suggest a profile could someday fix it.
 *  - `unread`: the leg/instrument IS in scope for this view but no profile (curated or Yahoo)
 *    supplied data for it yet.
 */
export interface ExposureCoverage {
  baseEur: number;
  read: ExposureCoverageBucket;
  notApplicable: ExposureCoverageBucket;
  unread: ExposureCoverageBucket;
}

export interface ExposureViewData {
  entries: ExposureEntry[]; // every entry, sorted desc by exposureEur — the UI slices/limits
  coverage: ExposureCoverage;
}

/** Full computed result returned by `/api/portfolio/exposure` and consumed by
 *  `lib/utils/allocazioneSummary.ts`'s `summarizeExposure`. */
export interface PortfolioExposureData {
  holdings: ExposureViewData; // notional, equity legs only
  sectors: ExposureViewData; // notional, equity legs only
  geography: ExposureViewData; // notional, equity + bonds legs
  currency: ExposureViewData; // market value, every allocatable asset
  issuers: ExposureViewData; // market value, every allocatable asset
  /** Market value of every `tradable`/`frozen` asset — the Valuta/Emittenti base. */
  allocatableMarketValueEur: number;
  /** The distinct `asset.currency` (QUOTATION, not exposure) values among the base assets — lets
   *  the tile contrast "every instrument quotes in EUR" against the Valuta view's real exposure
   *  mix without re-deriving it from the assets client-side. `['EUR']` on this portfolio. */
  quotationCurrencies: string[];
  /** Count of `tradable`/`frozen` assets with quantity > 0 — the base this whole payload measures. */
  allocatableAssets: number;
  /** Count of ALL active assets, `excluded` included — for a footer line, never a denominator. */
  totalAssets: number;
  computedAt: string;
  cacheKey: string;
  /** The oldest `asOf` among every curated profile actually used this computation, or null when
   *  every instrument in scope resolved from Yahoo alone (no curated fact aged at all). */
  oldestProfileAsOf: string | null;
}

export interface PortfolioExposureResponse {
  exposure: PortfolioExposureData;
  cached: boolean;
}

/** Re-exported for callers that still need to reason about which classes a leg can carry. */
export type { AssetClass };
