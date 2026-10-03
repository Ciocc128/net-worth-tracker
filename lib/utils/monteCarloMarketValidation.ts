/**
 * Bounds of the Monte Carlo market assumptions (doc/montecarlo/README.md § 4.2). Returns the
 * fields out of range BY NAME — «Trend, Toro: volatilità oltre 200%» — the way
 * `allocationTargetValidation.ts` names a broken target, so the toast and the tile say where.
 */
import type { MonteCarloMarketSettings } from '@/types/assets';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS } from '@/lib/constants/monteCarloClasses';
import { pairIndices } from './correlationMatrix';

export const MONTE_CARLO_BOUNDS = {
  cagr: { min: -50, max: 100 },
  volatility: { min: 0, max: 200 },
  inflation: { min: -5, max: 20 },
  correlation: { min: -1, max: 1 },
  spread: { min: 0, max: 20 },
} as const;

const SCENARIO_NAMES = { bear: 'Orso', base: 'Base', bull: 'Toro' } as const;

const fmt = (value: number) => value.toLocaleString('it-IT');

export interface MonteCarloMarketProblem {
  /** «Trend, Toro» — where. */
  where: string;
  field: 'cagr' | 'volatility' | 'inflation' | 'correlation' | 'spread';
  message: string;
}

function outside(value: number, bounds: { min: number; max: number }): 'below' | 'above' | null {
  if (!Number.isFinite(value)) return 'below';
  if (value < bounds.min) return 'below';
  if (value > bounds.max) return 'above';
  return null;
}

/** Every field out of range, in reading order (class by class, scenario by scenario, then the rest). */
export function findMonteCarloMarketProblems(market: MonteCarloMarketSettings): MonteCarloMarketProblem[] {
  const problems: MonteCarloMarketProblem[] = [];
  for (const cls of MONTE_CARLO_CLASSES) {
    for (const key of ['bear', 'base', 'bull'] as const) {
      const params = market.scenarios[key].classes[cls];
      const where = `${MONTE_CARLO_CLASS_LABELS[cls]}, ${SCENARIO_NAMES[key]}`;
      const cagr = outside(params.cagr, MONTE_CARLO_BOUNDS.cagr);
      if (cagr) {
        problems.push({
          where,
          field: 'cagr',
          message: `${where}: CAGR ${cagr === 'below' ? 'sotto' : 'oltre'} ${fmt(cagr === 'below' ? MONTE_CARLO_BOUNDS.cagr.min : MONTE_CARLO_BOUNDS.cagr.max)}%`,
        });
      }
      const volatility = outside(params.volatility, MONTE_CARLO_BOUNDS.volatility);
      if (volatility) {
        problems.push({
          where,
          field: 'volatility',
          message: `${where}: volatilità ${volatility === 'below' ? 'sotto' : 'oltre'} ${fmt(volatility === 'below' ? MONTE_CARLO_BOUNDS.volatility.min : MONTE_CARLO_BOUNDS.volatility.max)}%`,
        });
      }
    }
  }
  for (const key of ['bear', 'base', 'bull'] as const) {
    const inflation = outside(market.scenarios[key].inflationRate, MONTE_CARLO_BOUNDS.inflation);
    if (inflation) {
      const where = `Inflazione, ${SCENARIO_NAMES[key]}`;
      problems.push({
        where,
        field: 'inflation',
        message: `${where}: ${inflation === 'below' ? 'sotto' : 'oltre'} ${fmt(inflation === 'below' ? MONTE_CARLO_BOUNDS.inflation.min : MONTE_CARLO_BOUNDS.inflation.max)}%`,
      });
    }
  }
  (market.correlations ?? []).forEach((value, index) => {
    const result = outside(value, MONTE_CARLO_BOUNDS.correlation);
    if (result) {
      // «Azioni–Obbligazioni»: the pair, by name (the index is the upper-triangle slot).
      const pair = pairIndices(MONTE_CARLO_CLASSES.length)[index];
      const where = pair ? `Correlazione ${MONTE_CARLO_CLASS_LABELS[MONTE_CARLO_CLASSES[pair[0]]]}–${MONTE_CARLO_CLASS_LABELS[MONTE_CARLO_CLASSES[pair[1]]]}` : `Correlazione ${index + 1}`;
      problems.push({ where, field: 'correlation', message: `${where}: fuori da −1 e 1` });
    }
  });
  if (market.leverageSpread !== undefined) {
    const spread = outside(market.leverageSpread, MONTE_CARLO_BOUNDS.spread);
    if (spread) problems.push({ where: 'Spread della leva', field: 'spread', message: `Spread della leva: ${spread === 'below' ? 'sotto' : 'oltre'} ${fmt(spread === 'below' ? MONTE_CARLO_BOUNDS.spread.min : MONTE_CARLO_BOUNDS.spread.max)}%` });
  }
  return problems;
}
