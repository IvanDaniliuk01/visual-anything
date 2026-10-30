/**
 * The colors an overlay's values are given when they are generated, as "Add each value it has" and a
 * new value or stop do (ADR 0080, section 6). Each one stays at least 3:1 against the canvas of each
 * theme, so that a shape or line colored by it shows on both; and every two of them stay apart in hue
 * and lightness, by a color difference of at least the core's `MINIMUM_COLOR_DIFFERENCE` (CIE76), the one the legend warns by, so that they read as
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

/** The palette's color for the value at `at`, from the start again past its end. */
export function paletteColor(at: number): Color {
  return OVERLAY_PALETTE[
    ((at % OVERLAY_PALETTE.length) + OVERLAY_PALETTE.length) % OVERLAY_PALETTE.length
  ] as Color;
}
