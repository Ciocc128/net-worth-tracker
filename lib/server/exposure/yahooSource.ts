/**
 * yahooSource — the ONE place that talks to Yahoo Finance for the Esposizione tile. Extracted
 * from the pre-2026-09 `portfolioExposureService.ts` (which did this fetch + the aggregation in
 * one file); now it only fetches and normalises, `profileResolver.ts` decides what to do with the
 * result.
 *
 * Two normalisation rules, MEASURED on this portfolio's own data (see the plan), not assumed:
 *  - A fund's STOCK weights (`topHoldings.holdings[].holdingPercent`) are a % of the whole FUND,
 *    so they are divided by `stockPosition` to become a % of the equity SLEEVE — on NTSG, NVDA's
 *    raw 4.57% is really 5.04% of the equity sleeve (`stockPosition: 0.9064`). Skipping this on a
 *    fund that is 91% equity barely matters; skipping it on a fund whose equity sleeve is a
 *    MINORITY of the fund (a bond-heavy or multi-asset ETF) would understate every single name.
 *  - A fund's SECTOR weights (`topHoldings.sectorWeightings`) are ALREADY normalised to the equity
 *    sleeve — Yahoo returns them summing to ~1 on their own. Dividing them again would double the
 *    error `stockPosition` was there to fix.
 */
import YahooFinance from 'yahoo-finance2';
import type { ExposureLegSlice } from '@/types/exposure';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** Italian labels for Yahoo Finance's sector keys — both `topHoldings.sectorWeightings`
 *  (camelCase-ish snake keys) and `assetProfile.sector` (Title Case, mapped below first). */
const SECTOR_LABELS: Record<string, string> = {
  technology: 'Tecnologia',
  healthcare: 'Salute',
  financial_services: 'Finanza',
  consumer_cyclical: 'Beni Voluttuari',
  consumer_defensive: 'Beni di Prima Necessità',
  industrials: 'Industriali',
  communication_services: 'Comunicazione',
  energy: 'Energia',
  basic_materials: 'Materiali di Base',
  utilities: 'Utilities',
  realestate: 'Immobiliare',
};

/** Maps `assetProfile.sector` strings (Title Case, individual stocks) to the internal sector keys
 *  `topHoldings.sectorWeightings` already uses (camelCase-ish snake), so a stock's sector merges
 *  into the same bucket as an ETF's sector exposure to that industry. */
const ASSET_PROFILE_SECTOR_TO_KEY: Record<string, string> = {
  Technology: 'technology',
  Healthcare: 'healthcare',
  'Financial Services': 'financial_services',
  'Consumer Cyclical': 'consumer_cyclical',
  'Consumer Defensive': 'consumer_defensive',
  Industrials: 'industrials',
  'Communication Services': 'communication_services',
  Energy: 'energy',
  'Basic Materials': 'basic_materials',
  Utilities: 'utilities',
  'Real Estate': 'realestate',
};

/** `assetProfile.country` (English country names) → ISO 3166-1 alpha-2, so a stock's country
 *  merges into the same bucket a curated `INDEX_PROFILES` country would use. Covers the countries
 *  this app's own holdings + the common index-profile countries are likely to name; an unmapped
 *  name falls back to itself (still renders correctly, just won't merge with an ISO-keyed row —
 *  see the country/currency merge note in `profileResolver.ts`). */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'United States': 'US',
  Italy: 'IT',
  Germany: 'DE',
  France: 'FR',
  'United Kingdom': 'GB',
  Japan: 'JP',
  China: 'CN',
  Switzerland: 'CH',
  Netherlands: 'NL',
  Spain: 'ES',
  Canada: 'CA',
  Ireland: 'IE',
  Sweden: 'SE',
  Luxembourg: 'LU',
  Belgium: 'BE',
  Denmark: 'DK',
  Norway: 'NO',
  Australia: 'AU',
  India: 'IN',
  Brazil: 'BR',
  'South Korea': 'KR',
  Taiwan: 'TW',
  'Hong Kong': 'HK',
  Singapore: 'SG',
  Israel: 'IL',
  Finland: 'FI',
  Austria: 'AT',
  Portugal: 'PT',
};

export function sectorLabel(key: string): string {
  return SECTOR_LABELS[key] ?? key;
}

export interface YahooFundData {
  /** Undefined when Yahoo has nothing for this ticker (unknown symbol, or a fund with no
   *  disclosed constituents) — the caller reads that as `nonLetta`, never as an empty portfolio. */
  holdings: ExposureLegSlice[] | undefined;
  sectors: ExposureLegSlice[] | undefined;
  /** `fundProfile.family`, raw — the curated table's `issuer` override is applied by the caller. */
  issuerFamily: string | null;
}

/** Fetches `topHoldings` + `fundProfile` for one (possibly aliased) ETF ticker. Never throws — a
 *  failed/unknown ticker resolves to an all-undefined result, same shape as "nothing published". */
export async function fetchYahooFundData(yahooTicker: string): Promise<YahooFundData> {
  try {
    const summary = await yahooFinance.quoteSummary(yahooTicker, { modules: ['topHoldings', 'fundProfile'] });
    const topHoldings = summary.topHoldings as
      | { stockPosition?: number; holdings?: Array<{ symbol: string; holdingName: string; holdingPercent: number }>; sectorWeightings?: Array<Record<string, number>> }
      | null
      | undefined;

    const stockPosition =
      typeof topHoldings?.stockPosition === 'number' && topHoldings.stockPosition > 0 ? topHoldings.stockPosition : null;

    const rawHoldings = topHoldings?.holdings ?? [];
    const holdings: ExposureLegSlice[] | undefined =
      rawHoldings.length > 0
        ? rawHoldings
            .filter((h) => !!h.symbol && typeof h.holdingPercent === 'number' && h.holdingPercent > 0)
            .map((h) => ({
              key: h.symbol.toUpperCase(),
              label: h.holdingName || h.symbol,
              // Normalise to the EQUITY SLEEVE, not the whole fund — see this file's doc comment.
              weight: stockPosition ? h.holdingPercent / stockPosition : h.holdingPercent,
            }))
        : undefined;

    const rawSectors = topHoldings?.sectorWeightings ?? [];
    const sectors: ExposureLegSlice[] | undefined =
      rawSectors.length > 0
        ? rawSectors
            .flatMap((obj) => Object.entries(obj))
            .filter(([, weight]) => typeof weight === 'number' && weight > 0)
            // Deliberately NOT divided by stockPosition — Yahoo's sector weights are already
            // normalised to the equity sleeve (measured on NTSG: they sum to ~1 on their own).
            .map(([key, weight]) => ({ key, label: sectorLabel(key), weight }))
        : undefined;

    const issuerFamily = (summary.fundProfile as { family?: string | null } | null)?.family ?? null;

    return {
      holdings: holdings && holdings.length > 0 ? holdings : undefined,
      sectors: sectors && sectors.length > 0 ? sectors : undefined,
      issuerFamily,
    };
  } catch {
    return { holdings: undefined, sectors: undefined, issuerFamily: null };
  }
}

export interface YahooStockData {
  /** weight is always 1 — a direct stock IS 100% of its own sector/country. */
  sector: ExposureLegSlice | undefined;
  country: { code: string; label: string; weight: number } | undefined;
}

/** Fetches `assetProfile` (sector + country) for one direct-stock ticker. Never throws. */
export async function fetchYahooStockData(ticker: string): Promise<YahooStockData> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile'] });
    const profile = summary.assetProfile as { sector?: string; country?: string } | null;

    const sectorKey = profile?.sector ? ASSET_PROFILE_SECTOR_TO_KEY[profile.sector] : undefined;
    const sector: ExposureLegSlice | undefined = sectorKey ? { key: sectorKey, label: sectorLabel(sectorKey), weight: 1 } : undefined;

    const countryName = profile?.country;
    const country: YahooStockData['country'] = countryName
      ? { code: COUNTRY_NAME_TO_CODE[countryName] ?? countryName, label: countryName, weight: 1 }
      : undefined;

    return { sector, country };
  } catch {
    return { sector: undefined, country: undefined };
  }
}

export { COUNTRY_NAME_TO_CODE };
