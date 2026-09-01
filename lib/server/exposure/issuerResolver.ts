/**
 * issuerResolver — resolves the Emittenti view's display name for one instrument. Pure and
 * I/O-free (it takes Yahoo's answer as a parameter rather than fetching it) despite living under
 * `lib/server/exposure/` — grouped here by DOMAIN (the resolver cascade), not by layer; it is
 * tested directly with no Firestore/Yahoo mocking needed.
 *
 * Precedence: a curated override ALWAYS wins (it exists specifically to merge Yahoo's
 * inconsistent `fundProfile.family` strings for the same real-world issuer — WisdomTree returns
 * "WisdomTree Management Limited" for one ETF and "WisdomTree Multi Asset Issuer PLC" for another;
 * without the override those would sit in two unrelated-looking rows and hide the 49%
 * concentration the whole point of this view is to surface). A direct stock's issuer is the
 * company itself — the asset's own `name`, never Yahoo's `fundProfile` (stocks have none). A fund
 * with neither an override nor a resolvable Yahoo family is `nonLetta` — never silently "Altro".
 */
import type { Asset } from '@/types/assets';

export function resolveIssuer(
  asset: Asset,
  yahooFundFamily: string | null,
  curatedIssuer: string | undefined
): string | null {
  if (curatedIssuer) return curatedIssuer;
  if (asset.type === 'stock') return asset.name;
  if (yahooFundFamily) return yahooFundFamily;
  return null;
}
