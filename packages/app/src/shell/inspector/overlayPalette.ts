/**
 * The colors an overlay's values are given when they are generated, as "Add each value it has" and a
 * new value or stop do (ADR 0080, section 6). Each one stays at least 3:1 against the canvas of each
 * theme, so that a shape or line colored by it shows on both; and every two of them stay apart in hue
 * and lightness, by a color difference of at least `LEAST_DIFFERENCE` (CIE76), so that they read as
 * different values. Colors chosen by hand keep the legend's warnings.
 *
 * Two colors 3:1 apart in contrast cannot both be 3:1 against both canvases: that asks each for a
 * relative luminance between 0.13 and 0.30, and two such luminances are at most 1.96:1 apart. So the
 * palette is told apart by hue as well as lightness, and the legend's labels, never color alone,
 * carry the meaning (ADR 0055).
 */
import type { Color } from '@visual-anything/schema';

/** The overlay palette, in the order values take it. */
export const OVERLAY_PALETTE: readonly Color[] = [
  '#2563EB',
  '#D97706',
  '#059669',
  '#DC2626',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
  '#65A30D',
];

/** The least color difference, CIE76 in CIELAB, between two colors of the palette. */
export const LEAST_DIFFERENCE = 20;

/** The palette's color for the value at `at`, from the start again past its end. */
export function paletteColor(at: number): Color {
  return OVERLAY_PALETTE[
    ((at % OVERLAY_PALETTE.length) + OVERLAY_PALETTE.length) % OVERLAY_PALETTE.length
  ] as Color;
}

/** A color in CIELAB, under the D65 white point. */
export function labOf(color: Color): [number, number, number] {
  const value = Number.parseInt(color.slice(1, 7), 16);
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = linear((value >> 16) & 255);
  const g = linear((value >> 8) & 255);
  const b = linear(value & 255);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** How far apart two colors are, CIE76: their distance in CIELAB. */
export function colorDifference(a: Color, b: Color): number {
  const [l1, a1, b1] = labOf(a);
  const [l2, a2, b2] = labOf(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
