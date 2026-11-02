/**
 * The colour the BROWSER paints around the page — `<meta name="theme-color">`, read by Chrome on
 * Android for its address bar and the system bars, by Safari for its tab bar — and the two
 * defaults the HTML ships before any script runs.
 *
 * Why it exists (owner, 2026-10-17): with dark mode following the system, the bar under the app
 * was sometimes white. The app declared no `theme-color`, no `color-scheme` and no background on
 * `<html>` (only on `<body>`), so the browser's own chrome and the overscroll canvas kept their
 * defaults. The CSS half is in `app/globals.css` (`html { background; color-scheme }`), the meta
 * half here: `app/layout.tsx` ships `DEFAULT_THEME_COLORS` as a light/dark pair keyed on
 * `prefers-color-scheme` — right for the default colour theme in system mode, before hydration —
 * and `ThemeColorSync` (components/providers) rewrites the metas from the RESOLVED `--background`
 * once the theme is known: a forced light/dark mode and the eleven other colour themes included.
 *
 * `resolveThemeColor` goes through `colorToHex`, the one route from a served token (`oklch()`,
 * `lab()`, `#hex`) to the `#rrggbb` a meta tag accepts everywhere.
 */

import { colorToHex } from '@/lib/utils/cssColorToHex';

export const THEME_COLOR_META_NAME = 'theme-color';

/**
 * The fork's default theme's `--background` as `#rrggbb` — Lime Frost since 2026-11-02
 * (`[data-theme="lime-frost"]` is `oklch(0.9550 0.0200 133.0000)`, `.dark[data-theme="lime-frost"]`
 * is `oklch(0.1288 0.0406 264.6952)` in `app/globals.css`): what the HTML declares for a reader who
 * never chose a theme and whose mode follows the system. `__tests__/themeColor.test.ts` holds them
 * equal to the conversion of those two tokens, so a retuned default theme fails the test.
 */
export const DEFAULT_THEME_COLORS = { light: '#ebf3e6', dark: '#020617' } as const;

/** The served `--background` as the meta's content; `null` when the token is unreadable (the metas keep their last value). */
export function resolveThemeColor(background: string): string | null {
  return colorToHex(background.trim());
}
