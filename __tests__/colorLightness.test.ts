/**
 * The COMPRA / VENDI / OK clamp must work on the colour form the browser actually hands back.
 * The served CSS is down-levelled to `#hex` / `lab()`, and the hook's first clamp parsed only
 * `oklch()`, so it never clamped anything: seen red by feeding it the served forms of
 * cyberpunk's near-white chart-5.
 */

import { describe, it, expect } from 'vitest';
import { clampColorLightness, hexToOklch } from '@/lib/utils/colorLightness';

const lightnessOf = (oklch: string): number => parseFloat(oklch.match(/oklch\(([\d.]+)/)![1]);

describe('hexToOklch', () => {
  it('converts white, black and a mid colour', () => {
    expect(hexToOklch('#ffffff')![0]).toBeCloseTo(1, 3);
    expect(hexToOklch('#000')![0]).toBeCloseTo(0, 3);
    const [l, c, h] = hexToOklch('#457b9d')!;
    expect(l).toBeCloseTo(0.5598, 3);
    expect(c).toBeCloseTo(0.0781, 3);
    expect(h).toBeCloseTo(237.98, 1);
  });

  it('rejects what is not a hex colour', () => {
    expect(hexToOklch('oklch(0.5 0.1 120)')).toBeNull();
    expect(hexToOklch('#12345')).toBeNull();
  });
});

describe('clampColorLightness', () => {
  it('darkens a too-light oklch colour on a light page and keeps hue and chroma', () => {
    expect(clampColorLightness('oklch(0.92 0.1 200)', false)).toBe('oklch(0.62 0.1 200)');
  });

  it('lightens a too-dark oklch colour on a dark page', () => {
    expect(clampColorLightness('oklch(0.3 0.1 200)', true)).toBe('oklch(0.6 0.1 200)');
  });

  it('leaves a legible colour alone (only its serialisation is normalised)', () => {
    expect(lightnessOf(clampColorLightness('oklch(0.5 0.15 138)', false))).toBe(0.5);
  });

  it('clamps the served #hex form (the case the old oklch-only clamp missed)', () => {
    const clamped = clampColorLightness('#f6f7c3', false); // a near-white, as a theme can serve it
    expect(clamped.startsWith('oklch(')).toBe(true);
    expect(lightnessOf(clamped)).toBe(0.62);
  });

  it('clamps the served lab() form on its own L* scale', () => {
    expect(clampColorLightness('lab(92.5% -4 30)', false)).toBe('lab(56% -4 30)');
    expect(clampColorLightness('lab(30% 10 -20)', true)).toBe('lab(54% 10 -20)');
    expect(clampColorLightness('lab(50% 10 -20)', false)).toBe('lab(50% 10 -20)');
  });

  it('returns an unknown form unchanged', () => {
    expect(clampColorLightness('rgb(10, 20, 30)', false)).toBe('rgb(10, 20, 30)');
  });
});
