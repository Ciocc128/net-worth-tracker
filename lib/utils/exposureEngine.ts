/**
 * exposureEngine — the ONE formula behind the Esposizione tile's five views (Titoli · Settori ·
 * Geografia · Valuta · Emittenti). Pure and I/O-free: it takes the assets the caller already
 * fetched and a `Map<ticker, InstrumentProfile>` the caller already resolved (Yahoo Finance +
 * the curated tables, see `lib/server/exposure/profileResolver.ts`) and does nothing but the
 * arithmetic — so it is fully deterministic and testable against a fixture.
 *
 *   esposizione[dimensione][chiave] = Σ_asset Σ_gamba ( valoreGamba × profilo[dimensione][chiave] )
 *
 * ── Two questions kept apart ──────────────────────────────────────────────────────────────────
 * (A) How much NOTIONAL does an asset put in each class? `expandAssetExposure` (assetExposureUtils.ts)
 *     answers this deterministically — NTSG's 60/40 mix × its 1.5× leverage → 0.9 MV equity + 0.6 MV
 *     bonds, no external source involved.
 * (B) What SHAPE does that notional have inside? An `InstrumentProfile`, resolved upstream. All the
 *     fragility of an external source sits behind that one interface; this module never touches it.
 *
 * ── The base is the ALLOCAZIONE portfolio, not the patrimonio ────────────────────────────────
 * Every view's denominator is `tradable` + `frozen` assets (`resolveAllocationRole`) — `excluded`
 * assets (cash accounts, the home you live in, a locked pension fund the user chose to freeze OUT
 * of the page) sit outside every one of the five views, Emittenti included: we are inside the
 * Allocazione page, and «portfolio» here is what `allocationRole` calls that.
 *
 * ── Three views measure notional, two measure market value ───────────────────────────────────
 * Titoli, Settori and Geografia answer "how much does the underlying move me" — leverage multiplies
 * that, so they run on NOTIONAL (`expandAssetExposure`'s `notionalValue`). Valuta and Emittenti
 * answer "where does my CAPITAL sit" — leverage does NOT multiply a currency or a counterparty
 * exposure (CL2 converts USD→EUR exactly once at NAV regardless of its 2× equity multiplier; a
 * Bund future gives German duration without ever buying a euro, because the notional is unfunded).
 * Both run on MARKET value. Getting this backwards would double WisdomTree's counted exposure to
 * itself and invent tens of thousands of euros of EUR/GBP/JPY exposure inside NTSG that isn't there.
 *
 * ── Normalisation: measured, not assumed ──────────────────────────────────────────────────────
 * On a fund like NTSG, Yahoo's STOCK weights are a % of the whole FUND (so they must be divided by
 * `stockPosition` to become a % of the equity sleeve — NVDA's raw 4.57% is really 5.04% of NTSG's
 * equity slice), while its SECTOR weights already sum to 1 on their own (they are pre-normalised to
 * the equity sleeve). The `ExposureLegSlice.weight` this engine consumes is ALWAYS already a share
 * of its own leg — that division, where it applies, happened upstream in `yahooSource.ts`. Getting
 * it backwards on NTSG alone would misprice 46% of the portfolio.
 *
 * ── Three distinct destinies for a leg, never conflated ───────────────────────────────────────
 * `read` (a profile answered), `notApplicable` (the leg's class has NO security-level look-through
 * BY NATURE — gold, managed futures, carry: `NON_LOOKTHROUGH_ASSET_CLASSES`), `unread` (the leg IS
 * in scope but no profile — curated or Yahoo — supplied data for it yet). Titoli/Settori only ever
 * see `equity` legs; a `bonds` leg (or any non-look-through leg) is simply outside those two views'
 * universe — not `notApplicable`, not counted at all — Geografia is the one view where `bonds` legs
 * enter the base.
 */
import type { Asset, AssetClass } from '@/types/assets';
import { expandAssetExposure, type ExposureComponent } from './assetExposureUtils';
import { resolveAllocationRole } from './allocationUtils';
import type {
  ExposureCoverage,
  ExposureCoverageBucket,
  ExposureEntry,
  ExposureLegClass,
  ExposureLegProfile,
  ExposureRowSource,
  ExposureViewData,
  InstrumentProfile,
  PortfolioExposureData,
} from '@/types/exposure';

/** The two legs with a meaningful security-level look-through in this app. */
const LOOKTHROUGH_LEG_CLASSES: ReadonlySet<AssetClass> = new Set(['equity', 'bonds']);

/**
 * Asset classes that structurally CANNOT have a Titoli/Settori/Geografia look-through, whatever
 * the source: managed futures roll contracts, physical gold has no "sectors", a commodity-carry
 * strategy is long/short baskets with no equity content. Declaring these `notApplicabile` is
 * honest; leaving them `nonLetta` would suggest a future profile could someday fix it.
 */
const NON_LOOKTHROUGH_ASSET_CLASSES: ReadonlySet<AssetClass> = new Set([
  'commodity',
  'trendFollowing',
  'carry',
  'crypto',
  'realestate',
  'cash',
]);

/** Italian display labels for ISO 4217 currency codes actually seen in this portfolio's profiles. */
const CURRENCY_LABELS: Record<string, string> = {
  USD: 'Dollaro USA',
  EUR: 'Euro',
  GBP: 'Sterlina',
  JPY: 'Yen',
  CHF: 'Franco Svizzero',
  CAD: 'Dollaro Canadese',
  AUD: 'Dollaro Australiano',
  HKD: 'Dollaro di Hong Kong',
  SEK: 'Corona Svedese',
  KRW: 'Won Sudcoreano',
  TWD: 'Dollaro Taiwanese',
  INR: 'Rupia Indiana',
  CNY: 'Renminbi Cinese',
  BRL: 'Real Brasiliano',
};

function currencyLabel(code: string): string {
  return CURRENCY_LABELS[code] ?? code;
}

// ── Generic weighted accumulator ──────────────────────────────────────────────────────────────

interface EntryAccumulator {
  label: string;
  total: number;
  sources: ExposureRowSource[];
}

interface BucketAccumulator {
  amount: number;
  // instrument name -> its contribution, so the bucket can list largest-first
  byInstrument: Map<string, number>;
}

function newBucket(): BucketAccumulator {
  return { amount: 0, byInstrument: new Map() };
}

function addToBucket(bucket: BucketAccumulator, instrumentName: string, amount: number): void {
  bucket.amount += amount;
  bucket.byInstrument.set(instrumentName, (bucket.byInstrument.get(instrumentName) ?? 0) + amount);
}

function finalizeBucket(bucket: BucketAccumulator): ExposureCoverageBucket {
  const instruments = Array.from(bucket.byInstrument.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  return { amountEur: bucket.amount, instruments };
}

interface ViewAccumulator {
  entries: Map<string, EntryAccumulator>;
  base: number;
  read: BucketAccumulator;
  notApplicable: BucketAccumulator;
  unread: BucketAccumulator;
}

function newView(): ViewAccumulator {
  return { entries: new Map(), base: 0, read: newBucket(), notApplicable: newBucket(), unread: newBucket() };
}

function addEntry(
  view: ViewAccumulator,
  key: string,
  label: string,
  amount: number,
  source: ExposureRowSource
): void {
  const existing = view.entries.get(key);
  if (existing) {
    existing.total += amount;
    existing.sources.push(source);
  } else {
    view.entries.set(key, { label, total: amount, sources: [source] });
  }
}

function finalizeView(view: ViewAccumulator): ExposureViewData {
  const entries: ExposureEntry[] = Array.from(view.entries.entries())
    .map(([key, { label, total, sources }]) => ({
      key,
      label,
      exposureEur: total,
      exposurePct: view.base > 0 ? total / view.base : 0,
      sources,
    }))
    .sort((a, b) => b.exposureEur - a.exposureEur);

  const coverage: ExposureCoverage = {
    baseEur: view.base,
    read: finalizeBucket(view.read),
    notApplicable: finalizeBucket(view.notApplicable),
    unread: finalizeBucket(view.unread),
  };

  return { entries, coverage };
}

// ── Per-asset working data ────────────────────────────────────────────────────────────────────

interface BaseAsset {
  asset: Asset;
  legs: ExposureComponent[];
  profile: InstrumentProfile | undefined;
  marketValueEur: number;
}

function resolveProfileKey(asset: Asset): string {
  return asset.ticker;
}

function buildBaseAssets(assets: Asset[], profiles: Map<string, InstrumentProfile>): BaseAsset[] {
  return assets
    .filter((a) => a.quantity > 0)
    .filter((a) => {
      const role = resolveAllocationRole(a);
      return role === 'tradable' || role === 'frozen';
    })
    .map((asset) => {
      const legs = expandAssetExposure(asset);
      const marketValueEur = legs.reduce((sum, leg) => sum + leg.marketValue, 0);
      return { asset, legs, profile: profiles.get(resolveProfileKey(asset)), marketValueEur };
    });
}

// ── Titoli / Settori (equity legs only, notional) ─────────────────────────────────────────────

function accumulateEquityLegView(
  baseAssets: BaseAsset[],
  extractSlices: (legProfile: ExposureLegProfile | undefined) => ExposureLegSliceLike[] | undefined
): ExposureViewData {
  const view = newView();

  for (const { asset, legs, profile } of baseAssets) {
    for (const leg of legs) {
      if (leg.assetClass === 'equity') {
        view.base += leg.notionalValue;
        const legProfile = profile?.legs?.equity;
        const slices = extractSlices(legProfile);
        if (slices && slices.length > 0) {
          addToBucket(view.read, asset.name, leg.notionalValue);
          for (const slice of slices) {
            const contribution = slice.weight * leg.notionalValue;
            addEntry(view, slice.key, slice.label, contribution, {
              assetName: asset.name,
              ticker: asset.ticker,
              contributionEur: contribution,
              weight: slice.weight,
              baseValueEur: leg.notionalValue,
            });
          }
        } else {
          addToBucket(view.unread, asset.name, leg.notionalValue);
        }
      } else if (NON_LOOKTHROUGH_ASSET_CLASSES.has(leg.assetClass as AssetClass)) {
        addToBucket(view.notApplicable, asset.name, leg.notionalValue);
      }
      // bonds (and any other look-through-capable-but-irrelevant leg) is simply outside the
      // Titoli/Settori universe: not base, not notApplicable, not unread.
    }
  }

  return finalizeView(view);
}

interface ExposureLegSliceLike {
  key: string;
  label: string;
  weight: number;
}

// ── Geografia (equity + bonds legs, notional) ─────────────────────────────────────────────────

function accumulateGeographyView(baseAssets: BaseAsset[]): ExposureViewData {
  const view = newView();

  for (const { asset, legs, profile } of baseAssets) {
    for (const leg of legs) {
      if (leg.assetClass === 'equity' || leg.assetClass === 'bonds') {
        view.base += leg.notionalValue;
        const legProfile = profile?.legs?.[leg.assetClass as ExposureLegClass];
        const countries = legProfile?.countries;
        if (countries && countries.length > 0) {
          addToBucket(view.read, asset.name, leg.notionalValue);
          for (const country of countries) {
            const contribution = country.weight * leg.notionalValue;
            addEntry(view, country.key, country.label, contribution, {
              assetName: asset.name,
              ticker: asset.ticker,
              contributionEur: contribution,
              weight: country.weight,
              baseValueEur: leg.notionalValue,
            });
          }
        } else {
          addToBucket(view.unread, asset.name, leg.notionalValue);
        }
      } else if (NON_LOOKTHROUGH_ASSET_CLASSES.has(leg.assetClass as AssetClass)) {
        addToBucket(view.notApplicable, asset.name, leg.notionalValue);
      }
    }
  }

  return finalizeView(view);
}

// ── Valuta / Emittenti (every allocatable asset, once, market value) ─────────────────────────

function accumulateCurrencyView(baseAssets: BaseAsset[]): ExposureViewData {
  const view = newView();

  for (const { asset, profile, marketValueEur } of baseAssets) {
    view.base += marketValueEur;
    const currencies = profile?.currencies;
    if (currencies && currencies.length > 0) {
      addToBucket(view.read, asset.name, marketValueEur);
      for (const currency of currencies) {
        const contribution = currency.weight * marketValueEur;
        addEntry(view, currency.code, currencyLabel(currency.code), contribution, {
          assetName: asset.name,
          ticker: asset.ticker,
          contributionEur: contribution,
          weight: currency.weight,
          baseValueEur: marketValueEur,
        });
      }
    } else {
      addToBucket(view.unread, asset.name, marketValueEur);
    }
  }

  return finalizeView(view);
}

function accumulateIssuerView(baseAssets: BaseAsset[]): ExposureViewData {
  const view = newView();

  for (const { asset, profile, marketValueEur } of baseAssets) {
    view.base += marketValueEur;
    const issuer = profile?.issuer;
    if (issuer) {
      addToBucket(view.read, asset.name, marketValueEur);
      addEntry(view, issuer, issuer, marketValueEur, {
        assetName: asset.name,
        ticker: asset.ticker,
        contributionEur: marketValueEur,
        weight: 1,
        baseValueEur: marketValueEur,
      });
    } else {
      addToBucket(view.unread, asset.name, marketValueEur);
    }
  }

  return finalizeView(view);
}

// ── oldestProfileAsOf ──────────────────────────────────────────────────────────────────────────

function resolveOldestAsOf(baseAssets: BaseAsset[]): string | null {
  let oldest: string | null = null;
  for (const { profile } of baseAssets) {
    const asOf = profile?.asOf;
    if (!asOf) continue;
    if (oldest === null || asOf < oldest) oldest = asOf;
  }
  return oldest;
}

// ── Entry point ────────────────────────────────────────────────────────────────────────────────

export function computeExposure(
  assets: Asset[],
  profiles: Map<string, InstrumentProfile>,
  computedAt: string,
  cacheKey: string
): PortfolioExposureData {
  const baseAssets = buildBaseAssets(assets, profiles);

  const holdings = accumulateEquityLegView(baseAssets, (legProfile) => legProfile?.holdings);
  const sectors = accumulateEquityLegView(baseAssets, (legProfile) => legProfile?.sectors);
  const geography = accumulateGeographyView(baseAssets);
  const currency = accumulateCurrencyView(baseAssets);
  const issuers = accumulateIssuerView(baseAssets);

  const allocatableMarketValueEur = baseAssets.reduce((sum, b) => sum + b.marketValueEur, 0);
  const totalAssets = assets.filter((a) => a.quantity > 0).length;

  return {
    holdings,
    sectors,
    geography,
    currency,
    issuers,
    allocatableMarketValueEur,
    allocatableAssets: baseAssets.length,
    totalAssets,
    computedAt,
    cacheKey,
    oldestProfileAsOf: resolveOldestAsOf(baseAssets),
  };
}

export { NON_LOOKTHROUGH_ASSET_CLASSES, LOOKTHROUGH_LEG_CLASSES };
