'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import type { AllocationAction } from '@/lib/utils/allocationUtils';
import { clampActionLightness } from '@/lib/utils/actionColor';

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
 * actions distinct.
 *
 * The band is NOT a guess: these three colours are printed as text (a 10px chip label, an 18px
 * plan amount, a 13px gap figure), so they are held to WCAG AA 4.5:1 on `--card` AND on the chip's
 * own tinted fill, in all twelve theme blocks, by `__tests__/actionColorContrast.test.ts`. Until
 * 2026-09-21 this docstring claimed to guarantee contrast and the default light palette measured
 * 2,39:1.
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
        return raw ? clampActionLightness(raw, isDark) : INITIAL[action];
      };
      setColors({ COMPRA: resolve('COMPRA'), VENDI: resolve('VENDI'), OK: resolve('OK') });
    });
    return () => cancelAnimationFrame(frame);
  }, [colorTheme, resolvedTheme]);

  return colors;
}
