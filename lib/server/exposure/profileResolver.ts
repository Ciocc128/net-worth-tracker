/**
 * profileResolver — builds the `Map<ticker, InstrumentProfile>` the pure `exposureEngine.ts`
 * consumes. This is where the two sources cascade, per instrument:
 *
 *   1. the curated table (`lib/constants/instrumentProfiles.ts`) — ALWAYS wins: a ticker alias,
 *      an `indexId`, a `kind`, an issuer/currency override;
 *   2. Yahoo Finance (`yahooSource.ts`) — holdings + sectors for a fund's equity leg,
 *      `assetProfile.sector`/`.country` for a direct stock, `fundProfile.family` for the issuer;
 *   3. neither → the field stays undefined, and `exposureEngine.ts` buckets it as `nonLetta`
 *      (never silently zero, never a guess).
 *
 * `resolveCurrency`'s own precedence (the one place all four rules live, so the tile can trust
 * there's no second currency-derivation path anywhere else):
 *   hedgedTo (none of this portfolio's instruments are hedged, so this precedes but is currently
 *   always empty) → the curated `currencies` override → `asset.currency` for a stock/cash
 *   instrument (a company's OWN currency always beats a country guess — BSP is domiciled in Italy
 *   but trades in USD on Nasdaq, so this step precedes country-derivation, not the reverse) →
 *   derived from the resolved EQUITY leg's `countries` (via `COUNTRY_TO_CURRENCY`) → 100% USD by
 *   convention for a `kind` instrument (gold, managed futures, carry — none publish a currency mix
 *   with any continuity; see the plan's "Limiti che restano"). Nothing left → `nonLetta`.
 */
import type { Asset, AssetClass } from '@/types/assets';
import type { ExposureLegClass, ExposureLegProfile, ExposureLegSlice, InstrumentProfile } from '@/types/exposure';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { INSTRUMENT_PROFILES, INDEX_PROFILES, type CuratedInstrumentEntry } from '@/lib/constants/instrumentProfiles';
import { fetchYahooFundData, fetchYahooStockData } from './yahooSource';
import { resolveIssuer } from './issuerResolver';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const INSTRUMENT_PROFILE_CACHE_COLLECTION = 'instrument-profile-cache';
/** 30 days — a fund's holdings/sectors/issuer change slowly; the Yahoo calls this cache absorbs
 *  are the bulk of the Esposizione tile's cost once the per-user 24h exposure-cache also misses. */
const INSTRUMENT_PROFILE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const LEG_CLASSES: ReadonlySet<AssetClass> = new Set(['equity', 'bonds']);

/** ISO country code → its currency — used ONLY to derive a currency mix from a resolved country
 *  mix (precedence step 3). Deliberately small: it only needs to cover a country that some
 *  `INDEX_PROFILES` entry or a stock's `assetProfile.country` actually names. A country missing
 *  here simply drops out of the derived currency mix rather than crashing — its weight is lost,
 *  not invented (a known, minor approximation, same spirit as the plan's other declared gaps). */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'USD',
  IT: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  GB: 'GBP',
  JP: 'JPY',
  CN: 'CNY',
  CH: 'CHF',
  NL: 'EUR',
  ES: 'EUR',
  CA: 'CAD',
  IE: 'EUR',
  SE: 'SEK',
  LU: 'EUR',
  BE: 'EUR',
  DK: 'DKK',
  NO: 'NOK',
  AU: 'AUD',
  IN: 'INR',
  BR: 'BRL',
  KR: 'KRW',
  TW: 'TWD',
  HK: 'HKD',
  SG: 'SGD',
  IL: 'ILS',
  FI: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
};

const USD_CONVENTION_KINDS: ReadonlySet<string> = new Set(['commodity', 'trendFollowing', 'carry']);

/** The leg asset classes THIS asset actually produces, per `expandAssetExposure` — the ONE source
 *  of which legs exist; the curated table never invents a leg the asset itself doesn't have. */
function declaredLegClasses(asset: Asset): ExposureLegClass[] {
  const classes = new Set(expandAssetExposure(asset).map((leg) => leg.assetClass as AssetClass));
  return (['equity', 'bonds'] as const).filter((c) => classes.has(c) && LEG_CLASSES.has(c));
}

function deriveCurrencyFromCountries(countries: ExposureLegSlice[] | undefined): Array<{ code: string; weight: number }> | undefined {
  if (!countries || countries.length === 0) return undefined;
  const byCurrency = new Map<string, number>();
  for (const country of countries) {
    const currency = COUNTRY_TO_CURRENCY[country.key];
    if (!currency) continue; // dropped, not invented — see COUNTRY_TO_CURRENCY's doc comment
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + country.weight);
  }
  if (byCurrency.size === 0) return undefined;
  return Array.from(byCurrency.entries()).map(([code, weight]) => ({ code, weight }));
}

function resolveCurrency(
  asset: Asset,
  curated: CuratedInstrumentEntry | undefined,
  equityCountries: ExposureLegSlice[] | undefined
): Array<{ code: string; weight: number }> | undefined {
  if (curated?.currencies) return curated.currencies;
  // A stock/cash instrument's OWN currency always wins over a country-derived guess — a company's
  // domicile is not where its shares trade. BSP is Italian (assetProfile.country: "Italy") but
  // trades, settles and pays dividends in USD on Nasdaq; deriving EUR from its country would be
  // wrong for an instrument that already tells us its currency directly. This is a deliberate
  // reordering of the plan's prose precedence (which lists "derivata dai countries" before
  // "asset.currency per azioni e liquidità"): the plan's own BSP row says the same thing
  // ("valuta USD dall'asset") — country-derivation is for FUNDS, which have no currency of their
  // own to ask, never for a stock/cash instrument that does.
  if (asset.type === 'stock' || asset.type === 'cash') return [{ code: asset.currency, weight: 1 }];
  const derived = deriveCurrencyFromCountries(equityCountries);
  if (derived) return derived;
  if (curated?.kind && USD_CONVENTION_KINDS.has(curated.kind)) return [{ code: 'USD', weight: 1 }];
  return undefined;
}

interface ResolvedAsOf {
  asOf: string | undefined;
  sourceUrl: string | undefined;
}

/** Prefers the curated INSTRUMENT entry's own `asOf`/`sourceUrl`; falls back to the referenced
 *  INDEX profile's when the instrument entry has none of its own but leans on the index for data
 *  actually used (geography). Never invents one when nothing was actually used. */
function resolveAsOf(curated: CuratedInstrumentEntry | undefined, indexProfileUsed: boolean): ResolvedAsOf {
  if (curated?.asOf) return { asOf: curated.asOf, sourceUrl: curated.sourceUrl };
  if (indexProfileUsed && curated?.indexId) {
    const indexProfile = INDEX_PROFILES[curated.indexId];
    if (indexProfile?.asOf) return { asOf: indexProfile.asOf, sourceUrl: indexProfile.sourceUrl };
  }
  return { asOf: undefined, sourceUrl: undefined };
}

async function resolveOneInstrument(asset: Asset): Promise<InstrumentProfile> {
  const curated = INSTRUMENT_PROFILES[asset.ticker];
  const legClasses = declaredLegClasses(asset);

  let holdings: ExposureLegSlice[] | undefined;
  let sectors: ExposureLegSlice[] | undefined;
  let issuerFamily: string | null = null;
  let stockCountry: ExposureLegSlice | undefined;

  if (asset.type === 'stock') {
    const stockData = await fetchYahooStockData(asset.ticker);
    holdings = [{ key: asset.ticker.toUpperCase(), label: asset.name, weight: 1 }];
    sectors = stockData.sector ? [stockData.sector] : undefined;
    stockCountry = stockData.country
      ? { key: stockData.country.code, label: stockData.country.label, weight: stockData.country.weight }
      : undefined;
  } else if (legClasses.length > 0) {
    // Only fetch topHoldings/fundProfile for instruments with an equity/bonds leg to look through
    // — a pure `kind` instrument (gold, managed futures, carry) has nothing Yahoo could answer.
    const yahooTicker = curated?.yahooExposureTicker ?? asset.ticker;
    const fundData = await fetchYahooFundData(yahooTicker);
    holdings = fundData.holdings;
    sectors = curated?.ignoreYahooSectors ? undefined : fundData.sectors;
    issuerFamily = fundData.issuerFamily;
  } else if (curated?.kind) {
    // A pure kind instrument still has an issuer (WisdomTree, iShares, ...) — fetch fundProfile
    // alone via its own ticker (cheap, no topHoldings needed).
    const fundData = await fetchYahooFundData(asset.ticker);
    issuerFamily = fundData.issuerFamily;
  }

  const legs: Partial<Record<ExposureLegClass, ExposureLegProfile>> = {};
  let usedIndexProfile = false;

  for (const legClass of legClasses) {
    const indexId = curated?.legIndexIds?.[legClass] ?? (legClass === 'equity' ? curated?.indexId : undefined);
    const indexProfile = indexId ? INDEX_PROFILES[indexId] : undefined;
    const indexCountries: ExposureLegSlice[] | undefined = indexProfile?.countries?.map((c) => ({
      key: c.code,
      label: c.label,
      weight: c.weight,
    }));
    const countries = indexCountries ?? (legClass === 'equity' && stockCountry ? [stockCountry] : undefined);
    if (countries && countries.length > 0) usedIndexProfile = usedIndexProfile || !!indexProfile;

    const legProfile: ExposureLegProfile = {};
    if (legClass === 'equity') {
      if (holdings && holdings.length > 0) legProfile.holdings = holdings;
      if (sectors && sectors.length > 0) legProfile.sectors = sectors;
    }
    if (countries && countries.length > 0) legProfile.countries = countries;

    if (Object.keys(legProfile).length > 0) legs[legClass] = legProfile;
  }

  const equityCountries = legs.equity?.countries;
  const currencies = resolveCurrency(asset, curated, equityCountries);
  const issuer = resolveIssuer(asset, issuerFamily, curated?.issuer);
  const { asOf, sourceUrl } = resolveAsOf(curated, usedIndexProfile);

  return {
    ticker: asset.ticker,
    asOf,
    sourceUrl,
    issuer: issuer ?? undefined,
    currencies,
    legs: Object.keys(legs).length > 0 ? legs : undefined,
  };
}

function hasUsableData(profile: InstrumentProfile): boolean {
  return !!(profile.issuer || (profile.currencies && profile.currencies.length > 0) || profile.legs);
}

interface CachedProfile {
  profile: InstrumentProfile;
  cachedAtMs: number;
}

async function readCachedProfile(ticker: string): Promise<CachedProfile | null> {
  try {
    const snap = await adminDb.collection(INSTRUMENT_PROFILE_CACHE_COLLECTION).doc(ticker).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data?.profile || !data.cachedAt) return null;
    return { profile: data.profile as InstrumentProfile, cachedAtMs: (data.cachedAt as Timestamp).toMillis() };
  } catch {
    return null; // a cache-read failure must never block resolution — fall through to Yahoo
  }
}

function writeCachedProfileFireAndForget(ticker: string, profile: InstrumentProfile): void {
  adminDb
    .collection(INSTRUMENT_PROFILE_CACHE_COLLECTION)
    .doc(ticker)
    .set({ cachedAt: Timestamp.now(), profile })
    .catch((err: unknown) => {
      console.error('[exposure] Failed to write instrument-profile-cache for', ticker, err);
    });
}

/**
 * Resolves ONE instrument's profile through the 30-day `instrument-profile-cache/{ticker}`:
 * fresh cache → served as-is, no Yahoo call. Stale or missing → resolved fresh; a USABLE fresh
 * result is cached and returned. An UNUSABLE fresh result (Yahoo outage, a renamed/delisted
 * ticker) falls back to the last good cached profile, however stale, rather than serving a false
 * `nonLetta` for an instrument that was covered yesterday — the tile's `oldestProfileAsOf` still
 * surfaces how old that fallback is.
 */
async function resolveWithCache(asset: Asset): Promise<InstrumentProfile> {
  const cached = await readCachedProfile(asset.ticker);
  if (cached && Date.now() - cached.cachedAtMs < INSTRUMENT_PROFILE_CACHE_TTL_MS) {
    return cached.profile;
  }

  const fresh = await resolveOneInstrument(asset);
  if (hasUsableData(fresh)) {
    writeCachedProfileFireAndForget(asset.ticker, fresh);
    return fresh;
  }
  return cached?.profile ?? fresh;
}

/**
 * Resolves an `InstrumentProfile` for every DISTINCT ticker among the `tradable`/`frozen` assets
 * (the same base `exposureEngine.ts` uses) — `excluded` assets and duplicate tickers never reach
 * Yahoo. Every instrument resolves in parallel; a single instrument's Yahoo failure never blocks
 * another's, and each goes through its own 30-day cache independently.
 */
export async function resolveInstrumentProfiles(assets: Asset[]): Promise<Map<string, InstrumentProfile>> {
  const baseAssets = assets.filter((a) => {
    if (a.quantity <= 0) return false;
    const role = resolveAllocationRole(a);
    return role === 'tradable' || role === 'frozen';
  });

  const uniqueByTicker = new Map<string, Asset>();
  for (const asset of baseAssets) {
    if (!uniqueByTicker.has(asset.ticker)) uniqueByTicker.set(asset.ticker, asset);
  }

  const entries = await Promise.all(
    Array.from(uniqueByTicker.values()).map(async (asset) => [asset.ticker, await resolveWithCache(asset)] as const)
  );

  return new Map(entries);
}
