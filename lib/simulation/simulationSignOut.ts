/**
 * The sign-out hook of the FIRE simulations' store (F12, CU6), kept apart from the store on purpose: the query
 * provider runs on every page, and importing the store there would pull the Monte Carlo engines into the shared
 * bundle. The store registers its own clear when (and only if) a FIRE tab loaded it.
 */

const clearers = new Set<() => void>();

/** Called by `lib/simulation/simulationStore.ts` at load. */
export function registerSimulationClearer(clear: () => void): void {
  clearers.add(clear);
}

/** Called by the query provider's sign-out guard: every run in memory is forgotten. */
export function forgetSimulationsOnSignOut(): void {
  clearers.forEach((clear) => clear());
}
