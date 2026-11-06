/**
 * The phone's top band (doc/fascia/README.md, fork only): which colours each theme offers in
 * Impostazioni › Aspetto › Fascia, the default, and the pre-hydration script that puts the choice
 * on `<html>` (`data-band`) before the first paint. No 'use client': the root layout reads the script
 * from a Server Component, like `COLOR_THEME_INIT_SCRIPT`.
 *
 * Each option is a pair of colours the theme already has (light and dark), written in
 * `app/globals.css` as `[data-theme=…][data-band=…]`; the theme block's own `--top-band` is the
 * default option, so an absent `data-band` paints it. «Nessuna» turns the band off: the bar is the
 * neutral one it was before 2026-11-06.
 */

import { COLOR_THEME_ATTRIBUTE, type ColorTheme } from '@/lib/constants/colorTheme';

export const TOP_BAND_STORAGE_KEY = 'top-band';
export const TOP_BAND_ATTRIBUTE = 'data-band';
export const TOP_BAND_NONE = 'nessuna';

/** The options of each theme that has a band, the default first (owner, 2026-11-06: D-FA7). */
export const TOP_BAND_OPTIONS = {
  'lime-frost': ['lime', 'ghiaccio', 'ardesia', TOP_BAND_NONE],
  graphite: ['blu', 'verde', 'inchiostro', TOP_BAND_NONE],
} as const satisfies Partial<Record<ColorTheme, readonly string[]>>;

export type TopBandTheme = keyof typeof TOP_BAND_OPTIONS;
export type TopBandOption = (typeof TOP_BAND_OPTIONS)[TopBandTheme][number];
/** What the account remembers: one choice per theme, so a theme switch finds its own band again. */
export type TopBandChoices = Partial<Record<TopBandTheme, TopBandOption>>;

export const TOP_BAND_LABELS: Record<TopBandOption, string> = {
  lime: 'Lime',
  ghiaccio: 'Blu ghiaccio',
  ardesia: 'Ardesia',
  blu: 'Blu',
  verde: 'Verde',
  inchiostro: 'Inchiostro',
  nessuna: 'Nessuna',
};

/**
 * The picker's previews (light over dark), in the served values of `app/globals.css` — a preview of
 * a colour that is not active, which no token can express (as the theme swatches of Aspetto).
 * «Nessuna» previews the theme's ground.
 */
export const TOP_BAND_SWATCHES: Record<TopBandTheme, Record<string, { light: string; dark: string }>> = {
  'lime-frost': {
    lime: { light: 'oklch(0.8800 0.1500 128.5041)', dark: 'oklch(0.8871 0.2122 128.5041)' },
    ghiaccio: { light: 'oklch(0.4800 0.0850 228.0000)', dark: 'oklch(0.7200 0.1000 228.0000)' },
    ardesia: { light: 'oklch(0.3717 0.0392 257.2870)', dark: 'oklch(0.2795 0.0368 260.0310)' },
    nessuna: { light: 'oklch(0.9550 0.0200 133.0000)', dark: 'oklch(0.1288 0.0406 264.6952)' },
  },
  graphite: {
    blu: { light: 'oklch(0.5200 0.1500 255.0000)', dark: 'oklch(0.3400 0.1000 255.0000)' },
    verde: { light: 'oklch(0.5000 0.1300 155.0000)', dark: 'oklch(0.3400 0.0800 155.0000)' },
    inchiostro: { light: 'oklch(0.2050 0 0)', dark: 'oklch(0.2690 0 0)' },
    nessuna: { light: 'oklch(0.9550 0 0)', dark: 'oklch(0.1000 0 0)' },
  },
};

export function isTopBandTheme(theme: unknown): theme is TopBandTheme {
  return typeof theme === 'string' && Object.prototype.hasOwnProperty.call(TOP_BAND_OPTIONS, theme);
}

/** The band a theme paints for these choices: the stored option when the theme offers it, else its default; null for a theme without a band. */
export function resolveTopBand(theme: ColorTheme, choices: TopBandChoices | null | undefined): TopBandOption | null {
  if (!isTopBandTheme(theme)) return null;
  const options = TOP_BAND_OPTIONS[theme] as readonly string[];
  const stored = choices?.[theme];
  return (stored && options.includes(stored) ? stored : options[0]) as TopBandOption;
}

/** Reads the stored choices; anything that is not an object of strings is no choice at all. */
export function parseTopBandChoices(raw: unknown): TopBandChoices {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const choices: TopBandChoices = {};
  for (const theme of Object.keys(TOP_BAND_OPTIONS) as TopBandTheme[]) {
    const option = (value as Record<string, unknown>)[theme];
    if (typeof option === 'string' && (TOP_BAND_OPTIONS[theme] as readonly string[]).includes(option)) {
      choices[theme] = option as TopBandOption;
    }
  }
  return choices;
}

/**
 * Inlined in `<head>` right AFTER `COLOR_THEME_INIT_SCRIPT`, so it reads the theme that script put on
 * `<html>` and writes the stored band of that theme; nothing stored, a stale value or a throwing
 * storage leave the attribute off, which paints the theme's default band.
 */
export const TOP_BAND_INIT_SCRIPT =
  '(function(){' +
  'try{' +
  'var el=document.documentElement;' +
  `var theme=el.getAttribute(${JSON.stringify(COLOR_THEME_ATTRIBUTE)});` +
  `var options=${JSON.stringify(TOP_BAND_OPTIONS)}[theme];` +
  'if(!options)return;' +
  `var stored=JSON.parse(localStorage.getItem(${JSON.stringify(TOP_BAND_STORAGE_KEY)})||'{}')[theme];` +
  `if(stored&&options.indexOf(stored)!==-1)el.setAttribute(${JSON.stringify(TOP_BAND_ATTRIBUTE)},stored)` +
  '}catch(e){}' +
  '})()';
