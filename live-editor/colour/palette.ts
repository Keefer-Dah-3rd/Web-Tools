/**
 * Palette maths for the Colour Lab: colours in OKLCH (perceptual lightness, chroma, hue), whole
 * scales re-derived from one seed colour, and WCAG contrast. No DOM; tested in test/palette.test.ts.
 *
 * A scale is a list of hex steps, lightest first (Mibbit's 50 → 999). A new scale keeps the
 * reference scale's shape (how lightness and chroma fall from step to step, and how the hue drifts)
 * and moves it to the seed: the seed lands exactly on the anchor step, its neighbours shift with it,
 * and the far ends barely move, so light tints stay light and the darkest steps stay dark.
 */

export interface Lch {
  /** Perceptual lightness, 0 (black) to 1 (white). */
  L: number;
  /** Chroma (colourfulness), 0 = grey; sRGB tops out around 0.32. */
  C: number;
  /** Hue angle in degrees, 0–360. */
  H: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (h: number) => ((h % 360) + 360) % 360;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** "#AA0017" or "#a01" → [r, g, b] in 0–1. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(clamp(c, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function hexToLch(hex: string): Lch {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: wrap((Math.atan2(B, A) * 180) / Math.PI) };
}

/** OKLCH → linear sRGB, unclipped (a channel outside 0–1 means the colour is out of gamut). */
function lchToLinear({ L, C, H }: Lch): [number, number, number] {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707695601 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** The nearest sRGB colour: same lightness and hue, chroma reduced until it fits. */
export function lchToHex(lch: Lch): string {
  const target = { L: clamp(lch.L, 0, 1), C: Math.max(0, lch.C), H: wrap(lch.H) };
  let rgb = lchToLinear(target);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = target.C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(lchToLinear({ ...target, C: mid }))) lo = mid;
      else hi = mid;
    }
    rgb = lchToLinear({ ...target, C: lo });
  }
  return rgbToHex(rgb.map((c) => toGamma(clamp(c, 0, 1))) as [number, number, number]);
}

/** Shortest signed hue difference b − a, in −180…180. */
export const hueDelta = (a: number, b: number) => ((b - a + 540) % 360) - 180;

/** How far each step follows the seed: 1 at the anchor, easing to ~0 at the scale's ends. */
function follow(i: number, anchor: number, n: number): number {
  const reach = Math.max(anchor, n - 1 - anchor) || 1;
  const t = Math.abs(i - anchor) / reach;
  return Math.cos((t * Math.PI) / 2) ** 2;
}

/** Keep lightness strictly falling from the lightest step to the darkest. */
function monotonic(scale: Lch[]): Lch[] {
  const out = scale.map((s) => ({ ...s }));
  for (let i = 1; i < out.length; i++) out[i].L = Math.min(out[i].L, out[i - 1].L - 0.004);
  return out;
}

/**
 * A new scale shaped like `reference`, moved so `seed` sits exactly on step `anchor`.
 * Hue moves the whole scale; lightness and chroma move most near the anchor.
 */
export function scaleFromSeed(reference: string[], seed: string, anchor: number): string[] {
  const ref = reference.map(hexToLch);
  const a = ref[anchor];
  const s = hexToLch(seed);
  const dL = s.L - a.L;
  const cRatio = a.C > 0.002 ? s.C / a.C : 1;
  const dH = hueDelta(a.H, s.H);
  const next = monotonic(
    ref.map((r, i) => {
      const w = follow(i, anchor, ref.length);
      return { L: clamp(r.L + dL * w, 0.005, 0.995), C: r.C * (1 + (cRatio - 1) * (0.35 + 0.65 * w)), H: r.H + dH };
    }),
  );
  return next.map((lch, i) => (i === anchor ? seed.toUpperCase() : lchToHex(lch)));
}

/** The same scale turned by `degrees` of hue with its chroma multiplied by `chroma`. */
export function turnScale(reference: string[], degrees: number, chroma = 1): string[] {
  return reference.map((hex) => {
    const r = hexToLch(hex);
    return lchToHex({ L: r.L, C: r.C * chroma, H: r.H + degrees });
  });
}

/** A scale turned so its anchor step has hue `hue`, its chroma multiplied by `chroma`. */
export function scaleAtHue(reference: string[], anchor: number, hue: number, chroma = 1): string[] {
  return turnScale(reference, hueDelta(hexToLch(reference[anchor]).H, hue), chroma);
}

/** Hue offsets from the brand for the two supporting scales (complement, analogous). */
export const HARMONIES = {
  complementary: { label: "Complement", second: 180, third: 30, chroma: [1, 1] },
  split: { label: "Split", second: 150, third: 210, chroma: [1, 1] },
  analogous: { label: "Analogous", second: -30, third: 30, chroma: [1, 1] },
  triad: { label: "Triad", second: 120, third: 240, chroma: [1, 1] },
  mono: { label: "Mono", second: 0, third: 0, chroma: [0.5, 0.25] },
} as const;
export type Harmony = keyof typeof HARMONIES;

/** WCAG 2.1 relative luminance of a hex colour. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
