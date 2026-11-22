/**
 * UM2 trial switch (doc/ui-movimento/README.md § 5.2, P3): which way the phone's band behaves during a
 * soft-scene navigation. «a» keeps the band solid and fades only what sits on it and under it; anything
 * else is today's behaviour («c»: the whole `<main>` fades, the band with it).
 *
 * It is a trial, not a setting: `?fascia=a` turns it on for the browser tab (sessionStorage), `?fascia=c`
 * turns it off, and without either the tab keeps what it had — a fresh tab is always today's app. It goes
 * away once the owner has chosen on a real iPhone.
 */
export type BandVariant = 'a' | 'c';

export const BAND_VARIANT_ATTRIBUTE = 'data-fascia';
export const BAND_VARIANT_STORAGE_KEY = 'nwt:fascia-variant';

/** The variant the tab runs, from the address's `?fascia=` (wins) and the tab's stored one. */
export function resolveBandVariant(search: string, stored: string | null): BandVariant {
  const asked = new URLSearchParams(search).get('fascia');
  if (asked === 'a' || asked === 'c') return asked;
  return stored === 'a' ? 'a' : 'c';
}

/** Reads the address and the tab's storage, stores the answer and marks `<html>` with it. Never throws. */
export function applyBandVariant(): void {
  if (typeof window === 'undefined') return;
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(BAND_VARIANT_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode, previews): the address alone decides.
  }
  const variant = resolveBandVariant(window.location.search, stored);
  try {
    if (variant === 'a') window.sessionStorage.setItem(BAND_VARIANT_STORAGE_KEY, 'a');
    else window.sessionStorage.removeItem(BAND_VARIANT_STORAGE_KEY);
  } catch {
    // Same as above.
  }
  if (variant === 'a') document.documentElement.setAttribute(BAND_VARIANT_ATTRIBUTE, 'a');
  else document.documentElement.removeAttribute(BAND_VARIANT_ATTRIBUTE);
}
