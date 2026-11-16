import { adminDb } from '@/lib/firebase/admin';
import {
  getMultipleQuotes,
  getQuote,
  shouldUpdatePrice,
} from '@/lib/services/yahooFinanceService';
import { getBondPriceByIsin } from '@/lib/services/borsaItalianaBondScraperService';
import { convertToEur } from '@/lib/services/currencyConversionService';
import { resolveBondPrice } from '@/lib/utils/bondPricing';
import { latestIndexationCoefficient, resolveInflationIndexation } from '@/lib/utils/couponUtils';
import { Asset, SnapshotPriceAnomaly, SnapshotPriceFailure } from '@/types/assets';
import { readInstant, SNAPSHOT_PRICE_JUMP_PCT, SNAPSHOT_PRICE_STALE_DAYS } from '@/lib/utils/snapshotDocument';

/**
 * A Borsa Italiana quote (% of par) as euro per unit for this bond: the ONE pricing rule of
 * `lib/utils/bondPricing.ts`, with the nominal per unit (1 € when unset — the quantity is then the
 * nominal in euro) and, for a BTP€i, the latest indexation coefficient the user has entered.
 * Example: 104.2 % × 1.000 € nominal = 1.042 € per lot; 93 % with no nominal = 0,93 € per unit.
 */
function bondQuoteToEurPerUnit(bond: Asset, quote: number, now: Date): number {
  const bondDetails = bond.bondDetails;
  const indexationCoefficient =
    bondDetails && resolveInflationIndexation(bondDetails) === 'euro'
      ? (latestIndexationCoefficient(bondDetails.indexationCoefficients, now) ?? undefined)
      : undefined;
  return resolveBondPrice(quote, { nominalValue: bondDetails?.nominalValue, indexationCoefficient }, true);
}

export interface PriceUpdateResult {
  updated: number;
  /** The tickers whose price was NOT written (`/api/prices/update` reads it). */
  failed: string[];
  message: string;
  /**
   * RI11 — what went wrong, per asset: `quote` (no usable quote from any source), `fx` (the price
   * was written but its euro value is stale), `write` (the Firestore update threw).
   */
  failures: SnapshotPriceFailure[];
  /** RI12 — the prices written that jumped ≥ 30% from a recent stored one. */
  anomalies: SnapshotPriceAnomaly[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * RI12 — a jump. The stored price is a baseline only when it is positive, recent (≤ 7 days) and in
 * the same currency as the new one; then `|new / old − 1| ≥ 30%` is an anomaly. The price is
 * written anyway (D-SN5): a real fall must be accepted, a unit error (×100) must be seen.
 *
 * @param asset - The stored asset (its `currentPrice`, `currency`, `lastPriceUpdate`)
 * @param price - The new price, already in the stored unit (a bond's euro per unit, a GBp quote ÷100)
 * @param currency - The new price's currency; undefined = the asset's own (a bond)
 * @param now - The instant of the update
 * @returns The anomaly, or null
 */
export function detectPriceJump(
  asset: Pick<Asset, 'id' | 'ticker' | 'currentPrice' | 'currency' | 'lastPriceUpdate'>,
  price: number,
  currency: string | undefined,
  now: Date
): SnapshotPriceAnomaly | null {
  const previousPrice = asset.currentPrice;
  if (!(typeof previousPrice === 'number' && previousPrice > 0) || !(price > 0)) return null;
  const last = readInstant(asset.lastPriceUpdate);
  if (!last || now.getTime() - last.getTime() > SNAPSHOT_PRICE_STALE_DAYS * DAY_MS) return null;
  if (currency !== undefined && (asset.currency ?? '').toUpperCase() !== currency.toUpperCase()) return null;
  const changePct = (price / previousPrice - 1) * 100;
  if (Math.abs(changePct) < SNAPSHOT_PRICE_JUMP_PCT) return null;
  return { assetId: asset.id, ticker: asset.ticker, previousPrice, price, changePct };
}

/**
 * Update prices for all assets of a user
 *
 * This is called before creating snapshots to ensure fresh market data.
 * Uses two-level filtering:
 * 1. Asset type capability (e.g., stocks/ETFs support updates; cash/real estate don't)
 * 2. User preference (autoUpdatePrice flag allows per-asset control)
 *
 * @param userId - User ID to update assets for
 * @returns Update result with count of successful and failed updates
 */
export async function updateUserAssetPrices(
  userId: string
): Promise<PriceUpdateResult> {
  try {
    // Get all assets using Firebase Admin SDK
    const assetsRef = adminDb.collection('assets');
    const snapshot = await assetsRef.where('userId', '==', userId).get();

    if (snapshot.empty) {
      return {
        updated: 0,
        failed: [],
        message: 'No assets found',
        failures: [],
        anomalies: [],
      };
    }

    const allAssets = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Asset
    );

    // Filter assets that need price updates
    // Two-level filtering ensures both capability and user intent:
    // 1. Type capability: Can this asset type be updated? (stocks: yes, cash: no)
    // 2. User preference: Does the user want auto-updates for this specific asset?
    const updatableAssets = allAssets.filter((asset) => {
      // First check if the asset type supports price updates (e.g., not cash, realestate)
      // This is type-level filtering: certain asset classes don't have market prices
      const typeSupportsUpdate = shouldUpdatePrice(asset.type, asset.subCategory);

      // Then check if the user wants automatic updates for this specific asset
      // Default to true if undefined for backwards compatibility (assets created before this flag existed)
      // This allows users to disable auto-updates for specific assets even if type supports it
      const wantsAutoUpdate = asset.autoUpdatePrice !== false;

      return typeSupportsUpdate && wantsAutoUpdate;
    });

    if (updatableAssets.length === 0) {
      return {
        updated: 0,
        failed: [],
        message: 'No assets require price updates',
        failures: [],
        anomalies: [],
      };
    }

    // Separate bonds with ISIN for Borsa Italiana scraping
    const bondsWithIsin = updatableAssets.filter(
      (asset): asset is Asset & { isin: string } =>
        asset.type === 'bond' &&
        asset.assetClass === 'bonds' &&
        typeof asset.isin === 'string' &&
        asset.isin.trim().length > 0
    );

    const otherAssets = updatableAssets.filter((asset) =>
      !(asset.type === 'bond' && asset.assetClass === 'bonds' && asset.isin)
    );

    console.log(`[Price Update] Bonds with ISIN: ${bondsWithIsin.length}`);
    console.log(`[Price Update] Other assets: ${otherAssets.length}`);

    // Track results
    const updated: string[] = [];
    const failed: string[] = [];
    const failures: SnapshotPriceFailure[] = [];
    const anomalies: SnapshotPriceAnomaly[] = [];
    const now = new Date();
    const fail = (asset: Asset, reason: SnapshotPriceFailure['reason']) => {
      if (reason !== 'fx') failed.push(asset.ticker);
      failures.push({ assetId: asset.id, ticker: asset.ticker, reason });
    };
    const noteJump = (asset: Asset, price: number, currency: string | undefined) => {
      const jump = detectPriceJump(asset, price, currency, now);
      if (jump) anomalies.push(jump);
    };

    // Process bonds via Borsa Italiana scraper (with Yahoo Finance fallback)
    for (const bond of bondsWithIsin) {
      console.log(`[Bond Update] Processing ${bond.ticker} (ISIN: ${bond.isin})`);
      let adjustedPrice: number | null = null;
      let source = '';
      try {
        // Try Borsa Italiana scraper first
        const bondPrice = await getBondPriceByIsin(bond.isin);
        if (bondPrice && bondPrice.price && bondPrice.price > 0) {
          // Bond prices from Borsa Italiana are quoted as % of par (e.g. 104.2 = 104.2%): convert
          // to EUR per unit so that totalValue = currentPrice × quantity is correct.
          adjustedPrice = bondQuoteToEurPerUnit(bond, bondPrice.price, now);
          source = `BI-${bondPrice.priceType}`;
        } else {
          // Fallback to Yahoo Finance
          console.log(`[Bond Update] ${bond.ticker}: Borsa Italiana returned null, falling back to Yahoo Finance`);
          const quote = await getQuote(bond.ticker);
          if (quote && quote.price !== null && quote.price > 0) {
            // Same % → EUR conversion for Yahoo Finance fallback
            adjustedPrice = bondQuoteToEurPerUnit(bond, quote.price, now);
            source = 'YF-fallback';
          }
        }
      } catch (error) {
        console.error(`[Bond Update] Error fetching ${bond.ticker}:`, error);
      }

      if (adjustedPrice === null || !(adjustedPrice > 0)) {
        console.warn(`[Bond Update] ${bond.ticker}: Both Borsa Italiana and Yahoo Finance failed`);
        fail(bond, 'quote');
        continue;
      }

      try {
        const assetRef = adminDb.collection('assets').doc(bond.id);
        await assetRef.update({
          currentPrice: adjustedPrice,
          lastPriceUpdate: now,
          updatedAt: now,
        });
        // Compared in euro per unit, the unit both prices are stored in.
        noteJump(bond, adjustedPrice, undefined);
        updated.push(`${bond.ticker} (${source})`);
        console.log(`[Bond Update] ${bond.ticker}: Updated (${source}) → €${adjustedPrice}`);
      } catch (error) {
        console.error(`[Bond Update] Error updating ${bond.ticker}:`, error);
        fail(bond, 'write');
      }
    }

    // Extract unique tickers for other assets
    const tickers = [
      ...new Set(otherAssets.map((asset) => asset.ticker)),
    ];

    // Fetch quotes from Yahoo Finance
    const quotes = await getMultipleQuotes(tickers);

    // Update asset prices using Admin SDK (for non-bond assets)
    for (const asset of otherAssets) {
      const quote = quotes.get(asset.ticker);

      if (quote && quote.price !== null && quote.price > 0) {
        try {
          const assetRef = adminDb.collection('assets').doc(asset.id);

          // Build the update payload. Always write price and currency from Yahoo.
          // For non-EUR assets, also convert to EUR so that calculateAssetValue()
          // can return a correct EUR total without async FX calls at read time.

          // Yahoo Finance returns LSE prices in GBp (pence), not GBP (pounds).
          // Normalize to GBP by dividing by 100 so the FX conversion and stored
          // price are in the correct unit (e.g. SWDA.L: 4874 GBp → 48.74 GBP).
          const isGBp = quote.currency === 'GBp';
          const normalizedPrice = isGBp ? quote.price / 100 : quote.price;
          const normalizedCurrency = isGBp ? 'GBP' : quote.currency;

          const updatePayload: Record<string, unknown> = {
            currentPrice: normalizedPrice,
            currency: normalizedCurrency,
            lastPriceUpdate: now,
            updatedAt: now,
          };

          let fxFailed = false;
          if (normalizedCurrency && normalizedCurrency.toUpperCase() !== 'EUR') {
            try {
              updatePayload.currentPriceEur = await convertToEur(normalizedPrice, normalizedCurrency);
            } catch (fxError) {
              // FX conversion failure must not abort the price update.
              // The stale or missing currentPriceEur means the portfolio total
              // will fall back to the native price, which is wrong but recoverable
              // on the next successful price update — and the snapshot records it (RI11).
              console.warn(`[Price Update] FX conversion failed for ${asset.ticker} (${normalizedCurrency}→EUR):`, fxError);
              fxFailed = true;
            }
          }

          await assetRef.update(updatePayload);
          noteJump(asset, normalizedPrice, normalizedCurrency);
          updated.push(asset.ticker);
          if (fxFailed) fail(asset, 'fx');
        } catch (error) {
          console.error(`Failed to update ${asset.ticker}:`, error);
          fail(asset, 'write');
        }
      } else {
        fail(asset, 'quote');
      }
    }

    return {
      updated: updated.length,
      failed,
      message: `Updated ${updated.length} assets, ${failed.length} failed`,
      failures,
      anomalies,
    };
  } catch (error) {
    console.error('Error updating prices:', error);
    throw new Error('Failed to update asset prices');
  }
}
