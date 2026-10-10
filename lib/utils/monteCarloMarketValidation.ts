import type { MonteCarloMarketSettingsV2 } from '@/types/assets';
import { MONTE_CARLO_CLASSES, MONTE_CARLO_CLASS_LABELS } from '@/lib/constants/monteCarloClasses';
import { pairIndices } from './correlationMatrix';

export const MONTE_CARLO_BOUNDS = {
  cagr: { min: -50, max: 100 },
  premium: { min: -20, max: 30 },
  volatility: { min: 0, max: 200 },
  uncertainty: { min: 0, max: 20 },
  inflation: { min: -5, max: 20 },
  correlation: { min: -1, max: 1 },
  spread: { min: 0, max: 20 },
} as const;

const fmt = (value: number) => value.toLocaleString('it-IT');

export interface MonteCarloMarketProblem {
  /** «Trend» — where. */
  where: string;
  field: 'cagr' | 'premium' | 'volatility' | 'uncertainty' | 'inflation' | 'correlation' | 'spread';
  message: string;
}

function outside(value: number, bounds: { min: number; max: number }): 'below' | 'above' | null {
  if (!Number.isFinite(value)) return 'below';
  if (value < bounds.min) return 'below';
  if (value > bounds.max) return 'above';
  return null;
}

const FIELD_NAMES = { cagr: 'CAGR', premium: 'premio', volatility: 'volatilità', uncertainty: 'incertezza', inflation: 'inflazione' } as const;

/** Every field out of range, in reading order (class by class, then the rest). Only what is written is checked. */
export function findMonteCarloMarketProblems(market: MonteCarloMarketSettingsV2): MonteCarloMarketProblem[] {
  const problems: MonteCarloMarketProblem[] = [];
  const check = (where: string, field: 'cagr' | 'premium' | 'volatility' | 'uncertainty' | 'inflation', value: number | undefined) => {
    if (value === undefined) return;
    const result = outside(value, MONTE_CARLO_BOUNDS[field]);
    if (!result) return;
    const limit = result === 'below' ? MONTE_CARLO_BOUNDS[field].min : MONTE_CARLO_BOUNDS[field].max;
    problems.push({ where, field, message: `${where}: ${FIELD_NAMES[field]} ${result === 'below' ? 'sotto' : 'oltre'} ${fmt(limit)}%` });
  };
  for (const cls of MONTE_CARLO_CLASSES) {
    const entry = market.classes?.[cls];
    if (!entry) continue;
    const where = MONTE_CARLO_CLASS_LABELS[cls];
    check(where, 'cagr', entry.cagr);
    check(where, 'premium', entry.premium);
    check(where, 'volatility', entry.volatility);
    check(where, 'uncertainty', entry.uncertainty);
  }
  check('Inflazione', 'inflation', market.inflationRate);
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
