/**
 * The colour theme's storage key, DOM attribute and closed list of names — ONE module, without
 * `'use client'`, because two worlds read them: `contexts/ColorThemeContext.tsx` (the client store)
 * and `app/layout.tsx`, a Server Component that inlines the pre-hydration script below. A value
 * imported from a client module into a Server Component is a client reference, not the string
 * (the shell is in the prerendered HTML since 2026-09-28).
 *
 * WARNING: adding a theme also means the CSS blocks in `app/globals.css`, `COLOR_THEME_SWATCHES` in
 * `app/dashboard/settings/page.tsx` and `__tests__/chartPaletteDistinctness.test.ts` (doc/guide/temi.md).
 */

export const COLOR_THEME_STORAGE_KEY = 'color-theme';
export const COLOR_THEME_ATTRIBUTE = 'data-theme';

export const COLOR_THEMES = [
  'default',
  'solar-dusk',
  'elegant-luxury',
  'midnight-bloom',
  'cyberpunk',
  'retro-arcade',
  'lime-frost',
  'graphite',
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

/**
 * `'default'` is the `:root` block (upstream's zinc): the one theme that puts no attribute on `<html>`.
 * It is NOT the fork's default any more — see `DEFAULT_COLOR_THEME`.
 */
export const BASE_COLOR_THEME: ColorTheme = 'default';

/**
 * The theme of a reader who never chose one (nothing stored, a value that is not a theme, a storage
 * that throws, the server snapshot): Lime Frost since 2026-11-02 (the owner's call; the `:root`
 * block stays upstream's zinc, so a realignment never conflicts on it). A reader who chose
 * «Default» keeps the zinc block.
 */
export const DEFAULT_COLOR_THEME: ColorTheme = 'lime-frost';

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && (COLOR_THEMES as readonly string[]).includes(value);
}

/**
 * The script `app/layout.tsx` inlines in `<head>`, so the stored theme is on `<html>` before the
 * first paint — the way next-themes puts `.dark` there. Without it the shell, now in the
 * prerendered HTML, would paint the default palette and switch to the reader's theme only after
 * hydration (the `useEffect` in `ColorThemeProvider`). It is a plain function so it runs before
 * any module loads; it reads only its own key, accepts only a name from the list, and swallows a
 * `localStorage` that throws (a sandboxed frame) — a storage failure is not a reason to fail the page.
 * Nothing stored, a stale value or a throwing storage all paint `DEFAULT_COLOR_THEME` (Lime Frost);
 * only a stored «Default» leaves `<html>` without the attribute.
 */
export const COLOR_THEME_INIT_SCRIPT =
  '(function(){' +
  `var theme=${JSON.stringify(DEFAULT_COLOR_THEME)};` +
  'try{' +
  `var stored=localStorage.getItem(${JSON.stringify(COLOR_THEME_STORAGE_KEY)});` +
  `if(stored&&${JSON.stringify(COLOR_THEMES)}.indexOf(stored)!==-1)theme=stored` +
  '}catch(e){}' +
  `if(theme!==${JSON.stringify(BASE_COLOR_THEME)})` +
  `document.documentElement.setAttribute(${JSON.stringify(COLOR_THEME_ATTRIBUTE)},theme)` +
  '})()';
