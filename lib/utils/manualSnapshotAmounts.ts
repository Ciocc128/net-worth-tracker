/**
 * The euro amounts of a manual snapshot's asset-class tab, as data rather than as six pieces
 * of component state.
 *
 * Why it is its own module: the form cross-validates the sum of the class fields against the
 * declared total, so the set of fields it offers is not cosmetic — a class the form does not
 * ask for makes an honest snapshot *impossible to enter*, because the fields it does offer can
 * never reach the total. Six hard-coded fields did exactly that to `trendFollowing` and `carry`
 * from the day the union was widened until 2026-08-30. Keyed off `ASSET_CLASS_SEQUENCE`, the
 * app-wide enumeration, the shape follows the union by construction.
 *
 * The values are STRINGS because they are `<input type="number">` values: an empty field, a
 * half-typed '1.' and a '0' are three different things to the form and must survive round-trip
 * unchanged. Parsing happens here, once, at the boundary.
 */

import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

/** One entry per asset class, every field starting at '0'. */
export function emptyClassAmounts(): Record<string, string> {
  return Object.fromEntries(ASSET_CLASS_SEQUENCE.map((assetClass) => [assetClass, '0']));
}

/**
 * A field's euro value. An empty, blank or unparseable field is 0 — the form's own convention:
 * a class left alone did not happen, it is not an error. NaN never escapes.
 */
export function parseAmount(raw: string | undefined): number {
  const value = parseFloat((raw ?? '').trim());
  return Number.isFinite(value) ? value : 0;
}

/**
 * The total the form validates against the declared net worth.
 *
 * It sums the CLASSES the union knows, not the keys present in the record: a stale key left by
 * an older document must not silently inflate the sum the user is asked to reconcile.
 */
export function sumClassAmounts(amounts: Record<string, string>): number {
  return ASSET_CLASS_SEQUENCE.reduce((total, assetClass) => total + parseAmount(amounts[assetClass]), 0);
}

/** The figures a manual snapshot declares, as the coherence check reads them. */
export interface ManualSnapshotTotals {
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  byAssetClass: Partial<Record<string, number>>;
}

/** The tolerance of both sums, in euro: floating-point rounding, never a real gap. */
export const MANUAL_SNAPSHOT_TOLERANCE = 0.01;

/**
 * RI8 — the two sums a month must satisfy, on the server as in the dialog: the classes sum to the
 * total, liquid plus illiquid sum to the total (± 0,01). Returns the Italian sentence the dialog
 * shows, or null when the month is coherent.
 */
export function describeManualSnapshotIncoherence(totals: ManualSnapshotTotals): string | null {
  const classSum = ASSET_CLASS_SEQUENCE.reduce((sum, assetClass) => sum + (totals.byAssetClass[assetClass] ?? 0), 0);
  if (Math.abs(classSum - totals.totalNetWorth) > MANUAL_SNAPSHOT_TOLERANCE) {
    return `Le classi sommano a ${cachedFormatCurrencyEUR(classSum)}, il patrimonio totale è ${cachedFormatCurrencyEUR(totals.totalNetWorth)}: i due devono coincidere.`;
  }
  const split = totals.liquidNetWorth + totals.illiquidNetWorth;
  if (Math.abs(split - totals.totalNetWorth) > MANUAL_SNAPSHOT_TOLERANCE) {
    return `Liquido e illiquido sommano a ${cachedFormatCurrencyEUR(split)}, il patrimonio totale è ${cachedFormatCurrencyEUR(totals.totalNetWorth)}: i due devono coincidere.`;
  }
  return null;
}
