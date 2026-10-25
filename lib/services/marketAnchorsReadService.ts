import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MONTE_CARLO_FROZEN_ANCHORS, type MonteCarloAnchors } from '@/lib/constants/monteCarloMarketDefaults';
import { toMonteCarloAnchors, type StoredMarketAnchors } from '@/lib/utils/marketAnchors';

/** `ecb-rate-cache/market-anchors` as the daily cron wrote it; null when the document does not exist. */
export async function getStoredMarketAnchors(): Promise<StoredMarketAnchors | null> {
  const snap = await getDoc(doc(db, 'ecb-rate-cache', 'market-anchors'));
  return snap.exists() ? (snap.data() as StoredMarketAnchors) : null;
}

/**
 * The anchors a figure can read right now: the cron's, else the frozen ones. A failed read is the frozen anchors, never
 * an error — the risk-free estimate (doc/guide/impostazioni.md § Risk-free rate) must not stop a Sharpe from printing.
 */
export async function readMarketAnchors(): Promise<MonteCarloAnchors> {
  try {
    return toMonteCarloAnchors(await getStoredMarketAnchors());
  } catch (error) {
    console.warn('[market-anchors] read failed, using the frozen anchors:', error);
    return { ...MONTE_CARLO_FROZEN_ANCHORS };
  }
}
