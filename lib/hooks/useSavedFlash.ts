'use client';

import { useCallback, useEffect, useState } from 'react';

/** How long a save button wears «Salvato» (doc/animazioni/README.md § 5.11). */
export const SAVED_FLASH_MS = 1200;

/**
 * «Salva» confirms on the button (AN3 I): `flash()` after a write succeeded, `saved` true for 1200 ms. The
 * timer lives in its own effect (AGENTS.md → Motion, auto-dismiss), so a second save restarts it and an
 * unmount clears it. The toast stays the screen-reader announcement; the button is not a live region.
 */
export function useSavedFlash() {
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    if (stamp === 0) return;
    const timer = window.setTimeout(() => setStamp(0), SAVED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [stamp]);

  const flash = useCallback(() => setStamp((current) => current + 1), []);
  return { saved: stamp > 0, flash };
}
