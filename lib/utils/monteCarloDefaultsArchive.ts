/**
 * Control of the Monte Carlo default values against the archived research data (doc/montecarlo/README.md § 14.13, RQ10).
 *
 * Pure: it recomputes the table of § 14.6 from the ANNUAL series kept in `data/montecarlo/annual_series.csv` (nominal annual
 * returns in euro per class, hedged where a hedge exists, plus the European CPI) with the method of R0-bis `b2`/`b4`/`b6`, and
 * compares it with `monteCarloMarketDefaults.ts`. The anchors and premia are INPUTS read from the manifest, not recomputed
 * (they come from the ECB and from a judgement call, DQ1). Nothing here runs in the app; the script
 * `scripts/monteCarloDefaults.mts` and `__tests__/monteCarloDefaultsArchive.test.ts` are the two callers.
 */
import { createHash } from 'node:crypto';

import type { MonteCarloClass } from '@/lib/constants/monteCarloClasses';
import {
  MONTE_CARLO_CLASS_DEFAULTS,
  MONTE_CARLO_FROZEN_ANCHORS,
  MONTE_CARLO_HEDGEABLE_CLASSES,
  defaultCorrelations,
  type MonteCarloHedgeableClass,
} from '@/lib/constants/monteCarloMarketDefaults';

export const ARCHIVE_CLASSES: readonly MonteCarloClass[] = ['equity', 'bonds', 'gold', 'commodity', 'cash', 'trendFollowing', 'carry'];

/** The CSV column of each class (unhedged); the hedged one is `${column}_hedged`. */
const COLUMN: Record<MonteCarloClass, string> = {
  equity: 'equity',
  bonds: 'bonds',
  gold: 'gold',
  commodity: 'commodity',
  cash: 'cash',
  trendFollowing: 'trend',
  carry: 'carry',
};

/** Tolerance of AQ43 on CAGR, volatility and uncertainty, percentage points. */
export const DEFAULTS_TOLERANCE = 0.005;

export interface AnnualTable {
  years: number[];
  columns: Record<string, (number | null)[]>;
}

export function parseAnnualCsv(text: string): AnnualTable {
  const rows = text.trim().split(/\r?\n/).map((line) => line.split(','));
  const header = rows[0];
  const years: number[] = [];
  const columns: Record<string, (number | null)[]> = {};
  for (const name of header.slice(1)) columns[name] = [];
  for (const row of rows.slice(1)) {
    years.push(Number(row[0]));
    header.slice(1).forEach((name, k) => {
      const cell = row[k + 1];
      columns[name].push(cell === undefined || cell === '' ? null : Number(cell));
    });
  }
  return { years, columns };
}

/** The real annual returns of a column by year (nominal deflated by the European CPI), blank years left out. */
function realByYear(table: AnnualTable, column: string): Map<number, number> {
  const nominal = table.columns[column];
  const cpi = table.columns.cpi_eur;
  if (!nominal || !cpi) throw new Error(`Colonna mancante nell'archivio: ${column}`);
  const out = new Map<number, number>();
  table.years.forEach((year, k) => {
    const a = nominal[k];
    const p = cpi[k];
    if (a !== null && p !== null) out.set(year, (1 + a) / (1 + p) - 1);
  });
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

export interface ComputedClass {
  /** Real CAGR, percent. */
  cagr: number;
  /** Std dev of the simple annual real returns, percent. */
  volatility: number;
  volatilityHedged?: number;
  /** Std dev of the log-returns over √N, percent points. */
  uncertainty: number;
  years: number;
}

export function computeClass(table: AnnualTable, cls: MonteCarloClass): ComputedClass {
  const real = [...realByYear(table, COLUMN[cls]).values()];
  const logs = real.map((r) => Math.log1p(r));
  const out: ComputedClass = {
    cagr: 100 * (Math.exp(mean(logs)) - 1),
    volatility: 100 * sd(real),
    uncertainty: (100 * sd(logs)) / Math.sqrt(real.length),
    years: real.length,
  };
  const hedgedColumn = `${COLUMN[cls]}_hedged`;
  if (table.columns[hedgedColumn]) out.volatilityHedged = 100 * sd([...realByYear(table, hedgedColumn).values()]);
  return out;
}

/** Normal CDF (Numerical Recipes `erfc`, relative error 1.2e-7). */
function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const erfc =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? 1 - 0.5 * erfc : 0.5 * erfc;
}

export interface PairResult {
  r: number;
  n: number;
  p: number;
  /** The value after the reduction rule (V-D4): measured rounded to 0,05 where significant or mechanical, else 0. */
  final: number;
}

/** Pairs mechanically linked to the Liquidità: Obbligazioni always, Trend and Carry only once hedged (the collateral turns into euro cash). */
function isMechanical(a: MonteCarloClass, hedgedA: boolean, b: MonteCarloClass, hedgedB: boolean): boolean {
  const pair = new Set([a, b]);
  if (pair.has('bonds') && pair.has('cash')) return true;
  if (!pair.has('cash')) return false;
  return (a === 'trendFollowing' || a === 'carry' ? hedgedA : false) || (b === 'trendFollowing' || b === 'carry' ? hedgedB : false);
}

export function computePair(table: AnnualTable, a: MonteCarloClass, hedgedA: boolean, b: MonteCarloClass, hedgedB: boolean): PairResult {
  const column = (cls: MonteCarloClass, hedged: boolean) => realByYear(table, hedged ? `${COLUMN[cls]}_hedged` : COLUMN[cls]);
  const ra = column(a, hedgedA);
  const rb = column(b, hedgedB);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [year, value] of ra) {
    const other = rb.get(year);
    if (other !== undefined) {
      xs.push(Math.log1p(value));
      ys.push(Math.log1p(other));
    }
  }
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k += 1) {
    sxy += (xs[k] - mx) * (ys[k] - my);
    sxx += (xs[k] - mx) ** 2;
    syy += (ys[k] - my) ** 2;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  const p = 2 * (1 - normalCdf(Math.abs(Math.atanh(r)) * Math.sqrt(n - 3)));
  const keep = p < 0.05 || isMechanical(a, hedgedA, b, hedgedB);
  return { r, n, p, final: keep ? Math.round(r * 20) / 20 : 0 };
}

/** The 21 upper-triangle correlations (the order of `defaultCorrelations`) for a hedge combination, after the reduction rule. */
export function computeCorrelations(table: AnnualTable, hedged: Partial<Record<MonteCarloHedgeableClass, boolean>>): number[] {
  const out: number[] = [];
  for (let i = 0; i < ARCHIVE_CLASSES.length; i += 1) {
    for (let j = i + 1; j < ARCHIVE_CLASSES.length; j += 1) {
      const a = ARCHIVE_CLASSES[i];
      const b = ARCHIVE_CLASSES[j];
      const isHedged = (cls: MonteCarloClass) => (MONTE_CARLO_HEDGEABLE_CLASSES as readonly string[]).includes(cls) && hedged[cls as MonteCarloHedgeableClass] === true;
      const value = computePair(table, a, isHedged(a), b, isHedged(b)).final;
      out.push(value === 0 ? 0 : value);
    }
  }
  return out;
}

export interface ManifestFile {
  file: string;
  sha256: string;
  source: string;
  url: string | null;
  asOf: string;
  note: string;
  inRepo: boolean;
}

export interface ArchiveManifest {
  rawRoot: string;
  inputs: {
    anchors: { estr: number; aaa10y: number; inflation: number; asOf: string };
    uncertainty: Record<'bonds' | 'cash' | 'trendFollowing' | 'carry', number>;
    volatility: Record<'trendFollowing' | 'carry', { unhedged: number; hedged: number }>;
    premium: Record<'trendFollowing' | 'carry', number>;
  };
  files: ManifestFile[];
}

export const sha256Of = (content: Buffer | string): string => createHash('sha256').update(content).digest('hex');

export interface ManifestCheck {
  checked: string[];
  /** Files the manifest names that are not on this machine (the raw folder lives in the project's shared folder). */
  absent: string[];
  /** Files whose SHA-256 differs from the manifest: the NAME is what the test prints (AQ42). */
  changed: string[];
}

/** `read` returns the file's bytes or `null` when it is not there. */
export function verifyManifest(manifest: ArchiveManifest, read: (entry: ManifestFile) => Buffer | null): ManifestCheck {
  const result: ManifestCheck = { checked: [], absent: [], changed: [] };
  for (const entry of manifest.files) {
    const bytes = read(entry);
    if (bytes === null) result.absent.push(entry.file);
    else {
      result.checked.push(entry.file);
      if (sha256Of(bytes) !== entry.sha256) result.changed.push(entry.file);
    }
  }
  return result;
}

export interface DefaultsMismatch {
  cls: MonteCarloClass | 'anchors' | 'correlations';
  field: string;
  expected: number | string;
  actual: number | string;
}

type ClassDefaults = typeof MONTE_CARLO_CLASS_DEFAULTS;

function near(a: number, b: number, tolerance = DEFAULTS_TOLERANCE) {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Recomputes every figure the archive can reproduce and lists the ones that differ from `defaults` (AQ43, AQ44): the class and
 * the field are named. Historical CAGRs, volatilities and the uncertainty of the historical classes come from the series;
 * the premia, the anchors and the judged volatilities and uncertainties come from the manifest's `inputs` and are compared
 * with the defaults as they are.
 */
export function compareDefaults(
  table: AnnualTable,
  manifest: ArchiveManifest,
  defaults: ClassDefaults = MONTE_CARLO_CLASS_DEFAULTS,
  correlationsFor: (hedged: Partial<Record<MonteCarloHedgeableClass, boolean>>) => number[] = defaultCorrelations
): DefaultsMismatch[] {
  const out: DefaultsMismatch[] = [];
  const check = (cls: MonteCarloClass, field: string, expected: number | undefined, actual: number | undefined, tolerance = DEFAULTS_TOLERANCE) => {
    if (expected === undefined || actual === undefined || !near(expected, actual, tolerance)) {
      out.push({ cls, field, expected: expected ?? 'assente', actual: actual ?? 'assente' });
    }
  };
  const { inputs } = manifest;

  for (const cls of ['equity', 'gold', 'commodity'] as const) {
    const computed = computeClass(table, cls);
    check(cls, 'cagr', computed.cagr, defaults[cls].cagr);
    check(cls, 'volatility', computed.volatility, defaults[cls].volatility);
    check(cls, 'uncertainty', computed.uncertainty, defaults[cls].uncertainty);
    if (cls !== 'commodity') check(cls, 'volatilityHedged', computed.volatilityHedged, defaults[cls].volatilityHedged);
  }
  // Obbligazioni and Liquidità: the volatility is historical, the Base follows the ECB rates (RQ2), the uncertainty is an input.
  for (const cls of ['bonds', 'cash'] as const) {
    check(cls, 'volatility', computeClass(table, cls).volatility, defaults[cls].volatility);
    check(cls, 'uncertainty', inputs.uncertainty[cls], defaults[cls].uncertainty);
  }
  for (const cls of ['trendFollowing', 'carry'] as const) {
    check(cls, 'premium', inputs.premium[cls], defaults[cls].premium);
    check(cls, 'volatility', inputs.volatility[cls].unhedged, defaults[cls].volatility);
    check(cls, 'volatilityHedged', inputs.volatility[cls].hedged, defaults[cls].volatilityHedged);
    check(cls, 'uncertainty', inputs.uncertainty[cls], defaults[cls].uncertainty);
  }

  for (const key of ['estr', 'aaa10y', 'inflation', 'asOf'] as const) {
    if (inputs.anchors[key] !== MONTE_CARLO_FROZEN_ANCHORS[key]) {
      out.push({ cls: 'anchors', field: key, expected: inputs.anchors[key], actual: MONTE_CARLO_FROZEN_ANCHORS[key] });
    }
  }

  // The 16 hedge combinations: the computed matrix, after the V-D4 rule, must be the rule table of the defaults.
  const names = MONTE_CARLO_HEDGEABLE_CLASSES;
  for (let mask = 0; mask < 1 << names.length; mask += 1) {
    const hedged = Object.fromEntries(names.map((name, k) => [name, (mask & (1 << k)) !== 0])) as Record<MonteCarloHedgeableClass, boolean>;
    const computed = computeCorrelations(table, hedged);
    const stored = correlationsFor(hedged);
    computed.forEach((value, slot) => {
      if (!near(value, stored[slot], 1e-9)) {
        out.push({ cls: 'correlations', field: `${names.filter((n) => hedged[n]).join('+') || 'nessuna copertura'} · coppia ${slot}`, expected: value, actual: stored[slot] });
      }
    });
  }
  return out;
}
