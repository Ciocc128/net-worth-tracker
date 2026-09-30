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
 *    instrument tracks (or is proxied by). `msci-usa` needs no factsheet — it is what the index IS
 *    by definition (US-domiciled constituents, USD); every other row cites its factsheet. A row
 *    with no `countries` would read as `nonLetta` in the engine, never as zero.
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
 * ── Where each row comes from, and the monthly pass ───────────────────────────────────────────
 * Every `indexId` is filled (Geografia and Valuta at 100% since 2026-09-01). MSCI and FTSE Russell
 * rows come from the index provider's own factsheet, Avantis from the fund's — all four sources
 * download unattended in `npm run exposure:refresh`. Two are manual, because the issuer blocks
 * scripts (Cloudflare): Dimensional (a QUARTERLY factsheet, so its `asOf` trails the others) and
 * WisdomTree's MONTHLY factsheet PDF for NTSG's equity sleeve («Primi 10 Paesi»). NTSG's bond
 * sleeve is the one RULE in this file, derived from that same equity table (see its entry); the
 * fund's holdings CSV supplies neither sleeve — no country column, and its futures rows are
 * unrealised P&L, not exposure. The pass: run the script, deposit the two manual files in
 * `data/factsheets/`, read the extracts, edit the rows here by hand, then the checklist below.
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
 *  5. A factsheet that breaks its 'OTHER' country slice down by region → `otherAreaSplit` on that
 *     `INDEX_PROFILES` entry (weight optimizer only, `doc/weight-optimizer-ate.md` §5.3); leave it
 *     absent when the factsheet doesn't say — the optimizer estimates from the reference index
 *     instead, it never guesses at a curated level.
 */
import type { AssetClass } from '@/types/assets';
import type { GeoArea } from './geoAreas';

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
    indexId: 'msci-world-ex-usa',
    issuer: 'Xtrackers',
  },
  'EIMI.MI': {
    ticker: 'EIMI.MI',
    indexId: 'msci-em-imi',
    issuer: 'iShares',
  },
  'XDEM.MI': {
    ticker: 'XDEM.MI',
    indexId: 'msci-world-momentum',
    issuer: 'Xtrackers',
  },
  'DEGC.DE': {
    ticker: 'DEGC.DE',
    indexId: 'dimensional-global-core',
    issuer: 'Dimensional',
  },
  'AVWS.DE': {
    ticker: 'AVWS.DE',
    indexId: 'global-small-cap-value',
    issuer: 'Avantis',
  },
  'ALLW.MI': {
    ticker: 'ALLW.MI',
    indexId: 'ftse-all-world',
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
  /** From the factsheet `sourceUrl` names, as of `asOf`; absent reads as `nonLetta`. */
  countries?: Array<{ code: string; label: string; weight: number }>;
  currencies?: Array<{ code: string; weight: number }>;
  /** Share of the `countries` 'OTHER' slice per area, from the same factsheet. Sums to 1 ± 0.005.
   *  Used by the weight optimizer's `areasFromCountries` (`lib/utils/weightOptimizer.ts` §5.3) —
   *  absent unless a factsheet actually breaks the residual down by region. */
  otherAreaSplit?: Partial<Record<GeoArea, number>>;
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
  // NTSG's EQUITY sleeve, from WisdomTree's own monthly factsheet ("Top 10 Countries" — "Primi 10
  // Paesi" in the Italian edition; all data as of 31/08/2026). The ten disclosed weights sum to
  // 94.23%; the remainder is carried as an explicit OTHER row rather than being spread across the
  // named ten, which would overstate every one of them. Note this DISPROVES the "8-for-8 US
  // megacap ⇒ all-USD" reading of Yahoo's top holdings: a top-10 by SECURITY is US-heavy while the
  // fund still holds 6.1% Japan, 8.3% eurozone, 3.3% UK, 3.1% Canada and 2.5% Switzerland. The
  // BOND sleeve is deliberately NOT here — see the 'ntsg-bond-sleeve' entry.
  'wt-global-efficient-core': {
    indexId: 'wt-global-efficient-core',
    label: 'WisdomTree Global Efficient Core — azionario',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.6943 },
      { code: 'JP', label: 'Giappone', weight: 0.0614 },
      { code: 'GB', label: 'Regno Unito', weight: 0.033 },
      { code: 'FR', label: 'Francia', weight: 0.0313 },
      { code: 'CA', label: 'Canada', weight: 0.0307 },
      { code: 'DE', label: 'Germania', weight: 0.0255 },
      { code: 'CH', label: 'Svizzera', weight: 0.0248 },
      { code: 'AU', label: 'Australia', weight: 0.0152 },
      { code: 'ES', label: 'Spagna', weight: 0.0141 },
      { code: 'NL', label: 'Paesi Bassi', weight: 0.012 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.0577 },
    ],
    asOf: '2026-08-31',
    sourceUrl:
      'https://www.wisdomtree.com/se/products/equities/wisdomtree-global-efficient-core-ucits-etf---usd-acc',
  },
  // NTSG's BOND sleeve (the four government-futures markets, "titoli di stato statunitensi,
  // tedeschi, britannici e giapponesi", rebalanced quarterly to a 60% notional).
  //
  // A DECLARED RULE, not a published table — the one entry in this file that is neither. The
  // factsheet names the four government-futures markets and says the sleeve rebalances quarterly,
  // but publishes no split between them; the holdings CSV cannot supply one either (its eight
  // futures rows carry −0.00%…−0.08%, unrealised P&L on unfunded contracts, not exposure). The
  // rule applied here — the four markets are weighted by their relative market capitalisation —
  // is the fund owner's reading of the index methodology, and it is implemented by taking the
  // FOUR matching weights from this fund's own equity sleeve and renormalising them pro quota:
  //   US 69.43 · JP 6.14 · GB 3.30 · DE 2.55  (sum 81.42, 31/08/2026)
  //   →  85.27% · 7.54% · 4.05% · 3.13%
  // Two caveats to re-examine if the numbers ever look wrong: a GOVERNMENT-BOND basket weighted
  // by EQUITY capitalisation is unusual (sovereign baskets are normally weighted by debt
  // outstanding or by duration, which would raise Japan's share considerably), and these weights
  // move with the equity sleeve rather than with the bond market. Because it is a rule and not a
  // document, `sourceUrl` points at the factsheet that names the four markets — the part that IS
  // published — and `asOf` tracks the equity table this is derived from.
  'ntsg-bond-sleeve': {
    indexId: 'ntsg-bond-sleeve',
    label: 'WisdomTree Global Efficient Core — obbligazionario',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.8527 },
      { code: 'JP', label: 'Giappone', weight: 0.0754 },
      { code: 'GB', label: 'Regno Unito', weight: 0.0405 },
      { code: 'DE', label: 'Germania', weight: 0.0313 },
    ],
    asOf: '2026-08-31',
    sourceUrl:
      'https://www.wisdomtree.com/se/products/equities/wisdomtree-global-efficient-core-ucits-etf---usd-acc',
  },
  // ── The four rows below come from the INDEX PROVIDER's own factsheet, not the ETF issuer's ──
  // MSCI and FTSE Russell publish country weights for the index itself, which is both the more
  // primary source and the more stable one: several ETFs can track one index, and a provider's
  // factsheet does not depend on which issuer's website happens to be scriptable this month. All
  // four are dated AUG 31, 2026 and download unauthenticated (see DOWNLOAD_REGISTRY in
  // scripts/exposureRefresh.mts). MSCI publishes a top-5 plus "Other"; that residual is carried
  // as an explicit OTHER row, never spread across the named countries.
  'msci-world-ex-usa': {
    indexId: 'msci-world-ex-usa',
    label: 'MSCI World ex USA',
    countries: [
      { code: 'JP', label: 'Giappone', weight: 0.2073 },
      { code: 'GB', label: 'Regno Unito', weight: 0.1267 },
      { code: 'CA', label: 'Canada', weight: 0.1241 },
      { code: 'FR', label: 'Francia', weight: 0.0846 },
      { code: 'CH', label: 'Svizzera', weight: 0.0809 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.3764 },
    ],
    asOf: '2026-08-31',
    sourceUrl: 'https://www.msci.com/documents/10199/255599/msci-world-ex-usa-index.pdf',
  },
  'msci-em-imi': {
    indexId: 'msci-em-imi',
    label: 'MSCI Emerging Markets IMI',
    countries: [
      { code: 'TW', label: 'Taiwan', weight: 0.2744 },
      { code: 'KR', label: 'Corea del Sud', weight: 0.2011 },
      { code: 'CN', label: 'Cina', weight: 0.1916 },
      { code: 'IN', label: 'India', weight: 0.1247 },
      { code: 'BR', label: 'Brasile', weight: 0.0385 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.1696 },
    ],
    asOf: '2026-08-31',
    sourceUrl: 'https://www.msci.com/documents/10199/255599/msci-emerging-markets-imi-usd-net-since-2007.pdf',
  },
  'msci-world-momentum': {
    indexId: 'msci-world-momentum',
    label: 'MSCI World Momentum',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.5608 },
      { code: 'JP', label: 'Giappone', weight: 0.1152 },
      { code: 'CA', label: 'Canada', weight: 0.0709 },
      { code: 'GB', label: 'Regno Unito', weight: 0.0533 },
      { code: 'NL', label: 'Paesi Bassi', weight: 0.0316 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.1683 },
    ],
    asOf: '2026-08-31',
    sourceUrl: 'https://www.msci.com/documents/10199/255599/msci-world-momentum-index-usd-net.pdf',
  },
  // Dimensional's own factsheet, "TOP COUNTRIES" (five rows, 87.18%); remainder as OTHER. The
  // factsheet is QUARTERLY — these are the figures "as of 30 June 2026" (re-read on 2026-09-30:
  // still the latest; the September quarter lands in October), hence an `asOf` older than the rows
  // around it. An earlier cut stamped it 2026-07-31 alongside the monthly ones.
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
    asOf: '2026-06-30',
    sourceUrl: 'https://www.dimensional.com/gb-en/funds/ie000eggfvg6/global-core-equity-ucits-etf-acc',
  },
  // Avantis/American Century factsheet, country table (five rows, 88.95%); remainder as OTHER.
  'global-small-cap-value': {
    indexId: 'global-small-cap-value',
    label: 'Global Small Cap Value',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.6785 },
      { code: 'JP', label: 'Giappone', weight: 0.1059 },
      { code: 'CA', label: 'Canada', weight: 0.0377 },
      { code: 'GB', label: 'Regno Unito', weight: 0.0372 },
      { code: 'AU', label: 'Australia', weight: 0.0302 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.1105 },
    ],
    asOf: '2026-08-31',
    sourceUrl: 'https://res.americancentury.com/docs/avantis-global-small-cap-value-ucits-etf-fact-sheet.pdf',
  },
  // FTSE Russell publishes the FULL country table (48 markets), not a top-5 plus "Other" the way
  // MSCI does. Kept to the twelve heaviest (91.49%) with the tail as OTHER: past the twelfth every
  // market is under 1.2% and would never surface in a six-row tile, while the file stays readable.
  // The July cut had no United Kingdom row (FTSE labels it «UK»; 3.20% in August, the fourth
  // market): it sat inside OTHER, with the Netherlands as twelfth. Fixed 2026-09-30.
  'ftse-all-world': {
    indexId: 'ftse-all-world',
    label: 'FTSE All-World',
    countries: [
      { code: 'US', label: 'Stati Uniti', weight: 0.6171 },
      { code: 'JP', label: 'Giappone', weight: 0.0598 },
      { code: 'TW', label: 'Taiwan', weight: 0.033 },
      { code: 'GB', label: 'Regno Unito', weight: 0.032 },
      { code: 'CA', label: 'Canada', weight: 0.03 },
      { code: 'CN', label: 'Cina', weight: 0.0274 },
      { code: 'KR', label: 'Corea del Sud', weight: 0.025 },
      { code: 'FR', label: 'Francia', weight: 0.0199 },
      { code: 'CH', label: 'Svizzera', weight: 0.0198 },
      { code: 'DE', label: 'Germania', weight: 0.019 },
      { code: 'AU', label: 'Australia', weight: 0.0161 },
      { code: 'IN', label: 'India', weight: 0.0158 },
      { code: 'OTHER', label: 'Altri paesi', weight: 0.0851 },
    ],
    asOf: '2026-08-31',
    sourceUrl: 'https://research.ftserussell.com/Analytics/Factsheets/Home/DownloadSingleIssue?issueName=AWORLDS',
  },
};
