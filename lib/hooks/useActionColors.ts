'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import type { AllocationAction } from '@/lib/utils/allocationUtils';
import { clampColorLightness } from '@/lib/utils/colorLightness';

/**
 * Resolves COMPRA / VENDI / OK to colors from the active theme, clamped to a lightness band
 * that stays legible on the page background.
 *
 * The colours are the theme tokens `--trade-buy` / `--trade-sell` / `--trade-ok`. Their defaults
 * alias the chart slots of `ACTION_CHART_NUMBER` (chart-3 / chart-5 / chart-2), so a theme that
 * does not name them keeps the palette it always had; Lime Frost light names them outright.
 *
 * Why clamp (and not reuse useChartColors): some themes define chart colors at extreme
 * lightness — cyberpunk's chart-5 is oklch(0.92), near-white — which is unreadable as chip
 * text on a light card. `useChartColors` swaps such colors for a *static* palette entry at
 * the same index, which here would both lose the theme hue and let two actions collapse to
 * the same color. Clamping only the L channel keeps each theme's hue and keeps the three
 * actions distinct, while guaranteeing contrast in both modes. The clamp lives in
 * `lib/utils/colorLightness.ts` because the served CSS is `#hex` / `lab()`, not `oklch()`.
 *
 * Read once per section and pass the result down — never call this per row.
 */

// Legible default-theme colors shown for the first paint, before the CSS vars resolve.
const INITIAL: Record<AllocationAction, string> = {
  COMPRA: 'oklch(0.62 0.17 70)', // amber
  VENDI: 'oklch(0.62 0.21 25)', // coral
  OK: 'oklch(0.62 0.15 162)', // jade
};

const TRADE_TOKEN: Record<AllocationAction, string> = {
  COMPRA: '--trade-buy',
  VENDI: '--trade-sell',
  OK: '--trade-ok',
};

export function useActionColors(): Record<AllocationAction, string> {
  const { colorTheme } = useColorTheme();
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<Record<AllocationAction, string>>(INITIAL);

  // Read AFTER paint (rAF) so next-themes has applied the active theme/mode to <html>.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const isDark = resolvedTheme === 'dark';
      const resolve = (action: AllocationAction): string => {
        const raw = style.getPropertyValue(TRADE_TOKEN[action]).trim();
        return raw ? clampColorLightness(raw, isDark) : INITIAL[action];
      };
      setColors({ COMPRA: resolve('COMPRA'), VENDI: resolve('VENDI'), OK: resolve('OK') });
    });
    return () => cancelAnimationFrame(frame);
  }, [colorTheme, resolvedTheme]);

  return colors;
}
