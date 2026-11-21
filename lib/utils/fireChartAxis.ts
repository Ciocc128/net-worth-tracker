/**
 * The Y axis of the FIRE charts (Ventaglio, Scenari, Coast, Dopo il FIRE / Proiezione, What If).
 *
 * Recharts' automatic axis picks ticks such as «650k» and «1,3 Mln», and lets a single far-out
 * series (Bull, the 90th percentile, a sample path) squash everything the person came to read.
 * `resolveFireAxis` sizes the axis on the series that must always be seen whole (`core`) and
 * cuts only what is allowed to leave (`outer`). doc/riordino-ui/README.md § 5.7, D-RU8, D-RU13.
 */

export interface FireAxis {
  /** The axis maximum. */
  top: number;
  /** 0, step, 2·step, …, top. */
  ticks: number[];
  step: number;
  /** True when some `outer` series leaves the chart. */
  cut: boolean;
  /** The maximum of `outer` (for the note), 0 when there is none. */
  outerMax: number;
}

type Series = readonly (number | null | undefined)[];

const HEADROOM = 1.1;
const TICK_TARGET = 5;
const CUT_FACTOR = 1.5;
const EPS = 1e-9;

/** The smallest m × 10^k ≥ y with m in {1, 2, 2.5, 5}. */
export function niceStep(y: number): number {
  const base = Math.floor(Math.log10(y));
  for (let k = base - 1; k <= base + 1; k++) {
    for (const m of [1, 2, 2.5, 5]) {
      const candidate = m * 10 ** k;
      if (candidate >= y * (1 - EPS)) return candidate;
    }
  }
  return 10 ** (base + 1);
}

function axisFor(x: number): { top: number; step: number; ticks: number[] } {
  const step = niceStep((HEADROOM * x) / TICK_TARGET);
  const count = Math.max(1, Math.ceil((HEADROOM * x) / step - EPS));
  const ticks = Array.from({ length: count + 1 }, (_, i) => i * step);
  return { top: count * step, step, ticks };
}

function maxOf(groups: readonly Series[]): number {
  let max = 0;
  for (const series of groups) {
    for (const value of series) {
      if (typeof value === 'number' && Number.isFinite(value) && value > max) max = value;
    }
  }
  return max;
}

/** `null` only when there is nothing to draw (C ≤ 0): the chart then stays as it is. */
export function resolveFireAxis(core: readonly Series[], outer: readonly Series[]): FireAxis | null {
  const c = maxOf(core);
  if (c <= 0) return null;
  const o = maxOf(outer);
  const base = axisFor(c);
  if (o > CUT_FACTOR * base.top) return { ...base, cut: true, outerMax: o };
  const fit = o > c ? axisFor(o) : base;
  return { ...fit, cut: false, outerMax: o };
}

/** «750k €», «1,5 Mln €», «2 Mln €», «1,25 Mln €»: one line (no-break spaces), decimals as the step needs. */
export function formatAxisEuro(value: number, step: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const mln = step / 1_000_000;
    const decimals = mln >= 1 - EPS ? 0 : Math.abs(mln * 10 - Math.round(mln * 10)) < EPS ? 1 : 2;
    const text = (value / 1_000_000).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    return `${text} Mln €`;
  }
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k €`;
  return `${Math.round(value)} €`;
}
