/**
 * Default market assumptions of the Monte Carlo — the ONLY file the research numbers enter the
 * code in (doc/montecarlo/README.md § 2; research R0, delivered 2026-10-03,
 * /mnt/project-files/montecarlo/R0-valori-predefiniti.md § 11).
 *
 * CAGR / volatility in percent. Volatility is the standard deviation of SIMPLE annual returns
 * (the `σa` of rule R1). The series are in USD and the returns are those of the long-run
 * history; one inflation (3,04%, US CPI 1928–2025) in the three scenarios.
 *
 * Bear and Bull follow a two-branch rule (README § 2.2): series of 60+ years take the 10th/90th
 * percentile of the REAL 30-year-window CAGR (branch 1); shorter series take the percentile of
 * the Base lognormal over 30 years, `exp(m ± 1,2816·s/√30) − 1` (branch 2).
 */
import type { MonteCarloClass } from './monteCarloClasses';
import type { MonteCarloMarketScenario, MonteCarloMarketSettings } from '@/types/assets';

export interface MonteCarloClassSource {
  /** Short source id, as in the research (F1 = Damodaran, F9 = testfolio simulations …). */
  id: string;
  /** What the series is. */
  series: string;
  /** Years covered. */
  period: string;
  /** Date of the download. */
  asOf: string;
  /** Which Bear/Bull branch produced the scenarios (README § 2.2). */
  branch: 1 | 2;
  /** One sentence that the tile can print as it is. */
  note?: string;
}

const DAMODARAN_AS_OF = '01/01/2026';
const DOWNLOAD_AS_OF = '03/10/2026';

export const MONTE_CARLO_CLASS_SOURCES: Record<MonteCarloClass, MonteCarloClassSource> = {
  equity: { id: 'F1', series: 'S&P 500 con dividendi (Damodaran)', period: '1928–2025', asOf: DAMODARAN_AS_OF, branch: 1 },
  bonds: { id: 'F1', series: 'Treasury 10 anni (Damodaran)', period: '1928–2025', asOf: DAMODARAN_AS_OF, branch: 1 },
  gold: { id: 'F1', series: 'Oro (Damodaran), confermato da GLDSIM', period: '1972–2025', asOf: DAMODARAN_AS_OF, branch: 2 },
  commodity: {
    id: 'F9',
    series: 'S&P GSCI (GSGSIM, testfolio)',
    period: '1980–2025',
    asOf: DOWNLOAD_AS_OF,
    branch: 2,
    note: 'In 46 anni ha reso meno dell’inflazione: il default lo dice.',
  },
  cash: { id: 'F1', series: 'T-bill 3 mesi (Damodaran)', period: '1928–2025', asOf: DAMODARAN_AS_OF, branch: 1 },
  trendFollowing: {
    id: 'F9',
    series: 'DBMFSIM (testfolio)',
    period: '2000–2025',
    asOf: DOWNLOAD_AS_OF,
    branch: 2,
    note: 'Serie investibile, al netto dei costi: non il fattore accademico lordo.',
  },
  carry: {
    id: 'F9',
    series: 'UEQCSIM (testfolio), meno 1% annuo di costi',
    period: 'rendimento 2015–2025, volatilità 2025–2026',
    asOf: DOWNLOAD_AS_OF,
    branch: 2,
    note: 'Rendimento e rischio vengono da due tratti diversi: scelta di giudizio, vedi il dossier.',
  },
};

/** Inflation, the same in the three scenarios (README § 2.1). */
export const MONTE_CARLO_DEFAULT_INFLATION = 3.04;

type Triple = { bear: [number, number]; base: [number, number]; bull: [number, number] };

/** CAGR / volatility per class and scenario, percent (README § 2.3). */
const DEFAULT_TABLE: Record<MonteCarloClass, Triple> = {
  equity: { bear: [8.01, 17.02], base: [10.02, 19.4], bull: [12.19, 21.33] },
  bonds: { bear: [2.08, 5.69], base: [4.53, 7.9], bull: [8.01, 11.05] },
  gold: { bear: [2.94, 27.31], base: [8.89, 27.31], bull: [15.19, 27.31] },
  commodity: { bear: [-1.98, 22.46], base: [2.98, 22.46], bull: [8.19, 22.46] },
  cash: { bear: [1.81, 4.1], base: [3.37, 3.04], bull: [4.8, 2.38] },
  trendFollowing: { bear: [4.64, 7.9], base: [6.46, 7.9], bull: [8.32, 7.9] },
  carry: { bear: [1.47, 18.41], base: [5.6, 18.41], bull: [9.9, 18.41] },
};

function buildScenario(key: 'bear' | 'base' | 'bull'): MonteCarloMarketScenario {
  const classes = {} as MonteCarloMarketScenario['classes'];
  for (const cls of Object.keys(DEFAULT_TABLE) as MonteCarloClass[]) {
    const [cagr, volatility] = DEFAULT_TABLE[cls][key];
    classes[cls] = { cagr, volatility };
  }
  return { classes, inflationRate: MONTE_CARLO_DEFAULT_INFLATION };
}

/** A fresh copy every call — the caller may edit it. */
export function getDefaultMonteCarloMarket(): MonteCarloMarketSettings {
  return {
    version: 1,
    scenarios: { bear: buildScenario('bear'), base: buildScenario('base'), bull: buildScenario('bull') },
  };
}

/**
 * Default correlations of the log-returns (README § 2.3, research R0 `r0-dati/corr_v3.csv`): the 21
 * pairs of the upper triangle in `MONTE_CARLO_CLASSES` order, row by row. Each pair is measured on
 * the longest common period of the two series (with Trend 2000–2025, with Carry 2002–2025, with
 * Materie prime 1980–2025, with Oro 1972–2025, the others 1928–2025). The matrix is positive
 * semi-definite as it stands (minimum eigenvalue 0,42): rule R5 does not touch it.
 */
export const MONTE_CARLO_DEFAULT_CORRELATIONS: readonly number[] = [
  0.0224, -0.1676, 0.2441, -0.0043, -0.2708, -0.2868, // Azioni with Obbligazioni, Oro, Materie prime, Liquidità, Trend, Carry
  -0.0586, -0.1891, 0.2664, 0.1022, 0.2108, // Obbligazioni with Oro … Carry
  0.1615, -0.0072, 0.1658, -0.0069, // Oro with Materie prime … Carry
  0.1645, 0.1763, -0.2316, // Materie prime with Liquidità, Trend, Carry
  0.0817, 0.3524, // Liquidità with Trend, Carry
  -0.0008, // Trend with Carry
];

export const MONTE_CARLO_CORRELATIONS_SOURCE = {
  id: 'R0',
  series: 'log-rendimenti annui, periodo comune più lungo di ogni coppia',
  period: '1928–2025',
  asOf: DOWNLOAD_AS_OF,
  note: 'Dati annuali: su dati mensili Materie prime–Carry vale circa −0,58 contro −0,23. Il modello è annuale.',
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
