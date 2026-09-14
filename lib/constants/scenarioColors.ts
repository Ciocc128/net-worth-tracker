/**
 * The three projection scenarios' colours, as theme tokens — the ONE source for every chart,
 * swatch and legend of FIRE, Coast FIRE, What If and Monte Carlo.
 *
 * The tokens default to the chart slots these surfaces always used (Orso `--chart-5`, Base
 * `--chart-1`, Toro `--chart-2`; `SCENARIO_SLOT` in ScenarioOverlayChart), so a theme that does
 * not name them renders as before. Lime Frost light names them in its data vocabulary: Toro the
 * money-in green, Base the net-worth ice blue, Orso frost lavender — a prudent scenario is not
 * an error and never takes the red. A CSS variable is passed straight to SVG and Recharts: it
 * follows a theme switch with no JS read.
 */
export type ScenarioKey = 'bear' | 'base' | 'bull';

export const SCENARIO_COLOR: Record<ScenarioKey, string> = {
  bear: 'var(--scenario-bear)',
  base: 'var(--scenario-base)',
  bull: 'var(--scenario-bull)',
};
