/**
 * The phone's top band (doc/fascia/README.md, 2026-11-06): in Lime Frost and Graphite the mobile
 * `PageHeader` is a band in `--top-band`, its title, date and buttons in `--top-band-foreground`, the
 * secondary line at 88% of that ink. Measured straight from `app/globals.css` in the four blocks:
 * the ink and the 88% line clear the 4.5:1 text floor on the band.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

type Oklch = [number, number, number];

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

function readBlock(selector: string): Record<string, Oklch> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} not found in globals.css`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const tokens: Record<string, Oklch> = {};
  for (const [, name, values] of body.matchAll(/--([a-z0-9-]+):\s*oklch\(([\d. ]+)\)/g)) {
    tokens[name] = values.trim().split(/\s+/).map(Number) as Oklch;
  }
  return tokens;
}

function toLab([L, C, H]: Oklch): [number, number, number] {
  const h = (H * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

function luminanceLab([L, a, b]: [number, number, number]): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(x: [number, number, number], y: [number, number, number]): number {
  const [hi, lo] = [luminanceLab(x), luminanceLab(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in oklab, ink 88%, transparent)` over the band = an 88/12 oklab mix of ink and band. */
function mix(ink: Oklch, band: Oklch, share: number): [number, number, number] {
  const [x, y] = [toLab(ink), toLab(band)];
  return [0, 1, 2].map((i) => share * x[i] + (1 - share) * y[i]) as [number, number, number];
}

const BLOCKS = [
  '[data-theme="lime-frost"]',
  '.dark[data-theme="lime-frost"]',
  '[data-theme="graphite"]',
  '.dark[data-theme="graphite"]',
];

describe('the top band', () => {
  it.each(BLOCKS)('%s names a band and its ink', (selector) => {
    const tokens = readBlock(selector);
    expect(tokens['top-band']).toBeDefined();
    expect(tokens['top-band-foreground']).toBeDefined();
  });

  it.each(BLOCKS)('%s: the ink and the 88%% line read at 4.5:1 on the band', (selector) => {
    const tokens = readBlock(selector);
    const band = tokens['top-band'];
    const ink = tokens['top-band-foreground'];
    expect(contrast(toLab(ink), toLab(band))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mix(ink, band, 0.88), toLab(band))).toBeGreaterThanOrEqual(4.5);
  });

  const OPTION_RULES = [...css.matchAll(/^(\S[^{\n]*\[data-band="[a-z]+"\](?::not\(\.dark\))?) \{([^}\n]*)\}$/gm)];

  it('names a rule for each colour option, light and dark', () => {
    expect(OPTION_RULES.length).toBe(8);
  });

  it.each(OPTION_RULES.map((match) => [match[1].trim(), match[2]] as const))('%s: ink and 88%% line at 4.5:1', (_selector, body) => {
    const read = (name: string) => {
      const found = body.match(new RegExp(`--${name}:\\s*oklch\\(([\\d. ]+)\\)`));
      if (!found) throw new Error(`--${name} missing`);
      return found[1].trim().split(/\s+/).map(Number) as Oklch;
    };
    const band = read('top-band');
    const ink = read('top-band-foreground');
    expect(contrast(toLab(ink), toLab(band))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mix(ink, band, 0.88), toLab(band))).toBeGreaterThanOrEqual(4.5);
  });

  it('the shared default leaves every other theme as it was', () => {
    expect(css).toMatch(/--top-band:\s*var\(--background\);/);
    expect(css).toMatch(/--top-band-foreground:\s*var\(--foreground\);/);
  });
});
