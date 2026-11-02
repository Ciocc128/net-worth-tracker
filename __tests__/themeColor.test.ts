/**
 * The browser-chrome colour (lib/utils/themeColor.ts, 2026-10-17): the two defaults the HTML
 * ships are the conversion of the default theme's two `--background` tokens, and the resolver
 * reads every form `getComputedStyle` can serve.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_COLORS, resolveThemeColor } from '@/lib/utils/themeColor';

describe('resolveThemeColor', () => {
  it('turns the fork default theme\'s two --background tokens into the shipped defaults', () => {
    // Lime Frost, the fork's default since 2026-11-02: its two blocks in app/globals.css.
    expect(resolveThemeColor('oklch(0.9550 0.0200 133.0000)')).toBe(DEFAULT_THEME_COLORS.light);
    expect(resolveThemeColor('oklch(0.1288 0.0406 264.6952)')).toBe(DEFAULT_THEME_COLORS.dark);
  });

  it('reads the served forms too — lab(), #hex, rgb() — and trims the token', () => {
    // Chrome serves a down-levelled token as lab(); same colour, same hex.
    expect(resolveThemeColor(' lab(100% 0 0) ')).toBe('#ffffff');
    expect(resolveThemeColor('#0a0a0a')).toBe('#0a0a0a');
    expect(resolveThemeColor('rgb(255, 255, 255)')).toBe('#ffffff');
  });

  it('is null for a token it cannot read, so the metas keep their last colour', () => {
    expect(resolveThemeColor('')).toBeNull();
    expect(resolveThemeColor('transparent')).toBeNull();
  });
});
