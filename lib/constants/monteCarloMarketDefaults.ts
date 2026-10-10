/**
 * Default market assumptions of the Monte Carlo — the ONLY file the research numbers enter the
 * code in (doc/montecarlo/README.md § 14.6; research R0-bis, 2026-10-10,
 * /mnt/project-files/montecarlo/R0-bis-valori-in-euro.md).
 *
 * Since Q1 the defaults are the ones of someone who invests in EURO and thinks in REAL terms: one
 * Base per class (real CAGR), its volatility (standard deviation of SIMPLE annual real returns, the
 * `σa` of rule R1), its uncertainty (standard deviation of the error on the mean of the log-returns,
 * points) and ONE expected inflation. Obbligazioni and Liquidità are not typed here: they follow the
 * ECB rates (RQ2), frozen below until the daily cron keeps them fresh (Q3). Trend and Carry are a
 * premium over the Liquidità (V-D13). Bear and Bull no longer exist per class: they are derived
 * (RQ3, RQ5).
 *
 * The v1 numbers (nominal USD, three scenarios) stay at the bottom, ONLY to migrate saved documents (RQ8).
 */
import type { MonteCarloClass } from './monteCarloClasses';
import type { MonteCarloMarketScenario, MonteCarloMarketSettingsV1 } from '@/types/assets';

export interface MonteCarloClassSource {
  /** Short source id. */
  id: string;
  /** What the series is. */
  series: string;
  /** Years covered. */
  period: string;
  /** Date of the download. */
  asOf: string;
  /** One sentence that the tile can print as it is. */
  note?: string;
}

const DOWNLOAD_AS_OF = '10/10/2026';

export const MONTE_CARLO_CLASS_SOURCES: Record<MonteCarloClass, MonteCarloClassSource> = {
  equity: { id: 'R0-bis', series: 'Azioni mondo (VTSIM) in euro', period: '1972–2025', asOf: DOWNLOAD_AS_OF },
  bonds: {
    id: 'R0-bis',
    series: 'Tasso AAA 10 anni BCE; volatilità: Bund 10 anni ricostruito',
    period: '1972–2025',
    asOf: DOWNLOAD_AS_OF,
    note: 'Il rendimento è il tasso di oggi, non una media storica.',
  },
  gold: { id: 'R0-bis', series: 'Oro (GLDSIM) in euro', period: '1981–2025', asOf: DOWNLOAD_AS_OF },
  commodity: {
    id: 'R0-bis',
    series: 'S&P GSCI (GSGSIM) in euro',
    period: '1980–2025',
    asOf: DOWNLOAD_AS_OF,
    note: 'In 46 anni ha reso meno dell’inflazione: il default lo dice.',
  },
  cash: {
    id: 'R0-bis',
    series: '€STR; volatilità: CASHEUR',
    period: '1972–2025',
    asOf: DOWNLOAD_AS_OF,
    note: 'Il rendimento è il tasso di oggi, non una media storica.',
  },
  trendFollowing: {
    id: 'R0-bis',
    series: 'Liquidità + premio (DBMFSIM, controllo KMLMSIM)',
    period: '2001–2025',
    asOf: DOWNLOAD_AS_OF,
    note: 'Serie investibile, al netto dei costi: non il fattore accademico lordo.',
  },
  carry: {
    id: 'R0-bis',
    series: 'Liquidità + premio (UEQC, senza il salto del 24/01/2020)',
    period: '31/12/2014–07/10/2026',
    asOf: DOWNLOAD_AS_OF,
    note: 'Costi dell’indice (0,34%) già tolti: al netto.',
  },
};

/**
 * How a class gets its Base (RQ0, RQ2): `historical` = a typed real CAGR; `anchor` = the real value of an ECB
 * rate (RQ2); `premium` = the Liquidità plus a premium (V-D13).
 */
export type MonteCarloClassKind = 'historical' | 'anchor' | 'premium';

export interface MonteCarloClassDefault {
  kind: MonteCarloClassKind;
  /** Real CAGR of the Base, percent: only for `historical`. */
  cagr?: number;
  /** Premium over the Liquidità, percent: only for `premium`. */
  premium?: number;
  /** Real volatility, unhedged. */
  volatility: number;
  /** Real volatility with the currency hedge (Q4); absent = no hedge exists for the class. */
  volatilityHedged?: number;
  /** Uncertainty on the mean of the log-returns, points. */
  uncertainty: number;
}

/** Doc § 14.6, the table «Classi». */
export const MONTE_CARLO_CLASS_DEFAULTS: Record<MonteCarloClass, MonteCarloClassDefault> = {
  equity: { kind: 'historical', cagr: 5.74, volatility: 19.49, volatilityHedged: 17.15, uncertainty: 2.7 },
  bonds: { kind: 'anchor', volatility: 8.0, uncertainty: 0.98 },
  gold: { kind: 'historical', cagr: 1.79, volatility: 15.82, volatilityHedged: 17.98, uncertainty: 2.3 },
  commodity: { kind: 'historical', cagr: 0.52, volatility: 23.88, uncertainty: 3.5 },
  cash: { kind: 'anchor', volatility: 2.82, uncertainty: 2.37 },
  trendFollowing: { kind: 'premium', premium: 3.52, volatility: 14.76, volatilityHedged: 11.0, uncertainty: 2.5 },
  carry: { kind: 'premium', premium: 3.28, volatility: 12.26, volatilityHedged: 10.03, uncertainty: 2.91 },
};

/**
 * The ECB anchors frozen on 08/10/2026 (RQ2): €STR, the AAA euro-area 10-year spot yield and the long-run
 * expected inflation of the SPF, nominal percent. The fallback of any series the daily cron (Q3) has not read.
 */
export const MONTE_CARLO_FROZEN_ANCHORS = { estr: 2.439, aaa10y: 3.5192, inflation: 2.0369, asOf: '08/10/2026' } as const;

export type MonteCarloAnchors = {
  estr: number;
  aaa10y: number;
  inflation: number;
  asOf: string;
  /** Q3: the date of each series' last observation when it was read from the ECB; absent = the frozen value. */
  estrDate?: string;
  aaa10yDate?: string;
  /** `YYYY-Qn`. */
  inflationPeriod?: string;
};

/**
 * Default correlations of the real euro log-returns, not hedged (§ 14.6; V-D4, V-D9, V-D12): the 21 pairs of the
 * upper triangle in `MONTE_CARLO_CLASSES` order, row by row. Positive semi-definite as it stands (minimum
 * eigenvalue 0,417): rule R5 does not touch it.
 */
export const MONTE_CARLO_DEFAULT_CORRELATIONS: readonly number[] = [
  0, 0, 0.35, 0, 0, 0, // Azioni with Obbligazioni, Oro, Materie prime, Liquidità, Trend, Carry
  0, 0, 0.5, 0, 0, // Obbligazioni with Oro … Carry
  0, -0.3, 0, 0, // Oro with Materie prime … Carry
  0, 0, 0, // Materie prime with Liquidità, Trend, Carry
  0, 0, // Liquidità with Trend, Carry
  0.5, // Trend with Carry
];

export const MONTE_CARLO_CORRELATIONS_SOURCE = {
  id: 'R0-bis',
  series: 'log-rendimenti annui reali in euro, periodo comune di ogni coppia',
  period: 'oro dal 1981, materie prime dal 1980, Trend DBMF dal 2001, Carry 2002–2025',
  asOf: DOWNLOAD_AS_OF,
  note: 'Valore misurato arrotondato a 0,05 dove significativo al 5% o meccanico, altrimenti 0.',
} as const;

/**
 * Default spread of the leverage, percent (README § 2.3, R0 § 6): the debt of a leveraged portfolio costs the
 * Liquidità return of the year plus this. Measured as the implicit cost of a 2x UCITS ETF over €STR, 2020–2025,
 * about 2,0% a year; a retail broker's spread was not measured (R0 § 8), so this stands for it.
 */
export const MONTE_CARLO_DEFAULT_LEVERAGE_SPREAD = 2;

/** A fresh copy every call — the caller may edit it. */
export function getDefaultMonteCarloCorrelations(): number[] {
  return [...MONTE_CARLO_DEFAULT_CORRELATIONS];
}

/** The date the numbers were collected, for the tile's reading («valori storici fino al …»). */
export const MONTE_CARLO_DEFAULTS_LAST_YEAR = 2025;

// ─── Format v1: ONLY for the migration (RQ8) ──────────────────────────────────────────────────────

/** v1 inflation, percent (US CPI 1928–2025), the same in the three scenarios. */
export const LEGACY_V1_DEFAULT_INFLATION = 3.04;

type Triple = { bear: [number, number]; base: [number, number]; bull: [number, number] };

/** v1 CAGR / volatility per class and scenario, nominal USD percent. */
const LEGACY_V1_DEFAULT_TABLE: Record<MonteCarloClass, Triple> = {
  equity: { bear: [8.01, 17.02], base: [10.02, 19.4], bull: [12.19, 21.33] },
  bonds: { bear: [2.08, 5.69], base: [4.53, 7.9], bull: [8.01, 11.05] },
  gold: { bear: [2.94, 27.31], base: [8.89, 27.31], bull: [15.19, 27.31] },
  commodity: { bear: [-1.98, 22.46], base: [2.98, 22.46], bull: [8.19, 22.46] },
  cash: { bear: [1.81, 4.1], base: [3.37, 3.04], bull: [4.8, 2.38] },
  trendFollowing: { bear: [4.64, 7.9], base: [6.46, 7.9], bull: [8.32, 7.9] },
  carry: { bear: [1.47, 18.41], base: [5.6, 18.41], bull: [9.9, 18.41] },
};

function buildLegacyScenario(key: 'bear' | 'base' | 'bull'): MonteCarloMarketScenario {
  const classes = {} as MonteCarloMarketScenario['classes'];
  for (const cls of Object.keys(LEGACY_V1_DEFAULT_TABLE) as MonteCarloClass[]) {
    const [cagr, volatility] = LEGACY_V1_DEFAULT_TABLE[cls][key];
    classes[cls] = { cagr, volatility };
  }
  return { classes, inflationRate: LEGACY_V1_DEFAULT_INFLATION };
}

/** The v1 defaults as a v1 document. A fresh copy every call. */
export function getLegacyV1DefaultMarket(): MonteCarloMarketSettingsV1 {
  return {
    version: 1,
    scenarios: { bear: buildLegacyScenario('bear'), base: buildLegacyScenario('base'), bull: buildLegacyScenario('bull') },
  };
}

/** The v1 default correlations (R0, 1928–2025). */
export const LEGACY_V1_DEFAULT_CORRELATIONS: readonly number[] = [
  0.0224, -0.1676, 0.2441, -0.0043, -0.2708, -0.2868,
  -0.0586, -0.1891, 0.2664, 0.1022, 0.2108,
  0.1615, -0.0072, 0.1658, -0.0069,
  0.1645, 0.1763, -0.2316,
  0.0817, 0.3524,
  -0.0008,
];
