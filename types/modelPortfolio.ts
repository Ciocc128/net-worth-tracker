/**
 * The model portfolio (doc/pac-ottimizzatore/README.md § RM1, PO1): ONE saved set of market weights
 * per instrument, the starting point of a PAC. One document per account, `modelPortfolios/{ownerId}`.
 */
import type { OptimizerSnapshot } from '@/types/accumulationPlan';

/** One instrument of the model portfolio. */
export interface ModelPortfolioWeight {
  assetId: string;
  /** Market weight; Σ over the model === 100 (±0.01). */
  targetPercentage: number;
  /** True for an instrument held at 0 shares only to be evaluated (PO10, D7). */
  candidate?: boolean;
}

export interface ModelPortfolio {
  userId: string; // ownerId (shared-account convention)
  weights: ModelPortfolioWeight[];
  origin: 'manual' | 'optimizer';
  /** The same type the PAC stores: documents the calculation the weights started from. */
  optimizerSnapshot?: OptimizerSnapshot;
  updatedAt: Date;
}

/** What the caller supplies; `userId` and `updatedAt` are the service's. */
export type ModelPortfolioInput = Pick<ModelPortfolio, 'weights' | 'origin' | 'optimizerSnapshot'>;
