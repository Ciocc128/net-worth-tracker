/**
 * Curated exposure profiles — the manually-maintained half of the Esposizione tile's data, on the
 * model of `lib/constants/benchmarks.ts`: every entry justifies itself, `asOf` and `sourceUrl` are
 * how the reader checks whether a figure has gone stale.
 *
 * Two tables:
 *  - `INSTRUMENT_PROFILES` (keyed by `asset.ticker`, EXACTLY as stored — not the ISIN: only 2 of
 *    this portfolio's 25 assets have one populated): per-instrument overrides — a Yahoo alias
 *    ticker, a `kind` for a class with no security-level look-through, which curated `indexId`
 *    supplies its geography, an issuer display override, a currency override.
 *  - `INDEX_PROFILES` (keyed by `indexId`): country/currency breakdowns for an index an
 *    instrument tracks (or is proxied by). `msci-usa` is the ONE fully-populated entry in this
 *    first cut — it needs no factsheet, it is what the index IS by definition (US-domiciled
 *    constituents, USD). Every other `indexId` referenced below is a DECLARED GAP: the row exists
 *    (so `profileResolver.ts` knows the instrument is accounted for, not silently forgotten) but
 *    carries no `countries`/`currencies` yet — the engine reads that as `nonLetta`, never as zero.
 *
 * ── Why the equity-notional coverage target (28% → 100%) needed almost none of this ────────────
 * The plan's headline number — Titoli/Settori coverage of the tradable equity notional — turned
 * out to hinge on exactly TWO curated facts, both just an alias, no factsheet:
 *   - `NTSG-ETFP.MI` has no Yahoo listing; `NTSG.MI` does, with real holdings/sectors → +59pp.
 *   - `CL2.MI` is a synthetic swap ETF Yahoo has never indexed; `CSUS.MI` (a physical S&P 500
 *     UCITS ETF, a reasonable large-cap-US proxy for an MSCI-USA-tracking product) closes the
 *     rest → 100%.
 * Everything below this line is Geografia/Valuta/Emittenti refinement, not the headline number.
 *
 * ── What's still a declared gap after this first cut (see the plan's "Limiti che restano") ─────
 * `msci-world-ex-usa` (EXUS), `msci-em-imi` (EIMI), `msci-world-momentum` (XDEM),
 * `dimensional-global-core` (DEGC), `global-small-cap-value` (AVWS), `ftse-all-world` (ALLW) have
 * no countries/currencies yet — their issuers block scripted downloads (Xtrackers/DWS, Dimensional,
 * Avantis) the way WisdomTree does; nobody has tried and failed here, nobody has tried and
 * succeeded either — the first `npm run exposure:refresh` after a human deposits a factsheet in
 * `data/factsheets/` is what fills these in. `NTSG-ETFP.MI`'s BONDS sleeve (Euro Bund/Gilt/JGB/US
 * Treasury futures, ≈28% of the Geografia base) needs WisdomTree's own CSV, which sits behind
 * Cloudflare for any script (403 on every header combination tried) — a human downloads it from a
 * browser into `data/factsheets/`, see AGENTS.md → *Allocazione — Esposizione*. Its EQUITY sleeve's
 * geography is ALSO left empty even though every one of its 8 disclosed Yahoo holdings is a US
 * megacap: that is suggestive, not proof (the same top-8 would show up almost as US-heavy on a
 * plain global cap-weighted fund today) — not solid enough to assert "100% USA" over 43.938 €.
 *
 * ── Update checklist ─────────────────────────────────────────────────────────────────────────
 *  1. New allocable instrument (`allocationRole` tradable/frozen) → confirm it needs a row here at
 *     all: `__tests__/instrumentProfiles.test.ts` fails the build otherwise (the test that stops a
 *     future purchase from going unnoticed — see the plan's Verifica §2).
 *  2. A `kind` instrument needs NO holdings/sectors/geography row — that IS the point (see
 *     exposureEngine.ts's `NON_LOOKTHROUGH_ASSET_CLASSES`); it still wants an `issuer` override.
 *  3. Filling in an `INDEX_PROFILES` gap: `countries`/`currencies` must each sum to 1 ± 0.005,
 *     `asOf` + `sourceUrl` are mandatory the moment weights are non-empty.
 *  4. `npm run exposure:report` after any change — it prints the coverage table this file's header
 *     describes, so a regression is visible in one command.
 */
import type { AssetClass } from '@/types/assets';

export type CuratedExposureKind = 'commodity' | 'trendFollowing' | 'carry';

export interface CuratedInstrumentEntry {
  /** The exact `asset.ticker` this entry describes — repeated as a value for readability at the
   *  call site; the object KEY in `INSTRUMENT_PROFILES` is what resolution actually uses. */
  ticker: string;
  /** Query Yahoo Finance with THIS ticker instead of the asset's own for holdings/sectors — either
   *  because the asset's own ticker has no Yahoo listing (`NTSG-ETFP.MI` → `NTSG.MI`) or because
   *  it is a synthetic/swap product Yahoo never indexes and a physical proxy stands in
   *  (`CL2.MI` → `CSUS.MI`). Never used for price — only for the exposure look-through. */
  yahooExposureTicker?: string;
  /** A class with NO security-level look-through by nature — `exposureEngine.ts` already derives
   *  this from the asset's own `expandAssetExposure` leg `assetClass`, so this field drives
   *  nothing there; it exists so a human reading this table sees WHY a row has no holdings/
   *  sectors/geography and never goes looking for a factsheet that cannot exist. */
  kind?: CuratedExposureKind;
  /** Curated `INDEX_PROFILES` id supplying this instrument's geography (and, when derivable,
   *  currency) for its EQUITY leg. */
  indexId?: string;
  /** Per-leg override of `indexId` — only a composite instrument needs more than one leg
   *  described; today that is `NTSG-ETFP.MI` alone (equity sleeve vs bond sleeve). */
  legIndexIds?: Partial<Record<Extract<AssetClass, 'equity' | 'bonds'>, string>>;
  /** Whole-instrument currency override — highest precedence after a hedged share class (none of
   *  this portfolio's instruments are hedged). A RULE this table is codifying, not a factsheet
   *  fact: see the entry's own comment for the reasoning (NTSG, and every `kind` instrument). */
  currencies?: Array<{ code: string; weight: number }>;
  /** Emittenti display name when Yahoo's `fundProfile.family` would fragment ONE issuer into
   *  several buckets (WisdomTree returns "WisdomTree Management Limited" for NTSG and
   *  "WisdomTree Multi Asset Issuer PLC" for CRRY — without this override the tile would hide
   *  WisdomTree's real 49% concentration behind two unrelated-looking rows). */
  issuer?: string;
  /** `UEQC.DE`: Yahoo's `sectorWeightings` for this ticker are NOT this instrument's own (it is a
   *  commodity-carry strategy, not an equity fund) — `exposureEngine.ts` never sees them anyway
   *  once `kind` routes the leg to `notApplicabile`, but this documents the trap for whoever next
   *  wires a new consumer of `yahooSource.ts` directly. */
  ignoreYahooSectors?: boolean;
  /** ISO date of the curated fact (the alias mapping, the currency rule, the issuer override) —
   *  required whenever this entry supplies data the engine actually uses. */
  asOf?: string;
  sourceUrl?: string;
}

export const INSTRUMENT_PROFILES: Record<string, CuratedInstrumentEntry> = {
  'NTSG-ETFP.MI': {
    ticker: 'NTSG-ETFP.MI',
    yahooExposureTicker: 'NTSG.MI', // the Milan share class Yahoo has never indexed; the LSE/XETRA line has.
    issuer: 'WisdomTree',
    // NO whole-instrument currency override. An earlier cut asserted USD 100% by reading Yahoo's
    // top-8 holdings (all US megacaps) as "the sleeve is American"; WisdomTree's factsheet
    // disproves it — the equity sleeve holds 6.1% Japan, 8.7% eurozone, 3.0% UK, 3.0% Canada and
    // 2.6% Switzerland. A top-10 by SECURITY is not a country breakdown. The currency mix is now
    // derived from the equity sleeve's countries (`profileResolver.resolveCurrency`), which is the
    // right answer for the CAPITAL: the equity sleeve genuinely buys foreign shares in foreign
    // currencies. The BOND sleeve stays out of it for the opposite reason — unfunded futures carry
    // duration abroad without ever buying a foreign currency (Yahoo's `bondPosition: -0.97%` is
    // those contracts' mark-to-market, not 40% of AUM sitting in euros; see the plan's "NTSG e i
    // futures"), and `ntsg-bond-sleeve` carries no weights, so it contributes nothing here.
    // Approximation left standing: the ~10% cash collateral (USD/EUR/GBP/JPY per the factsheet)
    // is treated as following the equity mix rather than being split out.
    legIndexIds: { equity: 'wt-global-efficient-core', bonds: 'ntsg-bond-sleeve' },
    asOf: '2026-07-31',
    sourceUrl:
      'https://www.wisdomtree.com/se/products/equities/wisdomtree-global-efficient-core-ucits-etf---usd-acc',
  },
  'CL2.MI': {
    ticker: 'CL2.MI',
    // A synthetic (swap-based) 2x MSCI USA ETF: Yahoo has no constituent data for it at all.
    // CSUS.MI (iShares Core S&P 500 UCITS ETF, Milan) is a physical US large-cap proxy — a
    // deliberate approximation the plan already documents as a known limitation (an index change
    // at Amundi would only be caught by the monthly refresh).
    yahooExposureTicker: 'CSUS.MI',
    indexId: 'msci-usa', // geography + currency: CL2 is a leveraged MSCI USA tracker, so this is exact, not a proxy.
    issuer: 'Amundi',
    asOf: '2026-09-01',
    sourceUrl: 'https://www.amundietf.it/it/investitori-privati/prodotti/azionario/amundi-msci-usa-daily-2x-leveraged-ucits-etf-acc/lu1900068750',
  },
  'SGLN.MI': {
    ticker: 'SGLN.MI',
    kind: 'commodity', // physical gold — no sectors, no holdings, no country by construction.
    issuer: 'iShares',
  },
  'DBMFE.PA': {
    ticker: 'DBMFE.PA',
    kind: 'trendFollowing', // managed futures — long/short across asset classes, no equity content.
    issuer: 'iMGP',
  },
  'CRRY.MI': {
    ticker: 'CRRY.MI',
    kind: 'carry', // commodity-carry strategy — baskets of futures, no equity content.
    issuer: 'WisdomTree',
  },
  'UEQC.DE': {
    ticker: 'UEQC.DE',
    kind: 'carry',
    ignoreYahooSectors: true, // Yahoo returns 11 "sectors" for this ticker that are not this strategy's own.
    issuer: 'UBS',
  },
  'EXUS.MI': {
    ticker: 'EXUS.MI',
    indexId: 'msci-world-ex-usa', // declared gap — see this file's header.
    issuer: 'Xtrackers',
  },
  'EIMI.MI': {
    ticker: 'EIMI.MI',
    indexId: 'msci-em-imi', // declared gap — see this file's header.
    issuer: 'iShares',
  },
  'XDEM.MI': {
    ticker: 'XDEM.MI',
    indexId: 'msci-world-momentum', // declared gap — see this file's header.
    issuer: 'Xtrackers',
  },
  'DEGC.DE': {
    ticker: 'DEGC.DE',
    indexId: 'dimensional-global-core', // declared gap — see this file's header.
    issuer: 'Dimensional',
  },
  'AVWS.DE': {
    ticker: 'AVWS.DE',
    indexId: 'global-small-cap-value', // declared gap — see this file's header.
    issuer: 'Avantis',
  },
  'ALLW.MI': {
    ticker: 'ALLW.MI',
    indexId: 'ftse-all-world', // declared gap — see this file's header.
    issuer: 'Xtrackers',
  },
  // BSP and BRK-B (direct stocks) need no row: `profileResolver.ts` handles a stock generically —
  // the holding IS the instrument (weight 1), the sector/country come from Yahoo's
  // `assetProfile`, the issuer is the company's own name, the currency is `asset.currency`. No
  // curated fact, no maintenance burden — exactly the plan's "nessuna" column for these two rows.
};

export interface CuratedIndexProfile {
  indexId: string;
  label: string;
  /** Empty until a human supplies the factsheet — see this file's header for which ones. */
  countries?: Array<{ code: string; label: string; weight: number }>;
  currencies?: Array<{ code: string; weight: number }>;
  asOf?: string;
  sourceUrl?: string;
}

export const INDEX_PROFILES: Record<string, CuratedIndexProfile> = {
  'msci-usa': {
    indexId: 'msci-usa',
    label: 'MSCI USA',
    // Definitional, not sourced from a factsheet: the MSCI USA Index is US-domiciled large/mid
    // caps by construction — this fact does not decay the way a factsheet's holdings table does.
    countries: [{ code: 'US', label: 'Stati Uniti', weight: 1 }],
    currencies: [{ code: 'USD', weight: 1 }],
    asOf: '2026-09-01',
    sourceUrl: 'https://www.msci.com/indexes/index/990300',
  },
  // NTSG's EQUITY sleeve, from WisdomTree's own monthly factsheet ("Primi 10 Paesi", data al
  // 31/07/2026). The ten disclosed weights sum to 94.24%; the remainder is carried as an explicit
  // OTHER row rather than being spread across the named ten, which would overstate every one of
  // them. Note this DISPROVES the "8-for-8 US megacap ⇒ all-USD" reading of Yahoo's top holdings:
  // a top-10 by SECURITY is US-heavy while the fund still holds 6.1% Japan, 8.7% eurozone, 3.0%
  // UK, 3.0% Canada and 2.6% Switzerland. The BOND sleeve is deliberately NOT here — see the
  // 'ntsg-bond-sleeve' entry.
  'wt-global-efficient-core': {
    indexId: 'wt-global-efficient-core',
    label: 'WisdomTree Global Efficient Core — azionario',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.6932 },
      { code: 'JP', label: 'Giappone', weight: 0.0608 },
      { code: 'FR', label: 'Francia', weight: 0.0325 },
      { code: 'GB', label: 'Regno Unito', weight: 0.0302 },
      { code: 'CA', label: 'Canada', weight: 0.0298 },
      { code: 'CH', label: 'Svizzera', weight: 0.0258 },
      { code: 'DE', label: 'Germania', weight: 0.0247 },
      { code: 'NL', label: 'Paesi Bassi', weight: 0.0158 },
      { code: 'AU', label: 'Australia', weight: 0.0157 },
      { code: 'ES', label: 'Spagna', weight: 0.0139 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.0576 },
    ],
    asOf: '2026-07-31',
    sourceUrl:
      'https://www.wisdomtree.com/se/products/equities/wisdomtree-global-efficient-core-ucits-etf---usd-acc',
  },
  // NTSG's BOND sleeve: the factsheet names the four government-futures markets ("titoli di stato
  // statunitensi, tedeschi, britannici e giapponesi", rebalanced quarterly to a 60% notional) but
  // publishes NO weights, and the holdings CSV cannot supply them either — its eight futures rows
  // carry mark-to-market values of −0.00% to −0.08% (≈ −0.27% in total), which is unrealised P&L
  // on unfunded contracts, not exposure. Four known countries, four unknown weights: the row
  // stays empty so the engine reads the leg as `nonLetta` (≈28% of the Geografia base) instead of
  // asserting an equal split nobody published.
  'ntsg-bond-sleeve': {
    indexId: 'ntsg-bond-sleeve',
    label: 'WisdomTree Global Efficient Core — obbligazionario',
  },
  'msci-world-ex-usa': {
    indexId: 'msci-world-ex-usa',
    label: 'MSCI World ex USA',
    // countries/currencies intentionally absent — see this file's header. EXUS.MI (Xtrackers).
  },
  'msci-em-imi': {
    indexId: 'msci-em-imi',
    label: 'MSCI Emerging Markets IMI',
    // countries/currencies intentionally absent — see this file's header. EIMI.MI (iShares).
  },
  'msci-world-momentum': {
    indexId: 'msci-world-momentum',
    label: 'MSCI World Momentum',
    // countries/currencies intentionally absent — see this file's header. XDEM.MI (Xtrackers).
  },
  // Dimensional's own factsheet, "TOP COUNTRIES" (five rows, 87.18%); remainder as OTHER.
  'dimensional-global-core': {
    indexId: 'dimensional-global-core',
    label: 'Dimensional Global Core Equity',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.7145 },
      { code: 'JP', label: 'Giappone', weight: 0.0641 },
      { code: 'CA', label: 'Canada', weight: 0.0364 },
      { code: 'GB', label: 'Regno Unito', weight: 0.0349 },
      { code: 'CH', label: 'Svizzera', weight: 0.0219 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.1282 },
    ],
    asOf: '2026-07-31',
    sourceUrl: 'https://www.dimensional.com/gb-en/funds/ie000eggfvg6/global-core-equity-ucits-etf-acc',
  },
  // Avantis/American Century factsheet, country table (five rows, 89.05%); remainder as OTHER.
  'global-small-cap-value': {
    indexId: 'global-small-cap-value',
    label: 'Global Small Cap Value',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.6924 },
      { code: 'JP', label: 'Giappone', weight: 0.1022 },
      { code: 'GB', label: 'Regno Unito', weight: 0.0361 },
      { code: 'CA', label: 'Canada', weight: 0.0327 },
      { code: 'AU', label: 'Australia', weight: 0.0271 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.1095 },
    ],
    asOf: '2026-07-31',
    sourceUrl: 'https://res.americancentury.com/docs/avantis-global-small-cap-value-ucits-etf-fact-sheet.pdf',
  },
  'ftse-all-world': {
    indexId: 'ftse-all-world',
    label: 'FTSE All-World',
    // countries/currencies intentionally absent — see this file's header. ALLW.MI (Xtrackers).
  },
};
