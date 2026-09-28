'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether Rendimenti › «Analizza con AI» can answer: the server knows if its provider's key is
 * set, the page is a client component, so the layout hands the fact down through this context
 * (owner's decision, 2026-09-28, doc/ai-open-models-wiki.md § 4.2).
 *
 * No key, no button — rather than a button that opens a dialog only to report a 500. The
 * default is `false`: a page rendered outside the layout hides the action instead of offering
 * one nobody configured.
 */
const PerformanceAiAvailabilityContext = createContext(false);

export function PerformanceAiAvailabilityProvider({
  available,
  children,
}: {
  available: boolean;
  children: ReactNode;
}) {
  return (
    <PerformanceAiAvailabilityContext.Provider value={available}>{children}</PerformanceAiAvailabilityContext.Provider>
  );
}

export function usePerformanceAiAvailable(): boolean {
  return useContext(PerformanceAiAvailabilityContext);
}
