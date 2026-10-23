import { useReducedMotion } from 'framer-motion';

/** How long a series takes to draw itself in, in ms (doc/animazioni/README.md D-AN7). */
const CHART_ENTRY_MS = 600;

const ANIMATED = { isAnimationActive: true, animationDuration: CHART_ENTRY_MS, animationEasing: 'ease-out' } as const;
const STILL = { isAnimationActive: false, animationDuration: 0, animationEasing: 'ease-out' } as const;

/**
 * The entry animation of a Recharts series, the same on every chart (2026-10-23): 600 ms ease-out, and
 * none at all with «riduci movimento» — the series arrives drawn. The page's `MotionConfig` does not
 * reach Recharts, so each `<Area>`, `<Bar>` and `<Line>` that draws itself spreads this
 * (`{...chartMotion}`); a series that must not animate says `isAnimationActive={false}` instead.
 * `__tests__/chartMotionGuard.test.ts` fails on a series that does neither.
 *
 * A series that morphs between two datasets (`useMorphingSeries`) keeps its own motion: this is
 * only the ENTRY.
 */
export function useChartMotion() {
  return useReducedMotion() ? STILL : ANIMATED;
}
