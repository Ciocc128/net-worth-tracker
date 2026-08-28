/**
 * Shared color utility for performance metric values.
 *
 * Positive percentage/number values use --positive (green token); negative values
 * use --destructive (red token); currency and months are always neutral foreground.
 *
 * Centralised here because the same logic was duplicated across HeroMetricBlock,
 * MetricCard, and BenchmarkComparisonChart — three independent instantiations
 * that must agree on which token to emit (Rule of Three, DEVELOPMENT_GUIDELINES).
 *
 * signTextClass/signChipClass sit alongside it for the same reason: the Panoramica and
 * Patrimonio heroes render the same variation chips and must not drift apart.
 *
 * Adding a new format: extend the MetricValueFormat union and add a branch below
 * if the format needs semantic color (most formats should remain neutral).
 */

export type MetricValueFormat = 'percentage' | 'currency' | 'number' | 'months';

/**
 * Returns the Tailwind text-color class for a metric value.
 *
 * @param val    - The numeric value (null renders as neutral).
 * @param format - The display format; only percentage and number get semantic color.
 */
export function getMetricValueColor(
  val: number | null,
  format: MetricValueFormat
): string {
  if (val === null) return 'text-muted-foreground';
  if (format === 'percentage' || format === 'number') {
    if (val > 0) return 'text-positive';
    if (val < 0) return 'text-destructive';
  }
  return 'text-foreground';
}

/**
 * Sign-aware text color for a financial value (gain vs loss).
 *
 * Differs from getMetricValueColor in that zero counts as positive — the hero variation
 * chips and the fiscal blocks have always read "flat" as good news, not as neutral.
 *
 * Raw `text-green-*` / `text-red-*` is forbidden: those stay literal and diverge from
 * `--destructive` on the non-default themes (Cyberpunk renders destructive as orange).
 * See DESIGN.md "The Sign-Color Token Rule".
 */
export function signTextClass(value: number): string {
  return value >= 0 ? 'text-positive' : 'text-destructive';
}

/**
 * Sign-aware chip classes (tinted background + matching text) for a financial value.
 * Same zero-is-positive convention as signTextClass.
 */
export function signChipClass(value: number): string {
  return value >= 0 ? 'bg-positive/10 text-positive' : 'bg-destructive/10 text-destructive';
}
