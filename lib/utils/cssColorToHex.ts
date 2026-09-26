/**
 * A theme colour as the browser serves it, as `#rrggbb` — for the chart libraries that cannot take
 * a CSS colour as is (Nivo's react-spring interpolates neither `oklch()` nor `lab()`).
 *
 * Why several input forms: a theme block is written in `oklch()`, but the CSS the app actually
 * serves has been down-levelled by the build (Lightning CSS) to `#rrggbb` for colours inside sRGB
 * and to `lab()` for the rest, and `getComputedStyle` hands back that served form. Out-of-gamut
 * values are clipped per channel, which is what the browser does when painting them.
 *
 * Used by: lib/hooks/useCssColorTokens.ts
 */

type LinearRgb = [number, number, number];

function oklchToLinearSrgb(l: number, c: number, h: number): LinearRgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** CSS `lab()` is CIELAB against D50 (CSS Color 4): Lab → XYZ(D50) → Bradford → XYZ(D65) → linear sRGB. */
function labToLinearSrgb(L: number, a: number, b: number): LinearRgb {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inverse = (t: number) => (t ** 3 > epsilon ? t ** 3 : (116 * t - 16) / kappa);
  const x50 = inverse(fx) * 0.3457 / 0.3585;
  const y50 = L > kappa * epsilon ? fy ** 3 : L / kappa;
  const z50 = inverse(fz) * (1 - 0.3457 - 0.3585) / 0.3585;
  const x = 0.955473421488075 * x50 - 0.02309845494876471 * y50 + 0.06325924320057072 * z50;
  const y = -0.0283697093338637 * x50 + 1.0099953980813041 * y50 + 0.021041441191917323 * z50;
  const z = 0.012314014864481998 * x50 - 0.020507649298898964 * y50 + 1.330365926242124 * z50;
  return [
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  ];
}

function linearSrgbToHex(rgb: LinearRgb): string {
  return `#${rgb
    .map((linear) => {
      const clipped = Math.min(1, Math.max(0, linear));
      const encoded = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255).toString(16).padStart(2, '0');
    })
    .join('')}`;
}

/**
 * A colour as `getComputedStyle` can hand it back — `oklch()`, `#rgb`/`#rrggbb`, `lab()`, `rgb()` —
 * as `#rrggbb`; `null` for anything else (an empty token, a keyword, `color-mix()`).
 */
export function colorToHex(color: string): string | null {
  const value = color.trim();

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map((d) => d + d).join('') : hex[1];
    return `#${digits.toLowerCase()}`;
  }

  const oklch = value.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (oklch) {
    const l = parseFloat(oklch[1]) / (oklch[2] === '%' ? 100 : 1);
    return linearSrgbToHex(oklchToLinearSrgb(l, parseFloat(oklch[3]), parseFloat(oklch[4])));
  }

  const lab = value.match(/^lab\(\s*([\d.]+)%?\s+(-?[\d.]+)\s+(-?[\d.]+)/i);
  if (lab) return linearSrgbToHex(labToLinearSrgb(parseFloat(lab[1]), parseFloat(lab[2]), parseFloat(lab[3])));

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((channel) => Math.round(Math.min(255, Math.max(0, parseFloat(channel)))).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  return null;
}
