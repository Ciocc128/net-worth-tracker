/**
 * Color palette for asset classes
 */
const ASSET_CLASS_COLORS: Record<string, string> = {
  equity: '#3B82F6',      // blue
  bonds: '#EF4444',       // red
  crypto: '#F59E0B',      // amber
  realestate: '#10B981',  // green
  cash: '#6B7280',        // gray
  commodity: '#92400E',   // brown
  trendFollowing: '#8B5CF6', // violet
  carry: '#EC4899',       // pink
};

/**
 * Chart colors for various visualizations.
 *
 * Indices 5-9 also back the theme-independent tail of useChartColors() and the
 * cost-center slots chart-6..8, where they are 4px identity rails on a light card:
 * every hue must clear the WCAG 1.4.11 3:1 floor against white AND against the dark
 * themes' cards — the ~0.12-0.30 relative-luminance band. Teal and orange sit at
 * their -600 steps for exactly this reason (3.74:1 and 3.56:1 vs white); their -500
 * originals measured 2.49:1 and 2.80:1.
 */
export const CHART_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#0D9488', // teal (teal-600)
  '#EA580C', // orange (orange-600)
  '#6366F1', // indigo
  '#84CC16', // lime
];

/**
 * Get color for a specific asset class
 * @param assetClass - The asset class
 * @returns Hex color code
 */
export function getAssetClassColor(assetClass: string): string {
  return ASSET_CLASS_COLORS[assetClass] || '#6B7280'; // default to gray
}

/**
 * Fixed mapping from asset class to CSS custom property (e.g. "--chart-1").
 * Use this for badge/chip styling so colours follow the active theme.
 * Recharts components must keep using getAssetClassColor (hex) since they
 * cannot consume CSS variables at render time.
 */
// trendFollowing/carry have no dedicated slot yet (only 5 --chart-* vars exist) — they fall back
// to --muted-foreground below like cash, pending an L2/L3 design pass on the 2 new classes.
const ASSET_CLASS_CSS_VAR: Record<string, string> = {
  equity:     '--chart-1',
  bonds:      '--chart-2',
  realestate: '--chart-3',
  crypto:     '--chart-4',
  commodity:  '--chart-5',
  cash:       '--muted-foreground',
};

export function getAssetClassCssVar(assetClass: string): string {
  return ASSET_CLASS_CSS_VAR[assetClass] ?? '--muted-foreground';
}

/**
 * Get color from chart colors array by index
 * @param index - The index
 * @returns Hex color code
 */
export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
