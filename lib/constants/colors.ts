/**
 * Color palette for asset classes
 */
export const ASSET_CLASS_COLORS: Record<string, string> = {
  equity: '#3B82F6',         // blue
  bonds: '#EF4444',          // red
  crypto: '#F59E0B',         // amber
  realestate: '#10B981',     // green
  cash: '#6B7280',           // gray
  commodity: '#92400E',      // brown
  trendFollowing: '#14B8A6', // teal
  carry: '#F97316',          // orange
};

/**
 * Chart colors for various visualizations
 */
export const CHART_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
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
 * Fixed mapping from asset class to a ready-to-use, theme-reactive CSS color value.
 * Use this for badge/chip styling so colours follow the active theme.
 * Recharts components must keep using getAssetClassColor (hex) since they
 * cannot consume CSS variables at render time.
 *
 * Most classes map 1:1 to a theme chart slot (`var(--chart-N)`). trendFollowing/carry
 * have no dedicated theme slot (the design system only defines --chart-1..5), so they
 * are derived via color-mix() blends of two existing slots — same technique already
 * used for a 6th color in components/goals/AllocationComparisonBar.tsx.
 */
const ASSET_CLASS_COLOR_VALUE: Record<string, string> = {
  equity:         'var(--chart-1)',
  bonds:          'var(--chart-2)',
  realestate:     'var(--chart-3)',
  crypto:         'var(--chart-4)',
  commodity:      'var(--chart-5)',
  cash:           'var(--muted-foreground)',
  trendFollowing: 'color-mix(in srgb, var(--chart-2) 65%, var(--chart-4))',
  carry:          'color-mix(in srgb, var(--chart-3) 65%, var(--chart-1))',
  pension:        'color-mix(in srgb, var(--chart-1) 55%, var(--chart-5))',
};

export function getAssetClassCssVar(assetClass: string): string {
  return ASSET_CLASS_COLOR_VALUE[assetClass] ?? 'var(--muted-foreground)';
}

/**
 * Get color from chart colors array by index
 * @param index - The index
 * @returns Hex color code
 */
export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
