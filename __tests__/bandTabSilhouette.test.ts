/**
 * The band's page tabs (doc/fascia-desktop/README.md, D-FD14; hover since #212, reworked 2026-11-22): a closed tab under
 * the pointer takes the open tab's silhouette — 14px top corners, two 14px inverted corners at its feet. At 125% zoom
 * the first version showed a rounded block and seams, for three reasons this file pins in the source:
 * the hover colour was translucent (overlaps added up), the inverted corners ABUTTED the body (14px = 17,5 device px,
 * snapped apart), and the tabs stood 2px apart (two feet of 14px collided next to the open tab).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
const band = readFileSync(resolve(__dirname, '../components/layout/ShellBand.tsx'), 'utf8');

/** The LAST rule whose selector list ends with `selector` (a side's own rule follows the shared one). */
function rule(selector: string): string {
  const start = css.lastIndexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} not found in globals.css`);
  return css.slice(start, css.indexOf('}', start));
}

describe('band tab silhouette', () => {
  it('paints the hover in an opaque colour, mixed into the band fill', () => {
    const hover = /\n\.shell-band \{[^}]*--band-hover:\s*([^;]+);/.exec(css)?.[1] ?? '';
    expect(hover).toContain('var(--shell-band-fill)');
    expect(hover).not.toContain('transparent');
  });

  it('lays every inverted corner 14px under the tab body, so no edge abuts it', () => {
    for (const selector of ['.band-page-joint::before,\n.band-page-joint::after', '  .band-tab-closed:hover::before,\n  .band-tab-closed:hover::after']) {
      expect(rule(selector)).toMatch(/width:\s*28px/);
    }
    for (const side of ['.band-page-joint::before', '  .band-tab-closed:hover::before']) {
      expect(rule(side)).toMatch(/left:\s*-14px/);
      expect(rule(side)).toContain('circle 14px at 0 0');
    }
    for (const side of ['.band-page-joint::after', '  .band-tab-closed:hover::after']) {
      expect(rule(side)).toMatch(/right:\s*-14px/);
      expect(rule(side)).toContain('circle 14px at 100% 0');
    }
  });

  it('sets the open tab 1px down onto the sheet, so the band never shows under its foot', () => {
    expect(rule('.band-page-joint')).toMatch(/bottom:\s*-1px/);
  });

  it('keeps the page tabs 28px apart, so two 14px feet never touch', () => {
    expect(band).toMatch(/data-band-pages=""\s*\n\s*className="flex shrink-0 items-end gap-7"/);
  });
});
