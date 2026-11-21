import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPACT_QUERY, DESKTOP_QUERY } from '@/lib/hooks/useCompactLayout';
import { BAND_QUERY, PILL_VISIBLE_QUERY } from '@/lib/constants/navigation';

const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');

/** The `@media` condition of a `@custom-variant name (@media …);` declaration. */
function variantCondition(name: string): string {
  const m = css.match(new RegExp(`@custom-variant ${name} \\(@media (.+)\\);`));
  if (!m) throw new Error(`no @custom-variant ${name}`);
  return m[1];
}

describe('desktop query (RU0, N4)', () => {
  it('Tailwind desktop: and DESKTOP_QUERY are the same condition', () => {
    expect(variantCondition('desktop')).toBe(DESKTOP_QUERY);
  });

  it('max-desktop: is the negation, and COMPACT_QUERY says the same', () => {
    expect(variantCondition('max-desktop')).toBe(`not (${DESKTOP_QUERY})`);
    expect(COMPACT_QUERY).toBe(`not all and (${DESKTOP_QUERY})`);
  });

  it('tablet-landscape excludes the desktop condition at 1280 with a mouse', () => {
    expect(variantCondition('tablet-landscape')).toContain('(not ((width >= 1280px) and (pointer: fine)))');
  });

  it('tablet-landscape is declared AFTER max-desktop, or max-desktop:landscape:flex beats tablet-landscape:hidden', () => {
    expect(css.indexOf('@custom-variant tablet-landscape')).toBeGreaterThan(css.indexOf('@custom-variant max-desktop'));
  });

  it('no comma list in a desktop variant (Tailwind would split it and drop the second @media)', () => {
    for (const n of ['desktop', 'max-desktop']) expect(variantCondition(n)).not.toContain(',');
  });

  it('the theme no longer defines a desktop breakpoint, and the pill excludes a mouse desktop', () => {
    expect(css).not.toMatch(/--breakpoint-desktop:/);
    expect(PILL_VISIBLE_QUERY).toBe(`(orientation: portrait) and (not (${BAND_QUERY}))`);
  });

  it('band: and BAND_QUERY are the same condition, max-band: its negation, declared after tablet-landscape (D-FD16)', () => {
    expect(variantCondition('band')).toBe(BAND_QUERY);
    expect(variantCondition('max-band')).toBe(`not (${BAND_QUERY})`);
    expect(variantCondition('band')).not.toContain(',');
    expect(css.indexOf('@custom-variant band ')).toBeGreaterThan(css.indexOf('@custom-variant tablet-landscape'));
  });

  it('the band holds at 125% and 150% zoom of a 1440 screen with a mouse, not on a phone turned sideways (D-FD16)', () => {
    // Hand-worked: 1440 / 1.25 = 1152 and 1440 / 1.5 = 960, both ≥ 960 with a fine pointer → band.
    // An iPhone Pro Max on its side is 932 × 430, coarse pointer: 932 < 960 and < 1000 → no band.
    const matches = (w: number, fine: boolean, landscape: boolean) =>
      w >= 1440 || (w >= 960 && fine) || (landscape && w >= 1000);
    expect(matches(1152, true, true)).toBe(true);
    expect(matches(960, true, true)).toBe(true);
    expect(matches(932, false, true)).toBe(false);
    expect(matches(768, false, false)).toBe(false);
    expect(matches(1024, false, true)).toBe(true);
    expect(BAND_QUERY).toContain('((width >= 960px) and (pointer: fine))');
    expect(BAND_QUERY).toContain('((orientation: landscape) and (width >= 1000px))');
  });
});
