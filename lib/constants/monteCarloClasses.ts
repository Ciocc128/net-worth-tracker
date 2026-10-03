/**
 * The seven classes the Monte Carlo simulates (doc/montecarlo/README.md § 4.1).
 *
 * The ORDER is the order of the correlation matrix's upper triangle (T2), so it is part of the
 * data format: never reorder. The keys are `AssetClass` keys plus `gold`, which is not an
 * `AssetClass` — it is the commodity sub-category the user names in Impostazioni › Simulazioni
 * (rule RG). Crypto and real estate are NOT classes of the simulation: their value stays outside
 * the simulated capital.
 */
export const MONTE_CARLO_CLASSES = [
  'equity',
  'bonds',
  'gold',
  'commodity',
  'cash',
  'trendFollowing',
  'carry',
] as const;

export type MonteCarloClass = (typeof MONTE_CARLO_CLASSES)[number];

/** Italian labels, as the product shows them (the same words as `ASSET_CLASS_LABELS` where the class is shared). */
export const MONTE_CARLO_CLASS_LABELS: Record<MonteCarloClass, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  gold: 'Oro',
  commodity: 'Materie prime',
  cash: 'Liquidità',
  trendFollowing: 'Trend',
  carry: 'Carry',
};

/** Lower-case form for running prose («il 58% in azioni»). */
export const MONTE_CARLO_CLASS_NOUNS: Record<MonteCarloClass, string> = {
  equity: 'azioni',
  bonds: 'obbligazioni',
  gold: 'oro',
  commodity: 'materie prime',
  cash: 'liquidità',
  trendFollowing: 'trend',
  carry: 'carry',
};

/** The `AssetClass` values that stay outside the simulated capital, with the labels the tile prints. */
export const MONTE_CARLO_EXCLUDED_CLASSES = ['realestate', 'crypto'] as const;
export type MonteCarloExcludedClass = (typeof MONTE_CARLO_EXCLUDED_CLASSES)[number];
export const MONTE_CARLO_EXCLUDED_LABELS: Record<MonteCarloExcludedClass, string> = {
  realestate: 'Immobili',
  crypto: 'Crypto',
};

/** Builds a record with the same value for every class — the empty weights, the zeroed totals. */
export function monteCarloClassRecord<T>(make: (cls: MonteCarloClass) => T): Record<MonteCarloClass, T> {
  const out = {} as Record<MonteCarloClass, T>;
  for (const cls of MONTE_CARLO_CLASSES) out[cls] = make(cls);
  return out;
}
