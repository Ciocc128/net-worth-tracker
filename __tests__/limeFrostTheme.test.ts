/**
 * Lime Frost was ported from a registry built for button fills, not for text: its light lime
 * `--primary` measured 1.34:1 on white and its tiles were indistinguishable from the ground
 * (1.03:1). The guided tour of 2026-09-12 caught both. This suite reads the two theme blocks
 * straight from `app/globals.css` and measures them, so a later re-paste of the source values
 * fails here instead of on a screen.
 *
 * Seen red on purpose: with the source's light `--primary` (oklch 0.8871 0.2122 128.5) the
 * "text tokens" case fails at 1.34:1.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

type Oklch = [number, number, number];

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

function readBlock(selector: string): Record<string, Oklch> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} not found in globals.css`);
  const body = css.slice(start, css.indexOf('}', start));
  const tokens: Record<string, Oklch> = {};
  for (const [, name, values] of body.matchAll(/--([a-z0-9-]+):\s*oklch\(([\d. ]+)\)/g)) {
    tokens[name] = values.trim().split(/\s+/).map(Number) as Oklch;
  }
  return tokens;
}

// OKLCH → linear sRGB (Björn Ottosson's matrices), clamped, then WCAG relative luminance.
function luminance([L, C, H]: Oklch): number {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
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

function contrast(x: Oklch, y: Oklch): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_ON_GROUND = ['primary', 'destructive', 'muted-foreground', 'foreground'] as const;
const CHART_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8].map((slot) => `chart-${slot}`);

describe.each([
  ['light', '[data-theme="lime-frost"]'],
  ['dark', '.dark[data-theme="lime-frost"]'],
])('Lime Frost — %s', (_mode, selector) => {
  const tokens = readBlock(selector);

  it.each(TEXT_ON_GROUND)('text tokens: --%s clears 4.5:1 on --card and on --background', (name) => {
    expect(contrast(tokens[name], tokens.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens[name], tokens.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('a primary button label clears 4.5:1 on its fill', () => {
    expect(contrast(tokens['primary-foreground'], tokens.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CHART_SLOTS)('--%s clears the 3:1 chart floor on --card', (name) => {
    expect(contrast(tokens[name], tokens.card)).toBeGreaterThanOrEqual(3);
  });

  it('the tiles stand off the ground', () => {
    expect(contrast(tokens.card, tokens.background)).toBeGreaterThanOrEqual(1.1);
  });
});
