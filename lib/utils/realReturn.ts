/**
 * RP2 (doc/fire-ipotesi/README.md § 1.5): the real return, Fisher, percent in, percent out.
 * A leaf module with no collaborators so the services can import it without dragging the
 * Firestore-coupled graph; `fireAssumptions.ts` re-exports it as the page's one function.
 */
export function realReturn(growthPct: number, inflationPct: number): number {
  return ((1 + growthPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}
