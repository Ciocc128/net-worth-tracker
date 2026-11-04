/**
 * D-AS28 (doc/unslop/README.md): an instrument's price line is green up and red down in Lime Frost and
 * Graphite, and each Δ of the expanded row carries its euro twin with cents.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

describe('--trend-up / --trend-down', () => {
  it.each(['[data-theme="lime-frost"]', '.dark[data-theme="lime-frost"]', '[data-theme="graphite"]', '.dark[data-theme="graphite"]'])(
    'should point to the sign colours in %s',
    (selector) => {
      const start = css.indexOf(`\n${selector} {`);
      expect(start).toBeGreaterThan(-1);
      const body = css.slice(start, css.indexOf('\n}', start));
      expect(body).toContain('--trend-up: var(--positive);');
      expect(body).toContain('--trend-down: var(--destructive);');
    },
  );

  it('should leave the other themes on the chart slots', () => {
    expect(css.match(/--trend-up:/g)).toHaveLength(4);
  });
});
