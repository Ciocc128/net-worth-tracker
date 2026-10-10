import { adminDb } from '@/lib/firebase/admin';
import { parseEcbLastObservation, type EcbObservation } from '@/lib/utils/ecbCsv';
import { mergeStoredAnchors, type StoredMarketAnchors } from '@/lib/utils/marketAnchors';

/**
 * The ECB anchors of the Monte Carlo market (doc/montecarlo/README.md § 14.5 RQ9, Q3): €STR, the AAA 10-year spot
 * yield and the SPF long-run inflation, read from the ECB Data API (CSV, no key) by the daily cron and stored in
 * `ecb-rate-cache/market-anchors` (global, Admin SDK write only: the collection's rule already says so).
 */
const CACHE_COLLECTION = 'ecb-rate-cache';
const CACHE_DOC = 'market-anchors';
const REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;
const ECB_API = 'https://data-api.ecb.europa.eu/service/data';

const SERIES = {
  estr: { flow: 'EST', key: 'B.EU000A2X2A25.WT' },
  aaa10y: { flow: 'YC', key: 'B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y' },
  inflation: { flow: 'SPF', key: 'Q.U2.HICP.POINT.LT.Q.AVG' },
} as const;

/** The last observation of one series; null on any failure, so one series never stops the others. */
export async function fetchEcbSeriesLast(flow: string, key: string): Promise<EcbObservation | null> {
  try {
    const res = await fetch(`${ECB_API}/${flow}/${key}?lastNObservations=1&format=csvdata`, { headers: { Accept: 'text/csv' } });
    if (!res.ok) {
      console.warn(`[market-anchors] ${flow}/${key}: HTTP ${res.status}`);
      return null;
    }
    return parseEcbLastObservation(await res.text());
  } catch (error) {
    console.warn(`[market-anchors] ${flow}/${key} failed:`, error);
    return null;
  }
}

export async function readStoredMarketAnchors(): Promise<StoredMarketAnchors | null> {
  const snap = await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC).get();
  return snap.exists ? (snap.data() as StoredMarketAnchors) : null;
}

/** Skips when the document is younger than 20 hours (a second cron call downloads nothing). Returns whether it fetched. */
export async function refreshMarketAnchorsIfStale(now: Date = new Date()): Promise<boolean> {
  const stored = await readStoredMarketAnchors();
  const fetchedAt = stored?.fetchedAt ? Date.parse(stored.fetchedAt) : NaN;
  if (Number.isFinite(fetchedAt) && now.getTime() - fetchedAt < REFRESH_AFTER_MS) return false;

  const [estr, aaa10y, inflation] = await Promise.all([
    fetchEcbSeriesLast(SERIES.estr.flow, SERIES.estr.key),
    fetchEcbSeriesLast(SERIES.aaa10y.flow, SERIES.aaa10y.key),
    fetchEcbSeriesLast(SERIES.inflation.flow, SERIES.inflation.key),
  ]);
  const merged = mergeStoredAnchors(stored, { estr, aaa10y, inflation }, now.toISOString());
  await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC).set(merged);
  return true;
}
