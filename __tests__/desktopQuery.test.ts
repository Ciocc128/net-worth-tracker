import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPACT_QUERY, DESKTOP_QUERY } from '@/lib/hooks/useCompactLayout';
import { PILL_VISIBLE_QUERY } from '@/lib/constants/navigation';

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
    expect(PILL_VISIBLE_QUERY).toContain('(not ((width >= 1280px) and (pointer: fine)))');
  });
});
