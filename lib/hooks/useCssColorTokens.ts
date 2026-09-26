'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import { colorToHex } from '@/lib/utils/cssColorToHex';

/**
 * Theme colour tokens resolved to `#rrggbb`, for the chart libraries that cannot take a CSS
 * colour as the browser serves it (Nivo's react-spring interpolates neither `oklch()` nor `lab()`).
 *
 * `tokens` maps a result key to a CSS custom property; `fallbacks` gives the hex painted before the
 * first read and whenever a token is missing or unreadable. Re-read after every colour-theme or
 * light/dark change on the next animation frame — the same timing as useChartColors, because a
 * synchronous read during render sees the previous theme.
 *
 * Pass module-level constants: the effect depends on the objects' identity.
 */
export function useCssColorTokens<K extends string>(
  tokens: Readonly<Record<K, string>>,
  fallbacks: Readonly<Record<K, string>>
): Record<K, string> {
  const { colorTheme } = useColorTheme();
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<Record<K, string>>(fallbacks);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const next: Record<K, string> = { ...fallbacks };
      for (const key of Object.keys(tokens) as K[]) {
        next[key] = colorToHex(style.getPropertyValue(tokens[key])) ?? fallbacks[key];
      }
      setColors(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [colorTheme, resolvedTheme, tokens, fallbacks]);

  return colors;
}
