/**
 * Three-macro-area equity geography, used only by the weight optimizer (`weightOptimizer.ts`) to
 * compare an instrument's country mix against a reference index. One classification only — MSCI's
 * — is used for BOTH the instruments and the reference index, never a per-source mix: FTSE
 * classifies South Korea among Developed markets while MSCI puts it in Emerging, so with FTSE
 * All-World as the reference roughly 2.4 points of Korea move from `developedExUs` to `emerging`
 * on this app. That is intentional — internal consistency beats fidelity to any one provider.
 */

export type GeoArea = 'us' | 'developedExUs' | 'emerging';

export const GEO_AREAS: readonly GeoArea[] = ['us', 'developedExUs', 'emerging'];

export const GEO_AREA_LABELS: Record<GeoArea, string> = {
  us: 'Stati Uniti',
  developedExUs: 'Sviluppati ex USA',
  emerging: 'Emergenti',
};

/** MSCI Emerging Markets classification (review yearly, after MSCI's June market classification). */
export const EMERGING_MARKET_CODES: ReadonlySet<string> = new Set([
  'BR', 'CL', 'CN', 'CO', 'CZ', 'EG', 'GR', 'HU', 'IN', 'ID', 'KR', 'KW', 'MY', 'MX', 'PE', 'PH',
  'PL', 'QA', 'SA', 'ZA', 'TW', 'TH', 'TR', 'AE',
]);

/** `'US'` → `us`; a code in `EMERGING_MARKET_CODES` → `emerging`; the curated `'OTHER'` slice
 *  (a profile's un-itemised residual, resolved separately by `areasFromCountries`) → `null`;
 *  every other country code → `developedExUs`. */
export function countryToArea(code: string): GeoArea | null {
  if (code === 'US') return 'us';
  if (EMERGING_MARKET_CODES.has(code)) return 'emerging';
  if (code === 'OTHER') return null;
  return 'developedExUs';
}
