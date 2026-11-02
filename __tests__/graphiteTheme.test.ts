/**
 * Graphite (2026-11-02, fork only) is the owner's own theme cloned from upstream's zinc `:root`:
 * Lime Frost's functional rules on zinc's register — greys for structure, ink for the action, ONE
 * blue for the main data, ONE green for what is kept or grows, red only for a negative judgement.
 * This suite measures its two blocks straight from `app/globals.css` on the same floors as
 * Lime Frost's (`limeFrostTheme.test.ts`): text 4.5:1, series 3:1, tile off the ground 1.1:1.
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

const TEXT_ON_GROUND = ['primary', 'positive', 'destructive', 'muted-foreground', 'foreground'] as const;
const CHART_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot) => `chart-${slot}`);
/** The role series both blocks write outright: a series is a mark, so the 3:1 floor on the tile. */
const ROLE_SERIES = [
  'flow-in', 'flow-out', 'hero-series', 'role-want', 'role-saving', 'scenario-bear', 'sharpe-series',
  'sign-chart-gain', 'sign-chart-loss', 'type-flow-debt', 'progress-fill', 'drawdown',
] as const;
/** Text and the surface it sits on, where the theme names both (R9: 4.5:1). */
const TEXT_ON_SURFACE = [
  ['destructive', 'destructive-surface'],
  ['destructive', 'destructive-surface-hover'],
  ['toggle-on-foreground', 'toggle-on'],
  ['toggle-on-foreground', 'toggle-on-hover'],
  ['ghost-hover-foreground', 'ghost-hover'],
  ['foreground', 'segment-active'],
  ['foreground', 'outline-surface'],
  ['action-foreground', 'action-hover'],
] as const;

/** Every custom property a block declares, whatever its value (`oklch`, `var()`, `initial`). */
function declaredNames(selector: string): Set<string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return new Set([...body.matchAll(/^\s*--([a-z0-9-]+):/gm)].map(([, name]) => name));
}

describe('Graphite — R10: the dark block takes back every token the light block names', () => {
  // `[data-theme]` and `.dark[data-theme]` both match in dark mode, so a token the light block writes
  // and the dark block omits leaks the LIGHT value into dark (Lime Frost's lesson of 2026-09-25).
  // `--radius` is mode-independent.
  const light = declaredNames('[data-theme="graphite"]');
  const dark = declaredNames('.dark[data-theme="graphite"]');
  it.each([...light].filter((name) => name !== 'radius'))('--%s', (name) => {
    expect(dark.has(name)).toBe(true);
  });
});

describe('Graphite — a button variant reads its dark surface from the theme, not from a `dark:` class', () => {
  // A `dark:bg-*` utility on the variant beats the token in every theme (limeFrostTheme.test.ts).
  const button = readFileSync(resolve(__dirname, '../components/ui/button.tsx'), 'utf8');
  it.each(['ghost', 'outlineDestructive'])('%s has no dark: background or border', (variant) => {
    const classes = button.match(new RegExp(`\\b${variant}:\\s*"([^"]+)"`))?.[1];
    expect(classes).toBeDefined();
    expect(classes).not.toMatch(/dark:(hover:)?(bg|border)-/);
  });
});

describe.each([
  ['light', '[data-theme="graphite"]'],
  ['dark', '.dark[data-theme="graphite"]'],
])('Graphite — %s', (_mode, selector) => {
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

  // Both blocks fill the main action with ink (near-black light, near-white dark).
  it.runIf(tokens.action !== undefined)('a filled button label clears 4.5:1 on its --action fill', () => {
    expect(contrast(tokens['action-foreground'], tokens.action)).toBeGreaterThanOrEqual(4.5);
  });

  // COMPRA / VENDI / OK are printed as amounts in the Piano: text, so the text floor.
  it.runIf(tokens['trade-buy'] !== undefined)('trade colours clear 4.5:1 on --card', () => {
    for (const name of ['trade-buy', 'trade-sell', 'trade-ok']) {
      expect(contrast(tokens[name], tokens.card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(ROLE_SERIES)('role series: --%s clears the 3:1 chart floor on --card', (name) => {
    expect(tokens[name], `--${name} written outright`).toBeDefined();
    expect(contrast(tokens[name], tokens.card)).toBeGreaterThanOrEqual(3);
  });

  it.each(TEXT_ON_SURFACE)('text on its surface: --%s clears 4.5:1 on --%s', (text, surface) => {
    expect(tokens[text], `--${text} written outright`).toBeDefined();
    expect(tokens[surface], `--${surface} written outright`).toBeDefined();
    expect(contrast(tokens[text], tokens[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it('the tiles stand off the ground', () => {
    expect(contrast(tokens.card, tokens.background)).toBeGreaterThanOrEqual(1.1);
  });
});
