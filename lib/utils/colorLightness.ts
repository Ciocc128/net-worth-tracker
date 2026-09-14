/**
 * Clamps a theme colour's lightness into a band that stays legible as text on the page, keeping
 * its hue and chroma — the COMPRA / VENDI / OK colours read from CSS variables at runtime.
 *
 * Why three input forms: a theme block is written in `oklch()`, but the CSS the app actually
 * serves has been down-levelled by the build (Lightning CSS) to `#rrggbb` for colours inside
 * sRGB and to `lab()` for the rest, and `getComputedStyle` hands back that served form. A clamp
 * that only parsed `oklch()` — which the hook shipped with — silently never clamped anything.
 *
 * - `oklch(L C H)` and `#rgb` / `#rrggbb` are clamped in OKLCH (hex is converted first) and
 *   returned as `oklch()`.
 * - `lab(L% a b)` is clamped on CIELAB L*, whose scale differs from OKLCH's, so it has its own
 *   thresholds; it is returned as `lab()`.
 * - Anything else is returned unchanged.
 */

const OKLCH_LIGHT_MAX = 0.72;
const OKLCH_LIGHT_TARGET = 0.62;
const OKLCH_DARK_MIN = 0.48;
const OKLCH_DARK_TARGET = 0.6;

// CIELAB L* roughly equivalent to the OKLCH bounds above (L* 68 ≈ OKLCH 0.72, L* 42 ≈ 0.48).
const LAB_LIGHT_MAX = 68;
const LAB_LIGHT_TARGET = 56;
const LAB_DARK_MIN = 42;
const LAB_DARK_TARGET = 54;

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

function clampOklch(l: number, c: number, h: number, isDark: boolean): string {
  let lightness = l;
  if (!isDark && lightness > OKLCH_LIGHT_MAX) lightness = OKLCH_LIGHT_TARGET;
  else if (isDark && lightness < OKLCH_DARK_MIN) lightness = OKLCH_DARK_TARGET;
  return `oklch(${round(lightness, 4)} ${round(c, 4)} ${round(h, 2)})`;
}

/** `#rgb` / `#rrggbb` → OKLCH (Björn Ottosson's sRGB → OKLab matrices). */
export function hexToOklch(hex: string): [number, number, number] | null {
  const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].split('').map((d) => d + d).join('') : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(digits.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), hue < 0 ? hue + 360 : hue];
}

export function clampColorLightness(color: string, isDark: boolean): string {
  const value = color.trim();

  const oklch = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (oklch) {
    const l = parseFloat(oklch[1]) / (oklch[2] === '%' ? 100 : 1);
    return clampOklch(l, parseFloat(oklch[3]), parseFloat(oklch[4]), isDark);
  }

  const fromHex = hexToOklch(value);
  if (fromHex) return clampOklch(fromHex[0], fromHex[1], fromHex[2], isDark);

  const lab = value.match(/^lab\(\s*([\d.]+)%?\s+(-?[\d.]+)\s+(-?[\d.]+)/i);
  if (lab) {
    let l = parseFloat(lab[1]);
    if (!isDark && l > LAB_LIGHT_MAX) l = LAB_LIGHT_TARGET;
    else if (isDark && l < LAB_DARK_MIN) l = LAB_DARK_TARGET;
    return `lab(${round(l, 2)}% ${lab[2]} ${lab[3]})`;
  }

  return value;
}
