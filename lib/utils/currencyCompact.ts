/**
 * Free of imports on purpose (F12, doc/simulazioni-worker/README.md): `lib/services/monteCarloService.ts` labels its
 * histogram with it inside the simulation worker, which must not pull `chartService` and through it Firebase.
 * `chartService` re-exports it for every chart.
 */

/**
 * Format currency value in compact format for chart axes.
 * Examples: 1,5 Mln €, 850k €, 250 €
 *
 * The euro follows the figure with a no-break space, as every other amount in the app
 * (AGENTS.md → Italian Localization). Until 2026-09-22 the ticks read «€850k» — the one place
 * the currency came first, so a chart axis spoke a different dialect from the tile above it.
 */
export function formatCurrencyCompact(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000) {
    // Millions: 1,5 Mln €
    const millions = value / 1_000_000;
    return `${millions.toLocaleString('it-IT', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} Mln\u00A0€`;
  } else if (absValue >= 1_000) {
    // Thousands: 850k €
    const thousands = value / 1_000;
    return `${Math.round(thousands)}k\u00A0€`;
  } else {
    // Below 1000: 250 €
    return `${Math.round(value)}\u00A0€`;
  }
}
