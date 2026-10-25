/**
 * The risk-free rate in force (Impostazioni › Allocazione, doc/guide/impostazioni.md § Risk-free rate).
 *
 * ONE number feeds the Sharpe and Sortino ratios, the Rendimenti report, the PDF, the periodic email and The Bull's
 * equity formula. It is either TYPED by the reader (`AssetAllocationSettings.riskFreeRate`, kept as it is) or an
 * ESTIMATE: the AAA euro-area 10-year spot yield the daily cron already reads from the ECB
 * (`ecb-rate-cache/market-anchors`, Q3), the frozen anchor of 08/10/2026 when the cron never ran. A typed value
 * always wins; clearing it returns to the estimate. Pure: the Firestore read is `useMarketAnchors` (client) and
 * `readStoredMarketAnchors` (server).
 */
import { MONTE_CARLO_FROZEN_ANCHORS, type MonteCarloAnchors } from '@/lib/constants/monteCarloMarketDefaults';

export type RiskFreeSource = 'user' | 'ecb' | 'frozen';

export interface RiskFreeResolution {
  /** Percent, e.g. 3.52. */
  value: number;
  /** `user` = typed in Impostazioni; `ecb` = the cron's last reading; `frozen` = the anchor of 08/10/2026. */
  source: RiskFreeSource;
  /** ISO date of the ECB observation, only with `source === 'ecb'`. */
  date?: string;
}

/** The estimate alone, ignoring what the reader typed. */
export function resolveRiskFreeEstimate(anchors: MonteCarloAnchors = MONTE_CARLO_FROZEN_ANCHORS): RiskFreeResolution {
  if (anchors.aaa10yDate) return { value: anchors.aaa10y, source: 'ecb', date: anchors.aaa10yDate };
  return { value: anchors.aaa10y, source: 'frozen' };
}

/**
 * `??`, not `||`: a deliberate 0% is a legitimate typed value (it makes Sharpe the raw return over volatility) and must
 * not be replaced by the estimate.
 */
export function resolveRiskFreeRate(saved: number | undefined | null, anchors: MonteCarloAnchors = MONTE_CARLO_FROZEN_ANCHORS): RiskFreeResolution {
  if (typeof saved === 'number' && Number.isFinite(saved)) return { value: saved, source: 'user' };
  return resolveRiskFreeEstimate(anchors);
}
